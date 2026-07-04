import { PrescriptionsController } from './prescriptions.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('PrescriptionsController', () => {
  it('constructs with its injected service', () => {
    expect(new PrescriptionsController(createAutoMock())).toBeDefined();
  });
});
