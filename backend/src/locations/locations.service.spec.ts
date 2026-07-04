import { LocationsService } from './locations.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('LocationsService', () => {
  it('constructs with Prisma', () => {
    expect(new LocationsService(createPrismaMock() as any)).toBeDefined();
  });
});
