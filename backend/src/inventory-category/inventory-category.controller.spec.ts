import { InventoryCategoryController } from './inventory-category.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('InventoryCategoryController', () => {
  it('constructs with its injected service', () => {
    expect(new InventoryCategoryController(createAutoMock())).toBeDefined();
  });
});
