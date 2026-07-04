import { PharmacyService } from './pharmacy.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('PharmacyService', () => {
  it('constructs with Prisma', () => {
    expect(new PharmacyService(createPrismaMock() as any)).toBeDefined();
  });
});
