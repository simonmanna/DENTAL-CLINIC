import { TreatmentPlansService } from './treatment-plans.service';
import { ConditionsService } from '../conditions/conditions.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

// executeSession is the one completion path (chart, extraction absence,
// condition resolution, stock, imaging). These specs pin the guards added
// around it: procedure state, visit state, derived isFinal, per-tooth
// surfaces, imaging ownership and consumables.

const tpRow = (over: Record<string, unknown> = {}) => ({
  id: 'tp1',
  treatmentPlanId: 'pl1',
  status: 'PLANNED',
  sessionType: 'SINGLE',
  sessionCount: 1,
  visitGroup: 1,
  completedAt: null,
  treatmentPlan: { patientId: 'p1', title: 'Plan' },
  procedure: { id: 'cat1', name: 'Composite', code: 'D2391' },
  targets: [
    { id: 't1', toothNumber: 16, surfaces: ['OCCLUSAL'], unitIndex: null },
  ],
  ...over,
});

function build() {
  const prisma = createPrismaMock();
  const conditions = {
    applyConditionLifecycleTx: jest.fn(),
  } as unknown as ConditionsService;
  const stock = {
    issue: jest.fn().mockResolvedValue({ draws: [], totalCost: 12.5 }),
    reverseDocument: jest.fn(),
  };
  const service = new TreatmentPlansService(
    prisma,
    createAutoMock(),
    createAutoMock(),
    conditions,
    stock as any,
  );

  prisma.visit.findUnique.mockResolvedValue({
    id: 'v1',
    patientId: 'p1',
    dentistId: 'd1',
    status: 'IN_PROGRESS',
  });
  prisma.treatmentProcedure.findFirst.mockResolvedValue(tpRow());
  prisma.procedureSession.findFirst.mockResolvedValue(null);
  prisma.procedureSession.create.mockImplementation(async ({ data }: any) => ({
    id: 's1',
    status: 'PENDING',
    targets: [],
    ...data,
  }));
  prisma.procedureSession.count.mockResolvedValue(0);
  prisma.procedureSession.update.mockImplementation(async ({ data }: any) => ({
    id: 's1',
    sessionNumber: 1,
    ...data,
  }));
  prisma.procedureSession.findMany.mockResolvedValue([
    { status: 'COMPLETED', isFinal: true, deletedAt: null },
  ]);
  prisma.procedureTarget.findMany.mockResolvedValue([
    { surfaces: ['OCCLUSAL'] },
  ]);
  prisma.treatmentPlan.findUnique.mockResolvedValue({
    status: 'PLANNED',
    completedAt: null,
  });
  prisma.treatmentProcedure.findMany.mockResolvedValue([]);
  return { prisma, service, stock };
}

const base = {
  visitId: 'v1',
  providerId: 'staff-1',
  performedDate: '2026-10-01',
  toothStatuses: [
    { toothNumber: 16, status: 'COMPLETED', surfaces: ['OCCLUSAL'] },
  ],
};

describe('TreatmentPlansService.executeSession — guards', () => {
  it('requires a visit', async () => {
    const { service } = build();
    await expect(
      service.executeSession(
        'pl1',
        'tp1',
        { ...base, visitId: undefined } as any,
        'u1',
      ),
    ).rejects.toThrow(/visitId is required/);
  });

  it('refuses a COMPLETED procedure (re-executing duplicated the completion)', async () => {
    const { service, prisma } = build();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(
      tpRow({ status: 'COMPLETED' }),
    );
    await expect(
      service.executeSession('pl1', 'tp1', base as any, 'u1'),
    ).rejects.toThrow(/Cannot execute a session on a COMPLETED procedure/);
  });

  it('treats a soft-deleted procedure as not found', async () => {
    const { service, prisma } = build();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(null);
    await expect(
      service.executeSession('pl1', 'tp1', base as any, 'u1'),
    ).rejects.toThrow(/TreatmentProcedure not found/);
    const where = prisma.treatmentProcedure.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      status: { not: 'DELETED' },
    });
  });

  it('refuses a cancelled visit', async () => {
    const { service, prisma } = build();
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1',
      patientId: 'p1',
      dentistId: 'd1',
      status: 'CANCELLED',
    });
    await expect(
      service.executeSession('pl1', 'tp1', base as any, 'u1'),
    ).rejects.toThrow(/cancelled visit/);
  });

  it("refuses another patient's visit", async () => {
    const { service, prisma } = build();
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1',
      patientId: 'p2',
      dentistId: 'd1',
      status: 'IN_PROGRESS',
    });
    await expect(
      service.executeSession('pl1', 'tp1', base as any, 'u1'),
    ).rejects.toThrow(/different patient/);
  });

  it('refuses a performedDate in the future', async () => {
    const { service } = build();
    await expect(
      service.executeSession(
        'pl1',
        'tp1',
        { ...base, performedDate: '2999-01-01' } as any,
        'u1',
      ),
    ).rejects.toThrow(/cannot be in the future/);
  });
});

describe('TreatmentPlansService.executeSession — behaviour', () => {
  it('derives isFinal for a SINGLE procedure when the client omits it', async () => {
    const { service, prisma } = build();
    const res: any = await service.executeSession(
      'pl1',
      'tp1',
      base as any,
      'u1',
    );
    expect(res.isFinal).toBe(true);
    expect(prisma.procedureSession.update.mock.calls[0][0].data.isFinal).toBe(
      true,
    );
  });

  it('derives isFinal=false for an early MULTI session', async () => {
    const { service, prisma } = build();
    prisma.treatmentProcedure.findFirst.mockResolvedValue(
      tpRow({ sessionType: 'MULTI', sessionCount: 3 }),
    );
    prisma.procedureSession.findMany.mockResolvedValue([
      { status: 'COMPLETED', isFinal: false, deletedAt: null },
    ]);
    const res: any = await service.executeSession(
      'pl1',
      'tp1',
      base as any,
      'u1',
    );
    expect(res.isFinal).toBe(false);
    expect(res.procedureStatus).toBe('IN_PROGRESS');
  });

  it("writes each tooth's own surfaces onto the session target (folded for the tooth)", async () => {
    const { service, prisma } = build();
    await service.executeSession(
      'pl1',
      'tp1',
      {
        ...base,
        toothStatuses: [
          { toothNumber: 16, status: 'COMPLETED', surfaces: ['LABIAL'] },
        ],
      } as any,
      'u1',
    );
    const call = prisma.procedureTarget.updateMany.mock.calls.find(
      (c: any) => c[0].where.toothNumber === 16,
    );
    // LABIAL on a molar is its BUCCAL surface.
    expect(call[0].data.surfaces).toEqual(['BUCCAL']);
  });

  it('issues recorded consumables from stock against the session', async () => {
    const { service, prisma, stock } = build();
    prisma.procedureInventoryInput.findMany.mockResolvedValue([
      { inventoryItemId: 'item-1', locationId: 'loc-1' },
    ]);
    await service.executeSession(
      'pl1',
      'tp1',
      {
        ...base,
        actualInputsUsed: [{ inventoryItemId: 'item-1', quantityUsed: 2 }],
      } as any,
      'u1',
    );
    expect(stock.issue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        itemId: 'item-1',
        locationId: 'loc-1',
        quantity: 2,
        referenceType: 'PROCEDURE_SESSION',
        referenceId: 's1',
      }),
    );
  });

  it("refuses to attach another patient's imaging", async () => {
    const { service, prisma } = build();
    prisma.imagingRecord.findMany.mockResolvedValue([
      { id: 'img1', patientId: 'p2', visitId: null },
    ]);
    await expect(
      service.executeSession(
        'pl1',
        'tp1',
        {
          ...base,
          imagingLinks: [{ imagingRecordId: 'img1', stage: 'AFTER' }],
        } as any,
        'u1',
      ),
    ).rejects.toThrow(/does not belong to this patient/);
  });

  it('links imaging to the session with its stage and group', async () => {
    const { service, prisma } = build();
    prisma.imagingRecord.findMany.mockResolvedValue([
      { id: 'img1', patientId: 'p1', visitId: null },
    ]);
    await service.executeSession(
      'pl1',
      'tp1',
      {
        ...base,
        imagingLinks: [{ imagingRecordId: 'img1', stage: 'after' }],
      } as any,
      'u1',
    );
    const data = prisma.imagingRecord.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      procedureSessionId: 's1',
      stage: 'AFTER',
      groupId: 'session-s1',
      visitId: 'v1',
    });
  });
});
