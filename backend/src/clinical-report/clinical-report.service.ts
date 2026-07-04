import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TreatmentStatus, SessionStatus, Prisma } from '@prisma/client';
import {
    ClinicalReportQueryDto,
    ClinicalReportType,
    ReportPeriodClinical,
} from './dto/clinical-report.dto';

function toNum(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

@Injectable()
export class ClinicalReportsService {
    constructor(private prisma: PrismaService) { }

    // ─── Date range helper ────────────────────────────────────────────────────
    private resolveDateRange(
        period: ReportPeriodClinical = ReportPeriodClinical.THIS_MONTH,
        customStart?: string,
        customEnd?: string,
    ): { startDate: Date; endDate: Date } {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const eod = new Date(now);
        eod.setHours(23, 59, 59, 999);

        if (period === ReportPeriodClinical.CUSTOM && customStart && customEnd) {
            return { startDate: new Date(customStart), endDate: new Date(customEnd) };
        }

        switch (period) {
            case ReportPeriodClinical.TODAY:
                return { startDate: today, endDate: eod };
            case ReportPeriodClinical.THIS_WEEK: {
                const w = new Date(today);
                w.setDate(today.getDate() - today.getDay());
                const we = new Date(w);
                we.setDate(w.getDate() + 6);
                we.setHours(23, 59, 59, 999);
                return { startDate: w, endDate: we };
            }
            case ReportPeriodClinical.LAST_MONTH: {
                const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
                return { startDate: s, endDate: e };
            }
            case ReportPeriodClinical.LAST_3_MONTHS: {
                const s = new Date(now);
                s.setMonth(s.getMonth() - 3);
                s.setHours(0, 0, 0, 0);
                return { startDate: s, endDate: eod };
            }
            case ReportPeriodClinical.LAST_6_MONTHS: {
                const s = new Date(now);
                s.setMonth(s.getMonth() - 6);
                s.setHours(0, 0, 0, 0);
                return { startDate: s, endDate: eod };
            }
            case ReportPeriodClinical.THIS_YEAR: {
                const s = new Date(now.getFullYear(), 0, 1);
                return { startDate: s, endDate: eod };
            }
            default: {
                // THIS_MONTH
                const s = new Date(now.getFullYear(), now.getMonth(), 1);
                const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                return { startDate: s, endDate: e };
            }
        }
    }

    // ─── Route to sub-report ──────────────────────────────────────────────────
    async getClinicalReport(query: ClinicalReportQueryDto) {
        const { startDate, endDate } = this.resolveDateRange(
            query.period,
            query.startDate,
            query.endDate,
        );

        switch (query.type) {
            case ClinicalReportType.TREATMENT_HISTORY:
                return this.getTreatmentHistoryReport(query, startDate, endDate);
            case ClinicalReportType.PLAN_VS_COMPLETED:
                return this.getPlanVsCompletedReport(query, startDate, endDate);
            case ClinicalReportType.PROCEDURE_SESSIONS:
                return this.getProcedureSessionsReport(query, startDate, endDate);
            case ClinicalReportType.PROCEDURE_OUTCOMES:
                return this.getProcedureOutcomesReport(query, startDate, endDate);
            case ClinicalReportType.DENTAL_CHART_STATUS:
                return this.getDentalChartStatusReport(query, startDate, endDate);
            case ClinicalReportType.DIAGNOSIS_TRENDS:
                return this.getDiagnosisTrendsReport(query, startDate, endDate);
            case ClinicalReportType.PATIENT_VISITS:
                return this.getPatientVisitsReport(query, startDate, endDate);
            case ClinicalReportType.DENTIST_ACTIVITY:
                return this.getDentistActivityReport(query, startDate, endDate);
            default:
                return this.getTreatmentHistoryReport(query, startDate, endDate);
        }
    }

    // ─── 1. Treatment History ─────────────────────────────────────────────────
    async getTreatmentHistoryReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const skip = (page - 1) * limit;

        const where: any = {
            createdAt: { gte: startDate, lte: endDate },
        };
        if (query.patientId) where.patientId = query.patientId;
        if (query.dentistId) where.dentistId = query.dentistId;

        const [plans, total] = await Promise.all([
            this.prisma.treatmentPlan.findMany({
                where,
                include: {
                    patient: {
                        select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true },
                    },
                    dentist: {
                        select: { id: true, firstName: true, lastName: true, specialization: true },
                    },
                    procedures: {
                        include: {
                            procedure: { select: { id: true, name: true, code: true } },
                            sessions: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.treatmentPlan.count({ where }),
        ]);

        // Aggregate per-plan summaries
        const rows = plans.map((plan) => {
            const totalProcedures = plan.procedures.length;
            const completedProcs = plan.procedures.filter(
                (p) => p.status === TreatmentStatus.COMPLETED,
            ).length;
            const totalSessions = plan.procedures.reduce(
                (acc, p) => acc + p.sessions.length,
                0,
            );
            const completedSessions = plan.procedures.reduce(
                (acc, p) =>
                    acc + p.sessions.filter((s) => s.status === SessionStatus.COMPLETED).length,
                0,
            );
            return {
                planId: plan.id,
                planCode: plan.planCode,
                patientId: plan.patientId,
                patientCode: plan.patient.patientCode,
                patientName: `${plan.patient.firstName} ${plan.patient.lastName}`,
                patientPhone: plan.patient.phone,
                dentistId: plan.dentistId,
                dentistName: `Dr. ${plan.dentist.firstName} ${plan.dentist.lastName}`,
                dentistSpecialization: plan.dentist.specialization,
                planTitle: plan.title,
                planStatus: plan.status,
                diagnosis: plan.diagnosis,
                estimatedCost: Number(plan.estimatedCost),
                actualCost: Number(plan.actualCost),
                totalProcedures,
                                completedProcedures: completedProcs,
                                // R-06 fix: return null instead of 0% for plans with no procedures.
                                // 0% reads as "abandoned work" but a plan with no procedures is
                                // structurally vacuous, not 0% complete.
                                completionRate:
                                    totalProcedures > 0
                                        ? Math.round((completedProcs / totalProcedures) * 100)
                                        : null,
                                totalSessions,
                                completedSessions,
                                sessionCompletionRate:
                                    totalSessions > 0
                                        ? Math.round((completedSessions / totalSessions) * 100)
                                        : null,
                startDate: plan.startDate,
                endDate: plan.endDate,
                completedAt: plan.completedAt,
                createdAt: plan.createdAt,
                procedures: plan.procedures.map((p) => ({
                    id: p.id,
                    name: p.procedure.name,
                    code: p.procedure.code,
                    status: p.status,
                    sequence: p.sequence,
                    visitGroup: p.visitGroup,
                    sessionType: p.sessionType,
                    sessionCount: p.sessionCount,
                    completedSessions: p.sessions.filter((s) => s.status === SessionStatus.COMPLETED).length,
                    pricePerUnit: Number(p.pricePerUnit),
                    totalPrice: Number(p.totalPrice),
                    scheduledDate: p.scheduledDate,
                    completedAt: p.completedAt,
                })),
            };
        });

        // Summary stats
        const allPlans = await this.prisma.treatmentPlan.findMany({
            where,
            select: { status: true, estimatedCost: true, actualCost: true },
        });
        const byStatus = allPlans.reduce<Record<string, number>>((acc, p) => {
            acc[p.status] = (acc[p.status] ?? 0) + 1;
            return acc;
        }, {});

        return {
            type: ClinicalReportType.TREATMENT_HISTORY,
            period: { startDate, endDate },
            summary: {
                totalPlans: total,
                byStatus,
                totalEstimatedCost: allPlans.reduce((s, p) => s + Number(p.estimatedCost), 0),
                totalActualCost: allPlans.reduce((s, p) => s + Number(p.actualCost), 0),
            },
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─── 2. Plan vs Completed ─────────────────────────────────────────────────
    async getPlanVsCompletedReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const where: any = { createdAt: { gte: startDate, lte: endDate } };
        if (query.patientId) where.patientId = query.patientId;
        if (query.dentistId) where.dentistId = query.dentistId;

        const procedures = await this.prisma.treatmentProcedure.findMany({
            where: {
                treatmentPlan: where,
            },
            include: {
                procedure: { select: { id: true, name: true, code: true } },
                treatmentPlan: {
                    select: {
                        planCode: true,
                        patient: { select: { patientCode: true, firstName: true, lastName: true } },
                        dentist: { select: { firstName: true, lastName: true } },
                    },
                },
                sessions: true,
            },
        });

        // Group by procedure name for comparison
        const byProcedure = new Map<
            string,
            { name: string; code: string | null; planned: number; completed: number; inProgress: number; cancelled: number; totalRevenue: number }
        >();

        for (const p of procedures) {
            const key = p.procedure.name;
            const existing = byProcedure.get(key) ?? {
                name: p.procedure.name,
                code: p.procedure.code,
                planned: 0,
                completed: 0,
                inProgress: 0,
                cancelled: 0,
                totalRevenue: 0,
            };
            existing.planned += 1;
            if (p.status === TreatmentStatus.COMPLETED) {
                existing.completed += 1;
                existing.totalRevenue += Number(p.totalPrice);
            } else if (p.status === TreatmentStatus.IN_PROGRESS) {
                existing.inProgress += 1;
            } else if (p.status === TreatmentStatus.CANCELLED) {
                existing.cancelled += 1;
            }
            byProcedure.set(key, existing);
        }

        const procedureComparison = Array.from(byProcedure.values())
            .map((p) => ({
                ...p,
                completionRate: p.planned > 0 ? Math.round((p.completed / p.planned) * 100) : 0,
            }))
            .sort((a, b) => b.planned - a.planned);

        // Overall stats
        const totalPlanned = procedures.length;
        const totalCompleted = procedures.filter((p) => p.status === TreatmentStatus.COMPLETED).length;
        const totalInProgress = procedures.filter((p) => p.status === TreatmentStatus.IN_PROGRESS).length;
        const totalCancelled = procedures.filter((p) => p.status === TreatmentStatus.CANCELLED).length;
        const totalOnHold = procedures.filter((p) => p.status === TreatmentStatus.ON_HOLD).length;

        // Session level breakdown
        const allSessions = procedures.flatMap((p) => p.sessions);
        const sessionsByStatus = allSessions.reduce<Record<string, number>>((acc, s) => {
            acc[s.status] = (acc[s.status] ?? 0) + 1;
            return acc;
        }, {});

        // Monthly trend
        const monthlyTrend: Record<
            string,
            { month: string; planned: number; completed: number }
        > = {};
        for (const p of procedures) {
            const monthKey = p.createdAt.toISOString().slice(0, 7);
            if (!monthlyTrend[monthKey]) monthlyTrend[monthKey] = { month: monthKey, planned: 0, completed: 0 };
            monthlyTrend[monthKey].planned += 1;
            if (p.status === TreatmentStatus.COMPLETED) monthlyTrend[monthKey].completed += 1;
        }

        return {
            type: ClinicalReportType.PLAN_VS_COMPLETED,
            period: { startDate, endDate },
            summary: {
                totalPlanned,
                totalCompleted,
                totalInProgress,
                totalCancelled,
                totalOnHold,
                overallCompletionRate:
                    totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0,
                totalSessions: allSessions.length,
                sessionsByStatus,
            },
            procedureComparison,
            monthlyTrend: Object.values(monthlyTrend).sort((a, b) =>
                a.month.localeCompare(b.month),
            ),
        };
    }

    // ─── 3. Procedure Sessions (Executions) ───────────────────────────────────
    async getProcedureSessionsReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const skip = (page - 1) * limit;

        const sessionWhere: any = {
                    createdAt: { gte: startDate, lte: endDate },
                    deletedAt: null,
                };
                // R-02 fix: build the treatmentPlan filter as one object so that
                // combining patientId + dentistId works. The previous code spread
                // patientId into sessionWhere.treatmentProcedure, then overwrote
                // the inner treatmentPlan key when adding dentistId — only one
                // filter survived.
                const planFilter: any = {};
                if (query.patientId) planFilter.patientId = query.patientId;
                if (query.dentistId) planFilter.dentistId = query.dentistId;
                if (Object.keys(planFilter).length > 0) {
                    sessionWhere.treatmentProcedure = { treatmentPlan: planFilter };
                }
                // R-13 fix: wire procedureId filter (was declared in DTO but unused).
                if (query.procedureId) {
                    sessionWhere.treatmentProcedure = {
                        ...(sessionWhere.treatmentProcedure ?? {}),
                        procedureId: query.procedureId,
                    };
                }
                if (query.status) sessionWhere.status = query.status;

        const [sessions, total] = await Promise.all([
            this.prisma.procedureSession.findMany({
                where: sessionWhere,
                include: {
                    treatmentProcedure: {
                        include: {
                            procedure: { select: { id: true, name: true, code: true } },
                            treatmentPlan: {
                                select: {
                                    planCode: true,
                                    patient: { select: { patientCode: true, firstName: true, lastName: true } },
                                    dentist: { select: { firstName: true, lastName: true, specialization: true } },
                                },
                            },
                        },
                    },
                    visit: { select: { id: true, visitCode: true, checkedInAt: true } },
                    targets: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.procedureSession.count({ where: sessionWhere }),
        ]);

        // Session aggregate summary across the full period
        const allSessionStats = await this.prisma.procedureSession.groupBy({
            by: ['status'],
            where: sessionWhere,
            _count: true,
        });

        // R-20 fix: compute average session duration in SQL instead of loading all
                // sessions into memory. At 100k sessions this is O(100k) memory and
                // network — SQL aggregates it server-side in O(rows-scanned).
                const avgDurationResult = await this.prisma.$queryRaw<
                  Array<{ avg_minutes: number | null }>
                >`
                  SELECT AVG(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")) / 60)::float as avg_minutes
                  FROM "procedure_sessions"
                  WHERE "startedAt" IS NOT NULL
                    AND "endedAt" IS NOT NULL
                    AND "deletedAt" IS NULL
                    AND "createdAt" BETWEEN ${startDate} AND ${endDate}
                    ${query.patientId ? Prisma.sql` AND "treatmentProcedureId" IN (SELECT "id" FROM "treatment_procedures" WHERE "treatmentPlanId" IN (SELECT "id" FROM "treatment_plans" WHERE "patientId" = ${query.patientId}))` : Prisma.empty}
                    ${query.dentistId ? Prisma.sql` AND "treatmentProcedureId" IN (SELECT "id" FROM "treatment_procedures" WHERE "treatmentPlanId" IN (SELECT "id" FROM "treatment_plans" WHERE "dentistId" = ${query.dentistId}))` : Prisma.empty}
                    ${query.status ? Prisma.sql` AND status = ${query.status}::text` : Prisma.empty}
                `;
                const avgDurationMin = Math.round(
                  avgDurationResult[0]?.avg_minutes ?? 0,
                );

        // Sessions by procedure name
        const sessionsByProcedure = new Map<
            string,
            { name: string; total: number; completed: number; pending: number; skipped: number; cancelled: number }
        >();
        for (const s of sessions) {
            const key = s.treatmentProcedure.procedure.name;
            const e = sessionsByProcedure.get(key) ?? {
                name: key,
                total: 0,
                completed: 0,
                pending: 0,
                skipped: 0,
                cancelled: 0,
            };
            e.total += 1;
            if (s.status === SessionStatus.COMPLETED) e.completed += 1;
            else if (s.status === SessionStatus.PENDING) e.pending += 1;
            else if (s.status === SessionStatus.SKIPPED) e.skipped += 1;
            else if (s.status === SessionStatus.CANCELLED) e.cancelled += 1;
            sessionsByProcedure.set(key, e);
        }

        const rows = sessions.map((s) => ({
            sessionId: s.id,
            sessionNumber: s.sessionNumber,
            sessionLabel: s.sessionLabel,
            status: s.status,
            procedureName: s.treatmentProcedure.procedure.name,
            procedureCode: s.treatmentProcedure.procedure.code,
            planCode: s.treatmentProcedure.treatmentPlan.planCode,
            patientCode: s.treatmentProcedure.treatmentPlan.patient.patientCode,
            patientName: `${s.treatmentProcedure.treatmentPlan.patient.firstName} ${s.treatmentProcedure.treatmentPlan.patient.lastName}`,
            dentistName: `Dr. ${s.treatmentProcedure.treatmentPlan.dentist.firstName} ${s.treatmentProcedure.treatmentPlan.dentist.lastName}`,
            visitCode: s.visit?.visitCode ?? null,
            performedDate: s.performedDate,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            performedNotes: s.performedNotes,
            sessionCost: s.sessionCost !== null ? Number(s.sessionCost) : null,
            sessionPrice: s.sessionPrice !== null ? Number(s.sessionPrice) : null,
            ledgerStatus: s.ledgerStatus,
            targets: s.targets,
            createdAt: s.createdAt,
        }));

        return {
            type: ClinicalReportType.PROCEDURE_SESSIONS,
            period: { startDate, endDate },
            summary: {
                total,
                byStatus: Object.fromEntries(allSessionStats.map((s) => [s.status, s._count])),
                avgDurationMinutes: avgDurationMin,
                sessionsByProcedure: Array.from(sessionsByProcedure.values()).sort(
                    (a, b) => b.total - a.total,
                ),
            },
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─── 4. Procedure Outcomes ────────────────────────────────────────────────
    async getProcedureOutcomesReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const where: any = {
            completedAt: { gte: startDate, lte: endDate },
            status: TreatmentStatus.COMPLETED,
        };
        if (query.patientId) where.treatmentPlan = { patientId: query.patientId };
        if (query.dentistId) where.treatmentPlan = { ...(where.treatmentPlan ?? {}), dentistId: query.dentistId };

        const completedProcedures = await this.prisma.treatmentProcedure.findMany({
            where,
            include: {
                procedure: { select: { id: true, name: true, code: true } },
                treatmentPlan: {
                    select: {
                        planCode: true,
                        patient: { select: { patientCode: true, firstName: true, lastName: true } },
                        dentist: { select: { firstName: true, lastName: true } },
                    },
                },
                sessions: true,
                chartEntries: {
                    where: { type: 'COMPLETED' },
                    select: { id: true, label: true, conditionCode: true, procedureCode: true, notes: true },
                },
            },
        });

        // Group outcomes by procedure
        const byProcedure = new Map<
            string,
            {
                name: string; code: string | null; count: number;
                avgSessionsUsed: number; avgCostDeviation: number;
                totalPlannedCost: number; totalActualCost: number;
            }
        >();

        for (const p of completedProcedures) {
            const key = p.procedure.name;
            const existing = byProcedure.get(key) ?? {
                name: p.procedure.name,
                code: p.procedure.code,
                count: 0,
                avgSessionsUsed: 0,
                avgCostDeviation: 0,
                totalPlannedCost: 0,
                totalActualCost: 0,
            };
            existing.count += 1;
            existing.avgSessionsUsed =
                (existing.avgSessionsUsed * (existing.count - 1) + p.sessions.length) / existing.count;
            existing.totalPlannedCost += Number(p.subtotalPrice);
            existing.totalActualCost += Number(p.totalPrice);
            byProcedure.set(key, existing);
        }

        // Re-treatment detection: procedures done more than once for same patient+tooth combo
        const retreatmentCandidates = await this.prisma.$queryRaw<
            Array<{ patient_id: string; procedure_name: string; count: bigint }>
        >`
      SELECT
        tp.\"patientId\" as patient_id,
        p.name as procedure_name,
        COUNT(*) as count
      FROM \"treatment_procedures\" tproc
      JOIN \"treatment_plans\" tp ON tp.id = tproc.\"treatmentPlanId\"
      JOIN \"procedures\" p ON p.id = tproc.\"procedureId\"
      WHERE tproc.status = 'COMPLETED'
        AND tproc.\"completedAt\" BETWEEN ${startDate} AND ${endDate}
      GROUP BY tp.\"patientId\", p.name
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 20
    `;

        return {
            type: ClinicalReportType.PROCEDURE_OUTCOMES,
            period: { startDate, endDate },
            summary: {
                totalCompleted: completedProcedures.length,
                uniqueProcedureTypes: byProcedure.size,
                potentialRetreaments: retreatmentCandidates.length,
            },
            byProcedure: Array.from(byProcedure.values()).sort((a, b) => b.count - a.count),
            retreatmentCandidates: retreatmentCandidates.map((r) => ({
                patientId: r.patient_id,
                procedureName: r.procedure_name,
                count: Number(r.count),
            })),
        };
    }

    // ─── 5. Dental Chart Status ───────────────────────────────────────────────
    async getDentalChartStatusReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const skip = (page - 1) * limit;

        const chartWhere: any = {};
        if (query.patientId) chartWhere.patientId = query.patientId;

        // Tooth-mark distribution across the live chart. Sourced from ChartEntry
        // (the source of truth) grouped by entry type — CONDITION / EXISTING /
        // PLANNED / COMPLETED — for ACTIVE rows only. Replaces the legacy
        // ToothRecord/ToothStatus groupBy, which is no longer written and could
        // drift from the real chart.
        const chartTypeCounts = await this.prisma.chartEntry.groupBy({
            by: ['type'],
            where: { status: 'ACTIVE' },
            _count: { _all: true },
            orderBy: { _count: { type: 'desc' } },
        });
        const toothStatusCounts = chartTypeCounts.map((c) => ({
            status: c.type as string,
            count: c._count._all,
        }));

        // Patients with most pathologies — clinically-live PatientConditions
        // (ACTIVE / MONITORED, not soft-deleted) are the live analog of the old
        // DECAYED/FRACTURED ToothRecord rows.
        const condByPatient = await this.prisma.patientCondition.groupBy({
            by: ['patientId'],
            where: { deletedAt: null, status: { in: ['ACTIVE', 'MONITORED'] } },
            _count: { _all: true },
            orderBy: { _count: { patientId: 'desc' } },
            take: 20,
        });
        const pathologyPatientRecords = await this.prisma.patient.findMany({
            where: { id: { in: condByPatient.map((c) => c.patientId) } },
            select: { id: true, firstName: true, lastName: true, patientCode: true },
        });
        const pathologyPatientMap = new Map(pathologyPatientRecords.map((p) => [p.id, p]));
        const pathologicalPatients = condByPatient.map((c) => {
            const p = pathologyPatientMap.get(c.patientId);
            return {
                patient_id: c.patientId,
                first_name: p?.firstName ?? '',
                last_name: p?.lastName ?? '',
                patient_code: p?.patientCode ?? '',
                pathology_count: c._count._all,
            };
        });

        // Most affected tooth numbers — live conditions grouped by tooth.
        const condByTooth = await this.prisma.patientCondition.groupBy({
            by: ['toothNumber'],
            where: {
                deletedAt: null,
                status: { in: ['ACTIVE', 'MONITORED'] },
                toothNumber: { not: null },
            },
            _count: { _all: true },
            orderBy: { _count: { toothNumber: 'desc' } },
            take: 32,
        });
        const mostAffectedTeeth = condByTooth.map((t) => ({
            tooth_number: t.toothNumber as number,
            status: 'CONDITION',
            count: t._count._all,
        }));

        // Chart entry type breakdown
        const chartEntryTypes = await this.prisma.chartEntry.groupBy({
            by: ['type'],
            _count: true,
            where: { createdAt: { gte: startDate, lte: endDate } },
        });

        // Recent chart entries (paginated)
        const [chartEntries, totalEntries] = await Promise.all([
            this.prisma.chartEntry.findMany({
                where: { ...(query.patientId ? { patientId: query.patientId } : {}), createdAt: { gte: startDate, lte: endDate } },
                include: {
                    patient: { select: { patientCode: true, firstName: true, lastName: true } },
                    visit: { select: { visitCode: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.chartEntry.count({
                where: { ...(query.patientId ? { patientId: query.patientId } : {}), createdAt: { gte: startDate, lte: endDate } },
            }),
        ]);

        // Live-model summary counts: total ACTIVE chart marks, and the number of
        // distinct patients who have any chart entry (the live "charts" count).
        const [totalActiveMarks, chartedPatients] = await Promise.all([
            this.prisma.chartEntry.count({ where: { status: 'ACTIVE' } }),
            this.prisma.chartEntry.groupBy({ by: ['patientId'] }),
        ]);

        return {
            type: ClinicalReportType.DENTAL_CHART_STATUS,
            period: { startDate, endDate },
            summary: {
                totalToothRecords: totalActiveMarks,
                totalCharts: chartedPatients.length,
                toothStatusDistribution: toothStatusCounts.map((t) => ({
                    status: t.status,
                    count: t.count,
                })),
                chartEntryTypes: chartEntryTypes.map((e) => ({ type: e.type, count: e._count })),
            },
            pathologicalPatients: pathologicalPatients.map((p) => ({
                patientId: p.patient_id,
                patientName: `${p.first_name} ${p.last_name}`,
                patientCode: p.patient_code,
                pathologyCount: Number(p.pathology_count),
            })),
            mostAffectedTeeth: mostAffectedTeeth.map((t) => ({
                toothNumber: t.tooth_number,
                status: t.status,
                count: Number(t.count),
            })),
            recentChartEntries: chartEntries.map((e) => ({
                id: e.id,
                patientCode: e.patient.patientCode,
                patientName: `${e.patient.firstName} ${e.patient.lastName}`,
                visitCode: e.visit?.visitCode ?? null,
                toothNumber: e.toothNumber,
                type: e.type,
                label: e.label,
                conditionCode: e.conditionCode,
                procedureCode: e.procedureCode,
                notes: e.notes,
                createdAt: e.createdAt,
            })),
            pagination: { page, limit, total: totalEntries, totalPages: Math.ceil(totalEntries / limit) },
        };
    }

    // ─── 6. Diagnosis Trends ──────────────────────────────────────────────────
    async getDiagnosisTrendsReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        // Diagnoses from visits
        const visitDiagnoses = await this.prisma.$queryRaw<
            Array<{ diagnosis: string; count: bigint }>
        >`
      SELECT
        unnest(v.diagnosis) as diagnosis,
        COUNT(*) as count
      FROM \"visits\" v
      WHERE v.\"createdAt\" BETWEEN ${startDate} AND ${endDate}
        AND array_length(v.diagnosis, 1) > 0
        ${query.dentistId ? this.prisma.$queryRaw`AND v.\"dentistId\" = ${query.dentistId}` : this.prisma.$queryRaw``}
      GROUP BY diagnosis
      ORDER BY count DESC
      LIMIT 30
    `;

        // ICD codes from visits
        const icdCodes = await this.prisma.$queryRaw<
            Array<{ code: string; count: bigint }>
        >`
      SELECT
        unnest(v.\"icdCodes\") as code,
        COUNT(*) as count
      FROM \"visits\" v
      WHERE v.\"createdAt\" BETWEEN ${startDate} AND ${endDate}
        AND array_length(v.\"icdCodes\", 1) > 0
      GROUP BY code
      ORDER BY count DESC
      LIMIT 20
    `;

        // Monthly trend per top-5 diagnoses
        const top5 = visitDiagnoses.slice(0, 5).map((d) => d.diagnosis);
        const monthlyDiagnosisTrend: Array<{ month: string; diagnosis: string; count: number }> = [];

        for (const dx of top5) {
            const rows = await this.prisma.$queryRaw<Array<{ month: string; count: bigint }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', v.\"createdAt\"), 'YYYY-MM') as month,
          COUNT(*) as count
        FROM \"visits\" v
        WHERE v.\"createdAt\" BETWEEN ${startDate} AND ${endDate}
          AND ${dx} = ANY(v.diagnosis)
        GROUP BY month
        ORDER BY month ASC
      `;
            for (const r of rows) {
                monthlyDiagnosisTrend.push({ month: r.month, diagnosis: dx, count: Number(r.count) });
            }
        }

        // Condition codes from chart entries
        const chartConditions = await this.prisma.chartEntry.groupBy({
            by: ['conditionCode', 'label'],
            where: {
                createdAt: { gte: startDate, lte: endDate },
                conditionCode: { not: null },
            },
            _count: true,
            orderBy: { _count: { conditionCode: 'desc' } },
        });

        // Diagnosis by dentist
        const diagnosisByDentist = await this.prisma.$queryRaw<
            Array<{
                dentist_id: string; first_name: string; last_name: string;
                unique_diagnoses: number; total_visits_with_dx: bigint;
            }>
        >`
      SELECT
        s.id as dentist_id,
        s.\"firstName\" as first_name,
        s.\"lastName\" as last_name,
        COUNT(DISTINCT v.id) FILTER (WHERE array_length(v.diagnosis, 1) > 0) as total_visits_with_dx,
        COUNT(DISTINCT unnest_alias.dx) as unique_diagnoses
      FROM \"visits\" v
      JOIN \"staff\" s ON s.id = v.\"dentistId\"
      CROSS JOIN LATERAL unnest(v.diagnosis) AS unnest_alias(dx)
      WHERE v.\"createdAt\" BETWEEN ${startDate} AND ${endDate}
      GROUP BY s.id, s.\"firstName\", s.\"lastName\"
      ORDER BY total_visits_with_dx DESC
    `;

        return {
            type: ClinicalReportType.DIAGNOSIS_TRENDS,
            period: { startDate, endDate },
            summary: {
                totalUniqueDiagnoses: visitDiagnoses.length,
                totalIcdCodes: icdCodes.length,
                topDiagnosis: visitDiagnoses[0]
                    ? { name: visitDiagnoses[0].diagnosis, count: Number(visitDiagnoses[0].count) }
                    : null,
            },
            topDiagnoses: visitDiagnoses.map((d) => ({
                diagnosis: d.diagnosis,
                count: Number(d.count),
            })),
            icdCodeBreakdown: icdCodes.map((c) => ({ code: c.code, count: Number(c.count) })),
            chartConditions: chartConditions.map((c) => ({
                conditionCode: c.conditionCode,
                label: c.label,
                count: c._count,
            })),
            monthlyTrend: monthlyDiagnosisTrend,
            diagnosisByDentist: diagnosisByDentist.map((d) => ({
                dentistId: d.dentist_id,
                dentistName: `Dr. ${d.first_name} ${d.last_name}`,
                totalVisitsWithDx: Number(d.total_visits_with_dx),
                uniqueDiagnoses: Number(d.unique_diagnoses),
            })),
        };
    }

    // ─── 7. Patient Visits ────────────────────────────────────────────────────
    async getPatientVisitsReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 50;
        const skip = (page - 1) * limit;

        const visitWhere: any = {
                    // R-07 fix: filter by startedAt (when the visit happened) instead
                    // of createdAt (when the row was inserted). Future-dated visits
                    // booked today no longer appear in today's report.
                    startedAt: { gte: startDate, lte: endDate },
                };
                if (query.patientId) visitWhere.patientId = query.patientId;
                if (query.dentistId) visitWhere.dentistId = query.dentistId;
                if (query.status) visitWhere.status = query.status;

        const [visits, total] = await Promise.all([
            this.prisma.visit.findMany({
                where: visitWhere,
                include: {
                    patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
                    dentist: { select: { id: true, firstName: true, lastName: true, specialization: true } },
                    procedures: { include: { procedure: { select: { name: true, code: true } } } },
                    prescriptions: { select: { id: true, status: true } },
                    procedureSessions: { select: { id: true, status: true, sessionNumber: true } },
                    progressReports: { select: { id: true, outcome: true, complaintStatus: true } },
                    // payments: { select: { amount: true, method: true, status: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.visit.count({ where: visitWhere }),
        ]);

        const visitStatusSummary = await this.prisma.visit.groupBy({
            by: ['status'],
            where: visitWhere,
            _count: true,
        });

        const rows = visits.map((v) => ({
            visitId: v.id,
            visitCode: v.visitCode,
            patientId: v.patientId,
            patientCode: v.patient.patientCode,
            patientName: `${v.patient.firstName} ${v.patient.lastName}`,
            patientPhone: v.patient.phone,
            dentistId: v.dentistId,
            dentistName: `Dr. ${v.dentist.firstName} ${v.dentist.lastName}`,
            dentistSpecialization: v.dentist.specialization,
            status: v.status,
            paymentStatus: v.paymentStatus,
            totalCost: toNum(v.totalCost),
            amountPaid: toNum(v.amountPaid),
            balance: toNum(v.totalCost) - toNum(v.amountPaid),
            diagnosis: v.diagnosis,
            icdCodes: v.icdCodes,
            procedureCount: v.procedures.length,
            procedures: v.procedures.map((p) => ({
                name: p.procedure.name,
                code: p.procedure.code,
                cost: p.cost,
            })),
            sessionCount: v.procedureSessions.length,
            completedSessionCount: v.procedureSessions.filter(
                (s) => s.status === SessionStatus.COMPLETED,
            ).length,
            prescriptionCount: v.prescriptions.length,
            progressReports: v.progressReports,
            // totalPayments: v.payments.reduce((s, p) => (p.status === 'COMPLETED' ? s + p.amount : s), 0),
            checkedInAt: v.checkedInAt,
            startedAt: v.startedAt,
            completedAt: v.completedAt,
            followUpDate: v.followUpDate,
            createdAt: v.createdAt,
        }));

        return {
            type: ClinicalReportType.PATIENT_VISITS,
            period: { startDate, endDate },
            summary: {
                total,
                byStatus: Object.fromEntries(visitStatusSummary.map((s) => [s.status, s._count])),
                totalRevenue: rows.reduce((s, v) => s + toNum(v.totalCost), 0),
                totalCollected: rows.reduce((s, v) => s + toNum(v.amountPaid), 0),
                avgProceduresPerVisit:
                    rows.length > 0
                        ? (rows.reduce((s, v) => s + v.procedureCount, 0) / rows.length).toFixed(1)
                        : 0,
            },
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // ─── 8. Dentist Activity ──────────────────────────────────────────────────
    async getDentistActivityReport(
        query: ClinicalReportQueryDto,
        startDate: Date,
        endDate: Date,
    ) {
        const dentistFilter = query.dentistId ? { id: query.dentistId } : {};

        const dentists = await this.prisma.staff.findMany({
            where: { ...dentistFilter, user: { role: { in: ['DENTIST'] } } },
            select: { id: true, firstName: true, lastName: true, specialization: true },
        });

        const results = await Promise.all(
            dentists.map(async (d) => {
                const [
                    totalVisits, completedVisits,
                    totalSessions, completedSessions,
                    totalPlans, completedPlans,
                    revenueData,
                ] = await Promise.all([
                    this.prisma.visit.count({ where: { dentistId: d.id, createdAt: { gte: startDate, lte: endDate } } }),
                    this.prisma.visit.count({ where: { dentistId: d.id, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } } }),
                    this.prisma.procedureSession.count({
                        where: {
                            treatmentProcedure: { treatmentPlan: { dentistId: d.id } },
                            createdAt: { gte: startDate, lte: endDate },
                            deletedAt: null,
                        },
                    }),
                    this.prisma.procedureSession.count({
                        where: {
                            treatmentProcedure: { treatmentPlan: { dentistId: d.id } },
                            status: SessionStatus.COMPLETED,
                            createdAt: { gte: startDate, lte: endDate },
                            deletedAt: null,
                        },
                    }),
                    this.prisma.treatmentPlan.count({ where: { dentistId: d.id, createdAt: { gte: startDate, lte: endDate } } }),
                    this.prisma.treatmentPlan.count({ where: { dentistId: d.id, status: TreatmentStatus.COMPLETED, createdAt: { gte: startDate, lte: endDate } } }),
                    this.prisma.visit.aggregate({
                        where: { dentistId: d.id, status: 'COMPLETED', createdAt: { gte: startDate, lte: endDate } },
                        _sum: { totalCost: true, amountPaid: true },
                    }),
                ]);

                return {
                    dentistId: d.id,
                    dentistName: `Dr. ${d.firstName} ${d.lastName}`,
                    specialization: d.specialization,
                    totalVisits,
                    completedVisits,
                    visitCompletionRate: totalVisits > 0 ? Math.round((completedVisits / totalVisits) * 100) : 0,
                    totalSessions,
                    completedSessions,
                    sessionCompletionRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
                    totalPlans,
                    completedPlans,
                    planCompletionRate: totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0,
                    totalRevenue: toNum(revenueData._sum.totalCost),
                    totalCollected: toNum(revenueData._sum.amountPaid),
                };
            }),
        );

        return {
            type: ClinicalReportType.DENTIST_ACTIVITY,
            period: { startDate, endDate },
            summary: {
                totalDentists: dentists.length,
                totalVisits: results.reduce((s, d) => s + d.totalVisits, 0),
                totalRevenue: results.reduce((s, d) => s + d.totalRevenue, 0),
                avgCompletionRate:
                    results.length > 0
                        ? Math.round(results.reduce((s, d) => s + d.visitCompletionRate, 0) / results.length)
                        : 0,
            },
            dentists: results.sort((a, b) => b.totalRevenue - a.totalRevenue),
        };
    }


    // Add these methods to your ClinicalReportsService class

    async getStaff() {
        // R-11 fix: include HYGIENIST and NURSE roles in addition to DENTIST so
        // that hygienist productivity reports have staff to query. Previously
        // only DENTISTs were listed, making hygienist productivity invisible.
        return this.prisma.staff.findMany({
          where: {
            user: {
              role: { in: ['DENTIST', 'HYGIENIST', 'NURSE'] as any },
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
          orderBy: {
            firstName: 'asc',
          },
        });
      }

      async getPatients(search?: string, page = 1, limit = 50) {
        // R-14 fix: paginate patient search. Previously capped at 50 with no
        // pagination, making "I can't find Mr. Smith" complaints common in clinics
        // with > 50 patients matching a partial name search.
        const safePage = Math.max(1, Math.floor(page));
        const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
        const skip = (safePage - 1) * safeLimit;

        const where = search
          ? {
              OR: [
                { patientCode: { contains: search, mode: 'insensitive' as const } },
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {};

        const [total, patients] = await Promise.all([
          this.prisma.patient.count({ where }),
          this.prisma.patient.findMany({
            where,
            select: {
              id: true,
              patientCode: true,
              firstName: true,
              lastName: true,
            },
            skip,
            take: safeLimit,
            orderBy: {
              firstName: 'asc',
            },
          }),
        ]);

        return {
          data: patients,
          pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
          },
        };
      }
}