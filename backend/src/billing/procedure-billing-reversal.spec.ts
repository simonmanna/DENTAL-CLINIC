// Spec: reversing / reinstating a treatment procedure's billing.
//   • DRAFT invoice  → line voided, invoice re-totalled in the same tx, no GL.
//   • POSTED invoice → line + CHARGE rows voided, re-totalled, GL recognition
//                      reconciled; any overpayment is reported as refundDue.
//   • Reinstate      → VOID line re-activated (CHARGE row + GL for POSTED), or
//                      needsNewItem when nothing reusable is left.
//   • GL sync        → only ACTIVE lines count, entry balances by construction.
import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { InvoiceGlSyncService } from './invoice-gl-sync.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';
import { InvoiceStatus } from '@prisma/client';
import { M } from '../common/money/money';

function makeLifecycle() {
  const prisma = createPrismaMock();
  const currency = createAutoMock();
  const docNum = createAutoMock();
  const gl = createAutoMock();
  const glSync = { syncInvoiceRevenueGl: jest.fn() };
  (currency.getBaseCurrency as jest.Mock).mockReturnValue('UGX');
  (docNum.next as jest.Mock).mockResolvedValue('LE-26-0001');
  // recalcInvoiceAtomicTx → one RETURNING row
  prisma.$queryRaw.mockResolvedValue([
    {
      version: BigInt(2),
      total: '0.00',
      baseTotal: '0.00',
      paymentStatus: 'PAID',
    },
  ]);
  const svc = new InvoiceLifecycleService(
    prisma,
    currency,
    docNum,
    gl,
    glSync as any,
  );
  return { prisma, svc, glSync };
}

const item = (status: InvoiceStatus) => ({
  id: 'item1',
  description: 'Composite filling (Tooth: 16)',
  quantity: 1,
  unitPrice: '100.00',
  discount: '0.00',
  total: '100.00',
  originalTotal: '100.00',
  originalCurrency: 'UGX',
  exchangeRate: '1',
  invoiceId: 'inv1',
  invoice: {
    id: 'inv1',
    invoiceNumber: 'INV-26-0001',
    status,
    currency: 'UGX',
    patientId: 'p1',
    visitId: 'v1',
    exchangeRate: '1',
  },
});

describe('InvoiceLifecycleService.reverseProcedureBillingTx', () => {
  it('POSTED: voids the line + CHARGE rows, re-totals in-tx, reconciles GL and reports the refund due', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValue(item(InvoiceStatus.POSTED));
    glSync.syncInvoiceRevenueGl.mockResolvedValue({
      id: 'je1',
      entryNumber: 'JE-26-0009',
    });
    // After the line is gone the patient has paid 150 against a 100 total.
    prisma.invoice.findUnique.mockResolvedValue({
      amountPaid: '150.00',
      total: '100.00',
    });

    const out = await svc.reverseProcedureBillingTx(
      prisma,
      'tp1',
      'patient declined',
      'user-1',
    );

    expect(prisma.ledgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceId: 'tp1',
          status: { not: 'VOID' },
        }),
        data: expect.objectContaining({ status: 'VOID' }),
      }),
    );
    expect(prisma.invoiceItem.findFirst.mock.calls[0][0].where).toEqual({
      treatmentProcedureId: 'tp1',
      status: 'ACTIVE',
    });
    expect(prisma.invoiceItem.update).toHaveBeenCalledWith({
      where: { id: 'item1' },
      data: { status: 'VOID' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // in-tx recalc
    expect(glSync.syncInvoiceRevenueGl).toHaveBeenCalledWith(
      'inv1',
      prisma,
      expect.objectContaining({ postedById: 'user-1' }),
    );
    expect(out).toEqual({
      invoiceId: 'inv1',
      invoiceNumber: 'INV-26-0001',
      invoiceStatus: InvoiceStatus.POSTED,
      glAdjusted: true,
      refundDue: '50.00',
      currency: 'UGX',
    });
  });

  it('DRAFT: voids the line and re-totals, never touches the GL', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValue(item(InvoiceStatus.DRAFT));
    prisma.invoice.findUnique.mockResolvedValue({
      amountPaid: '0.00',
      total: '0.00',
    });

    const out = await svc.reverseProcedureBillingTx(
      prisma,
      'tp1',
      'dup',
      'user-1',
    );

    expect(prisma.invoiceItem.update).toHaveBeenCalled();
    expect(glSync.syncInvoiceRevenueGl).not.toHaveBeenCalled();
    expect(out.glAdjusted).toBe(false);
    expect(out.refundDue).toBe('0.00');
  });

  it('no active line: nothing to reverse', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValue(null);

    const out = await svc.reverseProcedureBillingTx(prisma, 'tp1');

    expect(out.invoiceId).toBeNull();
    expect(prisma.invoiceItem.update).not.toHaveBeenCalled();
    expect(glSync.syncInvoiceRevenueGl).not.toHaveBeenCalled();
  });
});

describe('InvoiceLifecycleService.reinstateProcedureBillingTx', () => {
  it('does nothing when the procedure already has a live line', async () => {
    const { prisma, svc } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValueOnce({ invoiceId: 'inv1' });

    const out = await svc.reinstateProcedureBillingTx(prisma, 'tp1', 'user-1');

    expect(out).toEqual({
      invoiceId: 'inv1',
      reinstated: false,
      needsNewItem: false,
    });
    expect(prisma.invoiceItem.update).not.toHaveBeenCalled();
  });

  it('POSTED: re-activates the line, writes a CHARGE row and reconciles the GL', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoiceItem.findFirst
      .mockResolvedValueOnce(null) // no active line
      .mockResolvedValueOnce(item(InvoiceStatus.POSTED)); // last VOID line

    const out = await svc.reinstateProcedureBillingTx(prisma, 'tp1', 'user-1');

    expect(prisma.invoiceItem.update).toHaveBeenCalledWith({
      where: { id: 'item1' },
      data: { status: 'ACTIVE' },
    });
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'CHARGE',
          sourceId: 'tp1',
          status: 'INVOICED',
        }),
      }),
    );
    expect(glSync.syncInvoiceRevenueGl).toHaveBeenCalledWith(
      'inv1',
      prisma,
      expect.objectContaining({ postedById: 'user-1' }),
    );
    expect(out).toEqual({
      invoiceId: 'inv1',
      reinstated: true,
      needsNewItem: false,
    });
  });

  it('DRAFT: re-activates the line without GL or ledger rows', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoiceItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(item(InvoiceStatus.DRAFT));

    await svc.reinstateProcedureBillingTx(prisma, 'tp1', 'user-1');

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(glSync.syncInvoiceRevenueGl).not.toHaveBeenCalled();
  });

  it('reports needsNewItem when no reusable line exists', async () => {
    const { prisma, svc } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValue(null);

    const out = await svc.reinstateProcedureBillingTx(prisma, 'tp1');

    expect(out).toEqual({
      invoiceId: null,
      reinstated: false,
      needsNewItem: true,
    });
  });
});

describe('InvoiceGlSyncService.syncInvoiceRevenueGl', () => {
  it('counts ACTIVE lines only and posts a balanced revenue reversal on the mapped account', async () => {
    const prisma = createPrismaMock();
    const gl = createAutoMock();
    (gl.isAutoPostingEnabled as jest.Mock).mockResolvedValue(true);
    (gl.safePost as jest.Mock).mockResolvedValue({
      id: 'je1',
      entryNumber: 'JE-1',
    });

    prisma.invoice.findUnique.mockResolvedValue({
      status: InvoiceStatus.POSTED,
      invoiceNumber: 'INV-26-0001',
      patientId: 'p1',
      baseSubtotal: '100.00',
      baseDiscountAmount: '0.00',
      baseTaxAmount: '0.00',
      items: [
        {
          total: '100.00',
          originalTotal: '100.00',
          exchangeRate: '1',
          procedure: null,
          treatmentProcedure: {
            procedure: { revenueAccountId: 'acc-endo', category: null },
          },
        },
      ],
    });
    prisma.ledgerAccount.findUnique
      .mockResolvedValueOnce({ id: 'acc-default' }) // TREATMENT_REVENUE
      .mockResolvedValueOnce({ id: 'acc-disc' }) // SALES_DISCOUNT (groupBy exclusion)
      .mockResolvedValue({ id: 'acc-x' }); // discount / tax lookups
    // 300 was recognised on acc-endo while three procedures were billed.
    prisma.journalLine.groupBy.mockResolvedValue([
      { accountId: 'acc-endo', _sum: { credit: '300.00', debit: '0.00' } },
    ]);
    prisma.journalLine.aggregate.mockResolvedValue({
      _sum: { debit: null, credit: null },
    });

    const svc = new InvoiceGlSyncService(prisma, gl);
    await svc.syncInvoiceRevenueGl('inv1', prisma, {
      memo: 'cancel',
      postedById: 'u1',
    });

    expect(
      prisma.invoice.findUnique.mock.calls[0][0].select.items.where,
    ).toEqual({
      status: 'ACTIVE',
    });
    const posted = (gl.safePost as jest.Mock).mock.calls[0][0];
    expect(posted.memo).toBe('cancel');
    expect(posted.postedById).toBe('u1');
    const lines = posted.lines as Array<Record<string, any>>;
    const debit = M.sum(lines.map((l) => l.debit ?? 0));
    const credit = M.sum(lines.map((l) => l.credit ?? 0));
    expect(M.str(debit)).toBe(M.str(credit));
    expect(lines).toContainEqual(
      expect.objectContaining({ accountId: 'acc-endo' }),
    );
    const endo = lines.find((l) => l.accountId === 'acc-endo')!;
    expect(M.str(endo.debit)).toBe('200.00');
    const ar = lines.find((l) => l.key === 'ACCOUNTS_RECEIVABLE')!;
    expect(M.str(ar.credit)).toBe('200.00');
  });
});

describe('InvoiceLifecycleService — visit procedure lines', () => {
  it('bills onto the visit POSTED invoice with a CHARGE row and GL sync, in the caller tx', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoice.findFirst.mockResolvedValueOnce({
      id: 'inv1',
      invoiceNumber: 'INV-26-0001',
      status: InvoiceStatus.POSTED,
      currency: 'UGX',
      exchangeRate: '1',
    });

    const out = await svc.addVisitProcedureItemTx(prisma, {
      patientId: 'p1',
      visitId: 'v1',
      visitProcedureId: 'vp1',
      procedureId: 'proc1',
      description: 'Composite',
      quantity: 2,
      unitPrice: 150000,
      total: 300000,
      toothNumbers: [36, 37],
      actorUserId: 'u1',
    });

    const itemData = (prisma.invoiceItem.create as jest.Mock).mock.calls[0][0]
      .data;
    expect(itemData).toMatchObject({
      invoiceId: 'inv1',
      visitProcedureId: 'vp1',
      procedureId: 'proc1',
      itemType: 'OTHER',
    });
    expect(M.str(itemData.total)).toBe('300000.00');
    expect(
      (prisma.ledgerEntry.create as jest.Mock).mock.calls[0][0].data,
    ).toMatchObject({
      type: 'CHARGE',
      sourceId: 'vp1',
    });
    expect(glSync.syncInvoiceRevenueGl).toHaveBeenCalledWith(
      'inv1',
      prisma,
      expect.anything(),
    );
    expect(out).toEqual({
      invoiceId: 'inv1',
      invoiceNumber: 'INV-26-0001',
      invoiceStatus: 'POSTED',
    });
  });

  it('creates a DRAFT for the visit when none exists (no ledger, no GL)', async () => {
    const { prisma, svc, glSync } = makeLifecycle();
    prisma.invoice.findFirst.mockResolvedValue(null);
    (prisma.invoice.create as jest.Mock).mockImplementation(
      async ({ data }: any) => ({
        id: 'inv-new',
        ...data,
      }),
    );

    await svc.addVisitProcedureItemTx(prisma, {
      patientId: 'p1',
      visitId: 'v1',
      visitProcedureId: 'vp1',
      procedureId: 'proc1',
      description: 'Composite',
      quantity: 1,
      unitPrice: 100,
      total: 100,
      toothNumbers: [16],
    });

    expect(
      (prisma.invoice.create as jest.Mock).mock.calls[0][0].data,
    ).toMatchObject({
      patientId: 'p1',
      visitId: 'v1',
      status: 'DRAFT',
    });
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(glSync.syncInvoiceRevenueGl).not.toHaveBeenCalled();
  });

  it('reverses a visit procedure line by its visitProcedureId', async () => {
    const { prisma, svc } = makeLifecycle();
    prisma.invoiceItem.findFirst.mockResolvedValue(item(InvoiceStatus.DRAFT));
    prisma.invoice.findUnique.mockResolvedValue({
      amountPaid: '0.00',
      total: '0.00',
    });

    await svc.reverseVisitProcedureBillingTx(prisma, 'vp1', 'removed', 'u1');

    expect(
      (prisma.invoiceItem.findFirst as jest.Mock).mock.calls[0][0].where,
    ).toMatchObject({
      visitProcedureId: 'vp1',
      status: 'ACTIVE',
    });
    expect(
      (prisma.ledgerEntry.updateMany as jest.Mock).mock.calls[0][0].where,
    ).toMatchObject({
      sourceType: 'OTHER',
      sourceId: 'vp1',
    });
  });
});
