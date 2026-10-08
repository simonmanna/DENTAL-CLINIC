// src/billing/invoice-void-delete.spec.ts
//
// InvoicesService.voidInvoice / deleteDraftInvoice:
//   • a DRAFT can be soft-deleted (status VOID + deletedAt stamped)
//   • a POSTED invoice cannot be deleted — it must be voided
//   • voiding a DRAFT does not "restore" Rx stock that was never deducted
//   • an already-deleted invoice is not found
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { createPrismaMock } from '../test-utils/prisma-mock';

describe('InvoicesService void / delete draft', () => {
  let svc: InvoicesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  const gl = { safeReverseBySource: jest.fn().mockResolvedValue([]) };

  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    status: 'DRAFT',
    invoiceNumber: 'INV-1',
    amountPaid: 0,
    deletedAt: null,
    items: [
      {
        id: 'it-1',
        ledgerEntryId: 'le-1',
        itemType: 'PRESCRIPTION',
        prescriptionItemId: 'rx-1',
        quantity: 2,
        status: 'ACTIVE',
      },
    ],
    ...over,
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ version: 3 }]);
    prisma.receipt.count.mockResolvedValue(0);
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });
    prisma.ledgerEntry.findMany.mockResolvedValue([]);
    svc = new InvoicesService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      gl as any,
    );
    jest.spyOn(svc, 'getInvoice').mockResolvedValue({ id: 'inv-1' } as any);
  });

  it('soft-deletes a DRAFT: flips to VOID and stamps deletedAt/actor', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice());

    await svc.deleteDraftInvoice('inv-1', { reason: 'dup', deletedBy: 'u-1' });

    const call = prisma.invoice.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: 'inv-1', version: 3, status: 'DRAFT', deletedAt: null });
    expect(call.data).toMatchObject({
      status: 'VOID',
      deletedById: 'u-1',
      deletedReason: 'dup',
      voidedBy: 'u-1',
    });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'DELETE',
      userId: 'u-1',
    });
  });

  it('refuses to delete a POSTED invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ status: 'POSTED' }));
    await expect(svc.deleteDraftInvoice('inv-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('treats an already-deleted invoice as not found', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice({ deletedAt: new Date() }));
    await expect(svc.voidInvoice('inv-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('voiding a DRAFT does not restore Rx stock (never deducted)', async () => {
    prisma.invoice.findUnique.mockResolvedValue(invoice());

    await svc.voidInvoice('inv-1', { reason: 'x', voidedBy: 'u-1' });

    expect(prisma.invoice.updateMany.mock.calls[0][0].data.deletedAt).toBeUndefined();
    expect(prisma.inventoryLedger.create).not.toHaveBeenCalled();
    expect(prisma.inventoryLocationStock.update).not.toHaveBeenCalled();
  });
});
