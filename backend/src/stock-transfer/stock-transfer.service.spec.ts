import { StockTransferService } from './stock-transfer.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('StockTransferService', () => {
  it('constructs with Prisma', () => {
    expect(new StockTransferService(createPrismaMock() as any)).toBeDefined();
  });
});
