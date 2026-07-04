import { ReceiptsService } from './receipts.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    const gl = { reverseBySource: jest.fn() } as any;
    service = new ReceiptsService(prisma as any, gl);
  });

  describe('findAll', () => {
    it('returns paginated data + meta', async () => {
      prisma.receipt.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.receipt.count.mockResolvedValue(1);
      const out = await service.findAll({ page: 1, limit: 15 } as any);
      expect(out.data).toHaveLength(1);
      expect(out.meta.total).toBe(1);
    });

    it('filters by patient through the invoice relation', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ patientId: 'p1' } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.invoice).toEqual({ patientId: 'p1' });
    });

    it('filters by status / currency / paymentMethod (exact match)', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({
        status: 'ACTIVE',
        currencyCode: 'UGX',
        paymentMethod: 'CASH',
      } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.status).toBe('ACTIVE');
      expect(arg.where.currencyCode).toBe('UGX');
      // paymentMethod is expressed as an OR over both the relation and the
      // denormalised field — assert both branches are present.
      expect(arg.where.OR).toEqual([
        { payment: { method: 'CASH' } },
        { paymentMethod: 'CASH' },
      ]);
    });

    it('wires up search across receipt / invoice / patient / payment', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ search: 'Jane' } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.OR).toBeDefined();
      const branches = JSON.stringify(arg.where.OR);
      expect(branches).toContain('receiptNumber');
      expect(branches).toContain('invoiceNumber');
      expect(branches).toContain('firstName');
      expect(branches).toContain('lastName');
      expect(branches).toContain('patientCode');
      expect(branches).toContain('reference');
      expect(branches).toContain('notes');
    });

    it('ANDs search OR with paymentMethod OR when both are set', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ search: 'Jane', paymentMethod: 'MTN_MOBILE_MONEY' } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.OR).toBeUndefined();
      expect(arg.where.AND).toHaveLength(2);
      const flat = JSON.stringify(arg.where.AND);
      expect(flat).toContain('MTN_MOBILE_MONEY');
      expect(flat).toContain('Jane');
    });

    it('treats endDate as end-of-day inclusive', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ startDate: '2026-01-01', endDate: '2026-01-31' } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.generatedAt.gte).toEqual(new Date('2026-01-01'));
      const lte = arg.where.generatedAt.lte as Date;
      expect(lte.getFullYear()).toBe(2026);
      expect(lte.getMonth()).toBe(0); // January
      expect(lte.getDate()).toBe(31);
      expect(lte.getHours()).toBe(23);
      expect(lte.getMinutes()).toBe(59);
      expect(lte.getSeconds()).toBe(59);
    });

    it('filters by amount range', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ minAmount: 1000, maxAmount: 50000 } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.amountReceived).toEqual({ gte: 1000, lte: 50000 });
    });

    it('combines multiple filters (search + status + patient + date + amount)', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({
        search: 'INV-26',
        status: 'ACTIVE',
        patientId: 'p1',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        minAmount: 500,
      } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.status).toBe('ACTIVE');
      expect(arg.where.invoice).toEqual({ patientId: 'p1' });
      expect(arg.where.generatedAt.gte).toEqual(new Date('2026-01-01'));
      expect(arg.where.generatedAt.lte).toBeInstanceOf(Date);
      expect(arg.where.amountReceived).toEqual({ gte: 500 });
      expect(arg.where.OR).toBeDefined(); // search OR
    });

    it('ignores an empty / whitespace search', async () => {
      prisma.receipt.findMany.mockResolvedValue([]);
      prisma.receipt.count.mockResolvedValue(0);
      await service.findAll({ search: '   ' } as any);
      const arg = prisma.receipt.findMany.mock.calls[0][0];
      expect(arg.where.OR).toBeUndefined();
      expect(arg.where.AND).toBeUndefined();
    });
  });
});
