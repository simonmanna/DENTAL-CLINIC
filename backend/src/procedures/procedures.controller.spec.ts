import { ProceduresController, VisitProceduresController } from './procedures.controller';
import { createAutoMock } from '../test-utils/prisma-mock';

describe('Procedures controllers', () => {
  it('ProceduresController constructs with its service', () => {
    expect(new ProceduresController(createAutoMock())).toBeDefined();
  });
  it('VisitProceduresController constructs with its service', () => {
    expect(new VisitProceduresController(createAutoMock())).toBeDefined();
  });
});
