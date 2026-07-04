import { NotFoundException } from '@nestjs/common';
import { EmrService } from './emr.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('EmrService', () => {
  let service: EmrService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new EmrService(prisma as any);
  });

  describe('findOne', () => {
    it('throws when the record is missing', async () => {
      prisma.eMRRecord.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('defaults diagnosis/icdCodes to arrays', async () => {
      prisma.eMRRecord.create.mockResolvedValue({ id: 'e1' });
      await service.create({ patientId: 'p1', dentistId: 'd1' } as any);
      const arg = prisma.eMRRecord.create.mock.calls[0][0];
      expect(arg.data.diagnosis).toEqual([]);
      expect(arg.data.icdCodes).toEqual([]);
    });
  });

  describe('createLabOrder', () => {
    it('generates an order code', async () => {
      prisma.labOrder.create.mockResolvedValue({ id: 'lo1' });
      await service.createLabOrder({ patientId: 'p1', testName: 'CBC', category: 'HEMA' } as any);
      const arg = prisma.labOrder.create.mock.calls[0][0];
      expect(arg.data.orderCode).toMatch(/^LAB-/);
    });
  });

  describe('getPatientTimeline', () => {
    it('merges sources and sorts newest first', async () => {
      prisma.appointment.findMany.mockResolvedValue([{ id: 'a', scheduledAt: '2026-01-01' }]);
      prisma.eMRRecord.findMany.mockResolvedValue([{ id: 'e', createdAt: '2026-03-01' }]);
      prisma.invoice.findMany.mockResolvedValue([{ id: 'i', createdAt: '2026-02-01' }]);
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.imagingRecord.findMany.mockResolvedValue([]);
      const timeline = await service.getPatientTimeline('p1');
      expect(timeline.map((t) => t.type)).toEqual(['EMR', 'INVOICE', 'APPOINTMENT']);
    });
  });
});
