import { ClinicalReportsController } from './clinical-report.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('ClinicalReportsController', () => {
  it('constructs with its injected service', () => {
    expect(new ClinicalReportsController(createAutoMock())).toBeDefined();
  });
});
