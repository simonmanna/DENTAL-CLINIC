import { DrugsController } from './drugs.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('DrugsController', () => {
  it('constructs with its injected service', () => {
    expect(new DrugsController(createAutoMock())).toBeDefined();
  });
});
