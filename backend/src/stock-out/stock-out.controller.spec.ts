import { StockOutController } from './stock-out.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('StockOutController', () => {
  it('constructs with its injected service', () => {
    expect(new StockOutController(createAutoMock())).toBeDefined();
  });
});
