import { NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AccountsService(prisma as any);
  });

  describe('findOne', () => {
    it('throws when the account is missing', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('clears the previous default when creating a new default account', async () => {
      prisma.account.create.mockResolvedValue({ id: 'a1' });
      await service.create({ name: 'Cash', type: 'CASH', isDefault: true } as any);
      expect(prisma.account.updateMany).toHaveBeenCalled(); // unset prior default
      expect(prisma.account.create).toHaveBeenCalled();
    });

    it('does not touch existing defaults for a non-default account', async () => {
      prisma.account.create.mockResolvedValue({ id: 'a2' });
      await service.create({ name: 'Bank', type: 'BANK' } as any);
      expect(prisma.account.updateMany).not.toHaveBeenCalled();
    });
  });
});
