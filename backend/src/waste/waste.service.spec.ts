import { WasteService } from './waste.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('WasteService', () => {
  it('constructs with Prisma', () => {
    expect(new WasteService(createPrismaMock() as any)).toBeDefined();
  });
});
