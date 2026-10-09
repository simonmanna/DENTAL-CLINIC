// The once-only rule for prescription stock: whichever of "invoice posted" and
// "dispensed" happens first issues the line; the other moves nothing.
import { PrescriptionStatus } from '@prisma/client';
import {
  PrescriptionStockService,
  RX_LINE_REF,
  RX_LINE_RETURN_REF,
} from './prescription-stock.service';

type Row = {
  id: string;
  referenceType: string;
  referenceId: string;
  itemId: string;
  reversalOfId?: string | null;
};

function setup(opts: {
  status?: PrescriptionStatus;
  inventoryItemId?: string | null;
  ledger?: Row[];
  invoiceIds?: string[];
}) {
  const ledger: Row[] = opts.ledger ?? [];
  const inEffect = (r: Row) =>
    !r.reversalOfId && !ledger.some((x) => x.reversalOfId === r.id);

  const tx: any = {
    prescriptionItem: {
      findUnique: jest.fn(async () => ({
        id: 'line-1',
        prescriptionId: 'rx-1',
        prescription: { status: opts.status ?? PrescriptionStatus.ACTIVE },
        drug: {
          name: 'Amoxicillin',
          inventoryItemId:
            opts.inventoryItemId === undefined ? 'item-1' : opts.inventoryItemId,
        },
      })),
    },
    inventoryLedger: {
      findFirst: jest.fn(async ({ where }: any) => {
        const wantsInEffect = 'reversedBy' in where;
        return (
          ledger.find(
            (r) =>
              r.referenceType === where.referenceType &&
              r.referenceId === where.referenceId &&
              (!where.itemId || r.itemId === where.itemId) &&
              (!wantsInEffect || inEffect(r)),
          ) ?? null
        );
      }),
    },
    invoiceItem: {
      findMany: jest.fn(async () =>
        (opts.invoiceIds ?? []).map((invoiceId) => ({ invoiceId })),
      ),
    },
  };

  const movements = {
    issue: jest.fn(async () => ({ draws: [], totalCost: 0 })),
    reverseOutstanding: jest.fn(async () => ({ reversed: 1 })),
  };
  const svc = new PrescriptionStockService(movements as any);
  return { svc, tx, movements };
}

const ISSUE = {
  prescriptionItemId: 'line-1',
  quantity: 10,
  locationId: 'pharmacy',
  notes: 'test',
};

describe('PrescriptionStockService.issueOnce', () => {
  it('issues the line through the stock path the first time', async () => {
    const { svc, tx, movements } = setup({});
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('issued');
    expect(movements.issue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        itemId: 'item-1',
        quantity: 10,
        referenceType: RX_LINE_REF,
        referenceId: 'line-1',
      }),
    );
  });

  it('moves nothing when the line already left stock (invoice, then dispense)', async () => {
    const { svc, tx, movements } = setup({
      ledger: [{ id: 'l1', referenceType: RX_LINE_REF, referenceId: 'line-1', itemId: 'item-1' }],
    });
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('already-issued');
    expect(movements.issue).not.toHaveBeenCalled();
  });

  it('issues again after the stock was given back (voided invoice)', async () => {
    const { svc, tx, movements } = setup({
      ledger: [
        { id: 'l1', referenceType: RX_LINE_REF, referenceId: 'line-1', itemId: 'item-1' },
        { id: 'l2', referenceType: RX_LINE_RETURN_REF, referenceId: 'line-1', itemId: 'item-1', reversalOfId: 'l1' },
      ],
    });
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('issued');
    expect(movements.issue).toHaveBeenCalled();
  });

  it('treats a dispense made before the rule as already issued', async () => {
    const { svc, tx, movements } = setup({
      status: PrescriptionStatus.DISPENSED,
      ledger: [{ id: 'old', referenceType: 'PRESCRIPTION_DISPENSE', referenceId: 'rx-1', itemId: 'item-1' }],
    });
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('already-issued');
    expect(movements.issue).not.toHaveBeenCalled();
  });

  it('treats an invoice deduction made before the rule as already issued', async () => {
    const { svc, tx, movements } = setup({
      invoiceIds: ['inv-1'],
      ledger: [{ id: 'old', referenceType: 'INVOICE', referenceId: 'inv-1', itemId: 'item-1' }],
    });
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('already-issued');
    expect(movements.issue).not.toHaveBeenCalled();
  });

  it('reports a drug with no stock item instead of failing', async () => {
    const { svc, tx, movements } = setup({ inventoryItemId: null });
    await expect(svc.issueOnce(tx, ISSUE)).resolves.toBe('not-stocked');
    expect(movements.issue).not.toHaveBeenCalled();
  });
});

describe('PrescriptionStockService.returnIfNotDispensed', () => {
  const RETURN = {
    prescriptionItemId: 'line-1',
    invoiceId: 'inv-1',
    reason: 'Invoice voided',
  };

  it('keeps the stock out once the drugs were handed over', async () => {
    const { svc, tx, movements } = setup({ status: PrescriptionStatus.DISPENSED });
    await expect(svc.returnIfNotDispensed(tx, RETURN)).resolves.toEqual({ returned: 0 });
    expect(movements.reverseOutstanding).not.toHaveBeenCalled();
  });

  it('gives back both the line rows and any pre-rule invoice rows', async () => {
    const { svc, tx, movements } = setup({});
    await svc.returnIfNotDispensed(tx, RETURN);
    expect(movements.reverseOutstanding).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ referenceType: RX_LINE_REF, referenceId: 'line-1' }),
    );
    expect(movements.reverseOutstanding).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ referenceType: 'INVOICE', referenceId: 'inv-1', itemId: 'item-1' }),
    );
  });
});
