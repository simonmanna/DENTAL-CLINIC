import { PatientsService } from './patients.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('PatientsService', () => {
  it('constructs with Prisma + document numbering', () => {
    expect(new PatientsService(createPrismaMock() as any, createAutoMock())).toBeDefined();
  });
});
