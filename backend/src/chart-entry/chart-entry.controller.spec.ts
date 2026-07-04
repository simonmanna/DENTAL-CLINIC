import { ChartEntryController } from './chart-entry.controller';

describe('ChartEntryController', () => {
  let controller: ChartEntryController;
  let service: any;
  const req = { user: { id: 'user-1', staffId: 'staff-1' } };

  beforeEach(() => {
    service = {
      getPatientEntries: jest.fn().mockResolvedValue([]),
      getToothHistory: jest.fn().mockResolvedValue([]),
      createEntry: jest.fn().mockResolvedValue({ id: 'ce1' }),
      executeQuickAction: jest.fn().mockResolvedValue({ chartEntry: {} }),
      supersedeByPatientCondition: jest.fn().mockResolvedValue({ success: true, count: 1 }),
      updateEntry: jest.fn().mockResolvedValue({ id: 'ce1' }),
      supersedeEntry: jest.fn().mockResolvedValue({ id: 'ce1' }),
      addExistingProcedure: jest.fn().mockResolvedValue({ id: 'ce1' }),
      updateCondition: jest.fn().mockResolvedValue({ id: 'ce1' }),
      voidEntry: jest.fn().mockResolvedValue({ id: 'ce1' }),
    };
    controller = new ChartEntryController(service);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('createEntry falls back to JWT staffId when no providerId in body', () => {
    controller.createEntry({ patientId: 'p1' } as any, req);
    expect(service.createEntry).toHaveBeenCalledWith({ patientId: 'p1', providerId: 'staff-1' });
  });

  it('createEntry prefers an explicit providerId in the body', () => {
    controller.createEntry({ patientId: 'p1', providerId: 'explicit' } as any, req);
    expect(service.createEntry).toHaveBeenCalledWith({ patientId: 'p1', providerId: 'explicit' });
  });

  it('quickAction injects the JWT staff as provider fallback AND forwards the actor id', () => {
    controller.quickAction({ patientId: 'p1', action: 'ADD_CONDITION' } as any, req);
    expect(service.executeQuickAction).toHaveBeenCalledWith(
      {
        patientId: 'p1', action: 'ADD_CONDITION', providerId: 'staff-1',
      },
      'user-1', // ← actorUserId so every record the quick action creates is audited
      null,     // FIX-#4: ipAddress
      null,     // FIX-#4: userAgent
    );
  });

  it('quickAction extracts ipAddress + userAgent from the request', () => {
    const reqWithHeaders = {
      user: { id: 'user-1', staffId: 'staff-1' },
      headers: {
        'x-real-ip': '198.51.100.7',
        'user-agent': 'Clinic-Terminal/2.0',
      },
      ip: '10.0.0.99',
    };
    controller.quickAction({ patientId: 'p1', action: 'ADD_CONDITION' } as any, reqWithHeaders);
    expect(service.executeQuickAction).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', providerId: 'staff-1' }),
      'user-1',
      '198.51.100.7',
      'Clinic-Terminal/2.0',
    );
  });

  it('updateEntry forwards the actor id + client context', () => {
    controller.updateEntry('ce1', { notes: 'n' } as any, req);
    expect(service.updateEntry).toHaveBeenCalledWith('ce1', { notes: 'n' }, 'user-1', null, null);
  });

  it('updateCondition forwards provider fallback and actor id + client context', () => {
    controller.updateCondition('ce1', { label: 'L' } as any, req);
    expect(service.updateCondition).toHaveBeenCalledWith(
      'ce1',
      { label: 'L', providerId: 'staff-1' },
      'user-1',
      null,
      null,
    );
  });

  it('voidEntry forwards reason and actor id + client context', () => {
    controller.voidEntry('ce1', { reason: 'oops' }, req);
    // M-2: trailing expectedVersion arg (undefined when the body omits it).
    expect(service.voidEntry).toHaveBeenCalledWith(
      'ce1',
      'oops',
      'user-1',
      null,
      null,
      undefined,
    );
  });

  it('voidEntry forwards expectedVersion when supplied', () => {
    controller.voidEntry('ce1', { reason: 'oops', expectedVersion: 3 }, req);
    expect(service.voidEntry).toHaveBeenCalledWith(
      'ce1',
      'oops',
      'user-1',
      null,
      null,
      3,
    );
  });
});