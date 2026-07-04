import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockOutDto,
  StockOutItemDto,
  QueryStockOutDto,
} from './dto/stock-out.dto';
import { Prisma, StockLedgerType, StockOutCategory } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class StockOutService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async generateOutCode(): Promise<string> {
    const count = await this.prisma.stockOut.count();
    const pad = String(count + 1).padStart(4, '0');
    return `SO-${new Date().getFullYear()}-${pad}`;
  }

  private generateLedgerCode(): string {
    return `INVL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE — validates stock then immediately deducts
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateStockOutDto, performedById?: string) {
    // 1. Validate location
    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    // 2. Pre-validate all items have enough stock before touching anything
    await this.validateStockAvailability(dto.items, dto.locationId);

    const outCode = await this.generateOutCode();
    let totalValue = 0;

    // 3. Calculate total value
    for (const item of dto.items) {
      totalValue += item.quantity * item.unitCost;
    }

    // 4. Run everything in a single transaction
    const stockOut = await this.prisma.$transaction(async (tx) => {
      // 4a. Create the StockOut header
      const created = await tx.stockOut.create({
        data: {
          outCode,
          locationId: dto.locationId,
          category: dto.category ?? StockOutCategory.GENERAL_USE,
          reason: dto.reason,
          notes: dto.notes,
          performedById,
          totalValue,
          items: {
            create: dto.items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              itemName: item.itemName,
              unit: item.unit,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.quantity * item.unitCost,
              distributionStrategy: item.distributionStrategy ?? 'FEFO',
              notes: item.notes,
            })),
          },
        },
        include: { items: true },
      });

      // 4b. Deduct stock for each line item
      for (const item of dto.items) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, batchTracking: true, unitCost: true },
        });
        if (!inventoryItem) continue;

        const unitCost = toNum(inventoryItem.unitCost ?? item.unitCost);

        if (!inventoryItem.batchTracking) {
          await this.deductNonBatch(tx, {
            itemId: item.inventoryItemId,
            locationId: dto.locationId,
            quantity: item.quantity,
            unitCost,
            stockOutId: created.id,
            performedById,
            reason: dto.reason ?? dto.notes,
          });
        } else {
          await this.deductBatch(tx, {
            itemId: item.inventoryItemId,
            locationId: dto.locationId,
            quantity: item.quantity,
            unitCost,
            stockOutId: created.id,
            performedById,
            reason: dto.reason ?? dto.notes,
            distributionStrategy: item.distributionStrategy ?? 'FEFO',
            selectedBatchNumber: item.selectedBatchNumber,
          });
        }
      }

      // 4c. Return the created record ID (findOne runs AFTER tx commits)
      return created;
    });

    // 5. Fetch the fully enriched record now that the transaction is committed
    return this.findOne(stockOut.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATE — check all items have sufficient stock before deducting
  // ─────────────────────────────────────────────────────────────────────────

  private async validateStockAvailability(
    items: StockOutItemDto[],
    locationId: string,
  ) {
    for (const item of items) {
      const stock = await this.prisma.inventoryLocationStock.findUnique({
        where: {
          itemId_locationId: {
            itemId: item.inventoryItemId,
            locationId,
          },
        },
        select: { quantity: true },
      });

      if (!stock || stock.quantity < item.quantity) {
        const available = stock?.quantity ?? 0;
        throw new BadRequestException(
          `Insufficient stock for "${item.itemName}". ` +
            `Available: ${available}, Requested: ${item.quantity}`,
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH DEDUCTION — FEFO / FIFO / MANUAL
  // ─────────────────────────────────────────────────────────────────────────

  private async deductBatch(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      unitCost: number;
      stockOutId: string;
      performedById?: string;
      reason?: string | null;
      distributionStrategy: 'FEFO' | 'FIFO' | 'MANUAL';
      selectedBatchNumber?: string;
    },
  ) {
    const {
      itemId,
      locationId,
      quantity,
      unitCost,
      stockOutId,
      performedById,
      reason,
      distributionStrategy,
      selectedBatchNumber,
    } = params;

    let remaining = quantity;

    // ── Determine source batches ─────────────────────────────────────
    let sourceBatches: {
      id: string;
      batchNumber: string | null;
      quantity: number;
      expiryDate: Date | null;
    }[];

    if (distributionStrategy === 'MANUAL' && selectedBatchNumber) {
      const batch = await tx.inventoryBatch.findFirst({
        where: {
          itemId,
          locationId,
          batchNumber: selectedBatchNumber,
          isActive: true,
          quantity: { gt: 0 },
        },
        select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
      });
      if (!batch) {
        throw new BadRequestException(
          `Batch "${selectedBatchNumber}" not found or has no stock`,
        );
      }
      if (batch.quantity < quantity) {
        throw new BadRequestException(
          `Batch "${selectedBatchNumber}" only has ${batch.quantity} units, requested ${quantity}`,
        );
      }
      sourceBatches = [batch];
    } else {
      // FEFO: soonest expiry first; FIFO: oldest received first
      sourceBatches = await tx.inventoryBatch.findMany({
        where: { itemId, locationId, isActive: true, quantity: { gt: 0 } },
        orderBy:
          distributionStrategy === 'FIFO'
            ? [{ receivedAt: 'asc' }]
            : [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
        select: { id: true, batchNumber: true, quantity: true, expiryDate: true },
      });
    }

    if (sourceBatches.length === 0) {
      throw new BadRequestException(
        `No active batches with stock found for item at this location`,
      );
    }

    // ── Draw from batches ────────────────────────────────────────────
    const ledgerEntries: { batchId: string; qty: number }[] = [];

    for (const batch of sourceBatches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, batch.quantity);
      const newBatchQty = batch.quantity - deductQty;

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          quantity: { decrement: deductQty },
          isActive: newBatchQty > 0,
        },
      });

      ledgerEntries.push({ batchId: batch.id, qty: deductQty });
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Could not fulfill full quantity. Shortfall: ${remaining} units`,
      );
    }

    // ── Recalculate location stock ───────────────────────────────────
    await this.recalculateLocationStock(tx, itemId, locationId);

    // ── Write one ledger entry per batch drawn ───────────────────────
    for (const entry of ledgerEntries) {
      const stock = await tx.inventoryLocationStock.findUnique({
        where: { itemId_locationId: { itemId, locationId } },
        select: { quantity: true },
      });
      const qtyAfter = stock?.quantity ?? 0;
      const qtyBefore = qtyAfter + entry.qty;

      await tx.inventoryLedger.create({
        data: {
          ledgerCode: this.generateLedgerCode(),
          itemId,
          locationId,
          batchId: entry.batchId,
          type: StockLedgerType.STOCK_OUT,
          quantityBefore: qtyBefore,
          quantityChange: -entry.qty,
          quantityAfter: qtyAfter,
          unitCost,
          totalValue: entry.qty * unitCost,
          referenceType: 'STOCK_OUT',
          referenceId: stockOutId,
          stockOutId,
          notes: `Stock out: ${entry.qty} units${reason ? ` — ${reason}` : ''}`,
          performedById,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NON-BATCH DEDUCTION — uses DEFAULT batch (same pattern as WasteService)
  // ─────────────────────────────────────────────────────────────────────────

  private async deductNonBatch(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      unitCost: number;
      stockOutId: string;
      performedById?: string;
      reason?: string | null;
    },
  ) {
    const { itemId, locationId, quantity, unitCost, stockOutId, performedById, reason } =
      params;

    // Ensure DEFAULT batch exists
    const defaultBatch = await tx.inventoryBatch.upsert({
      where: {
        itemId_locationId_batchNumber: { itemId, locationId, batchNumber: 'DEFAULT' },
      },
      create: {
        itemId,
        locationId,
        batchNumber: 'DEFAULT',
        quantity: 0,
        unitCost,
        isActive: true,
        expiryDate: null,
      },
      update: {},
      select: { id: true, quantity: true },
    });

    if (defaultBatch.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient stock in DEFAULT batch (available: ${defaultBatch.quantity})`,
      );
    }

    const newQty = defaultBatch.quantity - quantity;
    await tx.inventoryBatch.update({
      where: { id: defaultBatch.id },
      data: {
        quantity: { decrement: quantity },
        isActive: newQty > 0,
      },
    });

    await this.recalculateLocationStock(tx, itemId, locationId);

    const stock = await tx.inventoryLocationStock.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
      select: { quantity: true },
    });
    const qtyAfter = stock?.quantity ?? 0;
    const qtyBefore = qtyAfter + quantity;

    await tx.inventoryLedger.create({
      data: {
        ledgerCode: this.generateLedgerCode(),
        itemId,
        locationId,
        batchId: defaultBatch.id,
        type: StockLedgerType.STOCK_OUT,
        quantityBefore: qtyBefore,
        quantityChange: -quantity,
        quantityAfter: qtyAfter,
        unitCost,
        totalValue: quantity * unitCost,
        referenceType: 'STOCK_OUT',
        referenceId: stockOutId,
        stockOutId,
        notes: `Stock out: ${quantity} units${reason ? ` — ${reason}` : ''}`,
        performedById,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECALCULATE location stock from batch sum (keeps InventoryLocationStock in sync)
  // ─────────────────────────────────────────────────────────────────────────

  private async recalculateLocationStock(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ) {
    const agg = await tx.inventoryBatch.aggregate({
      where: { itemId, locationId, isActive: true },
      _sum: { quantity: true },
    });
    const calculatedQty = agg._sum.quantity ?? 0;

    await tx.inventoryLocationStock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, quantity: calculatedQty, minQuantity: 0 },
      update: { quantity: calculatedQty },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(query: QueryStockOutDto) {
    const {
      locationId,
      category,
      search,
      startDate,
      endDate,
      page = '1',
      limit = '20',
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Prisma.StockOutWhereInput = {
      ...(locationId && { locationId }),
      ...(category && { category }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
      ...(search && {
        OR: [
          { outCode: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          {
            items: {
              some: { itemName: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.stockOut.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, type: true } },
          items: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  itemCode: true,
                  locationStocks: { select: { quantity: true, locationId: true } },
                },
              },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.stockOut.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET ONE
  // ─────────────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const record = await this.prisma.stockOut.findUnique({
      where: { id },
      include: {
        location: true,
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                itemCode: true,
                uom: true,
                locationStocks: { select: { quantity: true, locationId: true } },
              },
            },
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          include: { batch: { select: { batchNumber: true, expiryDate: true } } },
        },
      },
    });

    if (!record) throw new NotFoundException('Stock out record not found');
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────

  async getStats(locationId?: string) {
    const baseWhere: Prisma.StockOutWhereInput = locationId ? { locationId } : {};
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRecords, totalValueResult, monthlyValueResult, todayCount, byCategory] =
      await Promise.all([
        this.prisma.stockOut.count({ where: baseWhere }),
        this.prisma.stockOut.aggregate({
          where: baseWhere,
          _sum: { totalValue: true },
        }),
        this.prisma.stockOut.aggregate({
          where: { ...baseWhere, createdAt: { gte: thisMonth } },
          _sum: { totalValue: true },
        }),
        this.prisma.stockOut.count({
          where: { ...baseWhere, createdAt: { gte: today } },
        }),
        this.prisma.stockOut.groupBy({
          by: ['category'],
          where: baseWhere,
          _count: true,
          _sum: { totalValue: true },
        }),
      ]);

    return {
      totalRecords,
      totalValue: totalValueResult._sum.totalValue ?? 0,
      monthlyValue: monthlyValueResult._sum.totalValue ?? 0,
      todayCount,
      byCategory,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOCATION STOCK — items with available stock for the stock-out form
  // ─────────────────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────────────────
  // AVAILABLE BATCHES — for manual batch selection in the form
  // ─────────────────────────────────────────────────────────────────────────

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
      return {
        batchTracking: false,
        batches: [
          {
            id: 'DEFAULT',
            batchNumber: null,
            quantity: stock?.quantity ?? 0,
            expiryDate: null,
            receivedAt: null,
          },
        ],
      };
    }

    const batches = await this.prisma.inventoryBatch.findMany({
      where: { itemId, locationId, isActive: true, quantity: { gt: 0 } },
      select: { id: true, batchNumber: true, quantity: true, expiryDate: true, receivedAt: true },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

    return { batchTracking: true, batches };
  }
}
