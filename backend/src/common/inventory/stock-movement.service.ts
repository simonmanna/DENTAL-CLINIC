// One place where stock actually moves.
//
// Before this existed, six services each carried their own copy of "deduct
// across batches, recompute the location summary, write a ledger row" — and
// they had drifted apart. Each copy had its own bugs: one wrote the location
// summary without touching the batch rows, one never checked availability,
// one valued issues at the item's master cost while another used whatever the
// client sent. Fixing them individually would have left six copies to drift
// again, so the behaviour lives here and the services call it.
//
// Three invariants this upholds, which the old copies did not:
//
//  1. INVENTORY VALUE. A receipt blends into the batch's weighted-average
//     cost instead of overwriting it, so existing on-hand is not silently
//     revalued at the newest price. An issue is valued at the cost of the
//     batch it actually drew from.
//
//  2. LEDGER REPLAYABILITY. Every row records the location quantity
//     immediately before and immediately after its own movement. Replaying
//     the ledger for an (item, location) reproduces current on-hand exactly.
//     The old code recomputed the location total once per line and then
//     back-filled every row with that same figure, so a draw spanning two
//     batches produced two rows claiming the same `quantityAfter`.
//
//  3. REVERSIBILITY. Nothing is deleted. Voiding a document posts the inverse
//     of each of its ledger rows, linked back to the row it undoes.
import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, StockLedgerType } from '@prisma/client';
import { DocumentNumberService } from '../document-number/document-number.service';

export type IssueStrategy = 'FEFO' | 'FIFO' | 'MANUAL';

/** Foreign keys tying a ledger row to its source document. */
export interface LedgerLinks {
  deliveryId?: string | null;
  stockAdjustmentId?: string | null;
  wasteRecordId?: string | null;
  stockTransferId?: string | null;
  stockOutId?: string | null;
  stockInId?: string | null;
}

export interface IssueDraw {
  batchId: string;
  batchNumber: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  expiryDate: Date | null;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Quantities are Float columns; compare with a tolerance, never with ===. */
const EPSILON = 1e-6;

@Injectable()
export class StockMovementService {
  constructor(private readonly docNum: DocumentNumberService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // LOCATION SUMMARY
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * On-hand according to the SUMMARY row, which is what availability screens
   * read. May lag the batch rows if something wrote it directly — `batchSum`
   * below is the authoritative figure.
   */
  async locationQty(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ): Promise<number> {
    const row = await tx.inventoryLocationStock.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
      select: { quantity: true },
    });
    return row?.quantity ?? 0;
  }

  /**
   * On-hand according to the batch rows — the authoritative figure.
   *
   * Every ledger row takes both its `before` and its `after` from here, never
   * from the summary row. If an earlier write left the summary out of step
   * with the batches (exactly what the old adjustment path did), a movement
   * that mixed the two sources would emit a ledger row that did not balance
   * and the whole operation would fail with an opaque error. Reading truth on
   * both sides makes the ledger consistent by construction and repairs the
   * summary as a side effect of the next movement.
   */
  private async batchSum(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ): Promise<number> {
    const agg = await tx.inventoryBatch.aggregate({
      where: { itemId, locationId },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  /**
   * Recompute the location summary from the batch rows and return it.
   *
   * Deliberately sums EVERY batch rather than only `isActive` ones. The old
   * filter was `isActive: true`, which made on-hand depend on a boolean that
   * the write paths set inconsistently: a batch written off while it still
   * held quantity vanished from the total, and a later receipt that flipped
   * the flag back to true made that quantity reappear out of nowhere. With
   * the non-negative CHECK in place, the sum of batch quantities IS on-hand,
   * and `isActive` is maintained below purely as a "has stock" convenience
   * for the pickers.
   */
  async syncLocationQty(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ): Promise<number> {
    const agg = await tx.inventoryBatch.aggregate({
      where: { itemId, locationId },
      _sum: { quantity: true },
    });
    const quantity = agg._sum.quantity ?? 0;

    await tx.inventoryLocationStock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, quantity, minQuantity: 0 },
      update: { quantity },
    });

    return quantity;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LEDGER
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Write one ledger row. `before` must be the location quantity read BEFORE
   * the batch mutation this row describes, and `after` the quantity read
   * after it — that is what makes the ledger replayable.
   */
  async postLedger(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      batchId?: string | null;
      type: StockLedgerType;
      before: number;
      after: number;
      quantityChange: number;
      unitCost: number;
      referenceType: string;
      referenceId: string;
      notes?: string | null;
      performedById?: string | null;
      links?: LedgerLinks;
      reversalOfId?: string | null;
    },
  ) {
    const {
      itemId,
      locationId,
      batchId,
      type,
      before,
      after,
      quantityChange,
      unitCost,
      referenceType,
      referenceId,
      notes,
      performedById,
      links,
      reversalOfId,
    } = params;

    // The row must be internally consistent or it is worse than no row.
    if (Math.abs(before + quantityChange - after) > 1e-4) {
      throw new Error(
        `Ledger row would not balance: ${before} + ${quantityChange} != ${after} ` +
          `(item ${itemId}, location ${locationId})`,
      );
    }

    return tx.inventoryLedger.create({
      data: {
        ledgerCode: await this.docNum.next('ILG', tx),
        itemId,
        locationId,
        batchId: batchId ?? null,
        type,
        quantityBefore: before,
        quantityChange,
        quantityAfter: after,
        unitCost,
        totalValue: Math.abs(quantityChange) * unitCost,
        referenceType,
        referenceId,
        notes: notes ?? null,
        performedById: performedById ?? null,
        reversalOfId: reversalOfId ?? null,
        ...(links?.deliveryId ? { deliveryId: links.deliveryId } : {}),
        ...(links?.stockAdjustmentId
          ? { stockAdjustmentId: links.stockAdjustmentId }
          : {}),
        ...(links?.wasteRecordId ? { wasteRecordId: links.wasteRecordId } : {}),
        ...(links?.stockTransferId
          ? { stockTransferId: links.stockTransferId }
          : {}),
        ...(links?.stockOutId ? { stockOutId: links.stockOutId } : {}),
        ...(links?.stockInId ? { stockInId: links.stockInId } : {}),
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RECEIVE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add stock into a batch and post the receipt.
   *
   * Cost is blended, not replaced:
   *
   *     newCost = (onHand * oldCost + received * newCost) / (onHand + received)
   *
   * The old code assigned the incoming price straight onto the batch, which
   * revalued every unit already sitting there. For a batch-tracked item each
   * batch number is its own lot, so this only blends genuine re-receipts into
   * the same lot; for a non-batch item everything lands in the implicit
   * DEFAULT batch, which makes it an ordinary moving weighted average.
   */
  async receive(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      unitCost: number;
      batchNumber?: string | null;
      expiryDate?: Date | null;
      type?: StockLedgerType;
      referenceType: string;
      referenceId: string;
      notes?: string | null;
      performedById?: string | null;
      links?: LedgerLinks;
      /** Set when the item has batchTracking enabled — forces batch details. */
      requireBatchDetails?: boolean;
      itemName?: string;
    },
  ): Promise<{
    batchId: string;
    unitCost: number;
    before: number;
    after: number;
  }> {
    const {
      itemId,
      locationId,
      quantity,
      unitCost,
      expiryDate = null,
      type = StockLedgerType.PURCHASE_RECEIPT,
      referenceType,
      referenceId,
      notes,
      performedById,
      links,
      requireBatchDetails,
      itemName,
    } = params;

    if (!(quantity > 0)) {
      throw new BadRequestException(
        `Receipt quantity must be greater than zero (got ${quantity}).`,
      );
    }

    const batchNumber = params.batchNumber?.trim() || null;
    if (requireBatchDetails) {
      if (!batchNumber) {
        throw new BadRequestException(
          `Item "${itemName ?? itemId}" has batch tracking enabled. Batch number is required.`,
        );
      }
      if (!expiryDate) {
        throw new BadRequestException(
          `Item "${itemName ?? itemId}" has batch tracking enabled. Expiry date is required.`,
        );
      }
    }
    const resolvedBatchNumber = requireBatchDetails ? batchNumber! : 'DEFAULT';

    const before = await this.batchSum(tx, itemId, locationId);

    const existing = await tx.inventoryBatch.findUnique({
      where: {
        itemId_locationId_batchNumber: {
          itemId,
          locationId,
          batchNumber: resolvedBatchNumber,
        },
      },
      select: { id: true, quantity: true, unitCost: true },
    });

    let batchId: string;
    let blendedCost: number;

    if (existing) {
      const onHand = existing.quantity;
      const oldCost = toNum(existing.unitCost);
      const newQty = onHand + quantity;
      blendedCost =
        newQty > EPSILON
          ? (onHand * oldCost + quantity * unitCost) / newQty
          : unitCost;

      const updated = await tx.inventoryBatch.update({
        where: { id: existing.id },
        data: {
          quantity: { increment: quantity },
          unitCost: Number(blendedCost.toFixed(2)),
          ...(expiryDate ? { expiryDate } : {}),
          isActive: true,
        },
        select: { id: true },
      });
      batchId = updated.id;
    } else {
      blendedCost = unitCost;
      const created = await tx.inventoryBatch.create({
        data: {
          itemId,
          locationId,
          batchNumber: resolvedBatchNumber,
          expiryDate,
          quantity,
          unitCost: Number(unitCost.toFixed(2)),
          isActive: true,
        },
        select: { id: true },
      });
      batchId = created.id;
    }

    const after = await this.syncLocationQty(tx, itemId, locationId);
    await this.refreshItemAverageCost(tx, itemId);

    await this.postLedger(tx, {
      itemId,
      locationId,
      batchId,
      type,
      before,
      after,
      quantityChange: quantity,
      unitCost,
      referenceType,
      referenceId,
      notes,
      performedById,
      links,
    });

    return {
      batchId,
      unitCost: Number(blendedCost.toFixed(2)),
      before,
      after,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ISSUE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Draw stock out across batches and post one ledger row per batch drawn.
   *
   * Expired batches are excluded unless `allowExpired` is set. FEFO means
   * "first to expire, first out" — it is meant to clear stock BEFORE it goes
   * off, so issuing an already-expired batch into a patient's mouth is the
   * precise opposite of the intent. Write-offs (waste, expiry) pass
   * `allowExpired: true` because expired stock is exactly what they exist to
   * remove.
   *
   * Each draw is valued at the cost of the batch it came from, so cost of
   * goods follows the physical flow instead of whatever the item master
   * happened to say.
   */
  async issue(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      strategy?: IssueStrategy;
      selectedBatchNumber?: string | null;
      allowExpired?: boolean;
      type?: StockLedgerType;
      referenceType: string;
      referenceId: string;
      notes?: string | null;
      performedById?: string | null;
      links?: LedgerLinks;
      itemName?: string;
      /** Overrides the batch cost — only for a reversal replaying history. */
      forcedUnitCost?: number;
    },
  ): Promise<{ draws: IssueDraw[]; totalCost: number }> {
    const {
      itemId,
      locationId,
      quantity,
      strategy = 'FEFO',
      selectedBatchNumber,
      allowExpired = false,
      type = StockLedgerType.USAGE,
      referenceType,
      referenceId,
      notes,
      performedById,
      links,
      itemName,
      forcedUnitCost,
    } = params;

    if (!(quantity > 0)) {
      throw new BadRequestException(
        `Issue quantity must be greater than zero (got ${quantity}).`,
      );
    }

    const label = itemName ?? itemId;
    const notExpired: Prisma.InventoryBatchWhereInput = allowExpired
      ? {}
      : {
          OR: [
            { expiryDate: null },
            { expiryDate: { gte: this.startOfToday() } },
          ],
        };

    let sourceBatches: Array<{
      id: string;
      batchNumber: string | null;
      quantity: number;
      unitCost: Prisma.Decimal | number;
      expiryDate: Date | null;
    }>;

    if (strategy === 'MANUAL' && selectedBatchNumber) {
      const batch = await tx.inventoryBatch.findFirst({
        where: {
          itemId,
          locationId,
          batchNumber: selectedBatchNumber,
          quantity: { gt: 0 },
          ...notExpired,
        },
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          unitCost: true,
          expiryDate: true,
        },
      });
      if (!batch) {
        throw new BadRequestException(
          `Batch "${selectedBatchNumber}" of "${label}" has no issuable stock at this location` +
            (allowExpired ? '' : ' (expired batches are excluded)'),
        );
      }
      if (batch.quantity + EPSILON < quantity) {
        throw new BadRequestException(
          `Batch "${selectedBatchNumber}" holds ${batch.quantity} units of "${label}", ${quantity} requested`,
        );
      }
      sourceBatches = [batch];
    } else {
      sourceBatches = await tx.inventoryBatch.findMany({
        where: { itemId, locationId, quantity: { gt: 0 }, ...notExpired },
        orderBy:
          strategy === 'FIFO'
            ? [{ receivedAt: 'asc' }, { id: 'asc' }]
            : [{ expiryDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          unitCost: true,
          expiryDate: true,
        },
      });
    }

    const available = sourceBatches.reduce((s, b) => s + b.quantity, 0);
    if (available + EPSILON < quantity) {
      throw new BadRequestException(
        `Insufficient issuable stock for "${label}". Available: ${available}, Requested: ${quantity}` +
          (allowExpired ? '' : ' (expired batches are excluded)'),
      );
    }

    const draws: IssueDraw[] = [];
    let remaining = quantity;
    let totalCost = 0;

    for (const batch of sourceBatches) {
      if (remaining <= EPSILON) break;

      const take = Math.min(remaining, batch.quantity);
      const drawCost = forcedUnitCost ?? toNum(batch.unitCost);

      // before / after are read around THIS batch's mutation so the row is a
      // true step in the running balance.
      const before = await this.batchSum(tx, itemId, locationId);

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          quantity: { decrement: take },
          isActive: batch.quantity - take > EPSILON,
        },
      });

      const after = await this.syncLocationQty(tx, itemId, locationId);

      await this.postLedger(tx, {
        itemId,
        locationId,
        batchId: batch.id,
        type,
        before,
        after,
        quantityChange: -take,
        unitCost: drawCost,
        referenceType,
        referenceId,
        notes,
        performedById,
        links,
      });

      draws.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: take,
        unitCost: drawCost,
        totalCost: Number((take * drawCost).toFixed(2)),
        expiryDate: batch.expiryDate,
      });

      totalCost += take * drawCost;
      remaining -= take;
    }

    if (remaining > EPSILON) {
      // Unreachable given the availability check above; kept so a future edit
      // to the loop cannot silently under-issue.
      throw new BadRequestException(
        `Could not fulfil the full quantity of "${label}". Shortfall: ${remaining}`,
      );
    }

    await this.refreshItemAverageCost(tx, itemId);

    return { draws, totalCost: Number(totalCost.toFixed(2)) };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // REVERSAL
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Post the inverse of every ledger row belonging to a document.
   *
   * This is how a stock document is undone. The original rows stay exactly
   * where they are; each gets a compensating row pointing back at it through
   * `reversalOfId`. An issue is given back to the batch it came from at the
   * cost it left at, and a receipt is taken back out of the batch it went
   * into — so reversing is cost-neutral, which editing history would not be.
   *
   * Refuses to reverse twice: the unique constraint on `reversalOfId` would
   * catch it anyway, but the explicit check produces a usable error.
   */
  async reverseDocument(
    tx: Prisma.TransactionClient,
    params: {
      referenceType: string;
      referenceId: string;
      reversalReferenceType: string;
      reason: string;
      performedById?: string | null;
      links?: LedgerLinks;
    },
  ): Promise<{ reversed: number }> {
    const {
      referenceType,
      referenceId,
      reversalReferenceType,
      reason,
      performedById,
      links,
    } = params;

    const rows = await tx.inventoryLedger.findMany({
      where: { referenceType, referenceId, reversalOfId: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        itemId: true,
        locationId: true,
        batchId: true,
        quantityChange: true,
        unitCost: true,
        reversedBy: { select: { id: true } },
      },
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'This document has no stock movement to reverse.',
      );
    }

    const alreadyDone = rows.filter((r) => r.reversedBy);
    if (alreadyDone.length > 0) {
      throw new BadRequestException('This document has already been reversed.');
    }

    // Undo in reverse order so intermediate balances stay plausible.
    for (const row of [...rows].reverse()) {
      const change = -row.quantityChange;
      const unitCost = toNum(row.unitCost);
      const before = await this.batchSum(tx, row.itemId, row.locationId);

      if (row.batchId) {
        if (change > 0) {
          await tx.inventoryBatch.update({
            where: { id: row.batchId },
            data: { quantity: { increment: change }, isActive: true },
          });
        } else {
          const batch = await tx.inventoryBatch.findUnique({
            where: { id: row.batchId },
            select: { quantity: true, batchNumber: true },
          });
          const held = batch?.quantity ?? 0;
          if (held + EPSILON < Math.abs(change)) {
            throw new BadRequestException(
              `Cannot reverse: batch "${batch?.batchNumber ?? row.batchId}" now holds ` +
                `${held} units but the reversal needs to remove ${Math.abs(change)}. ` +
                `The stock has already been consumed — raise a stock adjustment instead.`,
            );
          }
          await tx.inventoryBatch.update({
            where: { id: row.batchId },
            data: {
              quantity: { decrement: Math.abs(change) },
              isActive: held - Math.abs(change) > EPSILON,
            },
          });
        }
      }

      const after = await this.syncLocationQty(tx, row.itemId, row.locationId);

      await this.postLedger(tx, {
        itemId: row.itemId,
        locationId: row.locationId,
        batchId: row.batchId,
        type:
          change > 0
            ? StockLedgerType.REVERSAL_IN
            : StockLedgerType.REVERSAL_OUT,
        before,
        after,
        quantityChange: change,
        unitCost,
        referenceType: reversalReferenceType,
        referenceId,
        notes: `Reversal: ${reason}`,
        performedById,
        links,
        reversalOfId: row.id,
      });

      await this.refreshItemAverageCost(tx, row.itemId);
    }

    return { reversed: rows.length };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INTERNALS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Keep InventoryItem.unitCost as the weighted average of what is actually
   * on hand. No receipt used to update it at all, so the figure every
   * valuation report reads drifted further from reality with each delivery.
   */
  private async refreshItemAverageCost(
    tx: Prisma.TransactionClient,
    itemId: string,
  ) {
    const batches = await tx.inventoryBatch.findMany({
      where: { itemId, quantity: { gt: 0 } },
      select: { quantity: true, unitCost: true },
    });

    if (batches.length === 0) return; // keep the last known cost

    const qty = batches.reduce((s, b) => s + b.quantity, 0);
    if (qty <= EPSILON) return;

    const value = batches.reduce(
      (s, b) => s + b.quantity * toNum(b.unitCost),
      0,
    );

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { unitCost: Number((value / qty).toFixed(2)) },
    });
  }

  /** Midnight today — a batch expiring today is still usable today. */
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
