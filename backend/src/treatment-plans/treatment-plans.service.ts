// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/treatment-plans/treatment-plans.service.ts
//
// Clean financial model:
//   TreatmentProcedure = pricing snapshot (audit trail)
//   LedgerEntry        = source of truth for billing
//   ProcedureSession   = clinical tracker (billing optional per-session)
// ═══════════════════════════════════════════════════════════════════════════
import { ConditionsService } from '../conditions/conditions.service';
import { ChartEntryType, ChartEntryStatus } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  TreatmentStatus,
  BalanceStatus,
  LedgerEntryStatus,
  SessionStatus,
  SessionLedgerStatus,
  ToothSurface,
  SessionType, // Add this
  BillingType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertFdiTooth,
  assertSurfaces,
} from '../common/dental/dental-validation';
import {
  isReplacementProcedure,
  isExtractionProcedure,
  findToothPresenceViolation,
  findDuplicateProcedure,
} from '../common/dental/procedure-safety';
import {
  assertToothPresence,
  findAbsentTeeth,
} from '../common/dental/tooth-presence';
import { InvoiceLifecycleService } from '../billing/invoice-lifecycle.service';
import { M } from '../common/money/money';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import {
  PricingEngine,
  PricingModel,
  PricingInput,
} from '../common/pricing/pricing.engine';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
  AddTreatmentProcedureDto,
  ReorderProceduresDto,
  CreateSessionDto,
  UpdateSessionDto,
} from './dto/treatment-plan.dto';

import {
  EditSessionDto,
  DeleteSessionDto,
  EditToothStatusDto,
} from './dto/edit-session.dto';

import { PricingCalculationDto } from './dto/pricing-calculation.dto';

export {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
  AddTreatmentProcedureDto,
  ReorderProceduresDto,
  CreateSessionDto,
  UpdateSessionDto,
};

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  dentistId?: string;
  patientId?: string;
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class TreatmentPlansService {
  private readonly logger = new Logger(TreatmentPlansService.name);

  constructor(
    private prisma: PrismaService,
    private invoiceLifecycle: InvoiceLifecycleService,
    private docNum: DocumentNumberService,
    private conditionsService: ConditionsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // CATALOG
  // ═══════════════════════════════════════════════════════════════════════

  async getProcedureCatalog(query?: string, categoryId?: string) {
    const where: Prisma.ProcedureWhereInput = { isActive: true };
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (categoryId) {
      const subCats = await this.prisma.procedureCategory.findMany({
        where: { parentId: categoryId },
        select: { id: true },
      });
      where.categoryId = { in: [categoryId, ...subCats.map((c) => c.id)] };
    }

    return this.prisma.procedure.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, code: true, color: true } },
        inputs: {
          include: {
            inventoryItem: {
              select: { id: true, name: true, unit: true, unitCost: true },
            },
          },
        },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async getProcedureCategories() {
    const categories = await this.prisma.procedureCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        procedures: {
          where: { isActive: true },
          select: { id: true },
        },
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      code: cat.code,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      parentId: cat.parentId,
      isActive: cat.isActive,
      sortOrder: cat.sortOrder,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      _count: {
        procedures: cat.procedures.length,
      },
    }));
  }

  async getPatientTreatmentPlans(patientId: string) {
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { patientId },
      include: {
        dentist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        procedures: {
          where: { status: { not: TreatmentStatus.CANCELLED } },
          select: { status: true, totalPrice: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((plan) => {
      const procs = plan.procedures;
      const completed = procs.filter(
        (p) => p.status === TreatmentStatus.COMPLETED,
      );
      return {
        ...plan,
        summary: {
          totalProcedures: procs.length,
          completedCount: completed.length,
          completionPercent:
            procs.length > 0
              ? Math.round((completed.length / procs.length) * 100)
              : 0,
          // Sums are computed with Decimal arithmetic, then serialized as
          // strings so JSON consumers receive lossless values. UI may parse
          // these with their own currency formatter.
          totalCost: M.str(M.sum(procs.map((p) => p.totalPrice ?? 0))),
          completedCost: M.str(M.sum(completed.map((p) => p.totalPrice ?? 0))),
          remainingCost: M.str(
            M.sub(
              M.sum(procs.map((p) => p.totalPrice ?? 0)),
              M.sum(completed.map((p) => p.totalPrice ?? 0)),
            ),
          ),
          plannedCount: procs.filter(
            (p) => p.status === TreatmentStatus.PLANNED,
          ).length,
          inProgressCount: procs.filter(
            (p) => p.status === TreatmentStatus.IN_PROGRESS,
          ).length,
          inputsCost: 0,
        },
      };
    });
  }

  async getTreatmentPlan(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientCode: true,
          },
        },
        dentist: { select: { id: true, firstName: true, lastName: true } },
        procedures: {
          where: { deletedAt: null },
          include: {
            procedure: {
              include: {
                category: { select: { id: true, name: true, color: true } },
                inputs: {
                  include: {
                    inventoryItem: {
                      select: {
                        id: true,
                        name: true,
                        unit: true,
                        unitCost: true,
                      },
                    },
                  },
                },
              },
            },
            targets: true,
            sessions: {
              where: { deletedAt: null },
              include: { targets: true },
              orderBy: { sessionNumber: 'asc' },
            },
            ledgerEntry: true,
            // Surface the linked invoice (if any) so the UI can lock pricing
            // fields when the invoice is POSTED or has payments.
            invoiceItems: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                invoice: {
                  select: {
                    id: true,
                    status: true,
                    paymentStatus: true,
                    amountPaid: true,
                  },
                },
              },
            },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!plan) throw new NotFoundException('Treatment plan not found');

    // Decorate each procedure with flat invoice status fields the UI reads.
    const decoratedProcedures = plan.procedures.map((proc: any) => {
      const item = proc.invoiceItems?.[0] ?? null;
      const invoice = item?.invoice ?? null;
      return {
        ...proc,
        invoiceId: invoice?.id ?? null,
        invoiceStatus: invoice?.status ?? null,
        invoicePaymentStatus: invoice?.paymentStatus ?? null,
        invoiceAmountPaid: invoice ? Number(invoice.amountPaid) : 0,
      };
    });

    // ── Compute summary ──────────────────────────────────────────────────────
    const activeProcedures = plan.procedures.filter(
      (p) => p.status !== TreatmentStatus.CANCELLED,
    );
    const completedProcs = activeProcedures.filter(
      (p) => p.status === TreatmentStatus.COMPLETED,
    );
    const inProgressProcs = activeProcedures.filter(
      (p) => p.status === TreatmentStatus.IN_PROGRESS,
    );
    const plannedProcs = activeProcedures.filter(
      (p) => p.status === TreatmentStatus.PLANNED,
    );

    const totalCost = M.sum(activeProcedures.map((p) => p.totalPrice ?? 0));
    const completedCost = M.sum(completedProcs.map((p) => p.totalPrice ?? 0));
    // Sum-of-sums in Decimal: Σ (qty × unitCost) across each procedure's inputs.
    let inputsCost = M.zero();
    for (const p of activeProcedures) {
      const inputs = (p.actualInputsUsed as any[]) ?? [];
      for (const i of inputs) {
        inputsCost = M.add(
          inputsCost,
          M.mul(M.of(i?.quantityUsed ?? 0), M.of(i?.unitCost ?? 0)),
        );
      }
    }

    const summary = {
      totalProcedures: activeProcedures.length,
      plannedCount: plannedProcs.length,
      inProgressCount: inProgressProcs.length,
      completedCount: completedProcs.length,
      totalCost: M.str(totalCost),
      completedCost: M.str(completedCost),
      remainingCost: M.str(M.sub(totalCost, completedCost)),
      inputsCost: M.str(inputsCost),
      completionPercent:
        activeProcedures.length > 0
          ? Math.round((completedProcs.length / activeProcedures.length) * 100)
          : 0,
    };

    return { ...plan, procedures: decoratedProcedures, summary };
  }

  async createTreatmentPlan(dto: CreateTreatmentPlanDto) {
    const [patient, dentist] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: dto.patientId } }),
      this.prisma.staff.findUnique({ where: { id: dto.dentistId } }),
    ]);

    if (!patient)
      throw new NotFoundException(`Patient ${dto.patientId} not found`);
    if (!dentist)
      throw new NotFoundException(`Dentist (Staff) ${dto.dentistId} not found`);

    // Atomic, concurrency-safe plan code (TP-YY-NNNN). Generated inside the same
    // transaction as the insert so a rollback unwinds the counter increment too.
    return this.prisma.$transaction(async (tx) => {
      const planCode = await this.docNum.next('TP', tx);
      return tx.treatmentPlan.create({
        data: {
          planCode,
          patientId: dto.patientId,
          dentistId: dto.dentistId,
          title: dto.title,
          description: dto.description,
          diagnosis: dto.diagnosis,
          priority: dto.priority ?? 'NORMAL',
          notes: dto.notes,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          consentSigned: dto.consentSigned ?? false,
          consentDate: dto.consentDate ? new Date(dto.consentDate) : null,
          status: TreatmentStatus.PLANNED,
        },
        include: { dentist: { select: { firstName: true, lastName: true } } },
      });
    });
  }

  async deleteTreatmentPlan(id: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id },
      select: { id: true, _count: { select: { procedures: true } } },
    });
    if (!plan) throw new NotFoundException('Treatment plan not found');

    if (plan._count.procedures > 0) {
      throw new BadRequestException(
        `Cannot delete: plan still has ${plan._count.procedures} procedure(s). ` +
          'Remove or cancel all procedures first.',
      );
    }

    await this.prisma.treatmentPlan.delete({ where: { id } });
    return { success: true };
  }

  async updateTreatmentPlan(id: string, dto: UpdateTreatmentPlanDto) {
    return this.prisma.$transaction(async (tx) => {
      const data: any = {};
      const fields: (keyof UpdateTreatmentPlanDto)[] = [
        'title',
        'description',
        'diagnosis',
        'priority',
        'notes',
        'consentSigned',
      ];
      fields.forEach((f) => {
        if (dto[f] !== undefined) data[f] = dto[f];
      });
      if (dto.startDate !== undefined)
        data.startDate = dto.startDate ? new Date(dto.startDate) : null;
      if (dto.endDate !== undefined)
        data.endDate = dto.endDate ? new Date(dto.endDate) : null;
      if (dto.consentDate !== undefined)
        data.consentDate = dto.consentDate ? new Date(dto.consentDate) : null;

      // Status handling:
      //   • PLANNED / IN_PROGRESS / COMPLETED → "auto" — clear any sticky
      //     override and let recalculatePlanTx derive the real value from the
      //     procedures. (Sending any of these acts as "resume auto".)
      //   • ON_HOLD / REFERRED / CANCELLED → admin override, applied verbatim
      //     and preserved by future recalcs.
      let shouldRecalc = false;
      if (dto.status !== undefined) {
        const autoDerived: TreatmentStatus[] = [
          TreatmentStatus.PLANNED,
          TreatmentStatus.IN_PROGRESS,
          TreatmentStatus.COMPLETED,
        ];
        if (autoDerived.includes(dto.status as TreatmentStatus)) {
          // Temporarily drop to PLANNED so recalc isn't blocked by an existing
          // sticky override; the real value is computed below.
          data.status = TreatmentStatus.PLANNED;
          shouldRecalc = true;
        } else {
          data.status = dto.status;
        }
      }

      const updated = await tx.treatmentPlan.update({ where: { id }, data });

      if (shouldRecalc) {
        await this.recalculatePlanTx(tx, id);
        return tx.treatmentPlan.findUnique({ where: { id } });
      }

      return updated;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD PROCEDURE — pricing engine integration with ProcedureTarget
  // ═══════════════════════════════════════════════════════════════════════════

  private async getClinicExchangeRate(
    tx: Prisma.TransactionClient,
    fromCurrency: string,
  ): Promise<number | undefined> {
    if (fromCurrency === 'UGX') return undefined; // no conversion needed

    const setting = await tx.clinicSettings.findUnique({
      where: { key: 'EXCHANGE_RATE' },
    });

    if (!setting?.value) return undefined; // engine will fall back to its default table

    const rate = Number(setting.value);
    if (!Number.isFinite(rate) || rate <= 0) {
      this.logger.warn(
        `ClinicSettings EXCHANGE_RATE="${setting.value}" is invalid; engine default will be used`,
      );
      return undefined;
    }
    return rate;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CLINICAL SAFETY GUARDS (shared by addProcedure)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Blocks restorative work on a tooth recorded ABSENT by a clinically-live
   * (ACTIVE / MONITORED) condition. A RESOLVED / RULED_OUT absence no longer
   * blocks — e.g. a mis-diagnosed extraction that was ruled out, or a site that
   * was restored and had its absence condition resolved. Replacement procedures
   * (implant / bridge / denture) are always allowed; surface-level work never is.
   *
   * Absence detection (dual-source, data-driven) lives in tooth-presence.ts; the
   * allow/deny decision is the pure findToothPresenceViolation() so it is
   * unit-tested without a DB (see procedure-safety.spec.ts).
   */
  async assertToothPresenceForProcedure(
    patientId: string,
    procedure: { name: string; code?: string | null },
    toothNumbers: number[],
    surfaces: (string | null | undefined)[],
  ): Promise<void> {
    if (toothNumbers.length === 0) return;

    const absentTeeth = await findAbsentTeeth(
      this.prisma,
      patientId,
      toothNumbers,
    );
    if (absentTeeth.size === 0) return;

    const violation = findToothPresenceViolation({
      toothNumbers,
      hasSurfaces: (surfaces?.filter(Boolean).length ?? 0) > 0,
      absentTeeth,
      isReplacement: isReplacementProcedure(procedure),
    });
    if (!violation) return;

    if (violation.kind === 'SURFACE_ON_ABSENT') {
      throw new BadRequestException(
        `Tooth ${violation.tooth} is recorded as absent — surface-level work ` +
          `cannot be planned on a missing tooth. Restore the site first, or ` +
          `resolve the absence if it was recorded in error.`,
      );
    }
    throw new BadRequestException(
      `Tooth ${violation.tooth} is recorded as absent — "${procedure.name}" ` +
        `cannot be planned on a missing tooth. Use an implant / bridge / denture ` +
        `to restore the site, or resolve the absence if it was recorded in error.`,
    );
  }

  /**
   * Rejects an accidental double-entry: the SAME procedure already PENDING /
   * PLANNED / IN_PROGRESS / ON_HOLD on an overlapping tooth (and, for
   * surface-specific work, an overlapping surface) for the same patient.
   * Completed / cancelled / referred procedures never block — a filling can be
   * redone years later. Patient-wide, so a duplicate in a second plan is caught.
   *
   * The collision rule is the pure findDuplicateProcedure() (unit-tested); this
   * method only does the scoped DB read and formats the 409.
   */
  async assertNoDuplicateActiveProcedure(
    patientId: string,
    procedureId: string,
    procedureName: string,
    toothNumbers: number[],
    surfaces: (string | null | undefined)[],
    excludeProcedureId?: string,
  ): Promise<void> {
    const existing = await this.prisma.treatmentProcedure.findMany({
      where: {
        procedureId,
        treatmentPlan: { patientId },
        deletedAt: null,
        // On an EDIT, exclude the procedure being edited so it never collides
        // with its own (about-to-be-replaced) targets.
        ...(excludeProcedureId ? { id: { not: excludeProcedureId } } : {}),
        status: {
          in: [
            TreatmentStatus.PENDING,
            TreatmentStatus.PLANNED,
            TreatmentStatus.IN_PROGRESS,
            TreatmentStatus.ON_HOLD,
          ],
        },
      },
      select: { targets: { select: { toothNumber: true, surfaces: true } } },
    });

    const dupTooth = findDuplicateProcedure({
      toothNumbers,
      surfaces,
      existing,
    });
    if (dupTooth === null) return;
    if (dupTooth === -1) {
      throw new ConflictException(
        `"${procedureName}" is already planned or in progress for this patient. ` +
          `Complete or cancel the existing one before adding it again.`,
      );
    }
    throw new ConflictException(
      `"${procedureName}" is already planned or in progress on tooth ${dupTooth}. ` +
        `Complete or cancel the existing procedure before adding a duplicate.`,
    );
  }

  async addProcedure(
    planId: string,
    dto: AddTreatmentProcedureDto,
    actorUserId?: string,
    idempotencyKey?: string,
  ) {
    // ── Idempotency replay check (mirrors executeSession pattern) ─────────────
    // If the client retries the same Idempotency-Key (network blip, double-click,
    // browser back-forward), we replay the original 201 response instead of
    // creating a second TreatmentProcedure row + duplicate chart entries.
    if (idempotencyKey) {
      const prior = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (prior?.response) return prior.response as any;
    }

    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: {
        procedures: { select: { sequence: true, visitGroup: true } },
        patient: { select: { id: true } },
      },
    });
    if (!plan)
      throw new NotFoundException(`Treatment plan ${planId} not found`);

    const procedure = await this.prisma.procedure.findFirst({
      where: { OR: [{ id: dto.procedureId }, { code: dto.procedureId }] },
    });
    if (!procedure)
      throw new NotFoundException(`Procedure ${dto.procedureId} not found`);
    if (!procedure.isActive)
      throw new BadRequestException('Procedure is inactive');

    const toothNumbers = dto.toothNumbers ?? [];
    const surfaces = dto.surfaces ?? [];

    // H-3: every persisted tooth number must be a valid FDI code.
    for (const t of toothNumbers) assertFdiTooth(t);

    // ── Clinical safety guards (run before the write transaction) ────────────
    //   1. No restorative work on a tooth that is recorded ABSENT.
    //   2. No duplicate of a procedure already active on the same tooth.
    // Either throws a 400 / 409 so an invalid plan never persists.
    await this.assertToothPresenceForProcedure(
      plan.patientId,
      procedure,
      toothNumbers,
      surfaces,
    );
    await this.assertNoDuplicateActiveProcedure(
      plan.patientId,
      procedure.id,
      procedure.name,
      toothNumbers,
      surfaces,
    );

    const sessionType = (dto.sessionType ?? 'SINGLE') as SessionType; // ✅ Correct type
    const sessionCount =
      dto.sessionType === 'MULTI' ? (dto.sessionCount ?? 1) : 1;

    let txResult: any;
    try {
      txResult = await this.prisma.$transaction(
      async (tx) => {
        // ── FIX 4: resolve exchange rate from ClinicSettings, ONE source ────
        const clinicRate = await this.getClinicExchangeRate(
          tx,
          procedure.currency,
        );

        const pricingInput: PricingInput = {
          toothNumbers,
          exchangeRate: clinicRate, // undefined → engine default table
          baseCurrency: 'UGX',
        };
        if (dto.quantityBasis != null)
          pricingInput.quantityOverride = dto.quantityBasis;
        if (dto.sessionType === 'MULTI' && dto.sessionCount)
          pricingInput.sessionCount = dto.sessionCount;

        const pricing = PricingEngine.calculate(
          {
            basePrice: procedure.basePrice,
            baseCost: procedure.baseCost ?? 0,
            pricingModel: procedure.pricingModel,
            priceRangeMin: procedure.priceRangeMin,
            priceRangeMax: procedure.priceRangeMax,
            currency: procedure.currency,
          },
          pricingInput,
        );

        // ── FIX 5: override is recorded as a DISCOUNT, snapshot stays consistent ──
        const engineTotal = pricing.totalPrice;
        let finalTotalPrice = engineTotal;
        let discountAmount = dto.discountAmount ?? pricing.discountAmount ?? 0;
        const taxAmount = dto.taxAmount ?? pricing.taxAmount ?? 0;

        if (dto.isPriceOverridden && dto.totalPrice != null) {
          // Override is a user-entered number; validate as a number, then
          // perform the discount delta in Decimal to avoid float drift.
          const overrideNum = Number(dto.totalPrice);
          if (!Number.isFinite(overrideNum) || overrideNum < 0)
            throw new BadRequestException('Invalid override price');
          finalTotalPrice = overrideNum;
          // The difference becomes an explicit discount (or surcharge if negative).
          // pricePerUnit / subtotalPrice stay = engine values (true audit trail).
          discountAmount = this.roundMoney(
            M.sub(engineTotal ?? 0, overrideNum).toNumber(),
          );
        }

        if (
          finalTotalPrice == null ||
          Number.isNaN(Number(finalTotalPrice)) ||
          Number(finalTotalPrice) < 0
        ) {
          throw new BadRequestException(
            'Price computation failed. Check the procedure basePrice configuration.',
          );
        }

        // ── FIX 4: baseAmount derived from the SAME rate the engine used ────
        const effectiveRate = pricing.exchangeRate; // 1 if same currency
        const finalBaseAmount =
          procedure.currency === 'UGX'
            ? finalTotalPrice
            : this.roundMoney(finalTotalPrice * effectiveRate);

        // Sequence
        const visitGroup = dto.visitGroup ?? 1;
        const groupProcs = plan.procedures.filter(
          (p: any) => p.visitGroup === visitGroup,
        );
        const maxSeq =
          groupProcs.length > 0
            ? Math.max(...groupProcs.map((p: any) => p.sequence))
            : (visitGroup - 1) * 100;
        const sequence = dto.sequence ?? maxSeq + 1;

        const billingType = dto.billingType ?? 'PAY_FULL';

        const billingContext: any = {};
        if (toothNumbers.length) billingContext.teeth = toothNumbers;
        if (pricing.quantity > 1 && procedure.pricingModel !== 'FIXED') {
          billingContext.quantity = pricing.quantity;
          billingContext.pricingModel = procedure.pricingModel;
        }
        if (dto.isPriceOverridden)
          billingContext.priceOverride = {
            engineTotal,
            override: finalTotalPrice,
            recordedDiscount: discountAmount,
          };

        // STEP 1: TreatmentProcedure — FIX 6 (procedure.id), FIX 5 (consistent snapshot)
        const tp = await tx.treatmentProcedure.create({
          data: {
            treatmentPlanId: planId,
            procedureId: procedure.id, // ← FIX 7: never dto.procedureId
            notes: dto.notes,
            scheduledDate: dto.scheduledDate
              ? new Date(dto.scheduledDate)
              : null,
            sequence,
            visitGroup,
            status: TreatmentStatus.PLANNED,
            billingContext: Object.keys(billingContext).length
              ? billingContext
              : undefined,
            pricingModel: procedure.pricingModel,
            billingUnit: pricing.billingUnit,
            quantity: pricing.quantity,
            pricePerUnit: pricing.pricePerUnit, // engine truth
            subtotalPrice: pricing.subtotalPrice, // engine truth
            discountAmount, // ← carries the override delta
            taxAmount,
            totalPrice: finalTotalPrice, // subtotal - discount + tax

            costPerUnit: pricing.costPerUnit,
            subtotalCost: pricing.subtotalCost,

            currency: procedure.currency,
            exchangeRate:
              effectiveRate === 1 ? null : new Prisma.Decimal(effectiveRate),
            baseCurrency: 'UGX',
            baseAmount: finalBaseAmount,

            amountPaid: 0,
            paymentStatus: BalanceStatus.OPEN,
            ledgerStatus: SessionLedgerStatus.UNPOSTED,
            sessionType: sessionType,
            sessionCount: sessionCount,
            billingType,
            providerId: dto.providerId,
          },
          include: { procedure: true },
        });

        // STEP 2: ProcedureTarget per tooth
        const createdTargets: any[] = [];
        for (const toothNumber of toothNumbers) {
          createdTargets.push(
            await tx.procedureTarget.create({
              data: {
                treatmentProcedureId: tp.id,
                toothNumber,
                surfaces: assertSurfaces(dto.surfaces, toothNumber),
                unitIndex:
                  procedure.pricingModel === 'PER_BRACKET'
                    ? toothNumbers.indexOf(toothNumber) + 1
                    : null,
              },
            }),
          );
        }

        // STEP 3: supersede stale PLANNED chart entries
        for (const toothNumber of toothNumbers) {
          await tx.chartEntry.updateMany({
            where: {
              patientId: plan.patientId,
              toothNumber,
              type: 'PLANNED',
              status: 'ACTIVE',
              procedureCode: procedure.code,
            },
            data: { status: 'SUPERSEDED' },
          });
        }

        // ── FIX 8: actually CREATE the PLANNED chart entries ──
        const chartEntries: any[] = [];
        if (toothNumbers.length > 0) {
          for (const toothNumber of toothNumbers) {
            chartEntries.push(
              await tx.chartEntry.create({
                data: {
                  patientId: plan.patientId,
                  visitId: dto.visitId ?? null,
                  toothNumber,
                  surfaces: assertSurfaces(dto.surfaces, toothNumber),
                  type: 'PLANNED',
                  status: 'ACTIVE',
                  label: procedure.name,
                  procedureCode: procedure.code,
                  treatmentProcedureId: tp.id,
                  notes: dto.notes,
                  providerId: dto.providerId ?? null,
                },
              }),
            );
          }
        } else {
          chartEntries.push(
            await tx.chartEntry.create({
              data: {
                patientId: plan.patientId,
                visitId: dto.visitId ?? null,
                toothNumber: null,
                surfaces: [], // mouth-level entry — surfaces require a tooth
                type: 'PLANNED',
                status: 'ACTIVE',
                label: procedure.name,
                procedureCode: procedure.code,
                treatmentProcedureId: tp.id,
                notes: dto.notes,
                providerId: dto.providerId ?? null,
              },
            }),
          );
        }

        // STEP 5: invoice item params — addProcedureItem called AFTER tx commits
        // (cannot call it here: tx hasn't committed tp yet, FK would fail)

        // STEP 6: condition links
        const conditionLinks: any[] = [];
        if (dto.linkedConditionIds?.length) {
          for (const patientConditionId of dto.linkedConditionIds) {
            const cond = await tx.patientCondition.findFirst({
              where: {
                id: patientConditionId,
                patientId: plan.patientId,
                deletedAt: null, // ← skip soft-deleted
              },
            });
            if (!cond) continue;
            conditionLinks.push(
              await tx.conditionProcedureLink.create({
                data: { patientConditionId, treatmentProcedureId: tp.id },
              }),
            );
          }
        }

        await this.recalculatePlanCostTx(tx, planId);

        // ── Audit: procedure created on plan ─────────────────────────────
        // userId is the LOGGED-IN user (User.id from JWT); providerId is the
        // assigned clinician (Staff.id) and stays in newData as a clinical
        // fact — never use it as the audit actor (different FK target).
        await this.writeAuditTx(tx, {
          action: 'CREATE',
          module: 'TREATMENT_PLANS',
          entityType: 'TreatmentProcedure',
          entityId: tp.id,
          userId: actorUserId ?? null,
          newData: {
            treatmentPlanId: planId,
            procedureId: procedure.id,
            procedureCode: procedure.code,
            providerId: dto.providerId ?? null,
            toothNumbers,
            surfaces: dto.surfaces ?? [],
            totalPrice: finalTotalPrice,
            currency: procedure.currency,
            sessionType,
            sessionCount,
            billingType,
            isPriceOverridden: dto.isPriceOverridden === true,
          },
        });

        const result: any = {
          ...tp,
          targets: createdTargets,
          pricing: {
            quantity: pricing.quantity,
            pricePerUnit: pricing.pricePerUnit,
            subtotalPrice: pricing.subtotalPrice,
            discountAmount,
            taxAmount,
            totalPrice: finalTotalPrice,
            currency: procedure.currency,
            exchangeRate: effectiveRate,
            baseAmount: finalBaseAmount,
            breakdown: pricing.breakdown,
            costPerUnit: pricing.costPerUnit,
            subtotalCost: pricing.subtotalCost,
            margin: this.roundMoney(
              finalTotalPrice - (pricing.subtotalCost ?? 0),
            ),
          },
          sessions: [],
          chartEntries,
          conditionLinks,
          billingStrategy: 'ACTIVE',
          wasPriceOverridden: dto.isPriceOverridden === true,
          // carry pricing snapshot for post-tx invoice item creation
          _invoiceParams: {
            patientId: plan.patientId,
            visitId: dto.visitId ?? null,
            planId,
            initialPaymentAmount: (dto as any).initialPaymentAmount ?? null,
            initialPaymentCurrency: (dto as any).initialPaymentCurrency ?? null,
            tp: {
              id: tp.id,
              description: this.buildDescription(
                procedure.name,
                toothNumbers,
                dto.surfaces as any,
              ),
              quantity: pricing.quantity,
              pricePerUnit: pricing.pricePerUnit,
              discountAmount,
              taxAmount,
              totalPrice: finalTotalPrice,
              currency: procedure.currency,
              exchangeRate: effectiveRate,
              baseAmount: finalBaseAmount,
            },
          },
        };

        // ── Persist idempotency record INSIDE the tx so a racing duplicate
        //    violates the PK on `key` and rolls its whole transaction back —
        //    it can never create a second TreatmentProcedure + chart entries.
        // (C1 FIX) This block was previously DEAD: it sat after a `return`, so
        //    the key was never stored, the replay check never hit, and the
        //    P2002 catch never fired. The client-supplied Idempotency-Key was
        //    silently ignored, so a double-click / retry created a duplicate
        //    procedure + duplicate chart entries + duplicate invoice item.
        if (idempotencyKey) {
          const { _invoiceParams: _omit, ...storable } = result;
          await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              scope: 'ADD_TREATMENT_PROCEDURE',
              response: storable as any,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        return result;
      },
      {
        maxWait: 5000,
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    // STEP 5 (post-tx): add procedure to draft invoice now that tp is committed.
    // Runs OUTSIDE the tx because the FK requires the TreatmentProcedure row to
    // exist first. Bounded retry + a durable flag (zero linked InvoiceItems)
    // replace the old swallow-only catch that caused silent billing drift.
    const { _invoiceParams, ...result } = txResult as any;
    await this.addProcedureItemSafe(_invoiceParams);

    return result;
    } catch (e) {
    // A racing duplicate committed first; replay its stored response instead
    // of surfacing the unique-violation error to the caller.
    if (
      idempotencyKey &&
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      const prior = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (prior?.response) return prior.response as any;
    }
    throw e;
  }
}

  /**
   * Post-commit invoice-item creation with bounded retry.
   *
   * `addProcedureItem` must run after the TreatmentProcedure is committed (FK),
   * so it cannot live inside the addProcedure transaction. To stop a transient
   * failure from silently leaving a committed procedure with no invoice item, we
   * retry a few times and, on persistent failure, log at ERROR. We deliberately
   * do NOT throw: the procedure is already committed, and throwing would make the
   * client retry addProcedure and create a duplicate. The procedure is instead
   * left with zero linked InvoiceItems — the durable flag that
   * `reconcileMissingInvoiceItems` queries on to retry later.
   *
   * @returns true if the invoice item was created, false if it ultimately failed.
   */
  private async addProcedureItemSafe(
    params: {
      patientId: string;
      visitId: string | null;
      planId: string;
      initialPaymentAmount?: number | null;
      initialPaymentCurrency?: string | null;
      tp: {
        id: string;
        description: string;
        quantity: number;
        pricePerUnit: number;
        discountAmount: number;
        taxAmount: number;
        totalPrice: number;
        currency: string;
        exchangeRate?: number | null;
        baseAmount: number;
      };
    },
    maxAttempts = 3,
  ): Promise<boolean> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.invoiceLifecycle.addProcedureItem(
          params.patientId,
          params.visitId,
          params.planId,
          params.tp,
          params.initialPaymentAmount ?? null,
          params.initialPaymentCurrency ?? null,
        );
        if (attempt > 1) {
          this.logger.log(
            `[addProcedureItemSafe] recovered invoice item for tp ${params.tp.id} on attempt ${attempt}`,
          );
        }
        return true;
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `[addProcedureItemSafe] attempt ${attempt}/${maxAttempts} failed for tp ${params.tp.id}: ${err}`,
        );
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }
    }

    this.logger.error(
      `[BILLING_DRIFT] Procedure ${params.tp.id} (plan ${params.planId}, patient ` +
        `${params.patientId}) was committed but has NO invoice item after ` +
        `${maxAttempts} attempts. It is flagged (zero linked InvoiceItems); run ` +
        `reconcileMissingInvoiceItems to retry. Last error: ${lastErr}`,
    );
    return false;
  }

  /**
   * Retry invoice-item creation for procedures that were committed but never got
   * an InvoiceItem — e.g. a transient failure in the post-commit step of
   * addProcedure. The flag is: a non-cancelled TreatmentProcedure with zero
   * linked InvoiceItems. Pass a planId to scope to one plan, omit to sweep all.
   */
  async reconcileMissingInvoiceItems(planId?: string) {
    const procedures = await this.prisma.treatmentProcedure.findMany({
      where: {
        ...(planId ? { treatmentPlanId: planId } : {}),
        deletedAt: null,
        status: { not: TreatmentStatus.CANCELLED },
        invoiceItems: { none: {} },
      },
      include: {
        procedure: { select: { name: true } },
        targets: { select: { toothNumber: true, surfaces: true } },
        treatmentPlan: { select: { id: true, patientId: true } },
      },
    });

    const results: Array<{ id: string; ok: boolean }> = [];
    for (const tp of procedures) {
      const toothNumbers = tp.targets
        .map((t) => t.toothNumber)
        .filter((n): n is number => n != null);
      const surfaces = Array.from(
        new Set(tp.targets.flatMap((t) => t.surfaces ?? [])),
      );

      // Best-effort visit resolution via the procedure's chart entries.
      const chartEntry = await this.prisma.chartEntry.findFirst({
        where: { treatmentProcedureId: tp.id, visitId: { not: null } },
        select: { visitId: true },
        orderBy: { createdAt: 'asc' },
      });

      const ok = await this.addProcedureItemSafe({
        patientId: tp.treatmentPlan.patientId,
        visitId: chartEntry?.visitId ?? null,
        planId: tp.treatmentPlan.id,
        tp: {
          id: tp.id,
          description: this.buildDescription(
            tp.procedure.name,
            toothNumbers,
            surfaces,
          ),
          quantity: tp.quantity,
          pricePerUnit: Number(tp.pricePerUnit),
          discountAmount: Number(tp.discountAmount),
          taxAmount: Number(tp.taxAmount),
          totalPrice: Number(tp.totalPrice),
          currency: tp.currency,
          exchangeRate: tp.exchangeRate ? Number(tp.exchangeRate) : null,
          baseAmount: Number(tp.baseAmount),
        },
      });
      results.push({ id: tp.id, ok });
    }

    return {
      scanned: procedures.length,
      repaired: results.filter((r) => r.ok).length,
      stillFailing: results.filter((r) => !r.ok).map((r) => r.id),
    };
  }

  private roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
  }

  async removeProcedure(
    planId: string,
    procedureId: string,
    reason: string,
    deletedById?: string,
  ) {
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId, deletedAt: null },
      include: {
        procedure: { select: { id: true, name: true, code: true } },
        chartEntries: true,
        targets: { select: { id: true, toothNumber: true, surfaces: true } },
        sessions: {
          select: { id: true, status: true },
        },
        _count: { select: { sessions: true } },
        // Linked invoice (if any) — needed for the POSTED/paid checks
        invoiceItems: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                paymentStatus: true,
                amountPaid: true,
              },
            },
          },
        },
      },
    });
    if (!tp) throw new NotFoundException('Procedure not found in this plan');

    // ── Spec rules — Delete Treatment Procedure ──────────────────────────
    // ✅ Procedure status is PLANNED
    // ✅ Not any session executions done on that procedure
    // ✅ Invoice (if linked) must not be POSTED
    // ✅ Not completed  (implicit — COMPLETED ≠ PLANNED)

    // Rule: Status must be PLANNED (or PENDING legacy). Any other status
    // (IN_PROGRESS, COMPLETED, ON_HOLD, CANCELLED, REFERRED) blocks delete.
    if (
      (tp.status as string).toUpperCase() !== 'PLANNED' &&
      (tp.status as string).toUpperCase() !== 'PENDING'
    ) {
      throw new ConflictException(
        `Only PLANNED procedures can be deleted. Current status: ${tp.status}. ` +
          (tp.status === TreatmentStatus.COMPLETED
            ? 'Completed procedures form part of the permanent clinical record.'
            : tp.status === TreatmentStatus.CANCELLED
              ? 'Cancelled procedures should be restored, not deleted.'
              : 'Cancel this procedure first if it should not proceed.'),
      );
    }

    // Rule: No session executions.
    if (tp._count.sessions > 0) {
      throw new ConflictException(
        `Cannot delete a procedure with ${tp._count.sessions} recorded session(s). Use Cancel instead.`,
      );
    }

    // Rule: Linked invoice (if any) must not be POSTED.
    // Items on DRAFT invoices are voided (kept for record, zeroed from totals).
    // Payments on DRAFT invoices are allowed — the line item is voided but
    // preserved on the invoice for audit.
    const paymentStatus = (tp as any).paymentStatus as string;
    const invoiceItem = (tp as any).invoiceItems?.[0] ?? null;
    if (invoiceItem) {
      const inv = invoiceItem.invoice;
      if (inv.status === 'POSTED') {
        throw new ConflictException(
          `Cannot delete — the linked invoice is already POSTED ` +
            `(already billed to the general ledger). Void the invoice or ` +
            `create a credit note to remove this procedure.`,
        );
      }
      // DRAFT invoice items with or without payments: void the item below.
    }

    const { invoiceId } = await this.prisma.$transaction(async (tx) => {
      // 1. Delete ProcedureTarget entries
      await tx.procedureTarget.deleteMany({
        where: { treatmentProcedureId: procedureId },
      });

      // 2. Supersede PLANNED chart entries only — preserve COMPLETED history
      //    even if a stray COMPLETED chart row exists from an earlier state.
      if (tp.chartEntries?.length > 0) {
        await tx.chartEntry.updateMany({
          where: {
            treatmentProcedureId: procedureId,
            status: ChartEntryStatus.ACTIVE,
            type: 'PLANNED',
          },
          data: {
            status: ChartEntryStatus.SUPERSEDED,
            notes: `Procedure deleted from plan on ${new Date().toISOString()}: ${reason}`.trim(),
          },
        });
      }

      // ── Reverse billing (only DRAFT line items at this point) ───────────
      const billing = await this.invoiceLifecycle.voidProcedureBillingTx(
        tx,
        procedureId,
        reason,
      );

      // Audit BEFORE the delete so we have the row's last snapshot.
      await this.writeAuditTx(tx, {
        action: 'DELETE',
        module: 'TREATMENT_PLANS',
        entityType: 'TreatmentProcedure',
        entityId: procedureId,
        userId: deletedById ?? null,
        reason: reason,
        oldData: {
          treatmentPlanId: planId,
          procedureId: tp.procedureId,
          procedureCode: tp.procedure?.code,
          procedureName: tp.procedure?.name,
          status: tp.status,
          totalPrice: tp.totalPrice,
          currency: tp.currency,
          toothNumbers: tp.targets.map((t) => t.toothNumber),
          surfaces: Array.from(
            new Set(tp.targets.flatMap((t) => t.surfaces ?? [])),
          ),
          sessionsCount: tp._count.sessions,
          paymentStatus,
          invoiceId: invoiceItem?.invoice?.id ?? null,
          invoiceStatus: invoiceItem?.invoice?.status ?? null,
          invoicePaymentStatus: invoiceItem?.invoice?.paymentStatus ?? null,
          invoiceAmountPaid: invoiceItem?.invoice ? Number(invoiceItem.invoice.amountPaid) : 0,
        },
      });

      // Soft-unlink condition links (audit-preserving) before deleting the TP.
      await this.softUnlinkConditionLinksTx(
        tx,
        procedureId,
        deletedById,
        reason,
      );

      await tx.treatmentProcedure.update({
        where: { id: procedureId },
        data: {
          status: TreatmentStatus.DELETED,
          deletedAt: new Date(),
          deletedById: deletedById ?? null,
          deletedReason: reason,
        },
      });
      await this.recalculatePlanCostTx(tx, planId);
      return { invoiceId: billing.invoiceId };
    });

    // Refresh invoice totals after the structural change (post-commit).
    if (invoiceId) await this.invoiceLifecycle.recalcInvoice(invoiceId);

    return { success: true };
  }

  async reorderProcedures(planId: string, dto: ReorderProceduresDto) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: { procedures: { select: { id: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const validIds = new Set(plan.procedures.map((p: any) => p.id));
    const invalid = dto.procedures.filter((p) => !validIds.has(p.id));
    if (invalid.length) {
      throw new BadRequestException(
        `Procedures not in this plan: ${invalid.map((p) => p.id).join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      dto.procedures.map(({ id, sequence, visitGroup }) =>
        this.prisma.treatmentProcedure.update({
          where: { id },
          data: { sequence, visitGroup },
        }),
      ),
    );
    return { success: true, updated: dto.procedures.length };
  }

  /**
   * (C4) When a presence-affecting procedure (extraction) is COMPLETED, record
   * an acquired-loss absence marker (K08.1 CONDITION chart entry) on each tooth.
   * The dual-source tooth-presence guard (findAbsentTeeth) reads this, so later
   * surface/restorative work on the now-missing tooth is correctly blocked.
   * No-op for non-extraction procedures, mouth-level work, or teeth already
   * carrying an active absence marker (idempotent).
   */
  private async markTeethAbsentIfExtractionTx(
    tx: Prisma.TransactionClient,
    args: {
      patientId: string;
      procedure: { name?: string | null; code?: string | null };
      toothNumbers: number[];
      visitId?: string | null;
      providerId?: string | null;
    },
  ): Promise<void> {
    if (!isExtractionProcedure(args.procedure)) return;
    const teeth = [
      ...new Set(
        args.toothNumbers.filter((n): n is number => typeof n === 'number'),
      ),
    ];
    if (teeth.length === 0) return;

    const condition = await tx.condition.findFirst({
      where: { icd10Code: 'K08.1', isActive: true },
      select: { id: true },
    });

    for (const toothNumber of teeth) {
      const existing = await tx.chartEntry.findFirst({
        where: {
          patientId: args.patientId,
          toothNumber,
          type: 'CONDITION',
          status: 'ACTIVE',
          conditionCode: 'K08.1',
        },
        select: { id: true },
      });
      if (existing) continue;
      await tx.chartEntry.create({
        data: {
          patientId: args.patientId,
          visitId: args.visitId ?? null,
          toothNumber,
          surfaces: [],
          type: 'CONDITION',
          status: 'ACTIVE',
          label: 'Tooth absent (extracted)',
          conditionCode: 'K08.1',
          conditionId: condition?.id ?? null,
          notes: 'Auto-recorded on completion of extraction procedure.',
          providerId: args.providerId ?? null,
        },
      });
    }
  }

  /**
   * (H1 FIX) Mark a procedure COMPLETED as a first-class clinical event.
   * Previously this only flipped the status: no audit row, no actor, no chart
   * update — leaving the chart showing PLANNED while the procedure read
   * COMPLETED (a contradictory state) and erasing the medico-legal "who/when".
   * Now it supersedes PLANNED chart entries, writes COMPLETED ones, records the
   * extraction-absence marker, audits with the JWT actor, and is idempotent on
   * an already-COMPLETED procedure (L2).
   */
  async markProcedureComplete(
    planId: string,
    procedureId: string,
    visitId?: string | null,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tp = await tx.treatmentProcedure.findFirst({
        where: { id: procedureId, treatmentPlanId: planId },
        include: {
          treatmentPlan: { select: { patientId: true } },
          procedure: { select: { name: true, code: true } },
          targets: true,
        },
      });
      if (!tp) throw new NotFoundException('Procedure not found in this plan');

      // (L2) Terminal-state guards — never double-complete or resurrect.
      if (tp.status === TreatmentStatus.COMPLETED) return tp; // idempotent no-op
      if (
        tp.status === TreatmentStatus.CANCELLED ||
        tp.status === TreatmentStatus.REFERRED
      ) {
        throw new ConflictException(`Cannot complete a ${tp.status} procedure.`);
      }

      const patientId = tp.treatmentPlan.patientId;

      // (H1) Chart must reflect completion: supersede PLANNED, create COMPLETED.
      if (tp.targets.length > 0) {
        for (const target of tp.targets) {
          await tx.chartEntry.updateMany({
            where: {
              patientId,
              toothNumber: target.toothNumber,
              type: 'PLANNED',
              status: 'ACTIVE',
              procedureCode: tp.procedure.code,
              treatmentProcedureId: procedureId,
            },
            data: { status: 'SUPERSEDED' },
          });
          await tx.chartEntry.create({
            data: {
              patientId,
              visitId: visitId ?? null,
              toothNumber: target.toothNumber,
              surfaces: target.surfaces,
              type: 'COMPLETED',
              status: 'ACTIVE',
              label: tp.procedure.name,
              procedureCode: tp.procedure.code,
              treatmentProcedureId: procedureId,
              providerId: tp.providerId ?? null,
              notes: 'Procedure marked complete.',
            },
          });
        }
      } else {
        await tx.chartEntry.updateMany({
          where: {
            patientId,
            type: 'PLANNED',
            status: 'ACTIVE',
            procedureCode: tp.procedure.code,
            treatmentProcedureId: procedureId,
          },
          data: { status: 'SUPERSEDED' },
        });
        await tx.chartEntry.create({
          data: {
            patientId,
            visitId: visitId ?? null,
            toothNumber: null,
            surfaces: [],
            type: 'COMPLETED',
            status: 'ACTIVE',
            label: tp.procedure.name,
            procedureCode: tp.procedure.code,
            treatmentProcedureId: procedureId,
            providerId: tp.providerId ?? null,
            notes: 'Procedure marked complete.',
          },
        });
      }

      // (C4) Extraction completion renders the tooth absent.
      await this.markTeethAbsentIfExtractionTx(tx, {
        patientId,
        visitId: visitId ?? null,
        procedure: tp.procedure,
        toothNumbers: tp.targets
          .map((t) => t.toothNumber)
          .filter((n): n is number => n != null),
        providerId: tp.providerId ?? null,
      });

      const updated = await tx.treatmentProcedure.update({
        where: { id: procedureId },
        data: {
          status: TreatmentStatus.COMPLETED,
          completedAt: new Date(),
          version: { increment: 1 }, // (H2) optimistic-lock bump
        },
      });

      await this.syncConditionsForProcedureTx(tx, procedureId, actorUserId);
      const { status: planStatus } = await this.recalculatePlanTx(tx, planId);

      // (H1) Audit the completion with the JWT actor + before/after state.
      await this.writeAuditTx(tx, {
        action: 'COMPLETE',
        module: 'TREATMENT_PLANS',
        entityType: 'TreatmentProcedure',
        entityId: procedureId,
        userId: actorUserId ?? null,
        oldData: { status: tp.status },
        newData: {
          status: TreatmentStatus.COMPLETED,
          completedAt: updated.completedAt,
          toothNumbers: tp.targets.map((t) => t.toothNumber),
          planStatus,
        },
      });

      return updated;
    });
  }

  async cancelProcedure(
    planId: string,
    procedureId: string,
    reason?: string,
    cancelledById?: string,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException(
        'A cancellation reason is required (clinical audit trail).',
      );
    }

    // Pre-TX gate: validate current status before opening a transaction so we
    // don't have to roll back just to fail the same check.
    const preCheck = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId },
      select: { status: true },
    });
    if (!preCheck) throw new NotFoundException('Procedure not found in this plan');

    // Spec restrictions:
    //   • COMPLETED procedures are part of the legal clinical record — they
    //     CANNOT be cancelled. The user must amend with an append-only note.
    //   • CANCELLED is the terminal "soft-deleted" state — already cancelled,
    //     no-op, return the current record.
    //   • REFERRED is terminal — clinical decision was made elsewhere.
    if (preCheck.status === TreatmentStatus.COMPLETED) {
      throw new ConflictException(
        'Completed procedures cannot be cancelled. ' +
          'They are part of the permanent clinical record. ' +
          'Use the Edit dialog to append an additional clinical note instead.',
      );
    }
    if (preCheck.status === TreatmentStatus.REFERRED) {
      throw new ConflictException(
        'Referred procedures cannot be cancelled. The clinical decision was made elsewhere.',
      );
    }
    if (preCheck.status === TreatmentStatus.CANCELLED) {
      throw new ConflictException('This procedure is already cancelled.');
    }

    // Note: payments DO NOT block cancellation — per spec, cancellation is
    // allowed even when payments exist. The patient can be refunded or the
    // invoice voided in a separate flow afterwards.

    const { updated, invoiceId } = await this.prisma.$transaction(
      async (tx) => {
        const tp = await tx.treatmentProcedure.findFirst({
          where: { id: procedureId, treatmentPlanId: planId },
          include: {
            procedure: { select: { id: true, name: true, code: true } },
            sessions: {
              where: { deletedAt: null },
              include: { targets: true },
            },
            chartEntries: true,
            targets: true,
            // Linked invoice (if any) — captured for the audit snapshot
            invoiceItems: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                invoice: {
                  select: {
                    id: true,
                    status: true,
                    paymentStatus: true,
                    amountPaid: true,
                  },
                },
              },
            },
          },
        });
        if (!tp) throw new NotFoundException('Procedure not found in this plan');

        // ── Preserve ProcedureTarget rows (audit trail). Their procedureSessionId
        //    marks them as session-specific, which is kept intact. ─────────
        await tx.procedureTarget.updateMany({
          where: { treatmentProcedureId: procedureId },
          data: { /* marker: no-op — leave row in place for audit */ },
        });

        // ── Supersede PLANNED chart entries only — preserve COMPLETED
        //    history per the clinical-record rule.
        if (tp.chartEntries?.length > 0) {
          await tx.chartEntry.updateMany({
            where: {
              treatmentProcedureId: procedureId,
              status: ChartEntryStatus.ACTIVE,
              type: 'PLANNED',
            },
            data: {
              status: ChartEntryStatus.SUPERSEDED,
              notes: `Cancelled: ${reason ?? 'No reason'}`,
            },
          });
        }

        // ── Reverse billing: void the InvoiceItem + any PENDING CHARGE
        //    ledger entry created at add time. POSTED/PAID invoices will
        //    throw here, rolling back the whole cancellation — the user must
        //    refund/void the invoice first.
        const billing = await this.invoiceLifecycle.voidProcedureBillingTx(
          tx,
          procedureId,
          reason,
        );

        // ── Cancel pending/in-progress sessions, preserve COMPLETED ones.
        await tx.procedureTarget.updateMany({
          where: {
            procedureSessionId: { in: tp.sessions.map((s) => s.id) },
          },
          data: { /* marker: no-op */ },
        });

        await tx.procedureSession.updateMany({
          where: {
            treatmentProcedureId: procedureId,
            status: { in: [SessionStatus.PENDING, SessionStatus.IN_PROGRESS] },
          },
          data: { status: SessionStatus.CANCELLED },
        });

        const updatedTp = await tx.treatmentProcedure.update({
          where: { id: procedureId },
          data: {
            status: TreatmentStatus.CANCELLED,
            cancellationReason: reason,
            version: { increment: 1 }, // (H2) optimistic-lock bump
          },
          include: {
            procedure: { select: { id: true, name: true } },
            targets: true,
            sessions: { select: { id: true, status: true, sessionNumber: true } },
          },
        });

        // ── Re-evaluate linked conditions: a cancelled procedure can no
        //    longer drive resolution. Soft-delete its condition links first
        //    (so they stop counting toward auto-resolve), then re-run the
        //    lifecycle for each affected PatientCondition. Without this a
        //    cancelled link blocks the condition from ever auto-resolving and
        //    leaves it stuck IN_TREATMENT.
        const affectedLinks =
          (await tx.conditionProcedureLink.findMany({
            where: { treatmentProcedureId: procedureId, deletedAt: null },
            select: { patientConditionId: true },
          })) ?? [];
        if (affectedLinks.length > 0) {
          const affectedConditionIds = [
            ...new Set(affectedLinks.map((l) => l.patientConditionId)),
          ];
          // ORDER MATTERS. Re-evaluate WHILE this procedure's link still exists
          // but the procedure is now CANCELLED. evaluateConditionStatus ignores
          // CANCELLED procedures, so a condition this procedure had RESOLVED (and
          // no other completed procedure backs) reverts to ACTIVE. If we unlinked
          // first, evaluate would see zero links and LEAVE a RESOLVED condition
          // resolved forever (the zero-link branch only reverts IN_TREATMENT).
          for (const pcId of affectedConditionIds) {
            await this.conditionsService.applyConditionLifecycleTx(
              tx,
              pcId,
              cancelledById ?? undefined,
            );
          }
          // Now soft-delete the links (audit-preserving unlink).
          await tx.conditionProcedureLink.updateMany({
            where: { treatmentProcedureId: procedureId, deletedAt: null },
            data: {
              deletedAt: new Date(),
              unlinkedById: cancelledById ?? null,
              deletedReason: 'Procedure cancelled',
            },
          });
        }

        await this.recalculatePlanCostTx(tx, planId);

        // ── Audit log: enriched snapshot per spec (procedure name + code,
        //    status, totalPrice, currency, toothNumbers, surfaces, sessionsCount,
        //    paymentStatus, invoiceId + status). The audit row answers "who
        //    cancelled, when, why, and from what state" in a single read.
        const invoiceItem = (tp as any).invoiceItems?.[0] ?? null;
        const invoice = invoiceItem?.invoice ?? null;
        const auditSnapshot = {
          treatmentPlanId: planId,
          procedureId: tp.procedureId,
          procedureCode: tp.procedure?.code,
          procedureName: tp.procedure?.name,
          previousStatus: tp.status,
          totalPrice: tp.totalPrice,
          currency: tp.currency,
          toothNumbers: tp.targets.map((t) => t.toothNumber),
          surfaces: Array.from(
            new Set(tp.targets.flatMap((t) => t.surfaces ?? [])),
          ),
          sessionsCount: tp.sessions.length,
          completedSessionsCount: tp.sessions.filter((s) => s.status === 'COMPLETED').length,
          paymentStatus: (tp as any).paymentStatus,
          invoiceId: invoice?.id ?? null,
          invoiceStatus: invoice?.status ?? null,
          invoicePaymentStatus: invoice?.paymentStatus ?? null,
          invoiceAmountPaid: invoice ? Number(invoice.amountPaid) : 0,
        };

        await this.writeAuditTx(tx, {
          action: 'CANCEL',
          module: 'TREATMENT_PLANS',
          entityType: 'TreatmentProcedure',
          entityId: procedureId,
          userId: cancelledById ?? null,
          reason,
          oldData: auditSnapshot,
          newData: { status: TreatmentStatus.CANCELLED },
        });

        return { updated: updatedTp, invoiceId: billing.invoiceId };
      },
    );

    // Refresh invoice totals after the structural change (post-commit).
    if (invoiceId) await this.invoiceLifecycle.recalcInvoice(invoiceId);

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT — clinical + optional billing
  // ═══════════════════════════════════════════════════════════════════════

  async getProcedureSessions(planId: string, procedureId: string) {
    return this.prisma.procedureSession.findMany({
      where: {
        treatmentProcedureId: procedureId,
        treatmentProcedure: { treatmentPlanId: planId },
        deletedAt: null,
      },
      orderBy: { sessionNumber: 'asc' },
      include: { ledgerEntry: true, targets: true }, // Include targets
    });
  }

  async createSession(
    planId: string,
    procedureId: string,
    dto: CreateSessionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const tp = await tx.treatmentProcedure.findFirst({
        where: { id: procedureId, treatmentPlanId: planId },
        include: {
          treatmentPlan: { select: { patientId: true, title: true } },
          procedure: { select: { name: true } },
          targets: true, // Get procedure targets to copy from
        },
      });
      if (!tp) throw new NotFoundException('Treatment procedure not found');

      // Completion has clinical side effects (chart entries, extraction
      // absence, condition resolution) that only executeSession performs — a
      // session must not be born COMPLETED/terminal through plain CRUD.
      if (
        dto.status &&
        dto.status !== SessionStatus.PENDING &&
        dto.status !== SessionStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          `A session cannot be created directly in ${dto.status} status. ` +
            `Use the execute-session flow to complete it.`,
        );
      }

      const lastAnySession = await tx.procedureSession.findFirst({
        where: { treatmentProcedureId: procedureId },
        orderBy: { sessionNumber: 'desc' },
        select: { sessionNumber: true },
      });
      const nextNum =
        dto.sessionNumber ?? (lastAnySession?.sessionNumber ?? 0) + 1;
      const label =
        dto.sessionLabel ??
        `${(tp as any).procedure.name} – Session ${nextNum}`;

      const sessionPrice = dto.sessionPrice ?? 0;

      const session = await tx.procedureSession.create({
        data: {
          treatmentProcedureId: procedureId,
          visitGroup: dto.visitGroup,
          sessionNumber: nextNum,
          sessionLabel: label,
          status: dto.status ?? SessionStatus.PENDING,
          performedDate: dto.performedDate ? new Date(dto.performedDate) : null,
          performedNotes: dto.performedNotes,
          actualInputsUsed: dto.actualInputsUsed ?? [],
          // surfaces REMOVED - using ProcedureTarget
          sessionPrice: sessionPrice || null,
          ledgerStatus: SessionLedgerStatus.UNPOSTED,
          visitId: dto.visitId ?? null,
          providerId: dto.providerId ?? null,
        },
        include: { ledgerEntry: true, targets: true },
      });

      // Create ProcedureTarget entries for the session based on procedure targets
      if (tp.targets.length > 0) {
        for (const target of tp.targets) {
          await tx.procedureTarget.create({
            data: {
              procedureSessionId: session.id,
              toothNumber: target.toothNumber,
              surfaces: dto.surfaces ?? target.surfaces,
              unitIndex: target.unitIndex,
            },
          });
        }
      }

      return {
        ...session,
        billingType: (tp as any).billingType,
      };
    });
  }

  async updateSession(
    planId: string,
    procedureId: string,
    sessionId: string,
    dto: UpdateSessionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.procedureSession.findFirst({
        where: {
          id: sessionId,
          treatmentProcedureId: procedureId,
          treatmentProcedure: { treatmentPlanId: planId },
          deletedAt: null,
        },
        include: {
          treatmentProcedure: {
            include: {
              procedure: { select: { name: true } },
              treatmentPlan: { select: { patientId: true, title: true } },
            },
          },
          ledgerEntry: true,
          targets: true,
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      const tp = (session as any).treatmentProcedure;

      // Terminal sessions are immutable through plain CRUD — corrections go
      // through the audited edit-session flow, which diffs and versions them.
      if (
        session.status === SessionStatus.COMPLETED ||
        session.status === SessionStatus.VOIDED ||
        session.status === SessionStatus.CANCELLED ||
        session.status === SessionStatus.SKIPPED
      ) {
        throw new ConflictException(
          `Session is ${session.status} — use the edit-session flow to correct it.`,
        );
      }

      // Completion has clinical side effects (chart entries, extraction
      // absence, condition resolution) that only executeSession performs.
      if (dto.status === SessionStatus.COMPLETED) {
        throw new BadRequestException(
          'A session cannot be completed through this endpoint. ' +
            'Use the execute-session flow so chart entries stay in sync.',
        );
      }
      if (dto.status === SessionStatus.VOIDED) {
        throw new BadRequestException(
          'Void a session through the delete-session flow so its side effects are reversed.',
        );
      }

      // Update surfaces if provided - update procedure targets for this session
      if (dto.surfaces && dto.surfaces.length > 0) {
        await tx.procedureTarget.updateMany({
          where: { procedureSessionId: sessionId },
          data: { surfaces: dto.surfaces as any },
        });
      }

      const updateData: any = {};
      if (dto.status !== undefined) updateData.status = dto.status;
      if (dto.performedDate)
        updateData.performedDate = new Date(dto.performedDate);
      if (dto.performedNotes !== undefined)
        updateData.performedNotes = dto.performedNotes;
      if (dto.actualInputsUsed)
        updateData.actualInputsUsed = dto.actualInputsUsed;
      // surfaces REMOVED - handled via ProcedureTarget
      if (dto.sessionPrice !== undefined)
        updateData.sessionPrice = dto.sessionPrice;
      if (dto.visitGroup !== undefined) updateData.visitGroup = dto.visitGroup;
      updateData.version = { increment: 1 };

      const updated = await tx.procedureSession.update({
        where: { id: sessionId },
        data: updateData,
        include: { ledgerEntry: true, targets: true },
      });

      return updated;
    });
  }

  async addSessionToLedger(
    _planId: string,
    _procedureId: string,
    _sessionId: string,
  ) {
    throw new BadRequestException(
      'Session-level billing is no longer supported. Billing is managed at the invoice level.',
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEDGER VIEW
  // ═══════════════════════════════════════════════════════════════════════

  async getVisitLedger(visitId: string) {
    return this.prisma.ledgerEntry.findMany({
      where: { visitId },
      orderBy: { createdAt: 'asc' },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        invoiceItems: {
          include: {
            invoice: { select: { status: true, invoiceNumber: true } },
          },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PLAN SUMMARY
  // ═══════════════════════════════════════════════════════════════════════

  async getPlanSummary(planId: string) {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: {
        procedures: {
          where: { status: { not: TreatmentStatus.CANCELLED } },
          select: {
            status: true,
            paymentStatus: true,
            totalPrice: true,
            amountPaid: true,
            baseAmount: true,
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plan not found');

    const procs = plan.procedures;
    const totalPrice = procs.reduce(
      (s: number, p: any) => s + Number(p.totalPrice),
      0,
    );
    const amountPaid = procs.reduce(
      (s: number, p: any) => s + Number(p.amountPaid),
      0,
    );

    const byStatus = {
      planned: procs.filter((p: any) => p.status === TreatmentStatus.PLANNED)
        .length,
      inProgress: procs.filter(
        (p: any) => p.status === TreatmentStatus.IN_PROGRESS,
      ).length,
      completed: procs.filter(
        (p: any) => p.status === TreatmentStatus.COMPLETED,
      ).length,
    };

    return {
      planId: plan.id,
      title: plan.title,
      status: plan.status,
      summary: {
        totalProcedures: procs.length,
        totalPrice,
        amountPaid,
        outstanding: totalPrice - amountPaid,
        byStatus,
        completionPercentage:
          procs.length > 0
            ? Math.round((byStatus.completed / procs.length) * 100)
            : 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private async createLedgerEntry(
    tx: Prisma.TransactionClient,
    params: {
      patientId: string;
      sourceType: string;
      sourceId: string;
      description: string;
      quantity: number;
      pricePerUnit: number;
      subtotalPrice: number;
      totalPrice: number;
      currency: string;
      exchangeRate: number;
      baseCurrency: string;
      baseAmount: number;
      notes?: string;
      discountAmount?: number;
      taxAmount?: number;
    },
  ) {
    // Find active visit for this patient
    const activeVisit = await tx.visit.findFirst({
      where: { patientId: params.patientId, status: { not: 'COMPLETED' } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeVisit) {
      throw new BadRequestException(
        'No active visit found. Please check in the patient first.',
      );
    }

    const entryCode = await this.generateLedgerCode(tx);

    // return tx.ledgerEntry.create({
    //   data: {
    //     entryCode,
    //     patientId: params.patientId,
    //     visitId: activeVisit.id,
    //     type: params.sourceType.includes('SESSION')
    //       ? 'TREATMENT_PROCEDURE_SESSION'
    //       : 'TREATMENT_PROCEDURE',
    //     description: params.description,
    //     sourceType: params.sourceType,
    //     sourceId: params.sourceId,
    //     quantity: params.quantity,
    //     pricePerUnit: params.pricePerUnit,
    //     subtotalPrice: params.subtotalPrice,
    //     discountAmount: 0,
    //     taxAmount: 0,
    //     totalPrice: params.totalPrice,
    //     currency: params.currency,
    //     exchangeRate: params.exchangeRate !== 1 ? params.exchangeRate : null,
    //     baseCurrency: params.baseCurrency,
    //     baseAmount: params.baseAmount,
    //     notes: params.notes,
    //     status: LedgerEntryStatus.PENDING,
    //   },
    // });

    // Inside createLedgerEntry, update the tx.ledgerEntry.create call:

    return tx.ledgerEntry.create({
      data: {
        entryCode,
        patientId: params.patientId,
        visitId: activeVisit.id,
        type: params.sourceType.includes('SESSION')
          ? 'TREATMENT_PROCEDURE_SESSION'
          : 'TREATMENT_PROCEDURE',
        description: params.description,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        quantity: params.quantity,
        pricePerUnit: params.pricePerUnit,
        subtotalPrice: params.subtotalPrice,

        // ✅ ADD THESE LINES:
        discountAmount: params.discountAmount ?? 0,
        taxAmount: params.taxAmount ?? 0,

        totalPrice: params.totalPrice,
        currency: params.currency,
        exchangeRate: params.exchangeRate !== 1 ? params.exchangeRate : null,
        baseCurrency: params.baseCurrency,
        baseAmount: params.baseAmount,
        notes: params.notes,
        status: LedgerEntryStatus.PENDING,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // AUDIT HELPER — generic append-only log for any clinical/billing change
  //
  //   • Always called INSIDE a $transaction so the audit row commits or
  //     rolls back atomically with the change it describes.
  //   • `entityType` should be the model name ("ProcedureSession",
  //     "TreatmentProcedure", "TreatmentPlan", …).
  //   • `reason` is the user-supplied justification (required for VOID and
  //     edit-style UPDATE actions; optional for CREATE/COMPLETE).
  //   • Caller passes the userId from request context; the helper resolves
  //     userName by looking up the staff record (denormalised so the audit
  //     row stays readable if the user is later deleted).
  // ─────────────────────────────────────────────────────────────────────
  private async writeAuditTx(
    tx: Prisma.TransactionClient,
    args: {
      action:
        | 'CREATE'
        | 'UPDATE'
        | 'DELETE'
        | 'VOID'
        | 'CANCEL'
        | 'RESTORE'
        | 'EXECUTE'
        | 'COMPLETE';
      module: string;
      entityType: string;
      entityId: string;
      oldData?: any;
      newData?: any;
      reason?: string | null;
      userId?: string | null;
      userName?: string | null;
    },
  ) {
    // Resolve the actor defensively. AuditLog.userId is an FK to users.id,
    // so passing a Staff.id (or any non-User id) would violate the
    // constraint and abort the surrounding transaction — losing both the
    // domain change AND the audit row. We'd rather record the action with
    // a null userId than fail the user's write.
    let safeUserId: string | null = null;
    let userName = args.userName ?? null;

    if (args.userId) {
      const user = await tx.user.findUnique({
        where: { id: args.userId },
        select: {
          id: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      });
      if (user) {
        safeUserId = user.id;
        if (!userName && user.staff) {
          userName = `${user.staff.firstName} ${user.staff.lastName}`.trim();
        }
      } else {
        // Stash the unresolved id in userName so forensics still has a trail.
        userName = userName ?? `unresolved:${args.userId}`;
      }
    }

    return tx.auditLog.create({
      data: {
        action: args.action,
        module: args.module,
        entityType: args.entityType,
        recordId: args.entityId,
        oldData: args.oldData ?? null,
        newData: args.newData ?? null,
        reason: args.reason ?? null,
        userId: safeUserId,
        userName,
      },
    });
  }

  private async generateLedgerCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    // Atomic, concurrency-safe: LE-YY-NNNN via the document-number counter.
    return this.docNum.next('LE', tx);
  }

  private buildDescription(
    procedureName: string,
    toothNumbers?: number[],
    surfaces?: ToothSurface[],
  ): string {
    const parts = [procedureName];
    if (toothNumbers?.length) parts.push(`(Tooth: ${toothNumbers.join(', ')})`);
    if (surfaces?.length) parts.push(`[${surfaces.join('+')}]`);
    return parts.join(' ');
  }

  /**
   * Evaluate linked conditions when a procedure's status changes and apply
   * the new Condition lifecycle (ACTIVE → IN_TREATMENT → RESOLVED).
   *
   * Delegates to ConditionsService.applyConditionLifecycleTx() for each
   * linked condition. The service handles the full evaluation:
   *
   *   - No executed procedures                    → ACTIVE
   *   - Some executed, none completed             → IN_TREATMENT
   *   - ALL linked procedures COMPLETED           → RESOLVED
   *
   * When resolving, uses the LAST completed procedure's timestamp/ID for
   * resolvedAt and resolvedByProcedureId.
   *
   * Never-auto-resolve conditions (presence-affecting, long-term monitoring)
   * are left in their current status.
   *
   * Called from:
   *   - executeSession  (line 2590)
   *   - editSession     (line 2994)
   *   - deleteSession   (line 3252)
   *
   * No-op when the procedure has no linked conditions.
   */
  private async syncConditionsForProcedureTx(
    tx: Prisma.TransactionClient,
    procedureId: string,
    actorUserId?: string | null,
  ): Promise<void> {
    const proc = await tx.treatmentProcedure.findUnique({
      where: { id: procedureId },
      select: { status: true },
    });
    if (!proc) return;

    const links =
      (await tx.conditionProcedureLink.findMany({
        where: { treatmentProcedureId: procedureId, deletedAt: null },
        select: { patientConditionId: true },
      })) ?? [];
    if (links.length === 0) return;

    const conditionIds = [...new Set(links.map((l) => l.patientConditionId))];

    for (const conditionId of conditionIds) {
      await this.conditionsService.applyConditionLifecycleTx(
        tx,
        conditionId,
        actorUserId ?? undefined,
      );
    }
  }

  private async recalculatePlanCostTx(
    tx: Prisma.TransactionClient,
    planId: string,
  ) {
    // Kept for backwards-compat: delegates to the combined recalc so any
    // legacy call site still updates both cost AND auto-derived status.
    return this.recalculatePlanTx(tx, planId);
  }

  /**
   * Recalculate a treatment plan's auto-derived fields in one pass:
   *   • estimatedCost          — sum of active procedure totals
   *   • completionPercentage   — completed / total active (rounded, 0–100)
   *   • status                 — derived from active procedure statuses
   *
   * Status rules (sticky overrides ON_HOLD / CANCELLED / REFERRED are preserved):
   *   • 0 active procedures               → PLANNED
   *   • All active are COMPLETED          → COMPLETED
   *   • Any IN_PROGRESS or COMPLETED      → IN_PROGRESS
   *   • Otherwise (all PLANNED)           → PLANNED
   * CANCELLED procedures are excluded from the calculation.
   *
   * Public so sibling services (e.g. TreatmentPlansEditService) can keep
   * the plan in sync when a procedure's status changes from the /edit
   * endpoint. Must be called inside a Prisma transaction.
   */
  async recalculatePlanTx(
    tx: Prisma.TransactionClient,
    planId: string,
  ): Promise<{
    status: TreatmentStatus;
    estimatedCost: number;
    completionPercentage: number;
  }> {
    const plan = await tx.treatmentPlan.findUnique({
      where: { id: planId },
      select: { status: true },
    });
    if (!plan) {
      return {
        status: TreatmentStatus.PLANNED,
        estimatedCost: 0,
        completionPercentage: 0,
      };
    }

    const activeProcs = await tx.treatmentProcedure.findMany({
      where: {
        treatmentPlanId: planId,
        deletedAt: null,
        status: { not: TreatmentStatus.CANCELLED },
      },
      select: { status: true, totalPrice: true, completedAt: true },
    });

    const estimatedCost = activeProcs.reduce(
      (sum, p) => sum + Number(p.totalPrice ?? 0),
      0,
    );

    const totalActive = activeProcs.length;
    const completedCount = activeProcs.filter(
      (p) => p.status === TreatmentStatus.COMPLETED,
    ).length;
    const inProgressCount = activeProcs.filter(
      (p) => p.status === TreatmentStatus.IN_PROGRESS,
    ).length;

    const completionPercentage =
      totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 0;

    // Derive status purely from procedure states
    let derivedStatus: TreatmentStatus;
    if (totalActive === 0) {
      derivedStatus = TreatmentStatus.PLANNED;
    } else if (completedCount === totalActive) {
      derivedStatus = TreatmentStatus.COMPLETED;
    } else if (inProgressCount > 0 || completedCount > 0) {
      derivedStatus = TreatmentStatus.IN_PROGRESS;
    } else {
      derivedStatus = TreatmentStatus.PLANNED;
    }

    // Preserve sticky admin-set overrides — never silently overwrite them.
    // (Use updateTreatmentPlan with an explicit status to clear an override.)
    const isOverride =
      plan.status === TreatmentStatus.ON_HOLD ||
      plan.status === TreatmentStatus.CANCELLED ||
      plan.status === TreatmentStatus.REFERRED;

    const newStatus = isOverride ? plan.status : derivedStatus;

    // Stamp completedAt when transitioning into COMPLETED
    const completedAt =
      newStatus === TreatmentStatus.COMPLETED ? new Date() : null;

    await tx.treatmentPlan.update({
      where: { id: planId },
      data: {
        estimatedCost,
        status: newStatus,
        completedAt:
          newStatus === TreatmentStatus.COMPLETED ? completedAt : null,
      },
    });

    return { status: newStatus, estimatedCost, completionPercentage };
  }

  async addExtraSession(
    planId: string,
    procedureId: string,
    dto: {
      sessionLabel?: string;
      sessionCost?: number;
      visitGroup?: number;
      surfaces?: ToothSurface[];
      toothNumbers?: number[];
      visitId?: string;
      providerId?: string;
    },
  ) {
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId },
      include: {
        sessions: {
          where: { deletedAt: null },
          orderBy: { sessionNumber: 'asc' },
        },
        targets: true,
      },
    });
    if (!tp) throw new NotFoundException('Treatment procedure not found');

    if (tp.sessionType !== 'MULTI') {
      throw new BadRequestException(
        'Extra sessions can only be added to MULTI-session procedures',
      );
    }

    const nextNumber = (tp.sessions.at(-1)?.sessionNumber ?? 0) + 1;

    const sessionPrice =
      dto.sessionCost ??
      (tp.sessionCount > 0 ? Number(tp.pricePerUnit) / tp.sessionCount : 0);

    const session = await this.prisma.$transaction(async (tx) => {
      const newSession = await tx.procedureSession.create({
        data: {
          treatmentProcedureId: procedureId,
          visitGroup: dto.visitGroup ?? tp.visitGroup,
          sessionNumber: nextNumber,
          sessionLabel:
            dto.sessionLabel ??
            `${tp.sessions[0]?.sessionLabel?.replace(/\d+ of \d+$/, '') ?? 'Session '}${nextNumber}`,
          status: 'PENDING',
          sessionPrice: sessionPrice,
          ledgerStatus: 'PENDING',
          visitId: dto.visitId ?? null,
          providerId: dto.providerId ?? null,
        },
        include: { targets: true },
      });

      // Create ProcedureTarget entries for the new session
      const toothNumbersToUse =
        dto.toothNumbers ?? tp.targets.map((t) => t.toothNumber);
      const surfacesToUse = dto.surfaces ?? tp.targets[0]?.surfaces ?? [];

      for (const toothNumber of toothNumbersToUse) {
        await tx.procedureTarget.create({
          data: {
            procedureSessionId: newSession.id,
            toothNumber: toothNumber,
            surfaces: surfacesToUse,
          },
        });
      }

      // (L1) Bump sessionCount inside the SAME transaction. Previously this ran
      // as a separate write after the tx committed, so a crash in between left
      // the session created but sessionCount stale (count drift).
      await tx.treatmentProcedure.update({
        where: { id: procedureId },
        data: { sessionCount: { increment: 1 }, version: { increment: 1 } },
      });

      return newSession;
    });

    return { data: session, message: 'Extra session added' };
  }

  async executeSession(
    planId: string,
    procedureId: string,
    dto: {
      // Optional: when absent the session is CREATED inside this transaction
      // (atomic create-and-execute) so a failed execute never leaks an orphan
      // PENDING session.
      sessionId?: string;
      sessionLabel?: string;
      visitGroup?: number;
      sessionNumber?: number;
      performedNotes?: string;
      performedDate?: string;
      surfaces?: string[];
      actualInputsUsed?: any;
      visitId?: string;
      sessionPrice?: number;
      sessionPriceOriginal?: number;
      outcome?: string; // 'PARTIAL' | 'COMPLETED'
      isFinal?: boolean;
      phase?: string;
      providerId?: string;
      dentistId?: string;
      markProcedureComplete?: boolean;
      status?: string; // legacy
      // Required to close a MULTI-session procedure before all planned
      // sessions are completed — recorded in the audit trail.
      finalOverrideReason?: string;
      // Optimistic-lock guard for executing an EXISTING session: rejects the
      // execute when someone edited the session since the client loaded it.
      expectedVersion?: number;
      toothStatuses?: Array<{
        toothNumber: number;
        chartEntryId?: string;
        surfaces?: string[];
        status: string;
        notes?: string;
        performedDate?: string;
      }>;
      // Optional request-dedup key (from the Idempotency-Key header). When the
      // same key is replayed we return the stored response instead of creating a
      // second session + duplicate chart entries.
      idempotencyKey?: string;
    },
    actorUserId?: string,
  ) {
    const normalise = (s: string) => s.replace(/-/g, '_').toUpperCase();

    // ── Idempotency replay check ──────────────────────────────────────────────
    if (dto.idempotencyKey) {
      const prior = await this.prisma.idempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (prior?.response) return prior.response as any;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // ── Load procedure & session ──────────────────────────────────────────
        const tp = await tx.treatmentProcedure.findFirst({
          where: { id: procedureId, treatmentPlanId: planId },
          include: {
            treatmentPlan: { select: { patientId: true, title: true } },
            procedure: { select: { name: true, code: true } },
            targets: true,
          },
        });
        if (!tp) throw new NotFoundException('TreatmentProcedure not found');

        // A CANCELLED/REFERRED procedure is clinically closed — executing a
        // session against it would resurrect it as IN_PROGRESS/COMPLETED.
        if (
          tp.status === TreatmentStatus.CANCELLED ||
          tp.status === TreatmentStatus.REFERRED
        ) {
          throw new ConflictException(
            `Cannot execute a session on a ${tp.status} procedure. Restore it first.`,
          );
        }

        // visitId is client-supplied — verify it belongs to this plan's
        // patient so a session/chart entry can never be attributed to an
        // unrelated patient's visit.
        if (dto.visitId) {
          const visit = await tx.visit.findUnique({
            where: { id: dto.visitId },
            select: { patientId: true },
          });
          if (!visit) {
            throw new BadRequestException('visitId does not exist');
          }
          if (visit.patientId !== tp.treatmentPlan.patientId) {
            throw new BadRequestException(
              'visitId belongs to a different patient than this treatment plan',
            );
          }
        }

        // ── Create-or-reuse the session, ATOMICALLY with execution ────────────
        // If a sessionId is supplied we execute that existing session. If not, we
        // create the PENDING session here, inside the same transaction. That makes
        // create+execute a single atomic unit: any failure below rolls the new
        // session back too, so we never leak an orphan PENDING session (and a
        // client retry can't accumulate empty sessions).
        let session: any;
        if (dto.sessionId) {
          session = await tx.procedureSession.findFirst({
            where: {
              id: dto.sessionId,
              treatmentProcedureId: procedureId,
              deletedAt: null,
            },
            include: { targets: true },
          });
          if (!session) throw new NotFoundException('Session not found');

          // Optimistic lock: a concurrent edit bumped version since the
          // client loaded this session — make it re-read before executing.
          if (
            dto.expectedVersion !== undefined &&
            session.version !== dto.expectedVersion
          ) {
            throw new ConflictException(
              `Session was modified by someone else (expected version ` +
                `${dto.expectedVersion}, found ${session.version}). Refresh and retry.`,
            );
          }
        } else {
          // Max over ALL rows including soft-deleted ones: numbers stay
          // monotonic and a re-created session can't collide with a number
          // still held by a soft-deleted row.
          const lastSession = await tx.procedureSession.findFirst({
            where: { treatmentProcedureId: procedureId },
            orderBy: { sessionNumber: 'desc' },
            select: { sessionNumber: true },
          });
          const nextNum =
            dto.sessionNumber ?? (lastSession?.sessionNumber ?? 0) + 1;

          session = await tx.procedureSession.create({
            data: {
              treatmentProcedureId: procedureId,
              visitGroup: dto.visitGroup ?? tp.visitGroup,
              sessionNumber: nextNum,
              sessionLabel:
                dto.sessionLabel ?? `${tp.procedure.name} – Session ${nextNum}`,
              status: SessionStatus.PENDING,
              sessionPrice: dto.sessionPrice ?? null,
              ledgerStatus: SessionLedgerStatus.UNPOSTED,
              visitId: dto.visitId ?? null,
              providerId: dto.providerId ?? dto.dentistId ?? null,
            },
            include: { targets: true },
          });

          // Seed per-tooth targets from the procedure's targets.
          for (const target of tp.targets) {
            await tx.procedureTarget.create({
              data: {
                procedureSessionId: session.id,
                toothNumber: target.toothNumber,
                surfaces: (dto.surfaces as any) ?? target.surfaces,
                unitIndex: target.unitIndex,
              },
            });
          }
        }

        // Replay guard — a session can only be executed from a PENDING or
        // IN_PROGRESS state. A COMPLETED/VOIDED/CANCELLED/SKIPPED session
        // being re-executed would duplicate chart entries, audit rows, and
        // (for PAY_PARTIALLY) ledger entries. Reject the second click.
        if (
          session.status === SessionStatus.COMPLETED ||
          session.status === SessionStatus.VOIDED ||
          session.status === SessionStatus.CANCELLED ||
          session.status === SessionStatus.SKIPPED
        ) {
          throw new ConflictException(
            `Session ${session.sessionNumber} is already ${session.status}. ` +
              `Use the edit-session flow to correct its details instead of re-executing.`,
          );
        }

        // Completion is a clinical state change the SERVER validates — the
        // client's isFinal alone must not close a multi-session procedure
        // early. Closing before all planned sessions are completed requires
        // an explicit, audited override reason.
        if (dto.isFinal && tp.sessionType === SessionType.MULTI) {
          const completedBefore = await tx.procedureSession.count({
            where: {
              treatmentProcedureId: procedureId,
              deletedAt: null,
              status: SessionStatus.COMPLETED,
              id: { not: session.id },
            },
          });
          const completedIncludingThis = completedBefore + 1;
          const plannedSessions = tp.sessionCount ?? 1;
          if (
            completedIncludingThis < plannedSessions &&
            !dto.finalOverrideReason?.trim()
          ) {
            throw new BadRequestException(
              `Cannot mark this procedure COMPLETED at session ` +
                `${completedIncludingThis} of ${plannedSessions}. Pass ` +
                `finalOverrideReason to close it early (it will be audited).`,
            );
          }
        }

        const patientId = tp.treatmentPlan.patientId;

        // ── Update session targets (surfaces) if provided ─────────────────────
        if (dto.surfaces && dto.surfaces.length > 0) {
          await tx.procedureTarget.updateMany({
            where: { procedureSessionId: session.id },
            data: { surfaces: dto.surfaces as any },
          });
        }

        // ── Update chart entries per tooth ────────────────────────────────────
        const toothStatuses = dto.toothStatuses ?? [];
        // (C4) teeth whose work COMPLETED in this session — drives the
        //      extraction-absence marker once the chart writes are done.
        const completedTeeth: number[] = [];

        if (toothStatuses.length > 0) {
          for (const ts of toothStatuses) {
            const status = normalise(ts.status);
            if (!ts.toothNumber || status === 'PENDING') continue;
            // (M2) Validate FDI even for tooth-agnostic procedures (empty
            //      targets), so an invalid tooth number can never reach a
            //      persisted chart entry.
            assertFdiTooth(ts.toothNumber);

            const targetForTooth = tp.targets.find(
              (t) => t.toothNumber === ts.toothNumber,
            );

            // Reject a tooth that isn't part of this procedure's targets. Without
            // this guard a caller could record status for an unrelated tooth (e.g.
            // tooth 47 on a procedure targeting tooth 11) and it would be silently
            // applied. Only enforced when the procedure actually defines targets;
            // tooth-agnostic procedures (no targets) accept any tooth.
            if (tp.targets.length > 0 && !targetForTooth) {
              throw new BadRequestException(
                `Tooth ${ts.toothNumber} is not a target of this procedure ` +
                  `(targets: ${tp.targets.map((t) => t.toothNumber).join(', ') || 'none'}).`,
              );
            }

            const surfaces = ts.surfaces?.length
              ? (ts.surfaces as ToothSurface[])
              : ((targetForTooth?.surfaces as ToothSurface[]) ?? []);

            if (status === 'COMPLETED' || status === 'SKIPPED') {
              await tx.chartEntry.updateMany({
                where: {
                  patientId,
                  toothNumber: ts.toothNumber,
                  type: 'PLANNED',
                  status: 'ACTIVE',
                  procedureCode: tp.procedure.code,
                  treatmentProcedureId: procedureId,
                },
                data: {
                  status: 'SUPERSEDED',
                  notes: ts.notes
                    ? `Superseded: ${ts.notes}`
                    : `Marked ${status} during session ${session.sessionNumber}`,
                },
              });
            }

            if (status === 'COMPLETED') {
              completedTeeth.push(ts.toothNumber);
              await tx.chartEntry.create({
                data: {
                  patientId,
                  visitId: dto.visitId ?? null,
                  toothNumber: ts.toothNumber,
                  surfaces,
                  type: 'COMPLETED',
                  status: 'ACTIVE',
                  label: tp.procedure.name,
                  procedureCode: tp.procedure.code,
                  treatmentProcedureId: procedureId,
                  procedureSessionId: session.id,
                  providerId: dto.providerId ?? dto.dentistId ?? null,
                  notes:
                    ts.notes ||
                    dto.performedNotes ||
                    `Completed – session ${session.sessionNumber}${dto.phase ? ` (${dto.phase})` : ''}`,
                },
              });
            } else if (status === 'IN_PROGRESS') {
              await tx.chartEntry.updateMany({
                where: {
                  patientId,
                  toothNumber: ts.toothNumber,
                  type: 'PLANNED',
                  status: 'ACTIVE',
                  procedureCode: tp.procedure.code,
                  treatmentProcedureId: procedureId,
                },
                data: {
                  notes: ts.notes
                    ? `In progress: ${ts.notes}`
                    : `Started – session ${session.sessionNumber}`,
                },
              });
            }
          }
        } else {
          // Legacy: no per-tooth breakdown — complete all targets
          for (const target of tp.targets) {
            if (target.toothNumber != null)
              completedTeeth.push(target.toothNumber);
            await tx.chartEntry.updateMany({
              where: {
                patientId,
                toothNumber: target.toothNumber,
                type: 'PLANNED',
                status: 'ACTIVE',
                procedureCode: tp.procedure.code,
                treatmentProcedureId: procedureId,
              },
              data: { status: 'SUPERSEDED' },
            });
            await tx.chartEntry.create({
              data: {
                patientId,
                visitId: dto.visitId ?? null,
                toothNumber: target.toothNumber,
                surfaces: target.surfaces,
                type: 'COMPLETED',
                status: 'ACTIVE',
                label: tp.procedure.name,
                procedureCode: tp.procedure.code,
                treatmentProcedureId: procedureId,
                procedureSessionId: session.id,
                providerId: dto.providerId ?? dto.dentistId ?? null,
                notes:
                  dto.performedNotes ??
                  `Completed – session ${session.sessionNumber}`,
              },
            });
          }
          if (tp.targets.length === 0) {
            // No teeth — create generic completed entry
            await tx.chartEntry.updateMany({
              where: {
                patientId,
                type: 'PLANNED',
                status: 'ACTIVE',
                procedureCode: tp.procedure.code,
                treatmentProcedureId: procedureId,
              },
              data: { status: 'SUPERSEDED' },
            });
            await tx.chartEntry.create({
              data: {
                patientId,
                visitId: dto.visitId ?? null,
                toothNumber: null,
                surfaces: [],
                type: 'COMPLETED',
                status: 'ACTIVE',
                label: tp.procedure.name,
                procedureCode: tp.procedure.code,
                treatmentProcedureId: procedureId,
                procedureSessionId: session.id,
                providerId: dto.providerId ?? dto.dentistId ?? null,
                notes:
                  dto.performedNotes ??
                  `Completed – session ${session.sessionNumber}`,
              },
            });
          }
        }

        // (C4) Extraction completion renders the tooth absent for future guards.
        await this.markTeethAbsentIfExtractionTx(tx, {
          patientId,
          procedure: tp.procedure,
          toothNumbers: completedTeeth,
          visitId: dto.visitId ?? null,
          providerId: dto.providerId ?? dto.dentistId ?? null,
        });

        // ── Persist the session ───────────────────────────────────────────────
        const sessionUpdate: any = {
          status: SessionStatus.COMPLETED,
          performedDate: dto.performedDate
            ? new Date(dto.performedDate)
            : new Date(),
          performedNotes: dto.performedNotes ?? null,
          actualInputsUsed: dto.actualInputsUsed ?? null,
          visitId: dto.visitId ?? null,
          phase: dto.phase ?? null,
          outcome: dto.outcome ?? 'COMPLETED',
          isFinal: dto.isFinal ?? false,
          providerId: dto.providerId ?? dto.dentistId ?? null,
        };
        if (dto.surfaces?.length) sessionUpdate.surfaces = dto.surfaces;
        if (dto.sessionPrice !== undefined)
          sessionUpdate.sessionPrice = dto.sessionPrice;
        sessionUpdate.version = { increment: 1 }; // (H2) optimistic-lock bump

        const updated = await tx.procedureSession.update({
          where: { id: session.id },
          data: sessionUpdate,
        });

        // ── Determine procedure status (THE CORE LOGIC) ───────────────────────
        // Rule: 0 sessions → PLANNED | any session isFinal → COMPLETED | else → IN_PROGRESS
        const allSessions = await tx.procedureSession.findMany({
          where: { treatmentProcedureId: procedureId, deletedAt: null },
          select: { isFinal: true, status: true },
        });

        const anyFinal = allSessions.some((s) => s.isFinal === true);

        const newProcedureStatus = anyFinal
          ? TreatmentStatus.COMPLETED
          : TreatmentStatus.IN_PROGRESS;

        await tx.treatmentProcedure.update({
          where: { id: procedureId },
          data: {
            status: newProcedureStatus,
            completedAt: anyFinal ? new Date() : null,
            performedDate: dto.performedDate
              ? new Date(dto.performedDate)
              : undefined,
            performedNotes: dto.performedNotes,
            version: { increment: 1 }, // (H2) optimistic-lock bump
          },
        });

        // Resolve (or reopen) the conditions this procedure treats.
        await this.syncConditionsForProcedureTx(tx, procedureId, actorUserId);

        // Plan status follows from procedure statuses — recompute
        const { status: planStatus } = await this.recalculatePlanTx(tx, planId);

        // ── Audit: session executed ──────────────────────────────────────────
        // userId is the LOGGED-IN user (from JWT). providerId / dentistId are
        // Staff.ids — they live in newData as clinical facts, never as the
        // FK actor (different table).
        await this.writeAuditTx(tx, {
          action: dto.isFinal ? 'COMPLETE' : 'EXECUTE',
          module: 'TREATMENT_PLANS',
          entityType: 'ProcedureSession',
          entityId: session.id,
          userId: actorUserId ?? null,
          newData: {
            sessionId: session.id,
            procedureId,
            planId,
            status: SessionStatus.COMPLETED,
            isFinal: dto.isFinal ?? false,
            outcome: dto.outcome ?? null,
            phase: dto.phase ?? null,
            performedDate: dto.performedDate ?? null,
            providerId: dto.providerId ?? dto.dentistId ?? null,
            toothStatuses: dto.toothStatuses ?? [],
            finalOverrideReason: dto.finalOverrideReason ?? null,
          },
        });

        const result = {
          data: updated,
          procedureStatus: newProcedureStatus,
          planStatus,
          isFinal: dto.isFinal ?? false,
          message: dto.isFinal
            ? 'Session recorded — procedure marked COMPLETED'
            : 'Session recorded — procedure IN PROGRESS',
        };

        // Persist the idempotency record INSIDE the tx. A concurrent duplicate
        // will violate the PK on `key` and roll its whole transaction back, so it
        // can never create a second session + duplicate chart entries.
        if (dto.idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              key: dto.idempotencyKey,
              scope: 'EXECUTE_SESSION',
              response: result as any,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        return result;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // A racing duplicate committed first; replay its stored response
        // instead of surfacing the unique-violation error.
        if (dto.idempotencyKey) {
          const prior = await this.prisma.idempotencyKey.findUnique({
            where: { key: dto.idempotencyKey },
          });
          if (prior?.response) return prior.response as any;
        }
        // No idempotency key (or no stored response): the concurrent request
        // won the (procedureId, sessionNumber) unique race. Surface it as a
        // conflict rather than a raw DB error.
        throw new ConflictException(
          'A concurrent request already executed this session — refresh to see the result.',
        );
      }
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EDIT SESSION — surfaces + notes + date + provider + outcome + per-tooth
  //                ALL changes recorded in the audit trail
  // ═══════════════════════════════════════════════════════════════════════════

  async editSession(
    planId: string,
    procedureId: string,
    sessionId: string,
    dto: EditSessionDto,
  ) {
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException(
        'A reason is required to edit an executed session (clinical audit trail).',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // ── Load session with everything we need ─────────────────────────────
      const session = await tx.procedureSession.findFirst({
        where: {
          id: sessionId,
          treatmentProcedureId: procedureId,
          deletedAt: null,
        },
        include: {
          targets: true,
          ledgerEntry: { select: { id: true, status: true } },
          treatmentProcedure: {
            include: {
              treatmentPlan: { select: { patientId: true } },
              procedure: { select: { name: true, code: true } },
            },
          },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status === 'VOIDED' || session.status === 'CANCELLED') {
        throw new BadRequestException('Cannot edit a deleted/voided session');
      }

      // (H2) Optimistic lock — reject a stale edit from a second clinician.
      if (
        dto.expectedVersion != null &&
        (session as any).version !== dto.expectedVersion
      ) {
        throw new ConflictException(
          'This session was modified by someone else since you opened it. ' +
            'Reload the latest version and re-apply your change.',
        );
      }

      const isBilled =
        !!session.ledgerEntryId && session.ledgerEntry?.status === 'INVOICED';

      const patientId = session.treatmentProcedure.treatmentPlan.patientId;
      const procedureCode = session.treatmentProcedure.procedure.code;

      // ── Compute surface diff ──────────────────────────────────────────────
      const currentSurfaces: string[] = [
        ...new Set(session.targets.flatMap((t) => t.surfaces as string[])),
      ];
      const newSurfaces: string[] =
        dto.surfaces !== undefined
          ? [...new Set(dto.surfaces)]
          : currentSurfaces;

      const surfacesAdded = newSurfaces.filter(
        (s) => !currentSurfaces.includes(s),
      );
      const surfacesRemoved = currentSurfaces.filter(
        (s) => !newSurfaces.includes(s),
      );

      // ── Safety: billed sessions block surface removal ─────────────────────
      if (isBilled && surfacesRemoved.length > 0) {
        throw new BadRequestException(
          'This session has been invoiced — surface removal is blocked. ' +
            'You may only update clinical notes.',
        );
      }

      // ── Update session targets ────────────────────────────────────────────
      if (dto.surfaces !== undefined && session.targets.length > 0) {
        await tx.procedureTarget.updateMany({
          where: { procedureSessionId: sessionId },
          data: { surfaces: newSurfaces as any },
        });
      }

      // ── Sync chart entries ────────────────────────────────────────────────
      const toothNumbers = session.targets
        .map((t) => t.toothNumber)
        .filter((n): n is number => n !== null);

      for (const toothNumber of toothNumbers) {
        const entry = await tx.chartEntry.findFirst({
          where: {
            patientId,
            toothNumber,
            procedureSessionId: sessionId,
            type: 'COMPLETED',
            status: 'ACTIVE',
          },
        });

        if (!entry) continue;

        if (surfacesRemoved.length > 0) {
          const remaining = (entry.surfaces as string[]).filter(
            (s) => !surfacesRemoved.includes(s),
          );

          if (remaining.length === 0) {
            // Nothing left — void the chart entry
            await tx.chartEntry.update({
              where: { id: entry.id },
              data: {
                status: 'VOIDED',
                notes: [
                  entry.notes,
                  `[EDIT ${new Date().toISOString().slice(0, 10)}] Surfaces removed: ${surfacesRemoved.join(', ')}. Reason: ${dto.reason ?? 'correction'}`,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            });
          } else {
            await tx.chartEntry.update({
              where: { id: entry.id },
              data: {
                surfaces: remaining as any,
                notes: [
                  entry.notes,
                  `[EDIT ${new Date().toISOString().slice(0, 10)}] Surfaces ${surfacesRemoved.join(', ')} removed. Reason: ${dto.reason ?? 'correction'}`,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            });
          }
        }

        if (surfacesAdded.length > 0) {
          const merged = [
            ...new Set([...(entry.surfaces as string[]), ...surfacesAdded]),
          ];
          await tx.chartEntry.update({
            where: { id: entry.id },
            data: {
              surfaces: merged as any,
              notes: [
                entry.notes,
                `[EDIT ${new Date().toISOString().slice(0, 10)}] Surfaces added: ${surfacesAdded.join(', ')}. Reason: ${dto.reason ?? 'correction'}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          });
        }
      }

      // ── Per-tooth status updates (re-sync chart entries) ─────────────────
      //   Allows correcting which teeth were actually completed/skipped.
      const normaliseStatus = (s: string) => s.replace(/-/g, '_').toUpperCase();
      const toothStatusChanges: Array<{
        toothNumber: number;
        before: string;
        after: string;
      }> = [];

      if (dto.toothStatuses?.length) {
        const procName = session.treatmentProcedure.procedure.name;
        for (const ts of dto.toothStatuses) {
          if (!ts.toothNumber) continue;
          const status = normaliseStatus(ts.status);

          const surfacesForTooth = ts.surfaces?.length
            ? (ts.surfaces as any)
            : ((session.targets.find((t) => t.toothNumber === ts.toothNumber)
                ?.surfaces as any) ?? []);

          const existingCompleted = await tx.chartEntry.findFirst({
            where: {
              patientId,
              toothNumber: ts.toothNumber,
              procedureSessionId: sessionId,
              type: 'COMPLETED',
            },
            orderBy: { createdAt: 'desc' },
          });

          const before = existingCompleted?.status ?? 'NONE';
          toothStatusChanges.push({
            toothNumber: ts.toothNumber,
            before,
            after: status,
          });

          if (status === 'COMPLETED') {
            if (existingCompleted) {
              if (existingCompleted.status !== 'ACTIVE') {
                await tx.chartEntry.update({
                  where: { id: existingCompleted.id },
                  data: {
                    status: 'ACTIVE',
                    surfaces: surfacesForTooth,
                    notes: [
                      existingCompleted.notes,
                      `[EDIT ${new Date().toISOString().slice(0, 10)}] Re-activated as COMPLETED. Reason: ${dto.reason ?? 'correction'}`,
                    ]
                      .filter(Boolean)
                      .join('\n'),
                  },
                });
              } else if (ts.surfaces) {
                await tx.chartEntry.update({
                  where: { id: existingCompleted.id },
                  data: { surfaces: surfacesForTooth },
                });
              }
            } else {
              // Supersede any active PLANNED for this tooth+procedure, then
              // create a fresh COMPLETED entry.
              await tx.chartEntry.updateMany({
                where: {
                  patientId,
                  toothNumber: ts.toothNumber,
                  type: 'PLANNED',
                  status: 'ACTIVE',
                  procedureCode,
                  treatmentProcedureId: procedureId,
                },
                data: { status: 'SUPERSEDED' },
              });
              await tx.chartEntry.create({
                data: {
                  patientId,
                  visitId: session.visitId ?? null,
                  toothNumber: ts.toothNumber,
                  surfaces: surfacesForTooth,
                  type: 'COMPLETED',
                  status: 'ACTIVE',
                  label: procName,
                  procedureCode,
                  treatmentProcedureId: procedureId,
                  procedureSessionId: sessionId,
                  providerId: dto.providerId ?? null,
                  notes:
                    ts.notes ??
                    `[EDIT ${new Date().toISOString().slice(0, 10)}] Marked COMPLETED. Reason: ${dto.reason ?? 'correction'}`,
                },
              });
            }
          } else if (
            status === 'SKIPPED' ||
            status === 'PENDING' ||
            status === 'IN_PROGRESS'
          ) {
            // Reverse the completion for this tooth: void the COMPLETED entry
            // and restore any PLANNED entry that was superseded.
            if (existingCompleted && existingCompleted.status === 'ACTIVE') {
              await tx.chartEntry.update({
                where: { id: existingCompleted.id },
                data: {
                  status: 'VOIDED',
                  notes: [
                    existingCompleted.notes,
                    `[EDIT ${new Date().toISOString().slice(0, 10)}] Reverted to ${status}. Reason: ${dto.reason ?? 'correction'}`,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                },
              });
            }
            const planned = await tx.chartEntry.findFirst({
              where: {
                patientId,
                toothNumber: ts.toothNumber,
                procedureCode,
                treatmentProcedureId: procedureId,
                type: 'PLANNED',
                status: 'SUPERSEDED',
              },
              orderBy: { createdAt: 'desc' },
            });
            if (planned) {
              await tx.chartEntry.update({
                where: { id: planned.id },
                data: {
                  status: 'ACTIVE',
                  notes: `[RESTORED ${new Date().toISOString().slice(0, 10)}] Re-activated after edit. Reason: ${dto.reason ?? 'correction'}`,
                },
              });
            }
          }
        }
      }

      // ── Persist session field updates ─────────────────────────────────────
      const sessionPatch: any = {
        lastEditReason: dto.reason,
        version: { increment: 1 }, // (H2) optimistic-lock bump
      };
      if (dto.notes !== undefined) sessionPatch.performedNotes = dto.notes;
      if (dto.phase !== undefined) sessionPatch.phase = dto.phase;
      if (dto.performedDate !== undefined)
        sessionPatch.performedDate = dto.performedDate
          ? new Date(dto.performedDate)
          : null;
      if (dto.providerId !== undefined)
        sessionPatch.providerId = dto.providerId || null;
      if (dto.outcome !== undefined) sessionPatch.outcome = dto.outcome;
      if (dto.isFinal !== undefined) sessionPatch.isFinal = dto.isFinal;

      const updatedSession = await tx.procedureSession.update({
        where: { id: sessionId },
        data: sessionPatch,
        include: { targets: true, ledgerEntry: true },
      });

      // ── If outcome/isFinal changed, re-evaluate procedure status ─────────
      if (dto.isFinal !== undefined || dto.outcome !== undefined) {
        const allSessions = await tx.procedureSession.findMany({
          where: {
            treatmentProcedureId: procedureId,
            deletedAt: null,
            status: { notIn: [SessionStatus.CANCELLED, SessionStatus.VOIDED] },
          },
          select: { isFinal: true, status: true },
        });
        const anyFinal = allSessions.some((s) => s.isFinal === true);
        const newStatus =
          allSessions.length === 0
            ? TreatmentStatus.PLANNED
            : anyFinal
              ? TreatmentStatus.COMPLETED
              : TreatmentStatus.IN_PROGRESS;
        await tx.treatmentProcedure.update({
          where: { id: procedureId },
          data: {
            status: newStatus,
            completedAt:
              newStatus === TreatmentStatus.COMPLETED ? new Date() : null,
            version: { increment: 1 }, // (H2) optimistic-lock bump
          },
        });

        // Completion may have flipped either way — sync linked conditions.
        await this.syncConditionsForProcedureTx(
          tx,
          procedureId,
          dto.editedById,
        );

        // Procedure status moved — propagate to the plan
        await this.recalculatePlanTx(tx, planId);
      }

      // ── Write audit record ────────────────────────────────────────────────
      const editCode = await this.generateEditCode(tx);
      const reasonParts = [dto.reason ?? null];
      if (dto.performedDate !== undefined)
        reasonParts.push(`date→${dto.performedDate}`);
      if (dto.providerId !== undefined)
        reasonParts.push(`provider→${dto.providerId || 'none'}`);
      if (dto.outcome !== undefined) reasonParts.push(`outcome→${dto.outcome}`);
      if (dto.isFinal !== undefined) reasonParts.push(`isFinal→${dto.isFinal}`);
      if (toothStatusChanges.length)
        reasonParts.push(
          `teeth: ${toothStatusChanges.map((t) => `${t.toothNumber}:${t.before}→${t.after}`).join(', ')}`,
        );
      const audit = await tx.procedureSessionEdit.create({
        data: {
          editCode,
          sessionId,
          surfacesBefore: currentSurfaces,
          surfacesAfter: newSurfaces,
          surfacesAdded,
          surfacesRemoved,
          notesBefore: session.performedNotes ?? null,
          notesAfter: dto.notes ?? session.performedNotes ?? null,
          phaseBefore: (session as any).phase ?? null,
          phaseAfter: dto.phase ?? (session as any).phase ?? null,
          reason: reasonParts.filter(Boolean).join(' | ') || null,
          editedById: dto.editedById ?? null,
        },
      });

      // ── Generic audit log entry (cross-entity view) ──────────────────────
      await this.writeAuditTx(tx, {
        action: 'UPDATE',
        module: 'TREATMENT_PLANS',
        entityType: 'ProcedureSession',
        entityId: sessionId,
        userId: dto.editedById ?? null,
        reason: dto.reason,
        oldData: {
          surfaces: currentSurfaces,
          notes: session.performedNotes ?? null,
          phase: (session as any).phase ?? null,
          performedDate: session.performedDate ?? null,
          providerId: session.providerId ?? null,
          outcome: (session as any).outcome ?? null,
          isFinal: (session as any).isFinal ?? false,
        },
        newData: {
          surfaces: newSurfaces,
          notes: dto.notes ?? session.performedNotes ?? null,
          phase: dto.phase ?? (session as any).phase ?? null,
          performedDate:
            dto.performedDate !== undefined
              ? dto.performedDate
              : session.performedDate,
          providerId:
            dto.providerId !== undefined ? dto.providerId : session.providerId,
          outcome: dto.outcome ?? (session as any).outcome ?? null,
          isFinal:
            dto.isFinal !== undefined
              ? dto.isFinal
              : ((session as any).isFinal ?? false),
          toothStatusChanges,
        },
      });

      return {
        data: updatedSession,
        diff: {
          surfacesAdded,
          surfacesRemoved,
          isBilled,
          toothStatusChanges,
        },
        audit,
        message:
          surfacesAdded.length +
            surfacesRemoved.length +
            toothStatusChanges.length >
          0
            ? `Session updated — ${surfacesAdded.length} surface(s) added, ${surfacesRemoved.length} removed, ${toothStatusChanges.length} tooth status change(s)`
            : 'Session updated',
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE SESSION — soft-delete the session and reverse every side effect
  //   • Session itself      → soft delete (deletedAt set; status → CANCELLED)
  //   • Chart entries       → soft delete (status → VOIDED)
  //   • Superseded PLANNED  → restored to ACTIVE
  //   • Ledger entry        → soft delete (status → VOID); blocks if INVOICED
  //   • Imaging records     → unlinked (procedureSessionId nulled)
  //   • Progress-report links → hard-deleted (the report itself stays)
  //   • Procedure status    → recalculated
  // ═══════════════════════════════════════════════════════════════════════════

  async deleteSession(
    planId: string,
    procedureId: string,
    sessionId: string,
    dto: DeleteSessionDto,
  ) {
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException(
        'A reason is required to void a clinical session (audit trail).',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.procedureSession.findFirst({
        where: {
          id: sessionId,
          treatmentProcedureId: procedureId,
          deletedAt: null,
        },
        include: {
          targets: true,
          ledgerEntry: { select: { id: true, status: true } },
          treatmentProcedure: {
            include: {
              treatmentPlan: { select: { patientId: true } },
              procedure: { select: { name: true, code: true } },
            },
          },
        },
      });
      if (!session) throw new NotFoundException('Session not found');

      // (H2) Optimistic lock — reject a stale delete from a second clinician.
      if (
        dto.expectedVersion != null &&
        (session as any).version !== dto.expectedVersion
      ) {
        throw new ConflictException(
          'This session was modified by someone else since you opened it. ' +
            'Reload the latest version before deleting.',
        );
      }

      // Block void if invoiced — must go through credit-note flow
      if (session.ledgerEntry?.status === 'INVOICED') {
        throw new BadRequestException(
          'This session has been invoiced and cannot be voided. ' +
            'Please raise a credit note through the billing module.',
        );
      }

      const patientId = session.treatmentProcedure.treatmentPlan.patientId;
      const procedureCode = session.treatmentProcedure.procedure.code;
      const stamp = new Date().toISOString().slice(0, 10);
      const reasonText = dto.reason || 'no reason supplied';

      // ── 1. Soft-delete chart entries linked to this session ──────────────
      const voidedEntries = await tx.chartEntry.updateMany({
        where: {
          procedureSessionId: sessionId,
          status: { in: ['ACTIVE', 'SUPERSEDED'] },
        },
        data: {
          status: 'VOIDED',
          notes: `[DELETED ${stamp}] Session deleted: ${reasonText}`,
        },
      });

      // ── 2. Restore PLANNED entries that this execution had superseded ────
      const toothNumbers = session.targets
        .map((t) => t.toothNumber)
        .filter((n): n is number => n !== null);

      let restoredCount = 0;
      for (const toothNumber of toothNumbers) {
        const superseded = await tx.chartEntry.findFirst({
          where: {
            patientId,
            toothNumber,
            procedureCode,
            type: 'PLANNED',
            status: 'SUPERSEDED',
          },
          orderBy: { createdAt: 'desc' },
        });
        if (superseded) {
          await tx.chartEntry.update({
            where: { id: superseded.id },
            data: {
              status: 'ACTIVE',
              notes: `[RESTORED ${stamp}] Restored after session ${session.sessionNumber} was deleted.`,
            },
          });
          restoredCount++;
        }
      }

      // ── 3. Soft-delete pending ledger entry ──────────────────────────────
      if (session.ledgerEntryId) {
        await tx.ledgerEntry.update({
          where: { id: session.ledgerEntryId },
          data: {
            status: 'VOID',
            notes: `Session ${session.sessionNumber} deleted: ${reasonText}`,
          },
        });
      }

      // ── 4. Unlink imaging records (preserve the artefacts) ───────────────
      const unlinkedImages = await tx.imagingRecord.updateMany({
        where: { procedureSessionId: sessionId },
        data: { procedureSessionId: null },
      });

      // ── 5. Remove progress-report join rows (reports themselves survive) ─
      const removedProgressLinks = await tx.progressReportProcedure.deleteMany({
        where: { procedureSessionId: sessionId },
      });

      // ── 6. Soft-delete the session itself (status = VOIDED) ──────────────
      // VOIDED = "this record should not appear normally" — semantically
      // distinct from CANCELLED ("the planned activity didn't happen"). We
      // also keep the original notes appended so the row remains readable.
      await tx.procedureSession.update({
        where: { id: sessionId },
        data: {
          deletedAt: new Date(),
          deletedById: dto.deletedById ?? null,
          deletedReason: reasonText,
          status: SessionStatus.VOIDED,
          version: { increment: 1 }, // (H2) optimistic-lock bump
          performedNotes: [
            `[VOIDED ${stamp}] ${reasonText}`,
            session.performedNotes,
          ]
            .filter(Boolean)
            .join('\n---\nOriginal notes:\n'),
        },
      });

      // ── 7. Recalculate procedure status (ignoring voided/cancelled) ──────
      const activeSessions = await tx.procedureSession.findMany({
        where: {
          treatmentProcedureId: procedureId,
          deletedAt: null,
          status: { notIn: [SessionStatus.CANCELLED, SessionStatus.VOIDED] },
        },
        select: { isFinal: true },
      });

      const newStatus =
        activeSessions.length === 0
          ? TreatmentStatus.PLANNED
          : activeSessions.some((s) => (s as any).isFinal)
            ? TreatmentStatus.COMPLETED
            : TreatmentStatus.IN_PROGRESS;

      await tx.treatmentProcedure.update({
        where: { id: procedureId },
        data: {
          status: newStatus,
          completedAt:
            newStatus === TreatmentStatus.COMPLETED ? new Date() : null,
          version: { increment: 1 }, // (H2) optimistic-lock bump
        },
      });

      // Voiding a session may have un-completed the procedure — reopen any
      // conditions it had auto-resolved.
      await this.syncConditionsForProcedureTx(tx, procedureId, dto.deletedById);

      // Procedure status moved — propagate to the plan
      const { status: planStatus } = await this.recalculatePlanTx(tx, planId);

      // ── 8. Generic audit log entry (cross-entity history) ───────────────
      await this.writeAuditTx(tx, {
        action: 'VOID',
        module: 'TREATMENT_PLANS',
        entityType: 'ProcedureSession',
        entityId: sessionId,
        userId: dto.deletedById ?? null,
        reason: reasonText,
        oldData: {
          status: session.status,
          sessionNumber: session.sessionNumber,
          performedDate: session.performedDate,
          providerId: session.providerId,
          isFinal: (session as any).isFinal ?? false,
        },
        newData: {
          status: SessionStatus.VOIDED,
          sideEffectsReversed: {
            chartEntriesVoided: voidedEntries.count,
            chartEntriesRestored: restoredCount,
            imagingUnlinked: unlinkedImages.count,
            progressLinksRemoved: removedProgressLinks.count,
            ledgerVoided: !!session.ledgerEntryId,
          },
          procedureStatus: newStatus,
          planStatus,
        },
      });

      return {
        success: true,
        chartEntriesVoided: voidedEntries.count,
        chartEntriesRestored: restoredCount,
        imagingUnlinked: unlinkedImages.count,
        progressLinksRemoved: removedProgressLinks.count,
        procedureStatus: newStatus,
        planStatus,
        message: `Session ${session.sessionNumber} voided. Procedure status: ${newStatus}`,
      };
    });
  }

  // Kept for backwards-compat with any external caller of the old API.
  async voidSession(
    planId: string,
    procedureId: string,
    sessionId: string,
    dto: DeleteSessionDto,
  ) {
    return this.deleteSession(planId, procedureId, sessionId, dto);
  }

  // ── Private helper ────────────────────────────────────────────────────────────
  private async generateEditCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    // Atomic, concurrency-safe: SE-YY-NNNN via the document-number counter.
    return this.docNum.next('SE', tx);
  }

  // ── Generic audit log lookup ──────────────────────────────────────────────────
  // Returns the full audit history for a given entity (any model), newest first.
  // The UI uses this for "who changed what when" on procedures and sessions.
  async getEntityAuditLog(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, recordId: entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get session edit history ──────────────────────────────────────────────────
  async getSessionEditHistory(
    planId: string,
    procedureId: string,
    sessionId: string,
  ) {
    const session = await this.prisma.procedureSession.findFirst({
      where: {
        id: sessionId,
        treatmentProcedureId: procedureId,
        deletedAt: null,
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    return this.prisma.procedureSessionEdit.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async duplicatePlan(planId: string, newPatientId?: string) {
    const original = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: {
        procedures: {
          include: {
            sessions: {
              where: { deletedAt: null },
              include: { targets: true },
            },
            targets: true, // Include procedure targets
          },
        },
      },
    });
    if (!original) throw new NotFoundException('Treatment plan not found');

    const targetPatientId = newPatientId ?? original.patientId;

    if (newPatientId && newPatientId !== original.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: newPatientId },
      });
      if (!patient) throw new NotFoundException('Target patient not found');
    }

    const duplicated = await this.prisma.$transaction(async (tx) => {
      const newPlanCode = await this.generatePlanCode(tx);
      const plan = await tx.treatmentPlan.create({
        data: {
          planCode: newPlanCode,
          patientId: targetPatientId,
          dentistId: original.dentistId,
          title: `Copy of ${original.title}`,
          description: original.description,
          diagnosis: original.diagnosis,
          status: 'PLANNED',
          priority: original.priority,
          estimatedCost: original.estimatedCost,
          notes: original.notes,
        },
      });

      for (const proc of original.procedures) {
        // Create the procedure without toothNumbers and surfaces
        const newProc = await tx.treatmentProcedure.create({
          data: {
            treatmentPlanId: plan.id,
            procedureId: proc.procedureId,
            status: 'PLANNED',
            sequence: proc.sequence,
            notes: proc.notes,
            visitGroup: proc.visitGroup,
            sessionType: proc.sessionType,
            sessionCount: proc.sessionCount,
            billingType: proc.billingType,
            ledgerStatus: 'PENDING',
            pricingModel: proc.pricingModel,
            billingUnit: proc.billingUnit,
            pricePerUnit: proc.pricePerUnit,
            costPerUnit: proc.costPerUnit,
            subtotalPrice: proc.subtotalPrice,
            subtotalCost: proc.subtotalCost,
            totalPrice: proc.totalPrice,
            currency: proc.currency,
            exchangeRate: proc.exchangeRate,
            baseCurrency: proc.baseCurrency,
            baseAmount: proc.baseAmount,
          },
        });

        // Copy ProcedureTarget entries
        if (proc.targets.length > 0) {
          for (const target of proc.targets) {
            await tx.procedureTarget.create({
              data: {
                treatmentProcedureId: newProc.id,
                toothNumber: target.toothNumber,
                surfaces: target.surfaces,
                unitIndex: target.unitIndex,
              },
            });
          }
        }

        // Copy sessions and their targets
        if (proc.sessionType === 'MULTI' && proc.sessions.length > 0) {
          for (const session of proc.sessions) {
            const newSession = await tx.procedureSession.create({
              data: {
                treatmentProcedureId: newProc.id,
                visitGroup: session.visitGroup,
                sessionNumber: session.sessionNumber,
                sessionLabel: session.sessionLabel,
                status: 'PENDING' as const,
                sessionPrice: session.sessionPrice,
                ledgerStatus: 'PENDING' as const,
              },
            });

            // Copy session targets
            if (session.targets.length > 0) {
              for (const target of session.targets) {
                await tx.procedureTarget.create({
                  data: {
                    procedureSessionId: newSession.id,
                    toothNumber: target.toothNumber,
                    surfaces: target.surfaces,
                    unitIndex: target.unitIndex,
                  },
                });
              }
            }
          }
        }
      }

      return plan;
    });

    return {
      data: await this.prisma.treatmentPlan.findUnique({
        where: { id: duplicated.id },
        include: {
        procedures: {
          where: { deletedAt: null },
          include: {
              sessions: {
                where: { deletedAt: null },
                include: { targets: true },
              },
              procedure: true,
              targets: true,
            },
          },
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      message: 'Treatment plan duplicated successfully',
    };
  }

  private async generatePlanCode(
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    // Unified format with createTreatmentPlan: TP-YY-NNNN (was TP-YYYYMM-####).
    return this.docNum.next('TP', tx);
  }

  async getPatientProcedures(patientId: string): Promise<any[]> {
    const plans = await this.prisma.treatmentPlan.findMany({
      where: {
        patientId,
        status: { not: 'CANCELLED' },
      },
      include: {
        procedures: {
          where: {
            status: { not: 'CANCELLED' },
          },
          include: {
            procedure: {
              select: {
                id: true,
                name: true,
                code: true,
                category: true,
                // Pricing snapshot from the catalog — used by the edit dialog
                // to compute the discount % when the user changes the price.
                basePrice: true,
                baseCost: true,
                pricingModel: true,
                billingUnit: true,
                currency: true,
                priceRangeMin: true,
                priceRangeMax: true,
              },
            },
            targets: true,
            sessions: {
              where: {
                deletedAt: null,
                status: { not: 'CANCELLED' },
              },
              include: { targets: true },
            },
            // Surface the linked invoice (if any) so the UI can lock pricing
            // fields when the invoice is POSTED or has payments.
            invoiceItems: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                invoice: {
                  select: {
                    id: true,
                    status: true,
                    paymentStatus: true,
                    amountPaid: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const allProcedures = plans.flatMap((plan) =>
      plan.procedures.map((proc) => {
        const invoiceItem = (proc as any).invoiceItems?.[0] ?? null;
        const invoice = invoiceItem?.invoice ?? null;
        // Strip the Prisma relation off the surface response — replace with
        // a flat object the UI can read directly.
        const { invoiceItems: _omit, ...rest } = proc as any;
        return {
          ...rest,
          treatmentPlanTitle: plan.title,
          planStatus: plan.status,
          // The single most-recent linked invoice (or null if no item).
          invoiceId: invoice?.id ?? null,
          invoiceStatus: invoice?.status ?? null,            // DRAFT | POSTED | VOID
          invoicePaymentStatus: invoice?.paymentStatus ?? null, // UNPAID | PARTIALLY_PAID | PAID
          invoiceAmountPaid: invoice ? Number(invoice.amountPaid) : 0,
        };
      }),
    );

    return allProcedures;
  }

  async getToothProcedures(
    patientId: string,
    toothNumber: number,
  ): Promise<any[]> {
    const procedures = await this.prisma.treatmentProcedure.findMany({
      where: {
        deletedAt: null,
        treatmentPlan: {
          patientId,
          status: { not: 'CANCELLED' },
        },
        status: { not: 'CANCELLED' },
        targets: {
          some: {
            toothNumber: toothNumber,
          },
        },
      },
      include: {
        procedure: {
          select: {
            id: true,
            name: true,
            code: true,
            category: true,
          },
        },
        targets: {
          where: { toothNumber: toothNumber },
        },
        treatmentPlan: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        sessions: {
          where: {
            deletedAt: null,
            targets: {
              some: { toothNumber: toothNumber },
            },
          },
          include: { targets: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return procedures;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONDITIONS — fetch patient conditions filterable by tooth
  // ═══════════════════════════════════════════════════════════════════════

  async getPatientConditionsForTeeth(
    patientId: string,
    toothNumbers?: number[],
  ) {
    const where: Prisma.PatientConditionWhereInput = {
      patientId,
      status: { in: ['ACTIVE', 'MONITORED'] },
      deletedAt: null, // ← never surface soft-deleted conditions
    };

    if (toothNumbers?.length) {
      where.toothNumber = { in: toothNumbers };
    }

    return this.prisma.patientCondition.findMany({
      where,
      include: {
        condition: {
          select: { id: true, name: true, icd10Code: true, category: true },
        },
      },
      orderBy: { diagnosedAt: 'desc' },
    });
  }

  /**
   * Reconcile the set of condition links for a procedure.
   *
   * Diff-based with full audit:
   *   • links not in the new set are SOFT-deleted (deletedAt/unlinkedById/reason)
   *   • newly-added links are created with a frozen SNAPSHOT of the condition
   *     (name, code, status) at link time, so clinical history survives later
   *     edits to the underlying PatientCondition.
   *
   * Re-linking a previously-unlinked condition creates a fresh row (the partial
   * unique index only constrains active links), preserving the full link/unlink
   * timeline.
   */
  async updateProcedureConditionLinks(
    planId: string,
    procedureId: string,
    linkedConditionIds: string[],
    actorUserId?: string,
  ) {
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId },
      include: { treatmentPlan: { select: { patientId: true } } },
    });
    if (!tp) throw new NotFoundException('Procedure not found in this plan');

    const patientId = tp.treatmentPlan.patientId;
    const desired = new Set(linkedConditionIds ?? []);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conditionProcedureLink.findMany({
        where: { treatmentProcedureId: procedureId, deletedAt: null },
      });
      const existingByCondition = new Map(
        existing.map((l) => [l.patientConditionId, l]),
      );

      // 1. Soft-delete links the user removed.
      const toUnlink = existing.filter(
        (l) => !desired.has(l.patientConditionId),
      );
      if (toUnlink.length) {
        await tx.conditionProcedureLink.updateMany({
          where: { id: { in: toUnlink.map((l) => l.id) } },
          data: {
            deletedAt: new Date(),
            unlinkedById: actorUserId ?? null,
            deletedReason: 'Unlinked via procedure condition update',
          },
        });
      }

      // 2. Create links the user added (with frozen snapshot).
      const created: any[] = [];
      for (const patientConditionId of desired) {
        if (existingByCondition.has(patientConditionId)) continue; // already active

        const pc = await tx.patientCondition.findFirst({
          where: { id: patientConditionId, patientId, deletedAt: null },
          include: { condition: { select: { name: true, icd10Code: true } } },
        });
        if (!pc) continue; // ignore conditions that don't belong to this patient

        created.push(
          await tx.conditionProcedureLink.create({
            data: {
              patientConditionId,
              treatmentProcedureId: procedureId,
              linkedById: actorUserId ?? null,
              conditionNameAtLink: pc.condition?.name ?? null,
              conditionCodeAtLink: pc.condition?.icd10Code ?? null,
              conditionStatusAtLink: pc.status ?? null,
            },
          }),
        );
      }

      const active = await tx.conditionProcedureLink.findMany({
        where: { treatmentProcedureId: procedureId, deletedAt: null },
      });
      return {
        updated: active.length,
        unlinked: toUnlink.length,
        created: created.length,
        links: active,
      };
    });
  }

  /**
   * Soft-unlink every active condition link for a procedure (used when the whole
   * procedure is removed/cancelled). Preserves the audit trail rather than
   * hard-deleting. Safe to call even when there are no links.
   */
  private async softUnlinkConditionLinksTx(
    tx: Prisma.TransactionClient,
    procedureId: string,
    actorUserId?: string,
    reason?: string,
  ) {
    await tx.conditionProcedureLink.updateMany({
      where: { treatmentProcedureId: procedureId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        unlinkedById: actorUserId ?? null,
        deletedReason: reason ?? 'Procedure removed/cancelled',
      },
    });
  }

  async getProcedureConditionLinks(planId: string, procedureId: string) {
    return this.prisma.conditionProcedureLink.findMany({
      where: { treatmentProcedureId: procedureId, deletedAt: null },
      include: {
        patientCondition: {
          include: {
            condition: {
              select: { id: true, name: true, icd10Code: true, category: true },
            },
          },
        },
      },
    });
  }

  // src/treatment-plans/treatment-plans.service.ts
  async getSessionsByVisit(visitId: string) {
    const sessions = await this.prisma.procedureSession.findMany({
      where: {
        visitId,
        deletedAt: null,
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        treatmentProcedure: {
          include: {
            procedure: { select: { id: true, name: true, code: true } },
            treatmentPlan: { select: { title: true } },
          },
        },
        targets: true,
        ledgerEntry: true,
      },
      orderBy: { performedDate: 'desc' },
    });
    return sessions;
  }

  async getPatientVisits(patientId: string) {
    return this.prisma.visit.findMany({
      where: { patientId },
      include: {
        dentist: { select: { firstName: true, lastName: true } },
        // appointment: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPatientExecutedSessions(patientId: string) {
    const sessions = await this.prisma.procedureSession.findMany({
      where: {
        visit: { patientId }, // session has visit relation (from executeSession)
        deletedAt: null,
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        treatmentProcedure: {
          include: {
            procedure: { select: { id: true, name: true, code: true } },
            treatmentPlan: { select: { title: true } },
          },
        },
        targets: true,
        visit: { select: { id: true, visitCode: true, createdAt: true } },
      },
      orderBy: { performedDate: 'desc' },
    });
    return sessions;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ADD THESE METHODS INSIDE TreatmentPlansService CLASS
  // File: src/treatment-plans/treatment-plans.service.ts
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─── Shared filter type ────────────────────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════════════
  // REPORT 1 — Treatment Plans
  // ═══════════════════════════════════════════════════════════════════════════════
  async getTreatmentPlansReport(filters: ReportFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 20);
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    const SAFE_PLAN_SORT = new Set([
      'createdAt',
      'updatedAt',
      'status',
      'title',
      'planCode',
      'priority',
      'startDate',
      'estimatedCost',
    ]);
    const resolvedSort = SAFE_PLAN_SORT.has(sortBy) ? sortBy : 'createdAt';

    const where: Prisma.TreatmentPlanWhereInput = {};

    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && {
          lte: new Date(filters.endDate + 'T23:59:59'),
        }),
      };
    }
    if (filters.dentistId) where.dentistId = filters.dentistId;
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.status) where.status = filters.status as TreatmentStatus;
    if (filters.priority) where.priority = filters.priority;
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { planCode: { contains: filters.search, mode: 'insensitive' } },
        { diagnosis: { contains: filters.search, mode: 'insensitive' } },
        {
          patient: {
            firstName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          patient: {
            lastName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          patient: {
            patientCode: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, plans, statusGroups] = await Promise.all([
      this.prisma.treatmentPlan.count({ where }),

      this.prisma.treatmentPlan.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
              phone: true,
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
          procedures: {
            where: { deletedAt: null, status: { not: TreatmentStatus.CANCELLED } },
            select: {
              status: true,
              totalPrice: true,
              amountPaid: true,
              paymentStatus: true,
              // Carry base-currency snapshot for cross-currency aggregation.
              baseAmount: true,
              currency: true,
              exchangeRate: true,
            },
          },
        },
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.treatmentPlan.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
    ]);

    const rows = plans.map((plan) => {
      const procs = plan.procedures;
      const completed = procs.filter(
        (p) => p.status === TreatmentStatus.COMPLETED,
      );
      const inProgress = procs.filter(
        (p) => p.status === TreatmentStatus.IN_PROGRESS,
      );
      const planned = procs.filter((p) => p.status === TreatmentStatus.PLANNED);
      // baseAmount on each procedure is the UGX-equivalent at the rate that
      // applied when the procedure was added. Summing it produces a totals
      // figure that survives mixed-currency plans, which the previous
      // `Number(totalPrice)` sum did not.
      const totalCostBase = procs.reduce(
        (s, p) => s + Number(p.baseAmount ?? p.totalPrice ?? 0),
        0,
      );
      const amountPaidBase = procs.reduce((s, p) => {
        const rate =
          p.exchangeRate != null
            ? Number(p.exchangeRate)
            : p.currency === 'UGX'
              ? 1
              : 1;
        return s + Number(p.amountPaid ?? 0) * rate;
      }, 0);

      return {
        id: plan.id,
        planCode: plan.planCode,
        title: plan.title,
        diagnosis: plan.diagnosis,
        patient: plan.patient,
        dentist: plan.dentist,
        status: plan.status,
        priority: plan.priority,
        startDate: plan.startDate,
        endDate: plan.endDate,
        createdAt: plan.createdAt,
        consentSigned: plan.consentSigned,
        totalProcedures: procs.length,
        completedProcedures: completed.length,
        inProgressProcedures: inProgress.length,
        plannedProcedures: planned.length,
        completionPercent:
          procs.length > 0
            ? Math.round((completed.length / procs.length) * 100)
            : 0,
        // ── Plan totals are always in base currency (UGX). Procedures
        // inside the plan can be either currency, but the plan total is
        // the cross-currency reconciled figure.
        totalCost: totalCostBase,
        amountPaid: amountPaidBase,
        outstanding: totalCostBase - amountPaidBase,
        currency: 'UGX',
      };
    });

    // ── Full-dataset money + completion aggregates ────────────────────────────
    // The per-row totals above are correct PER PLAN, but the *summary* must
    // reflect EVERY matching plan — not just the current page. Aggregate across
    // all (non-cancelled) procedures of all matching plans, bounded by the same
    // filter. Without this, summary money totals silently shrink past page 1.
    const allPlanProcs = await this.prisma.treatmentProcedure.findMany({
      where: {
        treatmentPlan: where,
        deletedAt: null,
        status: { not: TreatmentStatus.CANCELLED },
      },
      select: {
        treatmentPlanId: true,
        status: true,
        baseAmount: true,
        totalPrice: true,
        amountPaid: true,
        currency: true,
        exchangeRate: true,
      },
    });
    let sumCostBase = 0;
    let sumPaidBase = 0;
    const perPlan = new Map<string, { done: number; total: number }>();
    for (const p of allPlanProcs) {
      sumCostBase += Number(p.baseAmount ?? p.totalPrice ?? 0);
      const rate = p.exchangeRate != null ? Number(p.exchangeRate) : 1; // UGX / missing-rate → 1
      sumPaidBase += Number(p.amountPaid ?? 0) * rate;
      const agg = perPlan.get(p.treatmentPlanId) ?? { done: 0, total: 0 };
      agg.total += 1;
      if (p.status === TreatmentStatus.COMPLETED) agg.done += 1;
      perPlan.set(p.treatmentPlanId, agg);
    }
    // Average completion over ALL matching plans (a plan with no procedures = 0%).
    const sumPlanPcts = [...perPlan.values()].reduce(
      (s, a) => s + (a.total ? (a.done / a.total) * 100 : 0),
      0,
    );
    const avgCompletionPct = total ? Math.round(sumPlanPcts / total) : 0;

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count.id]),
    );

    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        totalPlanned: byStatus['PLANNED'] ?? 0,
        totalInProgress: byStatus['IN_PROGRESS'] ?? 0,
        totalCompleted: byStatus['COMPLETED'] ?? 0,
        totalOnHold: byStatus['ON_HOLD'] ?? 0,
        totalCancelled: byStatus['CANCELLED'] ?? 0,
        // Aggregated across EVERY matching plan (full dataset), base currency.
        totalCost: sumCostBase,
        totalAmountPaid: sumPaidBase,
        totalOutstanding: sumCostBase - sumPaidBase,
        baseCurrency: 'UGX',
        avgCompletionPct,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // REPORT 2 — Procedures
  // ═══════════════════════════════════════════════════════════════════════════════
  async getProceduresReport(
    filters: ReportFilters & {
      procedureId?: string;
      billingType?: string;
      categoryId?: string;
    },
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 20);
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';

    const SAFE_PROC_SORT = new Set([
      'createdAt',
      'updatedAt',
      'status',
      'totalPrice',
      'scheduledDate',
      'performedDate',
      'completedAt',
      'sequence',
    ]);
    const resolvedSort = SAFE_PROC_SORT.has(sortBy) ? sortBy : 'createdAt';

    const where: Prisma.TreatmentProcedureWhereInput = {
      deletedAt: null,
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && {
          lte: new Date(filters.endDate + 'T23:59:59'),
        }),
      };
    }

    // Plan-level filters
    const planFilter: Prisma.TreatmentPlanWhereInput = {};
    if (filters.dentistId) planFilter.dentistId = filters.dentistId;
    if (filters.patientId) planFilter.patientId = filters.patientId;
    if (Object.keys(planFilter).length) where.treatmentPlan = planFilter;

    if (filters.status) where.status = filters.status as TreatmentStatus;
    if (filters.billingType)
      where.billingType = filters.billingType as BillingType;
    if (filters.procedureId) {
      where.procedure = {
        OR: [{ id: filters.procedureId }, { code: filters.procedureId }],
      };
    }
    if (filters.categoryId)
      where.procedure = {
        ...(where.procedure as any),
        categoryId: filters.categoryId,
      };

    if (filters.search) {
      where.OR = [
        {
          procedure: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          procedure: {
            code: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          treatmentPlan: {
            patient: {
              firstName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          treatmentPlan: {
            patient: {
              lastName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          treatmentPlan: {
            patient: {
              patientCode: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          treatmentPlan: {
            planCode: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, procedures, statusGroups] = await Promise.all([
      this.prisma.treatmentProcedure.count({ where }),

      this.prisma.treatmentProcedure.findMany({
        where,
        include: {
          procedure: {
            select: {
              id: true,
              name: true,
              code: true,
              category: { select: { id: true, name: true, color: true } },
            },
          },
          treatmentPlan: {
            select: {
              id: true,
              planCode: true,
              title: true,
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  patientCode: true,
                  phone: true,
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
          },
          targets: { select: { toothNumber: true, surfaces: true } },
          sessions: {
            where: { deletedAt: null },
            select: { id: true, status: true, isFinal: true },
          },
          ledgerEntry: { select: { id: true, status: true, totalPrice: true } },
          provider: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),

      // Summary sums use `baseAmount` (UGX-equivalent stored on each row)
      // so mixed-currency procedures (USD + UGX) reconcile correctly. The
      // per-row `totalPrice` is still returned for display in the row's
      // native currency; only the *aggregate* is normalised.
      this.prisma.treatmentProcedure.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: {
          totalPrice: true,
          amountPaid: true,
          baseAmount: true,
        },
      }),
    ]);

    // ── Per-status amountPaid in base currency ────────────────────────────
    // amountPaid lives in the procedure's own currency. To produce a
    // UGX-equivalent collected/outstanding figure we need each row's
    // exchangeRate. Prisma's groupBy can't multiply two columns, so we
    // pull the narrow set of fields we need under the SAME where filter
    // and aggregate in JS. Bounded by the filter (and the planFilter on
    // patient/dentist), so this scales with the filtered slice — not the
    // whole TreatmentProcedure table.
    const amountPaidRows = await this.prisma.treatmentProcedure.findMany({
      where,
      select: {
        status: true,
        amountPaid: true,
        exchangeRate: true,
        currency: true,
      },
    });
    const baseAmountPaidByStatus = new Map<string, number>();
    for (const row of amountPaidRows) {
      const paid = Number(row.amountPaid ?? 0);
      const rate =
        row.exchangeRate != null
          ? Number(row.exchangeRate)
          : row.currency === 'UGX'
            ? 1
            : 1; // UGX procedures store no rate; non-UGX without rate is a data bug
      const basepaid = paid * rate;
      baseAmountPaidByStatus.set(
        row.status,
        (baseAmountPaidByStatus.get(row.status) ?? 0) + basepaid,
      );
    }

    const rows = procedures.map((tp) => ({
      id: tp.id,
      procedure: tp.procedure,
      plan: tp.treatmentPlan,
      patient: tp.treatmentPlan.patient,
      dentist: tp.treatmentPlan.dentist,
      provider: tp.provider,
      status: tp.status,
      billingType: tp.billingType,
      sessionType: tp.sessionType,
      sessionCount: tp.sessionCount,
      completedSessions: tp.sessions.filter((s) => s.status === 'COMPLETED')
        .length,
      totalSessions: tp.sessions.length,
      toothNumbers: tp.targets.map((t) => t.toothNumber).filter(Boolean),
      surfaces: [...new Set(tp.targets.flatMap((t) => t.surfaces as string[]))],
      sequence: tp.sequence,
      visitGroup: tp.visitGroup,
      scheduledDate: tp.scheduledDate,
      performedDate: tp.performedDate,
      completedAt: tp.completedAt,
      createdAt: tp.createdAt,
      quantity: tp.quantity,
      pricingModel: tp.pricingModel,
      pricePerUnit: Number(tp.pricePerUnit),
      totalPrice: Number(tp.totalPrice),
      amountPaid: Number(tp.amountPaid),
      outstanding: Number(tp.totalPrice) - Number(tp.amountPaid),
      paymentStatus: tp.paymentStatus,
      ledgerStatus: tp.ledgerStatus,
      currency: tp.currency,
      // Base-currency snapshots — useful for the row to display "≈ UGX X"
      // alongside the native-currency price.
      baseAmount: tp.baseAmount != null ? Number(tp.baseAmount) : null,
      baseCurrency: tp.baseCurrency,
      exchangeRate: tp.exchangeRate != null ? Number(tp.exchangeRate) : null,
    }));

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [
        g.status,
        {
          count: g._count.id,
          // Native-currency sums are kept for backwards-compat; the totals
          // below use baseAmount / basepaid for the cross-currency picture.
          revenue: Number(g._sum.totalPrice ?? 0),
          collected: Number(g._sum.amountPaid ?? 0),
          revenueBase: Number(g._sum.baseAmount ?? 0),
          collectedBase: baseAmountPaidByStatus.get(g.status) ?? 0,
        },
      ]),
    );

    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        totalCompleted: byStatus['COMPLETED']?.count ?? 0,
        totalInProgress: byStatus['IN_PROGRESS']?.count ?? 0,
        totalPlanned: byStatus['PLANNED']?.count ?? 0,
        totalCancelled: byStatus['CANCELLED']?.count ?? 0,
        // ── Aggregate money totals (UGX-equivalent — safe to sum) ─────
        totalRevenue: statusGroups.reduce(
          (s, g) => s + Number(g._sum.baseAmount ?? 0),
          0,
        ),
        totalCollected: Array.from(baseAmountPaidByStatus.values()).reduce(
          (s, n) => s + n,
          0,
        ),
        totalOutstanding:
          statusGroups.reduce((s, g) => s + Number(g._sum.baseAmount ?? 0), 0) -
          Array.from(baseAmountPaidByStatus.values()).reduce(
            (s, n) => s + n,
            0,
          ),
        // Base currency name so the UI can label "UGX 1,234,567" correctly
        // even if the clinic switches base later.
        baseCurrency: 'UGX',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // REPORT 3 — Procedure Sessions
  // ═══════════════════════════════════════════════════════════════════════════════
  async getSessionsReport(
    filters: ReportFilters & {
      isFinal?: boolean;
      treatmentProcedureId?: string;
    },
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, filters.limit ?? 20);
    const sortBy = filters.sortBy ?? 'performedDate';
    const sortOrder = filters.sortOrder ?? 'desc';

    const SAFE_SESSION_SORT = new Set([
      'performedDate',
      'createdAt',
      'status',
      'sessionNumber',
      'sessionPrice',
    ]);
    const resolvedSort = SAFE_SESSION_SORT.has(sortBy)
      ? sortBy
      : 'performedDate';

    const where: Prisma.ProcedureSessionWhereInput = { deletedAt: null };

    // Date filter on performedDate for executed sessions
    if (filters.startDate || filters.endDate) {
      where.performedDate = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        ...(filters.endDate && {
          lte: new Date(filters.endDate + 'T23:59:59'),
        }),
      };
    }
    if (filters.status) where.status = filters.status as SessionStatus;
    if (filters.isFinal !== undefined) where.isFinal = filters.isFinal;
    if (filters.treatmentProcedureId)
      where.treatmentProcedureId = filters.treatmentProcedureId;

    // Nested plan filters
    const tpFilter: Prisma.TreatmentProcedureWhereInput = {};
    const planFilter: Prisma.TreatmentPlanWhereInput = {};
    if (filters.dentistId) planFilter.dentistId = filters.dentistId;
    if (filters.patientId) planFilter.patientId = filters.patientId;
    if (Object.keys(planFilter).length) tpFilter.treatmentPlan = planFilter;
    if (filters.search) {
      tpFilter.OR = [
        {
          procedure: {
            name: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          treatmentPlan: {
            patient: {
              firstName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          treatmentPlan: {
            patient: {
              lastName: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
        {
          treatmentPlan: {
            patient: {
              patientCode: { contains: filters.search, mode: 'insensitive' },
            },
          },
        },
      ];
    }
    if (Object.keys(tpFilter).length) where.treatmentProcedure = tpFilter;

    const [total, sessions, statusGroups] = await Promise.all([
      this.prisma.procedureSession.count({ where }),

      this.prisma.procedureSession.findMany({
        where,
        include: {
          treatmentProcedure: {
            // currency + exchangeRate are needed to render the row in
            // its native currency AND to compute the UGX-equivalent
            // billed total in the report summary.
            include: {
              procedure: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  category: { select: { name: true, color: true } },
                },
              },
              treatmentPlan: {
                select: {
                  id: true,
                  planCode: true,
                  title: true,
                  patient: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      patientCode: true,
                      phone: true,
                    },
                  },
                  dentist: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
          targets: { select: { toothNumber: true, surfaces: true } },
          ledgerEntry: { select: { id: true, status: true, totalPrice: true } },
          provider: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { [resolvedSort]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.procedureSession.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
        _sum: { sessionPrice: true },
      }),
    ]);

    const rows = sessions.map((s) => {
      const tpCurrency = (s.treatmentProcedure as any).currency as string;
      const tpRate =
        (s.treatmentProcedure as any).exchangeRate != null
          ? Number((s.treatmentProcedure as any).exchangeRate)
          : tpCurrency === 'UGX'
            ? 1
            : 1;
      const sessionPrice = Number(s.sessionPrice ?? 0);
      const sessionPriceBase = sessionPrice * tpRate;
      return {
        id: s.id,
        sessionNumber: s.sessionNumber,
        sessionLabel: s.sessionLabel,
        status: s.status,
        isFinal: s.isFinal,
        phase: s.phase,
        outcome: s.outcome,
        procedure: s.treatmentProcedure.procedure,
        plan: s.treatmentProcedure.treatmentPlan,
        patient: s.treatmentProcedure.treatmentPlan.patient,
        dentist: s.treatmentProcedure.treatmentPlan.dentist,
        provider: s.provider,
        toothNumbers: s.targets.map((t) => t.toothNumber).filter(Boolean),
        surfaces: [
          ...new Set(s.targets.flatMap((t) => t.surfaces as string[])),
        ],
        performedDate: s.performedDate,
        performedNotes: s.performedNotes,
        sessionPrice,
        // Native currency comes from the parent procedure; sessions inherit it.
        currency: tpCurrency,
        exchangeRate: tpRate,
        sessionPriceBase,
        baseCurrency: 'UGX',
        ledgerEntry: s.ledgerEntry,
        ledgerStatus: s.ledgerStatus,
        visitGroup: s.visitGroup,
        createdAt: s.createdAt,
      };
    });

    const byStatus: Record<string, number> = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count.id]),
    );

    // ── Full-dataset session aggregates ───────────────────────────────────────
    // totalFinal and totalBilled must reflect EVERY matching session, not the
    // current page. Count final sessions and sum sessionPrice×rate (base
    // currency) across the whole filtered slice.
    const [totalFinal, billedRows] = await Promise.all([
      this.prisma.procedureSession.count({
        where: { ...where, isFinal: true },
      }),
      this.prisma.procedureSession.findMany({
        where,
        select: {
          sessionPrice: true,
          treatmentProcedure: {
            select: { currency: true, exchangeRate: true },
          },
        },
      }),
    ]);
    const totalBilled = billedRows.reduce((s, r) => {
      const rate =
        r.treatmentProcedure?.exchangeRate != null
          ? Number(r.treatmentProcedure.exchangeRate)
          : 1; // UGX / missing-rate → 1
      return s + Number(r.sessionPrice ?? 0) * rate;
    }, 0);

    return {
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        total,
        totalCompleted: byStatus['COMPLETED'] ?? 0,
        totalPending: byStatus['PENDING'] ?? 0,
        totalInProgress: byStatus['IN_PROGRESS'] ?? 0,
        totalCancelled: byStatus['CANCELLED'] ?? 0,
        // Full-dataset, base currency (USD sessions reconciled via exchangeRate).
        totalFinal,
        totalBilled,
        baseCurrency: 'UGX',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRICING CALCULATION — source of truth for frontend pricing preview
  // ═══════════════════════════════════════════════════════════════════════
  async calculateProcedurePricing(dto: PricingCalculationDto) {
    const procedure = await this.prisma.procedure.findUniqueOrThrow({
      where: { id: dto.procedureId },
    });

    const pricingInput: PricingInput = {
      toothNumbers: dto.toothNumbers,
      exchangeRate: dto.exchangeRate,
      baseCurrency: 'UGX',
      quantityOverride: dto.quantityBasis,
    };

    const pricing = PricingEngine.calculate(
      {
        basePrice: procedure.basePrice,
        baseCost: procedure.baseCost ?? 0,
        pricingModel: procedure.pricingModel,
        priceRangeMin: procedure.priceRangeMin,
        priceRangeMax: procedure.priceRangeMax,
        currency: procedure.currency,
      },
      pricingInput,
    );

    return {
      totalPrice: pricing.totalPrice,
      pricePerUnit: pricing.pricePerUnit,
      costPerUnit: pricing.costPerUnit,
      quantity: pricing.quantity,
      subtotalPrice: pricing.subtotalPrice,
      subtotalCost: pricing.subtotalCost,
      discountAmount: pricing.discountAmount,
      taxAmount: pricing.taxAmount,
      currency: procedure.currency,
      exchangeRate: pricing.exchangeRate,
      baseAmount: pricing.baseAmount,
      breakdown: pricing.breakdown,
      minApplied: pricing.minApplied,
      maxApplied: pricing.maxApplied,
    };
  }
}
