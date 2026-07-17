// src/billing/invoice-lifecycle-currency.spec.ts
// ─────────────────────────────────────────────────────────────────────────────
// Spec: Adding Procedure → invoice creation currency rules
//   • If a DRAFT already exists for the visit/plan → reuse it, never change
//     its currency (first caller's choice wins).
//   • If no DRAFT + partial payment (deposit provided) → new invoice currency
//     = the deposit currency (initialPaymentCurrency), rate = the live
//     base→deposit rate.
//   • If no DRAFT + pay in full + non-base procedure → new invoice currency
//     = the procedure currency, rate = inverse of the procedure's source→base
//     snapshot (the stored invoice rate is always base→invoice).
//   • If no DRAFT + base-currency procedure OR no deposit info → fall back
//     to the clinic base currency (UGX), rate = 1.
// ─────────────────────────────────────────────────────────────────────────────

import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';
import { CurrencyService } from './currency.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { InvoiceStatus } from '@prisma/client';

function makeService() {
  const prisma = createPrismaMock();
  const currency = createAutoMock() as unknown as CurrencyService;
  const docNum = createAutoMock() as unknown as DocumentNumberService;
  const gl = createAutoMock() as unknown as GeneralLedgerService;

  // Default base currency
  (currency.getBaseCurrency as jest.Mock).mockReturnValue('UGX');
  (currency.convert as jest.Mock).mockImplementation(async (amt: number) => ({
    amount: amt,
    rate: 1,
    from: 'USD',
    to: 'UGX',
  }));
  // Live rate: 1 USD = 3700 UGX (both directions)
  (currency.getExchangeRate as jest.Mock).mockImplementation(
    async (from: string, to: string) => {
      if (from === to) return 1;
      if (from === 'USD' && to === 'UGX') return 3700;
      return 1 / 3700;
    },
  );

  // Default doc number — just resolve to a fixed string
  (docNum.next as jest.Mock).mockImplementation(async (prefix: string) => {
    return `${prefix}-TEST-0001`;
  });

  return { prisma, currency, docNum, gl };
}

const baseTp = {
  id: 'tp-1',
  description: 'Filling #16',
  quantity: 1,
  pricePerUnit: 100,
  discountAmount: 0,
  taxAmount: 0,
  totalPrice: 100,
  currency: 'USD',
  exchangeRate: 3700,
  baseAmount: 370000,
};

describe('InvoiceLifecycleService — Adding Procedure spec: invoice currency', () => {
  describe('getOrCreateDraft', () => {
    it('reuses an existing DRAFT and does not change its currency', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-existing',
        currency: 'USD',
        status: InvoiceStatus.DRAFT,
      });

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      const inv = await svc.getOrCreateDraft('p1', 'v1', 'plan1', {
        currency: 'UGX',
        exchangeRate: 1,
      });

      expect(inv.id).toBe('inv-existing');
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('creates a new DRAFT in the caller-supplied currency (e.g. USD)', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      const inv = await svc.getOrCreateDraft('p1', 'v1', 'plan1', {
        currency: 'USD',
        exchangeRate: 3700,
      });

      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.currency).toBe('USD');
      expect(Number(createArg.data.exchangeRate)).toBe(3700);
      expect(createArg.data.baseCurrency).toBe('UGX');
      expect(inv.id).toBe('inv-new');
    });

    it('falls back to base currency (UGX) when no options passed', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      await svc.getOrCreateDraft('p1', 'v1', 'plan1');

      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.currency).toBe('UGX');
      expect(Number(createArg.data.exchangeRate)).toBe(1);
    });
  });

  describe('addProcedureItem — DRAFT branch currency decision', () => {
    it('uses the deposit currency when partial payment is provided', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      // No existing POSTED invoice
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // active POSTED lookup
        .mockResolvedValueOnce(null); // existing DRAFT lookup
      prisma.invoice.create.mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));
      prisma.invoiceItem.findFirst.mockResolvedValue(null);
      prisma.invoiceItem.create.mockImplementation(async ({ data }: any) => ({
        id: 'item-1',
        ...data,
      }));
      prisma.invoice.update.mockResolvedValue({ id: 'inv-new' });
      prisma.recalcDraft = jest.fn();

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      // re-bind recalcDraft on the instance so the call lands in the mock
      (svc as any).recalcDraft = prisma.recalcDraft;

      await svc.addProcedureItem(
        'p1',
        'v1',
        'plan1',
        baseTp,
        50, // partial amount
        'USD', // partial currency
      );

      // The new invoice must be in USD (deposit currency), rate = live
      // base→invoice (UGX→USD).
      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.currency).toBe('USD');
      expect(Number(createArg.data.exchangeRate)).toBeCloseTo(1 / 3700, 8);
      // Deposit fields written
      const updateArg = prisma.invoice.update.mock.calls[0][0];
      expect(updateArg.data.initialPaymentAmount).toBe(50);
      expect(updateArg.data.initialPaymentCurrency).toBe('USD');
    });

    it('uses the procedure currency when paying in full (non-base)', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // no POSTED
        .mockResolvedValueOnce(null); // no DRAFT
      prisma.invoice.create.mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));
      prisma.invoiceItem.findFirst.mockResolvedValue(null);
      prisma.invoiceItem.create.mockImplementation(async ({ data }: any) => ({
        id: 'item-1',
        ...data,
      }));
      prisma.recalcDraft = jest.fn();

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      (svc as any).recalcDraft = prisma.recalcDraft;

      await svc.addProcedureItem('p1', 'v1', 'plan1', baseTp, null, null);

      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.currency).toBe('USD');
      // Inverse of the procedure's source→base snapshot (3700).
      expect(Number(createArg.data.exchangeRate)).toBeCloseTo(1 / 3700, 8);
    });

    it('falls back to base currency for a base-currency procedure paying in full', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.invoice.create.mockImplementation(async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }));
      prisma.invoiceItem.findFirst.mockResolvedValue(null);
      prisma.invoiceItem.create.mockImplementation(async ({ data }: any) => ({
        id: 'item-1',
        ...data,
      }));
      prisma.recalcDraft = jest.fn();

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      (svc as any).recalcDraft = prisma.recalcDraft;

      const ugxTp = {
        ...baseTp,
        currency: 'UGX',
        exchangeRate: 1,
        baseAmount: 100000,
      };
      await svc.addProcedureItem('p1', 'v1', 'plan1', ugxTp, null, null);

      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.currency).toBe('UGX');
      expect(Number(createArg.data.exchangeRate)).toBe(1);
    });

    it('reuses an existing DRAFT without changing its currency', async () => {
      const { prisma, currency, docNum, gl } = makeService();
      prisma.invoice.findFirst
        .mockResolvedValueOnce(null) // no POSTED
        .mockResolvedValueOnce({
          // existing DRAFT in UGX
          id: 'inv-existing',
          currency: 'UGX',
          status: InvoiceStatus.DRAFT,
        });
      prisma.invoiceItem.findFirst.mockResolvedValue(null);
      prisma.invoiceItem.create.mockImplementation(async ({ data }: any) => ({
        id: 'item-1',
        ...data,
      }));
      prisma.recalcDraft = jest.fn();

      const svc = new InvoiceLifecycleService(
        prisma as any,
        currency as any,
        docNum as any,
        gl as any,
      );
      (svc as any).recalcDraft = prisma.recalcDraft;

      // Caller tried to claim a USD invoice with a USD deposit, but the
      // existing DRAFT is in UGX — the spec says: existing draft wins, do
      // not change the currency. The line item is converted to UGX.
      const usdTp = { ...baseTp, currency: 'USD' };
      await svc.addProcedureItem('p1', 'v1', 'plan1', usdTp, 50, 'USD');

      expect(prisma.invoice.create).not.toHaveBeenCalled();
      // Line item was created on the existing UGX invoice
      const itemCreateArg = prisma.invoiceItem.create.mock.calls[0][0];
      expect(itemCreateArg.data.invoiceId).toBe('inv-existing');
    });
  });
});
