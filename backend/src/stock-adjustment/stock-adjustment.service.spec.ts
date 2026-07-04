import { StockAdjustmentService } from './stock-adjustment.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('StockAdjustmentService', () => {
  it('constructs with Prisma', () => {
    expect(new StockAdjustmentService(createPrismaMock() as any)).toBeDefined();
  });
});
