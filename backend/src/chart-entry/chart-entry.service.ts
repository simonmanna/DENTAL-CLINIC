// src/chart-entry/chart-entry.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXED: FDI validation on every write · canonical surface enum · structured
// (code-based, not string-match) supersede + missing-tooth guard · all
// multi-write quick actions wrapped in $transaction.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Optional,
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
import { assertVisitWritableTx } from '../visit/visit-guard';
import { TreatmentPlansService } from '../treatment-plans/treatment-plans.service';

// Structured codes that mean "this tooth is gone" — used instead of
// `label.includes('extract')` string matching anywhere.
const ABSENT_CONDITION_CODES = new Set(['K08.1', 'K00.0']);

@Injectable()
export class ChartEntryService {
  private readonly logger = new Logger(ChartEntryService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Quick actions that plan or perform treatment go through the one
    // treatment-plan implementation (catalogue pricing, duplicate / presence
    // guards, chart rows, billing, visit guard, audit).
    @Optional() private readonly plans?: TreatmentPlansService,
  ) {}

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
        where: { deletedAt: null },
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

  async createEntry(
    dto: CreateChartEntryDto,
    actorUserId?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const fdi = assertFdiTooth(dto.toothNumber, { optional: true });
    const surfaces = fdi ? assertSurfaces(dto.surfaces, fdi) : [];

    // An unknown provider is stored as NULL (the old code logged "saving
    // NULL" and then saved the bad id anyway, failing on the FK).
    let providerId: string | null = dto.providerId ?? null;
    if (providerId) {
      const staff = await this.prisma.staff.findUnique({
        where: { id: providerId },
        select: { id: true },
      });
      if (!staff) {
        this.logger.warn(
          `[createEntry] providerId=${providerId} not in Staff — saving NULL`,
        );
        providerId = null;
      }
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      if (dto.visitId) {
        await assertVisitWritableTx(tx, {
          visitId: dto.visitId,
          patientId: dto.patientId,
          actorUserId: actorUserId ?? null,
          what: 'the dental chart',
        });
      }
      await this.assertLinksBelongToPatientTx(tx, dto.patientId, {
        treatmentProcedureId: dto.treatmentProcedureId,
        procedureSessionId: dto.procedureSessionId,
        patientConditionId: dto.patientConditionId,
      });

      const row = await tx.chartEntry.create({
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
          providerId,
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

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        entityId: row.id,
        userId: actorUserId ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        newData: {
          patientId: row.patientId,
          visitId: row.visitId,
          type: row.type,
          toothNumber: row.toothNumber,
          surfaces: row.surfaces,
          label: row.label,
          treatmentProcedureId: row.treatmentProcedureId,
          patientConditionId: row.patientConditionId,
        },
      });
      return row;
    });

    return this.formatEntry(entry);
  }

  /**
   * A chart row may only point at records of its own patient — the ids come
   * from the client, and a foreign id would put another patient's procedure
   * or diagnosis on this chart.
   */
  private async assertLinksBelongToPatientTx(
    tx: Prisma.TransactionClient,
    patientId: string,
    links: {
      treatmentProcedureId?: string | null;
      procedureSessionId?: string | null;
      patientConditionId?: string | null;
    },
  ) {
    const foreign = () =>
      new BadRequestException(
        'A linked record belongs to a different patient (or does not exist).',
      );
    if (links.treatmentProcedureId) {
      const tp = await tx.treatmentProcedure.findUnique({
        where: { id: links.treatmentProcedureId },
        select: { treatmentPlan: { select: { patientId: true } } },
      });
      if (tp?.treatmentPlan?.patientId !== patientId) throw foreign();
    }
    if (links.procedureSessionId) {
      const ps = await tx.procedureSession.findUnique({
        where: { id: links.procedureSessionId },
        select: {
          treatmentProcedure: {
            select: { treatmentPlan: { select: { patientId: true } } },
          },
        },
      });
      if (ps?.treatmentProcedure?.treatmentPlan?.patientId !== patientId) {
        throw foreign();
      }
    }
    if (links.patientConditionId) {
      const pc = await tx.patientCondition.findUnique({
        where: { id: links.patientConditionId },
        select: { patientId: true, deletedAt: true },
      });
      if (!pc || pc.deletedAt || pc.patientId !== patientId) throw foreign();
    }
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

    // The PatientCondition edited here is the one this row is linked to.
    // It used to be taken from the request body, so any condition id —
    // including another patient's — could be rewritten through this route.
    if (
      dto.patientConditionId &&
      dto.patientConditionId !== existing.patientConditionId
    ) {
      throw new BadRequestException(
        'patientConditionId does not match this chart entry.',
      );
    }
    const linkedPcId = existing.patientConditionId ?? null;

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

      if (linkedPcId) {
        const existingPc = await tx.patientCondition.findUnique({
          where: { id: linkedPcId },
          select: { status: true, resolvedAt: true },
        });
        const updatedPc = await tx.patientCondition.update({
          where: { id: linkedPcId },
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
          entityId: linkedPcId,
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
              where: { id: linkedPcId },
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
      if (entry.visitId) {
        await assertVisitWritableTx(tx, {
          visitId: entry.visitId,
          patientId: entry.patientId,
          actorUserId: actorUserId ?? null,
          amendmentReason: reason,
          what: 'the dental chart',
        });
      }
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
        return this.handlePlanTreatment(dto, actorUserId);
      case 'PERFORM_NOW':
        return this.handlePerformNow(dto, actorUserId);
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

    const result = await this.prisma.$transaction(async (tx) => {
      await assertVisitWritableTx(tx, {
        visitId: dto.visitId,
        patientId: dto.patientId,
        actorUserId: actorUserId ?? null,
        what: 'diagnoses',
      });
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
  //
  // Delegates to TreatmentPlansService.addProcedure. The old handler wrote
  // its own procedure rows: client-supplied price, free-text catalogue rows,
  // count-based plan codes, no billing, no duplicate / extraction / presence
  // guards — and could bill a tooth twice next to an existing planned
  // procedure. Price now comes from the catalogue; a client cost is ignored.

  private async handlePlanTreatment(
    dto: QuickActionDto,
    actorUserId?: string | null,
  ): Promise<QuickActionResponse> {
    const { plan, wasCreated, tp } = await this.planViaService(dto, actorUserId);
    const planned =
      (tp.chartEntries ?? []).find((c: any) => c.toothNumber === dto.toothNumber) ??
      (tp.chartEntries ?? [])[0];
    const chartEntry = planned
      ? await this.prisma.chartEntry.findUnique({
          where: { id: planned.id },
          include: this.entryInclude(),
        })
      : null;
    return {
      chartEntry: this.formatEntry(chartEntry ?? planned),
      treatmentPlan: { id: plan.id, title: plan.title, wasCreated },
      treatmentProcedure: { id: tp.id, procedureName: tp.procedureName },
    };
  }

  // ── PERFORM_NOW ────────────────────────────────────────────────────────────
  //
  // Plan it (as above), then create-and-execute its FINAL session through
  // executeSession — the one completion path (chart supersede/complete,
  // extraction absence, condition resolution, consumables, audit).

  private async handlePerformNow(
    dto: QuickActionDto,
    actorUserId?: string | null,
  ): Promise<QuickActionResponse> {
    const plans = this.requirePlans();
    const { plan, wasCreated, tp } = await this.planViaService(dto, actorUserId);
    const surfaces = assertSurfaces(dto.surfaces, dto.toothNumber);

    const executed: any = await plans.executeSession(
      plan.id,
      tp.id,
      {
        visitId: dto.visitId,
        isFinal: true,
        outcome: 'COMPLETED',
        providerId: dto.providerId,
        performedDate: dto.performedDate,
        performedNotes: dto.notes,
        actualInputsUsed: dto.actualInputsUsed,
        toothStatuses: [
          { toothNumber: dto.toothNumber, surfaces, status: 'COMPLETED' },
        ],
      },
      actorUserId ?? undefined,
    );
    const session = executed?.data;
    const completed = session
      ? await this.prisma.chartEntry.findFirst({
          where: {
            procedureSessionId: session.id,
            type: ChartEntryType.COMPLETED,
            status: 'ACTIVE',
          },
          include: this.entryInclude(),
        })
      : null;

    return {
      chartEntry: this.formatEntry(completed ?? {}),
      treatmentPlan: { id: plan.id, title: plan.title, wasCreated },
      treatmentProcedure: { id: tp.id, procedureName: tp.procedureName },
      procedureSession: session
        ? { id: session.id, sessionNumber: session.sessionNumber }
        : undefined,
    };
  }

  private requirePlans(): TreatmentPlansService {
    if (!this.plans) throw new Error('TreatmentPlansService not wired');
    return this.plans;
  }

  private entryInclude() {
    return {
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
        },
      },
    } as const;
  }

  /**
   * The patient's open plan (most recent PLANNED / IN_PROGRESS), or a new one
   * created through TreatmentPlansService (document-numbered code, audit);
   * then the catalogue procedure added to it.
   */
  private async planViaService(
    dto: QuickActionDto,
    actorUserId?: string | null,
  ) {
    const plans = this.requirePlans();
    if (!dto.procedureCatalogId) {
      throw new BadRequestException(
        'procedureCatalogId is required — choose the procedure from the catalogue.',
      );
    }
    const catalog = await this.prisma.procedure.findFirst({
      where: { id: dto.procedureCatalogId, isActive: true },
      select: { id: true, name: true, currency: true },
    });
    if (!catalog) {
      throw new BadRequestException(
        'Unknown or inactive procedure — choose one from the catalogue.',
      );
    }

    const visit = dto.visitId
      ? await this.prisma.visit.findUnique({
          where: { id: dto.visitId },
          select: { id: true, patientId: true, dentistId: true },
        })
      : null;
    if (dto.visitId && (!visit || visit.patientId !== dto.patientId)) {
      throw new BadRequestException('This visit belongs to a different patient.');
    }

    let wasCreated = false;
    let plan: { id: string; title: string } | null =
      await this.prisma.treatmentPlan.findFirst({
        where: {
          patientId: dto.patientId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true },
      });
    if (!plan) {
      const dentistId = await this.resolveDentistId(this.prisma, visit, actorUserId);
      const title =
        dto.planName ??
        `Treatment Plan — ${new Date().toLocaleDateString('en-UG', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}`;
      plan = await plans.createTreatmentPlan(
        { patientId: dto.patientId, dentistId, title, priority: 'NORMAL' } as any,
        actorUserId ?? undefined,
      );
      wasCreated = true;
    }

    const added: any = await plans.addProcedure(
      plan!.id,
      {
        procedureId: catalog.id,
        toothNumbers: [dto.toothNumber],
        surfaces: assertSurfaces(dto.surfaces, dto.toothNumber) as any,
        // Ignored unless overridden — the catalogue price is authoritative.
        totalPrice: 0,
        currency: catalog.currency,
        sessionType: 'SINGLE',
        visitId: dto.visitId,
        providerId: dto.providerId,
        notes: dto.notes,
      } as any,
      actorUserId ?? undefined,
    );
    return {
      plan: plan!,
      wasCreated,
      tp: {
        id: added.id as string,
        procedureName: catalog.name,
        chartEntries: added.chartEntries as any[],
      },
    };
  }

  // ── Resolve the REQUIRED dentist FK for a new treatment plan ───────────────
  // Order: visit's assigned dentist → acting user's own staff record (the
  // clinician charting from the drawer) → hard 400.
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

  async addExistingProcedure(
    dto: AddExistingProcedureDto,
    actorUserId?: string | null,
  ) {
    const fdi = assertFdiTooth(dto.toothNumber);
    const surfaces = assertSurfaces(dto.surfaces, fdi);

    return this.prisma.$transaction(async (tx) => {
      await assertVisitWritableTx(tx, {
        visitId: dto.visitId,
        patientId: dto.patientId,
        actorUserId: actorUserId ?? null,
        what: 'the dental chart',
      });
      const row = await tx.chartEntry.create({
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
      await this.writeAuditTx(tx, {
        action: 'CREATE',
        entityId: row.id,
        userId: actorUserId ?? null,
        newData: {
          patientId: row.patientId,
          visitId: row.visitId,
          type: row.type,
          toothNumber: row.toothNumber,
          label: row.label,
        },
      });
      return row;
    });
  }

  
}
