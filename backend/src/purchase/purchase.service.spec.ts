import { PurchaseService } from './purchase.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('PurchaseService', () => {
  it('constructs with Prisma', () => {
    expect(
      new PurchaseService(
        createPrismaMock() as any,
        createAutoMock(),
        createAutoMock(),
        createAutoMock(),
      ),
    ).toBeDefined();
  });
});
