import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ChartEntryService } from './chart-entry.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ChartEntryService', () => {
  let service: ChartEntryService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ChartEntryService(prisma as any);

    // A1: ADD_CONDITION now also resolves/creates a catalog Condition and a
    // structured PatientCondition (so the quick-action diagnosis is
    // lifecycle-capable, not just a chart marking). Default stubs for that path;
    // individual tests override as needed.
    prisma.condition.findFirst.mockResolvedValue(null);
    prisma.condition.create.mockResolvedValue({ id: 'cond-cat-auto' });
    prisma.patientCondition.findFirst.mockResolvedValue(null);
    prisma.patientCondition.create.mockResolvedValue({
      id: 'pc-auto',
      status: 'ACTIVE',
      patientId: 'p1',
    });
    // Quick actions record into a visit: default an open one of patient p1.
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1',
      patientId: 'p1',
      dentistId: 'd1',
      status: 'IN_PROGRESS',
    });
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ── createEntry ──────────────────────────────────────────────────────────────
  describe('createEntry', () => {
    it('rejects an invalid FDI tooth number', async () => {
      await expect(
        service.createEntry({ patientId: 'p1', toothNumber: 99, type: 'CONDITION', label: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates an entry and stores an unresolved provider as NULL', async () => {
      prisma.staff.findUnique.mockResolvedValue(null); // provider not in Staff
      prisma.chartEntry.create.mockResolvedValue({
        id: 'ce1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      });
      const out = await service.createEntry({
        patientId: 'p1', toothNumber: 11, type: 'CONDITION', label: 'Caries',
        surfaces: [], providerId: 'maybe-bad',
      } as any);
      expect(prisma.chartEntry.create).toHaveBeenCalledTimes(1);
      expect(prisma.chartEntry.create.mock.calls[0][0].data.providerId).toBeNull();
      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(out.id).toBe('ce1');
      expect(typeof out.createdAt).toBe('string'); // formatEntry → ISO
    });
  });

  // ── updateEntry (now audited) ────────────────────────────────────────────────
  describe('updateEntry', () => {
    it('throws when the entry is missing', async () => {
      prisma.chartEntry.findUnique.mockResolvedValue(null);
      await expect(service.updateEntry('nope', {} as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates in a transaction and writes an audit row', async () => {
      prisma.chartEntry.findUnique.mockResolvedValue({
        id: 'ce1', status: 'ACTIVE', notes: 'old', label: 'L', providerId: null,
      });
      prisma.chartEntry.update.mockResolvedValue({
        id: 'ce1', status: 'SUPERSEDED', notes: 'new', label: 'L', providerId: null,
      });
      await service.updateEntry('ce1', { status: 'SUPERSEDED', notes: 'new' } as any, 'user-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.module).toBe('CHART_ENTRY');
      expect(audit.data.action).toBe('UPDATE');
    });
  });

  // ── voidEntry (now audited) ──────────────────────────────────────────────────
  describe('voidEntry', () => {
    it('throws when the entry is missing', async () => {
      prisma.chartEntry.findUnique.mockResolvedValue(null);
      await expect(service.voidEntry('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks VOIDED and audits with reason + actor', async () => {
      prisma.chartEntry.findUnique.mockResolvedValue({
        id: 'ce1', status: 'ACTIVE', type: 'CONDITION', label: 'Caries', toothNumber: 11, notes: null,
      });
      prisma.chartEntry.update.mockResolvedValue({ id: 'ce1', status: 'VOIDED' });
      await service.voidEntry('ce1', 'charted in error', 'user-9');
      const audit = prisma.auditLog.create.mock.calls[0][0];
      expect(audit.data.action).toBe('VOID');
      expect(audit.data.reason).toBe('charted in error');
    });
  });

  // ── updateCondition ──────────────────────────────────────────────────────────
  describe('updateCondition', () => {
    it('updates the chart entry, the linked PatientCondition, and audits', async () => {
      prisma.chartEntry.findUnique.mockResolvedValue({
        id: 'ce1', toothNumber: 11, label: 'old', notes: null, surfaces: [],
        providerId: null, conditionId: 'c1', patientConditionId: 'pc1',
      });
      prisma.chartEntry.update.mockResolvedValue({
        id: 'ce1', label: 'new', notes: 'n', surfaces: [], providerId: null, conditionId: 'c1',
        createdAt: new Date(), updatedAt: new Date(),
      });
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1' });
      await service.updateCondition('ce1', { label: 'new', notes: 'n', patientConditionId: 'pc1' } as any, 'user-1');
      expect(prisma.patientCondition.update).toHaveBeenCalled();
      // Two audit rows now: the ChartEntry edit AND the PatientCondition edit
      // (E2/AU3 — the condition mutation is audited as its own entity so the
      // condition's audit-log view is complete regardless of edit path).
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      const entityTypes = prisma.auditLog.create.mock.calls
        .map((c) => c[0].data.entityType)
        .sort();
      expect(entityTypes).toEqual(['ChartEntry', 'PatientCondition']);
    });
  });

  // ── supersedeByPatientCondition ──────────────────────────────────────────────
  describe('supersedeByPatientCondition', () => {
    it('requires a patientConditionId', async () => {
      await expect(service.supersedeByPatientCondition('')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('supersedes all ACTIVE entries for the condition', async () => {
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 4 });
      const out = await service.supersedeByPatientCondition('pc1');
      expect(out).toEqual({ success: true, count: 4 });
      const arg = prisma.chartEntry.updateMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ patientConditionId: 'pc1', status: 'ACTIVE' });
    });
  });

  // ── Quick-action engine ──────────────────────────────────────────────────────
  describe('executeQuickAction', () => {
    it('rejects an unknown action', async () => {
      await expect(
        service.executeQuickAction({ patientId: 'p1', toothNumber: 11, action: 'NOPE' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ADD_CONDITION requires a conditionLabel', async () => {
      await expect(
        service.executeQuickAction({ patientId: 'p1', toothNumber: 11, action: 'ADD_CONDITION' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ADD_CONDITION supersedes a matching code then creates a CONDITION entry', async () => {
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1', createdAt: new Date(), updatedAt: new Date() });
      const out = await service.executeQuickAction({
        patientId: 'p1', toothNumber: 11, action: 'ADD_CONDITION',
        conditionLabel: 'Caries', conditionCode: 'K02.9',
      } as any);
      expect(prisma.chartEntry.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.chartEntry.create.mock.calls[0][0];
      expect(createArg.data.type).toBe('CONDITION');
      expect(out.chartEntry.id).toBe('ce1');
    });

    // ── AUDIT (regression: quick actions used to write no audit rows) ────────
    it('ADD_CONDITION writes a CREATE audit row for the ChartEntry stamped with the actor', async () => {
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      // The mock returns the full row Prisma would (audit newData reads back
      // from the just-created record). Only the audit-relevant fields are set;
      // `formatEntry` will later add ISO timestamps which we don't assert here.
      prisma.chartEntry.create.mockResolvedValue({
        id: 'ce-audit',
        type: 'CONDITION',
        toothNumber: 11,
        surfaces: [],
        label: 'Caries',
        patientId: 'p1',
        visitId: 'v1',
        conditionCode: 'K02.9',
        providerId: null,
        diagnosedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // writeAuditTx defensively resolves the actor via tx.user.findUnique;
      // stub it so the audit row carries the resolved userId.
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dentist-7',
        staff: { firstName: 'Jane', lastName: 'Doe' },
      });
      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 11, action: 'ADD_CONDITION',
          conditionLabel: 'Caries', conditionCode: 'K02.9',
        } as any,
        'user-dentist-7',
      );
      // A1: two audit rows now — the new PatientCondition AND the ChartEntry.
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      const audit = prisma.auditLog.create.mock.calls
        .map((c) => c[0])
        .find((a) => a.data.entityType === 'ChartEntry');
      expect(audit).toBeDefined();
      expect(audit.data.action).toBe('CREATE');
      expect(audit.data.module).toBe('CHART_ENTRY');
      expect(audit.data.entityType).toBe('ChartEntry');
      expect(audit.data.recordId).toBe('ce-audit');
      expect(audit.data.userId).toBe('user-dentist-7');
      expect(audit.data.userName).toBe('Jane Doe');
      expect(audit.data.newData).toMatchObject({
        type: 'CONDITION',
        toothNumber: 11,
        conditionCode: 'K02.9',
        via: 'quick-action:ADD_CONDITION',
      });
      // The PatientCondition audit is also present and actor-stamped.
      const pcAudit = prisma.auditLog.create.mock.calls
        .map((c) => c[0])
        .find((a) => a.data.entityType === 'PatientCondition');
      expect(pcAudit?.data.module).toBe('CONDITIONS');
    });

    it('ADD_CONDITION still audits even with no actor (defensive null-user handling)', async () => {
      // A request without an actorUserId must still complete the audit row
      // (with userId=null, no userName) — never silently skip the audit.
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-anon', createdAt: new Date(), updatedAt: new Date() });
      await service.executeQuickAction({
        patientId: 'p1', toothNumber: 11, action: 'ADD_CONDITION',
        conditionLabel: 'Caries', conditionCode: 'K02.9',
      } as any);
      // A1: PatientCondition + ChartEntry audit rows; both must land even with
      // no actor (never silently skip the audit).
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      for (const [{ data }] of prisma.auditLog.create.mock.calls) {
        expect(data.action).toBe('CREATE');
        expect(data.userId).toBeNull();
        expect(data.userName).toBeNull();
      }
    });

    it('ADD_CONDITION keeps the audit row even when the actor user can\'t be resolved', async () => {
      // writeAuditTx guards against an unresolvable userId: the audit row
      // still lands (with userId=null + userName='unresolved:<id>') so the
      // clinical record is never created without an audit trail. The intent
      // is "the audit never blocks the mutation" — i.e. it must never be
      // silently skipped.
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-ghost', createdAt: new Date(), updatedAt: new Date() });
      prisma.user.findUnique.mockResolvedValue(null);
      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 11, action: 'ADD_CONDITION',
          conditionLabel: 'Caries', conditionCode: 'K02.9',
        } as any,
        'user-dentist-missing',
      );
      // A1: both audit rows (PatientCondition + ChartEntry) still land, each
      // with the unresolved-actor marker — the audit never blocks the mutation.
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      for (const [{ data }] of prisma.auditLog.create.mock.calls) {
        expect(data.userId).toBeNull();
        expect(data.userName).toBe('unresolved:user-dentist-missing');
      }
    });

    it('ADD_CONDITION blocks a surface-bearing condition on an absent tooth', async () => {
      // Tooth 16 already charted absent (K08.1) → caries MOD must be rejected.
      prisma.chartEntry.findMany.mockResolvedValue([
        { toothNumber: 16, type: 'CONDITION', conditionCode: 'K08.1' },
      ]);
      await expect(
        service.executeQuickAction({
          patientId: 'p1', toothNumber: 16, action: 'ADD_CONDITION',
          surfaces: ['MESIAL', 'OCCLUSAL', 'DISTAL'],
          conditionLabel: 'Caries', conditionCode: 'K02.9',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chartEntry.create).not.toHaveBeenCalled();
    });

    it('ADD_CONDITION allows a NON-surface finding on an absent tooth', async () => {
      // No surfaces → presence guard is a no-op; recording e.g. pain is allowed.
      prisma.chartEntry.findMany.mockResolvedValue([
        { toothNumber: 16, type: 'CONDITION', conditionCode: 'K08.1' },
      ]);
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce9', createdAt: new Date(), updatedAt: new Date() });
      const out = await service.executeQuickAction({
        patientId: 'p1', toothNumber: 16, action: 'ADD_CONDITION',
        surfaces: [], conditionLabel: 'Pain', conditionCode: 'K08.8',
      } as any);
      expect(out.chartEntry.id).toBe('ce9');
    });

    describe('treatment actions delegate to TreatmentPlansService', () => {
      let plans: any;
      beforeEach(() => {
        plans = {
          createTreatmentPlan: jest
            .fn()
            .mockResolvedValue({ id: 'plan-new', title: 'Treatment Plan' }),
          addProcedure: jest.fn().mockResolvedValue({
            id: 'tp1',
            chartEntries: [{ id: 'ce-planned', toothNumber: 16 }],
          }),
          executeSession: jest
            .fn()
            .mockResolvedValue({ data: { id: 's1', sessionNumber: 1 } }),
        };
        service = new ChartEntryService(prisma as any, plans);
        prisma.procedure.findFirst.mockResolvedValue({
          id: 'proc-1',
          name: 'Composite',
          currency: 'UGX',
        });
        prisma.treatmentPlan.findFirst.mockResolvedValue({
          id: 'plan-1',
          title: 'Existing plan',
        });
        prisma.chartEntry.findUnique.mockResolvedValue({
          id: 'ce-planned',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        prisma.chartEntry.findFirst.mockResolvedValue({
          id: 'ce-done',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      const base = {
        patientId: 'p1',
        visitId: 'v1',
        toothNumber: 16,
        surfaces: ['OCCLUSAL'],
        procedureCatalogId: 'proc-1',
      };

      it('PLAN_TREATMENT requires a catalogue procedure', async () => {
        await expect(
          service.executeQuickAction(
            { ...base, procedureCatalogId: undefined, procedureLabel: 'free text', action: 'PLAN_TREATMENT' } as any,
            'user-1',
          ),
        ).rejects.toThrow(/procedureCatalogId is required/);
        expect(plans.addProcedure).not.toHaveBeenCalled();
      });

      it('PLAN_TREATMENT adds to the open plan through addProcedure and ignores a client price', async () => {
        const out = await service.executeQuickAction(
          { ...base, procedureCost: 1, action: 'PLAN_TREATMENT' } as any,
          'user-1',
        );
        expect(plans.createTreatmentPlan).not.toHaveBeenCalled();
        const [planId, dto, actor] = plans.addProcedure.mock.calls[0];
        expect(planId).toBe('plan-1');
        expect(dto).toMatchObject({
          procedureId: 'proc-1',
          toothNumbers: [16],
          visitId: 'v1',
        });
        expect(dto.isPriceOverridden).toBeUndefined();
        expect(actor).toBe('user-1');
        expect(out.treatmentPlan).toEqual({ id: 'plan-1', title: 'Existing plan', wasCreated: false });
        expect(out.treatmentProcedure).toEqual({ id: 'tp1', procedureName: 'Composite' });
        expect(out.chartEntry.id).toBe('ce-planned');
      });

      it('PLAN_TREATMENT creates a plan through createTreatmentPlan when none is open', async () => {
        prisma.treatmentPlan.findFirst.mockResolvedValue(null);
        const out = await service.executeQuickAction(
          { ...base, action: 'PLAN_TREATMENT' } as any,
          'user-1',
        );
        expect(plans.createTreatmentPlan.mock.calls[0][0]).toMatchObject({
          patientId: 'p1',
          dentistId: 'd1',
          priority: 'NORMAL',
        });
        expect(out.treatmentPlan?.wasCreated).toBe(true);
      });

      it('PERFORM_NOW executes a final session through executeSession', async () => {
        const out = await service.executeQuickAction(
          { ...base, action: 'PERFORM_NOW', performedDate: '2026-10-01' } as any,
          'user-1',
        );
        const [planId, tpId, dto] = plans.executeSession.mock.calls[0];
        expect(planId).toBe('plan-1');
        expect(tpId).toBe('tp1');
        expect(dto).toMatchObject({
          visitId: 'v1',
          isFinal: true,
          toothStatuses: [{ toothNumber: 16, surfaces: ['OCCLUSAL'], status: 'COMPLETED' }],
        });
        expect(out.procedureSession).toEqual({ id: 's1', sessionNumber: 1 });
        expect(out.chartEntry.id).toBe('ce-done');
      });

      it('rejects an on-the-fly plan when no dentist can be resolved (400, not a raw FK crash)', async () => {
        prisma.treatmentPlan.findFirst.mockResolvedValue(null);
        prisma.visit.findUnique.mockResolvedValue({ id: 'v1', patientId: 'p1', dentistId: null });
        prisma.staff.findUnique.mockResolvedValue(null);
        await expect(
          service.executeQuickAction({ ...base, action: 'PLAN_TREATMENT' } as any, 'user-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it("rejects another patient's visit", async () => {
        prisma.visit.findUnique.mockResolvedValue({ id: 'v1', patientId: 'p2', dentistId: 'd1' });
        await expect(
          service.executeQuickAction({ ...base, action: 'PLAN_TREATMENT' } as any, 'user-1'),
        ).rejects.toThrow(/different patient/);
      });
    });
  });

  describe('createEntry — links', () => {
    it("rejects linking another patient's procedure", async () => {
      prisma.treatmentProcedure.findUnique.mockResolvedValue({
        treatmentPlan: { patientId: 'p2' },
      });
      await expect(
        service.createEntry({
          patientId: 'p1', toothNumber: 11, type: 'PLANNED', label: 'x',
          treatmentProcedureId: 'tp-other',
        } as any),
      ).rejects.toThrow(/different patient/);
      expect(prisma.chartEntry.create).not.toHaveBeenCalled();
    });

    it('refuses to chart into a cancelled visit', async () => {
      prisma.visit.findUnique.mockResolvedValue({
        id: 'v1', patientId: 'p1', dentistId: 'd1', status: 'CANCELLED',
      });
      await expect(
        service.createEntry({
          patientId: 'p1', visitId: 'v1', toothNumber: 11, type: 'CONDITION', label: 'x',
        } as any),
      ).rejects.toThrow(/cancelled visit/);
    });
  });

  describe('addExistingProcedure', () => {
    it('creates an EXISTING entry', async () => {
      prisma.visit.findUnique.mockResolvedValue({
        id: 'v1', patientId: 'p1', dentistId: 'd1', status: 'IN_PROGRESS',
      });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1' });
      await service.addExistingProcedure({
        patientId: 'p1', visitId: 'v1', toothNumber: 11, surfaces: [], procedureName: 'Old crown', procedureCode: 'X',
      } as any);
      const arg = prisma.chartEntry.create.mock.calls[0][0];
      expect(arg.data.type).toBe('EXISTING');
    });
  });
});
