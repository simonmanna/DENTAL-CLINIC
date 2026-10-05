// Behavioural tests for the one path that moves stock.
//
// These run against a small in-memory stand-in for the Prisma transaction
// client rather than a database, because what needs pinning is the
// arithmetic: the weighted-average cost, the running balance written into
// each ledger row, which batches are reachable, and what a reversal does. All
// four were wrong in the per-service copies this replaced, and all four are
// invisible until someone reconciles a stock report months later.
import { StockMovementService } from './stock-movement.service';
import { StockLedgerType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

// ───────────────────────────────────────────────────────────────────────────
// A fake transaction client covering only what StockMovementService touches.
// ───────────────────────────────────────────────────────────────────────────

interface FakeBatch {
  id: string;
  itemId: string;
  locationId: string;
  batchNumber: string | null;
  quantity: number;
  unitCost: number;
  expiryDate: Date | null;
  receivedAt: Date;
  isActive: boolean;
}

function matches(row: any, where: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'OR') {
      if (!(cond as any[]).some((c) => matches(row, c))) return false;
      continue;
    }
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gt' in cond && !(value > cond.gt)) return false;
      if ('gte' in cond && !(value !== null && value >= cond.gte)) return false;
      if ('not' in cond && value === cond.not) return false;
      if ('in' in cond && !cond.in.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

function makeTx(batches: FakeBatch[] = []) {
  let seq = batches.length;
  const stocks: Array<{
    itemId: string;
    locationId: string;
    quantity: number;
  }> = [];
  const ledger: any[] = [];
  const items: Record<string, { unitCost: number }> = {};

  const applyNumeric = (current: number, spec: any): number => {
    if (spec == null) return current;
    if (typeof spec === 'number') return spec;
    if (typeof spec === 'object') {
      if ('increment' in spec) return current + spec.increment;
      if ('decrement' in spec) return current - spec.decrement;
      if ('set' in spec) return spec.set;
    }
    return current;
  };

  const tx: any = {
    inventoryBatch: {
      aggregate: ({ where }: any) => ({
        _sum: {
          quantity: batches
            .filter((b) => matches(b, where))
            .reduce((s, b) => s + b.quantity, 0),
        },
      }),
      findUnique: ({ where }: any) => {
        const k = where.itemId_locationId_batchNumber ?? where;
        return (
          batches.find((b) =>
            where.id
              ? b.id === where.id
              : b.itemId === k.itemId &&
                b.locationId === k.locationId &&
                b.batchNumber === k.batchNumber,
          ) ?? null
        );
      },
      findFirst: ({ where }: any) =>
        batches.find((b) => matches(b, where)) ?? null,
      findMany: ({ where, orderBy }: any) => {
        let rows = batches.filter((b) => matches(b, where));
        for (const clause of [...(orderBy ?? [])].reverse()) {
          const [field, dir] = Object.entries<any>(clause)[0];
          rows = [...rows].sort((a: any, b: any) => {
            const av = a[field];
            const bv = b[field];
            if (av === bv) return 0;
            if (av === null) return 1; // Postgres sorts NULLs last on ASC
            if (bv === null) return -1;
            return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
          });
        }
        return rows;
      },
      create: ({ data }: any) => {
        const row: FakeBatch = {
          id: `b${++seq}`,
          receivedAt: new Date(),
          ...data,
        };
        batches.push(row);
        return row;
      },
      update: ({ where, data }: any) => {
        const row = batches.find((b) => b.id === where.id)!;
        row.quantity = applyNumeric(row.quantity, data.quantity);
        if (data.unitCost != null) row.unitCost = data.unitCost;
        if (data.expiryDate != null) row.expiryDate = data.expiryDate;
        if (data.isActive != null) row.isActive = data.isActive;
        return row;
      },
    },
    inventoryLocationStock: {
      findUnique: ({ where }: any) => {
        const k = where.itemId_locationId;
        return (
          stocks.find(
            (s) => s.itemId === k.itemId && s.locationId === k.locationId,
          ) ?? null
        );
      },
      upsert: ({ where, create, update }: any) => {
        const k = where.itemId_locationId;
        const found = stocks.find(
          (s) => s.itemId === k.itemId && s.locationId === k.locationId,
        );
        if (found) {
          found.quantity = applyNumeric(found.quantity, update.quantity);
          return found;
        }
        const row = { ...create };
        stocks.push(row);
        return row;
      },
    },
    inventoryLedger: {
      create: ({ data }: any) => {
        const row = { id: `l${ledger.length + 1}`, ...data };
        ledger.push(row);
        return row;
      },
      findMany: ({ where }: any) =>
        ledger
          .filter((r) => matches(r, where))
          .map((r) => ({ ...r, reversedBy: r.reversedBy ?? null })),
    },
    inventoryItem: {
      update: ({ where, data }: any) => {
        items[where.id] = { unitCost: data.unitCost };
        return items[where.id];
      },
    },
  };

  return { tx, batches, stocks, ledger, items };
}

function makeService() {
  let n = 0;
  const docNum = { next: async () => `ILG-26-${String(++n).padStart(4, '0')}` };
  return new StockMovementService(docNum as any);
}

const ITEM = 'item-1';
const LOC = 'loc-1';

function days(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function batch(over: Partial<FakeBatch>): FakeBatch {
  return {
    id: 'b0',
    itemId: ITEM,
    locationId: LOC,
    batchNumber: 'B1',
    quantity: 0,
    unitCost: 0,
    expiryDate: null,
    receivedAt: new Date('2026-01-01'),
    isActive: true,
    ...over,
  };
}

// ───────────────────────────────────────────────────────────────────────────

describe('StockMovementService.receive', () => {
  it('blends the batch cost instead of overwriting it', async () => {
    const svc = makeService();
    const { tx, batches } = makeTx([
      batch({ id: 'b1', batchNumber: 'DEFAULT', quantity: 10, unitCost: 100 }),
    ]);

    // 10 @ 100 already on hand, receive 10 @ 200 -> average 150.
    // The old code assigned 200, revaluing the 10 units already there.
    const res = await svc.receive(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 10,
      unitCost: 200,
      referenceType: 'TEST',
      referenceId: 'r1',
    });

    expect(res.unitCost).toBe(150);
    expect(batches[0].unitCost).toBe(150);
    expect(batches[0].quantity).toBe(20);
  });

  it('records a ledger row whose before + change equals after', async () => {
    const svc = makeService();
    const { tx, ledger } = makeTx();

    await svc.receive(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 7,
      unitCost: 5,
      referenceType: 'TEST',
      referenceId: 'r1',
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0].quantityBefore).toBe(0);
    expect(ledger[0].quantityChange).toBe(7);
    expect(ledger[0].quantityAfter).toBe(7);
  });

  it('demands batch details for a batch-tracked item', async () => {
    const svc = makeService();
    const { tx } = makeTx();

    await expect(
      svc.receive(tx, {
        itemId: ITEM,
        locationId: LOC,
        quantity: 1,
        unitCost: 1,
        referenceType: 'TEST',
        referenceId: 'r1',
        requireBatchDetails: true,
        itemName: 'Lidocaine',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a non-positive quantity', async () => {
    const svc = makeService();
    const { tx } = makeTx();
    await expect(
      svc.receive(tx, {
        itemId: ITEM,
        locationId: LOC,
        quantity: 0,
        unitCost: 1,
        referenceType: 'TEST',
        referenceId: 'r1',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('StockMovementService.issue', () => {
  it('writes a TRUE running balance across a multi-batch draw', async () => {
    const svc = makeService();
    const { tx, ledger, stocks } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'A',
        quantity: 5,
        unitCost: 10,
        expiryDate: days(10),
      }),
      batch({
        id: 'b2',
        batchNumber: 'B',
        quantity: 5,
        unitCost: 20,
        expiryDate: days(40),
      }),
    ]);
    // Seed the summary row to match the batches.
    await svc.syncLocationQty(tx, ITEM, LOC);
    expect(stocks[0].quantity).toBe(10);

    // Drawing 8 takes all 5 of A then 3 of B. The old code recomputed the
    // location total once and stamped BOTH rows with the final figure, so
    // both claimed quantityAfter = 2.
    const { draws, totalCost } = await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 8,
      referenceType: 'TEST',
      referenceId: 'r1',
      type: StockLedgerType.STOCK_OUT,
    });

    expect(draws.map((d) => [d.batchNumber, d.quantity])).toEqual([
      ['A', 5],
      ['B', 3],
    ]);

    expect(
      ledger.map((l) => [l.quantityBefore, l.quantityChange, l.quantityAfter]),
    ).toEqual([
      [10, -5, 5],
      [5, -3, 2],
    ]);

    // Replaying the ledger reproduces on-hand.
    const replayed = ledger.reduce((q, l) => q + l.quantityChange, 10);
    expect(replayed).toBe(stocks[0].quantity);

    // 5 @ 10 + 3 @ 20 = 110, valued at each batch's own cost.
    expect(totalCost).toBe(110);
  });

  it('values each draw at the cost of the batch it came from', async () => {
    const svc = makeService();
    const { tx, ledger } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'A',
        quantity: 2,
        unitCost: 10,
        expiryDate: days(5),
      }),
      batch({
        id: 'b2',
        batchNumber: 'B',
        quantity: 2,
        unitCost: 90,
        expiryDate: days(9),
      }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 3,
      referenceType: 'TEST',
      referenceId: 'r1',
    });

    expect(ledger.map((l) => l.unitCost)).toEqual([10, 90]);
  });

  it('skips expired batches by default', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'OLD',
        quantity: 50,
        unitCost: 1,
        expiryDate: days(-1),
      }),
      batch({
        id: 'b2',
        batchNumber: 'GOOD',
        quantity: 4,
        unitCost: 2,
        expiryDate: days(30),
      }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    // FEFO orders soonest-expiry first, which without a filter means the
    // already-expired batch goes out of the door first.
    const res = await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 4,
      referenceType: 'TEST',
      referenceId: 'r1',
    });

    expect(res.draws.map((d) => d.batchNumber)).toEqual(['GOOD']);
  });

  it('reports expired stock as unavailable rather than silently issuing it', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'OLD',
        quantity: 50,
        unitCost: 1,
        expiryDate: days(-1),
      }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    await expect(
      svc.issue(tx, {
        itemId: ITEM,
        locationId: LOC,
        quantity: 1,
        referenceType: 'TEST',
        referenceId: 'r1',
        itemName: 'Lidocaine',
      }),
    ).rejects.toThrow(/expired batches are excluded/);
  });

  it('reaches expired stock when the caller is a write-off', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'OLD',
        quantity: 5,
        unitCost: 1,
        expiryDate: days(-1),
      }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    const res = await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 5,
      allowExpired: true,
      type: StockLedgerType.EXPIRY_WRITE_OFF,
      referenceType: 'WASTE',
      referenceId: 'w1',
    });

    expect(res.draws[0].batchNumber).toBe('OLD');
  });

  it('refuses to over-issue instead of going negative', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({ id: 'b1', batchNumber: 'A', quantity: 3, unitCost: 1 }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    await expect(
      svc.issue(tx, {
        itemId: ITEM,
        locationId: LOC,
        quantity: 4,
        referenceType: 'TEST',
        referenceId: 'r1',
        itemName: 'Gloves',
      }),
    ).rejects.toThrow(/Insufficient issuable stock/);
  });

  it('honours FIFO when asked, independently of expiry order', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({
        id: 'b1',
        batchNumber: 'LATE-EXPIRY-OLD-RECEIPT',
        quantity: 2,
        unitCost: 1,
        expiryDate: days(90),
        receivedAt: new Date('2026-01-01'),
      }),
      batch({
        id: 'b2',
        batchNumber: 'SOON-EXPIRY-NEW-RECEIPT',
        quantity: 2,
        unitCost: 1,
        expiryDate: days(10),
        receivedAt: new Date('2026-06-01'),
      }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    const res = await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 2,
      strategy: 'FIFO',
      referenceType: 'TEST',
      referenceId: 'r1',
    });

    expect(res.draws[0].batchNumber).toBe('LATE-EXPIRY-OLD-RECEIPT');
  });
});

describe('StockMovementService.syncLocationQty', () => {
  it('counts every batch, so a deactivated batch cannot hide stock', async () => {
    const svc = makeService();
    const { tx } = makeTx([
      batch({ id: 'b1', batchNumber: 'A', quantity: 4, isActive: true }),
      // Written off while it still held stock. The old `isActive: true` filter
      // dropped this from on-hand, and a later receipt that flipped the flag
      // made the 6 units reappear from nowhere.
      batch({ id: 'b2', batchNumber: 'B', quantity: 6, isActive: false }),
    ]);

    await expect(svc.syncLocationQty(tx, ITEM, LOC)).resolves.toBe(10);
  });
});

describe('StockMovementService.reverseDocument', () => {
  it('puts issued stock back at the cost it left at', async () => {
    const svc = makeService();
    const { tx, batches, ledger } = makeTx([
      batch({ id: 'b1', batchNumber: 'A', quantity: 10, unitCost: 25 }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 4,
      referenceType: 'STOCK_OUT',
      referenceId: 'so-1',
      type: StockLedgerType.STOCK_OUT,
    });
    expect(batches[0].quantity).toBe(6);

    const res = await svc.reverseDocument(tx, {
      referenceType: 'STOCK_OUT',
      referenceId: 'so-1',
      reversalReferenceType: 'STOCK_OUT_VOID',
      reason: 'keyed against the wrong location',
    });

    expect(res.reversed).toBe(1);
    expect(batches[0].quantity).toBe(10);

    const reversal = ledger[ledger.length - 1];
    expect(reversal.type).toBe(StockLedgerType.REVERSAL_IN);
    expect(reversal.quantityChange).toBe(4);
    expect(reversal.unitCost).toBe(25);
    expect(reversal.reversalOfId).toBeTruthy();
    // Still balanced after the compensating row.
    expect(reversal.quantityBefore + reversal.quantityChange).toBe(
      reversal.quantityAfter,
    );
  });

  it('refuses to reverse a receipt whose stock has already gone out', async () => {
    const svc = makeService();
    const { tx } = makeTx();

    await svc.receive(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 5,
      unitCost: 10,
      referenceType: 'STOCK_IN',
      referenceId: 'si-1',
    });
    // Everything received is then issued elsewhere.
    await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 5,
      referenceType: 'STOCK_OUT',
      referenceId: 'so-9',
    });

    await expect(
      svc.reverseDocument(tx, {
        referenceType: 'STOCK_IN',
        referenceId: 'si-1',
        reversalReferenceType: 'STOCK_IN_VOID',
        reason: 'duplicate entry',
      }),
    ).rejects.toThrow(/already been consumed/);
  });

  it('refuses a second reversal of the same document', async () => {
    const svc = makeService();
    const { tx, ledger } = makeTx([
      batch({ id: 'b1', batchNumber: 'A', quantity: 10, unitCost: 5 }),
    ]);
    await svc.syncLocationQty(tx, ITEM, LOC);

    await svc.issue(tx, {
      itemId: ITEM,
      locationId: LOC,
      quantity: 2,
      referenceType: 'STOCK_OUT',
      referenceId: 'so-2',
    });

    await svc.reverseDocument(tx, {
      referenceType: 'STOCK_OUT',
      referenceId: 'so-2',
      reversalReferenceType: 'STOCK_OUT_VOID',
      reason: 'first',
    });

    // Link the reversal back, the way the unique FK does in the database.
    const original = ledger.find((l) => l.referenceId === 'so-2');
    original.reversedBy = { id: 'rev' };

    await expect(
      svc.reverseDocument(tx, {
        referenceType: 'STOCK_OUT',
        referenceId: 'so-2',
        reversalReferenceType: 'STOCK_OUT_VOID',
        reason: 'second',
      }),
    ).rejects.toThrow(/already been reversed/);
  });

  it('refuses when the document never moved stock', async () => {
    const svc = makeService();
    const { tx } = makeTx();
    await expect(
      svc.reverseDocument(tx, {
        referenceType: 'STOCK_OUT',
        referenceId: 'nope',
        reversalReferenceType: 'STOCK_OUT_VOID',
        reason: 'x',
      }),
    ).rejects.toThrow(/no stock movement to reverse/);
  });
});

describe('StockMovementService.postLedger', () => {
  it('refuses to write a row that does not balance', async () => {
    const svc = makeService();
    const { tx } = makeTx();
    await expect(
      svc.postLedger(tx, {
        itemId: ITEM,
        locationId: LOC,
        type: StockLedgerType.STOCK_OUT,
        before: 10,
        after: 10, // should be 5
        quantityChange: -5,
        unitCost: 1,
        referenceType: 'TEST',
        referenceId: 'r1',
      }),
    ).rejects.toThrow(/would not balance/);
  });
});
