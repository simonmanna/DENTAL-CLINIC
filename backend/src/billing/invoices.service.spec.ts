// src/billing/invoices.service.spec.ts
//
// Unit tests for InvoicesService.getPatientInvoices — the production filter
// surface for the billing page (post-2026-06-22 hardening).
//
// Covers:
//   • enum validation (status, paymentStatus, sortBy, sortDir)
//   • invalid-date guard (dateFrom / dateTo)
//   • where-clause compilation for every supported filter
//   • page/limit clamping (page ≥ 1, 1 ≤ limit ≤ 200)
//   • appliedFilters echo in the meta block
//   • invalid status no longer surfaces as Prisma 500 — throws 400 instead
//   • empty search string is treated as no-search (no OR clause added)
//
// Uses createPrismaMock from src/test-utils/prisma-mock — no DB connection.
import { InvoicesService } from './invoices.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('InvoicesService.getPatientInvoices', () => {
  let svc: InvoicesService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    // Default: return empty array + 0 total so pagination math is deterministic.
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.invoice.count.mockResolvedValue(0);
    svc = new InvoicesService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  // ── Happy path: minimal args ─────────────────────────────────────────
  it('returns paginated empty result for default args', async () => {
    const out = await svc.getPatientInvoices({});
    expect(out.data).toEqual([]);
    expect(out.meta).toMatchObject({
      total: 0,
      page: 1,
      limit: 25,
      totalPages: 1,
    });
    expect(prisma.invoice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.invoice.count).toHaveBeenCalledTimes(1);
  });

  // ── Pagination clamp ────────────────────────────────────────────────
  describe('pagination clamping', () => {
    it('clamps page=0 to 1 and limit=9999 to 200', async () => {
      await svc.getPatientInvoices({ page: 0, limit: 9999 });
      const findArgs = prisma.invoice.findMany.mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(200);
    });

    it('clamps limit=0 to 1', async () => {
      await svc.getPatientInvoices({ limit: 0 });
      expect(prisma.invoice.findMany.mock.calls[0][0].take).toBe(1);
    });

    it('defaults page=1 and limit=25 when omitted', async () => {
      await svc.getPatientInvoices({});
      const findArgs = prisma.invoice.findMany.mock.calls[0][0];
      expect(findArgs.skip).toBe(0);
      expect(findArgs.take).toBe(25);
    });
  });

  // ── Sort compilation ────────────────────────────────────────────────
  describe('sort', () => {
    it('defaults to createdAt desc', async () => {
      await svc.getPatientInvoices({});
      expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('honours sortBy=total + sortDir=asc', async () => {
      await svc.getPatientInvoices({ sortBy: 'total', sortDir: 'asc' });
      expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({
        total: 'asc',
      });
    });

    it('honours sortBy=balance desc', async () => {
      await svc.getPatientInvoices({ sortBy: 'balance' });
      expect(prisma.invoice.findMany.mock.calls[0][0].orderBy).toEqual({
        balance: 'desc',
      });
    });
  });

  // ── Enum validation (the bug from the live audit) ──────────────────
  describe('enum validation', () => {
    it('rejects invalid status with 400 (not 500)', async () => {
      await expect(
        svc.getPatientInvoices({ status: '__NOPE__' }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid status "__NOPE__"'),
      });
      // Critical: must NOT have called Prisma — the bad value was caught first.
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('accepts "ALL" as a no-op for status', async () => {
      await svc.getPatientInvoices({ status: 'ALL' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });

    it('rejects invalid paymentStatus with 400', async () => {
      await expect(
        svc.getPatientInvoices({ paymentStatus: 'NOT_A_STATUS' }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid paymentStatus'),
      });
    });

    it('accepts all three valid payment statuses', async () => {
      for (const s of ['UNPAID', 'PARTIALLY_PAID', 'PAID']) {
        prisma.invoice.findMany.mockClear();
        prisma.invoice.count.mockClear();
        await svc.getPatientInvoices({ paymentStatus: s as any });
        const where = prisma.invoice.count.mock.calls[0][0].where;
        expect(where.paymentStatus).toBe(s);
      }
    });

    it('rejects invalid sortBy', async () => {
      await expect(
        svc.getPatientInvoices({ sortBy: 'randomColumn' as any }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects invalid sortDir', async () => {
      await expect(
        svc.getPatientInvoices({ sortDir: 'sideways' as any }),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── Date guard ──────────────────────────────────────────────────────
  describe('date parsing', () => {
    it('rejects invalid dateFrom with 400', async () => {
      await expect(
        svc.getPatientInvoices({ dateFrom: 'not-a-date' }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid dateFrom'),
      });
    });

    it('rejects invalid dateTo with 400', async () => {
      await expect(
        svc.getPatientInvoices({ dateTo: 'garbage' }),
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid dateTo'),
      });
    });

    it('compiles valid ISO dateFrom into gte', async () => {
      await svc.getPatientInvoices({ dateFrom: '2026-01-01T00:00:00.000Z' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeUndefined();
    });

    it('compiles both dateFrom and dateTo into gte + lte', async () => {
      await svc.getPatientInvoices({
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
      });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  // ── Where-clause compilation ───────────────────────────────────────
  describe('where compilation', () => {
    it('compiles patientId / visitId / status / paymentStatus', async () => {
      await svc.getPatientInvoices({
        patientId: 'p-1',
        visitId: 'v-1',
        status: 'DRAFT',
        paymentStatus: 'PARTIALLY_PAID',
      });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where).toMatchObject({
        patientId: 'p-1',
        visitId: 'v-1',
        status: 'DRAFT',
        paymentStatus: 'PARTIALLY_PAID',
      });
    });

    it('compiles currency + baseCurrency', async () => {
      await svc.getPatientInvoices({ currency: 'USD', baseCurrency: 'UGX' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where).toMatchObject({ currency: 'USD', baseCurrency: 'UGX' });
    });

    it('compiles dentistId into visit.dentistId relation', async () => {
      await svc.getPatientInvoices({ dentistId: 'd-42' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.visit).toEqual({ dentistId: 'd-42' });
    });
  });

  // ── Free-text search ───────────────────────────────────────────────
  describe('search', () => {
    it('compiles search into OR across invoiceNumber + patient fields', async () => {
      await svc.getPatientInvoices({ search: 'INV-26' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(4);
      // Sanity: OR clauses contain each searchable field.
      const flat = JSON.stringify(where.OR);
      expect(flat).toContain('invoiceNumber');
      expect(flat).toContain('firstName');
      expect(flat).toContain('lastName');
      expect(flat).toContain('patientCode');
    });

    it('uses mode: "insensitive" so search is case-insensitive', async () => {
      await svc.getPatientInvoices({ search: 'john' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      // OR clauses are nested: { patient: { firstName: { contains, mode } } }
      // Walk one extra level to reach the leaf mode field.
      for (const clause of where.OR) {
        const wrapper: any = Object.values(clause)[0];
        // either the wrapper is itself the field, or it wraps one (e.g. patient).
        const field = wrapper.contains ? wrapper : Object.values(wrapper)[0];
        expect(field.mode).toBe('insensitive');
        expect(field.contains).toBe('john');
      }
    });

    it('ignores empty / whitespace search strings', async () => {
      await svc.getPatientInvoices({ search: '   ' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });

    it('trims the search query', async () => {
      await svc.getPatientInvoices({ search: '  INV-26  ' });
      const where = prisma.invoice.count.mock.calls[0][0].where;
      const flat = JSON.stringify(where.OR);
      expect(flat).toContain('INV-26');
      expect(flat).not.toContain('  INV-26  ');
    });
  });

  // ── Echo applied filters in meta ────────────────────────────────────
  describe('meta.appliedFilters', () => {
    it('echoes the applied filter set (so the frontend can render "X of Y matching <filters>")', async () => {
      const out = await svc.getPatientInvoices({
        status: 'POSTED',
        paymentStatus: 'PARTIALLY_PAID',
        currency: 'USD',
        search: 'INV-26',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
        dentistId: 'd-1',
        sortBy: 'total',
        sortDir: 'asc',
      });
      expect(out.meta.appliedFilters).toEqual({
        patientId: null,
        visitId: null,
        status: 'POSTED',
        paymentStatus: 'PARTIALLY_PAID',
        currency: 'USD',
        baseCurrency: null,
        search: 'INV-26',
        dateFrom: '2026-01-01T00:00:00.000Z',
        dateTo: '2026-12-31T23:59:59.999Z',
        dentistId: 'd-1',
        sortBy: 'total',
        sortDir: 'asc',
      });
    });

    it('serialises absent filters as "ALL" / null in appliedFilters', async () => {
      const out = await svc.getPatientInvoices({});
      expect(out.meta.appliedFilters).toMatchObject({
        status: 'ALL',
        paymentStatus: 'ALL',
        patientId: null,
        visitId: null,
        currency: null,
        baseCurrency: null,
        search: null,
        dateFrom: null,
        dateTo: null,
        dentistId: null,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });
    });
  });

  // ── totalPages floor ───────────────────────────────────────────────
  it('totalPages is always ≥ 1 (even for empty result set)', async () => {
    prisma.invoice.count.mockResolvedValue(0);
    const out = await svc.getPatientInvoices({ limit: 25 });
    expect(out.meta.totalPages).toBe(1);
  });
});
