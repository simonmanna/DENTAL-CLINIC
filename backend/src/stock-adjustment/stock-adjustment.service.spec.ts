import { StockAdjustmentService } from './stock-adjustment.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('StockAdjustmentService', () => {
  it('constructs with its injected collaborators', () => {
    expect(
      new StockAdjustmentService(
        createPrismaMock() as any,
        createAutoMock() as any,
        createAutoMock() as any,
      ),
    ).toBeDefined();
  });
});
