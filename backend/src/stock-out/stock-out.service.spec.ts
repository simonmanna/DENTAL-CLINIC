import { StockOutService } from './stock-out.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('StockOutService', () => {
  it('constructs with Prisma', () => {
    expect(new StockOutService(createPrismaMock() as any)).toBeDefined();
  });
});
