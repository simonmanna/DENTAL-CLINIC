import { LocationsController } from './locations.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('LocationsController', () => {
  it('constructs with its injected service', () => {
    expect(new LocationsController(createAutoMock())).toBeDefined();
  });
});
