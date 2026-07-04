import { FinancialReportingService } from './financial-reporting.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('FinancialReportingService', () => {
  it('constructs with Prisma', () => {
    expect(new FinancialReportingService(createPrismaMock() as any)).toBeDefined();
  });
});
