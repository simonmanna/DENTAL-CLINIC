import { StockTransferController } from './stock-transfer.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('StockTransferController', () => {
  it('constructs with its injected service', () => {
    expect(new StockTransferController(createAutoMock())).toBeDefined();
  });
});
