import { WasteService } from './waste.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('WasteService', () => {
  it('constructs with its injected collaborators', () => {
    expect(
      new WasteService(
        createPrismaMock() as any,
        createAutoMock() as any,
        createAutoMock() as any,
      ),
    ).toBeDefined();
  });
});
