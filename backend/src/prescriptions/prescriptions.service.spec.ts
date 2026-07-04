import { PrescriptionsService } from './prescriptions.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('PrescriptionsService', () => {
  it('constructs with Prisma', () => {
    expect(new PrescriptionsService(createPrismaMock() as any)).toBeDefined();
  });
});
