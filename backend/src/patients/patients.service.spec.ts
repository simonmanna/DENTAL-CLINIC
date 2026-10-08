import { BadRequestException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';

describe('PatientsService', () => {
  it('constructs with Prisma + document numbering', () => {
    expect(new PatientsService(createPrismaMock() as any, createAutoMock())).toBeDefined();
  });

  describe('soft delete', () => {
    let prisma: ReturnType<typeof createPrismaMock>;
    let svc: PatientsService;

    beforeEach(() => {
      prisma = createPrismaMock();
      svc = new PatientsService(prisma as any, createAutoMock());
    });

    it('stamps deletedAt + actor and deactivates', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p-1', deletedAt: null });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.patient.update.mockResolvedValue({ id: 'p-1' });

      await svc.softDelete('p-1', { reason: 'duplicate' }, 'u-1');

      const data = prisma.patient.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        deletedById: 'u-1',
        deletedReason: 'duplicate',
        isActive: false,
      });
      expect(data.deletedAt).toBeInstanceOf(Date);
    });

    it('is blocked while posted invoices are unpaid', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p-1', deletedAt: null });
      prisma.invoice.count.mockResolvedValue(2);

      await expect(svc.softDelete('p-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.patient.update).not.toHaveBeenCalled();
    });

    it('restore clears the delete stamp', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p-1', deletedAt: new Date() });
      prisma.patient.update.mockResolvedValue({ id: 'p-1' });

      await svc.restore('p-1', 'u-1');

      expect(prisma.patient.update.mock.calls[0][0].data).toMatchObject({
        deletedAt: null,
        isActive: true,
      });
    });

    it('lists only live patients by default', async () => {
      prisma.patient.count.mockResolvedValue(0);
      prisma.patient.findMany.mockResolvedValue([]);
      await svc.findAll({} as any);
      expect(prisma.patient.count.mock.calls[0][0].where.deletedAt).toBeNull();
    });
  });
});
