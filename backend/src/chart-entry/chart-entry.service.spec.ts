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

    it('creates an entry and tolerates an unresolved provider (saves anyway)', async () => {
      prisma.staff.findUnique.mockResolvedValue(null); // provider not in Staff
      prisma.chartEntry.create.mockResolvedValue({
        id: 'ce1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
      });
      const out = await service.createEntry({
        patientId: 'p1', toothNumber: 11, type: 'CONDITION', label: 'Caries',
        surfaces: [], providerId: 'maybe-bad',
      } as any);
      expect(prisma.chartEntry.create).toHaveBeenCalledTimes(1);
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

    it('PLAN_TREATMENT requires a procedure reference', async () => {
      await expect(
        service.executeQuickAction({ patientId: 'p1', toothNumber: 11, action: 'PLAN_TREATMENT' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PLAN_TREATMENT blocks surface work on an absent tooth', async () => {
      // Active CONDITION marks tooth 16 absent (K08.1) → presence guard fires.
      // Detection is dual-source (PatientCondition + ChartEntry); the absent
      // row carries the toothNumber the guard matches against.
      prisma.chartEntry.findMany.mockResolvedValue([
        { toothNumber: 16, type: 'CONDITION', conditionCode: 'K08.1' },
      ]);
      await expect(
        service.executeQuickAction({
          patientId: 'p1', toothNumber: 16, action: 'PLAN_TREATMENT',
          surfaces: ['OCCLUSAL'], procedureLabel: 'Filling',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PLAN_TREATMENT creates plan procedure + target + PLANNED chart entry from catalog', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]); // restorable
      prisma.treatmentPlan.findFirst.mockResolvedValue({ id: 'tp1', title: 'Plan A' }); // existing plan
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Composite Filling', code: 'D2391', basePrice: 120000,
      });
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null); // first proc in plan
      prisma.treatmentProcedure.create.mockResolvedValue({ id: 'proc1' });
      prisma.procedureTarget.create.mockResolvedValue({ id: 'tgt1' });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1', createdAt: new Date(), updatedAt: new Date() });

      const out = await service.executeQuickAction({
        patientId: 'p1', toothNumber: 16, action: 'PLAN_TREATMENT',
        procedureCatalogId: 'cat1', surfaces: [],
      } as any);

      expect(prisma.treatmentProcedure.create).toHaveBeenCalledTimes(1);
      expect(prisma.procedureTarget.create).toHaveBeenCalledTimes(1);
      const ce = prisma.chartEntry.create.mock.calls[0][0];
      expect(ce.data.type).toBe('PLANNED');
      expect(out.treatmentProcedure?.procedureName).toBe('Composite Filling');
      expect(out.treatmentPlan?.wasCreated).toBe(false);
    });

    it('PLAN_TREATMENT audits TreatmentProcedure + ChartEntry (and TreatmentPlan only if newly created)', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]);
      // ── Case A: an EXISTING active plan is reused → no TreatmentPlan audit.
      prisma.treatmentPlan.findFirst.mockResolvedValue({
        id: 'tp-existing', title: 'Plan A', patientId: 'p1', status: 'PLANNED',
      });
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Filling', code: 'D2391', basePrice: 100,
      });
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
      prisma.treatmentProcedure.create.mockResolvedValue({ id: 'proc-existing' });
      prisma.procedureTarget.create.mockResolvedValue({ id: 'tgt-x' });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-existing', createdAt: new Date(), updatedAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dentist-1',
        staff: { firstName: 'Ada', lastName: 'Lovelace' },
      });

      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 16, action: 'PLAN_TREATMENT',
          procedureCatalogId: 'cat1', surfaces: [],
        } as any,
        'user-dentist-1',
      );

      // 2 audit calls: TreatmentProcedure + ChartEntry. NO TreatmentPlan audit
      // (the plan was pre-existing — appending a procedure to it is a procedure
      // event, not a plan-creation event).
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
      const audits = prisma.auditLog.create.mock.calls.map((c) => c[0].data);
      const modules = audits.map((a: any) => `${a.module}/${a.entityType}`).sort();
      expect(modules).toEqual([
        'CHART_ENTRY/ChartEntry',
        'TREATMENT_PLANS/TreatmentProcedure',
      ]);
      for (const a of audits) {
        expect(a.action).toBe('CREATE');
        expect(a.userId).toBe('user-dentist-1');
        expect(a.userName).toBe('Ada Lovelace');
        expect(a.newData.via).toBe('quick-action:PLAN_TREATMENT');
      }
      const procAudit = audits.find((a: any) => a.entityType === 'TreatmentProcedure');
      expect(procAudit.recordId).toBe('proc-existing');
      const ceAudit = audits.find((a: any) => a.entityType === 'ChartEntry');
      expect(ceAudit.recordId).toBe('ce-existing');
    });

    it('PLAN_TREATMENT audits TreatmentPlan ONLY when a new one was created', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]);
      // No existing plan → resolveOrCreatePlan will create one.
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);
      // First call returns null (no existing plan); the service creates one
      // via tx.treatmentPlan.create; we stub that.
      prisma.treatmentPlan.create.mockResolvedValue({
        id: 'tp-new', title: 'New Plan', patientId: 'p1', status: 'PLANNED',
        estimatedCost: 0,
      });
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Filling', code: 'D2391', basePrice: 100,
      });
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
      prisma.treatmentProcedure.create.mockResolvedValue({ id: 'proc-new' });
      prisma.procedureTarget.create.mockResolvedValue({ id: 'tgt-new' });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-new', createdAt: new Date(), updatedAt: new Date() });
      // On-the-fly plan with no visit → dentistId resolves from the acting
      // user's own staff record (required-FK guard).
      prisma.staff.findUnique.mockResolvedValue({ id: 'staff-dentist' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dentist-2',
        staff: { firstName: 'Grace', lastName: 'Hopper' },
      });

      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 16, action: 'PLAN_TREATMENT',
          procedureCatalogId: 'cat1', surfaces: [],
        } as any,
        'user-dentist-2',
      );

      // 3 audit calls now: TreatmentPlan (NEW) + TreatmentProcedure + ChartEntry.
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
      const audits = prisma.auditLog.create.mock.calls.map((c) => c[0].data);
      const modules = audits.map((a: any) => `${a.module}/${a.entityType}`).sort();
      expect(modules).toEqual([
        'CHART_ENTRY/ChartEntry',
        'TREATMENT_PLANS/TreatmentPlan',
        'TREATMENT_PLANS/TreatmentProcedure',
      ]);
      const planAudit = audits.find((a: any) => a.entityType === 'TreatmentPlan');
      expect(planAudit.recordId).toBe('tp-new');
      expect(planAudit.newData.via).toBe('quick-action:PLAN_TREATMENT');
      expect(planAudit.userName).toBe('Grace Hopper');
    });

    it('PERFORM_NOW audits TreatmentProcedure + ProcedureSession + ChartEntry (and TreatmentPlan only if newly created)', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]);
      prisma.treatmentPlan.findFirst.mockResolvedValue({
        id: 'tp-existing', title: 'Plan A', patientId: 'p1', status: 'PLANNED',
      });
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Filling', code: 'D2391', basePrice: 100,
      });
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
      prisma.treatmentProcedure.create.mockResolvedValue({ id: 'proc-perf' });
      prisma.procedureTarget.create.mockResolvedValue({ id: 'tgt-perf' });
      prisma.procedureSession.create.mockResolvedValue({ id: 'ses-perf', sessionNumber: 1 });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-perf', createdAt: new Date(), updatedAt: new Date() });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dentist-3',
        staff: { firstName: 'Margaret', lastName: 'Hamilton' },
      });

      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 16, action: 'PERFORM_NOW',
          procedureCatalogId: 'cat1', surfaces: [],
        } as any,
        'user-dentist-3',
      );

      // 3 audit calls: TreatmentProcedure + ProcedureSession + ChartEntry.
      // NO TreatmentPlan audit (plan was pre-existing).
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
      const audits = prisma.auditLog.create.mock.calls.map((c) => c[0].data);
      const modules = audits.map((a: any) => `${a.module}/${a.entityType}`).sort();
      expect(modules).toEqual([
        'CHART_ENTRY/ChartEntry',
        'TREATMENT_PLANS/ProcedureSession',
        'TREATMENT_PLANS/TreatmentProcedure',
      ]);
      for (const a of audits) {
        expect(a.action).toBe('CREATE');
        expect(a.userId).toBe('user-dentist-3');
        expect(a.userName).toBe('Margaret Hamilton');
        expect(a.newData.via).toBe('quick-action:PERFORM_NOW');
      }
      const procAudit = audits.find((a: any) => a.entityType === 'TreatmentProcedure');
      expect(procAudit.recordId).toBe('proc-perf');
      const sesAudit = audits.find((a: any) => a.entityType === 'ProcedureSession');
      expect(sesAudit.recordId).toBe('ses-perf');
      const ceAudit = audits.find((a: any) => a.entityType === 'ChartEntry');
      expect(ceAudit.recordId).toBe('ce-perf');
      // ChartEntry audit must reference BOTH the procedure AND the session.
      expect(ceAudit.newData.treatmentProcedureId).toBe('proc-perf');
      expect(ceAudit.newData.procedureSessionId).toBe('ses-perf');
    });

    it('PERFORM_NOW audits the TreatmentPlan when it had to be created on the fly', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]);
      prisma.treatmentPlan.findFirst.mockResolvedValue(null);
      prisma.treatmentPlan.create.mockResolvedValue({
        id: 'tp-perf-new', title: 'Auto Plan', patientId: 'p1', status: 'PLANNED',
      });
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Filling', code: 'D2391', basePrice: 100,
      });
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
      prisma.treatmentProcedure.create.mockResolvedValue({ id: 'proc-perf2' });
      prisma.procedureTarget.create.mockResolvedValue({ id: 'tgt-perf2' });
      prisma.procedureSession.create.mockResolvedValue({ id: 'ses-perf2', sessionNumber: 1 });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-perf2', createdAt: new Date(), updatedAt: new Date() });
      // On-the-fly plan with no visit → dentistId resolves from the acting
      // user's own staff record (required-FK guard).
      prisma.staff.findUnique.mockResolvedValue({ id: 'staff-dentist' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-dentist-4',
        staff: { firstName: 'Edsger', lastName: 'Dijkstra' },
      });

      await service.executeQuickAction(
        {
          patientId: 'p1', toothNumber: 16, action: 'PERFORM_NOW',
          procedureCatalogId: 'cat1', surfaces: [],
        } as any,
        'user-dentist-4',
      );

      // 4 audit calls: TreatmentPlan (NEW) + TreatmentProcedure + ProcedureSession + ChartEntry.
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(4);
      const audits = prisma.auditLog.create.mock.calls.map((c) => c[0].data);
      const planAudit = audits.find((a: any) => a.entityType === 'TreatmentPlan');
      expect(planAudit).toBeDefined();
      expect(planAudit.recordId).toBe('tp-perf-new');
      expect(planAudit.newData.via).toBe('quick-action:PERFORM_NOW');
      expect(planAudit.userName).toBe('Edsger Dijkstra');
    });

    it('rejects an on-the-fly plan when no dentist can be resolved (400, not a raw FK crash)', async () => {
      prisma.chartEntry.findMany.mockResolvedValue([]);
      prisma.treatmentPlan.findFirst.mockResolvedValue(null); // no active plan
      prisma.procedure.findUnique.mockResolvedValue({
        id: 'cat1', name: 'Filling', code: 'D2391', basePrice: 100,
      });
      // No visit dentist and the actor has no staff record → unresolvable.
      prisma.staff.findUnique.mockResolvedValue(null);

      await expect(
        service.executeQuickAction(
          {
            patientId: 'p1', toothNumber: 16, action: 'PLAN_TREATMENT',
            procedureCatalogId: 'cat1', surfaces: [],
          } as any,
          'user-no-staff',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      // The plan must NOT be created when the dentist can't be resolved.
      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
    });
  });

  describe('addExistingProcedure', () => {
    it('creates an EXISTING entry', async () => {
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1' });
      await service.addExistingProcedure({
        patientId: 'p1', toothNumber: 11, surfaces: [], procedureName: 'Old crown', procedureCode: 'X',
      } as any);
      const arg = prisma.chartEntry.create.mock.calls[0][0];
      expect(arg.data.type).toBe('EXISTING');
    });
  });
});
