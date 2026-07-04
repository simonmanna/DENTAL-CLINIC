import { ReportsController } from './reports.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('ReportsController', () => {
  it('constructs with its injected service', () => {
    expect(new ReportsController(createAutoMock())).toBeDefined();
  });
});
