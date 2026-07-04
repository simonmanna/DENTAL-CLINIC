import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StockLedgerType } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function genCode(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${timestamp}${random}`;
}

@Injectable()
export class DirectStockService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────────
  // DIRECT STOCK IN — same logic as PurchaseService.updateStockOnReceipt
  // ───────────────────────────────────────────────────────────────────────────

  async stockIn(dto: { locationId: string; items: Array<{ inventoryItemId: string; quantity: number; unitCost: number; batchNumber?: string; expiryDate?: string; itemName?: string; unit?: string }>; notes?: string }, performedById?: string) {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw new NotFoundException('Location not found');

    const txResult = await this.prisma.$transaction(async (tx) => {
      const receiptCode = genCode('DSI');
      let totalValue = 0;
      const createdItems: Array<{ inventoryItemId: string; quantity: number; unitCost: number; batchId: string; itemName?: string }> = [];

      for (const item of dto.items) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, name: true, batchTracking: true, unit: true, unitCost: true },
        });
        if (!inventoryItem) throw new NotFoundException(`Inventory item ${item.inventoryItemId} not found`);

        const qtyNum = item.quantity;
        const unitCost = item.unitCost ?? toNum(inventoryItem.unitCost);
        const totalItemValue = qtyNum * unitCost;
        totalValue += totalItemValue;

        const batchNumber = item.batchNumber?.trim();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;

        // Validation: batch-tracked items must have batch info
        if (inventoryItem.batchTracking) {
          if (!batchNumber) throw new BadRequestException(`Item "${inventoryItem.name}" has batch tracking enabled. Batch number is required.`);
          if (!expiryDate) throw new BadRequestException(`Item "${inventoryItem.name}" has batch tracking enabled. Expiry date is required.`);
        }

        const resolvedBatchNumber = inventoryItem.batchTracking ? batchNumber! : 'DEFAULT';

        // ── 1. Upsert InventoryBatch ───────────────────────────────────
        let batchId: string;
        const existingBatch = await tx.inventoryBatch.findUnique({
          where: {
            itemId_locationId_batchNumber: {
              itemId: item.inventoryItemId,
              locationId: dto.locationId,
              batchNumber: resolvedBatchNumber,
            },
          },
          select: { id: true },
        });

        if (existingBatch) {
          const updated = await tx.inventoryBatch.update({
            where: { id: existingBatch.id },
            data: {
              quantity: { increment: qtyNum },
              unitCost,
              ...(expiryDate && { expiryDate }),
              isActive: true,
            },
            select: { id: true },
          });
          batchId = updated.id;
        } else {
          const created = await tx.inventoryBatch.create({
            data: {
              itemId: item.inventoryItemId,
              locationId: dto.locationId,
              batchNumber: resolvedBatchNumber,
              expiryDate,
              quantity: qtyNum,
              unitCost,
              isActive: true,
            },
            select: { id: true },
          });
          batchId = created.id;
        }

        // ── 2. Recalculate location stock from batch sums ──────────────
        const batchSum = await tx.inventoryBatch.aggregate({
          where: { itemId: item.inventoryItemId, locationId: dto.locationId, isActive: true },
          _sum: { quantity: true },
        });
        const calculatedQty = batchSum._sum.quantity ?? 0;

        await tx.inventoryLocationStock.upsert({
          where: { itemId_locationId: { itemId: item.inventoryItemId, locationId: dto.locationId } },
          create: { itemId: item.inventoryItemId, locationId: dto.locationId, quantity: calculatedQty, minQuantity: 0 },
          update: { quantity: calculatedQty },
        });

        // ── 3. Write InventoryLedger entry ────────────────────────────
        const locationQtyBefore = calculatedQty - qtyNum;
        await tx.inventoryLedger.create({
          data: {
            ledgerCode: genCode('ILG'),
            itemId: item.inventoryItemId,
            locationId: dto.locationId,
            batchId,
            type: StockLedgerType.PURCHASE_RECEIPT,
            quantityBefore: locationQtyBefore,
            quantityChange: qtyNum,
            quantityAfter: calculatedQty,
            unitCost,
            totalValue: totalItemValue,
            referenceType: 'DIRECT_STOCK_IN',
            referenceId: receiptCode,
            notes: `Direct stock in: ${qtyNum} ${inventoryItem.unit ?? 'units'}${dto.notes ? ` — ${dto.notes}` : ''}`,
            performedById,
          },
        });

        createdItems.push({
          inventoryItemId: item.inventoryItemId,
          quantity: qtyNum,
          unitCost,
          batchId,
          itemName: inventoryItem.name,
        });
      }

      return { receiptCode, totalValue, items: createdItems };
    });

    return {
      code: txResult.receiptCode,
      type: 'IN',
      locationId: dto.locationId,
      totalValue: txResult.totalValue,
      items: txResult.items,
      notes: dto.notes,
      timestamp: new Date(),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DIRECT STOCK OUT — same logic as StockOutService.deductNonBatch / deductBatch
  // ───────────────────────────────────────────────────────────────────────────

  async stockOut(dto: { locationId: string; items: Array<{ inventoryItemId: string; quantity: number; distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL'; selectedBatchNumber?: string; itemName?: string; unitCost?: number }>; notes?: string }, performedById?: string) {
    const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw new NotFoundException('Location not found');

    // Pre-validate stock availability
    for (const item of dto.items) {
      const stock = await this.prisma.inventoryLocationStock.findUnique({
        where: { itemId_locationId: { itemId: item.inventoryItemId, locationId: dto.locationId } },
        select: { quantity: true },
      });
      if (!stock || stock.quantity < item.quantity) {
        const available = stock?.quantity ?? 0;
        throw new BadRequestException(`Insufficient stock. Available: ${available}, Requested: ${item.quantity}`);
      }
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const outCode = genCode('DSO');
      let totalValue = 0;
      const deductedItems: Array<{ inventoryItemId: string; quantity: number; unitCost: number; batchId: string; itemName?: string }> = [];

      for (const item of dto.items) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, name: true, batchTracking: true, unitCost: true },
        });
        if (!inventoryItem) throw new NotFoundException(`Inventory item ${item.inventoryItemId} not found`);

        const unitCost = toNum(item.unitCost ?? inventoryItem.unitCost);
        let remaining = item.quantity;

        if (!inventoryItem.batchTracking) {
          // ── Non-batch: deduct from DEFAULT batch ──────────────────
          const defaultBatch = await tx.inventoryBatch.upsert({
            where: { itemId_locationId_batchNumber: { itemId: item.inventoryItemId, locationId: dto.locationId, batchNumber: 'DEFAULT' } },
            create: { itemId: item.inventoryItemId, locationId: dto.locationId, batchNumber: 'DEFAULT', quantity: 0, unitCost, isActive: true, expiryDate: null },
            update: {},
            select: { id: true, quantity: true },
          });

          if (defaultBatch.quantity < remaining) {
            throw new BadRequestException(`Insufficient stock in DEFAULT batch (available: ${defaultBatch.quantity})`);
          }

          const newQty = defaultBatch.quantity - remaining;
          await tx.inventoryBatch.update({
            where: { id: defaultBatch.id },
            data: { quantity: { decrement: remaining }, isActive: newQty > 0 },
          });

          // Recalculate location stock
          const agg = await tx.inventoryBatch.aggregate({
            where: { itemId: item.inventoryItemId, locationId: dto.locationId, isActive: true },
            _sum: { quantity: true },
          });
          const calculatedQty = agg._sum.quantity ?? 0;
          await tx.inventoryLocationStock.upsert({
            where: { itemId_locationId: { itemId: item.inventoryItemId, locationId: dto.locationId } },
            create: { itemId: item.inventoryItemId, locationId: dto.locationId, quantity: calculatedQty, minQuantity: 0 },
            update: { quantity: calculatedQty },
          });

          // Ledger entry
          const qtyAfter = calculatedQty;
          const qtyBefore = qtyAfter + remaining;
          await tx.inventoryLedger.create({
            data: {
              ledgerCode: genCode('ILG'),
              itemId: item.inventoryItemId,
              locationId: dto.locationId,
              batchId: defaultBatch.id,
              type: StockLedgerType.STOCK_OUT,
              quantityBefore: qtyBefore,
              quantityChange: -remaining,
              quantityAfter: qtyAfter,
              unitCost,
              totalValue: remaining * unitCost,
              referenceType: 'DIRECT_STOCK_OUT',
              referenceId: outCode,
              notes: `Direct stock out: ${remaining} units${dto.notes ? ` — ${dto.notes}` : ''}`,
              performedById,
            },
          });

          totalValue += remaining * unitCost;
          deductedItems.push({ inventoryItemId: item.inventoryItemId, quantity: remaining, unitCost, batchId: defaultBatch.id, itemName: inventoryItem.name });
        } else {
          // ── Batch-tracked: deduct using FEFO/FIFO/MANUAL ──────────
          const distributionStrategy = item.distributionStrategy ?? 'FEFO';
          let sourceBatches: { id: string; batchNumber: string | null; quantity: number; expiryDate: Date | null }[];

          if (distributionStrategy === 'MANUAL' && item.selectedBatchNumber) {
            const batch = await tx.inventoryBatch.findFirst({
              where: { itemId: item.inventoryItemId, locationId: dto.locationId, batchNumber: item.selectedBatchNumber, isActive: true, quantity: { gt: 0 } },
              select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
            });
            if (!batch) throw new BadRequestException(`Batch "${item.selectedBatchNumber}" not found or has no stock`);
            if (batch.quantity < remaining) throw new BadRequestException(`Batch "${item.selectedBatchNumber}" only has ${batch.quantity} units, requested ${remaining}`);
            sourceBatches = [batch];
          } else {
            sourceBatches = await tx.inventoryBatch.findMany({
              where: { itemId: item.inventoryItemId, locationId: dto.locationId, isActive: true, quantity: { gt: 0 } },
              orderBy: distributionStrategy === 'FIFO'
                ? [{ receivedAt: 'asc' }]
                : [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
              select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
            });
          }

          if (sourceBatches.length === 0) throw new BadRequestException('No active batches with stock found');

          const ledgerEntries: { batchId: string; qty: number }[] = [];
          for (const batch of sourceBatches) {
            if (remaining <= 0) break;
            const deductQty = Math.min(remaining, batch.quantity);
            const newBatchQty = batch.quantity - deductQty;
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { quantity: { decrement: deductQty }, isActive: newBatchQty > 0 },
            });
            ledgerEntries.push({ batchId: batch.id, qty: deductQty });
            remaining -= deductQty;
          }

          if (remaining > 0) throw new BadRequestException(`Could not fulfill full quantity. Shortfall: ${remaining} units`);

          // Recalculate location stock
          const agg = await tx.inventoryBatch.aggregate({
            where: { itemId: item.inventoryItemId, locationId: dto.locationId, isActive: true },
            _sum: { quantity: true },
          });
          const calculatedQty = agg._sum.quantity ?? 0;
          await tx.inventoryLocationStock.upsert({
            where: { itemId_locationId: { itemId: item.inventoryItemId, locationId: dto.locationId } },
            create: { itemId: item.inventoryItemId, locationId: dto.locationId, quantity: calculatedQty, minQuantity: 0 },
            update: { quantity: calculatedQty },
          });

          // Write one ledger entry per batch drawn
          for (const entry of ledgerEntries) {
            const qtyAfterEntry = calculatedQty;
            const qtyBeforeEntry = qtyAfterEntry + entry.qty;
            await tx.inventoryLedger.create({
              data: {
                ledgerCode: genCode('ILG'),
                itemId: item.inventoryItemId,
                locationId: dto.locationId,
                batchId: entry.batchId,
                type: StockLedgerType.STOCK_OUT,
                quantityBefore: qtyBeforeEntry,
                quantityChange: -entry.qty,
                quantityAfter: qtyAfterEntry,
                unitCost,
                totalValue: entry.qty * unitCost,
                referenceType: 'DIRECT_STOCK_OUT',
                referenceId: outCode,
                notes: `Direct stock out: ${entry.qty} units${dto.notes ? ` — ${dto.notes}` : ''}`,
                performedById,
              },
            });
            totalValue += entry.qty * unitCost;
          }

          deductedItems.push({
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
            unitCost,
            batchId: ledgerEntries[0]?.batchId ?? '',
            itemName: inventoryItem.name,
          });
        }
      }

      return { outCode, totalValue, items: deductedItems };
    });

    return {
      code: txResult.outCode,
      type: 'OUT',
      locationId: dto.locationId,
      totalValue: txResult.totalValue,
      items: txResult.items,
      notes: dto.notes,
      timestamp: new Date(),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HISTORY — queries ledger for DIRECT_STOCK_IN and DIRECT_STOCK_OUT
  // ───────────────────────────────────────────────────────────────────────────

  async getHistory(query: {
    search?: string;
    locationId?: string;
    type?: 'IN' | 'OUT';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, locationId, type, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const referenceTypes = type === 'IN'
      ? ['DIRECT_STOCK_IN']
      : type === 'OUT'
        ? ['DIRECT_STOCK_OUT']
        : ['DIRECT_STOCK_IN', 'DIRECT_STOCK_OUT'];

    const where: Prisma.InventoryLedgerWhereInput = {
      referenceType: { in: referenceTypes },
      ...(locationId && { locationId }),
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          ...(endDate ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { referenceId: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { item: { name: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };

    // Group by referenceId to get transaction-level records
    const [ledgerEntries, total] = await Promise.all([
      this.prisma.inventoryLedger.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, itemCode: true, unit: true, uom: true } },
          location: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.inventoryLedger.count({ where }),
    ]);

    // Group entries by referenceId to form transactions
    const transactionMap = new Map<string, {
      code: string;
      type: 'IN' | 'OUT';
      locationId: string;
      locationName?: string;
      totalValue: number;
      timestamp: Date;
      notes?: string;
      items: any[];
      performedById?: string;
    }>();

    for (const entry of ledgerEntries) {
      const refType = entry.referenceType;
      const refId = entry.referenceId ?? '';
      const txType = refType === 'DIRECT_STOCK_IN' ? 'IN' as const : 'OUT' as const;

      if (!transactionMap.has(refId)) {
        transactionMap.set(refId, {
          code: refId,
          type: txType,
          locationId: entry.locationId,
          locationName: entry.location?.name,
          totalValue: 0,
          timestamp: entry.createdAt,
          notes: entry.notes?.replace(/^Direct stock (in|out): \d+ units? — /, '') ?? entry.notes ?? undefined,
          items: [],
          performedById: entry.performedById ?? undefined,
        });
      }

      const tx = transactionMap.get(refId)!;
      tx.items.push({
        itemId: entry.itemId,
        itemName: (entry as any).item?.name,
        itemCode: (entry as any).item?.itemCode,
        unit: (entry as any).item?.unit,
        uom: (entry as any).item?.uom,
        quantityChange: entry.quantityChange,
        unitCost: entry.unitCost,
        totalValue: entry.totalValue,
        batchNumber: (entry as any).batch?.batchNumber,
        expiryDate: (entry as any).batch?.expiryDate,
      });
      tx.totalValue += toNum(entry.totalValue ?? 0);
    }

    const data = Array.from(transactionMap.values());

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LOCATION STOCK — items with available stock for the stock-out form
  // ───────────────────────────────────────────────────────────────────────────

  async getLocationStock(locationId: string) {
    const stocks = await this.prisma.inventoryLocationStock.findMany({
      where: { locationId, quantity: { gt: 0 } },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            unit: true,
            unitCost: true,
            batchTracking: true,
            category: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { item: { name: 'asc' } },
    });

    return stocks.map((s) => ({
      id: s.item.id,
      name: s.item.name,
      itemCode: s.item.itemCode,
      unit: s.item.unit,
      unitCost: s.item.unitCost,
      availableQty: s.quantity,
      batchTracking: s.item.batchTracking ?? false,
      category: s.item.category,
    }));
  }

  async getAvailableBatches(itemId: string, locationId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, batchTracking: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    if (!item.batchTracking) {
      const stock = await this.prisma.inventoryLocationStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
        select: { quantity: true },
      });
      return { batchTracking: false, batches: [{ id: 'DEFAULT', batchNumber: null, quantity: stock?.quantity ?? 0, expiryDate: null, receivedAt: null }] };
    }

    const batches = await this.prisma.inventoryBatch.findMany({
      where: { itemId, locationId, isActive: true, quantity: { gt: 0 } },
      select: { id: true, batchNumber: true, quantity: true, expiryDate: true, receivedAt: true },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

    return { batchTracking: true, batches };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS
  // ───────────────────────────────────────────────────────────────────────────

  async getStats(locationId?: string) {
    const baseWhereIn: Prisma.InventoryLedgerWhereInput = { referenceType: 'DIRECT_STOCK_IN', ...(locationId ? { locationId } : {}) };
    const baseWhereOut: Prisma.InventoryLedgerWhereInput = { referenceType: 'DIRECT_STOCK_OUT', ...(locationId ? { locationId } : {}) };

    const [totalInValue, totalOutValue, todayIn, todayOut] = await Promise.all([
      this.prisma.inventoryLedger.aggregate({ where: baseWhereIn, _sum: { totalValue: true } }),
      this.prisma.inventoryLedger.aggregate({ where: baseWhereOut, _sum: { totalValue: true } }),
      this.prisma.inventoryLedger.count({
        where: { ...baseWhereIn, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.inventoryLedger.count({
        where: { ...baseWhereOut, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
    ]);

    return {
      totalInValue: totalInValue._sum.totalValue ?? 0,
      totalOutValue: totalOutValue._sum.totalValue ?? 0,
      todayIn,
      todayOut,
    };
  }
}
