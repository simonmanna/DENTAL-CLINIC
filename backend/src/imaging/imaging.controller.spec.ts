import { ImagingController } from './imaging.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('ImagingController', () => {
  it('constructs with its injected service', () => {
    expect(new ImagingController(createAutoMock())).toBeDefined();
  });
});
