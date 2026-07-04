import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ImagingService } from './imaging.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ImagingService', () => {
  let service: ImagingService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ImagingService(prisma as any);
  });

  describe('findOne', () => {
    it('throws when not found', async () => {
      prisma.imagingRecord.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('throws when the patient does not exist', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(service.create({ patientId: 'p1', type: 'PERIAPICAL' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('creates the record for a valid patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.imagingRecord.create.mockResolvedValue({ id: 'img1' });
      const out = await service.create({ patientId: 'p1', type: 'PERIAPICAL' } as any);
      expect(prisma.imagingRecord.create).toHaveBeenCalled();
      expect(out.id).toBe('img1');
    });
  });

  describe('createComparison', () => {
    it('rejects a duplicate comparison', async () => {
      prisma.imagingRecord.findUnique
        .mockResolvedValueOnce({ id: 'base' })
        .mockResolvedValueOnce({ id: 'cmp' });
      prisma.imagingComparison.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.createComparison('base', 'cmp')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
