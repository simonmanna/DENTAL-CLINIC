import { BadRequestException } from '@nestjs/common';
import { NetReportService } from './net-report.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('NetReportService', () => {
  let prisma: PrismaMock;
  let service: NetReportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new NetReportService(prisma);
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.receipt.findMany.mockResolvedValue([]);
    prisma.payment.findMany.mockResolvedValue([]);
  });

  it('rejects an unknown basis', async () => {
    await expect(service.getNetReport({ basis: 'nope' })).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('sales-expenses', () => {
    it('nets non-void invoices against approved/posted expenses in base currency', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'i1',
          invoiceNumber: 'INV-1',
          createdAt: new Date('2026-10-01T08:00:00Z'),
          status: 'DRAFT',
          currency: 'USD',
          total: 100,
          baseTotal: 360000,
          exchangeRate: 3600,
          patient: { firstName: 'A', lastName: 'B' },
        },
        {
          id: 'i2',
          invoiceNumber: 'INV-2',
          createdAt: new Date('2026-10-02T08:00:00Z'),
          status: 'POSTED',
          currency: 'UGX',
          total: 50000,
          baseTotal: 0, // unset base → falls back to total × rate
          exchangeRate: 1,
          patient: null,
        },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        {
          id: 'e1',
          expenseCode: 'EXP-1',
          expenseDate: new Date('2026-10-01T10:00:00Z'),
          title: 'Rent',
          categoryName: 'Rent',
          amount: 110000,
          supplier: null,
        },
      ]);

      const r = await service.getNetReport({
        basis: 'sales-expenses',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      const invWhere = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(invWhere.status).toEqual({ not: 'VOID' });
      expect(invWhere.deletedAt).toBeNull();
      expect(invWhere.createdAt.gte).toBeInstanceOf(Date);
      const expWhere = prisma.expense.findMany.mock.calls[0][0].where;
      expect(expWhere.status).toEqual({ in: ['APPROVED', 'POSTED'] });

      expect(r.totals).toMatchObject({ in: 410000, out: 110000, net: 300000 });
      expect(r.inByCurrency.map((c: any) => c.currency)).toEqual(['USD', 'UGX']);
      expect(r.periods.map((p: any) => [p.period, p.net])).toEqual([
        ['2026-10-01', 250000],
        ['2026-10-02', 50000],
      ]);
      expect(r.lines.map((l: any) => l.runningNet)).toEqual([360000, 250000, 300000]);
    });
  });

  describe('receipts-payments', () => {
    it('reads receipts plus unreceipted IN payments and outgoing cash payments', async () => {
      prisma.receipt.findMany.mockResolvedValue([
        {
          id: 'r1',
          receiptNumber: 'RCT-1',
          generatedAt: new Date('2026-10-03T08:00:00Z'),
          currencyCode: 'UGX',
          amountReceived: 80000,
          baseAmountReceived: 80000,
          exchangeRate: 1,
          paymentMethod: 'CASH',
          payment: null,
          invoice: { invoiceNumber: 'INV-1', patient: null },
        },
      ]);
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'p1',
          paymentCode: 'PAY-1',
          type: 'EXPENSE',
          direction: 'OUT',
          paidAt: new Date('2026-10-03T09:00:00Z'),
          method: 'CASH',
          currency: 'UGX',
          amount: 30000,
          baseAmount: 30000,
          exchangeRate: 1,
          expense: { title: 'Water', categoryName: 'Utilities', supplier: null },
          purchaseOrder: null,
          invoice: null,
        },
      ]);

      const r = await service.getNetReport({
        basis: 'receipts-payments',
        groupBy: 'month',
      });

      const payWhere = prisma.payment.findMany.mock.calls[0][0].where;
      expect(payWhere.status).toBe('COMPLETED');
      expect(payWhere.OR).toEqual([
        { direction: 'OUT' },
        { direction: 'IN', receipts: { none: {} } },
      ]);
      expect(r.totals).toMatchObject({ in: 80000, out: 30000, net: 50000 });
      expect(r.periods).toEqual([
        expect.objectContaining({ period: '2026-10', net: 50000 }),
      ]);
      expect(r.inBreakdown).toEqual([{ label: 'Cash', amount: 80000, count: 1 }]);
      expect(r.outBreakdown).toEqual([{ label: 'Utilities', amount: 30000, count: 1 }]);
    });
  });
});
