// src/visit/visit.service.ts
//
// The clinical encounter: check-in → examination → completion.
//
// What changed when this was hardened for production:
//
//  • A visit is created ARRIVED, not IN_PROGRESS. The old code wrote
//    IN_PROGRESS, which made ARRIVED unreachable and `startExamination` —
//    which requires ARRIVED — fail with 400 for every caller, including the
//    "Start examination" button in VisitPage.
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
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentStatus,
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
    if (isVisitOpen(visit.status)) return { isAmendment: false };

    if (visit.status === VisitStatus.CANCELLED) {
      throw new BadRequestException(
        `Cannot change ${what} on a cancelled visit. Record a new visit instead.`,
      );
    }

    // COMPLETED from here on.
    const isAdmin =
      actor?.role === UserRole.SUPER_ADMIN || actor?.role === UserRole.ADMIN;
    const isTreatingDentist =
      !!actor?.staffId && actor.staffId === visit.dentistId;

    if (!isAdmin && !isTreatingDentist) {
      throw new ForbiddenException(
        `This visit is completed. Only the treating dentist or an administrator may amend ${what}.`,
      );
    }
    if (!amendmentReason?.trim()) {
      throw new BadRequestException(
        `This visit is completed. Provide amendmentReason to amend ${what} — ` +
          'the original values and the reason are kept in the audit trail.',
      );
    }
    return { isAmendment: true };
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
    try {
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
    } catch (err) {
      this.logger.error(
        `Audit write failed for visit ${entry.recordId} (${entry.action})`,
        err as Error,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * STEP 1 — open a visit for a checked-in appointment.
   * The visit starts ARRIVED; `startExamination` moves it to IN_PROGRESS.
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

    const visit = await this.prisma.$transaction(async (tx) => {
      const visitCode = await this.docNum.next('VIS', tx);
      const newVisit = await tx.visit.create({
        data: {
          visitCode,
          appointmentId: dto.appointmentId,
          patientId: appointment.patientId,
          dentistId,
          status: VisitStatus.ARRIVED,
          checkedInAt: new Date(),
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
          status: VisitStatus.ARRIVED,
        },
      });

      return newVisit;
    });

    return visit;
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
      const row = await tx.visit.update({
        where: { id: visitId },
        data: {
          status: VisitStatus.IN_PROGRESS,
          startedAt: visit.startedAt ?? new Date(),
        },
      });
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

    return this.prisma.$transaction(async (tx) => {
      // Heal any drift between the visit total and its procedure lines before
      // the record closes — this is the figure billing reads afterwards.
      const procedures = await tx.visitProcedure.findMany({
        where: { visitId },
        select: { cost: true },
      });
      const totalCost = procedures.reduce(
        (sum, p) => M.add(sum, p.cost),
        M.zero(),
      );
      const amountPaid = M.of(visit.amountPaid);
      const paymentStatus = this.derivePaymentStatus(totalCost, amountPaid);

      const completedVisit = await tx.visit.update({
        where: { id: visitId },
        data: {
          status: VisitStatus.COMPLETED,
          completedAt: new Date(),
          totalCost,
          paymentStatus,
          followUpDate,
          followUpNotes: dto.followUpNotes,
          recommendations: dto.recommendations,
        },
      });

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
        oldData: { status: visit.status, totalCost: M.str(visit.totalCost) },
        newData: {
          status: VisitStatus.COMPLETED,
          totalCost: M.str(totalCost),
          paymentStatus,
        },
      });

      return completedVisit;
    });
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
      include: {
        appointment: { select: { id: true, status: true } },
        _count: { select: { procedures: true, prescriptions: true } },
      },
    });
    if (!visit) throw new NotFoundException('Visit not found');
    assertVisitTransition(visit.status, VisitStatus.CANCELLED);

    // Cancelling an encounter that already has billable work on it would
    // orphan those lines. Those visits are completed, then credited.
    if (visit._count.procedures > 0) {
      throw new BadRequestException(
        `Cannot cancel a visit with ${visit._count.procedures} recorded procedure(s). ` +
          'Complete the visit and credit the invoice instead.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.visit.update({
        where: { id: visitId },
        data: { status: VisitStatus.CANCELLED, completedAt: new Date() },
      });

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
    if (!isVisitOpen(visit.status)) {
      throw new BadRequestException(
        `Cannot add a procedure to a ${visit.status.toLowerCase()} visit.`,
      );
    }

    const procedure = await this.prisma.procedure.findUnique({
      where: { id: dto.procedureId },
    });
    if (!procedure) throw new NotFoundException('Procedure not found');
    if (!procedure.isActive) {
      throw new BadRequestException(
        `Procedure ${procedure.name} is no longer active and cannot be recorded.`,
      );
    }

    const toothNumbers = dto.toothNumbers ?? [];
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

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.visitProcedure.create({
        data: {
          visitId,
          procedureId: dto.procedureId,
          toothNumbers,
          surfaces: (dto.surfaces as any) ?? [],
          notes: dto.notes,
          cost: finalCost,
          unitPrice: M.money(pricing.pricePerUnit),
          currency: 'UGX',
          exchangeRate: M.of(pricing.exchangeRate ?? 1),
          originalPrice: M.money(pricing.totalPrice),
          originalCurrency: procedure.currency,
          finalCurrency: 'UGX',
        },
        include: { procedure: true },
      });

      // Same transaction as the insert: a failure here used to leave the
      // visit total out of step with its own lines.
      const updatedVisit = await tx.visit.update({
        where: { id: visitId },
        data: { totalCost: { increment: finalCost } },
        select: { totalCost: true, amountPaid: true },
      });

      await tx.visit.update({
        where: { id: visitId },
        data: {
          paymentStatus: this.derivePaymentStatus(
            M.of(updatedVisit.totalCost),
            M.of(updatedVisit.amountPaid),
          ),
        },
      });

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
          quantity: pricing.quantity,
          cataloguePrice: M.str(enginePrice),
          chargedCost: M.str(finalCost),
          pricingBreakdown: pricing.breakdown,
        },
        reason: dto.overrideReason,
      });

      return row;
    });

    return created;
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

    // Figures come from the stored columns (and the procedure lines), not from
    // the hardcoded zeros this used to return.
    const proceduresTotal = visit.procedures.reduce(
      (sum, p) => M.add(sum, p.cost),
      M.zero(),
    );
    const totalCost = M.of(visit.totalCost);
    const amountPaid = M.of(visit.amountPaid);
    const balance = M.sub(totalCost, amountPaid);

    return {
      visit,
      previousVisits,
      financials: {
        // Strings, so a Decimal never round-trips through a float on the way
        // to the browser. The UI formats them.
        proceduresTotal: M.str(proceduresTotal),
        totalCost: M.str(totalCost),
        amountPaid: M.str(amountPaid),
        balance: M.str(balance),
        paymentStatus: visit.paymentStatus,
        /** True when the visit total has drifted from its procedure lines. */
        totalsInSync: M.eq(totalCost, proceduresTotal),
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
      where: { patientId },
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
