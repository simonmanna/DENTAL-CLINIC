import { FixedAssetsService } from './fixed-assets.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('FixedAssetsService', () => {
  it('constructs with Prisma', () => {
    expect(new FixedAssetsService(createPrismaMock() as any)).toBeDefined();
  });
});
