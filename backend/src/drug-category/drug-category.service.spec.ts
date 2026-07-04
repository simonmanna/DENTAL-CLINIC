import { DrugCategoriesService } from './drug-categories.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('DrugCategoriesService (drug-category)', () => {
  it('constructs with Prisma', () => {
    expect(new DrugCategoriesService(createPrismaMock() as any)).toBeDefined();
  });
});
