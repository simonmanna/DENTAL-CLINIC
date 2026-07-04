import { ReportsService } from './reports.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('ReportsService', () => {
  it('constructs with Prisma', () => {
    expect(new ReportsService(createPrismaMock() as any)).toBeDefined();
  });
});
