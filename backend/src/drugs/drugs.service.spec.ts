import { DrugsService } from './drugs.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('DrugsService', () => {
  it('constructs with Prisma', () => {
    expect(new DrugsService(createPrismaMock() as any)).toBeDefined();
  });
});
