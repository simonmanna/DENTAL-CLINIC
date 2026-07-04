import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProceduresService } from './procedures.service';
import { createPrismaMock, createAutoMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ProceduresService', () => {
  let service: ProceduresService;
  let prisma: PrismaMock;
  let ledger: any;

  beforeEach(() => {
    prisma = createPrismaMock();
    ledger = createAutoMock();
    service = new ProceduresService(prisma as any, ledger);
  });

  describe('findOneProcedure', () => {
    it('throws when not found', async () => {
      prisma.procedure.findUnique.mockResolvedValue(null);
      await expect(service.findOneProcedure('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteProcedure', () => {
    it('throws when not found', async () => {
      prisma.procedure.findUnique.mockResolvedValue(null);
      await expect(service.deleteProcedure('x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks deleting a procedure used in visits', async () => {
      prisma.procedure.findUnique.mockResolvedValue({ id: 'p1', _count: { visitProcedures: 2 } });
      await expect(service.deleteProcedure('p1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.procedure.delete).not.toHaveBeenCalled();
    });

    it('deletes an unused procedure', async () => {
      prisma.procedure.findUnique.mockResolvedValue({ id: 'p1', _count: { visitProcedures: 0 } });
      prisma.procedure.delete.mockResolvedValue({ id: 'p1' });
      const out = await service.deleteProcedure('p1');
      expect(prisma.procedure.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(out.message).toMatch(/deleted/i);
    });
  });

  describe('createProcedure', () => {
    it('creates the category when missing then the procedure', async () => {
      prisma.procedureCategory.findFirst.mockResolvedValue(null);
      prisma.procedureCategory.create.mockResolvedValue({ id: 'cat1' });
      prisma.procedure.create.mockResolvedValue({ id: 'pr1' });
      await service.createProcedure({ name: 'X', category: 'Endo', baseCost: 100 } as any);
      expect(prisma.procedureCategory.create).toHaveBeenCalled();
      const arg = prisma.procedure.create.mock.calls[0][0];
      expect(arg.data.categoryId).toBe('cat1');
    });
  });
});
