import { TreatmentPlansController } from './treatment-plans.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('TreatmentPlansController', () => {
  it('constructs with its injected service', () => {
    expect(new TreatmentPlansController(createAutoMock())).toBeDefined();
  });
});
