import { ReceiptsController } from './receipts.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('ReceiptsController', () => {
  it('constructs with its injected service', () => {
    expect(new ReceiptsController(createAutoMock())).toBeDefined();
  });
});
