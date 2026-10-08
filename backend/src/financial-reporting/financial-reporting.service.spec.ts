import { BadRequestException } from '@nestjs/common';
import { FinancialReportingService } from './financial-reporting.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

/**
 * Wire up just enough of the Prisma surface for the two sales reports to run to
 * completion, then read back the `where` / `orderBy` the service handed to
 * Prisma. That is the contract these tests care about.
 */
function stubInvoiceQueries(prisma: PrismaMock) {
  prisma.invoice.findMany.mockResolvedValue([]);
  prisma.invoice.count.mockResolvedValue(0);
  prisma.invoice.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
  prisma.invoice.groupBy.mockResolvedValue([]);
  prisma.invoiceItem.groupBy.mockResolvedValue([]);
  prisma.visit.findMany.mockResolvedValue([]);
  prisma.receipt.findMany.mockResolvedValue([]);
  prisma.receipt.groupBy.mockResolvedValue([]);
  prisma.receipt.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
}

function stubReceiptQueries(prisma: PrismaMock) {
  prisma.receipt.findMany.mockResolvedValue([]);
  prisma.receipt.count.mockResolvedValue(0);
  prisma.receipt.groupBy.mockResolvedValue([]);
  prisma.receipt.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
}

describe('FinancialReportingService', () => {
  let prisma: PrismaMock;
  let service: FinancialReportingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FinancialReportingService(prisma);
  });

  it('constructs with Prisma', () => {
    expect(service).toBeDefined();
  });

  describe('date range', () => {
    it('resolves both edges in the clinic timezone, not UTC or server-local', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({
        startDate: '2026-10-08',
        endDate: '2026-10-08',
      } as any);

      const { createdAt } = prisma.invoice.findMany.mock.calls[0][0].where;
      // Africa/Kampala is UTC+3, so the clinic day 2026-10-08 00:00:00.000 to
      // 23:59:59.999 spans 2026-10-07T21:00:00Z to 2026-10-08T20:59:59.999Z.
      expect(createdAt.gte.toISOString()).toBe('2026-10-07T21:00:00.000Z');
      expect(createdAt.lte.toISOString()).toBe('2026-10-08T20:59:59.999Z');
    });

    it('accepts a one-sided window', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({ startDate: '2026-10-08' } as any);

      const { createdAt } = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(createdAt.gte.toISOString()).toBe('2026-10-07T21:00:00.000Z');
      expect(createdAt.lte).toBeUndefined();
    });

    it('applies no date filter when neither edge is given', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({} as any);

      expect(
        prisma.invoice.findMany.mock.calls[0][0].where.createdAt,
      ).toBeUndefined();
    });

    it('rejects an unparseable date with 400 rather than failing inside Prisma', async () => {
      stubInvoiceQueries(prisma);

      await expect(
        service.getInvoicesReport({ startDate: 'garbage' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('measures the window on the chosen date basis', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({
        startDate: '2026-10-01',
        endDate: '2026-10-08',
        dateBasis: 'issued',
      } as any);

      const { where } = prisma.invoice.findMany.mock.calls[0][0];
      expect(where.issuedAt).toBeDefined();
      expect(where.createdAt).toBeUndefined();
    });
  });

  describe('getInvoicesReport filters', () => {
    it('narrows by amount range and overdue flag', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({
        minAmount: 50_000,
        maxAmount: 250_000,
        overdueOnly: 'true',
      } as any);

      const { where } = prisma.invoice.findMany.mock.calls[0][0];
      expect(where.total).toEqual({ gte: 50_000, lte: 250_000 });
      expect(where.balance).toEqual({ gt: 0 });
      expect(where.dueDate.lt).toBeInstanceOf(Date);
    });

    it('ignores overdueOnly unless it is explicitly "true"', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({ overdueOnly: 'false' } as any);

      expect(
        prisma.invoice.findMany.mock.calls[0][0].where.balance,
      ).toBeUndefined();
    });

    it('reports billed totals per currency over the whole filtered set', async () => {
      stubInvoiceQueries(prisma);
      prisma.invoice.groupBy.mockImplementation(({ by }: any) =>
        by?.[0] === 'currency'
          ? Promise.resolve([
              {
                currency: 'UGX',
                _count: { _all: 2 },
                _sum: { total: 300, amountPaid: 100, balance: 200 },
              },
            ])
          : Promise.resolve([]),
      );

      const result = await service.getInvoicesReport({} as any);

      expect(result.summary.billedByCurrency).toEqual([
        {
          currency: 'UGX',
          billed: 300,
          collected: 100,
          outstanding: 200,
          count: 2,
        },
      ]);
    });

    it('honours the extended sort whitelist', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({
        sortBy: 'issuedAt',
        sortOrder: 'asc',
      } as any);

      expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({
        issuedAt: 'asc',
      });
    });

    it('falls back to createdAt for an unknown sort key', async () => {
      stubInvoiceQueries(prisma);

      await service.getInvoicesReport({ sortBy: 'nonsense' } as any);

      expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });
  });

  describe('getReceiptsReport filters', () => {
    it('merges the patient and doctor filters into one invoice clause', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({
        patientId: 'p1',
        dentistId: 'd1',
      } as any);

      const { where } = prisma.receipt.findMany.mock.calls[0][0];
      expect(where.invoice).toEqual({
        patientId: 'p1',
        visit: { dentistId: 'd1' },
      });
    });

    it('matches a payment method on the payment row or on legacy metadata', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({ method: 'CASH' } as any);

      const { where } = prisma.receipt.findMany.mock.calls[0][0];
      expect(where.AND).toEqual([
        {
          OR: [
            { payment: { method: 'CASH' } },
            { metadata: { path: ['method'], equals: 'CASH' } },
          ],
        },
      ]);
    });

    it('keeps the search OR intact alongside a method filter', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({
        search: 'RCP-1',
        method: 'CASH',
      } as any);

      const { where } = prisma.receipt.findMany.mock.calls[0][0];
      expect(Array.isArray(where.OR)).toBe(true);
      expect(where.AND).toHaveLength(1);
    });

    it('narrows by cashier and amount range', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({
        receivedById: 'u1',
        minAmount: 10,
      } as any);

      const { where } = prisma.receipt.findMany.mock.calls[0][0];
      expect(where.receivedById).toBe('u1');
      expect(where.amountReceived).toEqual({ gte: 10 });
    });

    it('defaults to ACTIVE receipts and honours status=ALL', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({} as any);
      expect(prisma.receipt.findMany.mock.calls[0][0].where.status).toBe(
        'ACTIVE',
      );

      prisma.receipt.findMany.mockClear();
      await service.getReceiptsReport({ status: 'ALL' } as any);
      expect(
        prisma.receipt.findMany.mock.calls[0][0].where.status,
      ).toBeUndefined();
    });

    it('sorts on the newly whitelisted receipt columns', async () => {
      stubReceiptQueries(prisma);

      await service.getReceiptsReport({
        sortBy: 'receiptNumber',
        sortOrder: 'asc',
      } as any);

      expect(prisma.receipt.findMany.mock.calls[0][0].orderBy).toEqual({
        receiptNumber: 'asc',
      });
    });

    it('falls back to generatedAt for a sort key this report cannot serve', async () => {
      stubReceiptQueries(prisma);

      // The UI used to carry createdAt over from the invoices tab.
      await service.getReceiptsReport({ sortBy: 'createdAt' } as any);

      expect(prisma.receipt.findMany.mock.calls[0][0].orderBy).toEqual({
        generatedAt: 'desc',
      });
    });
  });
});
