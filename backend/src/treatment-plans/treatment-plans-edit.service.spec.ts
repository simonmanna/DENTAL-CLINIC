import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TreatmentPlansEditService } from './treatment-plans-edit.service';
import {
  createPrismaMock,
  createAutoMock,
  PrismaMock,
} from '../test-utils/prisma-mock';

describe('TreatmentPlansEditService', () => {
  let service: TreatmentPlansEditService;
  let prisma: PrismaMock;
  let plans: any;
  let invoiceLifecycle: any;

  beforeEach(() => {
    prisma = createPrismaMock();
    plans = createAutoMock();
    invoiceLifecycle = createAutoMock();
    service = new TreatmentPlansEditService(prisma, plans, invoiceLifecycle);
  });

  // ── checkProcedureDeleteEligibility ──────────────────────────────────────────
  describe('checkProcedureDeleteEligibility', () => {
    it('throws when the procedure is not in the plan', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
      await expect(
        service.checkProcedureDeleteEligibility('pl1', 'pr1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks hard delete (allows cancel) when sessions exist', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1',
        status: 'IN_PROGRESS',
        paymentStatus: 'UNPAID',
        _count: { sessions: 2 },
      });
      const r = await service.checkProcedureDeleteEligibility('pl1', 'pr1');
      expect(r.canDelete).toBe(false);
      expect(r.canCancel).toBe(true);
      expect(r.sessionsCount).toBe(2);
    });

    it('blocks hard delete when the linked invoice is POSTED', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1',
        status: 'PLANNED',
        paymentStatus: 'PAID',
        _count: { sessions: 0 },
        invoiceItems: [
          {
            invoice: {
              id: 'inv1',
              status: 'POSTED',
              paymentStatus: 'PAID',
              amountPaid: 100,
            },
          },
        ],
      });
      const r = await service.checkProcedureDeleteEligibility('pl1', 'pr1');
      expect(r.canDelete).toBe(false);
    });

    // The delete gate is invoice-based, not payment-status based: a procedure
    // whose paymentStatus is PAID but has no POSTED invoice can still be
    // soft-deleted (linked DRAFT items are voided but preserved for audit).
    it('allows delete of a PAID procedure with no POSTED invoice', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1',
        status: 'PLANNED',
        paymentStatus: 'PAID',
        _count: { sessions: 0 },
      });
      const r = await service.checkProcedureDeleteEligibility('pl1', 'pr1');
      expect(r.canDelete).toBe(true);
    });

    it('blocks everything when already cancelled', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1',
        status: 'CANCELLED',
        paymentStatus: 'UNPAID',
        _count: { sessions: 0 },
      });
      const r = await service.checkProcedureDeleteEligibility('pl1', 'pr1');
      expect(r.canDelete).toBe(false);
      expect(r.canCancel).toBe(false);
    });

    it('allows delete + cancel for a clean planned procedure', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1',
        status: 'PLANNED',
        paymentStatus: 'UNPAID',
        _count: { sessions: 0 },
      });
      const r = await service.checkProcedureDeleteEligibility('pl1', 'pr1');
      expect(r.canDelete).toBe(true);
      expect(r.canCancel).toBe(true);
    });
  });

  // ── updateProcedureWithGuards ────────────────────────────────────────────────
  describe('updateProcedureWithGuards', () => {
    const baseTp = {
      id: 'pr1',
      status: 'PLANNED',
      paymentStatus: 'UNPAID',
      notes: 'old',
      providerId: null,
      targets: [],
      _count: { sessions: 0 },
      sessions: [], // empty by default; tests that need sessions override
      treatmentPlan: { patientId: 'p1' },
      procedure: { name: 'P', code: 'C' },
      performedDate: null,
      completedAt: null,
      performedNotes: null,
      actualInputsUsed: null,
      sequence: 0,
      visitGroup: 1,
      scheduledDate: null,
      billingType: 'PAY_FULL',
      sessionType: 'SINGLE',
      sessionCount: 1,
      currency: 'UGX',
      exchangeRate: null,
      totalPrice: 100,
      pricePerUnit: 100,
      quantity: 1,
      discountAmount: 0,
      taxAmount: 0,
      baseAmount: 100,
    };

    it('refuses to edit a cancelled procedure', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        status: 'CANCELLED',
      });
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', { notes: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does NOT require editReason for routine note touch-ups even with sessions', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        _count: { sessions: 1 },
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        notes: 'x',
        targets: [],
        sessions: [],
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1',
          'pr1',
          { notes: 'x' } as any,
          'user-1',
        ),
      ).resolves.toBeDefined();
    });

    it('requires an editReason for substantive clinical edits once sessions exist', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        _count: { sessions: 1 },
      });
      // surfaces with sessions → now blocked by the spec-violation guard (409)
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', {
          surfaces: ['OCCLUSAL'],
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      // sequence: substantive clinical field, requires editReason (400)
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', { sequence: 2 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      // pricing: substantive clinical field, requires editReason
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', {
          totalPrice: 999,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      // billingType: substantive clinical field, requires editReason
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', {
          billingType: 'PAY_PARTIALLY',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks any edit on a fully-paid procedure', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        paymentStatus: 'PAID',
      });
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', { notes: 'x' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates notes and writes an audit row on a clean procedure', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        notes: 'new',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { notes: 'new' } as any,
        'user-1',
      );
      expect(r.audited).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('THROWS ConflictException when toothNumbers change on a procedure that already has sessions (E1 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        _count: { sessions: 1 },
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1',
          'pr1',
          { toothNumbers: [21], editReason: 'corrected' } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.procedureTarget.deleteMany).not.toHaveBeenCalled();
      expect(prisma.procedureTarget.updateMany).not.toHaveBeenCalled();
    });

    it('blocks surface change when sessions exist (spec: surfaces locked after clinical start)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        _count: { sessions: 1 },
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1',
          'pr1',
          { surfaces: ['OCCLUSAL'], editReason: 'correction' } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.procedureTarget.updateMany).not.toHaveBeenCalled();
      expect(prisma.procedureTarget.deleteMany).not.toHaveBeenCalled();
    });

    it('allows a routine status flip (no editReason) even with sessions and audits it', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        _count: { sessions: 1 },
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'IN_PROGRESS',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'IN_PROGRESS' } as any,
        'user-1',
      );
      expect(r.audited).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.newData.status).toBe('IN_PROGRESS');
    });

    it('recalculates the plan when status changes', async () => {
      // Walk the legal PLANNED → IN_PROGRESS → COMPLETED path.
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'IN_PROGRESS' });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'COMPLETED',
        targets: [],
        sessions: [],
      });
      plans.recalculatePlanTx.mockResolvedValue({
        status: 'COMPLETED',
        estimatedCost: 0,
        completionPercentage: 100,
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'COMPLETED', performedDate: '2026-06-19T10:00:00Z' } as any,
        'user-1',
      );
      expect(plans.recalculatePlanTx).toHaveBeenCalledTimes(1);
      // performedDate was coerced to a Date
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.performedDate).toBeInstanceOf(Date);
    });

    it('does not recalculate the plan when status is unchanged', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        status: 'PLANNED',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'PLANNED',
        targets: [],
        sessions: [],
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { notes: 'touch-up' } as any,
        'user-1',
      );
      expect(plans.recalculatePlanTx).not.toHaveBeenCalled();
    });

    it('persists performedDate / completedAt / performedNotes / actualInputsUsed', async () => {
      // Completed sessions exist — required by the E6 completedAt guard.
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        sessions: [
          {
            id: 's1',
            status: 'COMPLETED',
            sessionNumber: 1,
            performedDate: new Date('2026-06-19T10:30:00Z'),
          },
        ],
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        targets: [],
        sessions: [],
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        {
          performedDate: '2026-06-19T10:00:00Z',
          completedAt: '2026-06-19T11:00:00Z',
          performedNotes: 'Done with no complications.',
          actualInputsUsed: { anesthetic: 'lidocaine-2%', units: 1 },
        } as any,
        'user-1',
      );
      const data = prisma.treatmentProcedure.update.mock.calls[0][0].data;
      expect(data.performedDate).toBeInstanceOf(Date);
      expect(data.completedAt).toBeInstanceOf(Date);
      expect(data.performedNotes).toBe('Done with no complications.');
      expect(data.actualInputsUsed).toEqual({
        anesthetic: 'lidocaine-2%',
        units: 1,
      });
    });

    // ── E5 — totalPrice editing ────────────────────────────────────────────
    it('persists totalPrice and syncs the linked invoice item (E5 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        targets: [],
        sessions: [],
        procedure: { id: 'cat1', name: 'Composite Filling', code: 'D2391' },
        totalPrice: 250,
        currency: 'UGX',
        quantity: 1,
        pricePerUnit: 250,
        discountAmount: 0,
        taxAmount: 0,
      });
      invoiceLifecycle.updateProcedureItemPricing.mockResolvedValue({
        invoiceId: 'inv1',
        invoiceStatus: 'DRAFT',
        created: false,
      });

      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { totalPrice: 250 } as any,
        'user-1',
      );

      // Field was persisted
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.totalPrice).toBe(250);

      // Invoice was synced
      expect(invoiceLifecycle.updateProcedureItemPricing).toHaveBeenCalledTimes(
        1,
      );
      expect(r.invoiceSync?.invoiceId).toBe('inv1');
      expect(r.audited).toBe(true);
    });

    // ── Pre-TX invoice guard — blocks the whole edit when pricing changes
//     are requested on a POSTED or partially-paid invoice.
    it('refuses pricing edits when the linked invoice is POSTED (pre-TX guard)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.invoiceItem.findFirst.mockResolvedValue({
        invoiceId: 'inv1',
        invoice: {
          id: 'inv1',
          status: 'POSTED',
          paymentStatus: 'UNPAID',
          amountPaid: 0,
        },
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1',
          { totalPrice: 999 } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('refuses pricing edits when the invoice has payments (pre-TX guard)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.invoiceItem.findFirst.mockResolvedValue({
        invoiceId: 'inv1',
        invoice: {
          id: 'inv1',
          status: 'DRAFT',
          paymentStatus: 'PARTIALLY_PAID',
          amountPaid: 500,
        },
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1',
          { totalPrice: 999 } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('allows pricing edits when the invoice is DRAFT with no payments', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.invoiceItem.findFirst.mockResolvedValue({
        invoiceId: 'inv1',
        invoice: {
          id: 'inv1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          amountPaid: 0,
        },
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', targets: [], sessions: [],
      });
      invoiceLifecycle.updateProcedureItemPricing.mockResolvedValue({
        invoiceId: 'inv1', invoiceStatus: 'DRAFT', created: false,
      });
      const r = await service.updateProcedureWithGuards(
        'pl1', 'pr1', { totalPrice: 250 } as any, 'user-1',
      );
      expect(r.audited).toBe(true);
      expect(invoiceLifecycle.updateProcedureItemPricing).toHaveBeenCalled();
    });

    it('allows non-pricing edits even when invoice is POSTED (only pricing fields are guarded)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.invoiceItem.findFirst.mockResolvedValue({
        invoiceId: 'inv1',
        invoice: {
          id: 'inv1',
          status: 'POSTED',
          paymentStatus: 'UNPAID',
          amountPaid: 0,
        },
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', notes: 'new', targets: [], sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1', 'pr1', { notes: 'tweak' } as any, 'user-1',
      );
      expect(r.audited).toBe(true);
      expect(invoiceLifecycle.updateProcedureItemPricing).not.toHaveBeenCalled();
    });

    // ── E7 — billingType is now persisted ──────────────────────────────────
    it('persists billingType changes (E7 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        billingType: 'PAY_FULL',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        billingType: 'PAY_PARTIALLY',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { billingType: 'PAY_PARTIALLY' } as any,
        'user-1',
      );
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.billingType).toBe('PAY_PARTIALLY');
      expect(r.audited).toBe(true);
    });

    // ── sessionType / sessionCount editing ─────────────────────────────────
    it('persists sessionType and sessionCount changes', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        targets: [],
        sessions: [],
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { sessionType: 'MULTI', sessionCount: 3 } as any,
        'user-1',
      );
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.sessionType).toBe('MULTI');
      expect(updateCall.data.sessionCount).toBe(3);
    });

    // ── linkedConditionIds replace-all ─────────────────────────────────────
    it('replaces linked conditions atomically when linkedConditionIds is provided', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      // Single in-tx read of current active links
      prisma.conditionProcedureLink.findMany.mockResolvedValueOnce([
        { id: 'link-old', patientConditionId: 'pc-old' },
      ]);
      prisma.conditionProcedureLink.updateMany.mockResolvedValue({ count: 1 });
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc-new',
        patientId: 'p1',
        deletedAt: null,
        condition: { name: 'Caries', icd10Code: 'K02.9' },
        status: 'ACTIVE',
      });
      prisma.conditionProcedureLink.create.mockResolvedValue({});
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        targets: [],
        sessions: [],
      });

      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { linkedConditionIds: ['pc-new'] } as any,
        'user-1',
      );

      expect(prisma.conditionProcedureLink.updateMany).toHaveBeenCalledTimes(1); // soft-delete old
      expect(prisma.conditionProcedureLink.create).toHaveBeenCalledTimes(1); // create new
    });

    // ── E4 — routine status flip always audited ────────────────────────────
    it('always audits a routine status flip with auto-generated reason (E4 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        status: 'PLANNED',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'IN_PROGRESS',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'IN_PROGRESS' } as any,
        'user-1',
      );
      expect(r.audited).toBe(true);
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.newData.status).toBe('IN_PROGRESS');
      expect(auditCall.data.reason).toMatch(
        /Routine status flip: PLANNED → IN_PROGRESS/,
      );
    });

    // ── E2 — no-op edit is silent ─────────────────────────────────────────
    it('does NOT write an audit row when the edit is a no-op (E2 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        notes: 'same',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        notes: 'same',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { notes: 'same' } as any,
        'user-1',
      );
      expect(r.audited).toBe(false);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    // ── E6 — completedAt without COMPLETED session is rejected ────────────
    it('rejects completedAt when no session is COMPLETED (E6 fix)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        sessions: [
          {
            id: 's1',
            status: 'PENDING',
            sessionNumber: 1,
            performedDate: null,
          },
        ],
      });
      await expect(
        service.updateProcedureWithGuards(
          'pl1',
          'pr1',
          { completedAt: '2026-06-19T11:00:00Z' } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ── Status transition validation (PLANNED → IN_PROGRESS → COMPLETED) ──
    it('allows PLANNED → IN_PROGRESS', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'PLANNED' });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', status: 'IN_PROGRESS', targets: [], sessions: [],
      });
      plans.recalculatePlanTx.mockResolvedValue({ status: 'IN_PROGRESS', estimatedCost: 0, completionPercentage: 0 });
      const r = await service.updateProcedureWithGuards(
        'pl1', 'pr1', { status: 'IN_PROGRESS' } as any, 'user-1',
      );
      expect(r.audited).toBe(true);
    });

    it('blocks PLANNED → COMPLETED (must go through IN_PROGRESS)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'PLANNED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { status: 'COMPLETED' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('blocks COMPLETED → PLANNED (read-only)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'COMPLETED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { status: 'PLANNED' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('blocks COMPLETED → IN_PROGRESS (read-only)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'COMPLETED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { status: 'IN_PROGRESS' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ── COMPLETED: only notes/performedNotes/actualInputsUsed editable ─────
    it('COMPLETED: only notes change is allowed (append-only)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp, status: 'COMPLETED', notes: 'old clinical note',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', notes: 'appended', targets: [], sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1', 'pr1', { notes: 'new addition' } as any, 'user-1',
      );
      expect(r.audited).toBe(true);
      // Notes should be APPENDED, not replaced
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.notes).toMatch(/^old clinical note\n\n— \[append/);
      expect(updateCall.data.notes).toMatch(/new addition$/);
    });

    it('COMPLETED: rejects any field change other than notes/performedNotes', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'COMPLETED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { providerId: 'staff-2' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { totalPrice: 999 } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { billingType: 'PAY_PARTIALLY' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // ── Surfaces lock when sessions exist (IN_PROGRESS or COMPLETED) ─────
    it('blocks surface change when sessions exist (spec: in-progress surfaces are locked)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp, _count: { sessions: 1 },
        status: 'IN_PROGRESS',
        editReason: 'reason',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({ id: 'pr1', targets: [], sessions: [] });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1',
          { surfaces: ['MESIAL'], editReason: 'correction' } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.procedureTarget.updateMany).not.toHaveBeenCalled();
    });

    // ── CANCELLED: completely locked ─────────────────────────────────────
    it('blocks all edits on CANCELLED (use restore endpoint)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'CANCELLED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { notes: 'tweak' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });
  });

  // ── restoreCancelledProcedure ────────────────────────────────────────────────
  describe('restoreCancelledProcedure', () => {
    it('requires a reason', async () => {
      await expect(
        service.restoreCancelledProcedure('pl1', 'pr1', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to restore a non-CANCELLED procedure', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        status: 'PLANNED', chartEntries: [], sessions: [],
      });
      await expect(
        service.restoreCancelledProcedure('pl1', 'pr1', 'mistake'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('restores: status → PLANNED, chart entries re-activated, audited', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        id: 'pr1', status: 'CANCELLED',
        chartEntries: [{ id: 'ce1' }, { id: 'ce2' }],
        sessions: [], cancellationReason: 'patient declined',
      });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 2 });
      prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 100 } });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', status: 'PLANNED', targets: [], sessions: [],
      });

      const r = await service.restoreCancelledProcedure(
        'pl1', 'pr1', 'patient changed mind', 'user-1',
      );
      expect(prisma.chartEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'SUPERSEDED' }),
        }),
      );
      expect(prisma.treatmentProcedure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pr1' },
          data: expect.objectContaining({
            status: 'PLANNED',
            cancellationReason: null,
          }),
        }),
      );
      // Audit row written as RESTORE
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.action).toBe('RESTORE');
      expect(auditCall.data.oldData.status).toBe('CANCELLED');
      expect(auditCall.data.newData.status).toBe('PLANNED');
      expect(r.chartEntriesRestored).toBe(2);
    });
  });
});
