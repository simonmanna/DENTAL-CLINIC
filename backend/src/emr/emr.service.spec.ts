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
      prisma.visit.findMany.mockResolvedValue([{ id: 'v', createdAt: '2026-01-15' }]);
      prisma.eMRRecord.findMany.mockResolvedValue([{ id: 'e', createdAt: '2026-03-01' }]);
      prisma.invoice.findMany.mockResolvedValue([{ id: 'i', createdAt: '2026-02-01' }]);
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.imagingRecord.findMany.mockResolvedValue([]);
      const timeline = await service.getPatientTimeline('p1');
      expect(timeline.map((t) => t.type)).toEqual(['EMR', 'INVOICE', 'VISIT', 'APPOINTMENT']);
    });

    it('leaves soft-deleted invoices out', async () => {
      for (const m of ['appointment', 'visit', 'eMRRecord', 'invoice', 'prescription', 'imagingRecord']) {
        prisma[m].findMany.mockResolvedValue([]);
      }
      await service.getPatientTimeline('p1');
      expect(prisma.invoice.findMany.mock.calls[0][0].where).toEqual({
        patientId: 'p1',
        deletedAt: null,
      });
    });

    it('cuts the merged history where a capped source runs out', async () => {
      // 50 appointments (the per-source cap) reaching back to day 1 of 2026-02;
      // an older invoice beyond that point must not appear, because older
      // appointments were not read and the history there is incomplete.
      const appts = Array.from({ length: 50 }, (_, i) => ({
        id: `a${i}`,
        scheduledAt: new Date(Date.UTC(2026, 1, 50 - i)).toISOString(),
      }));
      prisma.appointment.findMany.mockResolvedValue(appts);
      prisma.visit.findMany.mockResolvedValue([]);
      prisma.eMRRecord.findMany.mockResolvedValue([]);
      prisma.invoice.findMany.mockResolvedValue([
        { id: 'new', createdAt: '2026-03-10T00:00:00.000Z' },
        { id: 'old', createdAt: '2025-12-01T00:00:00.000Z' },
      ]);
      prisma.prescription.findMany.mockResolvedValue([]);
      prisma.imagingRecord.findMany.mockResolvedValue([]);
      const timeline = await service.getPatientTimeline('p1');
      const invoiceIds = timeline.filter((t) => t.type === 'INVOICE').map((t) => t.data.id);
      expect(invoiceIds).toEqual(['new']);
      expect(timeline).toHaveLength(51);
    });
  });
});
