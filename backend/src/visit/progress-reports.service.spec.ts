import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, VisitStatus } from '@prisma/client';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';
import { ProgressReportsService } from './progress-reports.service';

function build() {
  const prisma = createPrismaMock();
  const docNum = createAutoMock();
  (docNum.next as jest.Mock).mockResolvedValue('PR-26-0007');
  const svc = new ProgressReportsService(prisma as any, docNum as any);
  return { prisma, docNum, svc };
}

const openVisit = {
  id: 'v1',
  patientId: 'p1',
  dentistId: 'staff-d1',
  status: VisitStatus.IN_PROGRESS,
};
const nurse = { id: 'user-n', role: UserRole.NURSE, staffId: 'staff-n' };

describe('ProgressReportsService', () => {
  it('numbers reports from the atomic document counter, not count()+1', async () => {
    const { prisma, docNum, svc } = build();
    prisma.visit.findUnique.mockResolvedValue(openVisit);
    prisma.progressReport.create.mockImplementation(async ({ data }: any) => ({
      id: 'r1',
      ...data,
    }));

    const r = await svc.createProgressReport('v1', { notes: 'healing well' }, nurse);

    expect(docNum.next).toHaveBeenCalledWith('PR', prisma);
    expect(prisma.progressReport.count).not.toHaveBeenCalled();
    expect(r.reportCode).toBe('PR-26-0007');
    expect(prisma.progressReport.create.mock.calls[0][0].data.createdById).toBe('user-n');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('accepts primary-dentition tooth numbers and rejects non-FDI ones', async () => {
    const { prisma, svc } = build();
    prisma.visit.findUnique.mockResolvedValue(openVisit);
    prisma.progressReport.create.mockResolvedValue({ id: 'r1', toothNumber: 75 });

    await expect(
      svc.createProgressReport('v1', { toothNumber: 75 }, nurse),
    ).resolves.toBeDefined();
    await expect(
      svc.createProgressReport('v1', { toothNumber: 19 }, nurse),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to link another patient's session", async () => {
    const { prisma, svc } = build();
    prisma.visit.findUnique.mockResolvedValue(openVisit);
    prisma.procedureSession.count.mockResolvedValue(0);

    await expect(
      svc.createProgressReport('v1', { procedureSessionIds: ['s-other'] }, nurse),
    ).rejects.toThrow(/do not belong/);
    expect(prisma.progressReport.create).not.toHaveBeenCalled();
  });

  it('refuses to write against a cancelled visit', async () => {
    const { prisma, svc } = build();
    prisma.visit.findUnique.mockResolvedValue({
      ...openVisit,
      status: VisitStatus.CANCELLED,
    });

    await expect(
      svc.createProgressReport('v1', { notes: 'x' }, nurse),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft-deletes with a reason and audits, never hard-deletes', async () => {
    const { prisma, svc } = build();
    prisma.progressReport.findFirst.mockResolvedValue({
      id: 'r1',
      reportCode: 'PR-26-0001',
      visitId: 'v1',
      toothNumber: null,
      findings: null,
      notes: 'n',
    });

    await svc.deleteProgressReport('r1', 'entered on wrong visit', nurse);

    expect(prisma.progressReport.delete).not.toHaveBeenCalled();
    expect(prisma.progressReport.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: expect.objectContaining({
        deletedById: 'user-n',
        deletedReason: 'entered on wrong visit',
      }),
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('DELETE');
  });

  it('requires a delete reason and 404s an already-deleted report', async () => {
    const { prisma, svc } = build();
    await expect(svc.deleteProgressReport('r1', '  ', nurse)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.progressReport.findFirst.mockResolvedValue(null);
    await expect(svc.deleteProgressReport('r1', 'dup', nurse)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists only live reports', async () => {
    const { prisma, svc } = build();
    prisma.visit.findUnique.mockResolvedValue(openVisit);
    prisma.progressReport.findMany.mockResolvedValue([]);

    await svc.getVisitProgressReports('v1');

    expect(prisma.progressReport.findMany.mock.calls[0][0].where).toEqual({
      visitId: 'v1',
      deletedAt: null,
    });
  });
});
