// src/billing/invoice-gl-sync.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// ACC-1: reconcile a POSTED invoice's general-ledger revenue recognition to
// its CURRENT stored totals.
//
// Posts only the DELTA between the invoice's target recognition (gross revenue
// per revenue account / discount / tax, plus the balancing A/R) and what has
// already been posted for it under source INVOICE/<id>. A discount, tax,
// currency or line change on an already-POSTED invoice therefore updates the
// GL instead of letting A/R drift. Idempotent (delta nets to zero → no-op) and
// non-blocking (safePost). Payment / deposit entries on A/R are separate and
// intentionally untouched.
//
// Lives in its own provider because both InvoicesService (discount / tax /
// item edits) and InvoiceLifecycleService (cancelling or reinstating a
// treatment procedure on a POSTED invoice) need exactly this reconciliation.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { InvoiceItemStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GeneralLedgerService,
  GL,
} from '../general-ledger/general-ledger.service';
import { M, type Money } from '../common/money/money';

@Injectable()
export class InvoiceGlSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gl: GeneralLedgerService,
  ) {}

  async syncInvoiceRevenueGl(
    invoiceId: string,
    tx?: Prisma.TransactionClient,
    opts: { memo?: string; postedById?: string | null } = {},
  ): Promise<{ id: string; entryNumber: string } | null> {
    if (!(await this.gl.isAutoPostingEnabled())) return null;
    const db = tx ?? this.prisma;

    const inv = await db.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        invoiceNumber: true,
        patientId: true,
        baseSubtotal: true,
        baseDiscountAmount: true,
        baseTaxAmount: true,
        // ACTIVE lines only — they are what baseSubtotal is built from. Summing
        // VOID lines too put a voided procedure's revenue back into its own
        // account and dumped a negative residual on the default account, so a
        // cancelled procedure's revenue was never taken off the account it
        // was booked to.
        items: {
          where: { status: InvoiceItemStatus.ACTIVE },
          select: {
            total: true,
            originalTotal: true,
            exchangeRate: true,
            procedure: {
              select: {
                revenueAccountId: true,
                category: { select: { revenueAccountId: true } },
              },
            },
            treatmentProcedure: {
              select: {
                procedure: {
                  select: {
                    revenueAccountId: true,
                    category: { select: { revenueAccountId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!inv || inv.status !== InvoiceStatus.POSTED) return null;

    const targetRevenueTotal = M.money(inv.baseSubtotal ?? 0);
    const targetDiscount = M.money(inv.baseDiscountAmount ?? 0);
    const targetTax = M.money(inv.baseTaxAmount ?? 0);

    // Resolve the fallback (default) revenue account id once. If it can't be
    // resolved we can't reconcile per-account safely — bail rather than drift.
    const defaultAcc = await db.ledgerAccount.findUnique({
      where: { systemKey: GL.TREATMENT_REVENUE },
      select: { id: true },
    });
    if (!defaultAcc) return null;
    const defaultAccountId = defaultAcc.id;

    // ── Target gross revenue per account id (base currency) ──────────────────
    // Everything resolves to a concrete accountId (default bucket included) so a
    // procedure mapped to the Treatment Revenue account itself merges correctly.
    const targetByAccountId = new Map<string, Money>();
    let bucketed = M.zero();
    for (const item of inv.items) {
      const base = M.money(
        M.mul(
          M.of(item.originalTotal ?? item.total),
          M.of(item.exchangeRate ?? 1),
        ),
      );
      const proc =
        (item as any).treatmentProcedure?.procedure ??
        (item as any).procedure ??
        null;
      const accId =
        proc?.revenueAccountId ??
        proc?.category?.revenueAccountId ??
        defaultAccountId;
      targetByAccountId.set(
        accId,
        M.add(targetByAccountId.get(accId) ?? M.zero(), base),
      );
      bucketed = M.add(bucketed, base);
    }
    // Push any rounding residual into the default bucket so Σ(targets) ties to
    // the invoice's stored baseSubtotal exactly (A/R must reconcile precisely).
    const residual = M.sub(targetRevenueTotal, bucketed);
    if (!M.isZero(residual)) {
      targetByAccountId.set(
        defaultAccountId,
        M.add(targetByAccountId.get(defaultAccountId) ?? M.zero(), residual),
      );
    }

    // ── Net revenue already posted for this invoice, per account ─────────────
    // Scan INCOME accounts (excluding the contra Sales Discount, handled below)
    // so remapped procedures' old accounts get wound back to zero too.
    const discountAcc = await db.ledgerAccount.findUnique({
      where: { systemKey: GL.SALES_DISCOUNT },
      select: { id: true },
    });
    const postedRevenue = await db.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          sourceType: 'INVOICE',
          sourceId: invoiceId,
          status: 'POSTED',
        },
        account: {
          type: 'INCOME',
          ...(discountAcc ? { id: { not: discountAcc.id } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const netByAccountId = new Map<string, Money>();
    for (const row of postedRevenue) {
      netByAccountId.set(
        row.accountId,
        M.sub(M.money(row._sum.credit ?? 0), M.money(row._sum.debit ?? 0)),
      );
    }

    // ── Revenue deltas across union(target, already-posted) ──────────────────
    const allRevenueAccountIds = new Set<string>([
      ...targetByAccountId.keys(),
      ...netByAccountId.keys(),
    ]);
    let totalRevDelta = M.zero();
    const revenueLegs: any[] = [];
    for (const accId of allRevenueAccountIds) {
      const target = targetByAccountId.get(accId) ?? M.zero();
      const net = netByAccountId.get(accId) ?? M.zero();
      const delta = M.sub(target, net);
      totalRevDelta = M.add(totalRevDelta, delta);
      const line = this.signedGlLeg({ accountId: accId }, delta, false);
      if (line) revenueLegs.push(line);
    }

    const discDelta = M.sub(
      targetDiscount,
      await this.netPostedForInvoice(
        invoiceId,
        { systemKey: GL.SALES_DISCOUNT },
        'debit',
        tx,
      ),
    );
    const taxDelta = M.sub(
      targetTax,
      await this.netPostedForInvoice(
        invoiceId,
        { systemKey: GL.TAX_PAYABLE },
        'credit',
        tx,
      ),
    );
    // A/R moves by exactly revenue − discount + tax, so the entry balances by
    // construction.
    const arDelta = M.add(M.sub(totalRevDelta, discDelta), taxDelta);

    const lines = [
      this.signedGlLeg(
        { key: GL.ACCOUNTS_RECEIVABLE },
        arDelta,
        true,
        inv.patientId,
      ),
      ...revenueLegs,
      this.signedGlLeg({ key: GL.SALES_DISCOUNT }, discDelta, true),
      this.signedGlLeg({ key: GL.TAX_PAYABLE }, taxDelta, false),
    ].filter((l): l is NonNullable<typeof l> => l !== null);

    if (lines.length === 0) return null;

    // tx-aware: when the caller provides a transaction client, the GL delta
    // commits atomically with the invoice update — no failure window between
    // the invoice writing new totals and the GL recognising them.
    return this.gl.safePost(
      {
        memo:
          opts.memo ??
          `Invoice ${inv.invoiceNumber} revenue/discount/tax adjustment`,
        sourceType: 'INVOICE',
        sourceId: invoiceId,
        patientId: inv.patientId,
        postedById: opts.postedById ?? null,
        skipIfZero: true,
        lines,
      },
      tx,
    );
  }

  /**
   * Net amount already posted for an invoice on one account (by systemKey or id),
   * returned on the requested normal side.
   */
  private async netPostedForInvoice(
    invoiceId: string,
    ref: { systemKey?: string; accountId?: string },
    side: 'credit' | 'debit',
    tx?: Prisma.TransactionClient,
  ): Promise<Money> {
    const db = tx ?? this.prisma;
    let accountId = ref.accountId;
    if (!accountId && ref.systemKey) {
      const acc = await db.ledgerAccount.findUnique({
        where: { systemKey: ref.systemKey },
        select: { id: true },
      });
      if (!acc) return M.zero();
      accountId = acc.id;
    }
    if (!accountId) return M.zero();
    const agg = await db.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: {
          sourceType: 'INVOICE',
          sourceId: invoiceId,
          status: 'POSTED',
        },
      },
      _sum: { debit: true, credit: true },
    });
    const debit = M.money(agg._sum.debit ?? 0);
    const credit = M.money(agg._sum.credit ?? 0);
    return side === 'credit' ? M.sub(credit, debit) : M.sub(debit, credit);
  }

  /**
   * Place a signed amount on an account's normal side, flipping to the opposite
   * side when negative — so every emitted line carries a single non-negative
   * amount. Accepts either a systemKey (`key`) or a raw `accountId`. Returns null
   * for a zero amount (no line needed).
   */
  signedGlLeg(
    ref: { key?: string; accountId?: string },
    signed: Money,
    normalDebit: boolean,
    patientId?: string,
  ): Record<string, unknown> | null {
    const amt = M.money(signed);
    if (M.isZero(amt)) return null;
    const negative = M.isNegative(amt);
    const abs = M.money(negative ? M.neg(amt) : amt);
    const onDebit = normalDebit ? !negative : negative;
    const target = ref.key ? { key: ref.key } : { accountId: ref.accountId };
    return onDebit
      ? { ...target, debit: abs, ...(patientId ? { patientId } : {}) }
      : { ...target, credit: abs, ...(patientId ? { patientId } : {}) };
  }
}
