import { StockOutService } from './stock-out.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('StockOutService', () => {
  it('constructs with its injected collaborators', () => {
    expect(
      new StockOutService(
        createPrismaMock() as any,
        createAutoMock() as any,
        createAutoMock() as any,
      ),
    ).toBeDefined();
  });
});
