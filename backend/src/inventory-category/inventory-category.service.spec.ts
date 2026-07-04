import { InventoryCategoryService } from './inventory-category.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('InventoryCategoryService', () => {
  it('constructs with Prisma', () => {
    expect(new InventoryCategoryService(createPrismaMock() as any)).toBeDefined();
  });
});
