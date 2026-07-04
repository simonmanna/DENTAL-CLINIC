import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWasteRecordDto,
  ApproveWasteRecordDto,
  QueryWasteRecordsDto,
} from './dto/create-waste.dto';
import { Prisma, StockLedgerType } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class WasteService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async generateWasteCode(): Promise<string> {
    const count = await this.prisma.wasteRecord.count();
    const pad = String(count + 1).padStart(4, '0');
    return `WR-${new Date().getFullYear()}-${pad}`;
  }

  private generateLedgerCode(): string {
    return `INVL-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE  (PENDING approval — stock not yet deducted)
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateWasteRecordDto, reportedById: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });
    if (!location) throw new NotFoundException('Location not found');

    let totalValue = 0;
    const validatedItems: Array<{
      inventoryItemId: string;
      itemName: string;
      unit: string;
      quantity: number;
      unitCost: number;
      totalCost: number;
      batchNumber?: string | null; // ← allow null
      expiryDate?: Date | null; // ← also allow null for safety
      reason?: string | null; // ← also allow null for safety
      selectedBatchNumber?: string;
      distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
    }> = [];
    // const validatedItems: Array<{
    //   inventoryItemId: string;
    //   itemName: string;
    //   unit: string;
    //   quantity: number;
    //   unitCost: number;
    //   totalCost: number;
    //   batchNumber?: string;
    //   expiryDate?: Date;
    //   reason?: string;
    // }> = [];

    for (const item of dto.items) {
      if (!item.inventoryItemId) {
        throw new BadRequestException(
          'inventoryItemId is required for waste items',
        );
      }

      const stock = await this.prisma.inventoryLocationStock.findUnique({
        where: {
          itemId_locationId: {
            itemId: item.inventoryItemId,
            locationId: dto.locationId,
          },
        },
        include: { item: true },
      });

      if (!stock) {
        throw new BadRequestException(
          `No stock found for item "${item.itemName}" at this location`,
        );
      }
      if (stock.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${item.itemName}". Available: ${stock.quantity}, Requested: ${item.quantity}`,
        );
      }

      const totalCost = item.quantity * item.unitCost;
      totalValue += totalCost;
      validatedItems.push({
        ...item,
        totalCost,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
      });
    }

    const wasteCode = await this.generateWasteCode();

    return this.prisma.$transaction(async (tx) => {
      return tx.wasteRecord.create({
        data: {
          wasteCode,
          locationId: dto.locationId,
          category: dto.category,
          reportedById,
          totalValue,
          notes: dto.notes,
          witnessName: dto.witnessName,
          disposalMethod: dto.disposalMethod,
          disposalDate: dto.disposalDate ? new Date(dto.disposalDate) : null,
          items: {
            create: validatedItems.map((i) => ({
              itemType: 'INVENTORY',
              inventoryItem: { connect: { id: i.inventoryItemId } },
              itemName: i.itemName,
              unit: i.unit,
              quantity: i.quantity,
              unitCost: i.unitCost,
              totalCost: i.totalCost,
              batchNumber: i.batchNumber ?? null,
              expiryDate: i.expiryDate ?? null,
              reason: i.reason ?? null,
            })),
          },
        },
        include: { items: true, location: true },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE  — deducts stock + writes InventoryLedger entries
  // ─────────────────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveWasteRecordDto, approvedById: string) {
    const record = await this.prisma.wasteRecord.findUnique({
      where: { id },
      include: { items: true, location: true },
    });

    if (!record) throw new NotFoundException('Waste record not found');
    if (record.approvedById) {
      throw new ForbiddenException('This waste record is already approved');
    }

    await this.prisma.$transaction(async (tx) => {
      // ── Mark record approved ─────────────────────────────────────────────
      await tx.wasteRecord.update({
        where: { id },
        data: {
          approvedById,
          approvedAt: new Date(),
          notes: dto.notes
            ? `${record.notes ?? ''}\n[Approval Notes] ${dto.notes}`.trim()
            : record.notes,
        },
      });

      for (const item of record.items) {
        if (!item.inventoryItemId) continue;

        // ── Fetch item to check batchTracking flag ─────────────────────
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, name: true, batchTracking: true, unitCost: true },
        });
        if (!inventoryItem) continue;

        const unitCost = toNum(inventoryItem.unitCost ?? item.unitCost);

        if (!inventoryItem.batchTracking) {
          // ── CASE 1: Non-batch item ───────────────────────────────────
          await this.handleNonBatchWaste(tx, {
            itemId: item.inventoryItemId,
            locationId: record.locationId,
            quantity: item.quantity,
            unitCost,
            recordId: record.id,
            performedById: approvedById,
            reason: item.reason ?? record.notes ?? undefined,
            // reason: item.reason ?? record.notes,
          });
        } else {
          // ── CASE 2: Batch-tracked item ───────────────────────────────
          await this.handleBatchWaste(tx, {
            itemId: item.inventoryItemId,
            locationId: record.locationId,
            quantity: item.quantity,
            unitCost,
            recordId: record.id,
            performedById: approvedById,
            reason: item.reason ?? record.notes,
            // Batch selection params
            selectedBatchNumber: (item as any).selectedBatchNumber ?? undefined, // ✅ Convert null → undefined
            distributionStrategy: (item as any).distributionStrategy ?? 'FEFO',
          });
        }
      }
    });

    return this.findOne(id);
  }

  private async handleBatchWaste(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      unitCost: number;
      recordId: string;
      performedById: string;
      reason?: string | null;
      selectedBatchNumber?: string;
      distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
    },
  ) {
    const {
      itemId,
      locationId,
      quantity,
      unitCost,
      recordId,
      performedById,
      reason,
      selectedBatchNumber,
      distributionStrategy = 'FEFO',
    } = params;

    let remaining = quantity;

    // ── Determine which batches to draw from ─────────────────────────
    let sourceBatches: {
      id: string;
      batchNumber: string | null;
      quantity: number;
      expiryDate: Date | null;
    }[];

    if (distributionStrategy === 'MANUAL' && selectedBatchNumber) {
      // Manual: use only the selected batch
      const batch = await tx.inventoryBatch.findFirst({
        where: {
          itemId,
          locationId,
          batchNumber: selectedBatchNumber,
          isActive: true,
          quantity: { gt: 0 },
        },
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          expiryDate: true,
        },
      });
      if (!batch)
        throw new BadRequestException(
          `Selected batch "${selectedBatchNumber}" not found or has no stock`,
        );
      sourceBatches = [batch];
    } else {
      // Auto: FEFO or FIFO
      sourceBatches = await tx.inventoryBatch.findMany({
        where: {
          itemId,
          locationId,
          isActive: true,
          quantity: { gt: 0 },
        },
        orderBy:
          distributionStrategy === 'FIFO'
            ? [{ receivedAt: 'asc' }]
            : [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
        select: {
          id: true,
          batchNumber: true,
          quantity: true,
          expiryDate: true,
        },
      });
    }

    if (sourceBatches.length === 0) {
      throw new BadRequestException(
        `No active batches with stock found for item at location`,
      );
    }

    // ── Process each source batch ────────────────────────────────────
    const ledgerEntries: Array<{
      batchId: string;
      locationId: string;
      qty: number;
    }> = [];

    for (const sourceBatch of sourceBatches) {
      if (remaining <= 0) break;

      const deductQty = Math.min(remaining, sourceBatch.quantity);

      // 1. Decrement source batch
      const newBatchQty = sourceBatch.quantity - deductQty;
      await tx.inventoryBatch.update({
        where: { id: sourceBatch.id },
        data: {
          quantity: { decrement: deductQty },
          isActive: newBatchQty > 0,
        },
      });

      // Track for ledger
      ledgerEntries.push({
        batchId: sourceBatch.id,
        locationId,
        qty: deductQty,
      });

      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Could not fulfill full waste quantity. Shortfall: ${remaining} units`,
      );
    }

    // ── Recalculate location stock ───────────────────────────────────
    await this.recalculateLocationStock(tx, itemId, locationId);

    // ── Write ledger entries ─────────────────────────────────────────
    for (const entry of ledgerEntries) {
      const stock = await tx.inventoryLocationStock.findUnique({
        where: { itemId_locationId: { itemId, locationId: entry.locationId } },
        select: { quantity: true },
      });
      const qtyAfter = stock?.quantity ?? 0;
      const qtyBefore = qtyAfter + entry.qty;

      await tx.inventoryLedger.create({
        data: {
          ledgerCode: this.generateLedgerCode(),
          itemId,
          locationId: entry.locationId,
          batchId: entry.batchId,
          type: StockLedgerType.WASTE,
          quantityBefore: qtyBefore,
          quantityChange: -entry.qty,
          quantityAfter: qtyAfter,
          unitCost,
          totalValue: entry.qty * unitCost,
          referenceType: 'WASTE',
          referenceId: recordId,
          wasteRecordId: recordId,
          notes: `Waste: ${entry.qty} units${reason ? ` — ${reason}` : ''}`,
          performedById,
        },
      });
    }
  }

  private async recalculateLocationStock(
    tx: Prisma.TransactionClient,
    itemId: string,
    locationId: string,
  ) {
    const batchSum = await tx.inventoryBatch.aggregate({
      where: { itemId, locationId, isActive: true },
      _sum: { quantity: true },
    });
    const calculatedQty = batchSum._sum.quantity ?? 0;

    await tx.inventoryLocationStock.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, quantity: calculatedQty, minQuantity: 0 },
      update: { quantity: calculatedQty },
    });
  }
  // async approve(id: string, dto: ApproveWasteRecordDto, approvedById: string) {
  //   const record = await this.prisma.wasteRecord.findUnique({
  //     where: { id },
  //     include: { items: true, location: true },
  //   });

  //   if (!record) throw new NotFoundException('Waste record not found');
  //   if (record.approvedById) {
  //     throw new ForbiddenException('This waste record is already approved');
  //   }

  //   await this.prisma.$transaction(async (tx) => {
  //     // ── Mark record approved ─────────────────────────────────────────────
  //     await tx.wasteRecord.update({
  //       where: { id },
  //       data: {
  //         approvedById,
  //         approvedAt: new Date(),
  //         notes: dto.notes
  //           ? `${record.notes ?? ''}\n[Approval Notes] ${dto.notes}`.trim()
  //           : record.notes,
  //       },
  //     });

  //     for (const item of record.items) {
  //       if (!item.inventoryItemId) continue;

  //       // ── Get current location stock ─────────────────────────────────
  //       const currentStock = await tx.inventoryLocationStock.findUnique({
  //         where: {
  //           itemId_locationId: {
  //             itemId: item.inventoryItemId,
  //             locationId: record.locationId,
  //           },
  //         },
  //         select: { id: true, quantity: true },
  //       });

  //       if (!currentStock || currentStock.quantity < item.quantity) {
  //         throw new BadRequestException(
  //           `Insufficient stock for "${item.itemName}" during approval. Stock may have changed.`,
  //         );
  //       }

  //       const qtyBefore = currentStock.quantity;
  //       const qtyAfter = qtyBefore - item.quantity;

  //       // ── Deduct from location stock ONLY ─────────────────────────────
  //       await tx.inventoryLocationStock.update({
  //         where: { id: currentStock.id },
  //         data: { quantity: { decrement: item.quantity } },
  //       });

  //       // ── Optional: Deduct from specific batch (FIFO) ─────────────────
  //       let batchId: string | null = null;
  //       if (item.batchNumber) {
  //         const batch = await tx.inventoryBatch.findFirst({
  //           where: {
  //             itemId: item.inventoryItemId,
  //             locationId: record.locationId,
  //             batchNumber: item.batchNumber,
  //             isActive: true,
  //             quantity: { gt: 0 },
  //           },
  //           select: { id: true, quantity: true },
  //         });
  //         if (batch) {
  //           const newBatchQty = batch.quantity - item.quantity;
  //           await tx.inventoryBatch.update({
  //             where: { id: batch.id },
  //             data: {
  //               quantity: { decrement: item.quantity },
  //               isActive: newBatchQty > 0,
  //             },
  //           });
  //           batchId = batch.id;
  //         }
  //       }

  //       // ── Get unitCost from InventoryItem ────────────────────────────
  //       const inventoryItem = await tx.inventoryItem.findUnique({
  //         where: { id: item.inventoryItemId },
  //         select: { unitCost: true },
  //       });
  //       const unitCost = inventoryItem?.unitCost ?? item.unitCost ?? 0;

  //       // ── Write InventoryLedger entry ────────────────────────────────
  //       await tx.inventoryLedger.create({
  //         data: {
  //           ledgerCode: this.generateLedgerCode(),
  //           itemId: item.inventoryItemId,
  //           locationId: record.locationId,
  //           batchId,
  //           type: StockLedgerType.WASTE,
  //           quantityBefore: qtyBefore,
  //           quantityChange: -item.quantity,
  //           quantityAfter: qtyAfter,
  //           unitCost,
  //           totalValue: item.quantity * unitCost,
  //           referenceType: 'WASTE',
  //           referenceId: record.id,
  //           wasteRecordId: record.id,
  //           notes: [
  //             `${record.category} waste`,
  //             item.reason ?? record.notes,
  //           ]
  //             .filter(Boolean)
  //             .join(' — '),
  //           performedById: approvedById,
  //         },
  //       });
  //     }
  //   });

  //   return this.findOne(id);
  // }

  // ─────────────────────────────────────────────────────────────────────────
  // REJECT
  // ─────────────────────────────────────────────────────────────────────────

  async reject(id: string, reason: string, rejectedById: string) {
    const record = await this.prisma.wasteRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Waste record not found');
    if (record.approvedById) {
      throw new ForbiddenException('Cannot reject an already approved record');
    }

    return this.prisma.wasteRecord.update({
      where: { id },
      data: {
        notes:
          `[REJECTED by ${rejectedById}] ${reason}\n${record.notes ?? ''}`.trim(),
        approvedAt: null,
      },
    });
  }

  private async handleNonBatchWaste(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      locationId: string;
      quantity: number;
      unitCost: number;
      recordId: string;
      performedById: string;
      reason?: string | null;
    },
  ) {
    const {
      itemId,
      locationId,
      quantity,
      unitCost,
      recordId,
      performedById,
      reason,
    } = params;

    // ── 1. Find or create DEFAULT batch ────────────────────────────────
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
        `Insufficient DEFAULT batch stock for item ${itemId} at location ${locationId}`,
      );
    }

    // ── 2. Decrement batch quantity ───────────────────────────────────
    const newBatchQty = defaultBatch.quantity - quantity;
    await tx.inventoryBatch.update({
      where: { id: defaultBatch.id },
      data: {
        quantity: { decrement: quantity },
        isActive: newBatchQty > 0,
      },
    });

    // ── 3. Recalculate & update location stock ────────────────────────
    await this.recalculateLocationStock(tx, itemId, locationId);

    // ── 4. Write ledger entry ─────────────────────────────────────────
    const locationStock = await tx.inventoryLocationStock.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
      select: { quantity: true },
    });
    const qtyAfter = locationStock?.quantity ?? 0;
    const qtyBefore = qtyAfter + quantity;

    await tx.inventoryLedger.create({
      data: {
        ledgerCode: this.generateLedgerCode(),
        itemId,
        locationId,
        batchId: defaultBatch.id,
        type: StockLedgerType.WASTE,
        quantityBefore: qtyBefore,
        quantityChange: -quantity,
        quantityAfter: qtyAfter,
        unitCost,
        totalValue: quantity * unitCost,
        referenceType: 'WASTE',
        referenceId: recordId,
        wasteRecordId: recordId,
        notes: `Waste: ${quantity} units${reason ? ` — ${reason}` : ''}`,
        performedById,
      },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────
  // LIST
  // ─────────────────────────────────────────────────────────────────────────

  async findAll(query: QueryWasteRecordsDto) {
    const {
      locationId,
      category,
      status,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '20',
    } = query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Prisma.WasteRecordWhereInput = {
      ...(locationId && { locationId }),
      ...(category && { category }),
      ...(status === 'PENDING' && { approvedById: null }),
      ...(status === 'APPROVED' && { approvedById: { not: null } }),
      ...((startDate || endDate) && {
        createdAt: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        },
      }),
      ...(search && {
        OR: [
          { wasteCode: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { witnessName: { contains: search, mode: 'insensitive' } },
          {
            items: {
              some: { itemName: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.wasteRecord.findMany({
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
                  locationStocks: {
                    select: { quantity: true, locationId: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.wasteRecord.count({ where }),
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
    const record = await this.prisma.wasteRecord.findUnique({
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

    if (!record) throw new NotFoundException('Waste record not found');
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────────────────────

  async getStats(locationId?: string) {
    const baseWhere: Prisma.WasteRecordWhereInput = locationId
      ? { locationId }
      : {};
    const thisMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const [
      totalRecords,
      pendingApproval,
      totalValueResult,
      monthlyValueResult,
      byCategory,
    ] = await Promise.all([
      this.prisma.wasteRecord.count({ where: baseWhere }),
      this.prisma.wasteRecord.count({
        where: { ...baseWhere, approvedById: null },
      }),
      this.prisma.wasteRecord.aggregate({
        where: { ...baseWhere, approvedById: { not: null } },
        _sum: { totalValue: true },
      }),
      this.prisma.wasteRecord.aggregate({
        where: {
          ...baseWhere,
          approvedById: { not: null },
          createdAt: { gte: thisMonth },
        },
        _sum: { totalValue: true },
      }),
      this.prisma.wasteRecord.groupBy({
        by: ['category'],
        where: baseWhere,
        _count: true,
        _sum: { totalValue: true },
      }),
    ]);

    return {
      totalRecords,
      pendingApproval,
      totalLossValue: totalValueResult._sum.totalValue ?? 0,
      monthlyLossValue: monthlyValueResult._sum.totalValue ?? 0,
      byCategory,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOCATION STOCK  (for the waste form)
  // ─────────────────────────────────────────────────────────────────────────

  async getLocationStock(locationId: string) {
    // ✅ Only fetch location stocks with quantity > 0
    const inventoryStocks = await this.prisma.inventoryLocationStock.findMany({
      where: {
        locationId,
        quantity: { gt: 0 }, // ✅ Critical: only items with stock
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            unit: true,
            unitCost: true,
            batchTracking: true, // ✅ Include for batch UI
          },
        },
      },
      orderBy: { item: { name: 'asc' } },
    });

    return {
      inventoryItems: inventoryStocks.map((s) => ({
        id: s.item.id,
        name: s.item.name,
        itemCode: s.item.itemCode,
        unit: s.item.unit,
        unitCost: s.item.unitCost,
        availableQty: s.quantity, // ✅ This is what the frontend uses
        stockId: s.id,
        type: 'INVENTORY' as const,
        // ✅ Pass batchTracking for conditional UI
        batchTracking: s.item.batchTracking ?? false,
      })),
      // If you have drugs table, apply same filter there
      drugs: [], // or fetch from DrugLocationStock with quantity: { gt: 0 }
    };
  }
  // async getLocationStock(locationId: string) {
  //   const inventoryStocks = await this.prisma.inventoryLocationStock.findMany({
  //     where: { locationId, quantity: { gt: 0 } },
  //     include: {
  //       item: {
  //         select: {
  //           id: true,
  //           name: true,
  //           itemCode: true,
  //           unit: true,
  //           unitCost: true,
  //         },
  //       },
  //     },
  //     orderBy: { item: { name: 'asc' } },
  //   });

  //   return {
  //     inventoryItems: inventoryStocks.map((s) => ({
  //       id: s.item.id,
  //       name: s.item.name,
  //       itemCode: s.item.itemCode,
  //       unit: s.item.unit,
  //       unitCost: s.item.unitCost,
  //       availableQty: s.quantity,
  //       stockId: s.id,
  //       type: 'INVENTORY' as const,
  //     })),
  //   };
  // }

  async getAvailableBatches(itemId: string, locationId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, batchTracking: true },
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
      where: {
        itemId,
        locationId,
        isActive: true,
        quantity: { gt: 0 },
      },
      select: {
        id: true,
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        receivedAt: true,
      },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

    return { batchTracking: true, batches };
  }
}
