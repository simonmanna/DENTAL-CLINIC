import { ReportsService, visitPaymentStatus } from './reports.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('ReportsService', () => {
  it('constructs with Prisma', () => {
    expect(new ReportsService(createPrismaMock() as any)).toBeDefined();
  });
});

describe('visitPaymentStatus', () => {
  it('is OPEN when nothing is billed', () => {
    expect(visitPaymentStatus(0, 0)).toBe('OPEN');
  });
  it('is UNPAID when billed and nothing paid', () => {
    expect(visitPaymentStatus(95000, 0)).toBe('UNPAID');
  });
  it('compares amounts numerically, not as strings', () => {
    // "35000" >= "245000" is true as strings; numerically it is a part payment.
    expect(visitPaymentStatus(245000, 35000)).toBe('PARTIALLY_PAID');
  });
  it('is PAID within a cent of the bill', () => {
    expect(visitPaymentStatus(100, 99.995)).toBe('PAID');
  });
});
