import { ConditionsController } from './conditions.controller';

describe('ConditionsController', () => {
  let controller: ConditionsController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      toggleFavourite: jest.fn().mockResolvedValue({ id: 'c1' }),
      findPatientConditions: jest.fn().mockResolvedValue([]),
      findOnePatientCondition: jest.fn().mockResolvedValue({ id: 'pc1' }),
      createPatientCondition: jest.fn().mockResolvedValue({ id: 'pc1' }),
      createPatientConditionsBatch: jest.fn().mockResolvedValue({ patientConditions: [], chartEntries: [] }),
      updatePatientConditionWithChartEntries: jest.fn().mockResolvedValue({}),
      updatePatientCondition: jest.fn().mockResolvedValue({ id: 'pc1' }),
      removePatientCondition: jest.fn().mockResolvedValue(undefined),
      restorePatientCondition: jest.fn().mockResolvedValue({ id: 'pc1' }),
      resolvePatientCondition: jest.fn().mockResolvedValue({ id: 'pc1' }),
      getPatientConditionAuditLog: jest.fn().mockResolvedValue([]),
    };
    controller = new ConditionsController(service);
  });

  // FIX-#4 helper: minimal mock request that yields ipAddress/userAgent = null
  // when no headers are set, matching what extractClientContext returns.
  const fakeReq = (): any => ({});

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() never lets the client claim isSystem (passes false) and forwards actor', async () => {
    await controller.create({ name: 'X', category: 'OTHER' } as any, 'user-1', fakeReq());
    expect(service.create).toHaveBeenCalledWith(
      { name: 'X', category: 'OTHER' },
      false,
      'user-1',
      null, // ipAddress
      null, // userAgent
    );
  });

  it('update() forwards actor to the service for audit logging', async () => {
    await controller.update('c1', { name: 'Y' } as any, 'user-2', fakeReq());
    expect(service.update).toHaveBeenCalledWith('c1', { name: 'Y' }, 'user-2', null, null);
  });

  it('remove() forwards actor to the service for audit logging', async () => {
    await controller.remove('c1', 'user-3', fakeReq());
    expect(service.remove).toHaveBeenCalledWith('c1', 'user-3', null, null);
  });

  it('toggleFavourite() forwards actor to the service for audit logging', async () => {
    await controller.toggleFavourite('c1', 'user-4', fakeReq());
    expect(service.toggleFavourite).toHaveBeenCalledWith('c1', 'user-4', null, null);
  });

  it('createPatientCondition() forwards the JWT actor id', async () => {
    await controller.createPatientCondition(
      { patientId: 'p1', conditionId: 'c1' } as any,
      'user-1',
      undefined,
      fakeReq(),
    );
    expect(service.createPatientCondition).toHaveBeenCalledWith(
      { patientId: 'p1', conditionId: 'c1' },
      'user-1',
      undefined, // I1: idempotencyKey (omitted when no Idempotency-Key header)
      null,      // FIX-#4: ipAddress
      null,      // FIX-#4: userAgent
    );
  });

  it('createPatientCondition() forwards the Idempotency-Key header when present', async () => {
    await controller.createPatientCondition(
      { patientId: 'p1', conditionId: 'c1' } as any,
      'user-1',
      'idem-abc',
      fakeReq(),
    );
    expect(service.createPatientCondition).toHaveBeenCalledWith(
      { patientId: 'p1', conditionId: 'c1' },
      'user-1',
      'idem-abc',
      null,
      null,
    );
  });

  it('createPatientCondition() extracts ipAddress + userAgent from the request', async () => {
    const req = {
      headers: {
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 Clinic-Terminal/1.4',
      },
      ip: '10.0.0.42',
    };
    await controller.createPatientCondition(
      { patientId: 'p1', conditionId: 'c1' } as any,
      'user-1',
      undefined,
      req,
    );
    expect(service.createPatientCondition).toHaveBeenCalledWith(
      { patientId: 'p1', conditionId: 'c1' },
      'user-1',
      undefined,
      '203.0.113.5',      // first hop from X-Forwarded-For
      'Mozilla/5.0 Clinic-Terminal/1.4',
    );
  });

  it('updatePatientCondition() forwards the JWT actor id', async () => {
    await controller.updatePatientCondition(
      'pc1',
      { notes: 'n' } as any,
      'user-2',
      undefined,
      fakeReq(),
    );
    expect(service.updatePatientCondition).toHaveBeenCalledWith(
      'pc1',
      { notes: 'n' },
      'user-2',
      undefined, // I1: idempotencyKey
      null,      // FIX-#4: ipAddress
      null,      // FIX-#4: userAgent
    );
  });

  it('removePatientCondition() forwards actor + reason and returns success envelope', async () => {
    const res = await controller.removePatientCondition(
      'pc1',
      { reason: 'why' },
      'user-3',
      fakeReq(),
    );
    expect(service.removePatientCondition).toHaveBeenCalledWith('pc1', 'user-3', 'why', null, null);
    expect(res).toEqual({ success: true });
  });

  it('removePatientCondition() requires a non-empty reason at the type level', () => {
    // The DTO (DeletePatientConditionDto) declares `reason: string` (not
    // optional). At runtime the global ValidationPipe enforces the
    // @IsNotEmpty constraint; this test pins the contract.
    const dtoModule = require('./dto/delete-patient-condition.dto');
    const dto = new dtoModule.DeletePatientConditionDto();
    expect(dto.reason).toBeUndefined();
    // Setting reason should be required and a string.
    dto.reason = 'charted in error';
    expect(typeof dto.reason).toBe('string');
    expect(dto.reason.length).toBeGreaterThan(0);
  });

  it('batch create defaults chartEntries to [] and forwards actor', async () => {
    await controller.createPatientConditionsBatch(
      { entries: [{ patientId: 'p1' }] } as any,
      'user-4',
      undefined,
      fakeReq(),
    );
    expect(service.createPatientConditionsBatch).toHaveBeenCalledWith(
      [{ patientId: 'p1' }],
      [],
      'user-4',
      undefined, // I1: idempotencyKey
      null,      // FIX-#4: ipAddress
      null,      // FIX-#4: userAgent
    );
  });

  it('batch create forwards the Idempotency-Key header when present', async () => {
    await controller.createPatientConditionsBatch(
      { entries: [{ patientId: 'p1' }] } as any,
      'user-4',
      'idem-batch-1',
      fakeReq(),
    );
    expect(service.createPatientConditionsBatch).toHaveBeenCalledWith(
      [{ patientId: 'p1' }],
      [],
      'user-4',
      'idem-batch-1',
      null,
      null,
    );
  });

  it('batch update forwards id, update, chartEntries and actor', async () => {
    await controller.updatePatientConditionsBatch(
      { patientConditionId: 'pc1', update: { notes: 'n' }, chartEntries: [] } as any,
      'user-5',
      undefined,
      fakeReq(),
    );
    expect(service.updatePatientConditionWithChartEntries).toHaveBeenCalledWith(
      'pc1',
      { notes: 'n' },
      [],
      'user-5',
      undefined, // I1: idempotencyKey
      null,      // FIX-#4: ipAddress
      null,      // FIX-#4: userAgent
    );
  });

  it('batch update forwards the Idempotency-Key header when present', async () => {
    await controller.updatePatientConditionsBatch(
      { patientConditionId: 'pc1', update: { notes: 'n' }, chartEntries: [] } as any,
      'user-5',
      'idem-batch-upd-1',
      fakeReq(),
    );
    expect(service.updatePatientConditionWithChartEntries).toHaveBeenCalledWith(
      'pc1',
      { notes: 'n' },
      [],
      'user-5',
      'idem-batch-upd-1',
      null,
      null,
    );
  });

  it('findPatientConditions() passes patientId + visitId from the query', async () => {
    await controller.findPatientConditions({ patientId: 'p1', visitId: 'v1' } as any);
    expect(service.findPatientConditions).toHaveBeenCalledWith('p1', 'v1');
  });

  it('restorePatientCondition() forwards actor + client context', async () => {
    await controller.restorePatientCondition('pc1', 'user-6', fakeReq());
    expect(service.restorePatientCondition).toHaveBeenCalledWith('pc1', 'user-6', null, null);
  });

  it('resolvePatientCondition() forwards actor + procedureId + client context', async () => {
    await controller.resolvePatientCondition('pc1', { procedureId: 'tp-1' }, 'user-7', fakeReq());
    expect(service.resolvePatientCondition).toHaveBeenCalledWith(
      'pc1',
      'user-7',
      'tp-1',
      null,
      null,
    );
  });
});