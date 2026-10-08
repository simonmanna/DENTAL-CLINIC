// src/treatment-plans/treatment-plans-edit.service.ts
// EDIT service — drop-in additions to TreatmentPlansService.
//
// Methods kept here (each wired to a controller route):
//   checkProcedureDeleteEligibility — UI gate before showing Delete vs Cancel
//   updateProcedureWithGuards      — field locking, audit log, price guard,
//                                    routine status flips (no editReason needed),
//                                    substantive clinical edits require editReason,
//                                    throw 409 on toothNumbers-with-sessions,
//                                    sync invoice item when price changes.
//   getAllowedStatusTransitions    — powers the UI status dropdown.
//   restoreCancelledProcedure      — brings CANCELLED → PLANNED with full audit.
//
// Methods REMOVED (dead code, were never wired to any controller — see
// `TreatmentPlansService.removeProcedure` and `TreatmentPlansService.cancelProcedure`
// for the canonical implementations):
//   hardDeleteProcedure
//   cancelProcedureWithReason

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
  ChartEntryStatus,
  BillingType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceLifecycleService } from '../billing/invoice-lifecycle.service';
import { assertFdiTooth, assertSurfaces } from '../common/dental/dental-validation';
import {
  UpdateTreatmentProcedureDto,
  ProcedureDeleteEligibility,
} from './dto/update-treatment-procedure.dto';
import { TreatmentPlansService } from './treatment-plans.service';
import { deriveProcedureStatus } from './procedure-status';
import { collectionsByProcedure, collectionStatus } from './procedure-collections';

/**
 * Substantive clinical fields: changes to these for a procedure that already
 * has recorded sessions are clinical corrections and REQUIRE an `editReason`
 * (free-text audit justification). Routine status flips and note touch-ups do
 * not — they flow through their own audit shapes.
 */
const SUBSTANTIVE_CLINICAL_FIELDS: ReadonlyArray<
  keyof UpdateTreatmentProcedureDto
> = [
  'toothNumbers',
  'surfaces',
  'sequence',
  'visitGroup',
  'scheduledDate',
  'providerId',
  'totalPrice',
  'pricePerUnit',
  'quantity',
  'discountAmount',
  'taxAmount',
  'currency',
  'sessionType',
  'sessionCount',
  'billingType',
  'initialPaymentAmount',
  'initialPaymentCurrency',
  'linkedConditionIds',
];

function isSubstantiveClinicalEdit(dto: UpdateTreatmentProcedureDto): boolean {
  return SUBSTANTIVE_CLINICAL_FIELDS.some((k) => dto[k] !== undefined);
}

// ─── Status transition rules ────────────────────────────────────────────────
// IN_PROGRESS and COMPLETED are CLINICAL facts derived from executed sessions
// (see procedure-status.ts) — they are never set by hand. A manual flip to
// COMPLETED used to leave the chart PLANNED, the linked conditions unresolved
// and an extracted tooth still charted present, because only session
// execution performs those side effects. What remains editable is parking:
//   PLANNED / IN_PROGRESS → ON_HOLD
//   ON_HOLD               → resume (PLANNED or IN_PROGRESS — the server
//                           derives which one from the sessions)
//   PENDING               → PLANNED (legacy)
//   COMPLETED / CANCELLED / REFERRED / DELETED → none here
//     (CANCELLED uses the /restore endpoint)
const ALLOWED_STATUS_TRANSITIONS: Record<
  TreatmentStatus,
  ReadonlyArray<TreatmentStatus>
> = {
  PLANNED: [TreatmentStatus.ON_HOLD],
  IN_PROGRESS: [TreatmentStatus.ON_HOLD],
  ON_HOLD: [TreatmentStatus.PLANNED, TreatmentStatus.IN_PROGRESS],
  COMPLETED: [],
  CANCELLED: [],
  PENDING: [TreatmentStatus.PLANNED],
  REFERRED: [],
  DELETED: [],
};

const ALLOWED_TRANSITIONS_HELP: Record<TreatmentStatus, string> = {
  PLANNED:
    'PLANNED → ON_HOLD. Treatment starts automatically when the first session is recorded.',
  IN_PROGRESS:
    'IN_PROGRESS → ON_HOLD. Complete the procedure by recording its final session.',
  ON_HOLD:
    'ON_HOLD → resume. The resumed status follows the recorded sessions.',
  COMPLETED: 'Completed procedures cannot transition to any other status.',
  CANCELLED:
    'Cancelled procedures must be restored before they can transition.',
  PENDING: 'Allowed transitions: PENDING → PLANNED.',
  REFERRED: 'Referred procedures cannot transition to any other status.',
  DELETED: 'Deleted procedures cannot transition to any other status.',
};

function isAllowedStatusTransition(
  from: TreatmentStatus,
  to: TreatmentStatus,
): boolean {
  if (from === to) return true; // no-op
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

function allowedNextStatuses(from: TreatmentStatus): TreatmentStatus[] {
  if (
    from === TreatmentStatus.COMPLETED ||
    from === TreatmentStatus.CANCELLED
  ) {
    return [];
  }
  return [...ALLOWED_STATUS_TRANSITIONS[from]];
}

@Injectable()
export class TreatmentPlansEditService {
  private readonly logger = new Logger(TreatmentPlansEditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: TreatmentPlansService,
    private readonly invoiceLifecycle: InvoiceLifecycleService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT HELPER
  // ─────────────────────────────────────────────────────────────────────────
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
      entityType: string;
      entityId: string;
      oldData?: any;
      newData?: any;
      reason?: string | null;
      userId?: string | null;
    },
  ) {
    let safeUserId: string | null = null;
    let userName: string | null = null;

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
        if (user.staff)
          userName = `${user.staff.firstName} ${user.staff.lastName}`.trim();
      } else {
        userName = `unresolved:${args.userId}`;
      }
    }

    return tx.auditLog.create({
      data: {
        action: args.action,
        module: 'TREATMENT_PLANS',
        entityType: args.entityType,
        recordId: args.entityId,
        oldData: (args.oldData ?? null) as Prisma.InputJsonValue,
        newData: (args.newData ?? null) as Prisma.InputJsonValue,
        reason: args.reason ?? null,
        userId: safeUserId,
        userName,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECK DELETE ELIGIBILITY
  // ═══════════════════════════════════════════════════════════════════════════

  async checkProcedureDeleteEligibility(
    planId: string,
    procedureId: string,
  ): Promise<
    ProcedureDeleteEligibility & {
      invoiceStatus?: string | null;
      invoiceAmountPaid?: number;
    }
  > {
    // Note: if you add new return fields, update the type in
    // update-treatment-procedure.dto.ts → ProcedureDeleteEligibility
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId, deletedAt: null },
      include: {
        sessions: { select: { id: true } },
        _count: { select: { sessions: true } },
        // Linked invoice (if any) — needed to surface POSTED/paid to the UI
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

    const sessionsCount = tp._count.sessions;
    // Payments are recorded on invoices; the procedure's own paymentStatus
    // column is never written, so derive it.
    const paymentStatus = collectionStatus(
      (await collectionsByProcedure(this.prisma, [tp.id])).get(tp.id),
    );
    const status = tp.status as string;

    const hasSessions = sessionsCount > 0;
    const isPlanned = status.toUpperCase() === 'PLANNED' || status.toUpperCase() === 'PENDING';

    const invoiceItem = (tp as any).invoiceItems?.[0] ?? null;
    const invoice = invoiceItem?.invoice ?? null;
    const invoicePosted = invoice?.status === 'POSTED';

    // Spec: Delete is allowed only when:
    //   • status is PLANNED
    //   • no session executions
    //   • linked invoice (if any) is not POSTED
    // Items on DRAFT invoices (with or without payments) are voided but
    // kept on the invoice record for audit.
    let canDelete = true;
    let canCancel = true;
    let reason: string | undefined;

    if (!isPlanned) {
      canDelete = false;
      reason =
        status === 'COMPLETED'
          ? 'Only PLANNED procedures can be deleted. This procedure is COMPLETED.'
          : status === 'CANCELLED'
            ? 'This procedure is CANCELLED — restore it to PLANNED first if you need to delete it.'
            : `Only PLANNED procedures can be deleted. Current status: ${status}.`;
    } else if (hasSessions) {
      canDelete = false;
      reason = `Procedure has ${sessionsCount} recorded session${sessionsCount !== 1 ? 's' : ''}. Use Cancel instead.`;
    } else if (invoicePosted) {
      canDelete = false;
      reason = `Linked invoice is POSTED (already billed). Void the invoice or create a credit note first.`;
    }

    if (status === TreatmentStatus.CANCELLED) {
      canCancel = false;
    }

    return {
      canDelete,
      canCancel,
      reason,
      sessionsCount,
      paymentStatus,
      status,
      invoiceStatus: invoice?.status ?? null,
      invoiceAmountPaid: invoice ? Number(invoice.amountPaid) : 0,
      hasInvoiceItem: invoiceItem !== null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE PROCEDURE WITH GUARDS
  //
  // Mirrors what the user could enter at add-procedure time:
  //   • notes, provider, sequence, visitGroup, scheduledDate
  //   • toothNumbers (full replace — blocked once sessions exist)
  //   • surfaces (procedure-level only — session targets preserved)
  //   • status (routine flips audited, never needs editReason)
  //   • pricing: totalPrice, pricePerUnit, quantity, subtotalPrice,
  //     discountAmount, taxAmount, currency, exchangeRate, baseAmount,
  //     isPriceOverridden, subtotalCost, costPerUnit, quantityBasis
  //   • sessionType, sessionCount
  //   • billingType
  //   • initialPaymentAmount, initialPaymentCurrency
  //   • linkedConditionIds (replace-all semantics)
  //   • performedDate, completedAt, performedNotes, actualInputsUsed
  //
  // Auditing rules:
  //   • Audit row written only when at least one field actually changed
  //     (no-op edits are silent).
  //   • Routine status flips always audited, even when no other field
  //     changed — auto-generated reason: "Routine status flip: A → B".
  // ═══════════════════════════════════════════════════════════════════════════

  async updateProcedureWithGuards(
    planId: string,
    procedureId: string,
    dto: UpdateTreatmentProcedureDto,
    performedById?: string,
  ) {
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: {
        id: procedureId,
        treatmentPlanId: planId,
        deletedAt: null,
        status: { not: TreatmentStatus.DELETED },
      },
      include: {
        treatmentPlan: { select: { patientId: true } },
        targets: true,
        sessions: {
          select: {
            id: true,
            status: true,
            sessionNumber: true,
            performedDate: true,
            isFinal: true,
            deletedAt: true,
          },
        },
        _count: { select: { sessions: true } },
        procedure: { select: { name: true, code: true } },
      },
    });

    if (!tp) throw new NotFoundException('Procedure not found in this plan');

    const sessionsCount = tp._count.sessions;
    const hasSessions = sessionsCount > 0;

    // ── Hard blocks ────────────────────────────────────────────────────────
    if (tp.status === TreatmentStatus.CANCELLED) {
      // CANCELLED procedures are immutable through the edit endpoint.
      // Use the dedicated restore-cancelled flow to bring them back.
      throw new BadRequestException(
        'A cancelled procedure cannot be edited. ' +
          'Use the "Restore to Planned" action to bring it back.',
      );
    }
    // (The old "fully-paid procedure" block read TreatmentProcedure
    // .paymentStatus, which payments never update — it could not fire.
    // Money edits are guarded against the linked invoice further down.)

    // ── (H2) Optimistic lock — reject a stale edit from a second clinician ──
    if (
      dto.expectedVersion != null &&
      (tp as any).version !== dto.expectedVersion
    ) {
      throw new ConflictException(
        'This procedure was modified by someone else since you opened it. ' +
          'Reload the latest version and re-apply your change.',
      );
    }

    // ── Status transition validation (parking only — see the rules above) ──
    if (dto.status !== undefined && dto.status !== tp.status) {
      if (dto.status === TreatmentStatus.COMPLETED) {
        throw new BadRequestException(
          'A procedure is completed by recording its final session ' +
            '(Record session → mark as final), so the chart, linked ' +
            'conditions and tooth presence update with it.',
        );
      }
      if (!isAllowedStatusTransition(tp.status, dto.status)) {
        throw new BadRequestException(
          `Invalid status transition: ${tp.status} → ${dto.status}. ` +
            ALLOWED_TRANSITIONS_HELP[tp.status],
        );
      }
      // Resuming from ON_HOLD: the real status follows the sessions, whatever
      // the client asked for (PLANNED vs IN_PROGRESS).
      if (tp.status === TreatmentStatus.ON_HOLD) {
        dto.status = deriveProcedureStatus(tp.sessions ?? []);
      }
    }

    // ── COMPLETED: notes-only (append-only). Everything else is locked. ─────
    // Per spec: COMPLETED procedures form part of the permanent clinical
    // record. Only an append-only clinical note is allowed; every other
    // field must be unchanged.
    if (tp.status === TreatmentStatus.COMPLETED) {
      const completedEditable: ReadonlyArray<
        keyof UpdateTreatmentProcedureDto
      > = ['notes', 'performedNotes', 'actualInputsUsed', 'editReason'];
      const touchedFields = Object.keys(dto).filter(
        (k) =>
          (dto as any)[k] !== undefined &&
          !completedEditable.includes(k as any),
      );
      if (touchedFields.length > 0) {
        throw new BadRequestException(
          `Completed procedures are read-only except for clinical notes. ` +
            `The following fields cannot be changed on a COMPLETED procedure: ` +
            `${touchedFields.join(', ')}.`,
        );
      }
    }

    // ── Surfaces lock when sessions exist (IN_PROGRESS or COMPLETED) ───────
    // Per spec: surfaces cannot be modified after sessions have been recorded
    // (the clinical plan is fixed at that point). Cancel + re-plan instead.
    if (hasSessions && dto.surfaces !== undefined) {
      throw new ConflictException(
        'Cannot change surfaces after sessions have been recorded. ' +
          'Cancel this procedure and re-plan with the new surfaces instead.',
      );
    }

    // ── E1 FIX: throw 409 instead of silently dropping toothNumbers ────────
    if (hasSessions && dto.toothNumbers !== undefined) {
      throw new ConflictException(
        'Cannot change tooth assignment after sessions have been recorded. ' +
          'Cancel this procedure and re-plan it on the new tooth instead.',
      );
    }

    // ── (C3) Re-validate the new tooth set exactly like add-procedure ──────
    // FDI codes and duplicates are enforced; a tooth charted absent is
    // advisory only (see TreatmentPlansService.toothPresenceWarning).
    if (dto.toothNumbers !== undefined && !hasSessions) {
      for (const t of dto.toothNumbers) assertFdiTooth(t);
      await this.plans.assertNoDuplicateActiveProcedure(
        tp.treatmentPlan.patientId,
        tp.procedureId,
        tp.procedure.name,
        dto.toothNumbers,
        dto.surfaces ?? [],
        procedureId, // exclude self
      );
    }

    // ── B12/B13: pricing is server-authoritative ───────────────────────────
    // The client may set ONE figure: an explicit override total. Everything
    // derived from it (per-unit, quantity, discount, tax, cost, rate, base
    // amount) comes from the PricingEngine. Unchanged values are dropped so
    // an edit of notes on a paid procedure is not refused as a "price
    // change" (the UI used to send currency + a live FX rate every time).
    for (const k of [
      'pricePerUnit',
      'quantity',
      'subtotalPrice',
      'discountAmount',
      'taxAmount',
      'subtotalCost',
      'costPerUnit',
      'exchangeRate',
      'baseAmount',
    ] as const) {
      delete (dto as any)[k];
    }
    if (dto.currency !== undefined) {
      if (dto.currency === tp.currency) delete dto.currency;
      else
        throw new BadRequestException(
          'A procedure is priced in its catalogue currency; the currency cannot be changed here.',
        );
    }
    const sameSet = (a: number[], b: number[]) =>
      a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
    const procTargets = tp.targets.filter((t) => !t.procedureSessionId);
    const currentTeeth = procTargets
      .map((t) => t.toothNumber)
      .filter((n): n is number => n != null);
    const currentSurfaces = [
      ...new Set(procTargets.flatMap((t) => (t.surfaces ?? []) as string[])),
    ];
    if (dto.toothNumbers !== undefined && sameSet(dto.toothNumbers, currentTeeth)) {
      delete dto.toothNumbers;
    }
    const teethChanged = dto.toothNumbers !== undefined;
    if (
      dto.surfaces !== undefined &&
      [...new Set(dto.surfaces as string[])].sort().join(',') ===
        [...currentSurfaces].sort().join(',')
    ) {
      delete dto.surfaces;
    }
    const overrideTotal =
      dto.isPriceOverridden === true && dto.totalPrice != null
        ? Number(dto.totalPrice)
        : null;
    if (overrideTotal !== null && (!Number.isFinite(overrideTotal) || overrideTotal < 0)) {
      throw new BadRequestException('Invalid override price.');
    }
    // A bare totalPrice (no override flag) is not trusted.
    if (overrideTotal === null) {
      delete dto.totalPrice;
      delete dto.isPriceOverridden;
    } else if (Math.abs(overrideTotal - Number(tp.totalPrice)) < 0.005 && !teethChanged) {
      delete dto.totalPrice;
      delete dto.isPriceOverridden;
    }
    if (dto.billingType !== undefined && dto.billingType === tp.billingType) delete dto.billingType;
    if (dto.sessionType !== undefined && dto.sessionType === tp.sessionType) delete dto.sessionType;
    if (dto.sessionCount !== undefined && dto.sessionCount === tp.sessionCount) delete dto.sessionCount;

    let repriced = false;
    if (
      teethChanged ||
      dto.totalPrice !== undefined ||
      dto.sessionType !== undefined ||
      dto.sessionCount !== undefined ||
      dto.quantityBasis !== undefined
    ) {
      const catalog = await this.prisma.procedure.findUnique({
        where: { id: tp.procedureId },
      });
      if (!catalog) throw new NotFoundException('Catalogue procedure not found');
      const priced = await this.plans.priceProcedure(catalog, {
        toothNumbers: teethChanged ? dto.toothNumbers! : currentTeeth,
        sessionType: dto.sessionType ?? tp.sessionType,
        sessionCount: dto.sessionCount ?? tp.sessionCount,
        quantityBasis: dto.quantityBasis ?? null,
        // A procedure keeps the rate it was priced at.
        exchangeRate: tp.exchangeRate ? Number(tp.exchangeRate) : null,
      });
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const engineTotal = Number(priced.totalPrice);
      const total = dto.totalPrice !== undefined ? Number(dto.totalPrice) : engineTotal;
      dto.totalPrice = total;
      dto.pricePerUnit = Number(priced.pricePerUnit);
      dto.quantity = priced.quantity;
      dto.subtotalPrice = Number(priced.subtotalPrice);
      dto.discountAmount =
        total !== engineTotal ? round2(engineTotal - total) : Number(priced.discountAmount ?? 0);
      dto.taxAmount = Number(priced.taxAmount ?? 0);
      dto.subtotalCost = Number(priced.subtotalCost ?? 0);
      dto.costPerUnit = Number(priced.costPerUnit ?? 0);
      dto.baseAmount =
        tp.currency === 'UGX' ? total : round2(total * Number(priced.exchangeRate ?? 1));
      dto.isPriceOverridden = total !== engineTotal;
      repriced = true;
    }

    // ── Substantive clinical edit requires a reason once sessions exist ────
    if (
      hasSessions &&
      isSubstantiveClinicalEdit(dto) &&
      (!dto.editReason || !dto.editReason.trim())
    ) {
      throw new BadRequestException(
        'A reason is required to edit substantive clinical fields (tooth, surfaces, ' +
          'sequence, visitGroup, scheduledDate, provider, price, billingType, sessionType, ' +
          'linkedConditions) on a procedure once sessions exist.',
      );
    }

    // ── E6 FIX: completedAt requires at least one COMPLETED session ────────
    const tpSessions = tp.sessions ?? [];
    if (dto.completedAt !== undefined) {
      const anyCompleted = tpSessions.some((s) => s.status === 'COMPLETED');
      if (!anyCompleted) {
        throw new BadRequestException(
          'Cannot set completedAt — no sessions are in COMPLETED status yet.',
        );
      }
    }

    // ── E6 FIX: performedDate cannot be after the earliest session date ────
    if (dto.performedDate !== undefined) {
      const earliest = tpSessions
        .map((s) => s.performedDate)
        .filter((d): d is Date => d !== null && d !== undefined)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const newDate = new Date(dto.performedDate);
      if (earliest && newDate.getTime() > earliest.getTime()) {
        throw new BadRequestException(
          `performedDate cannot be after the earliest session execution date (${earliest.toISOString()}).`,
        );
      }
    }

    // ── Pre-TX guard: pricing change blocked on POSTED invoice ───────────────
    // A POSTED invoice has already had a CHARGE ledger entry posted to the
    // general ledger. Mutating its line item would corrupt the posted amount.
    // We refuse the WHOLE edit cleanly (not partially) so the UI shows a
    // clear message and the user can resubmit without the pricing fields.
    const pricingFieldsTouched =
      dto.totalPrice !== undefined ||
      dto.pricePerUnit !== undefined ||
      dto.discountAmount !== undefined ||
      dto.taxAmount !== undefined ||
      dto.quantity !== undefined ||
      dto.currency !== undefined ||
      dto.exchangeRate !== undefined ||
      dto.baseAmount !== undefined ||
      dto.subtotalPrice !== undefined ||
      dto.subtotalCost !== undefined ||
      dto.costPerUnit !== undefined ||
      dto.isPriceOverridden !== undefined ||
      dto.billingType !== undefined ||
      dto.initialPaymentAmount !== undefined ||
      dto.initialPaymentCurrency !== undefined;
    if (pricingFieldsTouched) {
      const item = await this.prisma.invoiceItem.findFirst({
        where: { treatmentProcedureId: procedureId },
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
      });
      if (item) {
        if (item.invoice.status === 'POSTED') {
          throw new ConflictException(
            `Cannot change pricing — invoice ${item.invoice.id} is POSTED ` +
              `(already billed to the general ledger). Void the invoice or ` +
              `create a credit note to change the price. Other edits were ` +
              `NOT saved — please resubmit without pricing fields.`,
          );
        }
        if (
          item.invoice.paymentStatus === 'PAID' ||
          Number(item.invoice.amountPaid) > 0
        ) {
          throw new ConflictException(
            `Cannot change pricing — invoice ${item.invoice.id} has payments ` +
              `(paymentStatus=${item.invoice.paymentStatus}, amountPaid=${item.invoice.amountPaid}). ` +
              `Void or refund payments first. Other edits were NOT saved — ` +
              `please resubmit without pricing fields.`,
          );
        }
      }
    }

    // ── Build audit snapshot — only when values actually change ────────────
    const auditBefore: Record<string, any> = {};
    const auditAfter: Record<string, any> = {};

    const recordIfChanged = (key: string, oldVal: any, newVal: any) => {
      const a = oldVal instanceof Date ? oldVal.toISOString() : oldVal;
      const b = newVal instanceof Date ? newVal.toISOString() : newVal;
      // treat undefined/null as equal
      const eq = (x: any, y: any) => {
        if (x === y) return true;
        if (x == null && y == null) return true;
        return false;
      };
      if (!eq(a, b)) {
        auditBefore[key] = a ?? null;
        auditAfter[key] = b ?? null;
      }
    };

    // ── Decide what needs to be written ────────────────────────────────────
    if (dto.notes !== undefined) {
      recordIfChanged('notes', tp.notes ?? null, dto.notes);
    }
    if (dto.providerId !== undefined) {
      recordIfChanged(
        'providerId',
        (tp as any).providerId ?? null,
        dto.providerId || null,
      );
    }
    if (dto.sequence !== undefined) {
      recordIfChanged('sequence', (tp as any).sequence, dto.sequence);
    }
    if (dto.visitGroup !== undefined) {
      recordIfChanged('visitGroup', (tp as any).visitGroup, dto.visitGroup);
    }
    if (dto.scheduledDate !== undefined) {
      recordIfChanged(
        'scheduledDate',
        (tp as any).scheduledDate ?? null,
        dto.scheduledDate,
      );
    }
    if (dto.performedDate !== undefined) {
      recordIfChanged(
        'performedDate',
        (tp as any).performedDate ?? null,
        dto.performedDate,
      );
    }
    if (dto.completedAt !== undefined) {
      recordIfChanged(
        'completedAt',
        (tp as any).completedAt ?? null,
        dto.completedAt,
      );
    }
    if (dto.performedNotes !== undefined) {
      recordIfChanged(
        'performedNotes',
        (tp as any).performedNotes ?? null,
        dto.performedNotes,
      );
    }
    if (dto.actualInputsUsed !== undefined) {
      recordIfChanged(
        'actualInputsUsed',
        (tp as any).actualInputsUsed ?? null,
        dto.actualInputsUsed,
      );
    }

    // ── Status: always audit when it changes (even with no other fields) ───
    let statusChanged = false;
    if (dto.status !== undefined && dto.status !== tp.status) {
      recordIfChanged('status', tp.status, dto.status);
      statusChanged = true;
    }

    // ── Pricing snapshot diffs ─────────────────────────────────────────────
    // Also on a tooth change: the invoice line's description names the teeth.
    const pricingChanged =
      repriced &&
      (teethChanged ||
        dto.totalPrice !== Number(tp.totalPrice) ||
        dto.quantity !== (tp as any).quantity);
    if (dto.totalPrice !== undefined) {
      recordIfChanged('totalPrice', Number(tp.totalPrice), dto.totalPrice);
    }
    if (dto.pricePerUnit !== undefined) {
      recordIfChanged(
        'pricePerUnit',
        Number((tp as any).pricePerUnit),
        dto.pricePerUnit,
      );
    }
    if (dto.quantity !== undefined) {
      recordIfChanged('quantity', (tp as any).quantity, dto.quantity);
    }
    if (dto.subtotalPrice !== undefined) {
      recordIfChanged(
        'subtotalPrice',
        Number((tp as any).subtotalPrice),
        dto.subtotalPrice,
      );
    }
    if (dto.discountAmount !== undefined) {
      recordIfChanged(
        'discountAmount',
        Number((tp as any).discountAmount),
        dto.discountAmount,
      );
    }
    if (dto.taxAmount !== undefined) {
      recordIfChanged(
        'taxAmount',
        Number((tp as any).taxAmount),
        dto.taxAmount,
      );
    }
    if (dto.subtotalCost !== undefined) {
      recordIfChanged(
        'subtotalCost',
        Number((tp as any).subtotalCost),
        dto.subtotalCost,
      );
    }
    if (dto.costPerUnit !== undefined) {
      recordIfChanged(
        'costPerUnit',
        Number((tp as any).costPerUnit),
        dto.costPerUnit,
      );
    }
    if (dto.currency !== undefined) {
      recordIfChanged('currency', tp.currency, dto.currency);
    }
    if (dto.exchangeRate !== undefined) {
      recordIfChanged(
        'exchangeRate',
        tp.exchangeRate ? Number(tp.exchangeRate) : null,
        dto.exchangeRate,
      );
    }
    if (dto.baseAmount !== undefined) {
      recordIfChanged('baseAmount', Number(tp.baseAmount), dto.baseAmount);
    }
    if (dto.isPriceOverridden !== undefined) {
      recordIfChanged(
        'isPriceOverridden',
        (tp as any).billingContext?.priceOverride ? true : false,
        dto.isPriceOverridden,
      );
    }
    if (dto.quantityBasis !== undefined) {
      recordIfChanged(
        'quantityBasis',
        (tp as any).billingContext?.quantity ?? null,
        dto.quantityBasis,
      );
    }

    // ── Session config diffs ───────────────────────────────────────────────
    if (dto.sessionType !== undefined) {
      recordIfChanged('sessionType', tp.sessionType, dto.sessionType);
    }
    if (dto.sessionCount !== undefined) {
      recordIfChanged('sessionCount', tp.sessionCount, dto.sessionCount);
    }

    // ── E7 FIX: billingType — actually wired in ────────────────────────────
    if (dto.billingType !== undefined && dto.billingType !== tp.billingType) {
      recordIfChanged('billingType', tp.billingType, dto.billingType);
    }

    // ── Initial payment diffs ──────────────────────────────────────────────
    if (dto.initialPaymentAmount !== undefined) {
      recordIfChanged(
        'initialPaymentAmount',
        (tp as any).billingContext?.priceOverride?.recordedDiscount ?? null,
        dto.initialPaymentAmount,
      );
    }
    if (dto.initialPaymentCurrency !== undefined) {
      recordIfChanged(
        'initialPaymentCurrency',
        null,
        dto.initialPaymentCurrency,
      );
    }

    // ── linkedConditionIds — capture before-state for audit ─────────────────
    let linkedConditionChanged = false;
    let existingConditionLinks: { id: string; patientConditionId: string }[] =
      [];
    if (dto.linkedConditionIds !== undefined) {
      existingConditionLinks =
        await this.prisma.conditionProcedureLink.findMany({
          where: { treatmentProcedureId: procedureId, deletedAt: null },
          select: { id: true, patientConditionId: true },
        });
      const existingIds = existingConditionLinks.map(
        (e) => e.patientConditionId,
      );
      const desired = new Set(dto.linkedConditionIds);
      const same =
        existingIds.length === desired.size &&
        existingIds.every((id) => desired.has(id));
      if (!same) {
        linkedConditionChanged = true;
        auditBefore.linkedConditionIds = existingIds;
        auditAfter.linkedConditionIds = dto.linkedConditionIds;
      }
    }

    // ── Surfaces — always recorded when they change (even with sessions) ───
    if (dto.surfaces !== undefined) {
      const before = tp.targets.flatMap((t) => t.surfaces ?? []);
      const beforeSorted = [...before].sort().join(',');
      const afterSorted = [...dto.surfaces].sort().join(',');
      if (beforeSorted !== afterSorted) {
        auditBefore.surfaces = before;
        auditAfter.surfaces = [...dto.surfaces];
      }
    }

    const anyChanged = Object.keys(auditAfter).length > 0;
    if (!anyChanged) {
      return { data: tp, audited: false, warning: undefined };
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // ── Build core update payload ──────────────────────────────────────
        const updateData: Prisma.TreatmentProcedureUpdateInput = {};

        if (dto.notes !== undefined) {
          // COMPLETED procedures: append the new note to existing notes
          // (append-only clinical record). All other statuses overwrite.
          if (tp.status === TreatmentStatus.COMPLETED && tp.notes) {
            const stamp = new Date()
              .toISOString()
              .slice(0, 16)
              .replace('T', ' ');
            updateData.notes = `${tp.notes}\n\n— [append ${stamp}] ${dto.notes}`;
          } else {
            updateData.notes = dto.notes;
          }
        }
        if (dto.providerId !== undefined) {
          updateData.provider = dto.providerId
            ? { connect: { id: dto.providerId } }
            : { disconnect: true };
        }
        if (dto.sequence !== undefined) updateData.sequence = dto.sequence;
        if (dto.visitGroup !== undefined)
          updateData.visitGroup = dto.visitGroup;
        if (dto.scheduledDate !== undefined) {
          updateData.scheduledDate = dto.scheduledDate
            ? new Date(dto.scheduledDate)
            : null;
        }
        if (dto.performedDate !== undefined) {
          (updateData as any).performedDate = dto.performedDate
            ? new Date(dto.performedDate)
            : null;
        }
        if (dto.completedAt !== undefined) {
          (updateData as any).completedAt = dto.completedAt
            ? new Date(dto.completedAt)
            : null;
        }
        if (dto.performedNotes !== undefined) {
          (updateData as any).performedNotes = dto.performedNotes;
        }
        if (dto.actualInputsUsed !== undefined) {
          (updateData as any).actualInputsUsed =
            dto.actualInputsUsed as Prisma.InputJsonValue;
        }
        if (dto.status !== undefined) updateData.status = dto.status;
        if (dto.editReason) (updateData as any).lastEditReason = dto.editReason;

        // ── Pricing fields ────────────────────────────────────────────────
        if (dto.totalPrice !== undefined)
          updateData.totalPrice = dto.totalPrice;
        if (dto.pricePerUnit !== undefined)
          updateData.pricePerUnit = dto.pricePerUnit;
        if (dto.quantity !== undefined) updateData.quantity = dto.quantity;
        if (dto.subtotalPrice !== undefined)
          updateData.subtotalPrice = dto.subtotalPrice;
        if (dto.discountAmount !== undefined)
          updateData.discountAmount = dto.discountAmount;
        if (dto.taxAmount !== undefined) updateData.taxAmount = dto.taxAmount;
        if (dto.subtotalCost !== undefined)
          updateData.subtotalCost = dto.subtotalCost;
        if (dto.costPerUnit !== undefined)
          updateData.costPerUnit = dto.costPerUnit;
        if (dto.currency !== undefined) updateData.currency = dto.currency;
        if (dto.exchangeRate !== undefined) {
          updateData.exchangeRate = dto.exchangeRate
            ? new Prisma.Decimal(dto.exchangeRate)
            : null;
        }
        if (dto.baseAmount !== undefined)
          updateData.baseAmount = dto.baseAmount;

        // ── Session config ────────────────────────────────────────────────
        if (dto.sessionType !== undefined) {
          updateData.sessionType = dto.sessionType;
        }
        if (dto.sessionCount !== undefined)
          updateData.sessionCount = dto.sessionCount;

        // ── E7 FIX: billingType is now actually persisted ──────────────────
        if (
          dto.billingType !== undefined &&
          dto.billingType !== tp.billingType
        ) {
          updateData.billingType = dto.billingType;
        }

        // ── Update ProcedureTargets (surfaces & optionally teeth) ──────────
        if (dto.toothNumbers !== undefined && !hasSessions) {
          // Full replacement of targets
          await tx.procedureTarget.deleteMany({
            where: { treatmentProcedureId: procedureId },
          });
          // Surfaces carry over to the new teeth (folded per tooth) unless
          // the edit sets new ones — they used to be dropped to [].
          const carried = (dto.surfaces ?? currentSurfaces) as string[];
          for (const toothNumber of dto.toothNumbers) {
            await tx.procedureTarget.create({
              data: {
                treatmentProcedureId: procedureId,
                toothNumber,
                surfaces: assertSurfaces(carried, toothNumber) as any,
              },
            });
          }

          // ── (C2 FIX) Re-sync the chart to the new teeth ────────────────
          // The PLANNED chart entries created at add time point at the OLD
          // teeth. They were never updated here, so they stayed ACTIVE on the
          // wrong tooth and — because execution supersedes PLANNED entries by
          // toothNumber — were orphaned forever while a COMPLETED entry landed
          // on the new tooth. Supersede the stale entries and recreate PLANNED
          // entries on the new teeth, mirroring addProcedure.
          const oldPlanned = await tx.chartEntry.findMany({
            where: {
              treatmentProcedureId: procedureId,
              type: 'PLANNED',
              status: ChartEntryStatus.ACTIVE,
            },
            select: { id: true, visitId: true },
          });
          const carryVisitId =
            oldPlanned.find((e) => e.visitId)?.visitId ?? null;
          if (oldPlanned.length > 0) {
            await tx.chartEntry.updateMany({
              where: { id: { in: oldPlanned.map((e) => e.id) } },
              data: {
                status: ChartEntryStatus.SUPERSEDED,
                notes: `Re-planned to tooth ${dto.toothNumbers.join(', ')} on ${new Date()
                  .toISOString()
                  .slice(0, 10)}.`,
              },
            });
          }
          const newProviderId =
            dto.providerId !== undefined
              ? dto.providerId || null
              : ((tp as any).providerId ?? null);
          for (const toothNumber of dto.toothNumbers) {
            await tx.chartEntry.create({
              data: {
                patientId: tp.treatmentPlan.patientId,
                visitId: carryVisitId,
                toothNumber,
                surfaces: assertSurfaces(
                  (dto.surfaces ?? currentSurfaces) as string[],
                  toothNumber,
                ) as any,
                type: 'PLANNED',
                status: ChartEntryStatus.ACTIVE,
                label: tp.procedure.name,
                procedureCode: tp.procedure.code,
                treatmentProcedureId: procedureId,
                providerId: newProviderId,
              },
            });
          }
        } else if (dto.surfaces !== undefined) {
          // Only surfaces changed — update existing procedure-level targets.
          // Session targets are NEVER touched to preserve execution records.
          for (const target of procTargets) {
            const folded =
              target.toothNumber != null
                ? assertSurfaces(dto.surfaces as string[], target.toothNumber)
                : [];
            await tx.procedureTarget.update({
              where: { id: target.id },
              data: { surfaces: folded as any },
            });
            // The PLANNED marker paints the same surfaces.
            if (target.toothNumber != null) {
              await tx.chartEntry.updateMany({
                where: {
                  treatmentProcedureId: procedureId,
                  toothNumber: target.toothNumber,
                  type: 'PLANNED',
                  status: ChartEntryStatus.ACTIVE,
                },
                data: { surfaces: folded as any },
              });
            }
          }

          if (hasSessions) {
            this.logger.warn(
              `[updateProcedureWithGuards] Surface changed on proc ${procedureId} with ${sessionsCount} sessions. ` +
                'Procedure-level targets updated; session targets preserved.',
            );
          }
        }

        // ── linkedConditionIds — replace-all inside the same tx ────────────
        if (linkedConditionChanged && dto.linkedConditionIds) {
          const desired = new Set(dto.linkedConditionIds);

          // Reuse the pre-tx snapshot (id + patientConditionId) so we don't
          // need a second read inside the tx.
          const toUnlink = existingConditionLinks.filter(
            (l) => !desired.has(l.patientConditionId),
          );
          if (toUnlink.length) {
            await tx.conditionProcedureLink.updateMany({
              where: { id: { in: toUnlink.map((l) => l.id) } },
              data: {
                deletedAt: new Date(),
                unlinkedById: performedById ?? null,
                deletedReason: 'Unlinked via procedure edit',
              },
            });
          }

          // Create new links (skip already-active ones).
          const alreadyLinked = new Set(
            existingConditionLinks.map((l) => l.patientConditionId),
          );
          const added: string[] = [];
          for (const patientConditionId of desired) {
            if (alreadyLinked.has(patientConditionId)) continue;

            const pc = await tx.patientCondition.findFirst({
              where: {
                id: patientConditionId,
                patientId: tp.treatmentPlan.patientId,
                deletedAt: null,
              },
              include: {
                condition: { select: { name: true, icd10Code: true } },
              },
            });
            if (!pc) continue;

            await tx.conditionProcedureLink.create({
              data: {
                patientConditionId,
                treatmentProcedureId: procedureId,
                linkedById: performedById ?? null,
                conditionNameAtLink: pc.condition?.name ?? null,
                conditionCodeAtLink: pc.condition?.icd10Code ?? null,
                conditionStatusAtLink: pc.status ?? null,
              },
            });
            added.push(patientConditionId);
          }

          // Unlinked / newly linked diagnoses re-evaluate their status.
          await this.plans.applyLinkLifecycleTx(
            tx,
            [...toUnlink.map((l) => l.patientConditionId), ...added],
            performedById,
          );
        }

        // ── Persist the main TP update ─────────────────────────────────────
        (updateData as any).version = { increment: 1 }; // (H2) optimistic lock
        const updated = await tx.treatmentProcedure.update({
          where: { id: procedureId },
          data: updateData,
          include: {
            procedure: { select: { id: true, name: true, code: true } },
            targets: true,
            sessions: {
              select: { id: true, status: true, sessionNumber: true },
            },
          },
        });

        // ── If status changed, re-sync linked conditions and the plan ─────
        if (statusChanged) {
          await this.plans.syncConditionsForProcedureTx(
            tx,
            procedureId,
            performedById ?? null,
          );
          await this.plans.recalculatePlanTx(tx, planId);
        }

        // ── Build final audit reason: routine-status-flip auto-text ───────
        let auditReason: string | null = dto.editReason ?? null;
        if (statusChanged && !dto.editReason) {
          auditReason = `Routine status flip: ${tp.status} → ${dto.status}`;
        }

        // ── Write audit log ────────────────────────────────────────────────
        await this.writeAuditTx(tx, {
          action: 'UPDATE',
          entityType: 'TreatmentProcedure',
          entityId: procedureId,
          oldData: auditBefore,
          newData: auditAfter,
          reason: auditReason,
          userId: performedById ?? null,
        });

        const pricingSnapshot = pricingChanged
            ? {
                description: this.buildDescription(
                  (tp.procedure as any)?.name ?? '',
                  (updated.targets ?? [])
                    .map((t: any) => t.toothNumber)
                    .filter((n: any): n is number => n != null),
                  dto.surfaces as any,
                ),
                quantity: updated.quantity,
                pricePerUnit: Number(updated.pricePerUnit),
                discountAmount: Number(updated.discountAmount),
                taxAmount: Number(updated.taxAmount),
                totalPrice: Number(updated.totalPrice),
                currency: updated.currency,
                exchangeRate: updated.exchangeRate
                  ? Number(updated.exchangeRate)
                  : null,
              }
            : null;

        // ── Invoice line follows in the SAME transaction (B13) ─────────────
        let txInvoiceSync: {
          invoiceId: string | null;
          invoiceStatus: string | null;
        } | null = null;
        if (pricingSnapshot) {
          const synced = await this.invoiceLifecycle.updateProcedureItemPricingTx(
            tx,
            procedureId,
            pricingSnapshot,
          );
          txInvoiceSync = synced;
          if (!synced.invoiceId) {
            const visitRow = await tx.chartEntry.findFirst({
              where: { treatmentProcedureId: procedureId, visitId: { not: null } },
              select: { visitId: true },
              orderBy: { createdAt: 'asc' },
            });
            const invoiceId = await this.invoiceLifecycle.addProcedureItemTx(
              tx,
              tp.treatmentPlan.patientId,
              visitRow?.visitId ?? null,
              planId,
              {
                id: procedureId,
                ...pricingSnapshot,
                baseAmount: Number(updated.baseAmount ?? 0),
              },
              dto.initialPaymentAmount ?? null,
              dto.initialPaymentCurrency ?? null,
              performedById ?? null,
            );
            txInvoiceSync = { invoiceId, invoiceStatus: 'CREATED_VIA_EDIT' };
          }
        }

        return {
          updated,
          pricingChanged,
          pricingSnapshot,
          txInvoiceSync,
        };
      },
      {
        maxWait: 5000,
        timeout: 20000,
      },
    );

    // ── POST-TX: invoice sync if pricing changed ──────────────────────────
    let invoiceSync: {
      invoiceId: string | null;
      invoiceStatus: string | null;
    } | null = null;
    if (result.pricingChanged && result.pricingSnapshot) {
      // Synced inside the transaction above.
      invoiceSync = result.txInvoiceSync;
    } else if (
      dto.initialPaymentAmount !== undefined ||
      dto.initialPaymentCurrency !== undefined
    ) {
      // Deposit amount changed without totalPrice changing — store it on the
      // invoice so the cashier sees it at checkout. Only set if non-empty.
      const tpAfter = await this.prisma.treatmentProcedure.findUnique({
        where: { id: procedureId },
        select: { id: true },
      });
      if (tpAfter) {
        const item = await this.prisma.invoiceItem.findFirst({
          where: { treatmentProcedureId: tpAfter.id },
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                amountPaid: true,
                paymentStatus: true,
              },
            },
          },
        });
        if (
          item &&
          item.invoice.paymentStatus !== 'PAID' &&
          Number(item.invoice.amountPaid) === 0 &&
          item.invoice.status !== 'VOID'
        ) {
          await this.prisma.invoice.update({
            where: { id: item.invoice.id },
            data: {
              initialPaymentAmount: dto.initialPaymentAmount ?? null,
              initialPaymentCurrency: dto.initialPaymentCurrency ?? null,
            },
          });
        }
      }
    }

    const warningParts: string[] = [];
    if (hasSessions && dto.surfaces !== undefined) {
      warningParts.push(
        'Surface change recorded. Existing session targets were NOT modified to preserve execution records.',
      );
    }
    if (invoiceSync && invoiceSync.invoiceStatus === 'CREATED_VIA_EDIT') {
      warningParts.push(
        'No invoice item existed for this procedure — a new draft line item was created. ' +
          'Confirm with the cashier before issuing the invoice.',
      );
    }

    return {
      data: result.updated,
      audited: true,
      warning: warningParts.length ? warningParts.join(' ') : undefined,
      invoiceSync,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Allowed-status-transitions lookup (used by the UI dropdown) ─────────
  // ═══════════════════════════════════════════════════════════════════════════

  async getAllowedStatusTransitions(planId: string, procedureId: string) {
    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: {
        id: procedureId,
        treatmentPlanId: planId,
        deletedAt: null,
        status: { not: TreatmentStatus.DELETED },
      },
      select: { status: true },
    });
    if (!tp) throw new NotFoundException('Procedure not found in this plan');
    return {
      current: tp.status,
      allowed: allowedNextStatuses(tp.status),
      help: ALLOWED_TRANSITIONS_HELP[tp.status],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESTORE CANCELLED PROCEDURE — brings it back to PLANNED with full audit
  // Per spec: a CANCELLED procedure can be restored to PLANNED, with the
  // restore action itself recorded in the audit log. Restored chart
  // entries are flipped back from SUPERSEDED → ACTIVE.
  // ═══════════════════════════════════════════════════════════════════════════

  async restoreCancelledProcedure(
    planId: string,
    procedureId: string,
    reason: string,
    performedById?: string,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException(
        'A restore reason is required (clinical audit trail).',
      );
    }

    const tp = await this.prisma.treatmentProcedure.findFirst({
      where: { id: procedureId, treatmentPlanId: planId, deletedAt: null },
      include: {
        targets: { where: { procedureSessionId: null } },
        sessions: {
          select: { id: true, status: true, isFinal: true, deletedAt: true },
        },
      },
    });

    if (!tp) throw new NotFoundException('Procedure not found in this plan');
    if (tp.status !== TreatmentStatus.CANCELLED) {
      throw new ConflictException(
        `Only CANCELLED procedures can be restored. Current status: ${tp.status}.`,
      );
    }

    // Completed sessions survive a cancellation (the work was done), so the
    // restored procedure resumes where it stopped rather than at PLANNED.
    const restoredStatus = deriveProcedureStatus(tp.sessions);
    const targetTeeth = tp.targets
      .map((t) => t.toothNumber)
      .filter((n): n is number => n != null);

    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. Chart: re-activate only the PLANNED markers THIS cancellation
        //    superseded (cancelProcedure stamps them "Cancelled: …"), only on
        //    the procedure's current teeth, at most one per tooth, and never on
        //    a tooth whose work already has a live COMPLETED row. Re-activating
        //    every superseded row resurrected markers from earlier re-plans and
        //    planned marks on teeth that were already treated.
        const candidates = await tx.chartEntry.findMany({
          where: {
            treatmentProcedureId: procedureId,
            type: 'PLANNED',
            status: ChartEntryStatus.SUPERSEDED,
            notes: { startsWith: 'Cancelled:' },
          },
          orderBy: { createdAt: 'desc' },
        });
        const completedRows = await tx.chartEntry.findMany({
          where: {
            treatmentProcedureId: procedureId,
            type: 'COMPLETED',
            status: ChartEntryStatus.ACTIVE,
          },
          select: { toothNumber: true },
        });
        const doneTeeth = new Set(completedRows.map((r) => r.toothNumber));
        const seen = new Set<number | null>();
        const toRestore: string[] = [];
        for (const row of candidates) {
          const tooth = row.toothNumber ?? null;
          if (tooth != null && targetTeeth.length > 0 && !targetTeeth.includes(tooth)) continue;
          if (tooth == null && targetTeeth.length > 0) continue;
          if (doneTeeth.has(tooth)) continue;
          if (seen.has(tooth)) continue;
          seen.add(tooth);
          toRestore.push(row.id);
        }
        if (toRestore.length > 0) {
          await tx.chartEntry.updateMany({
            where: { id: { in: toRestore }, status: ChartEntryStatus.SUPERSEDED },
            data: {
              status: ChartEntryStatus.ACTIVE,
              notes: `Restored from CANCELLED on ${new Date().toISOString()}: ${reason}`,
            },
          });
        }

        // 2. Condition links unlinked by the cancellation come back (unless an
        //    equivalent active link was created since — the partial unique
        //    index allows only one).
        const cancelledLinks = await tx.conditionProcedureLink.findMany({
          where: {
            treatmentProcedureId: procedureId,
            deletedAt: { not: null },
            deletedReason: 'Procedure cancelled',
          },
          orderBy: { createdAt: 'desc' },
        });
        const activeLinks = await tx.conditionProcedureLink.findMany({
          where: { treatmentProcedureId: procedureId, deletedAt: null },
          select: { patientConditionId: true },
        });
        const linked = new Set(activeLinks.map((l) => l.patientConditionId));
        let linksRestored = 0;
        for (const link of cancelledLinks) {
          if (linked.has(link.patientConditionId)) continue;
          linked.add(link.patientConditionId);
          await tx.conditionProcedureLink.update({
            where: { id: link.id },
            data: { deletedAt: null, unlinkedById: null, deletedReason: null },
          });
          linksRestored++;
        }

        // 3. Status follows the sessions; clear the cancellation stamp.
        const updated = await tx.treatmentProcedure.update({
          where: { id: procedureId },
          data: {
            status: restoredStatus,
            cancellationReason: null,
            version: { increment: 1 },
          },
          include: {
            procedure: { select: { id: true, name: true } },
            targets: true,
            sessions: { select: { id: true, status: true } },
          },
        });

        // 4. Billing: put the voided line back (GL reconciled when POSTED).
        const billing = await this.invoiceLifecycle.reinstateProcedureBillingTx(
          tx,
          procedureId,
          performedById ?? null,
        );

        // 5. Conditions + plan follow the procedure again.
        await this.plans.syncConditionsForProcedureTx(
          tx,
          procedureId,
          performedById ?? null,
        );
        await this.plans.recalculatePlanTx(tx, planId);

        // 6. Audit: RESTORE action.
        await this.writeAuditTx(tx, {
          action: 'RESTORE',
          entityType: 'TreatmentProcedure',
          entityId: procedureId,
          userId: performedById ?? null,
          reason,
          oldData: {
            status: 'CANCELLED',
            cancellationReason: tp.cancellationReason,
          },
          newData: {
            status: restoredStatus,
            chartEntriesRestored: toRestore.length,
            conditionLinksRestored: linksRestored,
            billing,
          },
        });

        return { updated, restoredCount: toRestore.length, billing };
      },
      { maxWait: 5000, timeout: 20000 },
    );

    // No reusable invoice line (none, or its invoice was voided meanwhile):
    // bill it afresh now, post-commit, like addProcedure does.
    let billedNow = false;
    if (result.billing.needsNewItem) {
      billedNow = await this.plans.billProcedureSafe(procedureId);
    }

    const n = result.restoredCount;
    return {
      data: result.updated,
      chartEntriesRestored: n,
      billing: { ...result.billing, billedNow },
      message:
        `Procedure restored to ${restoredStatus}. ` +
        `${n} chart entr${n === 1 ? 'y was' : 'ies were'} re-activated.`,
    };
  }

  private buildDescription(
    procedureName: string,
    toothNumbers: number[],
    surfaces?: string[],
  ): string {
    const parts = [procedureName];
    if (toothNumbers?.length) parts.push(`(Tooth: ${toothNumbers.join(', ')})`);
    if (surfaces?.length) parts.push(`[${surfaces.join('+')}]`);
    return parts.join(' ');
  }
}
