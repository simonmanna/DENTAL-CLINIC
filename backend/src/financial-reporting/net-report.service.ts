// src/financial-reporting/net-report.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Net reports — money in vs money out over a window, on two bases:
//
//   • sales-expenses     (accrual) Sales = invoices raised (not VOID, not
//                        deleted, by createdAt — same axis as the Sales report)
//                        vs Expenses = APPROVED / POSTED expenses (not deleted,
//                        by expenseDate).
//   • receipts-payments  (cash)    Receipts = ACTIVE patient receipts (by
//                        generatedAt) + any completed IN payment with no receipt
//                        row, vs Payments = completed OUT expense / supplier /
//                        other payments (by paidAt). Credit-note applications
//                        move no cash and are left out, as are internal
//                        transfers / deposits (cash_flow_entries).
//
// Everything nets in the base currency (UGX); foreign-currency money is also
// reported in its own currency. One response feeds both the detailed Net
// Report (lines) and the Net Summary (periods + breakdowns).
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { startOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { clinicDateRange, DEFAULT_REPORT_TIMEZONE } from '../reports-common';
import { FinancialReportQueryDto } from './dto/financial-report-query.dto';

export const NET_BASES = ['sales-expenses', 'receipts-payments'] as const;
export type NetBasis = (typeof NET_BASES)[number];
export const NET_GROUP_BY = ['day', 'week', 'month'] as const;
export type NetGroupBy = (typeof NET_GROUP_BY)[number];

const BASE_CURRENCY = 'UGX';
/** Lines returned to the client; totals always cover the whole window. */
const MAX_LINES = 5000;

export interface NetLine {
  id: string;
  date: string;
  direction: 'IN' | 'OUT';
  /** Sale | Expense | Receipt | Payment | Other receipt */
  kind: string;
  reference: string;
  party: string | null;
  description: string | null;
  category: string | null;
  method: string | null;
  currency: string;
  amount: number;
  /** Amount in base currency (UGX) — what the net is computed on. */
  baseAmount: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Base amount, falling back to amount × rate when the stored base is unset. */
function baseOf(base: unknown, amount: unknown, rate: unknown): number {
  const b = toNum(base);
  if (b !== 0) return b;
  return toNum(amount) * (toNum(rate) || 1);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const personName = (p?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || null : null;

const humanize = (s?: string | null) =>
  s
    ? s
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : null;

@Injectable()
export class NetReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getNetReport(
    query: FinancialReportQueryDto & { basis?: string; groupBy?: string },
  ) {
    const basis = (query.basis ?? 'sales-expenses') as NetBasis;
    if (!NET_BASES.includes(basis)) {
      throw new BadRequestException(
        `basis must be one of: ${NET_BASES.join(', ')}`,
      );
    }
    const groupBy = (query.groupBy ?? 'day') as NetGroupBy;
    if (!NET_GROUP_BY.includes(groupBy)) {
      throw new BadRequestException(
        `groupBy must be one of: ${NET_GROUP_BY.join(', ')}`,
      );
    }

    const range = clinicDateRange(query.startDate, query.endDate, {
      startTime: query.startTime,
      endTime: query.endTime,
    });

    const lines =
      basis === 'sales-expenses'
        ? await this.salesExpensesLines(range)
        : await this.receiptsPaymentsLines(range);

    lines.sort((a, b) => a.date.localeCompare(b.date));
    return this.summarise(basis, groupBy, query, lines);
  }

  // ── Sales & Expenses (accrual) ───────────────────────────────────────────
  private async salesExpensesLines(
    range: Prisma.DateTimeFilter | undefined,
  ): Promise<NetLine[]> {
    const [invoices, expenses] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          status: { not: 'VOID' as any },
          deletedAt: null,
          ...(range && { createdAt: range }),
        },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          status: true,
          currency: true,
          total: true,
          baseTotal: true,
          exchangeRate: true,
          patient: {
            select: { firstName: true, lastName: true, patientCode: true },
          },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          status: { in: ['APPROVED', 'POSTED'] as any },
          deletedAt: null,
          ...(range && { expenseDate: range }),
        },
        select: {
          id: true,
          expenseCode: true,
          expenseDate: true,
          title: true,
          categoryName: true,
          amount: true,
          supplier: { select: { name: true } },
        },
      }),
    ]);

    return [
      ...invoices.map(
        (i): NetLine => ({
          id: i.id,
          date: i.createdAt.toISOString(),
          direction: 'IN',
          kind: 'Sale',
          reference: i.invoiceNumber,
          party: personName(i.patient),
          description: `Invoice (${humanize(i.status)})`,
          category: null,
          method: null,
          currency: i.currency || BASE_CURRENCY,
          amount: toNum(i.total),
          baseAmount: baseOf(i.baseTotal, i.total, i.exchangeRate),
        }),
      ),
      ...expenses.map(
        (e): NetLine => ({
          id: e.id,
          date: e.expenseDate.toISOString(),
          direction: 'OUT',
          kind: 'Expense',
          reference: e.expenseCode,
          party: e.supplier?.name ?? null,
          description: e.title,
          category: e.categoryName,
          method: null,
          // Expenses are recorded in the base currency only.
          currency: BASE_CURRENCY,
          amount: toNum(e.amount),
          baseAmount: toNum(e.amount),
        }),
      ),
    ];
  }

  // ── Receipts & Payments (cash) ───────────────────────────────────────────
  private async receiptsPaymentsLines(
    range: Prisma.DateTimeFilter | undefined,
  ): Promise<NetLine[]> {
    const [receipts, payments] = await Promise.all([
      this.prisma.receipt.findMany({
        where: {
          status: 'ACTIVE' as any,
          ...(range && { generatedAt: range }),
        },
        select: {
          id: true,
          receiptNumber: true,
          generatedAt: true,
          currencyCode: true,
          amountReceived: true,
          baseAmountReceived: true,
          exchangeRate: true,
          paymentMethod: true,
          payment: { select: { method: true } },
          invoice: {
            select: {
              invoiceNumber: true,
              patient: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          status: 'COMPLETED' as any,
          voidedAt: null,
          type: {
            notIn: [
              'CREDIT_NOTE_APPLICATION',
              'CREDIT_NOTE_REVERSAL',
            ] as any,
          },
          ...(range && { paidAt: range }),
          // OUT payments, plus IN payments that never got a receipt (a
          // receipted IN payment is already counted through `receipts`).
          OR: [
            { direction: 'OUT' as any },
            { direction: 'IN' as any, receipts: { none: {} } },
          ],
        },
        select: {
          id: true,
          paymentCode: true,
          type: true,
          direction: true,
          paidAt: true,
          method: true,
          currency: true,
          amount: true,
          baseAmount: true,
          exchangeRate: true,
          notes: true,
          reference: true,
          expense: {
            select: {
              title: true,
              categoryName: true,
              supplier: { select: { name: true } },
            },
          },
          purchaseOrder: {
            select: { poNumber: true, supplier: { select: { name: true } } },
          },
          invoice: {
            select: {
              patient: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return [
      ...receipts.map(
        (r): NetLine => ({
          id: r.id,
          date: r.generatedAt.toISOString(),
          direction: 'IN',
          kind: 'Receipt',
          reference: r.receiptNumber,
          party: personName(r.invoice?.patient),
          description: r.invoice?.invoiceNumber
            ? `For ${r.invoice.invoiceNumber}`
            : null,
          category: null,
          method: humanize(r.paymentMethod ?? r.payment?.method ?? null),
          currency: (r.currencyCode as string) || BASE_CURRENCY,
          amount: toNum(r.amountReceived),
          baseAmount: baseOf(
            r.baseAmountReceived,
            r.amountReceived,
            r.exchangeRate,
          ),
        }),
      ),
      ...payments.map((p): NetLine => {
        const out = p.direction === 'OUT';
        const supplier =
          p.expense?.supplier?.name ?? p.purchaseOrder?.supplier?.name ?? null;
        return {
          id: p.id,
          date: p.paidAt.toISOString(),
          direction: out ? 'OUT' : 'IN',
          kind: out ? 'Payment' : 'Other receipt',
          reference: p.paymentCode,
          party: supplier ?? personName(p.invoice?.patient),
          description:
            p.expense?.title ??
            (p.purchaseOrder ? `PO ${p.purchaseOrder.poNumber}` : null) ??
            p.notes ??
            p.reference ??
            null,
          category:
            p.expense?.categoryName ??
            (p.type === 'PURCHASE_ORDER'
              ? 'Supplier payment'
              : humanize(p.type)),
          method: humanize(p.method),
          currency: p.currency || BASE_CURRENCY,
          amount: toNum(p.amount),
          baseAmount: baseOf(p.baseAmount, p.amount, p.exchangeRate),
        };
      }),
    ];
  }

  // ── Totals, per-period and breakdowns ─────────────────────────────────────
  private summarise(
    basis: NetBasis,
    groupBy: NetGroupBy,
    query: FinancialReportQueryDto,
    lines: NetLine[],
  ) {
    const tz = DEFAULT_REPORT_TIMEZONE;
    const periodKey = (iso: string) => {
      const d = new Date(iso);
      if (groupBy === 'month') return formatInTimeZone(d, tz, 'yyyy-MM');
      if (groupBy === 'week') {
        const monday = startOfWeek(toZonedTime(d, tz), { weekStartsOn: 1 });
        return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      }
      return formatInTimeZone(d, tz, 'yyyy-MM-dd');
    };

    const totals = { in: 0, out: 0, net: 0, inCount: 0, outCount: 0 };
    const periods = new Map<
      string,
      { period: string; in: number; out: number; inCount: number; outCount: number }
    >();
    const inByCurrency = new Map<
      string,
      { currency: string; amount: number; baseAmount: number; count: number }
    >();
    const outByCurrency = new Map<
      string,
      { currency: string; amount: number; baseAmount: number; count: number }
    >();
    const inBreakdown = new Map<string, { label: string; amount: number; count: number }>();
    const outBreakdown = new Map<string, { label: string; amount: number; count: number }>();

    const bump = <T extends { count: number }>(
      m: Map<string, T>,
      key: string,
      init: () => T,
      add: (row: T) => void,
    ) => {
      const row = m.get(key) ?? init();
      add(row);
      row.count++;
      m.set(key, row);
    };

    for (const l of lines) {
      const isIn = l.direction === 'IN';
      if (isIn) {
        totals.in += l.baseAmount;
        totals.inCount++;
      } else {
        totals.out += l.baseAmount;
        totals.outCount++;
      }

      const key = periodKey(l.date);
      const p = periods.get(key) ?? { period: key, in: 0, out: 0, inCount: 0, outCount: 0 };
      if (isIn) {
        p.in += l.baseAmount;
        p.inCount++;
      } else {
        p.out += l.baseAmount;
        p.outCount++;
      }
      periods.set(key, p);

      bump(
        isIn ? inByCurrency : outByCurrency,
        l.currency,
        () => ({ currency: l.currency, amount: 0, baseAmount: 0, count: 0 }),
        (r) => {
          r.amount += l.amount;
          r.baseAmount += l.baseAmount;
        },
      );

      // IN: sales by invoice status / receipts by method.
      // OUT: expenses / payments by category.
      const label = isIn
        ? basis === 'sales-expenses'
          ? (l.description ?? 'Invoice')
          : (l.method ?? (l.kind === 'Other receipt' ? 'Other' : 'Unspecified'))
        : (l.category ?? 'Uncategorised');
      bump(
        isIn ? inBreakdown : outBreakdown,
        label,
        () => ({ label, amount: 0, count: 0 }),
        (r) => {
          r.amount += l.baseAmount;
        },
      );
    }
    totals.net = totals.in - totals.out;

    const money = <T extends Record<string, any>>(rows: T[], fields: (keyof T)[]) =>
      rows.map((r) => {
        const out: any = { ...r };
        for (const f of fields) out[f] = round2(r[f]);
        return out as T;
      });

    // Running net across the window (chronological), for the detailed view.
    let running = 0;
    const shown = lines.slice(0, MAX_LINES).map((l) => {
      running += l.direction === 'IN' ? l.baseAmount : -l.baseAmount;
      return { ...l, baseAmount: round2(l.baseAmount), runningNet: round2(running) };
    });

    const byAmount = (a: { amount: number }, b: { amount: number }) => b.amount - a.amount;

    return {
      asOf: new Date().toISOString(),
      basis,
      groupBy,
      baseCurrency: BASE_CURRENCY,
      dateRange: {
        startDate: query.startDate ?? null,
        endDate: query.endDate ?? null,
        startTime: query.startTime ?? null,
        endTime: query.endTime ?? null,
      },
      totals: {
        in: round2(totals.in),
        out: round2(totals.out),
        net: round2(totals.net),
        inCount: totals.inCount,
        outCount: totals.outCount,
        marginPct:
          totals.in > 0 ? Math.round((totals.net / totals.in) * 10000) / 100 : null,
      },
      periods: [...periods.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((p) => ({
          ...p,
          in: round2(p.in),
          out: round2(p.out),
          net: round2(p.in - p.out),
        })),
      inByCurrency: money([...inByCurrency.values()], ['amount', 'baseAmount']).sort(
        (a, b) => b.baseAmount - a.baseAmount,
      ),
      outByCurrency: money([...outByCurrency.values()], ['amount', 'baseAmount']).sort(
        (a, b) => b.baseAmount - a.baseAmount,
      ),
      inBreakdown: money([...inBreakdown.values()], ['amount']).sort(byAmount),
      outBreakdown: money([...outBreakdown.values()], ['amount']).sort(byAmount),
      lines: shown,
      linesTotal: lines.length,
      linesTruncated: lines.length > MAX_LINES,
    };
  }
}
