// src/visits/progress-reports.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  IsString, IsOptional, IsInt, Min, Max, IsEnum, IsArray,
} from 'class-validator';

export type ComplaintStatus = 'IMPROVED' | 'SAME' | 'WORSE';
export type ProgressOutcome  = 'GOOD' | 'FAIR' | 'POOR';

export class CreateProgressReportDto {
  @IsOptional() @IsString()  complaint?: string;
  @IsOptional() @IsEnum(['IMPROVED', 'SAME', 'WORSE']) complaintStatus?: ComplaintStatus;
  @IsOptional() @IsString()  treatmentStatus?: string;
  @IsOptional() @IsEnum(['GOOD', 'FAIR', 'POOR']) outcome?: ProgressOutcome;
  @IsOptional() @IsInt() @Min(11) @Max(48) toothNumber?: number;
  @IsOptional() @IsString()  procedureName?: string;
  @IsOptional() @IsString()  findings?: string;
  @IsOptional() @IsString()  notes?: string;
  @IsOptional() @IsString()  nextPlan?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) procedureSessionIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) patientConditionIds?: string[];
}

export class UpdateProgressReportDto {
  @IsOptional() @IsString()  complaint?: string;
  @IsOptional() @IsEnum(['IMPROVED', 'SAME', 'WORSE']) complaintStatus?: ComplaintStatus;
  @IsOptional() @IsString()  treatmentStatus?: string;
  @IsOptional() @IsEnum(['GOOD', 'FAIR', 'POOR']) outcome?: ProgressOutcome;
  @IsOptional() @IsInt() @Min(11) @Max(48) toothNumber?: number;
  @IsOptional() @IsString()  procedureName?: string;
  @IsOptional() @IsString()  findings?: string;
  @IsOptional() @IsString()  notes?: string;
  @IsOptional() @IsString()  nextPlan?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) procedureSessionIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) patientConditionIds?: string[];
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
  constructor(private prisma: PrismaService) {}

  // ── Visit-scoped list ─────────────────────────────────────────────────────
  async getVisitProgressReports(visitId: string) {
    const visit = await this.prisma.visit.findUnique({ where: { id: visitId } });
    if (!visit) throw new NotFoundException('Visit not found');

    return this.prisma.progressReport.findMany({
      where: { visitId },
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Patient-scoped list (all visits) ─────────────────────────────────────
  async getPatientProgressReports(patientId: string) {
    return this.prisma.progressReport.findMany({
      where: { patientId },
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
  async createProgressReport(visitId: string, dto: CreateProgressReportDto) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      select: { id: true, patientId: true, dentistId: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const reportCode = await this.generateReportCode();

    return this.prisma.progressReport.create({
      data: {
        reportCode,
        visitId,
        patientId: visit.patientId,
        dentistId: visit.dentistId,
        complaint:       dto.complaint,
        complaintStatus: dto.complaintStatus as any,
        treatmentStatus: dto.treatmentStatus,
        outcome:         dto.outcome as any,
        toothNumber:     dto.toothNumber,
        procedureName:   dto.procedureName,
        findings:        dto.findings,
        notes:           dto.notes,
        nextPlan:        dto.nextPlan,
        procedureLinks: dto.procedureSessionIds?.length
          ? { create: dto.procedureSessionIds.map((procedureSessionId) => ({ procedureSessionId })) }
          : undefined,
        conditionLinks: dto.patientConditionIds?.length
          ? { create: dto.patientConditionIds.map((patientConditionId) => ({ patientConditionId })) }
          : undefined,
      },
      include: REPORT_INCLUDE,
    });
  }

  // ── Update (replace strategy for links) ──────────────────────────────────
  async updateProgressReport(reportId: string, dto: UpdateProgressReportDto) {
    const report = await this.prisma.progressReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Progress report not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.procedureSessionIds !== undefined) {
        await tx.progressReportProcedure.deleteMany({ where: { reportId } });
        if (dto.procedureSessionIds.length > 0) {
          await tx.progressReportProcedure.createMany({
            data: dto.procedureSessionIds.map((procedureSessionId) => ({ reportId, procedureSessionId })),
          });
        }
      }

      if (dto.patientConditionIds !== undefined) {
        await tx.progressReportCondition.deleteMany({ where: { reportId } });
        if (dto.patientConditionIds.length > 0) {
          await tx.progressReportCondition.createMany({
            data: dto.patientConditionIds.map((patientConditionId) => ({ reportId, patientConditionId })),
          });
        }
      }

      return tx.progressReport.update({
        where: { id: reportId },
        data: {
          complaint:       dto.complaint,
          complaintStatus: dto.complaintStatus as any,
          treatmentStatus: dto.treatmentStatus,
          outcome:         dto.outcome as any,
          toothNumber:     dto.toothNumber,
          procedureName:   dto.procedureName,
          findings:        dto.findings,
          notes:           dto.notes,
          nextPlan:        dto.nextPlan,
        },
        include: REPORT_INCLUDE,
      });
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async deleteProgressReport(reportId: string) {
    const report = await this.prisma.progressReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Progress report not found');
    await this.prisma.progressReport.delete({ where: { id: reportId } });
    return { success: true, id: reportId };
  }

  // ── Single fetch ──────────────────────────────────────────────────────────
  async getProgressReport(reportId: string) {
    const report = await this.prisma.progressReport.findUnique({
      where: { id: reportId },
      include: {
        ...REPORT_INCLUDE,
        visit: { select: { id: true, visitCode: true, checkedInAt: true } },
      },
    });
    if (!report) throw new NotFoundException('Progress report not found');
    return report;
  }

  private async generateReportCode(): Promise<string> {
    const count = await this.prisma.progressReport.count();
    const year  = new Date().getFullYear();
    const seq   = (count + 1).toString().padStart(4, '0');
    return `PR-${year}-${seq}`;
  }
}