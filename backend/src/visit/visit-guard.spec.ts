import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, VisitStatus } from '@prisma/client';
import { createPrismaMock } from '../test-utils/prisma-mock';
import { assertVisitWritableTx, checkClinicalWrite } from './visit-guard';

describe('checkClinicalWrite', () => {
  const visit = (status: VisitStatus) => ({ status, dentistId: 'staff-d1' });

  it.each([VisitStatus.ARRIVED, VisitStatus.IN_PROGRESS])(
    'allows any admitted role on an open (%s) visit',
    (status) => {
      expect(
        checkClinicalWrite(visit(status), { role: UserRole.NURSE }, undefined, 'x'),
      ).toEqual({ isAmendment: false });
    },
  );

  it('rejects a cancelled visit outright, even for an admin', () => {
    expect(() =>
      checkClinicalWrite(
        visit(VisitStatus.CANCELLED),
        { role: UserRole.ADMIN },
        'reason',
        'x',
      ),
    ).toThrow(BadRequestException);
  });

  it('lets the treating dentist amend a completed visit with a reason', () => {
    expect(
      checkClinicalWrite(
        visit(VisitStatus.COMPLETED),
        { role: UserRole.DENTIST, staffId: 'staff-d1' },
        'late entry',
        'x',
      ),
    ).toEqual({ isAmendment: true });
  });

  it('lets an admin amend a completed visit with a reason', () => {
    expect(
      checkClinicalWrite(
        visit(VisitStatus.COMPLETED),
        { role: UserRole.ADMIN },
        'correction',
        'x',
      ),
    ).toEqual({ isAmendment: true });
  });

  it('refuses another dentist on a completed visit', () => {
    expect(() =>
      checkClinicalWrite(
        visit(VisitStatus.COMPLETED),
        { role: UserRole.DENTIST, staffId: 'someone-else' },
        'reason',
        'x',
      ),
    ).toThrow(ForbiddenException);
  });

  it('requires a reason to amend a completed visit', () => {
    expect(() =>
      checkClinicalWrite(
        visit(VisitStatus.COMPLETED),
        { role: UserRole.ADMIN },
        '  ',
        'x',
      ),
    ).toThrow(BadRequestException);
  });
});

describe('assertVisitWritableTx', () => {
  it('404s an unknown visit', async () => {
    const prisma = createPrismaMock();
    prisma.visit.findUnique.mockResolvedValue(null);
    await expect(
      assertVisitWritableTx(prisma, { visitId: 'v1', what: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects another patient's visit", async () => {
    const prisma = createPrismaMock();
    prisma.visit.findUnique.mockResolvedValue({
      id: 'v1',
      patientId: 'p-other',
      dentistId: 'd1',
      status: VisitStatus.IN_PROGRESS,
    });
    await expect(
      assertVisitWritableTx(prisma, { visitId: 'v1', patientId: 'p1', what: 'x' }),
    ).rejects.toThrow(/different patient/);
  });

  it('returns the visit for an open visit of the same patient', async () => {
    const prisma = createPrismaMock();
    const row = {
      id: 'v1',
      patientId: 'p1',
      dentistId: 'd1',
      status: VisitStatus.ARRIVED,
    };
    prisma.visit.findUnique.mockResolvedValue(row);
    await expect(
      assertVisitWritableTx(prisma, { visitId: 'v1', patientId: 'p1', what: 'x' }),
    ).resolves.toEqual({ visit: row, isAmendment: false });
  });
});
