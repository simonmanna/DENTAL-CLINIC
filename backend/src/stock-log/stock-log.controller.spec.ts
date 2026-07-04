import { StockLogController } from './stock-log.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('StockLogController', () => {
  it('constructs with its injected service', () => {
    expect(new StockLogController(createAutoMock())).toBeDefined();
  });
});
