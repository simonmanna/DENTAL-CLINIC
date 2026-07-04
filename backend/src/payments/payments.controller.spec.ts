import { PaymentsController } from './payments.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('PaymentsController', () => {
  it('constructs with its injected service', () => {
    expect(new PaymentsController(createAutoMock())).toBeDefined();
  });
});
