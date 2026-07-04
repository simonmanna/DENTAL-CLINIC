// src/chart-entry/chart-entry.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXED: FDI validation on every write · canonical surface enum · structured
// (code-based, not string-match) supersede + missing-tooth guard · all
// multi-write quick actions wrapped in $transaction.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  QuickActionDto,
  CreateChartEntryDto,
  UpdateChartEntryDto,
  ChartEntryType,
  ChartEntryStatus,
  QuickActionResponse,
  AddExistingProcedureDto,
  UpdateConditionDto,
} from './dto/chart-entry.dto';
import {
  assertFdiTooth,
  assertSurfaces,
} from '../common/dental/dental-validation';
import { assertToothPresence } from '../common/dental/tooth-presence';

// Structured codes that mean "this tooth is gone" — used instead of
// `label.includes('extract')` string matching anywhere.
const ABSENT_CONDITION_CODES = new Set(['K08.1', 'K00.0']);

@Injectable()
export class ChartEntryService {
  private readonly logger = new Logger(ChartEntryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────
  // AUDIT HELPER — same shape as the conditions / treatment-plan services so
  // chart-entry mutations (edit / void) AND every record created by the
  // quick-action engine (ChartEntry / TreatmentPlan / TreatmentProcedure /
  // ProcedureSession) lands a row in the generic audit_logs table. Actor is
  // resolved defensively: an unresolvable userId becomes null so the audit
  // never blocks the mutation.
  //
  // `module` and `entityType` are parameterised (defaults: CHART_ENTRY /
  // ChartEntry) so a single call site can write audit rows for the chart
  // entry itself AND for the treatment-plan / procedure / session rows the
  // quick action also creates — without bypassing the audit log for the
  // other record types. The default keeps the existing call sites (which
  // audit chart entries only) byte-identical.
  //
  // AUDIT-FORENSIC (Fix #4): now also captures ipAddress + userAgent so a
  // subpoena-grade audit row can trace which terminal / session made the
  // change. Controllers extract these from the HTTP request and pass them
  // through; the helper accepts undefined and writes NULL otherwise.
  // ─────────────────────────────────────────────────────────────────────
  private async writeAuditTx(
    tx: Prisma.TransactionClient,
    args: {
      action: 'CREATE' | 'UPDATE' | 'VOID' | 'SUPERSEDE';
      module?: string; // defaults to 'CHART_ENTRY'
      entityType?: string; // defaults to 'ChartEntry'
      entityId: string;
      oldData?: any;
      newData?: any;
      reason?: string | null;
      userId?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
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
        module: args.module ?? 'CHART_ENTRY',
        entityType: args.entityType ?? 'ChartEntry',
        recordId: args.entityId,
        oldData: (args.oldData ?? null) as Prisma.InputJsonValue,
        newData: (args.newData ?? null) as Prisma.InputJsonValue,
        reason: args.reason ?? null,
        userId: safeUserId,
        userName,
        ipAddress: args.ipAddress ?? null,
        userAgent: args.userAgent ?? null,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // M-2: OPTIMISTIC-LOCK helper. Bumps ChartEntry.version on every mutation
  // and — when the caller supplies an expectedVersion — gates the write on it
  // atomically via updateMany (count===0 ⇒ a concurrent edit landed first, so
  // 409). Without an expectedVersion this is legacy last-write-wins, so the
  // existing callers that don't pass a token keep working unchanged. Mirrors
  // the version pattern on treatment_procedures / procedure_sessions.
  // ─────────────────────────────────────────────────────────────────────
  private async versionedChartEntryUpdate(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.ChartEntryUpdateInput,
    expectedVersion?: number | null,
  ): Promise<void> {
    const fullData: Prisma.ChartEntryUpdateInput = {
      ...data,
      version: { increment: 1 },
    };
    if (expectedVersion == null) {
      await tx.chartEntry.update({ where: { id }, data: fullData });
      return;
    }
    const res = await tx.chartEntry.updateMany({
      where: { id, version: expectedVersion },
      data: fullData,
    });
    if (res.count === 0) {
      const current = await tx.chartEntry.findUnique({
        where: { id },
        select: { version: true },
      });
      throw new ConflictException({
        message:
          'This chart entry was modified by another user. Reload and try again.',
        currentVersion: current?.version ?? null,
      });
    }
  }

  // ── GET: all entries for a patient ─────────────────────────────────────────

  // Max RESOLVED (historical) condition rows returned by getPatientEntries.
  // ACTIVE rows are the live chart and are NEVER capped — truncating them would
  // silently drop a tooth's current state. RESOLVED rows are history that only
  // feeds the ledger's "Resolved"/"All" view, so they are bounded to the most
  // recent N to keep the payload finite for very-long-history patients (M-3).
  private static readonly RESOLVED_ENTRY_CAP = 200;

  async getPatientEntries(patientId: string, visitId?: string) {
    const include = {
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
        },
      },
      // Pull the fields the dental-chart drawer needs to render the
      // Edit / Cancel / Delete buttons on a PLANNED / COMPLETED entry.
      treatmentProcedure: {
        select: {
          id: true,
          treatmentPlanId: true,
          status: true,
          totalPrice: true,
          currency: true,
          sessionType: true,
          sessionCount: true,
          billingType: true,
          providerId: true,
          procedure: { select: { name: true, code: true } },
          targets: true,
        },
      },
      procedureSession: { include: { targets: true } },
      visit: { select: { id: true, createdAt: true } },
      patientCondition: {
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
          // The condition catalog row drives the chart's special notation
          // (extracted / congenital / unerupted / supernumerary / retained
          // root). Keeps the rendering 100% data-driven from
          // `Condition.chartPresenceEffect`.
          condition: {
            select: {
              id: true,
              name: true,
              icd10Code: true,
              snodentCode: true,
              chartPresenceEffect: true,
            },
          },
        },
      },
      condition: {
        select: {
          id: true,
          name: true,
          icd10Code: true,
          snodentCode: true,
          chartPresenceEffect: true,
        },
      },
    } satisfies Prisma.ChartEntryInclude;

    const baseWhere = { patientId, ...(visitId ? { visitId } : {}) };

    // M-3: two bounded queries instead of one unbounded ACTIVE+RESOLVED scan.
    // ACTIVE = live chart truth, returned in full. RESOLVED = a condition whose
    // treating procedure has completed: it must STOP painting the tooth (the
    // frontend's isLiveConditionEntry handles that via conditionStatus) but is
    // still delivered for the ledger's condition history — capped to the most
    // recent RESOLVED_ENTRY_CAP. SUPERSEDED / VOIDED stay excluded.
    const [active, resolved] = await Promise.all([
      this.prisma.chartEntry.findMany({
        where: { ...baseWhere, status: 'ACTIVE' },
        include,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.chartEntry.findMany({
        where: { ...baseWhere, status: 'RESOLVED' },
        include,
        orderBy: { createdAt: 'desc' },
        take: ChartEntryService.RESOLVED_ENTRY_CAP,
      }),
    ]);

    return [...active, ...resolved];
  }

  async getToothHistory(
    patientId: string,
    toothNumber: number,
    limit = 200,
    offset = 0,
  ) {
    assertFdiTooth(toothNumber);
    // M-3: history includes superseded/voided on purpose (full audit trail) but
    // is paginated — a tooth treated for years should not return an unbounded
    // payload. Defaults to the 200 most-recent rows; callers can page further.
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const skip = Math.max(Number(offset) || 0, 0);
    return this.prisma.chartEntry.findMany({
      where: { patientId, toothNumber },
      take,
      skip,
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        treatmentProcedure: {
          select: {
            id: true,
            treatmentPlanId: true,
            status: true,
            totalPrice: true,
            currency: true,
            sessionType: true,
            sessionCount: true,
            billingType: true,
            providerId: true,
            procedure: { select: { name: true, code: true } },
            targets: true,
          },
        },
        procedureSession: { include: { targets: true } },
        visit: { select: { id: true, createdAt: true } },
        patientCondition: {
          include: {
            provider: { select: { id: true, firstName: true, lastName: true } },
            condition: {
              select: {
                id: true,
                name: true,
                icd10Code: true,
                snodentCode: true,
                chartPresenceEffect: true,
              },
            },
          },
        },
        condition: {
          select: {
            id: true,
            name: true,
            icd10Code: true,
            snodentCode: true,
            chartPresenceEffect: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Helper: active entries for a tooth (used by guards) ─────────────────────

  // ── CREATE ─────────────────────────────────────────────────────────────────

  async createEntry(dto: CreateChartEntryDto) {
    const fdi = assertFdiTooth(dto.toothNumber, { optional: true });
    const surfaces = fdi ? assertSurfaces(dto.surfaces, fdi) : [];

    if (dto.providerId) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: dto.providerId },
      });
      if (!staff) {
        this.logger.warn(
          `[createEntry] providerId=${dto.providerId} not in Staff — saving NULL`,
        );
      }
    }

    const entry = await this.prisma.chartEntry.create({
      data: {
        patientId: dto.patientId,
        visitId: dto.visitId,
        toothNumber: fdi,
        surfaces,
        type: dto.type,
        label: dto.label,
        conditionCode: dto.conditionCode,
        procedureCode: dto.procedureCode,
        treatmentProcedureId: dto.treatmentProcedureId,
        procedureSessionId: dto.procedureSessionId,
        conditionId: dto.conditionId,
        patientConditionId: dto.patientConditionId,
        providerId: dto.providerId ?? null,
        notes: dto.notes,
        diagnosedAt: dto.diagnosedAt ? new Date(dto.diagnosedAt) : null,
      },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
        patientCondition: {
          include: {
            provider: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return this.formatEntry(entry);
  }

  // ── UPDATE CONDITION ───────────────────────────────────────────────────────

  async updateCondition(
    chartEntryId: string,
    dto: UpdateConditionDto,
    actorUserId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const existing = await this.prisma.chartEntry.findUnique({
      where: { id: chartEntryId },
    });
    if (!existing)
      throw new NotFoundException(`ChartEntry ${chartEntryId} not found`);

    const fdi = existing.toothNumber;
    const surfaces =
      dto.surfaces !== undefined && fdi
        ? assertSurfaces(dto.surfaces, fdi)
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      // E2: when this edit changes the clinical status, the chart ROW must
      // follow too — RESOLVED / RULED_OUT stop painting the odontogram, every
      // other status keeps it live. Without this the drawer quick-edit changed
      // the PatientCondition status but the tooth never greyed out (the same
      // sync gap the lifecycle engine closes for procedure-driven resolution).
      const statusSync =
        dto.status !== undefined
          ? {
              conditionStatus: dto.status as any,
              status:
                dto.status === 'RESOLVED' || dto.status === 'RULED_OUT'
                  ? ChartEntryStatus.RESOLVED
                  : ChartEntryStatus.ACTIVE,
            }
          : {};

      // M-2: version-gated when expectedVersion supplied. The linked-condition
      // path is also protected by PatientCondition.version below; this closes
      // the bare-ChartEntry gap too.
      await this.versionedChartEntryUpdate(
        tx,
        chartEntryId,
        {
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(surfaces !== undefined && { surfaces }),
          ...(dto.providerId !== undefined && { providerId: dto.providerId }),
          ...(dto.conditionId !== undefined && {
            conditionId: dto.conditionId,
          }),
          ...statusSync,
        },
        dto.expectedVersion,
      );
      const updatedEntry = await tx.chartEntry.findUnique({
        where: { id: chartEntryId },
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
          patientCondition: {
            include: {
              provider: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      });
      if (!updatedEntry)
        throw new NotFoundException(`ChartEntry ${chartEntryId} not found`);

      if (dto.patientConditionId) {
        const existingPc = await tx.patientCondition.findUnique({
          where: { id: dto.patientConditionId },
          select: { status: true, resolvedAt: true },
        });
        const updatedPc = await tx.patientCondition.update({
          where: { id: dto.patientConditionId },
          data: {
            // E1: keep the optimistic-lock token moving even on this path so a
            // concurrent edit elsewhere is detectable.
            version: { increment: 1 },
            ...(dto.status !== undefined && { status: dto.status as any }),
            // L3: never leave an impossible state. RESOLVED must carry a
            // resolvedAt; any non-resolved status must clear the resolution
            // stamp (and the manual-resolve has no procedure, so the proc id
            // is cleared too).
            ...(dto.status === 'RESOLVED'
              ? { resolvedAt: existingPc?.resolvedAt ?? new Date() }
              : dto.status !== undefined
                ? { resolvedAt: null, resolvedByProcedureId: null }
                : {}),
            ...(dto.severity !== undefined && {
              severity: dto.severity as any,
            }),
            ...(dto.notes !== undefined && { notes: dto.notes }),
            ...(surfaces !== undefined && { surfaces }),
            ...(dto.conditionId !== undefined && {
              conditionId: dto.conditionId,
            }),
            ...(dto.diagnosedAt !== undefined && {
              diagnosedAt: new Date(dto.diagnosedAt),
            }),
            // providerId is the FK. diagnosedBy is a DISPLAY string only —
            // resolve it from the staff record, never store the raw id here.
            ...(dto.providerId !== undefined && {
              providerId: dto.providerId,
            }),
            updatedById: actorUserId ?? null,
          },
        });

        // AU3/E2: the PatientCondition mutation is audited as its own entity
        // (not only as a ChartEntry edit) so the condition's audit-log view is
        // complete regardless of which edit path was used.
        await this.writeAuditTx(tx, {
          action: 'UPDATE',
          module: 'CONDITIONS',
          entityType: 'PatientCondition',
          entityId: dto.patientConditionId,
          userId: actorUserId ?? null,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          reason: 'Edited via chart drawer',
          oldData: { status: existingPc?.status, resolvedAt: existingPc?.resolvedAt },
          newData: { status: updatedPc.status, resolvedAt: updatedPc.resolvedAt },
        });

        if (dto.providerId) {
          const staff = await tx.staff.findUnique({
            where: { id: dto.providerId },
            select: { firstName: true, lastName: true },
          });
          if (staff) {
            await tx.patientCondition.update({
              where: { id: dto.patientConditionId },
              data: {
                diagnosedBy: `Dr. ${staff.firstName} ${staff.lastName}`,
              },
            });
          }
        }
      } else {
        this.logger.warn(
          `[updateCondition] No patientConditionId — PatientCondition NOT updated`,
        );
      }

      await this.writeAuditTx(tx, {
        action: 'UPDATE',
        entityId: chartEntryId,
        userId: actorUserId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        oldData: {
          label: existing.label,
          notes: existing.notes,
          surfaces: existing.surfaces,
          providerId: existing.providerId,
          conditionId: existing.conditionId,
          patientConditionId: existing.patientConditionId,
        },
        newData: {
          label: updatedEntry.label,
          notes: updatedEntry.notes,
          surfaces: updatedEntry.surfaces,
          providerId: updatedEntry.providerId,
          conditionId: updatedEntry.conditionId,
        },
      });

      return this.formatEntry(updatedEntry);
    });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  async updateEntry(
    id: string,
    dto: UpdateChartEntryDto,
    actorUserId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const entry = await this.prisma.chartEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`ChartEntry ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      // M-2: version-gated when expectedVersion supplied (else legacy LWW).
      await this.versionedChartEntryUpdate(
        tx,
        id,
        {
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.label !== undefined && { label: dto.label }),
          ...(dto.providerId !== undefined && { providerId: dto.providerId }),
        },
        dto.expectedVersion,
      );
      const updated = await tx.chartEntry.findUnique({
        where: { id },
        include: {
          provider: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await this.writeAuditTx(tx, {
        action: 'UPDATE',
        entityId: id,
        userId: actorUserId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        oldData: {
          status: entry.status,
          notes: entry.notes,
          label: entry.label,
          providerId: entry.providerId,
        },
        newData: {
          status: updated!.status,
          notes: updated!.notes,
          label: updated!.label,
          providerId: updated!.providerId,
        },
      });

      return updated;
    });
  }

  async supersedeEntry(id: string, expectedVersion?: number) {
    const entry = await this.prisma.chartEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`ChartEntry ${id} not found`);
    return this.prisma.$transaction(async (tx) => {
      // M-2: version-gated supersede so a concurrent edit/void of the same row
      // surfaces a 409 instead of silently winning.
      await this.versionedChartEntryUpdate(
        tx,
        id,
        { status: ChartEntryStatus.SUPERSEDED },
        expectedVersion,
      );
      return tx.chartEntry.findUnique({ where: { id } });
    });
  }

  // Close every ACTIVE ChartEntry that points at the same PatientCondition.
  // Used by the edit-condition flow before recreating the per-tooth entries
  // so a 6-tooth condition can't leave 5 stale rows behind when the user
  // edits only the entry they clicked on.
  async supersedeByPatientCondition(patientConditionId: string) {
    if (!patientConditionId) {
      throw new BadRequestException('patientConditionId is required');
    }
    const result = await this.prisma.chartEntry.updateMany({
      where: {
        patientConditionId,
        status: ChartEntryStatus.ACTIVE,
      },
      data: { status: ChartEntryStatus.SUPERSEDED },
    });
    return { success: true, count: result.count };
  }

  async voidEntry(
    id: string,
    reason?: string,
    actorUserId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
    expectedVersion?: number,
  ) {
    const entry = await this.prisma.chartEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`ChartEntry ${id} not found`);
    return this.prisma.$transaction(async (tx) => {
      // M-2: version-gated void so a stale tab can't void a row another
      // clinician already changed.
      await this.versionedChartEntryUpdate(
        tx,
        id,
        {
          status: ChartEntryStatus.VOIDED,
          notes: reason
            ? `${entry.notes ?? ''}\n[VOIDED: ${reason}]`.trim()
            : entry.notes,
        },
        expectedVersion,
      );
      const updated = await tx.chartEntry.findUnique({ where: { id } });
      await this.writeAuditTx(tx, {
        action: 'VOID',
        entityId: id,
        userId: actorUserId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        reason: reason ?? null,
        oldData: {
          status: entry.status,
          type: entry.type,
          label: entry.label,
          toothNumber: entry.toothNumber,
        },
        newData: { status: 'VOIDED' },
      });
      return updated;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUICK ACTION ENGINE
  // ══════════════════════════════════════════════════════════════════════════

  async executeQuickAction(
    dto: QuickActionDto,
    actorUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<QuickActionResponse> {
    // Validate ONCE up-front for all actions.
    assertFdiTooth(dto.toothNumber);
    assertSurfaces(dto.surfaces, dto.toothNumber);

    switch (dto.action) {
      case 'ADD_CONDITION':
        return this.handleAddCondition(dto, actorUserId, ipAddress, userAgent);
      case 'PLAN_TREATMENT':
        return this.handlePlanTreatment(dto, actorUserId, ipAddress, userAgent);
      case 'PERFORM_NOW':
        return this.handlePerformNow(dto, actorUserId, ipAddress, userAgent);
      default:
        throw new BadRequestException(
          `Unknown action: ${(dto as any).action}`,
        );
    }
  }

  // ── ADD_CONDITION ──────────────────────────────────────────────────────────

  private async handleAddCondition(
    dto: QuickActionDto,
    actorUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<QuickActionResponse> {
    if (!dto.conditionLabel)
      throw new BadRequestException('conditionLabel is required');

    const fdi = dto.toothNumber;
    const surfaces = assertSurfaces(dto.surfaces, fdi);

    // Guard: don't record surface-level work (e.g. caries MOD) on a tooth
    // already charted as absent. Recording the absence itself, or a non-surface
    // finding, is unaffected (assertToothPresence is a no-op without surfaces).
    await assertToothPresence(this.prisma, {
      patientId: dto.patientId,
      toothNumbers: [fdi],
      surfaces,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.conditionCode) {
        await tx.chartEntry.updateMany({
          where: {
            patientId: dto.patientId,
            toothNumber: fdi,
            conditionCode: dto.conditionCode,
            type: 'CONDITION',
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED' },
        });
      }

      // If this condition itself makes the tooth absent, supersede any
      // surface-bearing restorative entries on that tooth (structured, not
      // string-matched).
      if (dto.conditionCode && ABSENT_CONDITION_CODES.has(dto.conditionCode)) {
        await tx.chartEntry.updateMany({
          where: {
            patientId: dto.patientId,
            toothNumber: fdi,
            status: 'ACTIVE',
            type: { in: ['PLANNED', 'COMPLETED', 'EXISTING'] },
          },
          data: { status: 'SUPERSEDED' },
        });
      }

      // A1: a quick-action diagnosis is now a STRUCTURED PatientCondition, not
      // just a chart marking. That gives it a lifecycle (it can be linked to a
      // procedure and auto-resolved) and makes it show in the conditions ledger
      // exactly like the batch dialog — closing the two-divergent-paths gap.
      const diagnosedAt = dto.diagnosedAt ? new Date(dto.diagnosedAt) : new Date();
      const conditionId = await this.getOrCreateConditionId(
        dto.conditionLabel!,
        dto.conditionCode,
        tx,
      );

      // Reuse a live PatientCondition for the same (patient, tooth, condition)
      // if one exists — both clinically correct (one live finding per condition
      // per tooth) and required to respect the partial-unique live index (D1).
      const existingPc = await tx.patientCondition.findFirst({
        where: {
          patientId: dto.patientId,
          toothNumber: fdi,
          conditionId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'MONITORED', 'IN_TREATMENT'] },
        },
      });

      const patientCondition = existingPc
        ? await tx.patientCondition.update({
            where: { id: existingPc.id },
            data: {
              version: { increment: 1 },
              surfaces,
              ...(dto.notes !== undefined && { notes: dto.notes }),
              ...(dto.providerId !== undefined && {
                providerId: dto.providerId ?? null,
              }),
              updatedById: actorUserId ?? null,
            },
          })
        : await tx.patientCondition.create({
            data: {
              patientId: dto.patientId,
              visitId: dto.visitId ?? null,
              conditionId,
              toothNumber: fdi,
              surfaces,
              status: 'ACTIVE',
              notes: dto.notes,
              diagnosedAt,
              providerId: dto.providerId ?? null,
              createdById: actorUserId ?? null,
              updatedById: actorUserId ?? null,
            },
          });

      // If we reused a PatientCondition, supersede its prior ACTIVE chart rows
      // so we never leave two live chart entries pointing at one condition.
      if (existingPc) {
        await tx.chartEntry.updateMany({
          where: { patientConditionId: existingPc.id, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
      }

      const chartEntry = await tx.chartEntry.create({
        data: {
          patientId: dto.patientId,
          visitId: dto.visitId,
          toothNumber: fdi,
          surfaces,
          type: ChartEntryType.CONDITION,
          status: 'ACTIVE',
          conditionStatus: patientCondition.status,
          label: dto.conditionLabel!,
          conditionCode: dto.conditionCode,
          conditionId,
          patientConditionId: patientCondition.id,
          providerId: dto.providerId ?? null,
          notes: dto.notes,
          diagnosedAt,
        },
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      });

      // AUDIT — the new PatientCondition (only when freshly created) AND the
      // ChartEntry. Previously ADD_CONDITION wrote nothing; only the richer
      // batch dialog did.
      if (!existingPc) {
        await this.writeAuditTx(tx, {
          action: 'CREATE',
          module: 'CONDITIONS',
          entityType: 'PatientCondition',
          entityId: patientCondition.id,
          userId: actorUserId,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          newData: {
            patientId: patientCondition.patientId,
            conditionId,
            toothNumber: fdi,
            surfaces,
            status: patientCondition.status,
            via: 'quick-action:ADD_CONDITION',
          },
        });
      }

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'CHART_ENTRY',
        entityType: 'ChartEntry',
        entityId: chartEntry.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          patientId: chartEntry.patientId,
          visitId: chartEntry.visitId ?? null,
          toothNumber: chartEntry.toothNumber,
          surfaces: chartEntry.surfaces,
          type: chartEntry.type,
          label: chartEntry.label,
          conditionCode: chartEntry.conditionCode ?? null,
          conditionId,
          patientConditionId: patientCondition.id,
          providerId: chartEntry.providerId ?? null,
          diagnosedAt: chartEntry.diagnosedAt ?? null,
          via: 'quick-action:ADD_CONDITION',
        },
      });

      return chartEntry;
    });

    return { chartEntry: this.formatEntry(result) };
  }

  // ── PLAN_TREATMENT ─────────────────────────────────────────────────────────

  private async handlePlanTreatment(
    dto: QuickActionDto,
    actorUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<QuickActionResponse> {
    if (!dto.procedureCatalogId && !dto.procedureLabel)
      throw new BadRequestException(
        'Either procedureCatalogId or procedureLabel is required',
      );

    const fdi = dto.toothNumber;
    const surfaces = assertSurfaces(dto.surfaces, fdi);

    // Guard: don't plan surface work on an absent tooth (shared, dual-source).
    await assertToothPresence(this.prisma, {
      patientId: dto.patientId,
      toothNumbers: [fdi],
      surfaces,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const { plan, wasCreated } = await this.resolveOrCreatePlan(
        dto,
        tx,
        actorUserId,
      );

      let procedureName = dto.procedureLabel ?? 'Procedure';
      let procedureCode = dto.procedureCode;
      let defaultCost = dto.procedureCost ?? 0;
      // Multi-currency: the procedure's pricing currency comes from the catalog
      // row, NOT a hard-coded literal. Free-text quick actions (no catalogId)
      // fall back to the system base currency.
      let procedureCurrency = 'UGX';

      if (dto.procedureCatalogId) {
        const catalogItem = await tx.procedure.findUnique({
          where: { id: dto.procedureCatalogId },
        });
        if (!catalogItem)
          throw new NotFoundException('Procedure not found in catalog');
        procedureName = catalogItem.name;
        procedureCode = catalogItem.code ?? procedureCode;
        defaultCost =
          dto.procedureCost ?? Number(catalogItem.basePrice) ?? 0;
        procedureCurrency = catalogItem.currency ?? 'UGX';
      }

      const last = await tx.treatmentProcedure.findFirst({
        where: { treatmentPlanId: plan.id },
        orderBy: { sequence: 'desc' },
      });
      const nextSequence = last ? last.sequence + 1 : 100;
      const visitGroup = last ? last.visitGroup : 1;

      const procedure = await tx.treatmentProcedure.create({
        data: {
          treatmentPlanId: plan.id,
          procedureId:
            dto.procedureCatalogId ??
            (await this.getOrCreateGenericProcedureId(
              procedureName,
              procedureCode,
              defaultCost,
              tx,
            )),
          totalPrice: defaultCost,
          currency: procedureCurrency,
          status: 'PLANNED',
          visitGroup,
          sequence: nextSequence,
          notes: dto.notes,
          providerId: dto.providerId ?? null,
        },
      });

      await tx.procedureTarget.create({
        data: {
          treatmentProcedureId: procedure.id,
          toothNumber: fdi,
          surfaces,
        },
      });

      const chartEntry = await tx.chartEntry.create({
        data: {
          patientId: dto.patientId,
          visitId: dto.visitId,
          toothNumber: fdi,
          surfaces,
          type: ChartEntryType.PLANNED,
          label: procedureName,
          procedureCode,
          treatmentProcedureId: procedure.id,
          providerId: dto.providerId ?? null,
          notes: dto.notes,
        },
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      });

      // ── AUDIT ───────────────────────────────────────────────────────────
      // Audit every record this quick action created, all inside the same
      // transaction so a rollback unwinds both the records and the audit
      // rows together (audit never describes a state that didn't happen).
      //
      // TreatmentPlan is only audited when this action CREATED it; reusing
      // an existing active plan is not an audit-worthy state change for the
      // plan itself (only the new procedure appended to it is).
      if (wasCreated) {
        await this.writeAuditTx(tx, {
          action: 'CREATE',
          module: 'TREATMENT_PLANS',
          entityType: 'TreatmentPlan',
          entityId: plan.id,
          userId: actorUserId,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          newData: {
            patientId: plan.patientId,
            title: plan.title,
            status: plan.status,
            estimatedCost: plan.estimatedCost,
            via: 'quick-action:PLAN_TREATMENT',
          },
        });
      }

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'TREATMENT_PLANS',
        entityType: 'TreatmentProcedure',
        entityId: procedure.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          treatmentPlanId: plan.id,
          procedureName,
          procedureCode: procedureCode ?? null,
          totalPrice: defaultCost,
          currency: procedureCurrency,
          status: 'PLANNED',
          toothNumber: fdi,
          surfaces,
          providerId: dto.providerId ?? null,
          via: 'quick-action:PLAN_TREATMENT',
        },
      });

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'CHART_ENTRY',
        entityType: 'ChartEntry',
        entityId: chartEntry.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          patientId: chartEntry.patientId,
          visitId: chartEntry.visitId ?? null,
          toothNumber: chartEntry.toothNumber,
          surfaces: chartEntry.surfaces,
          type: chartEntry.type,
          label: chartEntry.label,
          procedureCode: chartEntry.procedureCode ?? null,
          treatmentProcedureId: procedure.id,
          providerId: chartEntry.providerId ?? null,
          via: 'quick-action:PLAN_TREATMENT',
        },
      });

      return {
        chartEntry,
        plan,
        wasCreated,
        procedureId: procedure.id,
        procedureName,
      };
    });

    return {
      chartEntry: this.formatEntry(result.chartEntry),
      treatmentPlan: { id: result.plan.id, title: result.plan.title, wasCreated: result.wasCreated },
      treatmentProcedure: { id: result.procedureId, procedureName: result.procedureName },
    };
  }

  // ── PERFORM_NOW ────────────────────────────────────────────────────────────

  private async handlePerformNow(
    dto: QuickActionDto,
    actorUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<QuickActionResponse> {
    if (!dto.procedureCatalogId && !dto.procedureLabel)
      throw new BadRequestException(
        'Either procedureCatalogId or procedureLabel is required',
      );

    const fdi = dto.toothNumber;
    const surfaces = assertSurfaces(dto.surfaces, fdi);
    const performedAt = dto.performedDate
      ? new Date(dto.performedDate)
      : new Date();

    // Guard: don't perform surface work on an absent tooth (shared, dual-source).
    await assertToothPresence(this.prisma, {
      patientId: dto.patientId,
      toothNumbers: [fdi],
      surfaces,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const { plan, wasCreated } = await this.resolveOrCreatePlan(
        dto,
        tx,
        actorUserId,
      );

      let procedureName = dto.procedureLabel ?? 'Procedure';
      let procedureCode = dto.procedureCode;
      let defaultCost = dto.procedureCost ?? 0;
      // Multi-currency: the procedure's pricing currency comes from the catalog
      // row, NOT a hard-coded literal. Free-text quick actions (no catalogId)
      // fall back to the system base currency.
      let procedureCurrency = 'UGX';

      if (dto.procedureCatalogId) {
        const catalogItem = await tx.procedure.findUnique({
          where: { id: dto.procedureCatalogId },
        });
        if (!catalogItem)
          throw new NotFoundException('Procedure not found in catalog');
        procedureName = catalogItem.name;
        procedureCode = catalogItem.code ?? procedureCode;
        defaultCost =
          dto.procedureCost ?? Number(catalogItem.basePrice) ?? 0;
        procedureCurrency = catalogItem.currency ?? 'UGX';
      }

      const last = await tx.treatmentProcedure.findFirst({
        where: { treatmentPlanId: plan.id },
        orderBy: { sequence: 'desc' },
      });
      const nextSequence = last ? last.sequence + 1 : 100;

      const procedure = await tx.treatmentProcedure.create({
        data: {
          treatmentPlanId: plan.id,
          procedureId:
            dto.procedureCatalogId ??
            (await this.getOrCreateGenericProcedureId(
              procedureName,
              procedureCode,
              defaultCost,
              tx,
            )),
          currency: procedureCurrency,
          totalPrice: defaultCost,
          status: 'COMPLETED',
          visitGroup: 1,
          sequence: nextSequence,
          notes: dto.notes,
          completedAt: performedAt,
          performedDate: performedAt,
          providerId: dto.providerId ?? null,
        },
      });

      await tx.procedureTarget.create({
        data: {
          treatmentProcedureId: procedure.id,
          toothNumber: fdi,
          surfaces,
        },
      });

      const session = await tx.procedureSession.create({
        data: {
          treatmentProcedureId: procedure.id,
          visitId: dto.visitId,
          sessionNumber: 1,
          status: 'COMPLETED',
          performedDate: performedAt,
          performedNotes: dto.notes,
          sessionPrice: dto.sessionCost ?? defaultCost,
          surfaces, // ← now the ToothSurface[] enum, DB-validated
          actualInputsUsed: dto.actualInputsUsed
            ? (dto.actualInputsUsed as any)
            : undefined,
          ledgerStatus: 'PENDING',
          providerId: dto.providerId ?? null,
          isFinal: true,
        },
      });

      await tx.procedureTarget.create({
        data: {
          procedureSessionId: session.id,
          toothNumber: fdi,
          surfaces,
        },
      });

      // Structured supersede: close out matching PLANNED entries by
      // procedure linkage, not by label substring.
      await tx.chartEntry.updateMany({
        where: {
          patientId: dto.patientId,
          toothNumber: fdi,
          type: 'PLANNED',
          status: 'ACTIVE',
          ...(dto.procedureCatalogId
            ? { treatmentProcedure: { procedureId: dto.procedureCatalogId } }
            : {}),
        },
        data: { status: 'SUPERSEDED' },
      });

      const chartEntry = await tx.chartEntry.create({
        data: {
          patientId: dto.patientId,
          visitId: dto.visitId,
          toothNumber: fdi,
          surfaces,
          type: ChartEntryType.COMPLETED,
          label: procedureName,
          procedureCode,
          treatmentProcedureId: procedure.id,
          procedureSessionId: session.id,
          providerId: dto.providerId ?? null,
          notes: dto.notes,
        },
        include: {
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      });

      // ── AUDIT ───────────────────────────────────────────────────────────
      // All four records (optionally 3 if plan was pre-existing) land inside
      // the same transaction so a rollback unwinds both data and audit
      // together. Actor resolution happens inside writeAuditTx (defensive
      // null-user handling), so an unauthenticated / clock-skewed request
      // can never block the write.
      if (wasCreated) {
        await this.writeAuditTx(tx, {
          action: 'CREATE',
          module: 'TREATMENT_PLANS',
          entityType: 'TreatmentPlan',
          entityId: plan.id,
          userId: actorUserId,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          newData: {
            patientId: plan.patientId,
            title: plan.title,
            status: plan.status,
            estimatedCost: plan.estimatedCost,
            via: 'quick-action:PERFORM_NOW',
          },
        });
      }

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'TREATMENT_PLANS',
        entityType: 'TreatmentProcedure',
        entityId: procedure.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          treatmentPlanId: plan.id,
          procedureName,
          procedureCode: procedureCode ?? null,
          totalPrice: defaultCost,
          currency: procedureCurrency,
          status: 'COMPLETED',
          toothNumber: fdi,
          surfaces,
          providerId: dto.providerId ?? null,
          performedDate: performedAt.toISOString(),
          via: 'quick-action:PERFORM_NOW',
        },
      });

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'TREATMENT_PLANS',
        entityType: 'ProcedureSession',
        entityId: session.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          treatmentProcedureId: procedure.id,
          visitId: dto.visitId ?? null,
          sessionNumber: session.sessionNumber,
          status: 'COMPLETED',
          performedDate: performedAt.toISOString(),
          isFinal: true,
          providerId: dto.providerId ?? null,
          via: 'quick-action:PERFORM_NOW',
        },
      });

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        module: 'CHART_ENTRY',
        entityType: 'ChartEntry',
        entityId: chartEntry.id,
        userId: actorUserId,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          patientId: chartEntry.patientId,
          visitId: chartEntry.visitId ?? null,
          toothNumber: chartEntry.toothNumber,
          surfaces: chartEntry.surfaces,
          type: chartEntry.type,
          label: chartEntry.label,
          procedureCode: chartEntry.procedureCode ?? null,
          treatmentProcedureId: procedure.id,
          procedureSessionId: session.id,
          providerId: chartEntry.providerId ?? null,
          via: 'quick-action:PERFORM_NOW',
        },
      });

      return {
        chartEntry,
        plan,
        wasCreated,
        procedureId: procedure.id,
        procedureName,
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
      };
    });

    return {
      chartEntry: this.formatEntry(result.chartEntry),
      treatmentPlan: { id: result.plan.id, title: result.plan.title, wasCreated: result.wasCreated },
      treatmentProcedure: { id: result.procedureId, procedureName: result.procedureName },
      procedureSession: { id: result.sessionId, sessionNumber: result.sessionNumber },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  // NOTE: helpers accept a `tx` so they run inside the caller's transaction.

  private async resolveOrCreatePlan(
    dto: QuickActionDto,
    tx: any,
    actorUserId?: string | null,
  ) {
    const activePlan = await tx.treatmentPlan.findFirst({
      where: {
        patientId: dto.patientId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (activePlan) return { plan: activePlan, wasCreated: false };

    const title =
      dto.planName ??
      `Treatment Plan — ${new Date().toLocaleDateString('en-UG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`;

    const visit = dto.visitId
      ? await tx.visit.findUnique({
          where: { id: dto.visitId },
          include: { dentist: true },
        })
      : null;

    const planData: any = {
      patientId: dto.patientId,
      title,
      status: 'PLANNED',
      priority: 'ROUTINE',
      estimatedCost: 0,
      actualCost: 0,
      consentSigned: false,
      planCode: await this.generatePlanCode(tx),
    };
    planData.dentistId = await this.resolveDentistId(tx, visit, actorUserId);

    const newPlan = await tx.treatmentPlan.create({ data: planData });
    return { plan: newPlan, wasCreated: true };
  }

  // ── Resolve the REQUIRED dentist FK for a new treatment plan ───────────────
  // Order: visit's assigned dentist → acting user's own staff record (the
  // clinician charting from the drawer) → hard 400. Previously the id was set
  // only when the visit carried a dentist, so a quick action fired without a
  // dentist-linked visit hit Prisma's raw missing-required-FK error. This
  // returns a clean, actionable message instead.
  private async resolveDentistId(
    tx: any,
    visit: { dentistId?: string | null; dentist?: { id: string } | null } | null,
    actorUserId?: string | null,
  ): Promise<string> {
    let dentistId = visit?.dentistId ?? visit?.dentist?.id ?? null;
    if (!dentistId && actorUserId) {
      const actorStaff = await tx.staff.findUnique({
        where: { userId: actorUserId },
        select: { id: true },
      });
      dentistId = actorStaff?.id ?? null;
    }
    if (!dentistId) {
      throw new BadRequestException(
        'Cannot create a treatment plan without a dentist. Open this action ' +
          'from a visit that has an assigned dentist, or ensure your user is ' +
          'linked to a staff record.',
      );
    }
    return dentistId;
  }

  private async generatePlanCode(tx: any): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await tx.treatmentPlan.count();
    return `TP-${date}-${String(count + 1).padStart(3, '0')}`;
  }

  private async getOrCreateGenericProcedureId(
    name: string,
    code: string | undefined,
    cost: number | undefined,
    tx: any,
  ): Promise<string> {
    // Dedup governance: match on code, else on a trimmed, case-insensitive
    // name so "Root Canal", "root canal " and "ROOT CANAL" collapse to ONE
    // clinic-created catalog row instead of three near-duplicates.
    const trimmedName = name.trim();
    const existing = await tx.procedure.findFirst({
      where: code
        ? { code }
        : { name: { equals: trimmedName, mode: 'insensitive' } },
    });
    if (existing) return existing.id;
    const created = await tx.procedure.create({
      data: {
        name: trimmedName,
        code: code ?? undefined,
        categoryId: await this.getOrCreateGeneralCategoryId(tx),
        basePrice: cost ?? 0,
      } as any,
    });
    return created.id;
  }

  private async getOrCreateGeneralCategoryId(tx: any): Promise<string> {
    const cat = await tx.procedureCategory.findFirst({
      where: { name: 'General' },
    });
    if (cat) return cat.id;
    const created = await tx.procedureCategory.create({
      data: { name: 'General', code: 'GEN', isActive: true },
    });
    return created.id;
  }

  // A1: resolve a catalog Condition for a quick-action diagnosis. Prefer an
  // exact ICD-10 code match (hits the seeded catalog, including the
  // presence-affecting rows like K08.1 extracted so tooth-presence detection
  // works through the structured record too), then an exact name match, else
  // create a clinic-defined (isSystem:false) catalog row. Mirrors the
  // getOrCreateGenericProcedureId pattern already used for procedures.
  private async getOrCreateConditionId(
    label: string,
    code: string | undefined,
    tx: any,
  ): Promise<string> {
    if (code) {
      const byCode = await tx.condition.findFirst({
        where: { icd10Code: code },
      });
      if (byCode) return byCode.id;
    }
    // Dedup governance: trimmed, case-insensitive name match so the same
    // clinic-typed diagnosis doesn't spawn multiple catalog rows.
    const trimmedLabel = label.trim();
    const byName = await tx.condition.findFirst({
      where: { name: { equals: trimmedLabel, mode: 'insensitive' } },
    });
    if (byName) return byName.id;
    const created = await tx.condition.create({
      data: {
        name: trimmedLabel,
        icd10Code: code ?? null,
        category: 'OTHER',
        chartPresenceEffect: 'NONE',
        isToothSpecific: true,
        requiresSurface: false,
        isSystem: false,
        isActive: true,
        autoResolves: true,
      },
    });
    return created.id;
  }

  private formatEntry(entry: any) {
    return {
      ...entry,
      createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
      updatedAt: entry.updatedAt?.toISOString?.() ?? entry.updatedAt,
    };
  }

  async addExistingProcedure(dto: AddExistingProcedureDto) {
    const fdi = assertFdiTooth(dto.toothNumber);
    const surfaces = assertSurfaces(dto.surfaces, fdi);

    return this.prisma.chartEntry.create({
      data: {
        patientId: dto.patientId,
        visitId: dto.visitId,
        toothNumber: fdi,
        surfaces,
        type: ChartEntryType.EXISTING,
        label: dto.procedureName,
        procedureCode: dto.procedureCode,
        providerId: dto.providerId ?? null,
        notes: dto.notes,
      },
      include: {
        provider: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  
}
