import { BillingServicesController } from './billing-services.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('BillingServicesController', () => {
  it('constructs with its injected service', () => {
    expect(new BillingServicesController(createAutoMock())).toBeDefined();
  });
});
