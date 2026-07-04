import { PurchaseController } from './purchase.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('PurchaseController', () => {
  it('constructs with its injected service', () => {
    expect(new PurchaseController(createAutoMock())).toBeDefined();
  });
});
