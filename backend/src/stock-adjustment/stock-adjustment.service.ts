import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStockAdjustmentDto,
  ApproveAdjustmentDto,
  StockAdjustmentFilterDto,
} from './dto/stock-adjustment.dto';
import { StockLedgerType, Prisma } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class StockAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private generateLedgerCode(): string {
    return `INVL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(filter: StockAdjustmentFilterDto) {
    const {
      locationId,
      reason,
      status,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
    } = filter;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: Prisma.StockAdjustmentWhereInput = {};

    if (locationId) where.locationId = locationId;
    if (reason) where.reason = reason;
    if (status) where.status = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { adjustmentCode: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, adjustments] = await Promise.all([
      this.prisma.stockAdjustment.count({ where }),
      this.prisma.stockAdjustment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true, type: true } },
          items: {
            select: {
              id: true,
              itemName: true,
              itemType: true,
              unit: true,
              quantitySystem: true,
              quantityActual: true,
              quantityDifference: true,
              unitCost: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return {
      adjustments,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take),
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET ONE
  // ─────────────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
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
                locationStocks: {
                  select: { quantity: true, locationId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment #${id} not found`);
    }

    return adjustment;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE (PENDING — no stock touched yet)
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateStockAdjustmentDto, performedById: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    const enrichedItems = await Promise.all(
      dto.items.map(async (item) => {
        const stock = await this.prisma.inventoryLocationStock.findFirst({
          where: {
            itemId: item.inventoryItemId,
            locationId: dto.locationId,
          },
        });
        const systemQty = stock?.quantity ?? 0;
        const difference = item.quantityActual - systemQty;

        return {
          itemType: 'INVENTORY',
          inventoryItem: { connect: { id: item.inventoryItemId } },
          itemName: item.itemName,
          unit: item.unit,
          quantitySystem: systemQty,
          quantityActual: item.quantityActual,
          quantityDifference: difference,
          unitCost: item.unitCost,
          batchNumber: item.batchNumber ?? null,
          notes: item.notes ?? null,
        };
      }),
    );

    const count = await this.prisma.stockAdjustment.count();
    const adjustmentCode = `ADJ-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.stockAdjustment.create({
      data: {
        adjustmentCode,
        locationId: dto.locationId,
        reason: dto.reason,
        notes: dto.notes,
        status: 'PENDING',
        performedById,
        items: { create: enrichedItems },
      },
      include: { location: true, items: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE — mutates stock + writes InventoryLedger entries
  // ─────────────────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveAdjustmentDto, approvedById: string) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: {
        items: true,
        location: true,
      },
    });

    if (!adjustment) throw new NotFoundException('Adjustment not found');
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(
        `Adjustment is already ${adjustment.status}. Only PENDING adjustments can be approved.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of adjustment.items) {
        const diff = item.quantityDifference; // actual - system
        if (diff === 0) continue;
        if (!item.inventoryItemId) continue;

        // ── Fetch item to check batchTracking flag ─────────────────────
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, name: true, batchTracking: true, unitCost: true },
        });
        if (!inventoryItem) continue;

        const unitCost = toNum(inventoryItem.unitCost ?? item.unitCost);

        // ── CASE 1: Batch Tracking DISABLED ────────────────────────────
        // ── CASE 1: Batch Tracking DISABLED ────────────────────────────
        if (!inventoryItem.batchTracking) {
          await this.handleNonBatchAdjustment(tx, {
            itemId: item.inventoryItemId!,
            locationId: adjustment.locationId,
            diff,
            unitCost,
            referenceId: adjustment.id,
            performedById: approvedById,
            reason: adjustment.reason,
            notes: item.notes ?? undefined, // ✅ Convert null → undefined
          });
          continue;
        }

        // ── CASE 2: Batch Tracking ENABLED ─────────────────────────────
        await this.handleBatchAdjustment(tx, {
          itemId: item.inventoryItemId!,
          locationId: adjustment.locationId,
          diff,
          unitCost,
          referenceId: adjustment.id,
          performedById: approvedById,
          reason: adjustment.reason,
          notes: item.notes ?? undefined, // ✅ Convert null → undefined
          // ✅ Use correct field names from DTO
          selectedBatchId: (item as any).batchId, // Cast if needed, or add to type
          selectedBatchNumber: item.batchNumber ?? undefined, // ✅ Convert null → undefined
          distributionStrategy: (item as any).distributionStrategy ?? 'FEFO',
        });
      }

      // ── Mark adjustment APPROVED ─────────────────────────────────────
      await tx.stockAdjustment.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById,
          approvedAt: new Date(),
          notes: dto.notes ?? null, // ✅ Use 'notes', not 'approvalNotes'
        },
      });
    });

    return this.findOne(id);
  }

  private async handleNonBatchAdjustment(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      diff: number;
      unitCost: number;
      referenceId: string;
      performedById: string;
      reason: string;
      notes?: string | null;
    },
  ) {
    const {
      itemId,
      locationId,
      diff,
      unitCost,
      referenceId,
      performedById,
      reason,
      notes,
    } = params;

    // ── 1. Upsert DEFAULT batch (batchNumber = 'DEFAULT') ─────────────
    const defaultBatch = await tx.inventoryBatch.upsert({
      where: {
        itemId_locationId_batchNumber: {
          itemId,
          locationId,
          batchNumber: 'DEFAULT',
        },
      },
      create: {
        itemId,
        locationId,
        batchNumber: 'DEFAULT',
        quantity: Math.max(0, diff), // Don't create negative batch
        unitCost,
        isActive: diff > 0,
        expiryDate: null, // No expiry for non-batch items
      },
      update: {
        quantity: { increment: diff },
        unitCost, // Update to latest cost
        isActive: diff > 0, // Keep active if qty > 0
      },
      select: { id: true, quantity: true },
    });

    // ── 2. Upsert location stock (recalculated from batches) ───────────
    // For non-batch: location stock = DEFAULT batch quantity
    await tx.inventoryLocationStock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: {
        itemId,
        locationId,
        quantity: defaultBatch.quantity,
        minQuantity: 0,
      },
      update: { quantity: defaultBatch.quantity },
    });

    // ── 3. Write ledger entry ──────────────────────────────────────────
    const qtyBefore = defaultBatch.quantity - diff;
    await tx.inventoryLedger.create({
      data: {
        ledgerCode: this.generateLedgerCode(),
        itemId,
        locationId,
        batchId: defaultBatch.id,
        type:
          diff > 0
            ? StockLedgerType.ADJUSTMENT_IN
            : StockLedgerType.ADJUSTMENT_OUT,
        quantityBefore: Math.max(0, qtyBefore),
        quantityChange: diff,
        quantityAfter: defaultBatch.quantity,
        unitCost,
        totalValue: Math.abs(diff) * unitCost,
        referenceType: 'ADJUSTMENT',
        referenceId,
        stockAdjustmentId: referenceId,
        notes: `Adjustment (${reason}): ${diff} units${notes ? ` — ${notes}` : ''}`,
        performedById,
      },
    });
  }

  private async handleBatchAdjustment(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      diff: number;
      unitCost: number;
      referenceId: string;
      performedById: string;
      reason: string;
      notes?: string;
      selectedBatchId?: string;
      selectedBatchNumber?: string;
      distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
    },
  ) {
    const {
      itemId,
      locationId,
      diff,
      unitCost,
      referenceId,
      performedById,
      reason,
      notes,
      selectedBatchId,
      selectedBatchNumber,
      distributionStrategy = 'FEFO',
    } = params;

    // ── Fetch all active batches for this item+location ────────────────
    const batches = await tx.inventoryBatch.findMany({
      where: {
        itemId,
        locationId,
        isActive: true,
        quantity: { gt: 0 },
      },
      orderBy:
        distributionStrategy === 'FIFO'
          ? [{ receivedAt: 'asc' }]
          : [{ expiryDate: 'asc' }, { receivedAt: 'asc' }], // FEFO default
      select: {
        id: true,
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        receivedAt: true,
      },
    });

    let remainingAdjustment = diff;
    let qtyBeforeTotal = 0;
    let batchIdForLedger: string | null = null;

    // ── CASE A: Manual batch selection ─────────────────────────────────
    if (
      distributionStrategy === 'MANUAL' &&
      (selectedBatchId || selectedBatchNumber)
    ) {
      const targetBatch = selectedBatchId
        ? await tx.inventoryBatch.findUnique({
            where: { id: selectedBatchId },
            select: { id: true, quantity: true, batchNumber: true }, // ✅ Add batchNumber
          })
        : await tx.inventoryBatch.findFirst({
            where: {
              itemId,
              locationId,
              batchNumber: selectedBatchNumber,
            },
            select: { id: true, quantity: true, batchNumber: true }, // ✅ Add batchNumber
          });
      if (!targetBatch) {
        throw new BadRequestException(
          `Selected batch not found for item ${itemId} at location ${locationId}`,
        );
      }

      const newQty = targetBatch.quantity + remainingAdjustment;
      if (newQty < 0) {
        throw new BadRequestException(
          `Cannot adjust batch "${targetBatch.batchNumber}" to negative quantity`,
        );
      }

      await tx.inventoryBatch.update({
        where: { id: targetBatch.id },
        data: {
          quantity: { increment: remainingAdjustment },
          unitCost,
          isActive: newQty > 0,
        },
      });

      batchIdForLedger = targetBatch.id;
      qtyBeforeTotal = targetBatch.quantity;
      remainingAdjustment = 0;
    }
    // ── CASE B: Auto-distribution (FEFO/FIFO) ─────────────────────────
    else {
      if (batches.length === 0 && diff > 0) {
        // No batches exist, create new one for positive adjustment
        const newBatch = await tx.inventoryBatch.create({
          data: {
            itemId,
            locationId,
            batchNumber: `ADJ-${Date.now()}`, // Auto-generated batch code
            quantity: diff,
            unitCost,
            isActive: true,
            expiryDate: null, // User can update later via batch management
          },
          select: { id: true, quantity: true },
        });
        batchIdForLedger = newBatch.id;
        qtyBeforeTotal = 0;
        remainingAdjustment = 0;
      } else if (batches.length === 0 && diff < 0) {
        throw new BadRequestException(
          `Cannot reduce stock: no active batches found for item ${itemId} at location ${locationId}`,
        );
      } else {
        // Distribute across batches in FEFO/FIFO order
        for (const batch of batches) {
          if (remainingAdjustment === 0) break;

          const deductAmount =
            diff < 0
              ? Math.min(Math.abs(remainingAdjustment), batch.quantity) // Can't deduct more than batch has
              : remainingAdjustment; // For positive, can add freely

          const actualDeduct = diff < 0 ? -deductAmount : deductAmount;

          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              quantity: { increment: actualDeduct },
              unitCost, // Update cost to latest
              isActive: batch.quantity + actualDeduct > 0,
            },
          });

          if (!batchIdForLedger) batchIdForLedger = batch.id; // Track first batch for ledger
          qtyBeforeTotal += batch.quantity;
          remainingAdjustment -= actualDeduct;
        }

        if (remainingAdjustment !== 0 && diff < 0) {
          throw new BadRequestException(
            `Insufficient stock across all batches to fulfill adjustment of ${diff} units`,
          );
        }
      }
    }

    // ── Recalculate location stock from batch sums ─────────────────────
    const batchSum = await tx.inventoryBatch.aggregate({
      where: { itemId, locationId, isActive: true },
      _sum: { quantity: true },
    });
    const locationQty = batchSum._sum.quantity ?? 0;

    await tx.inventoryLocationStock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, quantity: locationQty, minQuantity: 0 },
      update: { quantity: locationQty },
    });

    // ── Write ledger entry ─────────────────────────────────────────────
    const qtyAfter = locationQty;
    const qtyBefore = qtyAfter - diff;

    await tx.inventoryLedger.create({
      data: {
        ledgerCode: this.generateLedgerCode(),
        itemId,
        locationId,
        batchId: batchIdForLedger,
        type:
          diff > 0
            ? StockLedgerType.ADJUSTMENT_IN
            : StockLedgerType.ADJUSTMENT_OUT,
        quantityBefore: Math.max(0, qtyBefore),
        quantityChange: diff,
        quantityAfter: qtyAfter,
        unitCost,
        totalValue: Math.abs(diff) * unitCost,
        referenceType: 'ADJUSTMENT',
        referenceId,
        stockAdjustmentId: referenceId,
        notes: `Adjustment (${reason}): ${diff} units${notes ? ` — ${notes}` : ''}`,
        performedById,
      },
    });
  }

  async reject(id: string, notes: string, rejectedById: string) {
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id },
    });
    if (!adjustment) throw new NotFoundException('Adjustment not found');
    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException('Only PENDING adjustments can be rejected');
    }

    return this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: rejectedById,
        approvedAt: new Date(),
        notes: notes ?? null,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────

  async getStats() {
    const [total, pending, approved, rejected, thisMonth] = await Promise.all([
      this.prisma.stockAdjustment.count(),
      this.prisma.stockAdjustment.count({ where: { status: 'PENDING' } }),
      this.prisma.stockAdjustment.count({ where: { status: 'APPROVED' } }),
      this.prisma.stockAdjustment.count({ where: { status: 'REJECTED' } }),
      this.prisma.stockAdjustment.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    const valueResult = await this.prisma.stockAdjustmentItem.aggregate({
      _sum: { unitCost: true },
      where: {
        adjustment: { status: 'APPROVED' },
        quantityDifference: { not: 0 },
      },
    });

    return {
      total,
      pending,
      approved,
      rejected,
      thisMonth,
      totalValueAdjusted: valueResult._sum.unitCost ?? 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH ITEMS
  // ─────────────────────────────────────────────────────────────────────────

  async searchItems(query: string, locationId: string) {
    const q = { contains: query, mode: 'insensitive' as const };

    // ✅ Search ALL active items, not just those with stock
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        OR: [{ name: q }, { itemCode: q }],
      },
      select: {
        id: true,
        name: true,
        itemCode: true,
        unit: true,
        uom: true,
        unitCost: true,
        minQuantity: true,
        batchTracking: true, // ✅ Include batchTracking
        category: { select: { name: true } },
        locationStocks: {
          where: { locationId },
          select: { quantity: true },
        },
      },
      take: 50, // Increase limit for better search results
    });

    return {
      inventoryItems: inventoryItems.map((i) => ({
        id: i.id,
        type: 'INVENTORY' as const,
        name: i.name,
        code: i.itemCode,
        unit: i.unit,
        uom: i.uom,
        unitCost: i.unitCost,
        currentStock: i.locationStocks[0]?.quantity ?? 0, // Default to 0
        minQuantity: i.minQuantity ?? 0,
        category: i.category?.name ?? null,
        batchTracking: i.batchTracking ?? false, // ✅ Pass to frontend
      })),
    };
  }

  async getLocationStock(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    // ✅ Fetch ALL active inventory items (not just those with existing stock)
    const allItems = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        itemCode: true,
        unit: true,
        uom: true,
        unitCost: true,
        minQuantity: true, // ✅ Include for low-stock logic
        batchTracking: true, // ✅ Include for batch UI
        category: { select: { name: true } },
        // Get location-specific stock IF it exists
        locationStocks: {
          where: { locationId },
          select: { quantity: true, minQuantity: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      location,
      inventoryItems: allItems.map((item) => {
        const locStock = item.locationStocks[0];
        return {
          id: item.id,
          type: 'INVENTORY' as const,
          name: item.name,
          code: item.itemCode,
          unit: item.unit,
          uom: item.uom,
          unitCost: item.unitCost,
          // ✅ Default to 0 if no stock record exists yet
          currentStock: locStock?.quantity ?? 0,
          minQuantity: locStock?.minQuantity ?? item.minQuantity ?? 0,
          category: item.category?.name ?? null,
          // ✅ Critical for batch tracking UI
          batchTracking: item.batchTracking ?? false,
        };
      }),
    };
  }
}
