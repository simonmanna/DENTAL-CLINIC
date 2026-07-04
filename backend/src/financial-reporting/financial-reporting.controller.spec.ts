import { FinancialReportingController } from './financial-reporting.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('FinancialReportingController', () => {
  it('constructs with its injected service', () => {
    expect(new FinancialReportingController(createAutoMock())).toBeDefined();
  });
});
