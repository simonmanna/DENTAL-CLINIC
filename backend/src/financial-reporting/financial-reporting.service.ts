// src/financial-reporting/financial-reporting.service.ts
//
// All money in this service flows through `baseAmount` columns (UGX-equivalent)
// so we never sum mixed currencies. Voided documents are excluded from totals
// across the board; they only appear in dedicated "void" buckets where useful.
//
// Reading notes:
//   - "Revenue" means cash actually collected → use Receipt.baseAmountReceived
//     where Receipt.status='ACTIVE'. NOT Invoice.total.
//   - "Billed" / "totalBilled" means invoice value posted → use Invoice.baseTotal
//     where Invoice.status='POSTED' (not VOID).
//   - "Outstanding" means unpaid balance on POSTED invoices.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, Prisma, CashFlowDirection } from '@prisma/client';
import { FinancialReportQueryDto } from './dto/financial-report-query.dto';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function buildDateRange(startDate?: string, endDate?: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (startDate) range.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return Object.keys(range).length ? range : undefined;
}

/** Read payment method from receipt — prefer structured metadata, fall back
 *  to the legacy "Payment Info: {…json…}" suffix some older receipts stored
 *  in notes. */
function extractReceiptMethod(receipt: { metadata: unknown; notes: string | null }): string | null {
  const fromMeta = (receipt.metadata as any)?.method;
  if (fromMeta) return String(fromMeta);

  const notes = receipt.notes ?? '';
  const match = notes.match(/Payment Info:\s*(\{[\s\S]*\})/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed?.method) return String(parsed.method);
    } catch {
      /* ignore */
    }
  }
  return null;
}

@Injectable()
export class FinancialReportingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // 1. INVOICES / SALES REPORT
  // ─────────────────────────────────────────────────────────────────────────

  async getInvoicesReport(query: FinancialReportQueryDto) {
    const {
      search,
      startDate,
      endDate,
      patientId,
      dentistId,
      status,
      paymentStatus,
      currency,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const dateRange = buildDateRange(startDate, endDate);

    // User-driven filter (may include VOID if the user explicitly asks for it).
    const baseWhere: Prisma.InvoiceWhereInput = {
      ...(patientId && { patientId }),
      ...(status && status !== 'ALL' && { status: status as InvoiceStatus }),
      ...(paymentStatus && paymentStatus !== 'ALL' && { paymentStatus: paymentStatus as any }),
      ...(currency && { currency }),
      ...(dateRange && { createdAt: dateRange }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { patient: { firstName: { contains: search, mode: 'insensitive' } } },
          { patient: { lastName: { contains: search, mode: 'insensitive' } } },
          { patient: { patientCode: { contains: search, mode: 'insensitive' } } },
        ],
      }),
      ...(dentistId && { visit: { dentistId } }),
    };

    // "Live" filter used in every aggregate that should not see voided invoices.
    // If the user explicitly filters by status=VOID we honour that; otherwise
    // we strip VOID out so revenue / collection-rate / by-doctor are honest.
    const livePosted: Prisma.InvoiceWhereInput =
      status === InvoiceStatus.VOID
        ? baseWhere
        : { ...baseWhere, status: { not: InvoiceStatus.VOID } };

    const validSortFields: Record<string, Prisma.InvoiceOrderByWithRelationInput> = {
      createdAt: { createdAt: sortOrder as any },
      total: { total: sortOrder as any },
      amountPaid: { amountPaid: sortOrder as any },
      balance: { balance: sortOrder as any },
      status: { status: sortOrder as any },
      invoiceNumber: { invoiceNumber: sortOrder as any },
    };
    const orderBy = validSortFields[sortBy] ?? { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: baseWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          paymentStatus: true,
          currency: true,
          baseCurrency: true,
          exchangeRate: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          total: true,
          amountPaid: true,
          balance: true,
          baseTotal: true,
          baseAmountPaid: true,
          baseBalance: true,
          dueDate: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
          notes: true,
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              phone: true,
              email: true,
            },
          },
          visit: {
            select: {
              id: true,
              visitCode: true,
              dentist: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  specialization: true,
                },
              },
            },
          },
          items: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              discount: true,
              total: true,
              procedure: { select: { id: true, name: true, code: true } },
            },
          },
          receipts: {
            select: {
              id: true,
              receiptNumber: true,
              amountReceived: true,
              currencyCode: true,
              exchangeRate: true,
              baseAmountReceived: true,
              generatedAt: true,
              status: true,
              notes: true,
              metadata: true,
              receivedById: true,
              receivedByName: true,
              receivedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  specialization: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.invoice.count({ where: baseWhere }),
    ]);

    // ── Aggregates (live = exclude VOID, base currency) ──────────────────────
    const agg = await this.prisma.invoice.aggregate({
      where: livePosted,
      _sum: {
        baseTotal: true,
        baseAmountPaid: true,
        baseBalance: true,
      },
      _count: { _all: true },
    });

    // ── Status breakdown (uses baseWhere so VOID is visible if user filtered) ─
    const statusBreakdown = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
      _sum: { baseTotal: true, baseAmountPaid: true },
    });

    // ── Payment-status breakdown (always exclude VOID — paymentStatus on a
    //    voided invoice is meaningless) ────────────────────────────────────
    const paymentStatusBreakdown = await this.prisma.invoice.groupBy({
      by: ['paymentStatus'],
      where: { ...baseWhere, status: { not: InvoiceStatus.VOID } },
      _count: { _all: true },
      _sum: { baseTotal: true, baseAmountPaid: true, baseBalance: true },
    });

    // ── Revenue by procedure (excludes voided invoices) ──────────────────
    const revenueByProcedure = await this.prisma.invoiceItem.groupBy({
      by: ['description'],
      where: {
        status: 'ACTIVE',
        invoice: livePosted,
        procedureId: { not: null },
      },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    });

    // ── Revenue by doctor (excludes voided invoices) ─────────────────────
    const revenueByDoctor = await this.prisma.invoice.groupBy({
      by: ['visitId'],
      where: { ...livePosted, visitId: { not: null } },
      _sum: { baseTotal: true, baseAmountPaid: true },
    });

    const visitIds = revenueByDoctor.map((r) => r.visitId!).filter(Boolean);
    const visits = visitIds.length
      ? await this.prisma.visit.findMany({
          where: { id: { in: visitIds } },
          select: {
            id: true,
            dentist: { select: { id: true, firstName: true, lastName: true } },
          },
        })
      : [];
    const visitDoctorMap = new Map(visits.map((v) => [v.id, v.dentist]));

    const doctorRevenue: Record<
      string,
      { name: string; billed: number; collected: number; count: number }
    > = {};
    for (const r of revenueByDoctor) {
      const doc = visitDoctorMap.get(r.visitId!);
      if (!doc) continue;
      const key = doc.id;
      if (!doctorRevenue[key]) {
        doctorRevenue[key] = {
          name: `${doc.firstName} ${doc.lastName}`,
          billed: 0,
          collected: 0,
          count: 0,
        };
      }
      doctorRevenue[key].billed += toNum(r._sum.baseTotal);
      doctorRevenue[key].collected += toNum(r._sum.baseAmountPaid);
      doctorRevenue[key].count += 1;
    }

    // ── Payment-method breakdown (true: from active receipts on this set) ────
    //
    // We previously queried the Payment table by type=INVOICE_RECEIPT but no
    // such rows are ever created. The truth is in Receipt.metadata.method
    // (with a fallback to legacy notes parsing).
    const receiptWhereForMethods: Prisma.ReceiptWhereInput = {
      status: 'ACTIVE' as any,
      ...(dateRange && { generatedAt: dateRange }),
      ...(patientId && { invoice: { patientId } }),
      ...(currency && { currencyCode: currency as any }),
      invoice: {
        ...(patientId && { patientId }),
        // Use the same dentist filter as the invoices report.
        ...(dentistId && { visit: { dentistId } }),
        status: { not: InvoiceStatus.VOID },
      },
    };
    const activeReceiptsForMethods = await this.prisma.receipt.findMany({
      where: receiptWhereForMethods,
      select: {
        baseAmountReceived: true,
        amountReceived: true,
        metadata: true,
        notes: true,
      },
    });
    const methodAgg: Record<string, { total: number; count: number }> = {};
    for (const r of activeReceiptsForMethods) {
      const method = extractReceiptMethod(r) ?? 'UNKNOWN';
      if (!methodAgg[method]) methodAgg[method] = { total: 0, count: 0 };
      methodAgg[method].total += toNum(r.baseAmountReceived ?? r.amountReceived);
      methodAgg[method].count += 1;
    }

    // ── Outstanding / overdue (POSTED only, never VOID) ──────────────────────
    const outstandingWhere: Prisma.InvoiceWhereInput = {
      ...baseWhere,
      status: InvoiceStatus.POSTED,
      paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
    };

    const outstanding = await this.prisma.invoice.aggregate({
      where: outstandingWhere,
      _sum: { baseBalance: true },
      _count: { _all: true },
    });

    const overdue = await this.prisma.invoice.aggregate({
      where: { ...outstandingWhere, dueDate: { lt: new Date() } },
      _sum: { baseBalance: true },
      _count: { _all: true },
    });

    // ── Aging buckets (base currency). Aging is only meaningful when an
    //    invoice has a dueDate. Invoices without one are bucketed under
    //    "Undated" so they're visible but not treated as overdue. ────────
    const now = new Date();
    const agingInvoices = await this.prisma.invoice.findMany({
      where: outstandingWhere,
      select: { baseBalance: true, dueDate: true },
    });

    const agingBuckets = [
      { label: 'Current', min: -Infinity, max: 0, count: 0, amount: 0 },
      { label: '1-30 days', min: 1, max: 30, count: 0, amount: 0 },
      { label: '31-60 days', min: 31, max: 60, count: 0, amount: 0 },
      { label: '61-90 days', min: 61, max: 90, count: 0, amount: 0 },
      { label: '90+ days', min: 91, max: Infinity, count: 0, amount: 0 },
      { label: 'Undated', min: NaN, max: NaN, count: 0, amount: 0 },
    ];

    for (const inv of agingInvoices) {
      const bal = toNum(inv.baseBalance);
      if (!inv.dueDate) {
        agingBuckets[5].count++;
        agingBuckets[5].amount += bal;
        continue;
      }
      const daysOld = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000);
      for (let i = 0; i < 5; i++) {
        const b = agingBuckets[i];
        if (daysOld >= b.min && daysOld <= b.max) {
          b.count++;
          b.amount += bal;
          break;
        }
      }
    }

    const totalBilled = toNum(agg._sum.baseTotal);
    const totalCollected = toNum(agg._sum.baseAmountPaid);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        // counts
        total,
        // money (all base currency)
        totalBilled,              // sum of POSTED (non-VOID) invoice baseTotal
        totalCollected,           // sum of POSTED invoice baseAmountPaid
        totalOutstanding: toNum(agg._sum.baseBalance),
        collectionRate: totalBilled > 0
          ? Math.round((totalCollected / totalBilled) * 10000) / 100
          : 0,
        // breakdowns
        statusBreakdown: statusBreakdown.map((s) => ({
          status: s.status,
          count: s._count._all,
          billed: toNum(s._sum.baseTotal),
          collected: toNum(s._sum.baseAmountPaid),
        })),
        paymentStatusBreakdown: paymentStatusBreakdown.map((s) => ({
          paymentStatus: s.paymentStatus,
          count: s._count._all,
          billed: toNum(s._sum.baseTotal),
          collected: toNum(s._sum.baseAmountPaid),
          outstanding: toNum(s._sum.baseBalance),
        })),
        revenueByProcedure: revenueByProcedure.map((p) => ({
          name: p.description,
          total: toNum(p._sum.total),
          count: p._count._all,
        })),
        revenueByDoctor: Object.values(doctorRevenue).sort(
          (a, b) => b.billed - a.billed,
        ),
        paymentsByMethod: Object.entries(methodAgg)
          .map(([method, v]) => ({ method, total: v.total, count: v.count }))
          .sort((a, b) => b.total - a.total),
        outstandingCount: (outstanding._count as any)?._all ?? 0,
        outstandingAmount: toNum(outstanding._sum?.baseBalance),
        overdueCount: (overdue._count as any)?._all ?? 0,
        overdueAmount: toNum(overdue._sum?.baseBalance),
        agingBuckets: agingBuckets.map((b) => ({
          label: b.label,
          count: b.count,
          amount: b.amount,
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. RECEIPTS REPORT
  // ─────────────────────────────────────────────────────────────────────────

  async getReceiptsReport(query: FinancialReportQueryDto) {
    const {
      search,
      startDate,
      endDate,
      patientId,
      status,
      currency,
      page = 1,
      limit = 20,
      sortBy = 'generatedAt',
      sortOrder = 'desc',
    } = query;

    const dateRange = buildDateRange(startDate, endDate);

    // Default: ACTIVE only. status='ALL' → no filter. status='VOID' → voids only.
    const statusFilter: Prisma.ReceiptWhereInput =
      status === 'ALL'
        ? {}
        : status === 'VOID'
          ? { status: 'VOID' as any }
          : { status: 'ACTIVE' as any };

    const sharedFilters: Prisma.ReceiptWhereInput = {
      ...(dateRange && { generatedAt: dateRange }),
      ...(patientId && { invoice: { patientId } }),
      ...(currency && { currencyCode: currency as any }),
      ...(search && {
        OR: [
          { receiptNumber: { contains: search, mode: 'insensitive' } },
          { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
          { invoice: { patient: { firstName: { contains: search, mode: 'insensitive' } } } },
          { invoice: { patient: { lastName: { contains: search, mode: 'insensitive' } } } },
          { invoice: { patient: { patientCode: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const listWhere: Prisma.ReceiptWhereInput = { ...sharedFilters, ...statusFilter };
    // Same filter without status — used for the void aggregate so it always
    // reports the universe the user is looking at.
    const universeWhere: Prisma.ReceiptWhereInput = sharedFilters;

    const validSortFields: Record<string, any> = {
      generatedAt: { generatedAt: sortOrder },
      amountReceived: { amountReceived: sortOrder },
    };
    const orderBy = validSortFields[sortBy] ?? { generatedAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where: listWhere,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          receiptNumber: true,
          amountReceived: true,
          currencyCode: true,
          currency: true,
          exchangeRate: true,
          baseAmountReceived: true,
          invoiceAmountApplied: true,
          generatedAt: true,
          generatedBy: true,
          notes: true,
          metadata: true,
          invoiceId: true,
          paymentId: true,
          status: true,
          voidedAt: true,
          voidedBy: true,
          voidReason: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              amountPaid: true,
              balance: true,
              currency: true,
              status: true,
              paymentStatus: true,
              issuedAt: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  patientCode: true,
                  phone: true,
                },
              },
              visit: {
                select: {
                  id: true,
                  visitCode: true,
                  dentist: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
          payment: {
            select: {
              id: true,
              paymentCode: true,
              method: true,
              reference: true,
              transactionId: true,
              receivedBy: true,
            },
          },
          receivedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      }),
      this.prisma.receipt.count({ where: listWhere }),
    ]);

    // ── Per-currency breakdown (active only) ─────────────────────────────
    const byCurrencyRaw = await this.prisma.receipt.groupBy({
      by: ['currencyCode'],
      where: { ...universeWhere, status: 'ACTIVE' as any },
      _sum: { amountReceived: true, baseAmountReceived: true },
      _count: { _all: true },
    });
    const byCurrency = byCurrencyRaw.map((c) => ({
      currency: c.currencyCode as string,
      total: toNum(c._sum.amountReceived),
      totalBase: toNum(c._sum.baseAmountReceived),
      count: c._count._all,
    }));

    const totalBaseCollected = byCurrency.reduce((s, c) => s + c.totalBase, 0);
    const totalActiveCount = byCurrency.reduce((s, c) => s + c.count, 0);

    // ── Void aggregates (over the same universe, regardless of list filter) ──
    const voidAgg = await this.prisma.receipt.aggregate({
      where: { ...universeWhere, status: 'VOID' as any },
      _sum: { baseAmountReceived: true },
      _count: { _all: true },
    });

    // ── Daily collections (active only, base currency, respects user filters) ─
    //
    // Pull active receipts in the filter window and bucket by date in app code.
    // Doing it in JS avoids the previous raw-SQL bug where patient/currency
    // filters were ignored.
    const dailyReceipts = await this.prisma.receipt.findMany({
      where: {
        ...universeWhere,
        status: 'ACTIVE' as any,
        ...(dateRange
          ? {}
          : {
              generatedAt: {
                gte: new Date(Date.now() - 30 * 86400000),
                lte: new Date(),
              },
            }),
      },
      select: { generatedAt: true, baseAmountReceived: true, amountReceived: true },
      orderBy: { generatedAt: 'asc' },
    });

    const dailyMap = new Map<string, { total: number; count: number }>();
    for (const r of dailyReceipts) {
      const key = r.generatedAt.toISOString().slice(0, 10);
      const bucket = dailyMap.get(key) ?? { total: 0, count: 0 };
      bucket.total += toNum(r.baseAmountReceived ?? r.amountReceived);
      bucket.count += 1;
      dailyMap.set(key, bucket);
    }
    const dailyCollections = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, total: v.total, count: v.count }));

    // ── Method breakdown (active only, base currency, supports both metadata
    //    and legacy notes-JSON) ────────────────────────────────────────────
    const methodReceipts = await this.prisma.receipt.findMany({
      where: { ...universeWhere, status: 'ACTIVE' as any },
      select: {
        baseAmountReceived: true,
        amountReceived: true,
        metadata: true,
        notes: true,
      },
    });

    const methodAgg: Record<string, { total: number; count: number }> = {};
    for (const r of methodReceipts) {
      const method = extractReceiptMethod(r) ?? 'UNKNOWN';
      if (!methodAgg[method]) methodAgg[method] = { total: 0, count: 0 };
      methodAgg[method].total += toNum(r.baseAmountReceived ?? r.amountReceived);
      methodAgg[method].count += 1;
    }

    return {
      data: data.map((r) => ({
        ...r,
        currency: r.currency ?? (r.currencyCode as string),
        paymentMethod: extractReceiptMethod(r) ?? r.payment?.method ?? null,
        reference:
          (r.metadata as any)?.reference ?? r.payment?.reference ?? null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        totalActiveCount,
        totalCollected: totalBaseCollected,
        totalBaseCollected,
        byCurrency,
        voidedCount: voidAgg._count._all,
        voidedTotalBase: toNum(voidAgg._sum.baseAmountReceived),
        dailyCollections,
        methodBreakdown: Object.entries(methodAgg)
          .map(([method, v]) => ({ method, total: v.total, count: v.count }))
          .sort((a, b) => b.total - a.total),
      },
    };
  }
  // ─────────────────────────────────────────────────────────────────────────
  // 4. PAYMENTS REPORT
  // ─────────────────────────────────────────────────────────────────────────

  async getPaymentsReport(query: FinancialReportQueryDto) {
    const {
      search,
      startDate,
      endDate,
      patientId,
      type,
      method,
      status,
      page = 1,
      limit = 20,
      sortBy = 'paidAt',
      sortOrder = 'desc',
    } = query;

    const dateRange = buildDateRange(startDate, endDate);

    // Default: exclude VOIDED/FAILED/REFUNDED. status='ALL' opens everything,
    // status='VOIDED' shows just voids, etc.
    const statusFilter: Prisma.PaymentWhereInput =
      status === 'ALL'
        ? {}
        : status
          ? { status: status as any }
          : { status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] as any } };

    const where: Prisma.PaymentWhereInput = {
      ...statusFilter,
      ...(type && type !== 'ALL' && { type: type as any }),
      ...(method && { method: method as any }),
      ...(dateRange && { paidAt: dateRange }),
      ...(patientId && { invoice: { patientId } }),
      ...(search && {
        OR: [
          { paymentCode: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { transactionId: { contains: search, mode: 'insensitive' } },
          {
            invoice: {
              invoiceNumber: { contains: search, mode: 'insensitive' },
            },
          },
          {
            purchaseOrder: {
              poNumber: { contains: search, mode: 'insensitive' },
            },
          },
          {
            expense: { expenseCode: { contains: search, mode: 'insensitive' } },
          },
        ],
      }),
    };

    const validSortFields: Record<string, any> = {
      paidAt: { paidAt: sortOrder },
      amount: { amount: sortOrder },
      createdAt: { createdAt: sortOrder },
    };
    const orderBy = validSortFields[sortBy] ?? { paidAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          paymentCode: true,
          type: true,
          direction: true,
          amount: true,
          method: true,
          status: true,
          currency: true,
          exchangeRate: true,
          baseAmount: true,
          reference: true,
          transactionId: true,
          bankName: true,
          chequeNumber: true,
          receivedBy: true,
          notes: true,
          paidAt: true,
          createdAt: true,
          voidedAt: true,
          voidedBy: true,
          voidReason: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              currency: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  patientCode: true,
                },
              },
            },
          },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          expense: {
            select: {
              id: true,
              expenseCode: true,
              title: true,
              category: true,
            },
          },
          receipts: { select: { id: true, receiptNumber: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const [inAgg, outAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...where, direction: 'IN' },
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, direction: 'OUT' },
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
    ]);

    const [byMethod, byType] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['method', 'direction'],
        where,
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        account: null as string | null,
        party: p.invoice?.patient
          ? `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}`
          : (p.purchaseOrder?.supplier?.name ?? p.expense?.title ?? null),
        contextLabel:
          p.invoice?.invoiceNumber ??
          p.purchaseOrder?.poNumber ??
          p.expense?.expenseCode ??
          null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        // Excludes voided/failed/refunded unless the user explicitly asked.
        totalIn: toNum(inAgg._sum.amount),
        totalOut: toNum(outAgg._sum.amount),
        netAmount: toNum(inAgg._sum.amount) - toNum(outAgg._sum.amount),
        totalBaseIn: toNum(inAgg._sum.baseAmount),
        totalBaseOut: toNum(outAgg._sum.baseAmount),
        inCount: inAgg._count._all,
        outCount: outAgg._count._all,
        byMethod: byMethod.map((m) => ({
          method: m.method,
          direction: m.direction,
          total: toNum(m._sum.amount),
          totalBase: toNum(m._sum.baseAmount),
          count: m._count._all,
        })),
        byType: byType.map((t) => ({
          type: t.type,
          total: toNum(t._sum.amount),
          totalBase: toNum(t._sum.baseAmount),
          count: t._count._all,
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. EXPENSES REPORT
  // ─────────────────────────────────────────────────────────────────────────

  async getExpensesReport(query: FinancialReportQueryDto) {
    const {
      search, startDate, endDate, status, category,
      page = 1, limit = 20,
      sortBy = 'expenseDate', sortOrder = 'desc',
    } = query as any;

    const dateRange = buildDateRange(startDate, endDate);

    const where: Prisma.ExpenseWhereInput = {
      ...(status && status !== 'ALL' && { status: status as any }),
      // `category` filter now carries a dynamic ExpenseCategory id.
      ...(category && { categoryId: category as any }),
      ...(dateRange && { expenseDate: dateRange }),
      ...(search && {
        OR: [
          { expenseCode: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Money aggregates exclude VOID expenses (voided money never left the
    // clinic) so the report's headline totals reconcile with the dashboard
    // stats — UNLESS the user explicitly filtered by a status (e.g.
    // status=VOID to inspect voided spend), in which case we honour it exactly.
    const excludeVoid = !status || status === 'ALL';
    const moneyWhere: Prisma.ExpenseWhereInput = excludeVoid
      ? { ...where, status: { not: 'VOID' as any } }
      : where;

    const validSortFields: Record<string, any> = {
      expenseDate: { expenseDate: sortOrder },
      amount: { amount: sortOrder },
      createdAt: { createdAt: sortOrder },
      title: { title: sortOrder },
      status: { status: sortOrder },
    };
    const orderBy = validSortFields[sortBy] ?? { expenseDate: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          expenseCode: true,
          categoryId: true,
          categoryName: true,
          title: true,
          description: true,
          amount: true,
          expenseDate: true,
          status: true,
          approvedById: true,
          approvedBy: {
            select: { id: true, email: true, staff: { select: { firstName: true, lastName: true } } },
          },
          approvedAt: true,
          approvalNotes: true,
          paidAt: true,
          createdById: true,
          createdBy: {
            select: { id: true, email: true, staff: { select: { firstName: true, lastName: true } } },
          },
          attachments: true,
          notes: true,
          createdAt: true,
          payments: {
            // Only show active payment rows for the per-row totalPaid.
            where: { status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] as any } },
            select: {
              id: true,
              paymentCode: true,
              amount: true,
              method: true,
              status: true,
              currency: true,
              paidAt: true,
            },
          },
        },
      }),
      this.prisma.expense.count({ where }),
    ]);

    const agg = await this.prisma.expense.aggregate({
      where: moneyWhere,
      _sum: { amount: true },
      _count: { _all: true },
    });

    // byStatus keeps the full filtered set so the VOID bucket stays visible as
    // its own breakdown row (matches the dashboard's per-status breakdown).
    const byStatus = await this.prisma.expense.groupBy({
      by: ['status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    // Group by the snapshot name so historical labels survive category edits.
    const byCategory = await this.prisma.expense.groupBy({
      by: ['categoryName'],
      where: moneyWhere,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    // Trend must respect the SAME filters as the list/summary so the chart
    // reconciles with them: search, status/category, and VOID-exclusion.
    const searchLike = search ? `%${search}%` : null;
    const monthlyTrend = await this.prisma.$queryRaw<
      { month: Date; total: number | null; count: number }[]
    >`
      SELECT DATE_TRUNC('month', "expenseDate") as month,
             SUM(amount) as total,
             COUNT(*) as count
      FROM expenses
      WHERE "expenseDate" >= ${dateRange?.gte ?? new Date(Date.now() - 365 * 86400000)}
        AND "expenseDate" <= ${dateRange?.lte ?? new Date()}
        ${status && status !== 'ALL' ? Prisma.sql`AND status = ${status}::"ExpenseStatus"` : Prisma.empty}
        ${category ? Prisma.sql`AND "categoryId" = ${category}` : Prisma.empty}
        ${searchLike ? Prisma.sql`AND ("expenseCode" ILIKE ${searchLike} OR title ILIKE ${searchLike} OR description ILIKE ${searchLike})` : Prisma.empty}
        ${excludeVoid ? Prisma.sql`AND status <> 'VOID'::"ExpenseStatus"` : Prisma.empty}
      GROUP BY DATE_TRUNC('month', "expenseDate")
      ORDER BY month ASC
    `;

    const paidAgg = await this.prisma.expense.aggregate({
      where: { ...moneyWhere, paymentStatus: 'PAID' as any },
      _sum: { amount: true, amountPaid: true },
      _count: { _all: true },
    });

    const pendingAgg = await this.prisma.expense.aggregate({
      where: {
        ...moneyWhere,
        paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] as any },
      },
      _sum: { amount: true, balance: true },
      _count: { _all: true },
    });

    return {
      data: data.map((e) => ({
        ...e,
        // Keep the legacy `category` key (string) for the frontend table.
        category: e.categoryName,
        createdByName: e.createdBy?.staff
          ? `${e.createdBy.staff.firstName} ${e.createdBy.staff.lastName}`
          : (e.createdBy?.email ?? null),
        approvedByName: e.approvedBy?.staff
          ? `${e.approvedBy.staff.firstName} ${e.approvedBy.staff.lastName}`
          : (e.approvedBy?.email ?? null),
        totalPaid: e.payments.reduce((sum, p) => sum + toNum(p.amount), 0),
      })),
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        total,
        totalAmount: toNum(agg._sum.amount),
        totalPaid: toNum(paidAgg._sum.amountPaid ?? paidAgg._sum.amount),
        paidCount: paidAgg._count._all,
        totalPending: toNum(pendingAgg._sum.balance ?? pendingAgg._sum.amount),
        pendingCount: pendingAgg._count._all,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          total: toNum(s._sum.amount),
          count: s._count._all,
        })),
        byCategory: byCategory.map((c) => ({
          category: c.categoryName,
          total: toNum(c._sum.amount),
          count: c._count._all,
        })),
        monthlyTrend: monthlyTrend.map((m) => ({
          month: m.month,
          total: toNum(m.total),
          count: Number(m.count),
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. CASH-FLOW REPORT (audit P2 — was missing)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Time-bucket the OUT-direction payments (vendor payments + expense
  // payments + credit-note applications) per week so a clinic can see
  // how much cash left per period. Excludes VOIDED / FAILED / REFUNDED.
  async getCashFlowReport(query: FinancialReportQueryDto) {
    const { startDate, endDate, page = 1, limit = 50 } = query;
    const range = buildDateRange(startDate, endDate);

    const where: Prisma.PaymentWhereInput = {
      direction: CashFlowDirection.OUT,
      status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] as any },
      ...(range && { paidAt: range }),
    };

    const [rows, total, totals] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { paidAt: 'desc' },
        select: {
          id: true,
          paymentCode: true,
          type: true,
          method: true,
          amount: true,
          currency: true,
          paidAt: true,
          reference: true,
          purchaseOrder: {
            select: { poNumber: true, supplier: { select: { name: true } } },
          },
          expense: {
            select: {
              expenseCode: true,
              title: true,
              categoryName: true,
              supplier: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
    ]);

    // Weekly buckets for the chart.
    const buckets = await this.prisma.$queryRaw<
      Array<{ week: Date; total: any; count: bigint }>
    >`
      SELECT DATE_TRUNC('week', "paidAt") AS week,
             SUM("amount")                 AS total,
             COUNT(*)                       AS count
      FROM payments
      WHERE direction = 'OUT'
        AND status NOT IN ('VOIDED', 'FAILED', 'REFUNDED')
        AND "paidAt" >= ${range?.gte ?? new Date(Date.now() - 90 * 86400000)}
        AND "paidAt" <= ${range?.lte ?? new Date()}
      GROUP BY DATE_TRUNC('week', "paidAt")
      ORDER BY week ASC
    `;

    return {
      data: rows.map((r) => ({
        id: r.id,
        paymentCode: r.paymentCode,
        type: r.type,
        method: r.method,
        amount: toNum(r.amount),
        currency: r.currency,
        paidAt: r.paidAt,
        reference: r.reference,
        vendor:
          r.purchaseOrder?.supplier?.name ??
          r.expense?.supplier?.name ??
          null,
        documentNumber:
          r.purchaseOrder?.poNumber ?? r.expense?.expenseCode ?? null,
        description:
          r.purchaseOrder?.poNumber ??
          r.expense?.title ??
          null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalOut: toNum(totals._sum.amount),
        totalOutCount: totals._count._all,
        byWeek: buckets.map((b) => ({
          week: b.week,
          total: toNum(b.total),
          count: Number(b.count),
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. ACCOUNTS-PAYABLE REPORT (audit P2 — was missing)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Group outstanding payables (UNPAID / PARTIALLY_PAID expenses + purchase
  // orders) by supplier with aging buckets (0–30 / 31–60 / 61–90 / 90+ days).
  async getAccountsPayableReport(query: FinancialReportQueryDto) {
    const { startDate, endDate } = query;
    const now = new Date();

    const expenseWhere: Prisma.ExpenseWhereInput = {
      status: { notIn: ['VOID', 'CANCELLED'] as any },
      paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] as any },
      deletedAt: null,
    };
    const poWhere: Prisma.PurchaseOrderWhereInput = {
      status: { not: 'CANCELLED' },
      paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] as any },
    };

    const [expenses, pos] = await Promise.all([
      this.prisma.expense.findMany({
        where: { ...expenseWhere, supplierId: { not: null } },
        select: {
          id: true,
          expenseCode: true,
          title: true,
          supplierId: true,
          expenseDate: true,
          balance: true,
          supplier: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchaseOrder.findMany({
        where: poWhere,
        select: {
          id: true,
          poNumber: true,
          supplierId: true,
          createdAt: true,
          balance: true,
          supplier: { select: { id: true, name: true } },
        },
      }),
    ]);

    const bySupplier = new Map<string, any>();
    const ensureSupplier = (id: string, name: string) => {
      if (!bySupplier.has(id)) {
        bySupplier.set(id, {
          supplierId: id,
          supplierName: name,
          total: 0,
          count: 0,
          aging: { current: 0, d30: 0, d60: 0, d90: 0 },
        });
      }
      return bySupplier.get(id);
    };

    const ageInDays = (date: Date) => {
      const diffMs = now.getTime() - date.getTime();
      return Math.floor(diffMs / 86400000);
    };

    let grandTotal = 0;
    let grandCount = 0;

    for (const e of expenses) {
      if (!e.supplier) continue;
      const bucket = ensureSupplier(e.supplier.id, e.supplier.name);
      const amt = toNum(e.balance);
      bucket.total += amt;
      bucket.count += 1;
      grandTotal += amt;
      grandCount += 1;
      const days = ageInDays(e.expenseDate);
      if (days <= 30) bucket.aging.current += amt;
      else if (days <= 60) bucket.aging.d30 += amt;
      else if (days <= 90) bucket.aging.d60 += amt;
      else bucket.aging.d90 += amt;
    }

    for (const p of pos) {
      if (!p.supplier) continue;
      const bucket = ensureSupplier(p.supplier.id, p.supplier.name);
      const amt = toNum(p.balance);
      bucket.total += amt;
      bucket.count += 1;
      grandTotal += amt;
      grandCount += 1;
      const days = ageInDays(p.createdAt);
      if (days <= 30) bucket.aging.current += amt;
      else if (days <= 60) bucket.aging.d30 += amt;
      else if (days <= 90) bucket.aging.d60 += amt;
      else bucket.aging.d90 += amt;
    }

    return {
      asOf: now.toISOString(),
      summary: {
        totalOutstanding: grandTotal,
        itemCount: grandCount,
        supplierCount: bySupplier.size,
      },
      bySupplier: [...bySupplier.values()].sort((a, b) => b.total - a.total),
      dateRange: { startDate: startDate ?? null, endDate: endDate ?? null },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. VENDOR-PAYMENTS REPORT (audit P2 — was missing)
  // ─────────────────────────────────────────────────────────────────────────
  async getVendorPaymentsReport(query: FinancialReportQueryDto) {
    const { startDate, endDate, page = 1, limit = 50 } = query;
    const range = buildDateRange(startDate, endDate);

    const where: Prisma.PaymentWhereInput = {
      direction: CashFlowDirection.OUT,
      status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] as any },
      ...(range && { paidAt: range }),
      OR: [
        { purchaseOrderId: { not: null } },
        { expenseId: { not: null } },
      ],
    };

    const [data, total, totals] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { paidAt: 'desc' },
        include: {
          purchaseOrder: {
            select: {
              poNumber: true,
              supplier: { select: { id: true, name: true } },
            },
          },
          expense: {
            select: {
              expenseCode: true,
              title: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    // Group by supplier for the breakdown table.
    const bySupplier = new Map<string, { supplierId: string; supplierName: string; total: number; count: number }>();
    for (const p of data) {
      const sup =
        p.purchaseOrder?.supplier ?? p.expense?.supplier ?? null;
      if (!sup) continue;
      const cur =
        bySupplier.get(sup.id) ??
        { supplierId: sup.id, supplierName: sup.name, total: 0, count: 0 };
      cur.total += toNum(p.amount);
      cur.count += 1;
      bySupplier.set(sup.id, cur);
    }

    return {
      data: data.map((p) => ({
        id: p.id,
        paymentCode: p.paymentCode,
        amount: toNum(p.amount),
        method: p.method,
        paidAt: p.paidAt,
        reference: p.reference,
        type: p.type,
        vendor:
          p.purchaseOrder?.supplier?.name ?? p.expense?.supplier?.name ?? null,
        vendorId:
          p.purchaseOrder?.supplier?.id ?? p.expense?.supplier?.id ?? null,
        documentNumber:
          p.purchaseOrder?.poNumber ?? p.expense?.expenseCode ?? null,
        description: p.notes,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalPaid: toNum(totals._sum.amount),
        paymentCount: totals._count._all,
        supplierCount: bySupplier.size,
        bySupplier: [...bySupplier.values()].sort((a, b) => b.total - a.total),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. PROFITABILITY REPORT (audit P2 — was missing)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Revenue (collected receipts) − Expenses (active, not voided) per period.
  async getProfitabilityReport(query: FinancialReportQueryDto) {
    const { startDate, endDate } = query;
    const range = buildDateRange(startDate, endDate);

    const [revenue, expenses] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          type: 'INVOICE_RECEIPT' as any,
          status: 'COMPLETED' as any,
          ...(range && { paidAt: range }),
        },
        _sum: { amount: true, baseAmount: true },
        _count: { _all: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          status: { not: 'VOID' as any },
          deletedAt: null,
          ...(range && { expenseDate: range }),
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const totalRevenue = toNum(revenue._sum.amount);
    const totalExpenses = toNum(expenses._sum.amount);
    const netProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      asOf: new Date().toISOString(),
      dateRange: { startDate: startDate ?? null, endDate: endDate ?? null },
      revenue: {
        total: totalRevenue,
        baseTotal: toNum(revenue._sum.baseAmount),
        paymentCount: revenue._count._all,
      },
      expenses: {
        total: totalExpenses,
        expenseCount: expenses._count._all,
      },
      netProfit,
      profitMarginPct: Math.round(margin * 100) / 100,
    };
  }
}
