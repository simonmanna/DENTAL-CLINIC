// H5: regression guards for the security fixes (C1/C2/C3). These are pure —
// they read @Roles metadata off the controllers and exercise the idempotency
// replay branch with a mock, so they run without a database.
import 'reflect-metadata';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { BillingController } from './billing.controller';
import { ReceiptsController } from '../receipts/receipts.controller';
import { InvoicesService } from './invoices.service';

const rolesOf = (target: any, method: string): UserRole[] =>
  Reflect.getMetadata(ROLES_KEY, target.prototype[method]) ?? [];

describe('Billing RBAC (C2/C3 regression guards)', () => {
  describe('money-OUT actions are admin-only', () => {
    it.each(['refundPayment', 'voidInvoice'])(
      'BillingController.%s requires only SUPER_ADMIN/ADMIN',
      (m) => {
        expect([...rolesOf(BillingController, m)].sort()).toEqual(
          [UserRole.ADMIN, UserRole.SUPER_ADMIN].sort(),
        );
      },
    );

    it('BillingController.changeInvoiceCurrency allows billing-capable roles', () => {
      expect([...rolesOf(BillingController, 'changeInvoiceCurrency')].sort()).toEqual(
        [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DENTIST, UserRole.RECEPTIONIST].sort(),
      );
    });

    it('ReceiptsController.voidReceipt is admin-only', () => {
      expect([...rolesOf(ReceiptsController, 'voidReceipt')].sort()).toEqual(
        [UserRole.ADMIN, UserRole.SUPER_ADMIN].sort(),
      );
    });
  });

  describe('financial reads are gated (no longer open to every authed user)', () => {
    it.each([
      ['BillingController', BillingController, 'getInvoices'],
      ['BillingController', BillingController, 'getInvoice'],
      ['BillingController', BillingController, 'getReceipt'],
      ['BillingController', BillingController, 'getLedger'],
      ['BillingController', BillingController, 'getDraftSummary'],
      ['ReceiptsController', ReceiptsController, 'findAll'],
      ['ReceiptsController', ReceiptsController, 'findOne'],
      ['ReceiptsController', ReceiptsController, 'getByNumber'],
      ['ReceiptsController', ReceiptsController, 'getByInvoice'],
    ])('%s.%s excludes clinical-only roles', (_label, ctrl, m) => {
      const r = rolesOf(ctrl, m as string);
      expect(r.length).toBeGreaterThan(0);
      expect(r).toContain(UserRole.ADMIN);
      expect(r).not.toContain(UserRole.NURSE);
      expect(r).not.toContain(UserRole.PHARMACIST);
      expect(r).not.toContain(UserRole.LAB_TECHNICIAN);
    });
  });

  describe('payment recording', () => {
    it('addPayment allows cashier roles but not clinical-only ones', () => {
      const r = rolesOf(BillingController, 'addPayment');
      expect(r).toContain(UserRole.RECEPTIONIST);
      expect(r).not.toContain(UserRole.NURSE);
      expect(r).not.toContain(UserRole.LAB_TECHNICIAN);
    });
  });
});

describe('Invoice payment idempotency replay (C1)', () => {
  it('replays the stored response and does NOT re-charge', async () => {
    const stored = { id: 'inv1', balance: '0.00', receipt: { id: 'rcpt1' } };
    const prisma: any = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({ response: stored }),
      },
      invoice: { findUnique: jest.fn() },
    };
    const svc = new InvoicesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const res: any = await svc.addPayment(
      'inv1',
      { amount: 50, method: 'CASH' } as any,
      'user1',
      'idem-key-1',
    );

    expect(res._idempotent).toBe(true);
    expect(res.id).toBe('inv1');
    // The replay must short-circuit BEFORE loading/charging the invoice.
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    expect(prisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
      where: { key: 'idem-key-1' },
    });
  });

  it('without a key, falls through to normal processing (loads the invoice)', async () => {
    const prisma: any = {
      idempotencyKey: { findUnique: jest.fn() },
      invoice: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const svc = new InvoicesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      svc.addPayment('inv1', { amount: 50, method: 'CASH' } as any, 'user1'),
    ).rejects.toThrow('Invoice not found');
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(prisma.invoice.findUnique).toHaveBeenCalled();
  });
});
