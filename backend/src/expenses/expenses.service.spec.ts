import { ExpensesService } from './expenses.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('ExpensesService', () => {
  it('constructs with Prisma + payments service', () => {
    const service = new ExpensesService(createPrismaMock() as any, createAutoMock());
    expect(service).toBeDefined();
  });
});
