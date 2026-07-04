import { StaffController } from './staff.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('StaffController', () => {
  it('constructs with its injected service', () => {
    expect(new StaffController(createAutoMock())).toBeDefined();
  });
});
