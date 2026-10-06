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
    // Re-pricing goes through the engine (server-authoritative).
    prisma.procedure.findUnique.mockResolvedValue({
      id: 'cat1',
      basePrice: 100,
      baseCost: 10,
      pricingModel: 'FIXED',
      priceRangeMin: null,
      priceRangeMax: null,
      currency: 'UGX',
    });
    plans.priceProcedure.mockResolvedValue({
      totalPrice: 100,
      pricePerUnit: 100,
      quantity: 1,
      subtotalPrice: 100,
      discountAmount: 0,
      taxAmount: 0,
      subtotalCost: 10,
      costPerUnit: 10,
      exchangeRate: 1,
    });
    invoiceLifecycle.updateProcedureItemPricingTx.mockResolvedValue({
      invoiceId: 'inv1',
      invoiceStatus: 'DRAFT',
      created: false,
    });
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
          isPriceOverridden: true,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      // billingType: substantive clinical field, requires editReason
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', {
          billingType: 'PAY_PARTIALLY',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no longer blocks a clinical note on a procedure whose stale paymentStatus column says PAID', async () => {
      // Payments live on invoices; TreatmentProcedure.paymentStatus is never
      // written, so the old block on it was dead (or wrong on legacy rows).
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        paymentStatus: 'PAID',
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', notes: 'x', targets: [], sessions: [],
      });
      const r = await service.updateProcedureWithGuards('pl1', 'pr1', { notes: 'x' } as any);
      expect(r.audited).toBe(true);
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
        status: 'IN_PROGRESS',
        _count: { sessions: 1 },
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'ON_HOLD',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'ON_HOLD' } as any,
        'user-1',
      );
      expect(r.audited).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.newData.status).toBe('ON_HOLD');
    });

    it('re-syncs linked conditions and recalculates the plan when status changes', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'IN_PROGRESS' });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        status: 'ON_HOLD',
        targets: [],
        sessions: [],
      });
      plans.recalculatePlanTx.mockResolvedValue({
        status: 'IN_PROGRESS',
        estimatedCost: 0,
        completionPercentage: 0,
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'ON_HOLD', performedDate: '2026-06-19T10:00:00Z' } as any,
        'user-1',
      );
      expect(plans.syncConditionsForProcedureTx).toHaveBeenCalledWith(
        prisma,
        'pr1',
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
    it('persists an override total as a discount and syncs the invoice line in the same tx', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1',
        targets: [],
        sessions: [],
        procedure: { id: 'cat1', name: 'Composite Filling', code: 'D2391' },
        totalPrice: 80,
        currency: 'UGX',
        quantity: 1,
        pricePerUnit: 100,
        discountAmount: 20,
        taxAmount: 0,
        baseAmount: 80,
      });

      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { totalPrice: 80, isPriceOverridden: true, discountAmount: 999, baseAmount: 1 } as any,
        'user-1',
      );

      const data = prisma.treatmentProcedure.update.mock.calls[0][0].data;
      expect(data.totalPrice).toBe(80);
      // Discount is engine total − override; client figures are ignored.
      expect(data.discountAmount).toBe(20);
      expect(data.baseAmount).toBe(80);
      expect(invoiceLifecycle.updateProcedureItemPricingTx).toHaveBeenCalledTimes(1);
      expect(r.invoiceSync?.invoiceId).toBe('inv1');
      expect(r.audited).toBe(true);
    });

    it('ignores a bare totalPrice and an unchanged currency (no pricing edit)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', notes: 'n', targets: [], sessions: [],
      });
      await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { notes: 'n', totalPrice: 5, currency: 'UGX', exchangeRate: 3700 } as any,
        'user-1',
      );
      // No invoice lookup → the paid/POSTED pricing guard never fires.
      expect(prisma.invoiceItem.findFirst).not.toHaveBeenCalled();
      expect(invoiceLifecycle.updateProcedureItemPricingTx).not.toHaveBeenCalled();
    });

    it('rejects a currency change', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(baseTp);
      await expect(
        service.updateProcedureWithGuards('pl1', 'pr1', { currency: 'USD' } as any, 'user-1'),
      ).rejects.toThrow(/catalogue currency/);
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
          { totalPrice: 999, isPriceOverridden: true } as any, 'user-1',
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
          { totalPrice: 999, isPriceOverridden: true } as any, 'user-1',
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
      const r = await service.updateProcedureWithGuards(
        'pl1', 'pr1', { totalPrice: 250, isPriceOverridden: true } as any, 'user-1',
      );
      expect(r.audited).toBe(true);
      expect(invoiceLifecycle.updateProcedureItemPricingTx).toHaveBeenCalled();
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
      expect(invoiceLifecycle.updateProcedureItemPricingTx).not.toHaveBeenCalled();
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
        status: 'ON_HOLD',
        targets: [],
        sessions: [],
      });
      const r = await service.updateProcedureWithGuards(
        'pl1',
        'pr1',
        { status: 'ON_HOLD' } as any,
        'user-1',
      );
      expect(r.audited).toBe(true);
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.newData.status).toBe('ON_HOLD');
      expect(auditCall.data.reason).toMatch(
        /Routine status flip: PLANNED → ON_HOLD/,
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

    // ── Status transition validation — clinical statuses follow sessions ──
    it('blocks a manual PLANNED → IN_PROGRESS (derived from recorded sessions)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'PLANNED' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { status: 'IN_PROGRESS' } as any, 'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('blocks a manual IN_PROGRESS → COMPLETED (completion goes through the final session)', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({ ...baseTp, status: 'IN_PROGRESS' });
      await expect(
        service.updateProcedureWithGuards(
          'pl1', 'pr1', { status: 'COMPLETED' } as any, 'user-1',
        ),
      ).rejects.toThrow(/final session/);
      expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
    });

    it('resuming from ON_HOLD derives the status from the sessions', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue({
        ...baseTp,
        status: 'ON_HOLD',
        _count: { sessions: 1 },
        sessions: [
          { id: 's1', status: 'COMPLETED', isFinal: false, deletedAt: null, sessionNumber: 1, performedDate: null },
        ],
      });
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', status: 'IN_PROGRESS', targets: [], sessions: [],
      });
      // The client asks for PLANNED; one session is already done, so the
      // procedure is really IN_PROGRESS.
      await service.updateProcedureWithGuards(
        'pl1', 'pr1', { status: 'PLANNED' } as any, 'user-1',
      );
      const updateCall = prisma.treatmentProcedure.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('IN_PROGRESS');
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
        status: 'PLANNED', targets: [], sessions: [],
      });
      await expect(
        service.restoreCancelledProcedure('pl1', 'pr1', 'mistake'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    const cancelledTp = (over: Record<string, unknown> = {}) => ({
      id: 'pr1',
      status: 'CANCELLED',
      cancellationReason: 'patient declined',
      targets: [{ toothNumber: 16 }, { toothNumber: 26 }],
      sessions: [],
      ...over,
    });

    it('restores PLANNED markers the cancel superseded (one per current tooth), re-bills and audits', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(cancelledTp());
      prisma.chartEntry.findMany
        // candidates superseded by the cancel (newest first)
        .mockResolvedValueOnce([
          { id: 'ce16-new', toothNumber: 16 },
          { id: 'ce26', toothNumber: 26 },
          { id: 'ce16-old', toothNumber: 16 }, // older duplicate → skipped
          { id: 'ce11', toothNumber: 11 }, // tooth no longer targeted → skipped
        ])
        // live COMPLETED rows
        .mockResolvedValueOnce([]);
      prisma.conditionProcedureLink.findMany
        .mockResolvedValueOnce([{ id: 'l1', patientConditionId: 'pc1' }])
        .mockResolvedValueOnce([]);
      prisma.treatmentProcedure.update.mockResolvedValue({
        id: 'pr1', status: 'PLANNED', targets: [], sessions: [],
      });
      invoiceLifecycle.reinstateProcedureBillingTx.mockResolvedValue({
        invoiceId: 'inv1', reinstated: true, needsNewItem: false,
      });

      const r = await service.restoreCancelledProcedure(
        'pl1', 'pr1', 'patient changed mind', 'user-1',
      );

      expect(prisma.chartEntry.findMany.mock.calls[0][0].where).toMatchObject({
        treatmentProcedureId: 'pr1',
        type: 'PLANNED',
        status: 'SUPERSEDED',
        notes: { startsWith: 'Cancelled:' },
      });
      expect(prisma.chartEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['ce16-new', 'ce26'] }, status: 'SUPERSEDED' },
        }),
      );
      expect(prisma.conditionProcedureLink.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { deletedAt: null, unlinkedById: null, deletedReason: null },
      });
      expect(prisma.treatmentProcedure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pr1' },
          data: expect.objectContaining({ status: 'PLANNED', cancellationReason: null }),
        }),
      );
      expect(invoiceLifecycle.reinstateProcedureBillingTx).toHaveBeenCalledWith(prisma, 'pr1', 'user-1');
      expect(plans.syncConditionsForProcedureTx).toHaveBeenCalledWith(prisma, 'pr1', 'user-1');
      expect(plans.recalculatePlanTx).toHaveBeenCalledWith(prisma, 'pl1');
      expect(plans.billProcedureSafe).not.toHaveBeenCalled();

      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.action).toBe('RESTORE');
      expect(auditCall.data.oldData.status).toBe('CANCELLED');
      expect(auditCall.data.newData.status).toBe('PLANNED');
      expect(r.chartEntriesRestored).toBe(2);
    });

    it('resumes IN_PROGRESS when sessions were completed and skips teeth already treated', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(
        cancelledTp({
          sessions: [{ id: 's1', status: 'COMPLETED', isFinal: false, deletedAt: null }],
        }),
      );
      prisma.chartEntry.findMany
        .mockResolvedValueOnce([
          { id: 'ce16', toothNumber: 16 },
          { id: 'ce26', toothNumber: 26 },
        ])
        .mockResolvedValueOnce([{ toothNumber: 16 }]); // 16 already done
      prisma.conditionProcedureLink.findMany.mockResolvedValue([]);
      prisma.treatmentProcedure.update.mockResolvedValue({ id: 'pr1', status: 'IN_PROGRESS' });
      invoiceLifecycle.reinstateProcedureBillingTx.mockResolvedValue({
        invoiceId: 'inv1', reinstated: true, needsNewItem: false,
      });

      await service.restoreCancelledProcedure('pl1', 'pr1', 'resume', 'user-1');

      expect(prisma.chartEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['ce26'] }, status: 'SUPERSEDED' } }),
      );
      expect(prisma.treatmentProcedure.update.mock.calls[0][0].data.status).toBe('IN_PROGRESS');
    });

    it('bills afresh after commit when no invoice line can be reinstated', async () => {
      prisma.treatmentProcedure.findFirst.mockResolvedValue(cancelledTp());
      prisma.chartEntry.findMany.mockResolvedValue([]);
      prisma.conditionProcedureLink.findMany.mockResolvedValue([]);
      prisma.treatmentProcedure.update.mockResolvedValue({ id: 'pr1', status: 'PLANNED' });
      invoiceLifecycle.reinstateProcedureBillingTx.mockResolvedValue({
        invoiceId: null, reinstated: false, needsNewItem: true,
      });
      plans.billProcedureSafe.mockResolvedValue(true);

      const r = await service.restoreCancelledProcedure('pl1', 'pr1', 'resume', 'user-1');

      expect(plans.billProcedureSafe).toHaveBeenCalledWith('pr1');
      expect(r.billing.billedNow).toBe(true);
    });
  });
});
