import { AccountsController } from './accounts.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('AccountsController', () => {
  it('constructs with its injected service', () => {
    expect(new AccountsController(createAutoMock())).toBeDefined();
  });
});
