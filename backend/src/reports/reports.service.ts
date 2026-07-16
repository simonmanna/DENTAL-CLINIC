import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, VisitStatus } from '@prisma/client';
import {
  VisitReportQueryDto,
  ExportReportDto,
  ReportPeriod,
  ReportType,
} from './dto/report.dto';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}


// Add these after the imports
export interface PatientVisitRow {
  visitId: string;
  visitCode: string;
  patientId: string;
  patientCode: string;
  patientName: string;
  patientPhone?: string;
  dentistId: string;
  dentistName: string;
  dentistSpecialization?: string;
  status: string;
  paymentStatus: string;
  totalCost: number;
  amountPaid: number;
  balance: number;
  diagnosis: string[];
  icdCodes: string[];
  procedureCount: number;
  procedures: { name: string; code?: string; cost: number }[];
  sessionCount: number;
  completedSessionCount: number;
  prescriptionCount: number;
  // totalPayments: number;
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  followUpDate: string | null;
  createdAt: string;
  treatmentProcedures?: {
    id: string;
    name: string;
    code?: string;
    status: string;
    totalPrice: number;
    sessionCount: number;
    completedSessions: number;
    targets?: { toothNumber?: number; surfaces?: string[] }[];
  }[];
}

export interface PatientVisitsReport {
  type: string; // or ClinicalReportType.PATIENT_VISITS
  period: { startDate: string; endDate: string };
  summary: {
    total: number;
    byStatus: Record<string, number>;
    totalRevenue: number;
    totalCollected: number;
    avgProceduresPerVisit: number | string;
  };
  data: PatientVisitRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) { }

  // ═════════════════════════════════════════════════════════════════════════════
  // DASHBOARD & ANALYTICS REPORTS
  // ═════════════════════════════════════════════════════════════════════════════

  async getDashboardSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevMonthStart = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // Revenue = cash actually collected from patients. The Payment table holds
    // clinic OUTFLOWS (PO/expense payments); patient revenue lives in Receipt.
    // Always aggregate baseAmountReceived so multi-currency receipts collapse
    // to UGX-equivalent. VOID receipts are excluded.
    const activeReceiptWhere = (range: any) => ({
      status: 'ACTIVE' as any,
      generatedAt: range,
    });

    const [
      totalPatients,
      newPatientsToday,
      newPatientsMonth,
      appointmentsToday,
      appointmentsMonth,
      revenueToday,
      revenueMonth,
      revenuePrevMonth,
      pendingInvoices,
      activeStaff,
      appointmentsByStatus,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { isActive: true } }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: monthStart } },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: today, lt: tomorrow } },
      }),
      this.prisma.appointment.count({
        where: { scheduledAt: { gte: monthStart } },
      }),
      this.prisma.receipt.aggregate({
        where: activeReceiptWhere({ gte: today, lt: tomorrow }),
        _sum: { baseAmountReceived: true },
      }),
      this.prisma.receipt.aggregate({
        where: activeReceiptWhere({ gte: monthStart }),
        _sum: { baseAmountReceived: true },
      }),
      this.prisma.receipt.aggregate({
        where: activeReceiptWhere({ gte: prevMonthStart, lte: prevMonthEnd }),
        _sum: { baseAmountReceived: true },
      }),
      this.prisma.invoice.count({
        where: {
          status: InvoiceStatus.POSTED,
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        },
      }),
      this.prisma.staff.count({ where: { isAvailable: true } }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { scheduledAt: { gte: today, lt: tomorrow } },
        _count: true,
      }),
    ]);

    const [overdueInvoices, totalOutstandingBalance] = await Promise.all([
      this.prisma.invoice.count({
        where: {
          status: InvoiceStatus.POSTED,
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          dueDate: { lt: new Date() },
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: InvoiceStatus.POSTED,
          paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        },
        _sum: { baseBalance: true },
      }),
    ]);

    const toNum = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const todayRevenue = toNum(revenueToday._sum.baseAmountReceived);
    const monthRevenue = toNum(revenueMonth._sum.baseAmountReceived);
    const prevMonthRevenue = toNum(revenuePrevMonth._sum.baseAmountReceived);

    const revenueGrowth = prevMonthRevenue
      ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
      : 0;

    return {
      patients: {
        total: totalPatients,
        newToday: newPatientsToday,
        newThisMonth: newPatientsMonth,
      },
      appointments: {
        today: appointmentsToday,
        thisMonth: appointmentsMonth,
        byStatus: appointmentsByStatus,
      },
      revenue: {
        today: todayRevenue,
        thisMonth: monthRevenue,
        prevMonth: prevMonthRevenue,
        growth: Math.round(revenueGrowth * 100) / 100,
      },
      pending: {
        invoices: pendingInvoices,
        overdueInvoices,
        outstandingBalance: toNum(totalOutstandingBalance._sum.baseBalance),
      },
      staff: { active: activeStaff },
    };
  }

  async getActiveVisitsCount(): Promise<number> {
    return this.prisma.visit.count({
      where: {
        status: VisitStatus.IN_PROGRESS,
      },
    });
  }

  // Add to reports.service.ts
  async getSummaryReport(startDate: Date, endDate: Date) {
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    return this.getVisitSummaryReport(where, startDate, endDate);
  }

  async getAllVisits(options?: { limit?: number; page?: number }) {
    const limit = options?.limit || 20;
    const page = options?.page || 1;
    const skip = (page - 1) * limit;

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        include: {
          patient: true,
          dentist: true,
          procedures: { include: { procedure: true } },
          // payments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.visit.count(),
    ]);

    return {
      data: visits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getRevenueReport(
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'week' | 'month' = 'day',
  ) {
    // Revenue = active receipts (cash actually collected from patients),
    // expressed in base currency so multi-currency receipts collapse cleanly.
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // R-04 fix: also exclude VOIDED receipts (refund reversals are recorded
    // as separate ACTIVE receipts with negative amount — including them as
    // positive revenue double-counts the reversal). The previous code summed
    // all ACTIVE receipts, which incorrectly inflated revenue when refunds
    // existed. Filter on amount > 0 to ensure only money coming in is counted.
    const receipts = await this.prisma.receipt.findMany({
      where: {
        generatedAt: { gte: new Date(startDate), lte: end },
        status: 'ACTIVE' as any,
        // R-04: only positive-amount receipts count as revenue. Refund
        // receipts (negative amount) are excluded.
        amountReceived: { gt: 0 } as any,
      },
      select: {
        generatedAt: true,
        baseAmountReceived: true,
        amountReceived: true,
        metadata: true,
        notes: true,
      },
      orderBy: { generatedAt: 'asc' },
    });

    const toNum = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    const grouped = new Map<
      string,
      { date: string; revenue: number; count: number }
    >();
    const methodAgg = new Map<string, { total: number; count: number }>();
    let runningTotal = 0;

    for (const r of receipts) {
      const d = r.generatedAt;
      let key: string;
      if (groupBy === 'day') key = d.toISOString().split('T')[0];
      else if (groupBy === 'month')
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      else
        key = `Week ${Math.ceil(d.getDate() / 7)} ${d.toLocaleString('default', { month: 'short' })}`;

      const amount = toNum(r.baseAmountReceived ?? r.amountReceived);
      runningTotal += amount;

      const existing = grouped.get(key) ?? { date: key, revenue: 0, count: 0 };
      existing.revenue += amount;
      existing.count += 1;
      grouped.set(key, existing);

      const method =
        (r.metadata as any)?.method ??
        (() => {
          const m = (r.notes ?? '').match(/Payment Info:\s*(\{[\s\S]*\})/);
          if (!m) return 'UNKNOWN';
          try { return JSON.parse(m[1])?.method ?? 'UNKNOWN'; } catch { return 'UNKNOWN'; }
        })();
      const mb = methodAgg.get(method) ?? { total: 0, count: 0 };
      mb.total += amount;
      mb.count += 1;
      methodAgg.set(method, mb);
    }

    return {
      chart: Array.from(grouped.values()),
      total: runningTotal,
      count: receipts.length,
      byMethod: Array.from(methodAgg.entries())
        .map(([method, v]) => ({ method, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total),
    };
  }

  async getAppointmentReport(startDate: string, endDate: string) {
    const [byType, byStatus, byDentist, daily] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['type'],
        where: {
          scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: {
          scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        _count: true,
      }),
      this.prisma.appointment.groupBy({
        by: ['dentistId'],
        where: {
          scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        _count: true,
      }),
      this.prisma.appointment.findMany({
        where: {
          scheduledAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
        select: { scheduledAt: true, status: true },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const dentistIds = byDentist.map((d) => d.dentistId);
    const dentists = await this.prisma.staff.findMany({
      where: { id: { in: dentistIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const dentistMap = new Map(dentists.map((d) => [d.id, d]));

    return {
      byType: byType.map((t) => ({ type: t.type, count: t._count })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byDentist: byDentist.map((d) => ({
        dentistId: d.dentistId,
        dentist: dentistMap.get(d.dentistId),
        count: d._count,
      })),
      total: byStatus.reduce((s, b) => s + b._count, 0),
      noShowRate: byStatus.find((s) => s.status === 'NO_SHOW')?._count || 0,
    };
  }

  async getProcedureReport(startDate: string, endDate: string) {
    // R-05 fix: filter by the procedure's performedAt (when the clinical
    // work happened), not invoice.createdAt (when the invoice was generated).
    // The previous code put procedures in the wrong month's report whenever
    // the invoice was created in a later month (typical end-of-day batching).
    //
    // We can't directly filter invoice items by procedure.performedAt via
    // Prisma groupBy without joining, so we go to raw SQL for the join.
    const procedures = await this.prisma.$queryRaw<
      Array<{
        procedureId: string;
        description: string;
        count: bigint;
        total: any;
      }>
    >`
      SELECT
        iip."procedureId",
        iip.description,
        COUNT(*) as count,
        SUM(iip.total) as total
      FROM "invoice_items" iip
      JOIN "invoices" i ON i.id = iip."invoiceId"
      JOIN "visit_procedures" vp ON vp.id = iip."procedureId"
      WHERE iip.status = 'ACTIVE'
        AND vp."performedAt" BETWEEN ${new Date(startDate)} AND ${new Date(endDate)}
        AND i.status <> 'VOID'
        AND vp."procedureId" IS NOT NULL
      GROUP BY iip."procedureId", iip.description
      ORDER BY count DESC
      LIMIT 20
    `;

    return procedures.map((p) => ({
      procedureId: p.procedureId,
      description: p.description,
      count: Number(p.count),
      revenue:
        (p.total as any)?.toNumber?.() ??
        (typeof p.total === 'string' ? Number(p.total) : p.total) ??
        0,
    }));
  }

  async getPatientRetentionReport() {
    const now = new Date();
    const threeMonths = new Date(now);
    threeMonths.setMonth(now.getMonth() - 3);
    const sixMonths = new Date(now);
    sixMonths.setMonth(now.getMonth() - 6);

    // R-01 fix: use raw SQL with proper HAVING COUNT(*) > 1. The previous
    // Prisma groupBy.having syntax returned all patients with any completed
    // appointment, not patients with >1 (returning patients). Prisma's
    // groupBy.having doesn't reliably express `_count > N` across versions,
    // so we go to raw SQL where the semantics are unambiguous.
    const returning3m = await this.prisma.$queryRaw<Array<{ patientId: string; count: bigint }>>`
      SELECT "patientId", COUNT(*) as count
      FROM "appointments"
      WHERE "scheduledAt" >= ${threeMonths} AND status = 'COMPLETED'
      GROUP BY "patientId"
      HAVING COUNT(*) > 1
    `;
    const returning6m = await this.prisma.$queryRaw<Array<{ patientId: string; count: bigint }>>`
      SELECT "patientId", COUNT(*) as count
      FROM "appointments"
      WHERE "scheduledAt" >= ${sixMonths} AND status = 'COMPLETED'
      GROUP BY "patientId"
      HAVING COUNT(*) > 1
    `;

    const [newPatients, total] = await Promise.all([
      this.prisma.patient.count({
        where: { registeredAt: { gte: threeMonths } },
      }),
      this.prisma.patient.count({ where: { isActive: true } }),
    ]);

    return {
      totalPatients: total,
      newLast3Months: newPatients,
      returningLast3Months: returning3m.length,
      returningLast6Months: returning6m.length,
      retentionRate3m:
        total > 0 ? Math.round((returning3m.length / total) * 100) : 0,
    };
  }

  async getDentistPerformance(startDate: string, endDate: string) {
    const dentists = await this.prisma.staff.findMany({
      where: { user: { role: { in: ['DENTIST', 'HYGIENIST', 'NURSE'] as any } }, isAvailable: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
      },
    });

    // R-03 fix: filter revenue by visit.completedAt (when the work was done),
    // not visit.createdAt (when the row was inserted). Otherwise prior-period
    // work gets credited to the current period.
    // R-18 fix: use a single aggregate query (instead of N+1 per-dentist
    // queries) for revenue totals. This reduces queries from O(N*3) to O(1)
    // for the revenue dimension.
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Aggregate revenue per dentist in one query
    const revenueAgg = await this.prisma.invoice.groupBy({
      by: ['visitId'],
      where: {
        status: InvoiceStatus.POSTED,
        paymentStatus: 'PAID',
        visit: {
          dentistId: { in: dentists.map((d) => d.id) },
          completedAt: { gte: start, lte: end },
        },
      },
      _sum: { baseTotal: true },
    });

    // Build dentistId → revenue map by joining visits
    const visitIds = revenueAgg.map((r) => r.visitId).filter(Boolean) as string[];
    const visits = visitIds.length
      ? await this.prisma.visit.findMany({
          where: { id: { in: visitIds } },
          select: { id: true, dentistId: true },
        })
      : [];
    const visitDentist = new Map(visits.map((v) => [v.id, v.dentistId]));
    const revenueByDentist = new Map<string, number>();
    for (const r of revenueAgg) {
      if (!r.visitId) continue;
      const did = visitDentist.get(r.visitId);
      if (!did) continue;
      const prev = revenueByDentist.get(did) ?? 0;
      revenueByDentist.set(did, prev + Number(r._sum.baseTotal ?? 0));
    }

    // Appointment + completion counts still need per-dentist (no good
    // groupBy for "count of completed by dentist" in a single call), but
    // Promise.all keeps it parallel.
    const results = await Promise.all(
      dentists.map(async (dentist) => {
        const [appointments, completed] = await Promise.all([
          this.prisma.appointment.count({
            where: {
              dentistId: dentist.id,
              scheduledAt: { gte: start, lte: end },
            },
          }),
          this.prisma.appointment.count({
            where: {
              dentistId: dentist.id,
              status: 'COMPLETED',
              scheduledAt: { gte: start, lte: end },
            },
          }),
        ]);
        return {
          ...dentist,
          appointments,
          completed,
          completionRate:
            appointments > 0 ? Math.round((completed / appointments) * 100) : 0,
          revenue: revenueByDentist.get(dentist.id) ?? 0,
        };
      }),
    );

    return results.sort((a, b) => b.revenue - a.revenue);
  }

  async getInventoryReport(locationId?: string) {
    const [totalItems, lowStockItems, totalValue, recentTransactions] =
      await Promise.all([
        this.prisma.inventoryItem.count({ where: { isActive: true } }),

        this.prisma.inventoryItem
          .findMany({
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              itemCode: true,
              minQuantity: true,
              unit: true,
              unitCost: true,
              category: { select: { name: true } },
              locationStocks: locationId
                ? { where: { locationId }, select: { quantity: true } }
                : { select: { quantity: true } },
            },
          })
          .then((items) =>
            items
              .map((i) => {
                const totalQty = i.locationStocks.reduce(
                  (sum, stock) => sum + stock.quantity,
                  0,
                );
                return { ...i, totalQuantity: totalQty };
              })
              .filter((i) => i.totalQuantity <= (i.minQuantity ?? 0))
              .map(({ locationStocks, ...rest }) => ({
                ...rest,
                currentStock: (rest as any).totalQuantity,
              })),
          ),

        this.prisma.inventoryItem
          .findMany({
            where: { isActive: true },
            select: {
              unitCost: true,
              locationStocks: { select: { quantity: true } },
            },
          })
          .then((items) =>
            items.reduce((total, item) => {
              const itemQty = item.locationStocks.reduce(
                (sum, stock) => sum + stock.quantity,
                0,
              );
              return total + itemQty * toNum(item.unitCost);
            }, 0),
          ),

        this.prisma.inventoryLedger.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            type: {
              in: [
                'PURCHASE_RECEIPT',
                'USAGE',
                'SALE',
                'ADJUSTMENT_IN',
                'ADJUSTMENT_OUT',
                'WASTE',
                'RETURN_IN',
                'TRANSFER_IN',
                'TRANSFER_OUT',
              ] as const,
            },
          },
          include: {
            item: {
              select: {
                id: true,
                name: true,
                itemCode: true,
                unit: true,
                uom: true,
              },
            },
            location: { select: { id: true, name: true, type: true } },
            batch: {
              select: { id: true, batchNumber: true, expiryDate: true },
            },
            performedBy: { select: { id: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const formattedTransactions = recentTransactions.map((tx) => ({
      id: tx.id,
      ledgerCode: tx.ledgerCode,
      itemName: tx.item.name,
      itemCode: tx.item.itemCode,
      locationName: tx.location.name,
      type: tx.type,
      quantityChange: tx.quantityChange,
      unitCost: tx.unitCost,
      totalValue: tx.totalValue,
      referenceType: tx.referenceType,
      referenceId: tx.referenceId,
      notes: tx.notes,
      createdAt: tx.createdAt,
      performedBy: tx.performedBy?.email,
      batchNumber: tx.batch?.batchNumber,
      expiryDate: tx.batch?.expiryDate,
    }));

    return {
      totalItems,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      totalValue,
      recentTransactions: formattedTransactions,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // VISIT REPORTS
  // ═════════════════════════════════════════════════════════════════════════════

  async getVisitReports(query: VisitReportQueryDto) {
    const { startDate, endDate } = this.calculateDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const baseWhere = this.buildReportWhereClause(query, startDate, endDate);

    switch (query.type) {
      case ReportType.SUMMARY:
        return this.getVisitSummaryReport(baseWhere, startDate, endDate);
      case ReportType.FINANCIAL:
        return this.getVisitFinancialReport(baseWhere, startDate, endDate);
      case ReportType.CLINICAL:
        return this.getVisitClinicalReport(baseWhere, startDate, endDate);
      case ReportType.PATIENT:
        return this.getVisitPatientReport(
          baseWhere,
          startDate,
          endDate,
          query.patientId,
        );
      case ReportType.DENTIST:
        return this.getVisitDentistReport(
          baseWhere,
          startDate,
          endDate,
          query.dentistId,
        );
      case ReportType.PROCEDURE:
        return this.getVisitProcedureReport(baseWhere, startDate, endDate);
      case ReportType.DETAILED:
        return this.getVisitDetailedReport(baseWhere, startDate, endDate, query);
      default:
        return this.getVisitSummaryReport(baseWhere, startDate, endDate);
    }
  }

  async exportReportToCSV(query: ExportReportDto): Promise<string> {
    const reportData = await this.getVisitReports({
      ...query,
      type: query.type,
      period: ReportPeriod.CUSTOM,
      startDate: query.startDate,
      endDate: query.endDate,
      dentistId: query.dentistId,
      patientId: query.patientId,
      limit: 1000,
    } as VisitReportQueryDto);

    let csvData: any[] = [];

    // Type guard to check which report type we have
    if (query.type === ReportType.DETAILED && 'data' in reportData) {
      csvData = (reportData as any).data.map((visit: any) => ({
        'Visit Code': visit.visitCode,
        Patient: `${visit.patient.firstName} ${visit.patient.lastName}`,
        Dentist: `${visit.dentist.firstName} ${visit.dentist.lastName}`,
        Date: visit.createdAt.toISOString(),
        Status: visit.status,
        'Total Cost': visit.totalCost,
        'Amount Paid': visit.amountPaid,
        Balance: visit.totalCost - visit.amountPaid,
        Procedures: visit.procedures?.map((p: any) => p.procedure.name).join('; ') || '',
      }));
    } else if (query.type === ReportType.FINANCIAL && 'outstandingInvoices' in reportData) {
      csvData = (reportData as any).outstandingInvoices.map((inv: any) => ({
        'Visit Code': inv.visitCode,
        Patient: `${inv.patient.firstName} ${inv.patient.lastName}`,
        Dentist: `${inv.dentist.firstName} ${inv.dentist.lastName}`,
        Total: inv.totalCost,
        Paid: inv.amountPaid,
        Balance: inv.totalCost - inv.amountPaid,
        Date: inv.createdAt.toISOString(),
      }));
    } else if ('summary' in reportData) {
      csvData = [(reportData as any).summary];
    }

    if (csvData.length === 0) return '';

    const headers = Object.keys(csvData[0]);
    const csvRows = [
      headers.join(','),
      ...csvData.map((row) =>
        headers.map((header) => JSON.stringify(row[header] || '')).join(','),
      ),
    ];

    return csvRows.join('\n');
  }

  // ─── Private helpers for visit reports ─────────────────────────────────────

  private calculateDateRange(
    period: ReportPeriod,
    customStart?: string,
    customEnd?: string,
  ): { startDate: Date; endDate: Date } {
    const start = new Date();
    const end = new Date();

    if (period === ReportPeriod.CUSTOM && customStart && customEnd) {
      return {
        startDate: new Date(customStart),
        endDate: new Date(customEnd),
      };
    }

    switch (period) {
      case ReportPeriod.TODAY:
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case ReportPeriod.YESTERDAY:
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case ReportPeriod.THIS_WEEK: {
        const day = start.getDay();
        start.setDate(start.getDate() - day);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case ReportPeriod.LAST_WEEK:
        start.setDate(start.getDate() - start.getDay() - 7);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case ReportPeriod.THIS_MONTH:
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case ReportPeriod.LAST_MONTH:
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth());
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
    }

    return { startDate: start, endDate: end };
  }

  private buildReportWhereClause(
    query: VisitReportQueryDto,
    startDate: Date,
    endDate: Date,
  ): any {
    const where: any = {};

    where.createdAt = {
      gte: startDate,
      lte: endDate,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.patientId) {
      where.patientId = query.patientId;
    }

    if (query.dentistId) {
      where.dentistId = query.dentistId;
    }

    if (query.procedureId) {
      where.procedures = {
        some: {
          procedureId: query.procedureId,
        },
      };
    }

    return where;
  }

  private async getVisitSummaryReport(
    where: any,
    startDate: Date,
    endDate: Date,
  ) {
    const [visits, completedVisits, cancelledVisits, totalRevenue] =
      await Promise.all([
        this.prisma.visit.count({ where }),
        this.prisma.visit.count({
          where: { ...where, status: VisitStatus.COMPLETED },
        }),
        this.prisma.visit.count({
          where: { ...where, status: VisitStatus.CANCELLED },
        }),
        this.prisma.visit.aggregate({
          where: { ...where, status: VisitStatus.COMPLETED },
          _sum: { totalCost: true, amountPaid: true },
        }),
      ]);

    const dailyTrends = await this.prisma.$queryRaw`
          SELECT
            DATE_TRUNC('day', "createdAt") as date,
            COUNT(*) as total_visits,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_visits,
            SUM("totalCost") as revenue
          FROM "visits"
          WHERE "createdAt" BETWEEN ${startDate} AND ${endDate}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date ASC
        `;

        const topProcedures = await this.prisma.$queryRaw`
          SELECT
            p.name as procedure_name,
            COUNT(*) as count,
            SUM(vp.cost) as total_revenue
          FROM "visit_procedures" vp
          JOIN "procedures" p ON p.id = vp."procedureId"
          JOIN "visits" v ON v.id = vp."visitId"
          WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
          GROUP BY p.id, p.name
          ORDER BY total_revenue DESC
          LIMIT 10
        `;

    return {
      period: { startDate, endDate },
      summary: {
        totalVisits: visits,
        completedVisits,
        cancelledVisits,
        completionRate:
          visits > 0 ? ((completedVisits / visits) * 100).toFixed(1) : 0,
        totalRevenue: toNum(totalRevenue._sum.totalCost),
        totalCollected: toNum(totalRevenue._sum.amountPaid),
        outstandingBalance:
          toNum(totalRevenue._sum.totalCost) -
          toNum(totalRevenue._sum.amountPaid),
        collectionRate:
          toNum(totalRevenue._sum.totalCost) > 0
            ? (
              (toNum(totalRevenue._sum.amountPaid) /
                toNum(totalRevenue._sum.totalCost)) *
              100
            ).toFixed(1)
            : 0,
      },
      dailyTrends,
      topProcedures,
    };
  }

  private async getVisitFinancialReport(
    where: any,
    startDate: Date,
    endDate: Date,
  ) {
    const [
      revenueByPaymentMethod,
      revenueByProcedureCategory,
      outstandingInvoices,
    ] = await Promise.all([
      // Payment method breakdown via Visit → Invoice → Receipt.
      // (Legacy "VisitPayment" table never existed in this schema.)
      this.prisma.$queryRaw<Array<{ payment_method: string; total_amount: any; payment_count: bigint }>>`
        SELECT
          COALESCE(r."paymentMethod"::text, 'UNKNOWN') as payment_method,
          SUM(r."baseAmountReceived") as total_amount,
          COUNT(*) as payment_count
        FROM "receipts" r
        JOIN "invoices" i ON i.id = r."invoiceId"
        JOIN "visits" v ON v.id = i."visitId"
        WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
          AND r.status = 'ACTIVE'
          AND i.status <> 'VOID'
        GROUP BY r."paymentMethod"
      `,
      this.prisma.$queryRaw`
        SELECT
          pc.name as category_name,
          COUNT(DISTINCT vp.id) as procedure_count,
          SUM(vp.cost) as total_revenue
        FROM "visit_procedures" vp
        JOIN "procedures" p ON p.id = vp."procedureId"
        JOIN "procedure_categories" pc ON pc.id = p."categoryId"
        JOIN "visits" v ON v.id = vp."visitId"
        WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
        GROUP BY pc.id, pc.name
        ORDER BY total_revenue DESC
      `,
      this.prisma.visit.findMany({
        where: {
          ...where,
          status: VisitStatus.COMPLETED,
          amountPaid: { lt: this.prisma.visit.fields.totalCost },
        },
        select: {
          id: true,
          visitCode: true,
          totalCost: true,
          amountPaid: true,
          patient: { select: { firstName: true, lastName: true } },
          dentist: { select: { firstName: true, lastName: true } },
          createdAt: true,
        },
        take: 20,
      }),
    ]);

    const revenueTrends = await this.prisma.$queryRaw`
      SELECT
        DATE_TRUNC('day', v."createdAt") as date,
        SUM(r."baseAmountReceived") as daily_revenue,
        COUNT(DISTINCT r.id) as payment_count
      FROM "receipts" r
      JOIN "invoices" i ON i.id = r."invoiceId"
      JOIN "visits" v ON v.id = i."visitId"
      WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND r.status = 'ACTIVE'
        AND i.status <> 'VOID'
      GROUP BY DATE_TRUNC('day', v."createdAt")
      ORDER BY date ASC
    `;

    return {
      period: { startDate, endDate },
      revenueByPaymentMethod,
      revenueByProcedureCategory,
      outstandingInvoices: outstandingInvoices.map((inv: any) => ({
        ...inv,
        balance: toNum(inv.totalCost) - toNum(inv.amountPaid),
      })),
      revenueTrends,
      summary: {
        totalOutstanding: outstandingInvoices.reduce(
          (sum, inv) => sum + (toNum(inv.totalCost) - toNum(inv.amountPaid)),
          0,
        ),
        accountsReceivableAging: await this.getAgingReport(),
      },
    };
  }

  private async getVisitClinicalReport(
    where: any,
    startDate: Date,
    endDate: Date,
  ) {
    const [commonDiagnoses, procedureStats, prescriptionStats] =
      await Promise.all([
        this.prisma.$queryRaw`
          SELECT 
            unnest("diagnosis") as diagnosis,
            COUNT(*) as frequency
          FROM "visits"
          WHERE "createdAt" BETWEEN ${startDate} AND ${endDate}
            AND array_length("diagnosis", 1) > 0
          GROUP BY diagnosis
          ORDER BY frequency DESC
          LIMIT 15
        `,
        this.prisma.$queryRaw`
          SELECT 
            p.name as procedure_name,
            COUNT(*) as times_performed,
            AVG(vp.cost) as avg_cost,
            MIN(vp.cost) as min_cost,
            MAX(vp.cost) as max_cost
          FROM "visit_procedures" vp
          JOIN "procedures" p ON p.id = vp."procedureId"
          JOIN "visits" v ON v.id = vp."visitId"
          WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
          GROUP BY p.id, p.name
          ORDER BY times_performed DESC
          LIMIT 20
        `,
        this.prisma.$queryRaw`
          SELECT 
            COUNT(*) as total_prescriptions,
            AVG((SELECT COUNT(*) FROM "prescription_items" pi WHERE pi."prescriptionId" = p.id)) as avg_items_per_rx,
            COUNT(DISTINCT d.id) as unique_drugs_used
          FROM "prescriptions" p
          JOIN "visits" v ON v.id = p."visitId"
          LEFT JOIN "prescription_items" pi ON pi."prescriptionId" = p.id
          LEFT JOIN "drugs" d ON d.id = pi."drugId"
          WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
        `,
      ]);

    return {
      period: { startDate, endDate },
      diagnosticInsights: commonDiagnoses,
      procedureAnalytics: procedureStats,
      prescriptionAnalytics: prescriptionStats,
      clinicalMetrics: {
        averageProceduresPerVisit: await this.getAverageProceduresPerVisit(where),
        averagePrescriptionsPerVisit:
          await this.getAveragePrescriptionsPerVisit(where),
        soaps: await this.getSOAPMetrics(where),
      },
    };
  }

  private async getVisitPatientReport(
    where: any,
    startDate: Date,
    endDate: Date,
    patientId?: string,
  ) {
    const patientWhere = patientId ? { ...where, patientId } : where;

    const [patientVisits, patientSummary] = await Promise.all([
      this.prisma.visit.findMany({
        where: patientWhere,
        include: {
          patient: true,
          dentist: { select: { firstName: true, lastName: true } },
          procedures: { include: { procedure: true } },
          // payments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.visit.aggregate({
        where: patientWhere,
        _count: true,
        _sum: { totalCost: true, amountPaid: true },
        _avg: { totalCost: true },
      }),
    ]);

    const patientMap = new Map();
    for (const visit of patientVisits) {
      const patientIdKey = visit.patient.id;
      if (!patientMap.has(patientIdKey)) {
        patientMap.set(patientIdKey, {
          patient: visit.patient,
          totalVisits: 0,
          totalCost: 0,
          totalPaid: 0,
          visits: [],
          lastVisit: null,
        });
      }
      const patientData = patientMap.get(patientIdKey);
      patientData.totalVisits++;
      patientData.totalCost += visit.totalCost;
      patientData.totalPaid += visit.amountPaid;
      patientData.visits.push(visit);
      if (!patientData.lastVisit || visit.createdAt > patientData.lastVisit) {
        patientData.lastVisit = visit.createdAt;
      }
    }

    return {
      period: { startDate, endDate },
      patients: Array.from(patientMap.values()),
      summary: patientSummary,
      topPatients: Array.from(patientMap.values())
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10),
    };
  }

  private async getVisitDentistReport(
    where: any,
    startDate: Date,
    endDate: Date,
    dentistId?: string,
  ) {
    const dentistStats = await this.prisma.$queryRaw<Array<any>>`
      SELECT 
        s.id as dentist_id,
        s."firstName",
        s."lastName",
        s.specialization,
        COUNT(DISTINCT v.id) as total_visits,
        COUNT(DISTINCT CASE WHEN v.status = 'COMPLETED' THEN v.id END) as completed_visits,
        SUM(v."totalCost") as total_revenue,
        SUM(v."amountPaid") as amount_collected,
        AVG(v."totalCost") as avg_revenue_per_visit,
        COUNT(DISTINCT vp.id) as procedures_performed,
        COUNT(DISTINCT p.id) as prescriptions_written
      FROM "staff" s
      LEFT JOIN "visits" v ON v."dentistId" = s.id AND v."createdAt" BETWEEN ${startDate} AND ${endDate}
      LEFT JOIN "visit_procedures" vp ON vp."visitId" = v.id
      LEFT JOIN "prescriptions" p ON p."visitId" = v.id
      ${dentistId ? 'WHERE s.id = ' + dentistId : ''}
      GROUP BY s.id, s."firstName", s."lastName", s.specialization
      ORDER BY total_revenue DESC
    `;

    const dentistTrends = await this.prisma.$queryRaw`
      SELECT 
        s.id as dentist_id,
        s."firstName",
        s."lastName",
        DATE_TRUNC('month', v."createdAt") as month,
        COUNT(*) as visits,
        SUM(v."totalCost") as revenue
      FROM "staff" s
      JOIN "visits" v ON v."dentistId" = s.id
      WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
      GROUP BY s.id, s."firstName", s."lastName", DATE_TRUNC('month', v."createdAt")
      ORDER BY dentist_id, month ASC
    `;

    const avgRevenuePerDentist = dentistStats && dentistStats.length > 0
      ? dentistStats.reduce((sum: number, d: any) => sum + (Number(d.total_revenue) || 0), 0) / dentistStats.length
      : 0;

    return {
      period: { startDate, endDate },
      dentistPerformance: dentistStats,
      dentistTrends,
      summary: {
        totalDentists: await this.prisma.staff.count({
          where: { specialization: { not: null } },
        }),
        averageRevenuePerDentist: avgRevenuePerDentist,
      },
    };
  }

  private async getVisitProcedureReport(
    where: any,
    startDate: Date,
    endDate: Date,
  ) {
    const procedureStats = await this.prisma.$queryRaw<Array<any>>`
      SELECT 
        p.id as procedure_id,
        p.name as procedure_name,
        pc.name as category_name,
        COUNT(*) as times_performed,
        SUM(vp.cost) as total_revenue,
        AVG(vp.cost) as avg_cost,
        MIN(vp.cost) as min_cost,
        MAX(vp.cost) as max_cost,
        COUNT(DISTINCT v.id) as unique_visits,
        COUNT(DISTINCT v."patientId") as unique_patients
      FROM "visit_procedures" vp
      JOIN "procedures" p ON p.id = vp."procedureId"
      LEFT JOIN "procedure_categories" pc ON pc.id = p."categoryId"
      JOIN "visits" v ON v.id = vp."visitId"
      WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
      GROUP BY p.id, p.name, pc.name
      ORDER BY total_revenue DESC
    `;

    const procedureTrends = await this.prisma.$queryRaw`
      SELECT 
        p.name as procedure_name,
        DATE_TRUNC('month', v."createdAt") as month,
        COUNT(*) as count,
        SUM(vp.cost) as revenue
      FROM "visit_procedures" vp
      JOIN "procedures" p ON p.id = vp."procedureId"
      JOIN "visits" v ON v.id = vp."visitId"
      WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
      GROUP BY p.id, p.name, DATE_TRUNC('month', v."createdAt")
      ORDER BY procedure_name, month ASC
    `;

    const commonTeeth = await this.prisma.$queryRaw`
      SELECT 
        unnest("toothNumbers") as tooth_number,
        COUNT(*) as treatment_count,
        COUNT(DISTINCT v.id) as visit_count
      FROM "visit_procedures" vp
      JOIN "visits" v ON v.id = vp."visitId"
      WHERE v."createdAt" BETWEEN ${startDate} AND ${endDate}
        AND array_length("toothNumbers", 1) > 0
      GROUP BY tooth_number
      ORDER BY treatment_count DESC
      LIMIT 32
    `;

    const totalProcedures = procedureStats && procedureStats.length > 0
      ? procedureStats.reduce((sum: number, p: any) => sum + (Number(p.times_performed) || 0), 0)
      : 0;

    const totalRevenue = procedureStats && procedureStats.length > 0
      ? procedureStats.reduce((sum: number, p: any) => sum + (Number(p.total_revenue) || 0), 0)
      : 0;

    const mostPerformedProcedure = procedureStats && procedureStats.length > 0 ? procedureStats[0] : null;
    const highestRevenueProcedure = procedureStats && procedureStats.length > 0
      ? [...procedureStats].sort((a: any, b: any) => (Number(b.total_revenue) || 0) - (Number(a.total_revenue) || 0))[0]
      : null;

    return {
      period: { startDate, endDate },
      procedurePerformance: procedureStats,
      procedureTrends,
      commonTeeth,
      summary: {
        totalProcedures,
        totalRevenue,
        mostPerformedProcedure,
        highestRevenueProcedure,
      },
    };
  }

  private async getVisitDetailedReport(
    where: any,
    startDate: Date,
    endDate: Date,
    query: VisitReportQueryDto,
  ) {
    const skip = ((query.page || 1) - 1) * (query.limit || 20);
    const take = query.limit || 20;

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        include: {
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
          dentist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
          appointment: {
            select: {
              scheduledAt: true,
              type: true,
            },
          },
          procedures: {
            include: { procedure: true },
          },
          procedureSessions: {
            where: { deletedAt: null },
            include: {
              treatmentProcedure: {
                include: {
                  procedure: true,
                  targets: true,
                },
              },
            },
          },
          prescriptions: {
            include: {
              items: { include: { drug: true } },
            },
          },
          // payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.visit.count({ where }),
    ]);

    // After fetching visits, build a map of treatmentProcedureId -> completed session count
    const treatmentCompletedSessionsMap = new Map<string, number>();
    for (const visit of visits) {
      for (const session of visit.procedureSessions) {
        const tpId = session.treatmentProcedureId;
        if (tpId && session.status === 'COMPLETED') {
          treatmentCompletedSessionsMap.set(tpId, (treatmentCompletedSessionsMap.get(tpId) || 0) + 1);
        }
      }
    }

    // Then in the data transformation:

    const transformed = visits.map(visit => ({
      ...visit,
      treatmentProcedures: visit.procedureSessions
        .map(ps => ps.treatmentProcedure)
        .filter((tp, index, self) => tp && self.findIndex(t => t.id === tp.id) === index) // unique
        .map(tp => ({
          id: tp.id,
          name: tp.procedure.name,
          code: tp.procedure.code,
          status: tp.status,
          totalPrice: Number(tp.totalPrice),
          sessionCount: tp.sessionCount,
          completedSessions: treatmentCompletedSessionsMap.get(tp.id) || 0,

          targets: tp.targets?.map(t => ({
            toothNumber: t.toothNumber ?? undefined,
            surfaces: t.surfaces as string[]
          })) || [],

          // targets: tp.targets?.map(t => ({ toothNumber: t.toothNumber, surfaces: t.surfaces })) || [],
        })),
    }));


    // return {
    //   period: { startDate, endDate },
    //   data: transformed,
    //   pagination: {
    //     page: query.page || 1,
    //     limit: query.limit || 20,
    //     total,
    //     totalPages: Math.ceil(total / (query.limit || 20)),
    //   },
    //   summary: {
    //     totalVisits: total,
    //     totalRevenue: visits.reduce((sum, v) => sum + v.totalCost, 0),
    //     totalCollected: visits.reduce((sum, v) => sum + v.amountPaid, 0),
    //     averageRevenuePerVisit:
    //       total > 0
    //         ? visits.reduce((sum, v) => sum + v.totalCost, 0) / total
    //         : 0,
    //   },
    // };

    // Inside getVisitDetailedReport(), replace the return block:

    return {
      period: { startDate, endDate },
      data: transformed,  // ← CHANGE THIS from 'visits' to 'transformed'
      pagination: {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        totalPages: Math.ceil(total / (query.limit || 20)),
      },
      summary: {
        totalVisits: total,
        totalRevenue: transformed.reduce((sum, v) => sum + toNum(v.totalCost), 0),
        totalCollected: transformed.reduce((sum, v) => sum + toNum(v.amountPaid), 0),
        averageRevenuePerVisit:
          total > 0
            ? transformed.reduce((sum, v) => sum + toNum(v.totalCost), 0) / total
            : 0,
      },
    };

  }

  private async getAverageProceduresPerVisit(where: any): Promise<number> {
    const result = (await this.prisma.$queryRaw`
      SELECT AVG(procedure_count) as avg_procedures
      FROM (
        SELECT v.id, COUNT(vp.id) as procedure_count
        FROM "visits" v
        LEFT JOIN "visit_procedures" vp ON vp."visitId" = v.id
        WHERE v."createdAt" BETWEEN ${where.createdAt.gte} AND ${where.createdAt.lte}
        GROUP BY v.id
      ) sub
    `) as any;
    return Number(result[0]?.avg_procedures) || 0;
  }

  private async getAveragePrescriptionsPerVisit(where: any): Promise<number> {
    const result = (await this.prisma.$queryRaw`
      SELECT AVG(prescription_count) as avg_prescriptions
      FROM (
        SELECT v.id, COUNT(p.id) as prescription_count
        FROM "visits" v
        LEFT JOIN "prescriptions" p ON p."visitId" = v.id
        WHERE v."createdAt" BETWEEN ${where.createdAt.gte} AND ${where.createdAt.lte}
        GROUP BY v.id
      ) sub
    `) as any;
    return Number(result[0]?.avg_prescriptions) || 0;
  }

  private async getSOAPMetrics(where: any) {
    const result = (await this.prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_visits,
        SUM(CASE WHEN "subjective" IS NOT NULL AND "subjective" != '' THEN 1 ELSE 0 END) as has_subjective,
        SUM(CASE WHEN "objective" IS NOT NULL AND "objective" != '' THEN 1 ELSE 0 END) as has_objective,
        SUM(CASE WHEN "assessment" IS NOT NULL AND "assessment" != '' THEN 1 ELSE 0 END) as has_assessment,
        SUM(CASE WHEN "plan" IS NOT NULL AND "plan" != '' THEN 1 ELSE 0 END) as has_plan
      FROM "visits"
      WHERE "createdAt" BETWEEN ${where.createdAt.gte} AND ${where.createdAt.lte}
    `) as any;

    const total = result[0]?.total_visits || 1;
    return {
      completionRate: {
        subjective: (
          ((result[0]?.has_subjective || 0) / total) *
          100
        ).toFixed(1),
        objective: (
          ((result[0]?.has_objective || 0) / total) *
          100
        ).toFixed(1),
        assessment: (
          ((result[0]?.has_assessment || 0) / total) *
          100
        ).toFixed(1),
        plan: (((result[0]?.has_plan || 0) / total) * 100).toFixed(1),
        fullSOAP: (
          ((result[0]?.has_subjective &&
            result[0]?.has_objective &&
            result[0]?.has_assessment &&
            result[0]?.has_plan
            ? result[0]?.total_visits
            : 0) /
            total) *
          100
        ).toFixed(1),
      },
    };
  }

  private async getAgingReport() {
    const now = new Date();
    const agingBuckets = [
      { name: '0-30 days', days: 30, count: 0, amount: 0 },
      { name: '31-60 days', days: 60, count: 0, amount: 0 },
      { name: '61-90 days', days: 90, count: 0, amount: 0 },
      { name: '90+ days', days: Infinity, count: 0, amount: 0 },
    ];

    const unpaidVisits = await this.prisma.visit.findMany({
      where: {
        status: VisitStatus.COMPLETED,
        amountPaid: { lt: this.prisma.visit.fields.totalCost },
      },
      select: {
        totalCost: true,
        amountPaid: true,
        completedAt: true,
      },
    });

    for (const visit of unpaidVisits) {
      const balance = toNum(visit.totalCost) - toNum(visit.amountPaid);
      const daysOld = Math.floor(
        (now.getTime() - (visit.completedAt || now).getTime()) /
        (1000 * 60 * 60 * 24),
      );

      for (const bucket of agingBuckets) {
        if (daysOld <= bucket.days) {
          bucket.count++;
          bucket.amount += balance;
          break;
        }
      }
    }

    return agingBuckets;
  }


  // Add to ReportsService class

  // Patient Visits Report
async getPatientVisitsReport(query: VisitReportQueryDto): Promise<PatientVisitsReport> {

    const { startDate, endDate } = this.calculateDateRange(
      query.period,
      query.startDate,
      query.endDate,
    );

    const where = this.buildReportWhereClause(query, startDate, endDate);

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    // 1. Total count (for pagination)
    const totalVisits = await this.prisma.visit.count({ where });

    // 2. Fetch paginated visits with all needed relations
    const visits = await this.prisma.visit.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        dentist: { select: { id: true, firstName: true, lastName: true, specialization: true } },
        procedures: { include: { procedure: true } },
        procedureSessions: {
          where: { deletedAt: null },
          include: {
            treatmentProcedure: {
              include: {
                procedure: true,
                targets: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // 3. Build a map of treatmentProcedureId -> completed session count
    const treatmentCompletedSessionsMap = new Map<string, number>();
    for (const visit of visits) {
      for (const session of visit.procedureSessions) {
        const tpId = session.treatmentProcedureId;
        if (tpId && session.status === 'COMPLETED') {
          treatmentCompletedSessionsMap.set(tpId, (treatmentCompletedSessionsMap.get(tpId) || 0) + 1);
        }
      }
    }

    // 4. Build summary (byStatus, totalRevenue, totalCollected, etc.)
    const allVisitsForSummary = await this.prisma.visit.findMany({
      where,
      select: { status: true, totalCost: true, amountPaid: true, procedures: { select: { id: true } } },
    });

    const byStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let totalCollected = 0;
    let totalProcedures = 0;

    for (const v of allVisitsForSummary) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      totalRevenue += toNum(v.totalCost);
      totalCollected += toNum(v.amountPaid);
      totalProcedures += v.procedures.length;
    }

    const avgProceduresPerVisit = totalVisits > 0 ? (totalProcedures / totalVisits).toFixed(1) : '0';

    const data = visits.map(visit => {
      // Build unique treatment procedures array
      const treatmentProcedures = visit.procedureSessions
        .map(ps => ps.treatmentProcedure)
        .filter((tp, index, self) => tp && self.findIndex(t => t.id === tp.id) === index)
        .map(tp => ({
          id: tp.id,
          name: tp.procedure.name,
          code: tp.procedure.code ?? undefined,
          status: tp.status,
          totalPrice: Number(tp.subtotalPrice),
          sessionCount: tp.sessionCount,
          completedSessions: treatmentCompletedSessionsMap.get(tp.id) || 0,
          targets: tp.targets?.map(t => ({
            toothNumber: t.toothNumber ?? undefined,
            surfaces: t.surfaces as string[]
          })) || [],
        }));

        const totalCostFromProcedures = treatmentProcedures.reduce((sum, tp) => sum + tp.totalPrice, 0);

        // ── 2. Build procedure sessions array (directly linked to this visit via visitId) ──
  const procedureSessions = visit.procedureSessions
    .filter(ps => ps.visitId === visit.id) // Only sessions explicitly linked to this visit
    .map(ps => ({
      sessionId: ps.id,
      sessionNumber: ps.sessionNumber,
      sessionLabel: ps.sessionLabel ?? undefined,
      status: ps.status,
      performedDate: ps.performedDate?.toISOString() ?? undefined,
      performedNotes: ps.performedNotes ?? undefined,
      surfaces: ps.surfaces as string[] ?? [],
      phase: ps.phase ?? undefined,
      outcome: ps.outcome ?? undefined,
      isFinal: ps.isFinal,
      startedAt: ps.startedAt?.toISOString() ?? undefined,
      endedAt: ps.endedAt?.toISOString() ?? undefined,
      
      // 💰 Pricing: session-level price if set, else fallback to parent treatmentProcedure
      sessionPrice: ps.sessionPrice ? Number(ps.sessionPrice) : undefined,
      sessionCost: ps.sessionCost ? Number(ps.sessionCost) : undefined,
      
      // 🔗 Parent treatment procedure context
      treatmentProcedureId: ps.treatmentProcedureId,
      treatmentProcedureName: ps.treatmentProcedure?.procedure.name,
      treatmentProcedureCode: ps.treatmentProcedure?.procedure.code ?? undefined,
    }));


      return {
        visitId: visit.id,
        visitCode: visit.visitCode,
        patientId: visit.patient.id,
        patientCode: visit.patient.patientCode,
        patientName: `${visit.patient.firstName} ${visit.patient.lastName}`,
        patientPhone: visit.patient.phone ?? undefined,
        dentistId: visit.dentist.id,
        dentistName: `${visit.dentist.firstName} ${visit.dentist.lastName}`,
        dentistSpecialization: visit.dentist.specialization ?? undefined,
        status: visit.status,
        paymentStatus: this.determinePaymentStatus(visit),
        totalCost: totalCostFromProcedures,
        totalPrice: totalCostFromProcedures,
        amountPaid: toNum(visit.amountPaid),
        balance: toNum(visit.totalCost) - toNum(visit.amountPaid),
        diagnosis: visit.diagnosis || [],
        icdCodes: visit.icdCodes || [],
        procedureCount: treatmentProcedures.length,  // ← count from treatment procedures
        procedures: visit.procedures.map(p => ({ name: p.procedure.name, code: p.procedure.code ?? undefined, cost: toNum(p.cost) })),
        prescriptionCount: 0,
        // totalPayments: visit.payments.reduce((sum, p) => sum + p.amount, 0),
        checkedInAt: visit.checkedInAt?.toISOString() || null,
        startedAt: visit.startedAt?.toISOString() || null,
        completedAt: visit.completedAt?.toISOString() || null,
        followUpDate: visit.followUpDate?.toISOString() || null,
        createdAt: visit.createdAt.toISOString(),
        treatmentProcedures,
        procedureSessions,
         // ✅ Session counts from procedureSessions
        sessionCount: procedureSessions.length,
        completedSessionCount: procedureSessions.filter(ps => ps.status === 'COMPLETED').length,
      };
    });

    return {
      type: 'patient_visits', // use string literal instead of missing enum
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      summary: {
        total: totalVisits,
        byStatus,
        totalRevenue,
        totalCollected,
        avgProceduresPerVisit,
      },
      data,
      pagination: {
        page,
        limit,
        total: totalVisits,
        totalPages: Math.ceil(totalVisits / limit),
      },
    };
  }

  private determinePaymentStatus(visit: any): string {
    if (visit.amountPaid === 0) return 'UNPAID';
    if (visit.amountPaid >= visit.totalCost) return 'PAID';
    return 'PARTIAL';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NEW REPORTS (Phase 3 — operator-driven, manager-facing)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Recall list — patients who are overdue for hygiene/recall.
   *
   * A patient is "due for recall" if their most recent COMPLETED visit of a
   * recall-eligible type was more than `recallIntervalMonths` months ago,
   * and they have no future scheduled appointment.
   *
   * Recall-eligible visit types: CONSULTATION, CLEANING, FOLLOW_UP, PEDIATRIC.
   *
   * @param recallIntervalMonths - how many months since last visit (default 6)
   */
  async getRecallList(recallIntervalMonths = 6, limit = 200) {
    const safeLimit = Math.min(1000, Math.max(1, limit));
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - recallIntervalMonths);

    // Raw SQL for efficiency: get each patient's last recall-eligible visit
    // and any future scheduled appointment in one query.
    const rows = await this.prisma.$queryRaw<
      Array<{
        patientId: string;
        patientCode: string;
        firstName: string;
        lastName: string;
        phone: string | null;
        lastVisitAt: Date | null;
        lastVisitType: string | null;
        nextAppointmentAt: Date | null;
      }>
    >`
      SELECT
        p.id as "patientId",
        p."patientCode" as "patientCode",
        p."firstName" as "firstName",
        p."lastName" as "lastName",
        p.phone as phone,
        (
          SELECT MAX(v."completedAt")
          FROM "visits" v
          WHERE v."patientId" = p.id
            AND v.status = 'COMPLETED'
            AND v."completedAt" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "appointments" a
              WHERE a.id = v."appointmentId"
                AND a.type IN ('CONSULTATION', 'CLEANING', 'FOLLOW_UP', 'PEDIATRIC')
            )
        ) as "lastVisitAt",
        (
          SELECT a.type
          FROM "appointments" a
          JOIN "visits" v ON v."appointmentId" = a.id
          WHERE v."patientId" = p.id AND v.status = 'COMPLETED'
            AND v."completedAt" IS NOT NULL
            AND a.type IN ('CONSULTATION', 'CLEANING', 'FOLLOW_UP', 'PEDIATRIC')
          ORDER BY v."completedAt" DESC
          LIMIT 1
        ) as "lastVisitType",
        (
          SELECT MIN(a."scheduledAt")
          FROM "appointments" a
          WHERE a."patientId" = p.id
            AND a."scheduledAt" > NOW()
            AND a.status NOT IN ('CANCELLED', 'NO_SHOW')
        ) as "nextAppointmentAt"
      FROM "patients" p
      WHERE p."isActive" = true
      ORDER BY "lastVisitAt" ASC NULLS FIRST
      LIMIT ${safeLimit + 100}
    `;

    const now = Date.now();
    const overdue = rows
      .filter((r) => {
        if (!r.lastVisitAt) return true; // never visited = overdue
        return new Date(r.lastVisitAt).getTime() < cutoff.getTime();
      })
      .filter((r) => !r.nextAppointmentAt) // skip patients with future appts
      .slice(0, safeLimit);

    const data = overdue.map((r) => ({
      patientId: r.patientId,
      patientCode: r.patientCode,
      patientName: `${r.firstName} ${r.lastName}`,
      phone: r.phone,
      lastVisitDate: r.lastVisitAt,
      lastVisitType: r.lastVisitType,
      daysSinceLastVisit: r.lastVisitAt
        ? Math.floor(
            (now - new Date(r.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24),
          )
        : null,
      nextAppointmentDate: r.nextAppointmentAt,
    }));

    const oldestOverdueDays =
      data.length > 0
        ? Math.max(
            ...data.map((d) => d.daysSinceLastVisit ?? 0),
          )
        : null;

    return {
      summary: {
        totalOverdue: data.length,
        recallIntervalMonths,
        oldestOverdueDays,
      },
      data,
    };
  }

  /**
   * A/R aging report — invoices with outstanding balance, grouped by age bucket.
   * Buckets: Current (0-30), 31-60, 61-90, 90+. Excludes VOID invoices.
   */
  async getArAgingReport(asOf?: Date) {
    const referenceDate = asOf || new Date();

    const rows = await this.prisma.invoice.findMany({
      where: {
        status: { not: 'VOID' as any },
        balance: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientCode: true,
            phone: true,
          },
        },
        issuedAt: true,
        dueDate: true,
        balance: true,
        baseCurrency: true,
        currency: true,
        total: true,
        amountPaid: true,
      },
      orderBy: { issuedAt: 'asc' },
      take: 1000,
    });

    const buckets = {
      current: [] as any[],
      days31to60: [] as any[],
      days61to90: [] as any[],
      over90: [] as any[],
    };
    const totalsByBucket = {
      current: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      grand: 0,
    };

    for (const inv of rows) {
      // Aging reference date: use dueDate if set, else issuedAt. If neither
      // exists (shouldn't happen but schema allows null issuedAt), use
      // referenceDate so ageDays = 0 instead of NaN.
      const ref = inv.dueDate ?? inv.issuedAt ?? referenceDate;
      const ageDays = Math.floor(
        (referenceDate.getTime() - new Date(ref).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const balance = Number(inv.balance);
      const item = {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        patientId: inv.patient.id,
        patientCode: inv.patient.patientCode,
        patientName: `${inv.patient.firstName} ${inv.patient.lastName}`,
        phone: inv.patient.phone,
        issuedAt: inv.issuedAt,
        dueDate: inv.dueDate,
        ageDays,
        balance,
        currency: inv.currency,
      };
      if (ageDays <= 30) {
        buckets.current.push(item);
        totalsByBucket.current += balance;
      } else if (ageDays <= 60) {
        buckets.days31to60.push(item);
        totalsByBucket.days31to60 += balance;
      } else if (ageDays <= 90) {
        buckets.days61to90.push(item);
        totalsByBucket.days61to90 += balance;
      } else {
        buckets.over90.push(item);
        totalsByBucket.over90 += balance;
      }
      totalsByBucket.grand += balance;
    }

    return {
      asOf: referenceDate,
      summary: {
        totalInvoices: rows.length,
        totalOutstanding: totalsByBucket.grand,
        totalOutstandingFormatted: `${totalsByBucket.grand.toLocaleString('en-US', { maximumFractionDigits: 2 })} UGX`,
        byBucket: [
          {
            label: '0-30 days (current)',
            count: buckets.current.length,
            total: totalsByBucket.current,
          },
          {
            label: '31-60 days',
            count: buckets.days31to60.length,
            total: totalsByBucket.days31to60,
          },
          {
            label: '61-90 days',
            count: buckets.days61to90.length,
            total: totalsByBucket.days61to90,
          },
          {
            label: '90+ days',
            count: buckets.over90.length,
            total: totalsByBucket.over90,
          },
        ],
      },
      buckets,
    };
  }

  /**
   * KPI dashboard — today, this-week, this-month snapshot in one call.
   * Used by the manager dashboard to avoid N HTTP requests.
   */
  async getKpiDashboard() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const [
      todayCounts,
      todayRevenue,
      outstandingCount,
      weekCounts,
      weekNewPatients,
      weekRevenue,
      monthCounts,
      monthNewPatients,
      monthRevenue,
      arSnapshot,
      activeVisits,
    ] = await Promise.all([
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { scheduledAt: { gte: startOfToday, lte: endOfToday } },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'POSTED' as any,
          paymentStatus: 'PAID' as any,
          paidAt: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { baseTotal: true },
      }),
      this.prisma.invoice.count({
        where: { status: { not: 'VOID' as any }, balance: { gt: 0 } },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { scheduledAt: { gte: startOfWeek } },
        _count: true,
      }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: startOfWeek } },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'POSTED' as any,
          paymentStatus: 'PAID' as any,
          paidAt: { gte: startOfWeek },
        },
        _sum: { baseTotal: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['status'],
        where: { scheduledAt: { gte: startOfMonth, lte: endOfMonth } },
        _count: true,
      }),
      this.prisma.patient.count({
        where: { registeredAt: { gte: startOfMonth } },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'POSTED' as any,
          paymentStatus: 'PAID' as any,
          paidAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { baseTotal: true },
      }),
      this.getArAgingReport(now),
      this.prisma.visit.count({
        where: {
          status: { in: ['ARRIVED', 'IN_PROGRESS'] as any[] },
        },
      }),
    ]);

    const sumByStatus = (
      groups: Array<{ status: string; _count: number }>,
      statuses: string[],
    ) =>
      groups
        .filter((g) => statuses.includes(g.status))
        .reduce((s, g) => s + g._count, 0);

    return {
      today: {
        appointments: todayCounts.reduce((s, g) => s + g._count, 0),
        checkedIn: sumByStatus(todayCounts, ['ARRIVED']),
        completed: sumByStatus(todayCounts, ['COMPLETED']),
        cancelled: sumByStatus(todayCounts, ['CANCELLED']),
        noShow: sumByStatus(todayCounts, ['NO_SHOW']),
        revenue: Number(todayRevenue._sum.baseTotal ?? 0),
        outstandingInvoices: outstandingCount,
      },
      thisWeek: {
        appointments: weekCounts.reduce((s, g) => s + g._count, 0),
        completed: sumByStatus(weekCounts, ['COMPLETED']),
        revenue: Number(weekRevenue._sum.baseTotal ?? 0),
        newPatients: weekNewPatients,
      },
      thisMonth: {
        appointments: monthCounts.reduce((s, g) => s + g._count, 0),
        completed: sumByStatus(monthCounts, ['COMPLETED']),
        revenue: Number(monthRevenue._sum.baseTotal ?? 0),
        newPatients: monthNewPatients,
        aRAging: {
          current: arSnapshot.summary.byBucket[0].total,
          over90: arSnapshot.summary.byBucket[3].total,
          total: arSnapshot.summary.totalOutstanding,
        },
      },
      activeVisits,
    };
  }

  /**
   * Treatment plan conversion funnel — offered → accepted → in-progress → completed.
   */
  async getTreatmentPlanConversion(startDate: Date, endDate: Date) {
    const stages = await this.prisma.treatmentPlan.groupBy({
      by: ['status'],
      where: { createdAt: { gte: startDate, lte: endDate } },
      _count: true,
    });

    const findStage = (s: string) =>
      stages.find((x) => x.status === s)?._count ?? 0;

    const offered = findStage('PROPOSED') + findStage('DRAFT');
    const accepted =
      findStage('ACCEPTED') + findStage('IN_PROGRESS') + findStage('COMPLETED');
    const inProgress = findStage('IN_PROGRESS');
    const completed = findStage('COMPLETED');
    const rejected = findStage('REJECTED');

    const acceptanceRate = offered > 0 ? Math.round((accepted / offered) * 100) : 0;
    const completionRate =
      accepted > 0 ? Math.round((completed / accepted) * 100) : 0;
    const rejectionRate =
      offered > 0 ? Math.round((rejected / offered) * 100) : 0;

    const monthlyTrend = await this.prisma.$queryRaw<
      Array<{ month: string; offered: number; accepted: number; completed: number }>
    >`
      SELECT
        TO_CHAR("createdAt", 'YYYY-MM') as month,
        COUNT(*)::int as offered,
        COUNT(*) FILTER (WHERE status IN ('ACCEPTED', 'IN_PROGRESS', 'COMPLETED'))::int as accepted,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed
      FROM "treatment_plans"
      WHERE "createdAt" BETWEEN ${startDate} AND ${endDate}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month ASC
    `;

    return {
      period: { startDate, endDate },
      funnel: { offered, accepted, inProgress, completed, rejected },
      rates: { acceptanceRate, completionRate, rejectionRate },
      monthlyTrend: monthlyTrend.map((r) => ({
        month: r.month,
        offered: Number(r.offered),
        accepted: Number(r.accepted),
        completed: Number(r.completed),
      })),
    };
  }

  /**
   * Hygienist productivity — staff with role=HYGIENIST.
   */
  async getHygienistProductivity(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const hygienists = await this.prisma.staff.findMany({
      where: { user: { role: 'HYGIENIST' as any }, isAvailable: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
      },
    });

    const results = await Promise.all(
      hygienists.map(async (h) => {
        const [visits, completedVisits, sessions] = await Promise.all([
          this.prisma.visit.count({
            where: { dentistId: h.id, startedAt: { gte: start, lte: end } },
          }),
          this.prisma.visit.count({
            where: {
              dentistId: h.id,
              status: 'COMPLETED',
              startedAt: { gte: start, lte: end },
            },
          }),
          this.prisma.procedureSession.count({
            where: {
              treatmentProcedure: { treatmentPlan: { dentistId: h.id } },
              performedDate: { gte: start, lte: end },
            },
          }),
        ]);
        return {
          ...h,
          visits,
          completedVisits,
          completionRate:
            visits > 0 ? Math.round((completedVisits / visits) * 100) : 0,
          sessions,
        };
      }),
    );

    return results.sort((a, b) => b.visits - a.visits);
  }
}