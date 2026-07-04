import { TreatmentPlansService } from './treatment-plans.service';
import { ConditionsService } from '../conditions/conditions.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

const mockConditionsService = () =>
  ({
    applyConditionLifecycleTx: jest.fn(),
  }) as unknown as ConditionsService;

// The main treatment-plans service is a large orchestration layer; its
// procedure edit/cancel/delete guard logic is unit-tested in depth in
// treatment-plans-edit.service.spec.ts. This suite verifies the service wires
// up with its dependencies (Prisma + invoice lifecycle + document numbering).
describe('TreatmentPlansService', () => {
  it('constructs with its injected dependencies', () => {
    const service = new TreatmentPlansService(
      createPrismaMock(),
      createAutoMock(),
      createAutoMock(),
      mockConditionsService(),
    );
    expect(service).toBeDefined();
  });
});

// ── Condition lifecycle: delegates to ConditionsService.applyConditionLifecycleTx ──
describe('TreatmentPlansService.syncConditionsForProcedureTx', () => {
  const build = () => {
    const prisma = createPrismaMock();
    const conditionsService = mockConditionsService();
    const service = new TreatmentPlansService(
      prisma,
      createAutoMock(),
      createAutoMock(),
      conditionsService,
    );
    return { prisma, conditionsService, service };
  };

  it('calls applyConditionLifecycleTx for each linked condition on COMPLETED', async () => {
    const { prisma, conditionsService, service } = build();
    prisma.treatmentProcedure.findUnique.mockResolvedValue({
      status: 'COMPLETED',
    });
    prisma.conditionProcedureLink.findMany.mockResolvedValue([
      { patientConditionId: 'pc1' },
      { patientConditionId: 'pc2' },
    ]);
    (
      conditionsService.applyConditionLifecycleTx as jest.Mock
    ).mockResolvedValue(undefined);

    await (service as any).syncConditionsForProcedureTx(
      prisma,
      'proc1',
      'user-1',
    );

    expect(conditionsService.applyConditionLifecycleTx).toHaveBeenCalledTimes(
      2,
    );
    expect(conditionsService.applyConditionLifecycleTx).toHaveBeenCalledWith(
      prisma,
      'pc1',
      'user-1',
    );
    expect(conditionsService.applyConditionLifecycleTx).toHaveBeenCalledWith(
      prisma,
      'pc2',
      'user-1',
    );
  });

  it('calls applyConditionLifecycleTx for reversal (procedure not COMPLETED)', async () => {
    const { prisma, conditionsService, service } = build();
    prisma.treatmentProcedure.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
    });
    prisma.conditionProcedureLink.findMany.mockResolvedValue([
      { patientConditionId: 'pc1' },
    ]);
    (
      conditionsService.applyConditionLifecycleTx as jest.Mock
    ).mockResolvedValue(undefined);

    await (service as any).syncConditionsForProcedureTx(
      prisma,
      'proc1',
      'user-1',
    );

    expect(conditionsService.applyConditionLifecycleTx).toHaveBeenCalledWith(
      prisma,
      'pc1',
      'user-1',
    );
  });

  it('is a no-op when the procedure has no linked conditions', async () => {
    const { prisma, conditionsService, service } = build();
    prisma.treatmentProcedure.findUnique.mockResolvedValue({
      status: 'COMPLETED',
    });
    prisma.conditionProcedureLink.findMany.mockResolvedValue([]);

    await (service as any).syncConditionsForProcedureTx(prisma, 'proc1');

    expect(conditionsService.applyConditionLifecycleTx).not.toHaveBeenCalled();
  });
});

// ── removeProcedure — spec rules for Delete Treatment Procedure ────────
// ✅ status must be PLANNED
// ✅ no sessions
// ✅ no payments
// ✅ linked invoice (if any) must not be POSTED and must have no payments
describe('TreatmentPlansService.removeProcedure', () => {
  const buildBase = () => ({
    id: 'tp1',
    treatmentPlanId: 'pl1',
    procedureId: 'cat1',
    status: 'PLANNED',
    paymentStatus: 'OPEN',
    totalPrice: 100,
    currency: 'UGX',
    targets: [{ id: 't1', toothNumber: 11, surfaces: [] }],
    sessions: [],
    chartEntries: [{ id: 'ce1' }],
    _count: { sessions: 0 },
    procedure: { id: 'cat1', name: 'Root Canal', code: 'D3330' },
    invoiceItems: [], // no linked invoice
  });

  const buildService = () => {
    const prisma = createPrismaMock();
    const invoiceLifecycle = createAutoMock();
    const docNum = createAutoMock();
    const conditionsService = mockConditionsService();
    const service = new TreatmentPlansService(
      prisma,
      invoiceLifecycle as any,
      docNum as any,
      conditionsService,
    );
    return { prisma, service, invoiceLifecycle };
  };

  it('refuses to delete a COMPLETED procedure (status rule)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      status: 'COMPLETED',
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/Only PLANNED procedures can be deleted/);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete an IN_PROGRESS procedure (status rule)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      status: 'IN_PROGRESS',
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/Only PLANNED procedures can be deleted/);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a CANCELLED procedure (use restore, not delete)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      status: 'CANCELLED',
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/CANCELLED.*restore/i);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete when sessions exist (clinical history)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      _count: { sessions: 1 },
      sessions: [{ id: 's1', status: 'COMPLETED' }],
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/recorded session/i);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a PAID procedure', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      paymentStatus: 'PAID',
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/paid/i);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete when the linked invoice is POSTED (already billed to GL)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      invoiceItems: [
        {
          invoice: {
            id: 'inv1',
            status: 'POSTED',
            paymentStatus: 'UNPAID',
            amountPaid: 0,
          },
        },
      ],
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/POSTED/);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete when the linked invoice has partial payments', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      invoiceItems: [
        {
          invoice: {
            id: 'inv1',
            status: 'DRAFT',
            paymentStatus: 'PARTIALLY_PAID',
            amountPaid: 50,
          },
        },
      ],
    });
    await expect(
      (service as any).removeProcedure('pl1', 'tp1', 'user-1'),
    ).rejects.toThrow(/recorded payments/i);
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
  });

  it('allows delete when PLANNED, no sessions, no payments, no invoice', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildBase());
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    // The audit helper resolves the actor via tx.user.findUnique — mock the
    // user record so the audit row captures the real actor id.
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      staff: { firstName: 'Dr', lastName: 'Smith' },
    });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });
    invoiceLifecycle.recalcInvoice.mockResolvedValue(undefined);

    const r = await (service as any).removeProcedure('pl1', 'tp1', 'user-1', 'duplicate');

    expect(prisma.chartEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          type: 'PLANNED',
        }),
      }),
    );
    expect(prisma.treatmentProcedure.delete).toHaveBeenCalledWith({ where: { id: 'tp1' } });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = prisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('DELETE');
    expect(auditCall.data.userId).toBe('user-1');
    expect(auditCall.data.userName).toBe('Dr Smith');
    expect(auditCall.data.reason).toBe('duplicate');
    // Snapshot includes the new fields required by the spec (procedure name,
    // code, surfaces, sessionsCount, invoice status).
    expect(auditCall.data.oldData.procedureName).toBe('Root Canal');
    expect(auditCall.data.oldData.procedureCode).toBe('D3330');
    expect(auditCall.data.oldData.sessionsCount).toBe(0);
    expect(auditCall.data.oldData.status).toBe('PLANNED');
    expect(r).toEqual({ success: true });
  });

  it('allows delete when invoice is DRAFT with no payments', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      invoiceItems: [
        {
          invoice: {
            id: 'inv1',
            status: 'DRAFT',
            paymentStatus: 'UNPAID',
            amountPaid: 0,
          },
        },
      ],
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: 'inv1' });
    invoiceLifecycle.recalcInvoice.mockResolvedValue(undefined);

    await (service as any).removeProcedure('pl1', 'tp1', 'user-1');
    expect(prisma.treatmentProcedure.delete).toHaveBeenCalledWith({ where: { id: 'tp1' } });
    expect(invoiceLifecycle.recalcInvoice).toHaveBeenCalledWith('inv1');
  });

  it('allows delete when linked invoice is VOID (already voided)', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildBase(),
      invoiceItems: [
        {
          invoice: {
            id: 'inv1',
            status: 'VOID',
            paymentStatus: 'UNPAID',
            amountPaid: 0,
          },
        },
      ],
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).removeProcedure('pl1', 'tp1', 'user-1');
    expect(prisma.treatmentProcedure.delete).toHaveBeenCalledWith({ where: { id: 'tp1' } });
  });
});

// ── cancelProcedure — spec rules for Cancel Treatment Procedure ────────
// ✅ Status can be: PLANNED, IN_PROGRESS, PENDING, ON_HOLD
// ❌ Status cannot be: COMPLETED, CANCELLED (already), REFERRED
// ✅ Payments DO NOT block cancellation (refund/void happens separately)
// ✅ Reason required
// ✅ Audit captures full snapshot (procedureName, code, surfaces, sessions,
//    invoice status)
describe('TreatmentPlansService.cancelProcedure', () => {
  const buildService = () => {
    const prisma = createPrismaMock();
    const invoiceLifecycle = createAutoMock();
    const docNum = createAutoMock();
    const conditionsService = mockConditionsService();
    const service = new TreatmentPlansService(
      prisma,
      invoiceLifecycle as any,
      docNum as any,
      conditionsService,
    );
    return { prisma, service, invoiceLifecycle };
  };

  const buildTp = (status: string) => ({
    id: 'tp1',
    treatmentPlanId: 'pl1',
    procedureId: 'cat1',
    status,
    paymentStatus: 'OPEN',
    totalPrice: 100,
    currency: 'UGX',
    targets: [{ id: 't1', toothNumber: 11, surfaces: [] }],
    sessions: [],
    chartEntries: [{ id: 'ce1' }],
    procedure: { id: 'cat1', name: 'Root Canal', code: 'D3330' },
    invoiceItems: [],
  });

  it('requires a reason', async () => {
    const { service } = buildService();
    await expect(
      (service as any).cancelProcedure('pl1', 'tp1', '   '),
    ).rejects.toThrow(/cancellation reason is required/);
  });

  it('refuses to cancel a COMPLETED procedure (clinical-record rule)', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildTp('COMPLETED'));
    await expect(
      (service as any).cancelProcedure('pl1', 'tp1', 'patient declined'),
    ).rejects.toThrow(/Completed procedures cannot be cancelled/);
    expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel a REFERRED procedure', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildTp('REFERRED'));
    await expect(
      (service as any).cancelProcedure('pl1', 'tp1', 'patient declined'),
    ).rejects.toThrow(/Referred procedures cannot be cancelled/);
    expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel an already-CANCELLED procedure', async () => {
    const { prisma, service } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildTp('CANCELLED'));
    await expect(
      (service as any).cancelProcedure('pl1', 'tp1', 'patient declined'),
    ).rejects.toThrow(/already cancelled/);
    expect(prisma.treatmentProcedure.update).not.toHaveBeenCalled();
  });

  it('ALLOWS cancellation when PAID (cancellation is independent of refunds)', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildTp('PLANNED'),
      paymentStatus: 'PAID',
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).cancelProcedure(
      'pl1', 'tp1', 'patient declined', 'user-1',
    );
    // Should have transitioned PLANNED → CANCELLED without throwing.
    expect(prisma.treatmentProcedure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tp1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'patient declined',
        }),
      }),
    );
  });

  it('supersedes ONLY PLANNED chart entries — COMPLETED history preserved', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildTp('PLANNED'),
      // Both kinds of chart entries present.
      chartEntries: [
        { id: 'ce-planned',   status: 'ACTIVE',     type: 'PLANNED'   },
        { id: 'ce-completed', status: 'ACTIVE',     type: 'COMPLETED' },
        { id: 'ce-existing',  status: 'SUPERSEDED', type: 'PLANNED'   },
      ],
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).cancelProcedure('pl1', 'tp1', 'duplicate', 'user-1');

    // The PLANNED + ACTIVE row is superseded; the COMPLETED row + already-
    // SUPERSEDED row are left alone.
    const chartCall = prisma.chartEntry.updateMany.mock.calls[0][0];
    expect(chartCall.where).toEqual({
      treatmentProcedureId: 'tp1',
      status: 'ACTIVE',
      type: 'PLANNED',
    });
  });

  it('cancels PENDING and IN_PROGRESS sessions, preserves COMPLETED ones', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildTp('IN_PROGRESS'),
      sessions: [
        { id: 's1', status: 'PENDING' },
        { id: 's2', status: 'IN_PROGRESS' },
        { id: 's3', status: 'COMPLETED' },
      ],
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).cancelProcedure('pl1', 'tp1', 'patient declined', 'user-1');

    // Only PENDING + IN_PROGRESS sessions transition to CANCELLED.
    expect(prisma.procedureSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          treatmentProcedureId: 'tp1',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        data: { status: 'CANCELLED' },
      }),
    );
  });

  it('audit snapshot includes the full procedure state (name, code, surfaces, sessions, invoice)', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue({
      ...buildTp('PLANNED'),
      paymentStatus: 'PAID',
      targets: [
        { id: 't1', toothNumber: 11, surfaces: ['OCCLUSAL'] },
        { id: 't2', toothNumber: 12, surfaces: ['MESIAL', 'OCCLUSAL'] },
      ],
      sessions: [
        { id: 's1', status: 'COMPLETED' },
      ],
      invoiceItems: [
        {
          invoice: {
            id: 'inv1',
            status: 'POSTED',
            paymentStatus: 'PAID',
            amountPaid: 500,
          },
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      staff: { firstName: 'Dr', lastName: 'Smith' },
    });
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: 'inv1' });

    await (service as any).cancelProcedure('pl1', 'tp1', 'patient declined', 'user-1');

    const auditCall = prisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('CANCEL');
    expect(auditCall.data.userId).toBe('user-1');
    expect(auditCall.data.userName).toBe('Dr Smith');
    expect(auditCall.data.reason).toBe('patient declined');
    expect(auditCall.data.newData).toEqual({ status: 'CANCELLED' });
    // Full snapshot per spec
    expect(auditCall.data.oldData.procedureName).toBe('Root Canal');
    expect(auditCall.data.oldData.procedureCode).toBe('D3330');
    expect(auditCall.data.oldData.previousStatus).toBe('PLANNED');
    expect(auditCall.data.oldData.toothNumbers).toEqual([11, 12]);
    // Surfaces are deduplicated preserving insertion order across targets.
    expect(auditCall.data.oldData.surfaces).toEqual(['OCCLUSAL', 'MESIAL']);
    expect(auditCall.data.oldData.sessionsCount).toBe(1);
    expect(auditCall.data.oldData.completedSessionsCount).toBe(1);
    expect(auditCall.data.oldData.paymentStatus).toBe('PAID');
    expect(auditCall.data.oldData.invoiceId).toBe('inv1');
    expect(auditCall.data.oldData.invoiceStatus).toBe('POSTED');
    expect(auditCall.data.oldData.invoiceAmountPaid).toBe(500);
  });

  it('keeps the TP row visible (only flips status, never deletes)', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildTp('PLANNED'));
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).cancelProcedure('pl1', 'tp1', 'patient declined', 'user-1');
    expect(prisma.treatmentProcedure.delete).not.toHaveBeenCalled();
    expect(prisma.treatmentProcedure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'patient declined',
        }),
      }),
    );
  });

  it('recalculates the plan cost after cancellation', async () => {
    const { prisma, service, invoiceLifecycle } = buildService();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(buildTp('PLANNED'));
    prisma.treatmentProcedure.findMany.mockResolvedValue([]);          // no other active procedures
    prisma.treatmentPlan.findUnique.mockResolvedValue({ status: 'PLANNED' }); // plan exists
    prisma.treatmentProcedure.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 } });
    invoiceLifecycle.voidProcedureBillingTx.mockResolvedValue({ invoiceId: null });

    await (service as any).cancelProcedure('pl1', 'tp1', 'duplicate', 'user-1');
    expect(prisma.treatmentPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pl1' },
        data: expect.objectContaining({ estimatedCost: 0 }),
      }),
    );
  });
});
