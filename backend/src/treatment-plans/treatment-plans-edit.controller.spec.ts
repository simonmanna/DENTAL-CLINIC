import { TreatmentPlansEditController } from './treatment-plans-edit.controller';

describe('TreatmentPlansEditController', () => {
  let controller: TreatmentPlansEditController;
  let svc: any;

  beforeEach(() => {
    svc = {
      checkProcedureDeleteEligibility: jest
        .fn()
        .mockResolvedValue({ canDelete: true }),
      updateProcedureWithGuards: jest
        .fn()
        .mockResolvedValue({ data: {}, audited: true }),
    };
    controller = new TreatmentPlansEditController(svc);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('checkDeleteEligibility delegates to the service', async () => {
    await controller.checkDeleteEligibility('pl1', 'pr1');
    expect(svc.checkProcedureDeleteEligibility).toHaveBeenCalledWith(
      'pl1',
      'pr1',
    );
  });

  it('updateProcedure forwards the JWT actor id (body cannot lie about who edited)', async () => {
    await controller.updateProcedure(
      'pl1',
      'pr1',
      { notes: 'n' } as any,
      'user-1',
    );
    expect(svc.updateProcedureWithGuards).toHaveBeenCalledWith(
      'pl1',
      'pr1',
      { notes: 'n' },
      'user-1',
    );
  });
});
