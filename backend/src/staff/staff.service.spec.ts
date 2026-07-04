import { StaffService } from './staff.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('StaffService', () => {
  it('constructs with Prisma', () => {
    expect(new StaffService(createPrismaMock() as any)).toBeDefined();
  });
});
