import { BadRequestException } from '@nestjs/common';
import { GeneralLedgerService } from './general-ledger.service';
import { GL } from './gl-accounts';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('GeneralLedgerService', () => {
  let service: GeneralLedgerService;
  let prisma: PrismaMock;
  let docNum: { next: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    // Resolve every account code to a stable fake id.
    prisma.ledgerAccount.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: `acc-${where.code}` }),
    );
    docNum = { next: jest.fn().mockResolvedValue('JE-26-0001') };
    service = new GeneralLedgerService(prisma as any, docNum as any);
  });

  describe('post', () => {
    it('posts a balanced entry (DR A/R · CR Revenue)', async () => {
      prisma.journalEntry.create.mockResolvedValue({
        id: 'je1',
        entryNumber: 'JE-26-0001',
      });

      const out = await service.post({
        memo: 'Invoice posted',
        sourceType: 'INVOICE',
        sourceId: 'inv1',
        lines: [
          { code: GL.ACCOUNTS_RECEIVABLE, debit: 200 },
          { code: GL.TREATMENT_REVENUE, credit: 200 },
        ],
      });

      expect(out).toEqual({ id: 'je1', entryNumber: 'JE-26-0001' });
      const data = prisma.journalEntry.create.mock.calls[0][0].data;
      const lines = data.lines.create;
      const debit = lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
      const credit = lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
      expect(debit).toBe(200);
      expect(credit).toBe(200);
    });

    it('rejects an unbalanced entry', async () => {
      await expect(
        service.post({
          memo: 'bad',
          lines: [
            { code: GL.CASH_ON_HAND, debit: 100 },
            { code: GL.ACCOUNTS_RECEIVABLE, credit: 50 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('rejects a line that is both a debit and a credit', async () => {
      await expect(
        service.post({
          memo: 'bad',
          lines: [
            { code: GL.CASH_ON_HAND, debit: 100, credit: 100 },
            { code: GL.ACCOUNTS_RECEIVABLE, credit: 100 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns null for an all-zero entry when skipIfZero', async () => {
      const out = await service.post({
        memo: 'noop',
        skipIfZero: true,
        lines: [
          { code: GL.CASH_ON_HAND, debit: 0 },
          { code: GL.ACCOUNTS_RECEIVABLE, credit: 0 },
        ],
      });
      expect(out).toBeNull();
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('reverseEntry', () => {
    it('swaps debit/credit, links the reversal, and voids the original', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue({
        id: 'je1',
        entryNumber: 'JE-26-0001',
        status: 'POSTED',
        sourceId: 'inv1',
        patientId: 'p1',
        reversedBy: null,
        lines: [
          { accountId: 'acc-1100', debit: '200.00', credit: '0.00' },
          { accountId: 'acc-4000', debit: '0.00', credit: '200.00' },
        ],
      });
      docNum.next.mockResolvedValue('JE-26-0002');
      prisma.journalEntry.create.mockResolvedValue({
        id: 'je2',
        entryNumber: 'JE-26-0002',
      });

      const out = await service.reverseEntry('je1', 'mistake', 'user1');

      // Reversal lines are the originals with sides swapped.
      const created = prisma.journalEntry.create.mock.calls[0][0].data;
      expect(created.reversesId).toBe('je1');
      expect(created.lines.create[0]).toMatchObject({
        accountId: 'acc-1100',
        debit: '0.00',
        credit: '200.00',
      });
      expect(created.lines.create[1]).toMatchObject({
        accountId: 'acc-4000',
        debit: '200.00',
        credit: '0.00',
      });

      // Original flipped to VOID.
      expect(prisma.journalEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'je1' },
          data: expect.objectContaining({ status: 'VOID' }),
        }),
      );
      expect(out).toEqual({ id: 'je2', entryNumber: 'JE-26-0002' });
    });

    it('refuses to reverse an already-reversed entry', async () => {
      prisma.journalEntry.findUnique.mockResolvedValue({
        id: 'je1',
        status: 'POSTED',
        lines: [],
        reversedBy: { id: 'jeX' },
      });
      await expect(service.reverseEntry('je1', 'x')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('safePost (optional / non-blocking auto-posting)', () => {
    const lines = [
      { code: GL.ACCOUNTS_RECEIVABLE, debit: 100 },
      { code: GL.TREATMENT_REVENUE, credit: 100 },
    ];

    it('no-ops when auto-posting is disabled via clinic settings', async () => {
      prisma.clinicSettings.findUnique.mockResolvedValue({ value: 'false' });
      const out = await service.safePost({ memo: 'x', lines });
      expect(out).toBeNull();
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('posts by default when no setting row exists (on out of the box)', async () => {
      prisma.clinicSettings.findUnique.mockResolvedValue(null);
      prisma.journalEntry.create.mockResolvedValue({ id: 'je9', entryNumber: 'JE-26-0009' });
      const out = await service.safePost({ memo: 'x', lines });
      expect(out).toEqual({ id: 'je9', entryNumber: 'JE-26-0009' });
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('swallows a posting error so it never blocks the business op', async () => {
      prisma.clinicSettings.findUnique.mockResolvedValue(null); // enabled
      const out = await service.safePost({
        memo: 'unbalanced',
        lines: [
          { code: GL.CASH_ON_HAND, debit: 100 },
          { code: GL.ACCOUNTS_RECEIVABLE, credit: 50 },
        ],
      });
      expect(out).toBeNull(); // caught, not thrown
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('post — line targeting a raw account id (category GL link)', () => {
    it('resolves a line by accountId and validates it exists', async () => {
      // Resolve by raw id (where.id) as well as by code (where.code).
      prisma.ledgerAccount.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id ? { id: where.id } : { id: `acc-${where.code}` }),
      );
      prisma.journalEntry.create.mockResolvedValue({ id: 'je5', entryNumber: 'JE-26-0005' });

      await service.post({
        memo: 'Mapped expense (DR linked account · CR Cash)',
        sourceType: 'EXPENSE',
        sourceId: 'exp1',
        lines: [
          { accountId: 'cat-acc-1', debit: 500 },
          { key: GL.CASH_ON_HAND, credit: 500 },
        ],
      });

      const lines = prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
      expect(lines[0]).toMatchObject({ accountId: 'cat-acc-1', debit: '500.00' });
    });

    it('throws when the accountId does not exist', async () => {
      prisma.ledgerAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.post({
          memo: 'bad account',
          lines: [
            { accountId: 'missing', debit: 10 },
            { key: GL.CASH_ON_HAND, credit: 10 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('hasPostedEntry (settlement gating)', () => {
    it('returns true when a POSTED entry exists for the source', async () => {
      prisma.journalEntry.count.mockResolvedValue(1);
      await expect(service.hasPostedEntry('EXPENSE', 'exp1')).resolves.toBe(true);
      expect(prisma.journalEntry.count).toHaveBeenCalledWith({
        where: { sourceType: 'EXPENSE', sourceId: 'exp1', status: 'POSTED' },
      });
    });

    it('returns false when no POSTED entry exists (unmapped category)', async () => {
      prisma.journalEntry.count.mockResolvedValue(0);
      await expect(service.hasPostedEntry('EXPENSE', 'exp2')).resolves.toBe(false);
    });
  });

  describe('post — invoice with discount & tax (A-1)', () => {
    it('balances DR A/R + DR Discount == CR Revenue + CR Tax', async () => {
      // gross 100, discount 10, taxable 90, tax 18% = 16.20, total = 106.20
      prisma.journalEntry.create.mockResolvedValue({ id: 'je7', entryNumber: 'JE-26-0007' });
      await service.post({
        memo: 'Invoice with discount + tax',
        lines: [
          { code: GL.ACCOUNTS_RECEIVABLE, debit: 106.2 },
          { code: GL.SALES_DISCOUNT, debit: 10 },
          { code: GL.TREATMENT_REVENUE, credit: 100 },
          { code: GL.TAX_PAYABLE, credit: 16.2 },
        ],
      });
      const created = prisma.journalEntry.create.mock.calls[0][0].data.lines.create;
      const debit = created.reduce((s: number, l: any) => s + Number(l.debit), 0);
      const credit = created.reduce((s: number, l: any) => s + Number(l.credit), 0);
      expect(debit).toBeCloseTo(116.2, 2);
      expect(credit).toBeCloseTo(116.2, 2);
    });
  });
});
