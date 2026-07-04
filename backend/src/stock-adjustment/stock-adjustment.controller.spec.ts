import { StockAdjustmentController } from './stock-adjustment.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('StockAdjustmentController', () => {
  it('constructs with its injected service', () => {
    expect(new StockAdjustmentController(createAutoMock())).toBeDefined();
  });
});
