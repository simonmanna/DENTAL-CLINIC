// src/accounts/cash-flow.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashFlowDirection, CashFlowSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { M } from '../common/money/money';
import { generateCode } from '../utils/code-generator';
import {
  CashFlowQueryDto,
  CreateTransferDto,
  RecordCashInDto,
  RecordCashOutDto,
} from './dto/cashflow.dto';

/** One money movement, however it was recorded. */
export interface CashMovement {
  id: string;
  code: string;
  direction: CashFlowDirection;
  source: CashFlowSource;
  amount: number;
  currency: string;
  /** Same movement converted to the base currency (UGX) — the only figure
   *  safe to add up across currencies. */
  baseAmount: number;
  date: string;
  accountId: string | null;
  accountName: string | null;
  accountType: string | null;
  description: string;
  reference: string | null;
  method: string | null;
  party: string | null;
  notes: string | null;
  /** Where the row came from, so the UI can deep-link. */
  originType: 'RECEIPT' | 'PAYMENT' | 'TRANSFER' | 'ENTRY';
  originId: string;
}

/** Hard cap per source so one huge range can never exhaust memory. */
const SOURCE_FETCH_CAP = 5000;

@Injectable()
export class CashFlowService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * Every cash movement in the clinic, merged from the documents that moved the
   * money: receipts (IN), payments (OUT, plus IN payments with no receipt),
   * internal transfers and manual deposits / withdrawals / adjustments.
   *
   * Derived rather than materialised: existing history shows up with no
   * backfill, and a receipt plus its payment can never double-count.
   */
  async movements(query: CashFlowQueryDto) {
    const all = await this.collect(query);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const start = (page - 1) * limit;

    return {
      data: all.slice(start, start + limit),
      totals: this.totals(all),
      meta: {
        total: all.length,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(all.length / limit)),
      },
    };
  }

  /** Account balances plus in/out/net totals for the filtered window. */
  async summary(query: CashFlowQueryDto) {
    const [accounts, lifetime, windowed] = await Promise.all([
      this.prisma.account.findMany({
        where: { isActive: true },
        orderBy: [{ orderNumber: 'asc' }, { createdAt: 'desc' }],
      }),
      // Balances are life-to-date, so they ignore the date window; the
      // in/out figures below use the caller's filters.
      this.collect({ accountId: query.accountId }),
      this.collect(query),
    ]);

    const balances = accounts.map((acc) => {
      const mine = lifetime.filter((m) => m.accountId === acc.id);
      const totalIn = this.sum(mine, CashFlowDirection.IN);
      const totalOut = this.sum(mine, CashFlowDirection.OUT);
      return {
        accountId: acc.id,
        accountCode: acc.accountCode,
        name: acc.name,
        type: acc.type,
        currency: acc.currency,
        openingBalance: Number(acc.openingBalance),
        totalIn,
        totalOut,
        balance: round(Number(acc.openingBalance) + totalIn - totalOut),
        movements: mine.length,
      };
    });

    const bySource = Object.values(CashFlowSource)
      .map((source) => {
        const rows = windowed.filter((m) => m.source === source);
        return {
          source,
          totalIn: this.sum(rows, CashFlowDirection.IN),
          totalOut: this.sum(rows, CashFlowDirection.OUT),
          count: rows.length,
        };
      })
      .filter((r) => r.count > 0);

    const byCurrency = Object.entries(
      windowed.reduce<Record<string, { totalIn: number; totalOut: number }>>(
        (acc, m) => {
          const bucket = (acc[m.currency] ??= { totalIn: 0, totalOut: 0 });
          if (m.direction === CashFlowDirection.IN) bucket.totalIn += m.amount;
          else bucket.totalOut += m.amount;
          return acc;
        },
        {},
      ),
    ).map(([currency, v]) => ({
      currency,
      totalIn: round(v.totalIn),
      totalOut: round(v.totalOut),
      net: round(v.totalIn - v.totalOut),
    }));

    return { totals: this.totals(windowed), balances, bySource, byCurrency };
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  /** Money put into an account by hand (cash banked, float top-up, capital). */
  recordDeposit(dto: RecordCashInDto) {
    return this.writeEntry({
      accountId: dto.accountId,
      amount: dto.amount,
      direction: CashFlowDirection.IN,
      source: CashFlowSource.DEPOSIT,
      description: dto.description,
      reference: dto.reference,
      notes: dto.notes,
      recordedById: dto.recordedById,
      exchangeRate: dto.exchangeRate,
    });
  }

  /** Money taken out of an account by hand (cash withdrawal, owner draw). */
  recordWithdrawal(dto: RecordCashOutDto) {
    return this.writeEntry({
      accountId: dto.accountId,
      amount: dto.amount,
      direction: CashFlowDirection.OUT,
      source: CashFlowSource.WITHDRAWAL,
      description: dto.description,
      reference: dto.reference,
      notes: dto.notes,
      recordedById: dto.recordedById,
      exchangeRate: dto.exchangeRate,
    });
  }

  /** Internal transfer: one OUT entry and one IN entry, both linked to it. */
  async transfer(dto: CreateTransferDto) {
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Pick two different accounts');
    }
    if (!(dto.amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const [from, to] = await Promise.all([
      this.account(dto.fromAccountId),
      this.account(dto.toAccountId),
    ]);

    const rate = dto.exchangeRate ?? 1;
    if (!(rate > 0)) throw new BadRequestException('Exchange rate must be > 0');
    if (from.currency !== to.currency && !dto.exchangeRate) {
      throw new BadRequestException(
        `Transfer from ${from.currency} to ${to.currency} needs an exchange rate`,
      );
    }

    const amount = M.money(dto.amount);
    const toAmount = M.money(M.mul(amount, rate));
    const description = `Transfer ${from.name} -> ${to.name}`;

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.accountTransfer.create({
        data: {
          transferCode: generateCode('TRF'),
          fromAccountId: from.id,
          toAccountId: to.id,
          amount: amount.toString(),
          fromCurrency: from.currency,
          toCurrency: to.currency,
          exchangeRate: rate.toString(),
          toAmount: toAmount.toString(),
          notes: dto.notes ?? null,
          reference: dto.reference ?? null,
          recordedById: dto.recordedById ?? null,
        },
      });

      await this.entry(tx, {
        accountId: from.id,
        currency: from.currency,
        direction: CashFlowDirection.OUT,
        source: CashFlowSource.TRANSFER_OUT,
        amount,
        exchangeRate: rate,
        description,
        reference: dto.reference ?? transfer.transferCode,
        notes: dto.notes,
        recordedById: dto.recordedById,
        transferId: transfer.id,
      });

      await this.entry(tx, {
        accountId: to.id,
        currency: to.currency,
        direction: CashFlowDirection.IN,
        source: CashFlowSource.TRANSFER_IN,
        amount: toAmount,
        exchangeRate: rate,
        description,
        reference: dto.reference ?? transfer.transferCode,
        notes: dto.notes,
        recordedById: dto.recordedById,
        transferId: transfer.id,
      });

      return transfer;
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async account(id: string) {
    const acc = await this.prisma.account.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException(`Account ${id} not found`);
    if (!acc.isActive) {
      throw new BadRequestException(`Account ${acc.name} is inactive`);
    }
    return acc;
  }

  private async writeEntry(input: {
    accountId: string;
    amount: number;
    direction: CashFlowDirection;
    source: CashFlowSource;
    description: string;
    reference?: string;
    notes?: string;
    recordedById?: string;
    exchangeRate?: number;
  }) {
    if (!(input.amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const acc = await this.account(input.accountId);
    const balanceBefore = await this.balanceOf(acc.id);

    return this.prisma.$transaction((tx) =>
      this.entry(tx, {
        accountId: acc.id,
        currency: acc.currency,
        direction: input.direction,
        source: input.source,
        amount: M.money(input.amount),
        exchangeRate: input.exchangeRate ?? 1,
        description: input.description,
        reference: input.reference,
        notes: input.notes,
        recordedById: input.recordedById,
        balanceBefore,
      }),
    );
  }

  /** Insert one cash_flow_entries row with a balance snapshot. */
  private async entry(
    tx: Prisma.TransactionClient,
    input: {
      accountId: string;
      currency: string;
      direction: CashFlowDirection;
      source: CashFlowSource;
      amount: Prisma.Decimal;
      exchangeRate: number;
      description: string;
      reference?: string | null;
      notes?: string | null;
      recordedById?: string | null;
      transferId?: string;
      balanceBefore?: number;
    },
  ) {
    const balanceBefore =
      input.balanceBefore ?? (await this.balanceOf(input.accountId));
    const delta =
      input.direction === CashFlowDirection.IN
        ? M.of(input.amount)
        : M.mul(input.amount, -1);
    const balanceAfter = M.money(M.add(balanceBefore, delta));

    const entry = await tx.cashFlowEntry.create({
      data: {
        entryCode: generateCode('CF'),
        accountId: input.accountId,
        direction: input.direction,
        source: input.source,
        amount: input.amount.toString(),
        currency: input.currency,
        exchangeRate: input.exchangeRate.toString(),
        baseAmount: M.money(M.mul(input.amount, input.exchangeRate)).toString(),
        balanceBefore: M.money(balanceBefore).toString(),
        balanceAfter: balanceAfter.toString(),
        description: input.description,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        recordedById: input.recordedById ?? null,
        ...(input.transferId && { transferId: input.transferId }),
      },
    });

    // Keep the denormalised figure on the account in step with the movements.
    await tx.account.update({
      where: { id: input.accountId },
      data: { currentBalance: balanceAfter.toString() },
    });

    return entry;
  }

  /** Life-to-date balance of one account: opening balance plus movements. */
  private async balanceOf(accountId: string): Promise<number> {
    const [acc, movements] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: accountId },
        select: { openingBalance: true },
      }),
      this.collect({ accountId }),
    ]);
    return round(
      Number(acc?.openingBalance ?? 0) +
        this.sum(movements, CashFlowDirection.IN) -
        this.sum(movements, CashFlowDirection.OUT),
    );
  }

  /** Totals are always in base currency: a UGX and a USD movement cannot be
   *  added in their native amounts. */
  private sum(rows: CashMovement[], direction: CashFlowDirection) {
    return round(
      rows
        .filter((r) => r.direction === direction)
        .reduce((t, r) => t + r.baseAmount, 0),
    );
  }

  private totals(rows: CashMovement[]) {
    const totalIn = this.sum(rows, CashFlowDirection.IN);
    const totalOut = this.sum(rows, CashFlowDirection.OUT);
    return {
      totalIn,
      totalOut,
      net: round(totalIn - totalOut),
      count: rows.length,
      inCount: rows.filter((r) => r.direction === CashFlowDirection.IN).length,
      outCount: rows.filter((r) => r.direction === CashFlowDirection.OUT).length,
    };
  }

  /** Pull every movement that matches the filters and sort newest first. */
  private async collect(query: CashFlowQueryDto): Promise<CashMovement[]> {
    const from = query.startDate ? startOfDay(query.startDate) : null;
    const to = query.endDate ? endOfDay(query.endDate) : null;
    const dateFilter =
      from || to
        ? { ...(from && { gte: from }), ...(to && { lte: to }) }
        : undefined;

    const [receipts, payments, transfers, entries] = await Promise.all([
      this.receiptMovements(query, dateFilter),
      this.paymentMovements(query, dateFilter),
      this.transferMovements(query, dateFilter),
      this.entryMovements(query, dateFilter),
    ]);

    let rows = [...receipts, ...payments, ...transfers, ...entries];

    if (query.direction) {
      rows = rows.filter((r) => r.direction === query.direction);
    }
    if (query.source) {
      rows = rows.filter((r) => r.source === query.source);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.code, r.description, r.reference, r.party, r.accountName, r.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  private async receiptMovements(
    query: CashFlowQueryDto,
    date?: Prisma.DateTimeFilter,
  ): Promise<CashMovement[]> {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        status: 'ACTIVE',
        ...(query.accountId && { accountId: query.accountId }),
        ...(date && { generatedAt: date }),
      },
      orderBy: { generatedAt: 'desc' },
      take: SOURCE_FETCH_CAP,
      include: {
        account: { select: { id: true, name: true, type: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return receipts.map((r) => {
      const patient = r.invoice?.patient
        ? `${r.invoice.patient.firstName} ${r.invoice.patient.lastName}`.trim()
        : null;
      return {
        id: `receipt:${r.id}`,
        code: r.receiptNumber,
        direction: CashFlowDirection.IN,
        source: CashFlowSource.RECEIPT,
        amount: Number(r.amountReceived),
        currency: r.currency ?? r.currencyCode,
        baseAmount: Number(r.baseAmountReceived ?? r.amountReceived),
        date: r.generatedAt.toISOString(),
        accountId: r.accountId,
        accountName: r.account?.name ?? null,
        accountType: r.account?.type ?? null,
        description: patient ? `Patient payment — ${patient}` : 'Patient payment',
        reference: r.invoice?.invoiceNumber ?? null,
        method: r.paymentMethod ?? null,
        party: patient,
        notes: r.notes ?? null,
        originType: 'RECEIPT' as const,
        originId: r.id,
      };
    });
  }

  private async paymentMovements(
    query: CashFlowQueryDto,
    date?: Prisma.DateTimeFilter,
  ): Promise<CashMovement[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        voidedAt: null,
        // Patient receipts are already counted from the receipt itself.
        OR: [
          { direction: CashFlowDirection.OUT },
          { direction: CashFlowDirection.IN, receipts: { none: {} } },
        ],
        ...(query.accountId && { accountId: query.accountId }),
        ...(date && { paidAt: date }),
      },
      orderBy: { paidAt: 'desc' },
      take: SOURCE_FETCH_CAP,
      include: {
        account: { select: { id: true, name: true, type: true } },
        expense: { select: { title: true, expenseCode: true } },
        purchaseOrder: {
          select: { poNumber: true, supplier: { select: { name: true } } },
        },
        invoice: {
          select: {
            invoiceNumber: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return payments.map((p) => {
      const party =
        p.purchaseOrder?.supplier?.name ??
        (p.invoice?.patient
          ? `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}`.trim()
          : null);

      const description =
        p.type === 'EXPENSE'
          ? `Expense — ${p.expense?.title ?? p.expense?.expenseCode ?? 'unspecified'}`
          : p.type === 'PURCHASE_ORDER'
            ? `Supplier payment — ${party ?? p.purchaseOrder?.poNumber ?? 'purchase'}`
            : p.type === 'INVOICE_RECEIPT'
              ? `Patient payment — ${party ?? 'patient'}`
              : `Payment — ${p.type.toLowerCase().replace(/_/g, ' ')}`;

      return {
        id: `payment:${p.id}`,
        code: p.paymentCode,
        direction: p.direction,
        source:
          p.type === 'EXPENSE'
            ? CashFlowSource.EXPENSE_PAYMENT
            : p.type === 'PURCHASE_ORDER'
              ? CashFlowSource.PURCHASE_PAYMENT
              : p.direction === CashFlowDirection.IN
                ? CashFlowSource.RECEIPT
                : CashFlowSource.ADJUSTMENT,
        amount: Number(p.amount),
        currency: p.currency,
        baseAmount: Number(p.baseAmount) || Number(p.amount),
        date: p.paidAt.toISOString(),
        accountId: p.accountId,
        accountName: p.account?.name ?? null,
        accountType: p.account?.type ?? null,
        description,
        reference:
          p.reference ??
          p.purchaseOrder?.poNumber ??
          p.expense?.expenseCode ??
          p.invoice?.invoiceNumber ??
          null,
        method: p.method,
        party,
        notes: p.notes ?? null,
        originType: 'PAYMENT' as const,
        originId: p.id,
      };
    });
  }

  private async transferMovements(
    query: CashFlowQueryDto,
    date?: Prisma.DateTimeFilter,
  ): Promise<CashMovement[]> {
    // New transfers write their own cash_flow_entries rows, which the entry
    // reader returns. Only transfers with no entries are derived here, so a
    // transfer recorded before those entries existed still shows up once.
    const transfers = await this.prisma.accountTransfer.findMany({
      where: {
        cashFlowEntries: { none: {} },
        ...(query.accountId && {
          OR: [
            { fromAccountId: query.accountId },
            { toAccountId: query.accountId },
          ],
        }),
        ...(date && { transferDate: date }),
      },
      orderBy: { transferDate: 'desc' },
      take: SOURCE_FETCH_CAP,
      include: {
        fromAccount: { select: { id: true, name: true, type: true } },
        toAccount: { select: { id: true, name: true, type: true } },
      },
    });

    const rows: CashMovement[] = [];
    for (const t of transfers) {
      const shared = {
        code: t.transferCode,
        date: t.transferDate.toISOString(),
        description: `Transfer ${t.fromAccount.name} → ${t.toAccount.name}`,
        reference: t.reference ?? null,
        method: null,
        notes: t.notes ?? null,
        originType: 'TRANSFER' as const,
        originId: t.id,
      };

      if (!query.accountId || query.accountId === t.fromAccountId) {
        rows.push({
          ...shared,
          id: `transfer-out:${t.id}`,
          direction: CashFlowDirection.OUT,
          source: CashFlowSource.TRANSFER_OUT,
          amount: Number(t.amount),
          currency: t.fromCurrency,
          baseAmount: Number(t.amount),
          accountId: t.fromAccountId,
          accountName: t.fromAccount.name,
          accountType: t.fromAccount.type,
          party: t.toAccount.name,
        });
      }
      if (!query.accountId || query.accountId === t.toAccountId) {
        rows.push({
          ...shared,
          id: `transfer-in:${t.id}`,
          direction: CashFlowDirection.IN,
          source: CashFlowSource.TRANSFER_IN,
          amount: Number(t.toAmount),
          currency: t.toCurrency,
          baseAmount: Number(t.toAmount),
          accountId: t.toAccountId,
          accountName: t.toAccount.name,
          accountType: t.toAccount.type,
          party: t.fromAccount.name,
        });
      }
    }
    return rows;
  }

  private async entryMovements(
    query: CashFlowQueryDto,
    date?: Prisma.DateTimeFilter,
  ): Promise<CashMovement[]> {
    const entries = await this.prisma.cashFlowEntry.findMany({
      where: {
        // An entry linked to a receipt or payment duplicates that document,
        // which is read from its own table. Unlinked entries are the only
        // record of their movement (manual deposits/withdrawals, transfers,
        // and older history whose source document is gone), so they stay.
        receiptId: null,
        paymentId: null,
        ...(query.accountId && { accountId: query.accountId }),
        ...(date && { entryDate: date }),
      },
      orderBy: { entryDate: 'desc' },
      take: SOURCE_FETCH_CAP,
      include: { account: { select: { id: true, name: true, type: true } } },
    });

    return entries.map((e) => ({
      id: `entry:${e.id}`,
      code: e.entryCode,
      direction: e.direction,
      source: e.source,
      amount: Number(e.amount),
      currency: e.currency,
      baseAmount: Number(e.baseAmount) || Number(e.amount),
      date: e.entryDate.toISOString(),
      accountId: e.accountId,
      accountName: e.account?.name ?? null,
      accountType: e.account?.type ?? null,
      description: e.description,
      reference: e.reference ?? null,
      method: null,
      party: null,
      notes: e.notes ?? null,
      originType: 'ENTRY' as const,
      originId: e.id,
    }));
  }
}

function round(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function startOfDay(v: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid startDate');
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(v: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('Invalid endDate');
  }
  d.setHours(23, 59, 59, 999);
  return d;
}
