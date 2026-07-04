import { DrugCategoriesController } from './drug-category.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('DrugCategoriesController (drug-category)', () => {
  it('constructs with its injected service', () => {
    expect(new DrugCategoriesController(createAutoMock())).toBeDefined();
  });
});
