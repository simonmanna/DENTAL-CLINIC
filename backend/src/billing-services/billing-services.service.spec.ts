import { ConflictException, BadRequestException } from '@nestjs/common';
import { BillingServicesService } from './billing-services.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('BillingServicesService', () => {
  let service: BillingServicesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BillingServicesService(prisma as any);
  });

  describe('create', () => {
    it('rejects a duplicate service code', async () => {
      prisma.billingService.findUnique.mockResolvedValue({ id: 'b1' });
      await expect(
        service.create({ serviceCode: 'S1', price: 10 } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an inverted price range', async () => {
      prisma.billingService.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ serviceCode: 'S1', price: 10, priceRangeMin: 50, priceRangeMax: 5 } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a valid service', async () => {
      prisma.billingService.findUnique.mockResolvedValue(null);
      prisma.billingService.create.mockResolvedValue({ id: 'b1' });
      const out = await service.create({ serviceCode: 'S1', price: 10 } as any);
      expect(out).toEqual({ id: 'b1' });
    });
  });
});
