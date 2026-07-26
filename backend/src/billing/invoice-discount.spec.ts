// src/billing/invoice-discount.spec.ts
// ─────────────────────────────────────────────────────────────────────────────
// Spec: invoice-level ("additional") discount — setInvoiceDiscount
//   • DRAFT only: POSTED/VOID invoices are rejected before any write.
//   • PERCENT ≤ 100, value ≥ 0, FIXED ≤ subtotal.
//   • Drafts may carry advance payments — a discount may not push the total
//     below amountPaid.
//   • discountValue 0 clears the discount (discountType reset to null).
//   • Writes are version-guarded (optimistic lock) → ConflictException on a
//     concurrent modification; an audit row is written; recalc runs in-tx.
// ─────────────────────────────────────────────────────────────────────────────

import { InvoiceLifecycleService } from './invoice-lifecycle.service';
import { createPrismaMock, createAutoMock } from '../test-utils/prisma-mock';
import { CurrencyService } from './currency.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { InvoiceStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

function makeService() {
  const prisma = createPrismaMock();
  const currency = createAutoMock() as unknown as CurrencyService;
  const docNum = createAutoMock() as unknown as DocumentNumberService;
  const gl = createAutoMock() as unknown as GeneralLedgerService;
  const svc = new InvoiceLifecycleService(
    prisma as any,
    currency as any,
    docNum as any,
    gl as any,
  );
  return { prisma, svc };
}

const draftInvoice = {
  id: 'inv-1',
  status: InvoiceStatus.DRAFT,
  version: 3,
  subtotal: '100.00',
  taxPercent: '0.00',
  amountPaid: '0.00',
  currency: 'UGX',
  discountType: null,
  discountValue: '0.00',
};

/** Wire the happy-path mocks: validation read, guarded update, recalc row. */
function wireHappyPath(prisma: any, invoice: any = draftInvoice) {
  prisma.invoice.findUnique
    .mockResolvedValueOnce(invoice) // in-tx validation read
    .mockResolvedValue({ ...invoice, version: invoice.version + 1 }); // final refetch
  prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
  prisma.$queryRaw.mockResolvedValue([
    { version: BigInt(invoice.version + 1), total: '90.00', baseTotal: '90.00', paymentStatus: 'UNPAID' },
  ]);
}

describe('InvoiceLifecycleService.setInvoiceDiscount', () => {
  it('rejects a non-DRAFT invoice', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue({
      ...draftInvoice,
      status: InvoiceStatus.POSTED,
    });

    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'PERCENT', discountValue: 10 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a missing invoice', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(
      svc.setInvoiceDiscount('nope', { discountType: 'PERCENT', discountValue: 10 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects PERCENT above 100 and negative values', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue(draftInvoice);

    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'PERCENT', discountValue: 101 }),
    ).rejects.toThrow('Percentage discount cannot exceed 100%');
    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'PERCENT', discountValue: -5 }),
    ).rejects.toThrow('Discount value cannot be negative');
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a FIXED discount above the subtotal', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue(draftInvoice); // subtotal 100

    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'FIXED', discountValue: 150 }),
    ).rejects.toThrow('Fixed discount cannot exceed the invoice subtotal');
  });

  it('rejects a discount that pushes the total below amountPaid', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue({
      ...draftInvoice,
      amountPaid: '95.00', // subtotal 100, FIXED 10 → total 90 < 95 paid
    });

    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'FIXED', discountValue: 10 }),
    ).rejects.toThrow(/below the amount already paid/);
  });

  it('applies a valid discount: version-guarded write, audit row, in-tx recalc', async () => {
    const { prisma, svc } = makeService();
    wireHappyPath(prisma);

    await svc.setInvoiceDiscount(
      'inv-1',
      { discountType: 'PERCENT', discountValue: 10 },
      'user-1',
    );

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: InvoiceStatus.DRAFT, version: 3 },
      data: {
        discountType: 'PERCENT',
        discountValue: '10.00',
        updatedById: 'user-1',
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        action: 'UPDATE',
        module: 'BILLING',
        entityType: 'Invoice',
        recordId: 'inv-1',
        oldData: { discountType: null, discountValue: '0.00' },
        newData: { discountType: 'PERCENT', discountValue: '10.00' },
      }),
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1); // recalc ran inside the tx
  });

  it('clears the discount when value is 0 (discountType reset to null)', async () => {
    const { prisma, svc } = makeService();
    wireHappyPath(prisma, {
      ...draftInvoice,
      discountType: 'PERCENT',
      discountValue: '10.00',
    });

    await svc.setInvoiceDiscount(
      'inv-1',
      { discountType: 'PERCENT', discountValue: 0 },
      'user-1',
    );

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          discountType: null,
          discountValue: '0.00',
        }),
      }),
    );
  });

  it('throws ConflictException when the version guard matches no row', async () => {
    const { prisma, svc } = makeService();
    prisma.invoice.findUnique.mockResolvedValue(draftInvoice);
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      svc.setInvoiceDiscount('inv-1', { discountType: 'FIXED', discountValue: 20 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
