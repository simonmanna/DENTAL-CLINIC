import { EmrController } from './emr.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('EmrController', () => {
  it('constructs with its injected service', () => {
    expect(new EmrController(createAutoMock())).toBeDefined();
  });
});
