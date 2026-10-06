// src/visits/progress-reports.service.ts
//
// Clinical progress notes attached to a visit.
//
// Hardened for production:
//  • Every write is checked against the visit (exists, open — or an audited
//    amendment of a completed visit) through the shared visit guard.
//  • Linked sessions / conditions must belong to the visit's patient, so a
//    note can never point at another patient's record.
//  • Report codes come from the atomic document counter (PR-YY-NNNN). The old
//    `count() + 1` scheme collided with an existing code as soon as one report
//    was deleted, after which every new report failed on the unique index.
//  • Delete is a soft delete with a reason; every write lands an audit row.
//  • Tooth numbers are validated as FDI (permanent AND primary teeth).

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { assertFdiTooth } from '../common/dental/dental-validation';
import { assertVisitWritableTx, VisitWriteActor } from './visit-guard';

export type ComplaintStatus = 'IMPROVED' | 'SAME' | 'WORSE';
export type ProgressOutcome = 'GOOD' | 'FAIR' | 'POOR';

class ProgressReportFieldsDto {
  @IsOptional() @IsString() @MaxLength(5000) complaint?: string;
  @IsOptional() @IsEnum(['IMPROVED', 'SAME', 'WORSE']) complaintStatus?: ComplaintStatus;
  @IsOptional() @IsString() @MaxLength(200) treatmentStatus?: string;
  @IsOptional() @IsEnum(['GOOD', 'FAIR', 'POOR']) outcome?: ProgressOutcome;
  // FDI (11-48 permanent, 51-85 primary) — validated in the service.
  @IsOptional() @IsInt() toothNumber?: number;
  @IsOptional() @IsString() @MaxLength(500) procedureName?: string;
  @IsOptional() @IsString() @MaxLength(10000) findings?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsString() @MaxLength(10000) nextPlan?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) procedureSessionIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) patientConditionIds?: string[];
  /** Required when writing against a COMPLETED visit (audited amendment). */
  @IsOptional() @IsString() @MaxLength(1000) amendmentReason?: string;
}

export class CreateProgressReportDto extends ProgressReportFieldsDto {}
export class UpdateProgressReportDto extends ProgressReportFieldsDto {}

export class DeleteProgressReportDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

// ── Shared include shape ──────────────────────────────────────────────────────
const REPORT_INCLUDE = {
  dentist: { select: { id: true, firstName: true, lastName: true } },
  procedureLinks: {
    include: {
      procedureSession: {
        include: {
          treatmentProcedure: {
            include: { procedure: { select: { id: true, name: true, code: true } } },
          },
          targets: { select: { toothNumber: true, surfaces: true } },
        },
      },
    },
  },
  conditionLinks: {
    include: {
      patientCondition: {
        include: {
          condition: { select: { id: true, name: true, category: true, icd10Code: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class ProgressReportsService {
  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
  ) {}

  // ── Visit-scoped list ─────────────────────────────────────────────────────
  async getVisitProgressReports(visitId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit) throw new NotFoundException('Visit not found');

    return this.prisma.progressReport.findMany({
      where: { visitId, deletedAt: null },
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Patient-scoped list (all visits) ─────────────────────────────────────
  async getPatientProgressReports(patientId: string) {
    return this.prisma.progressReport.findMany({
      where: { patientId, deletedAt: null },
      include: {
        ...REPORT_INCLUDE,
        visit: { select: { id: true, visitCode: true, checkedInAt: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Form context (sessions + conditions selectable for a visit) ───────────
  async getVisitFormContext(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: { patientId: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const [procedureSessions, patientConditions] = await Promise.all([
      this.prisma.procedureSession.findMany({
        where: { visitId, deletedAt: null },
        include: {
          treatmentProcedure: {
            include: { procedure: { select: { id: true, name: true, code: true } } },
          },
          targets: { select: { toothNumber: true, surfaces: true } },
        },
        orderBy: [{ visitGroup: 'asc' }, { sessionNumber: 'asc' }],
      }),
      this.prisma.patientCondition.findMany({
        where: { patientId: visit.patientId, deletedAt: null },
        include: {
          condition: { select: { id: true, name: true, category: true, icd10Code: true } },
        },
        orderBy: { diagnosedAt: 'desc' },
      }),
    ]);

    return { procedureSessions, patientConditions };
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async createProgressReport(
    visitId: string,
    dto: CreateProgressReportDto,
    actor?: VisitWriteActor,
  ) {
    if (dto.toothNumber != null) assertFdiTooth(dto.toothNumber);

    return this.prisma.$transaction(async (tx) => {
      const { visit, isAmendment } = await assertVisitWritableTx(tx, {
        visitId,
        actor,
        amendmentReason: dto.amendmentReason,
        what: 'progress reports',
      });
      await this.assertLinksBelongToPatient(
        tx,
        visit.patientId,
        dto.procedureSessionIds,
        dto.patientConditionIds,
      );

      const reportCode = await this.docNum.next('PR', tx); // PR-YY-NNNN
      const report = await tx.progressReport.create({
        data: {
          reportCode,
          visitId,
          patientId: visit.patientId,
          dentistId: visit.dentistId,
          createdById: actor?.id ?? null,
          complaint: dto.complaint,
          complaintStatus: dto.complaintStatus as any,
          treatmentStatus: dto.treatmentStatus,
          outcome: dto.outcome as any,
          toothNumber: dto.toothNumber,
          procedureName: dto.procedureName,
          findings: dto.findings,
          notes: dto.notes,
          nextPlan: dto.nextPlan,
          procedureLinks: dto.procedureSessionIds?.length
            ? {
                create: [...new Set(dto.procedureSessionIds)].map(
                  (procedureSessionId) => ({ procedureSessionId }),
                ),
              }
            : undefined,
          conditionLinks: dto.patientConditionIds?.length
            ? {
                create: [...new Set(dto.patientConditionIds)].map(
                  (patientConditionId) => ({ patientConditionId }),
                ),
              }
            : undefined,
        },
        include: REPORT_INCLUDE,
      });

      await this.audit(tx, {
        action: isAmendment ? 'AMEND_CREATE' : 'CREATE',
        reportId: report.id,
        actor,
        reason: dto.amendmentReason,
        newData: {
          reportCode,
          visitId,
          toothNumber: report.toothNumber,
          procedureSessionIds: dto.procedureSessionIds ?? [],
          patientConditionIds: dto.patientConditionIds ?? [],
        },
      });

      return report;
    });
  }

  // ── Update (replace strategy for links) ──────────────────────────────────
  async updateProgressReport(
    reportId: string,
    dto: UpdateProgressReportDto,
    actor?: VisitWriteActor,
  ) {
    if (dto.toothNumber != null) assertFdiTooth(dto.toothNumber);

    return this.prisma.$transaction(async (tx) => {
      const report = await tx.progressReport.findFirst({
        where: { id: reportId, deletedAt: null },
      });
      if (!report) throw new NotFoundException('Progress report not found');

      const { isAmendment } = await assertVisitWritableTx(tx, {
        visitId: report.visitId,
        patientId: report.patientId,
        actor,
        amendmentReason: dto.amendmentReason,
        what: 'progress reports',
      });
      await this.assertLinksBelongToPatient(
        tx,
        report.patientId,
        dto.procedureSessionIds,
        dto.patientConditionIds,
      );

      if (dto.procedureSessionIds !== undefined) {
        await tx.progressReportProcedure.deleteMany({ where: { reportId } });
        if (dto.procedureSessionIds.length > 0) {
          await tx.progressReportProcedure.createMany({
            data: [...new Set(dto.procedureSessionIds)].map((procedureSessionId) => ({
              reportId,
              procedureSessionId,
            })),
          });
        }
      }

      if (dto.patientConditionIds !== undefined) {
        await tx.progressReportCondition.deleteMany({ where: { reportId } });
        if (dto.patientConditionIds.length > 0) {
          await tx.progressReportCondition.createMany({
            data: [...new Set(dto.patientConditionIds)].map((patientConditionId) => ({
              reportId,
              patientConditionId,
            })),
          });
        }
      }

      const updated = await tx.progressReport.update({
        where: { id: reportId },
        data: {
          complaint: dto.complaint,
          complaintStatus: dto.complaintStatus as any,
          treatmentStatus: dto.treatmentStatus,
          outcome: dto.outcome as any,
          toothNumber: dto.toothNumber,
          procedureName: dto.procedureName,
          findings: dto.findings,
          notes: dto.notes,
          nextPlan: dto.nextPlan,
          updatedById: actor?.id ?? null,
        },
        include: REPORT_INCLUDE,
      });

      await this.audit(tx, {
        action: isAmendment ? 'AMEND' : 'UPDATE',
        reportId,
        actor,
        reason: dto.amendmentReason,
        oldData: {
          complaint: report.complaint,
          complaintStatus: report.complaintStatus,
          treatmentStatus: report.treatmentStatus,
          outcome: report.outcome,
          toothNumber: report.toothNumber,
          procedureName: report.procedureName,
          findings: report.findings,
          notes: report.notes,
          nextPlan: report.nextPlan,
        },
        newData: {
          complaint: updated.complaint,
          complaintStatus: updated.complaintStatus,
          treatmentStatus: updated.treatmentStatus,
          outcome: updated.outcome,
          toothNumber: updated.toothNumber,
          procedureName: updated.procedureName,
          findings: updated.findings,
          notes: updated.notes,
          nextPlan: updated.nextPlan,
        },
      });

      return updated;
    });
  }

  // ── Delete (soft) ─────────────────────────────────────────────────────────
  async deleteProgressReport(
    reportId: string,
    reason: string,
    actor?: VisitWriteActor,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException(
        'A reason is required to delete a progress report (clinical audit trail).',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.progressReport.findFirst({
        where: { id: reportId, deletedAt: null },
      });
      if (!report) throw new NotFoundException('Progress report not found');

      await tx.progressReport.update({
        where: { id: reportId },
        data: {
          deletedAt: new Date(),
          deletedById: actor?.id ?? null,
          deletedReason: reason.trim(),
        },
      });

      await this.audit(tx, {
        action: 'DELETE',
        reportId,
        actor,
        reason: reason.trim(),
        oldData: {
          reportCode: report.reportCode,
          visitId: report.visitId,
          toothNumber: report.toothNumber,
          findings: report.findings,
          notes: report.notes,
        },
      });

      return { success: true, id: reportId };
    });
  }

  // ── Single fetch ──────────────────────────────────────────────────────────
  async getProgressReport(reportId: string) {
    const report = await this.prisma.progressReport.findFirst({
      where: { id: reportId, deletedAt: null },
      include: {
        ...REPORT_INCLUDE,
        visit: { select: { id: true, visitCode: true, checkedInAt: true } },
      },
    });
    if (!report) throw new NotFoundException('Progress report not found');
    return report;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Linked sessions / conditions must be live and belong to this patient. */
  private async assertLinksBelongToPatient(
    tx: Prisma.TransactionClient,
    patientId: string,
    sessionIds?: string[],
    conditionIds?: string[],
  ) {
    const sIds = [...new Set(sessionIds ?? [])];
    if (sIds.length) {
      const found = await tx.procedureSession.count({
        where: {
          id: { in: sIds },
          deletedAt: null,
          treatmentProcedure: { treatmentPlan: { patientId } },
        },
      });
      if (found !== sIds.length) {
        throw new BadRequestException(
          "One or more linked sessions do not belong to this patient's treatment.",
        );
      }
    }
    const cIds = [...new Set(conditionIds ?? [])];
    if (cIds.length) {
      const found = await tx.patientCondition.count({
        where: { id: { in: cIds }, patientId, deletedAt: null },
      });
      if (found !== cIds.length) {
        throw new BadRequestException(
          'One or more linked conditions do not belong to this patient.',
        );
      }
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    entry: {
      action: string;
      reportId: string;
      actor?: VisitWriteActor;
      reason?: string;
      oldData?: Record<string, unknown>;
      newData?: Record<string, unknown>;
    },
  ) {
    await tx.auditLog.create({
      data: {
        userId: entry.actor?.id ?? null,
        action: entry.action,
        module: 'PROGRESS_REPORTS',
        entityType: 'ProgressReport',
        recordId: entry.reportId,
        oldData: (entry.oldData ?? undefined) as Prisma.InputJsonValue,
        newData: (entry.newData ?? undefined) as Prisma.InputJsonValue,
        reason: entry.reason ?? null,
      },
    });
  }
}
