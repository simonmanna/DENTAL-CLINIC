import { SuppliersController } from './suppliers.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('SuppliersController', () => {
  it('constructs with its injected service', () => {
    expect(new SuppliersController(createAutoMock())).toBeDefined();
  });
});
