import { ExpensesController } from './expenses.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('ExpensesController', () => {
  it('constructs with its injected service', () => {
    expect(new ExpensesController(createAutoMock())).toBeDefined();
  });
});
