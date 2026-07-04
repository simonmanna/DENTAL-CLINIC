import { PharmacyController } from './pharmacy.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('PharmacyController', () => {
  it('constructs with its injected service', () => {
    expect(new PharmacyController(createAutoMock())).toBeDefined();
  });
});
