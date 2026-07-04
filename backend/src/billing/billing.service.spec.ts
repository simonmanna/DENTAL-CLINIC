import { BillingService } from './billing.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('BillingService', () => {
  it('constructs with Prisma', () => {
    expect(new BillingService(createPrismaMock() as any)).toBeDefined();
  });
});
