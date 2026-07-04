import { ConflictException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SuppliersService(prisma as any);
  });

  describe('create', () => {
    it('rejects a duplicate supplier name', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 's1' });
      await expect(service.create({ name: 'Acme' } as any)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.supplier.create).not.toHaveBeenCalled();
    });

    it('creates a supplier with a unique name', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      prisma.supplier.create.mockResolvedValue({ id: 's1' });
      await expect(service.create({ name: 'Acme' } as any)).resolves.toEqual({ id: 's1' });
    });
  });
});
