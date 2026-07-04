import { FixedAssetsController } from './fixed-assets.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('FixedAssetsController', () => {
  it('constructs with its injected service', () => {
    expect(new FixedAssetsController(createAutoMock())).toBeDefined();
  });
});
