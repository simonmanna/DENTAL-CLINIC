import { StockLogService } from './stock-log.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('StockLogService', () => {
  it('constructs with Prisma', () => {
    expect(new StockLogService(createPrismaMock() as any)).toBeDefined();
  });
});
