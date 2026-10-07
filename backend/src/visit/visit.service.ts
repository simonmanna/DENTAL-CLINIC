// src/visit/visit.service.ts
//
// The clinical encounter: check-in → examination → completion.
//
// What changed when this was hardened for production:
//
//  • A visit is created IN_PROGRESS with `startedAt` stamped: "Start visit"
//    means the patient is in the chair, so a separate "Start examination"
//    click was pure friction. `startExamination` stays for visits still
//    sitting in ARRIVED (opened before this change) and is idempotent.
//  • Clinical writes (SOAP, vitals, procedures, prescriptions) now load the
//    visit first, so a missing id is a 404 and not a Prisma P2025, and they
//    refuse to write to a COMPLETED or CANCELLED visit. Editing a completed
//    record is still possible, but only as an explicit amendment: the treating
//    dentist or an admin, with a stated reason, recorded in `audit_logs`.
//  • `addProcedure` prices from the procedure catalogue through PricingEngine.
//    The client used to supply `cost`, so any authenticated user could bill a
//    crown at zero. An override is still allowed for the roles that may
//    discount, and it is recorded with the engine price beside it.
//  • Procedure insert + visit-total increment happen in one transaction. They
//    were two separate writes, so a failure between them left the visit total
//    permanently wrong.
//  • Dashboard financials read the real `amountPaid`/`totalCost` columns. They
//    were hardcoded to 0, which reported every zero-cost visit as PAID and
//    every other visit as OPEN regardless of what had been collected.
//  • Day windows come from `common/time/clinic-day`, so the visit list and the
//    active board agree with the appointments calendar about where a day ends.

import {
  Injectable,
  Logger,
  Optional,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentStatus,
  AppointmentType,
  BalanceStatus,
  Prisma,
  UserRole,
  VisitStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { M } from '../common/money/money';
import { PricingEngine } from '../common/pricing/pricing.engine';
import { dayRange } from '../common/time/clinic-day';
import { assertVisitTransition, isVisitOpen } from './visit-status';
import { assertVisitWritableTx, checkClinicalWrite } from './visit-guard';
import { InvoiceLifecycleService } from '../billing/invoice-lifecycle.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { assertFdiTooth, assertSurfaces } from '../common/dental/dental-validation';
import { assertToothPresence } from '../common/dental/tooth-presence';

import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsBoolean,
  IsNumber,
  IsISO8601,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// ─── Acting principal ─────────────────────────────────────────────────────────

/** The authenticated caller, as assembled by JwtStrategy.validate. */
export interface ActingUser {
  id?: string;
  role?: UserRole;
  /** Staff row of the caller, when they are clinical staff. */
  staffId?: string | null;
}

/** Roles permitted to override a catalogue price or amend a closed record. */
const CAN_OVERRIDE_PRICE: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
];

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class CreateVisitDto {
  @IsString() @IsNotEmpty() appointmentId: string;
  /**
   * Provider the encounter is attributed to. Optional: the appointment's
   * dentist is used when omitted. Supplied when cover changes at the chair.
   */
  @IsOptional() @IsString() dentistId?: string;
}

/**
 * Walk-in: the patient is at the chair now, with no booking. The service
 * creates the appointment (already in progress) and the visit together.
 */
export class CreateWalkInVisitDto {
  @IsString() @IsNotEmpty() patientId: string;
  @IsString() @IsNotEmpty() dentistId: string;
  @IsOptional() @IsString() @MaxLength(2000) chiefComplaint?: string;
}

/** Fields carried by every clinical write, for the amendment path. */
class AmendableDto {
  /**
   * Required when writing to a COMPLETED visit. Recorded in `audit_logs`
   * alongside the before/after values.
   */
  @IsOptional() @IsString() @MaxLength(1000) amendmentReason?: string;
}

export class UpdateClinicalNotesDto extends AmendableDto {
  @IsOptional() @IsString() @MaxLength(5000) chiefComplaint?: string;
  @IsOptional() @IsString() @MaxLength(10000) historyOfPresentIllness?: string;
  @IsOptional() @IsString() @MaxLength(10000) subjective?: string;
  @IsOptional() @IsString() @MaxLength(10000) objective?: string;
  @IsOptional() @IsString() @MaxLength(10000) assessment?: string;
  @IsOptional() @IsString() @MaxLength(10000) plan?: string;
  @IsOptional() @IsString() @MaxLength(10000) findings?: string;
  @IsOptional() @IsString() @MaxLength(10000) recommendations?: string;
}

export class UpdateVitalsDto extends AmendableDto {
  @IsOptional() @IsString() @MaxLength(20) bloodPressure?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(400) pulseRate?: number;
  @IsOptional() @IsNumber() @Min(20) @Max(45) temperature?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(500) weight?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) height?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) oxygenSat?: number;
}

export class AddProcedureDto {
  @IsString() @IsNotEmpty() procedureId: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) toothNumbers?: number[];
  @IsOptional() @IsArray() @IsString({ each: true }) surfaces?: string[];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsInt() @Min(1) @Max(64) sessionCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(64) quantityOverride?: number;

  /**
   * Agreed price, when it differs from the catalogue. Honoured only for
   * CAN_OVERRIDE_PRICE roles and only with `overrideReason`; the engine price
   * is stored next to it either way.
   */
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsBoolean() isPriceOverridden?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) overrideReason?: string;

  /** Consumables drawn from stock for this procedure. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitProcedureStockUseDto)
  inventoryUsages?: VisitProcedureStockUseDto[];

  /** Required when the visit is already COMPLETED (amendment). */
  @IsOptional() @IsString() @MaxLength(1000) amendmentReason?: string;
}

export class VisitProcedureStockUseDto {
  @IsString() @IsNotEmpty() inventoryItemId: string;
  @IsString() @IsNotEmpty() locationId: string;
  @IsNumber() @Min(0.0001) quantityUsed: number;
  @IsOptional() @IsString() @MaxLength(100) batchNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class RemoveVisitProcedureDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class PrescriptionItemDto {
  @IsString() @IsNotEmpty() drugId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) dosage: string;
  @IsString() @IsNotEmpty() @MaxLength(200) frequency: string;
  @IsString() @IsNotEmpty() @MaxLength(200) duration: string;
  @IsInt() @Min(1) @Max(10000) quantity: number;
  @IsOptional() @IsString() @MaxLength(100) route?: string;
  @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
}

export class WritePrescriptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];

  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsISO8601() validUntil?: string;
}

export class CompleteVisitDto {
  @IsOptional() @IsISO8601() followUpDate?: string;
  @IsOptional() @IsString() @MaxLength(5000) followUpNotes?: string;
  @IsOptional() @IsString() @MaxLength(5000) recommendations?: string;
}

export class CancelVisitDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

// ─── SERVICE ──────────────────────────────────────────────────────────────────

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private prisma: PrismaService,
    private docNum: DocumentNumberService,
    @Optional() private invoiceLifecycle?: InvoiceLifecycleService,
    @Optional() private stock?: StockMovementService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // GUARDS & AUDIT
  // ═══════════════════════════════════════════════════════════════════════

  private async loadVisit(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    return visit;
  }

  /**
   * Decide whether this caller may write clinical data to this visit.
   *
   * Open visit        → anyone the route's @Roles already admitted.
   * COMPLETED visit   → treating dentist or admin, with a stated reason. The
   *                     write is an amendment and is audited as one.
   * CANCELLED visit   → never. A cancelled encounter has no clinical content
   *                     to correct; record a new visit instead.
   */
  private assertClinicalWriteAllowed(
    visit: { id: string; status: VisitStatus; dentistId: string },
    actor: ActingUser | undefined,
    amendmentReason: string | undefined,
    what: string,
  ): { isAmendment: boolean } {
    // Shared with every other clinical write that names a visit.
    return checkClinicalWrite(visit, actor, amendmentReason, what);
  }

  private async writeAudit(
    client: Prisma.TransactionClient | PrismaService,
    entry: {
      action: string;
      recordId: string;
      entityType?: string;
      actorId?: string;
      oldData?: Record<string, unknown>;
      newData?: Record<string, unknown>;
      reason?: string;
    },
  ): Promise<void> {
    // Every caller passes its transaction client. A failed INSERT aborts the
    // Postgres transaction anyway, so swallowing the error here only turned
    // it into a confusing "current transaction is aborted" further on (or a
    // committed change with no audit row). Let it fail the transaction.
    await client.auditLog.create({
      data: {
        userId: entry.actorId ?? null,
        action: entry.action,
        module: 'VISITS',
        entityType: entry.entityType ?? 'Visit',
        recordId: entry.recordId,
        oldData: (entry.oldData ?? undefined) as Prisma.InputJsonValue,
        newData: (entry.newData ?? undefined) as Prisma.InputJsonValue,
        reason: entry.reason,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * STEP 1 — open a visit for a checked-in appointment.
   * The visit opens IN_PROGRESS — the examination starts with the visit.
   */
  async createVisit(dto: CreateVisitDto, actor?: ActingUser) {
    if (!dto.appointmentId) {
      throw new BadRequestException('appointmentId is required');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { visit: { select: { id: true } } },
    });

    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.visit) {
      throw new BadRequestException(
        'Visit already exists for this appointment',
      );
    }
    if (appointment.status !== AppointmentStatus.ARRIVED) {
      throw new BadRequestException('Patient must be checked in first');
    }

    // The appointment's dentist is the default; an explicit dentistId covers
    // the case where another provider takes the chair.
    const dentistId = dto.dentistId || appointment.dentistId;
    if (!dentistId) {
      throw new BadRequestException('Appointment has no assigned dentist');
    }

    const dentist = await this.prisma.staff.findUnique({
      where: { id: dentistId },
      select: { id: true },
    });
    if (!dentist) {
      throw new BadRequestException(`Dentist with ID ${dentistId} not found`);
    }

    const now = new Date();
    const visit = await this.prisma.$transaction(async (tx) => {
      const visitCode = await this.docNum.next('VIS', tx);
      const newVisit = await tx.visit.create({
        data: {
          visitCode,
          appointmentId: dto.appointmentId,
          patientId: appointment.patientId,
          dentistId,
          status: VisitStatus.IN_PROGRESS,
          checkedInAt: now,
          startedAt: now,
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              allergies: true,
              medicalConditions: true,
              dateOfBirth: true,
              gender: true,
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
        },
      });

      await tx.appointment.update({
        where: { id: dto.appointmentId },
        data: { status: AppointmentStatus.IN_PROGRESS },
      });

      await this.writeAudit(tx, {
        action: 'CREATE',
        recordId: newVisit.id,
        actorId: actor?.id,
        newData: {
          visitCode,
          appointmentId: dto.appointmentId,
          patientId: appointment.patientId,
          dentistId,
          status: VisitStatus.IN_PROGRESS,
        },
      });

      return newVisit;
    });

    return visit;
  }

  /**
   * STEP 1 (walk-in) — open a visit for a patient with no booking.
   *
   * Creates a walk-in appointment and its IN_PROGRESS visit in one
   * transaction, so the front desk never has to book → check in → start by
   * hand, and a failure leaves no half-made appointment behind. The overlap
   * check is deliberately skipped: the patient is being seen now, whatever
   * the dentist's calendar says.
   */
  async createWalkInVisit(dto: CreateWalkInVisitDto, actor?: ActingUser) {
    const [patient, dentist] = await Promise.all([
      this.prisma.patient.findUnique({
        where: { id: dto.patientId },
        select: { id: true },
      }),
      this.prisma.staff.findUnique({
        where: { id: dto.dentistId },
        select: { id: true },
      }),
    ]);
    if (!patient) throw new NotFoundException('Patient not found');
    if (!dentist) {
      throw new BadRequestException(
        `Dentist with ID ${dto.dentistId} not found`,
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const appointmentCode = await this.docNum.next('APT', tx);
      const appointment = await tx.appointment.create({
        data: {
          appointmentCode,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          type: AppointmentType.CONSULTATION,
          scheduledAt: now,
          duration: 30,
          chiefComplaint: dto.chiefComplaint,
          isWalkIn: true,
          status: AppointmentStatus.IN_PROGRESS,
        },
      });

      const visitCode = await this.docNum.next('VIS', tx);
      const visit = await tx.visit.create({
        data: {
          visitCode,
          appointmentId: appointment.id,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          status: VisitStatus.IN_PROGRESS,
          checkedInAt: now,
          startedAt: now,
        },
      });

      await this.writeAudit(tx, {
        action: 'CREATE_WALK_IN',
        recordId: visit.id,
        actorId: actor?.id,
        newData: {
          visitCode,
          appointmentId: appointment.id,
          appointmentCode,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          status: VisitStatus.IN_PROGRESS,
        },
      });

      return visit;
    });
  }

  /**
   * STEP 2 — begin the examination.
   * Idempotent: calling it on a visit already IN_PROGRESS returns the visit
   * rather than failing, so a double-clicked button is harmless.
   */
  async startExamination(visitId: string, actor?: ActingUser) {
    const visit = await this.loadVisit(visitId);

    if (visit.status === VisitStatus.IN_PROGRESS) return visit;
    assertVisitTransition(visit.status, VisitStatus.IN_PROGRESS);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Conditional on the status we validated, so two racing requests (or a
      // racing cancel) cannot both apply.
      const res = await tx.visit.updateMany({
        where: { id: visitId, status: visit.status },
        data: {
          status: VisitStatus.IN_PROGRESS,
          startedAt: visit.startedAt ?? new Date(),
        },
      });
      if (res.count === 0) throw this.concurrentChange();
      const row = (await tx.visit.findUnique({ where: { id: visitId } }))!;
      await this.writeAudit(tx, {
        action: 'START_EXAMINATION',
        recordId: visitId,
        actorId: actor?.id,
        oldData: { status: visit.status },
        newData: { status: row.status },
      });
      return row;
    });

    return updated;
  }

  /** STEP 3 — close the visit. */
  async completeVisit(
    visitId: string,
    dto: CompleteVisitDto,
    actor?: ActingUser,
  ) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { appointment: { select: { id: true, status: true } } },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    assertVisitTransition(visit.status, VisitStatus.COMPLETED);

    const followUpDate = dto.followUpDate ? new Date(dto.followUpDate) : null;
    if (followUpDate && isNaN(followUpDate.getTime())) {
      throw new BadRequestException('Invalid followUpDate');
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      // Money for a visit lives on its invoices (treatment procedures and
      // visit procedures both bill there). The visit's own totalCost column
      // is no longer overwritten here — it used to be reset to the sum of the
      // legacy VisitProcedure lines, i.e. to 0 for every modern visit.
      const res = await tx.visit.updateMany({
        where: { id: visitId, status: visit.status },
        data: {
          status: VisitStatus.COMPLETED,
          completedAt: new Date(),
          followUpDate,
          followUpNotes: dto.followUpNotes,
          recommendations: dto.recommendations,
        },
      });
      if (res.count === 0) throw this.concurrentChange();
      const completedVisit = (await tx.visit.findUnique({
        where: { id: visitId },
      }))!;

      if (visit.appointmentId) {
        await tx.appointment.update({
          where: { id: visit.appointmentId },
          data: {
            status: AppointmentStatus.COMPLETED,
            actualEndAt: new Date(),
            followUpDate,
          },
        });
      }

      await this.writeAudit(tx, {
        action: 'COMPLETE',
        recordId: visitId,
        actorId: actor?.id,
        oldData: { status: visit.status },
        newData: { status: VisitStatus.COMPLETED, followUpDate },
      });

      return completedVisit;
    });

    // Non-blocking hand-off checks for the front desk.
    const [openSessions, draftInvoices] = await Promise.all([
      this.prisma.procedureSession.count({
        where: {
          visitId,
          deletedAt: null,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.invoice.count({
        where: { visitId, status: 'DRAFT', deletedAt: null },
      }),
    ]);
    return { ...completed, warnings: { openSessions, draftInvoices } };
  }

  /**
   * What a visit already holds. Used to refuse cancelling an encounter that
   * has clinical or billing records — those visits are completed (and
   * credited / corrected) instead, so nothing is orphaned.
   */
  async getVisitRecordCounts(visitId: string) {
    const [
      procedures,
      sessions,
      chartEntries,
      conditions,
      progressReports,
      prescriptions,
      invoices,
    ] = await Promise.all([
      this.prisma.visitProcedure.count({ where: { visitId, deletedAt: null } }),
      this.prisma.procedureSession.count({
        where: {
          visitId,
          deletedAt: null,
          status: { notIn: ['VOIDED', 'CANCELLED'] },
        },
      }),
      this.prisma.chartEntry.count({ where: { visitId, status: 'ACTIVE' } }),
      this.prisma.patientCondition.count({ where: { visitId, deletedAt: null } }),
      this.prisma.progressReport.count({ where: { visitId, deletedAt: null } }),
      this.prisma.prescription.count({ where: { visitId } }),
      this.prisma.invoice.count({
        where: { visitId, status: { not: 'VOID' }, deletedAt: null, items: { some: { status: 'ACTIVE' } } },
      }),
    ]);
    return {
      procedures,
      sessions,
      chartEntries,
      conditions,
      progressReports,
      prescriptions,
      invoices,
    };
  }

  private concurrentChange() {
    return new ConflictException(
      'This visit was changed by another request. Reload and try again.',
    );
  }

  /**
   * Cancel an open visit — patient left before treatment, wrong patient
   * checked in, equipment failure. `VisitStatus.CANCELLED` previously had no
   * endpoint, which left staff forcing such visits to COMPLETED instead.
   */
  async cancelVisit(visitId: string, reason: string, actor?: ActingUser) {
    if (!reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required');
    }

    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { appointment: { select: { id: true, status: true } } },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    assertVisitTransition(visit.status, VisitStatus.CANCELLED);

    // Cancelling an encounter that already holds clinical or billing records
    // would orphan them (this used to look only at legacy VisitProcedure
    // lines, so a visit with executed sessions and an invoice could be
    // cancelled). Those visits are completed and corrected instead.
    const counts = await this.getVisitRecordCounts(visitId);
    const held = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`);
    if (held.length > 0) {
      throw new BadRequestException(
        `Cannot cancel a visit that already holds records (${held.join(', ')}). ` +
          'Complete the visit and correct or credit the records instead.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const res = await tx.visit.updateMany({
        where: { id: visitId, status: visit.status },
        data: { status: VisitStatus.CANCELLED, completedAt: new Date() },
      });
      if (res.count === 0) throw this.concurrentChange();
      const row = (await tx.visit.findUnique({ where: { id: visitId } }))!;

      // The chair is free again; an appointment left IN_PROGRESS would sit on
      // the active board forever.
      if (
        visit.appointmentId &&
        visit.appointment?.status === AppointmentStatus.IN_PROGRESS
      ) {
        await tx.appointment.update({
          where: { id: visit.appointmentId },
          data: {
            status: AppointmentStatus.CANCELLED,
            cancelledReason: `Visit cancelled: ${reason}`,
          },
        });
      }

      await this.writeAudit(tx, {
        action: 'CANCEL',
        recordId: visitId,
        actorId: actor?.id,
        oldData: { status: visit.status },
        newData: { status: row.status },
        reason,
      });

      return row;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLINICAL DATA
  // ═══════════════════════════════════════════════════════════════════════

  async updateSOAP(
    visitId: string,
    dto: UpdateClinicalNotesDto,
    actor?: ActingUser,
  ) {
    const visit = await this.loadVisit(visitId);
    const { isAmendment } = this.assertClinicalWriteAllowed(
      visit,
      actor,
      dto.amendmentReason,
      'clinical notes',
    );

    const FIELDS = [
      'chiefComplaint',
      'historyOfPresentIllness',
      'subjective',
      'objective',
      'assessment',
      'plan',
      'findings',
      'recommendations',
    ] as const;

    const data: Prisma.VisitUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const field of FIELDS) {
      const next = dto[field];
      if (next === undefined) continue;
      (data as Record<string, unknown>)[field] = next;
      // Only changed fields reach the audit row, so an autosave that re-sends
      // identical text does not bury the real edits.
      if ((visit as Record<string, unknown>)[field] !== next) {
        before[field] = (visit as Record<string, unknown>)[field] ?? null;
        after[field] = next;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No clinical note fields supplied');
    }

    const updated = await this.prisma.visit.update({
      where: { id: visitId },
      data,
      select: {
        id: true,
        chiefComplaint: true,
        historyOfPresentIllness: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        findings: true,
        recommendations: true,
        updatedAt: true,
      },
    });

    if (Object.keys(after).length > 0) {
      await this.writeAudit(this.prisma, {
        action: isAmendment ? 'AMEND_SOAP' : 'UPDATE_SOAP',
        recordId: visitId,
        actorId: actor?.id,
        oldData: before,
        newData: after,
        reason: dto.amendmentReason,
      });
    }

    return updated;
  }

  async updateVitals(
    visitId: string,
    dto: UpdateVitalsDto,
    actor?: ActingUser,
  ) {
    const visit = await this.loadVisit(visitId);
    const { isAmendment } = this.assertClinicalWriteAllowed(
      visit,
      actor,
      dto.amendmentReason,
      'vitals',
    );

    const FIELDS = [
      'bloodPressure',
      'pulseRate',
      'temperature',
      'weight',
      'height',
      'oxygenSat',
    ] as const;

    const data: Prisma.VisitUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    for (const field of FIELDS) {
      const next = dto[field];
      if (next === undefined) continue;
      (data as Record<string, unknown>)[field] = next;
      before[field] = (visit as Record<string, unknown>)[field] ?? null;
      after[field] = next;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No vitals supplied');
    }

    const updated = await this.prisma.visit.update({
      where: { id: visitId },
      data,
      select: {
        id: true,
        bloodPressure: true,
        pulseRate: true,
        temperature: true,
        weight: true,
        height: true,
        oxygenSat: true,
        updatedAt: true,
      },
    });

    await this.writeAudit(this.prisma, {
      action: isAmendment ? 'AMEND_VITALS' : 'UPDATE_VITALS',
      recordId: visitId,
      actorId: actor?.id,
      oldData: before,
      newData: after,
      reason: dto.amendmentReason,
    });

    return updated;
  }

  /**
   * Record a procedure performed during the visit.
   *
   * Price comes from the catalogue via PricingEngine — the same engine the
   * treatment plans use, so a crown costs the same whichever screen records
   * it. A caller-supplied `cost` is accepted only from a role that may
   * discount and only with a reason; the engine figure is stored beside it as
   * `unitPrice`/`originalPrice` so the discount stays visible.
   */
  async addProcedure(
    visitId: string,
    dto: AddProcedureDto,
    actor?: ActingUser,
  ) {
    const visit = await this.loadVisit(visitId);

    const procedure = await this.prisma.procedure.findUnique({
      where: { id: dto.procedureId },
    });
    if (!procedure) throw new NotFoundException('Procedure not found');
    if (!procedure.isActive) {
      throw new BadRequestException(
        `Procedure ${procedure.name} is no longer active and cannot be recorded.`,
      );
    }

    // FDI teeth, canonical surfaces per tooth, and no surface work on a tooth
    // the chart records as absent — the same rules as treatment procedures.
    const toothNumbers = [...new Set(dto.toothNumbers ?? [])].map(
      (t) => assertFdiTooth(t) as number,
    );
    let surfaces: string[] = [];
    if (dto.surfaces?.length) {
      if (toothNumbers.length === 0) {
        throw new BadRequestException('Surfaces need at least one tooth.');
      }
      surfaces = [
        ...new Set(toothNumbers.flatMap((t) => assertSurfaces(dto.surfaces, t))),
      ];
    }
    await assertToothPresence(this.prisma as any, {
      patientId: visit.patientId,
      toothNumbers,
      surfaces,
    });

    const exchangeRate = await this.getClinicExchangeRate(procedure.currency);

    const pricing = PricingEngine.calculate(
      {
        basePrice: procedure.basePrice,
        baseCost: procedure.baseCost ?? 0,
        pricingModel: procedure.pricingModel,
        priceRangeMin: procedure.priceRangeMin,
        priceRangeMax: procedure.priceRangeMax,
        currency: procedure.currency,
      },
      {
        toothNumbers,
        sessionCount: dto.sessionCount,
        quantityOverride: dto.quantityOverride,
        exchangeRate,
        baseCurrency: 'UGX',
      },
    );

    // Engine price, converted to the ledger currency.
    const enginePrice = M.money(pricing.baseAmount);
    let finalCost = enginePrice;
    let overrideApplied = false;

    if (dto.isPriceOverridden && dto.cost != null) {
      if (!actor?.role || !CAN_OVERRIDE_PRICE.includes(actor.role)) {
        throw new ForbiddenException(
          'Your role may not override a procedure price.',
        );
      }
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException(
          'overrideReason is required when overriding the catalogue price',
        );
      }
      finalCost = M.money(dto.cost);
      overrideApplied = true;
    } else if (dto.cost != null && !M.eq(dto.cost, enginePrice)) {
      // A bare `cost` that disagrees with the catalogue is the old, forgeable
      // shape. Reject it loudly rather than silently billing either figure.
      throw new BadRequestException(
        `Supplied cost ${M.str(M.of(dto.cost))} does not match the catalogue price ` +
          `${M.str(enginePrice)}. Omit cost, or set isPriceOverridden with an overrideReason.`,
      );
    }

    const created = await this.prisma.$transaction(
      async (tx) => {
        // Re-checked inside the transaction: open visit (or a stated
        // amendment by the treating dentist / an admin).
        const { isAmendment } = await assertVisitWritableTx(tx, {
          visitId,
          actor,
          amendmentReason: dto.amendmentReason,
          what: 'record a procedure on',
        });

        const row = await tx.visitProcedure.create({
          data: {
            visitId,
            procedureId: dto.procedureId,
            toothNumbers,
            surfaces: surfaces as any,
            notes: dto.notes,
            cost: finalCost,
            unitPrice: M.money(pricing.pricePerUnit),
            currency: 'UGX',
            exchangeRate: M.of(pricing.exchangeRate ?? 1),
            originalPrice: M.money(pricing.totalPrice),
            originalCurrency: procedure.currency,
            finalCurrency: 'UGX',
            createdById: actor?.id ?? null,
          },
          include: { procedure: true },
        });

        // Consumables: one stock path (batch draw, availability check,
        // replayable ledger) — the old copy decremented location stock with
        // no availability check and violated the non-negative CHECK as a 500.
        const stockUsed: Array<{ itemId: string; quantity: number; cost: number }> = [];
        if (dto.inventoryUsages?.length) {
          if (!this.stock) throw new Error('StockMovementService not wired');
          for (const u of dto.inventoryUsages) {
            const res = await this.stock.issue(tx, {
              itemId: u.inventoryItemId,
              locationId: u.locationId,
              quantity: u.quantityUsed,
              strategy: u.batchNumber ? 'MANUAL' : 'FEFO',
              selectedBatchNumber: u.batchNumber ?? null,
              referenceType: 'VISIT_PROCEDURE',
              referenceId: row.id,
              notes: `Used in procedure: ${procedure.name}${u.notes ? ` — ${u.notes}` : ''}`,
              performedById: actor?.id ?? null,
            });
            await tx.visitProcedureInventoryUsage.create({
              data: {
                visitProcedureId: row.id,
                inventoryItemId: u.inventoryItemId,
                locationId: u.locationId,
                quantityUsed: u.quantityUsed,
                unitCost: u.quantityUsed > 0 ? res.totalCost / u.quantityUsed : 0,
                totalCost: res.totalCost,
                batchNumber: u.batchNumber ?? res.draws[0]?.batchNumber ?? null,
                notes: u.notes,
              },
            });
            stockUsed.push({
              itemId: u.inventoryItemId,
              quantity: u.quantityUsed,
              cost: res.totalCost,
            });
          }
        }

        // Bill on the visit's invoice in the same transaction. Visit money
        // lives on invoices; the visit's own total column is no longer fed.
        const billing = this.invoiceLifecycle
          ? await this.invoiceLifecycle.addVisitProcedureItemTx(tx, {
              patientId: visit.patientId,
              visitId,
              visitProcedureId: row.id,
              procedureId: procedure.id,
              description: procedure.name,
              quantity: pricing.quantity,
              unitPrice: M.money(pricing.pricePerUnit),
              total: finalCost,
              toothNumbers,
              actorUserId: actor?.id ?? null,
            })
          : null;

        await this.writeAudit(tx, {
          action: overrideApplied ? 'ADD_PROCEDURE_OVERRIDE' : 'ADD_PROCEDURE',
          entityType: 'VisitProcedure',
          recordId: row.id,
          actorId: actor?.id,
          newData: {
            visitId,
            procedureId: dto.procedureId,
            procedureName: procedure.name,
            toothNumbers,
            surfaces,
            quantity: pricing.quantity,
            cataloguePrice: M.str(enginePrice),
            chargedCost: M.str(finalCost),
            pricingBreakdown: pricing.breakdown,
            invoiceId: billing?.invoiceId ?? null,
            stockUsed,
            amendment: isAmendment,
          },
          reason: dto.overrideReason ?? dto.amendmentReason,
        });

        return { ...row, billing };
      },
      { maxWait: 5000, timeout: 20000 },
    );

    return created;
  }

  /**
   * Remove a procedure recorded on the visit. Soft delete: the row stays,
   * its consumables go back to stock (compensating ledger rows) and its
   * invoice line is voided — with the GL reconciled when the invoice was
   * already posted.
   */
  async removeProcedure(
    visitProcedureId: string,
    dto: RemoveVisitProcedureDto,
    actor?: ActingUser,
  ) {
    const vp = await this.prisma.visitProcedure.findUnique({
      where: { id: visitProcedureId },
      include: { procedure: { select: { name: true } } },
    });
    if (!vp || vp.deletedAt) {
      throw new NotFoundException('Visit procedure not found');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required to remove a procedure.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        await assertVisitWritableTx(tx, {
          visitId: vp.visitId,
          actor,
          amendmentReason: dto.reason,
          what: 'remove a procedure from',
        });

        const res = await tx.visitProcedure.updateMany({
          where: { id: visitProcedureId, deletedAt: null },
          data: {
            deletedAt: new Date(),
            deletedById: actor?.id ?? null,
            deletedReason: dto.reason.trim(),
          },
        });
        if (res.count === 0) throw this.concurrentChange();

        let stockReversed = 0;
        const moved = await tx.inventoryLedger.count({
          where: {
            referenceType: 'VISIT_PROCEDURE',
            referenceId: visitProcedureId,
            reversalOfId: null,
          },
        });
        if (moved > 0) {
          if (!this.stock) throw new Error('StockMovementService not wired');
          const r = await this.stock.reverseDocument(tx, {
            referenceType: 'VISIT_PROCEDURE',
            referenceId: visitProcedureId,
            reversalReferenceType: 'VISIT_PROCEDURE_REVERSAL',
            reason: dto.reason.trim(),
            performedById: actor?.id ?? null,
          });
          stockReversed = r.reversed;
        }

        const billing = this.invoiceLifecycle
          ? await this.invoiceLifecycle.reverseVisitProcedureBillingTx(
              tx,
              visitProcedureId,
              dto.reason.trim(),
              actor?.id ?? null,
            )
          : null;

        await this.writeAudit(tx, {
          action: 'REMOVE_PROCEDURE',
          entityType: 'VisitProcedure',
          recordId: visitProcedureId,
          actorId: actor?.id,
          oldData: {
            visitId: vp.visitId,
            procedureName: vp.procedure?.name,
            cost: M.str(M.of(vp.cost)),
          },
          newData: { stockReversed, billing },
          reason: dto.reason.trim(),
        });

        return { success: true, stockReversed, billing };
      },
      { maxWait: 5000, timeout: 20000 },
    );
  }

  async writePrescription(
    visitId: string,
    dto: WritePrescriptionDto,
    actor?: ActingUser,
  ) {
    const visit = await this.loadVisit(visitId);
    if (!isVisitOpen(visit.status) && visit.status !== VisitStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot prescribe against a ${visit.status.toLowerCase()} visit.`,
      );
    }

    if (!dto.items?.length) {
      throw new BadRequestException('At least one medication required');
    }

    // A prescription naming a withdrawn or non-existent drug is a dispensing
    // hazard downstream in pharmacy; fail before it is written.
    const drugIds = [...new Set(dto.items.map((i) => i.drugId))];
    const drugs = await this.prisma.drug.findMany({
      where: { id: { in: drugIds } },
      select: { id: true, name: true, isActive: true },
    });
    const byId = new Map(drugs.map((d) => [d.id, d]));
    const missing = drugIds.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown drug id(s): ${missing.join(', ')}`,
      );
    }
    const inactive = drugs.filter((d) => !d.isActive);
    if (inactive.length) {
      throw new BadRequestException(
        `These drugs are no longer active: ${inactive.map((d) => d.name).join(', ')}`,
      );
    }

    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && isNaN(validUntil.getTime())) {
      throw new BadRequestException('Invalid validUntil date');
    }

    return this.prisma.$transaction(async (tx) => {
      const code = await this.docNum.next('RX', tx); // RX-YY-NNNN
      const prescription = await tx.prescription.create({
        data: {
          prescriptionCode: code,
          visitId,
          patientId: visit.patientId,
          dentistId: visit.dentistId,
          notes: dto.notes,
          validUntil,
          items: { create: dto.items },
        },
        include: {
          items: { include: { drug: true } },
        },
      });

      await this.writeAudit(tx, {
        action: 'WRITE_PRESCRIPTION',
        entityType: 'Prescription',
        recordId: prescription.id,
        actorId: actor?.id,
        newData: {
          visitId,
          prescriptionCode: code,
          items: dto.items.map((i) => ({
            drugId: i.drugId,
            dosage: i.dosage,
            frequency: i.frequency,
            duration: i.duration,
            quantity: i.quantity,
          })),
        },
      });

      return prescription;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // READ MODELS
  // ═══════════════════════════════════════════════════════════════════════

  /** Everything the clinical view needs for one visit. */
  async getVisitDashboard(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        patient: {
          include: {
            insurances: { where: { status: 'ACTIVE' } },
          },
        },
        dentist: true,
        appointment: true,
        procedures: {
          where: { deletedAt: null },
          include: { procedure: true },
          orderBy: { performedAt: 'desc' },
        },
        prescriptions: {
          include: {
            items: { include: { drug: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        imagingRecords: { orderBy: { takenAt: 'desc' } },
        labOrders: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!visit) throw new NotFoundException('Visit not found');

    const previousVisits = await this.prisma.visit.findMany({
      where: {
        patientId: visit.patientId,
        id: { not: visitId },
        status: VisitStatus.COMPLETED,
      },
      include: {
        procedures: { include: { procedure: true }, take: 3 },
        prescriptions: { take: 1 },
      },
      orderBy: { completedAt: 'desc' },
      take: 3,
    });

    // Money for a visit lives on its invoices — treatment procedures billed
    // at planning and visit procedures both land there. The visit's own
    // totalCost/amountPaid columns were only ever fed by legacy lines.
    const invoices =
      (await this.prisma.invoice.findMany({
        where: { visitId, deletedAt: null, status: { not: 'VOID' } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          currency: true,
          total: true,
          amountPaid: true,
          baseTotal: true,
          baseAmountPaid: true,
        },
      })) ?? [];
    const proceduresTotal = visit.procedures
      .filter((p) => !p.deletedAt)
      .reduce((sum, p) => M.add(sum, p.cost), M.zero());
    const totalCost = invoices.reduce(
      (sum, i) => M.add(sum, i.baseTotal),
      M.zero(),
    );
    const amountPaid = invoices.reduce(
      (sum, i) => M.add(sum, i.baseAmountPaid),
      M.zero(),
    );
    const balance = M.max(M.sub(totalCost, amountPaid), 0);
    const refundDue = M.max(M.sub(amountPaid, totalCost), 0);

    return {
      visit,
      previousVisits,
      financials: {
        // Strings, so a Decimal never round-trips through a float on the way
        // to the browser. The UI formats them. Clinic base currency.
        proceduresTotal: M.str(proceduresTotal),
        totalCost: M.str(totalCost),
        amountPaid: M.str(amountPaid),
        balance: M.str(balance),
        refundDue: M.str(refundDue),
        paymentStatus: this.derivePaymentStatus(totalCost, amountPaid),
        invoices: invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          status: i.status,
          currency: i.currency,
          total: M.str(M.of(i.total)),
          amountPaid: M.str(M.of(i.amountPaid)),
        })),
      },
      progress: this.calculateProgress(visit),
    };
  }

  /** Today's board: who is checked in or in the chair. */
  async getActiveVisits(date?: string) {
    const { start, end } = dayRange(date);

    return this.prisma.visit.findMany({
      where: {
        checkedInAt: { gte: start, lt: end },
        status: { in: [VisitStatus.ARRIVED, VisitStatus.IN_PROGRESS] },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientCode: true,
            avatar: true,
          },
        },
        dentist: { select: { id: true, firstName: true, lastName: true } },
        appointment: { select: { scheduledAt: true, type: true } },
        _count: { select: { procedures: true, prescriptions: true } },
      },
      orderBy: { checkedInAt: 'asc' },
    });
  }

  async getAllVisits(params: {
    page?: number;
    limit?: number;
    status?: string;
    date?: string;
    patientId?: string;
    dentistId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 15));
    const skip = (page - 1) * limit;

    // Whitelisted sort columns — anything else falls back to checkedInAt so a
    // crafted ?sortBy= can never reach an unindexed/relation field or inject.
    const SAFE_SORT = new Set([
      'checkedInAt',
      'createdAt',
      'startedAt',
      'completedAt',
      'status',
      'visitCode',
    ]);
    const sortBy = SAFE_SORT.has(params.sortBy ?? '')
      ? (params.sortBy as string)
      : 'checkedInAt';
    const sortOrder: 'asc' | 'desc' =
      params.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: Prisma.VisitWhereInput = {};

    if (params.status) {
      const status = params.status.toUpperCase();
      if (!(status in VisitStatus)) {
        throw new BadRequestException(
          `Unknown visit status "${params.status}". Expected one of: ${Object.keys(VisitStatus).join(', ')}.`,
        );
      }
      where.status = status as VisitStatus;
    }

    if (params.date) {
      const { start, end } = dayRange(params.date);
      where.checkedInAt = { gte: start, lt: end };
    }

    if (params.patientId) where.patientId = params.patientId;
    if (params.dentistId) where.dentistId = params.dentistId;

    if (params.search) {
      where.OR = [
        {
          patient: {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { patientCode: { contains: params.search, mode: 'insensitive' } },
            ],
          },
        },
        { visitCode: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [visits, total] = await Promise.all([
      this.prisma.visit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              avatar: true,
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
            select: { id: true, scheduledAt: true, type: true },
          },
          _count: { select: { procedures: true, prescriptions: true } },
        },
      }),
      this.prisma.visit.count({ where }),
    ]);

    return {
      data: visits,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getProcedures(query?: string) {
    const where: Prisma.ProcedureWhereInput = query
      ? {
          isActive: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
        }
      : { isActive: true };

    return this.prisma.procedure.findMany({ where, orderBy: { name: 'asc' } });
  }

  async searchDrugs(query: string) {
    return this.prisma.drug.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { genericName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
  }

  async getProgressReportsByPatient(patientId: string) {
    return this.prisma.progressReport.findMany({
      where: { patientId, deletedAt: null },
      include: {
        dentist: { select: { id: true, firstName: true, lastName: true } },
        visit: { select: { id: true, visitCode: true, startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════════════════════════════════

  private derivePaymentStatus(
    totalCost: Prisma.Decimal,
    amountPaid: Prisma.Decimal,
  ): BalanceStatus {
    if (totalCost.lte(0)) return BalanceStatus.OPEN;
    if (amountPaid.gte(totalCost)) return BalanceStatus.PAID;
    if (amountPaid.gt(0)) return BalanceStatus.PARTIALLY_PAID;
    return BalanceStatus.UNPAID;
  }

  /**
   * Clinic-configured conversion rate, or undefined to let the pricing engine
   * fall back to its own table. Mirrors TreatmentPlansService so both screens
   * price a foreign-currency procedure identically.
   */
  private async getClinicExchangeRate(
    fromCurrency: string,
  ): Promise<number | undefined> {
    if (fromCurrency === 'UGX') return undefined;

    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'EXCHANGE_RATE' },
    });
    if (!setting?.value) return undefined;

    const rate = Number(setting.value);
    if (!Number.isFinite(rate) || rate <= 0) {
      this.logger.warn(
        `ClinicSettings EXCHANGE_RATE="${setting.value}" is invalid; engine default will be used`,
      );
      return undefined;
    }
    return rate;
  }

  private calculateProgress(visit: {
    status: VisitStatus;
    bloodPressure?: string | null;
    pulseRate?: number | null;
    temperature?: unknown;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    amountPaid?: unknown;
    procedures?: unknown[];
    prescriptions?: unknown[];
  }) {
    return {
      checkedIn: true,
      examinationStarted:
        visit.status === VisitStatus.IN_PROGRESS ||
        visit.status === VisitStatus.COMPLETED,
      vitalsRecorded: !!(
        visit.bloodPressure ||
        visit.pulseRate ||
        visit.temperature
      ),
      soapComplete: !!(
        visit.subjective &&
        visit.objective &&
        visit.assessment &&
        visit.plan
      ),
      proceduresRecorded: (visit.procedures?.length ?? 0) > 0,
      prescriptionsWritten: (visit.prescriptions?.length ?? 0) > 0,
      paymentProcessed: M.of(visit.amountPaid as any).gt(0),
      completed: visit.status === VisitStatus.COMPLETED,
    };
  }
}
