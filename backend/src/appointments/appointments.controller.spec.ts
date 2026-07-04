import { AppointmentsController } from './appointments.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('AppointmentsController', () => {
  it('constructs with its injected service', () => {
    expect(new AppointmentsController(createAutoMock())).toBeDefined();
  });
});
