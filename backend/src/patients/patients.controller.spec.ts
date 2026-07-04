import { PatientsController } from './patients.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('PatientsController', () => {
  it('constructs with its injected service', () => {
    expect(new PatientsController(createAutoMock())).toBeDefined();
  });
});
