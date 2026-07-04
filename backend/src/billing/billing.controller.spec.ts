import { BillingController } from './billing.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('BillingController', () => {
  it('constructs with its injected service', () => {
    expect(new BillingController(createAutoMock())).toBeDefined();
  });
});
