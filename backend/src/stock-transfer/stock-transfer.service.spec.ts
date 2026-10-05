import { StockTransferService } from './stock-transfer.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('StockTransferService', () => {
  it('constructs with its injected collaborators', () => {
    expect(
      new StockTransferService(
        createPrismaMock() as any,
        createAutoMock() as any,
        createAutoMock() as any,
      ),
    ).toBeDefined();
  });
});
