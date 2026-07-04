import { WasteController } from './waste.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('WasteController', () => {
  it('constructs with its injected service', () => {
    expect(new WasteController(createAutoMock())).toBeDefined();
  });
});
