import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StockLedgerType, StockTransferStatus } from '@prisma/client';
import {
  CreateStockTransferDto,
  UpdateStockTransferDto,
  CompleteTransferDto,
  StockTransferQueryDto,
} from './dto/stock-transfer.dto';
import Decimal from 'decimal.js';

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
export class StockTransferService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────
  // CREATE Transfer (DRAFT state - no stock movement yet)
  // ─────────────────────────────────────────────────────────────────────
  async create(dto: CreateStockTransferDto, performedById: string) {
    // Validate locations exist and are different
    const [fromLoc, toLoc] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: dto.fromLocationId } }),
      this.prisma.location.findUnique({ where: { id: dto.toLocationId } }),
    ]);

    if (!fromLoc) throw new NotFoundException('Source location not found');
    if (!toLoc) throw new NotFoundException('Destination location not found');
    if (fromLoc.id === toLoc.id) {
      throw new BadRequestException('Cannot transfer to the same location');
    }

    // Validate items and fetch inventory data
    const enrichedItems = await Promise.all(
      dto.items.map(async (item) => {
        const invItem = await this.prisma.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: {
            id: true,
            name: true,
            unit: true,
            uom: true,
            unitCost: true,
            batchTracking: true,
          },
        });
        if (!invItem)
          throw new NotFoundException(`Item ${item.inventoryItemId} not found`);

        // Check available stock at source location
        const sourceStock = await this.prisma.inventoryLocationStock.findUnique(
          {
            where: {
              itemId_locationId: {
                itemId: item.inventoryItemId,
                locationId: dto.fromLocationId,
              },
            },
            select: { quantity: true },
          },
        );
        const availableQty = sourceStock?.quantity ?? 0;

        if (item.quantityRequested > availableQty) {
          throw new BadRequestException(
            `Insufficient stock for "${invItem.name}" at ${fromLoc.name}. Available: ${availableQty}, Requested: ${item.quantityRequested}`,
          );
        }

        // For batch-tracked items: validate batch selection
        if (invItem.batchTracking) {
          if (item.distributionStrategy === 'MANUAL' && !item.batchNumber) {
            throw new BadRequestException(
              `Item "${invItem.name}" has batch tracking enabled. Please select a batch or use auto-distribution.`,
            );
          }
          // Fetch batch details for reference
          if (item.batchNumber) {
            const batch = await this.prisma.inventoryBatch.findFirst({
              where: {
                itemId: item.inventoryItemId,
                locationId: dto.fromLocationId,
                batchNumber: item.batchNumber,
                isActive: true,
                quantity: { gt: 0 },
              },
              select: { expiryDate: true, quantity: true },
            });
            if (!batch) {
              throw new BadRequestException(
                `Batch "${item.batchNumber}" not found or has no stock for "${invItem.name}" at ${fromLoc.name}`,
              );
            }
            if (item.quantityRequested > batch.quantity) {
              throw new BadRequestException(
                `Batch "${item.batchNumber}" has only ${batch.quantity} units of "${invItem.name}", but ${item.quantityRequested} requested`,
              );
            }
          }
        }

        return {
          inventoryItemId: item.inventoryItemId,
          itemName: invItem.name,
          unit: invItem.unit,
          uom: item.uom ?? invItem.uom,
          quantityRequested: item.quantityRequested,
          quantityTransferred:
            item.quantityTransferred ?? item.quantityRequested,
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          distributionStrategy: item.distributionStrategy ?? null,
          unitCost: item.unitCost ?? invItem.unitCost,
          notes: item.notes ?? null,
        };
      }),
    );

    const transferCode = genCode('TRF');

    return this.prisma.stockTransfer.create({
      data: {
        transferCode,
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        status: dto.status ?? StockTransferStatus.DRAFT,
        transferDate: dto.transferDate
          ? new Date(dto.transferDate)
          : new Date(),
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        performedById,
        items: { create: enrichedItems },
      },
      include: {
        fromLocation: { select: { id: true, name: true, type: true } },
        toLocation: { select: { id: true, name: true, type: true } },
        items: true,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // COMPLETE Transfer (executes stock movement: TRANSFER_OUT + TRANSFER_IN)
  // ─────────────────────────────────────────────────────────────────────
  async complete(id: string, dto: CompleteTransferDto, performedById: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true, fromLocation: true, toLocation: true },
    });

    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== StockTransferStatus.DRAFT) {
      throw new BadRequestException(
        `Transfer is already ${transfer.status}. Only DRAFT transfers can be completed.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const qty = item.quantityTransferred;
        if (qty <= 0) continue;

        const invItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, name: true, batchTracking: true, unitCost: true },
        });
        if (!invItem) continue;

        const unitCost = toNum(item.unitCost || invItem.unitCost);

        if (!invItem.batchTracking) {
          // ── NON-BATCH: Simple transfer via DEFAULT batch ─────────────
          await this.handleNonBatchTransfer(tx, {
            itemId: item.inventoryItemId,
            fromLocationId: transfer.fromLocationId,
            toLocationId: transfer.toLocationId,
            quantity: qty,
            unitCost,
            transferId: transfer.id,
            performedById,
            notes: item.notes ?? undefined,
          });
        } else {
          // ── BATCH-TRACKED: Preserve batch identity ───────────────────
          await this.handleBatchTransfer(tx, {
            itemId: item.inventoryItemId,
            fromLocationId: transfer.fromLocationId,
            toLocationId: transfer.toLocationId,
            quantity: qty,
            unitCost,
            transferId: transfer.id,
            performedById,
            notes: item.notes ?? undefined,
            // Batch selection params
            selectedBatchNumber: item.batchNumber ?? undefined,
            distributionStrategy:
              (item.distributionStrategy as 'FEFO' | 'FIFO' | 'MANUAL') ??
              'FEFO',
          });
        }
      }

      // Mark transfer as COMPLETED
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.COMPLETED,
          completedAt: new Date(),
          notes: dto.notes ?? transfer.notes,
        },
      });
    });

    return this.findOne(id);
  }

  // ─────────────────────────────────────────────────────────────────────
  // HELPER: Non-batch transfer (DEFAULT batch)
  // ─────────────────────────────────────────────────────────────────────
  private async handleNonBatchTransfer(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      unitCost: number;
      transferId: string;
      performedById: string;
      notes?: string;
    },
  ) {
    const {
      itemId,
      fromLocationId,
      toLocationId,
      quantity,
      unitCost,
      transferId,
      performedById,
      notes,
    } = params;

    // ── 1. TRANSFER OUT: Decrement DEFAULT batch at source ─────────────
    const sourceBatch = await tx.inventoryBatch.findUnique({
      where: {
        itemId_locationId_batchNumber: {
          itemId,
          locationId: fromLocationId,
          batchNumber: 'DEFAULT',
        },
      },
      select: { id: true, quantity: true },
    });

    if (!sourceBatch || sourceBatch.quantity < quantity) {
      throw new BadRequestException(
        `Insufficient DEFAULT batch stock at source location`,
      );
    }

    await tx.inventoryBatch.update({
      where: { id: sourceBatch.id },
      data: { quantity: { decrement: quantity } },
    });

    // ── 2. TRANSFER IN: Increment DEFAULT batch at destination ─────────
    const destBatch = await tx.inventoryBatch.upsert({
      where: {
        itemId_locationId_batchNumber: {
          itemId,
          locationId: toLocationId,
          batchNumber: 'DEFAULT',
        },
      },
      create: {
        itemId,
        locationId: toLocationId,
        batchNumber: 'DEFAULT',
        quantity: quantity,
        unitCost,
        isActive: true,
        expiryDate: null,
      },
      update: {
        quantity: { increment: quantity },
        unitCost, // Update to latest cost
      },
      select: { id: true },
    });

    // ── 3. Update location stocks (recalculated from batches) ──────────
    await this.recalculateLocationStock(tx, itemId, fromLocationId);
    await this.recalculateLocationStock(tx, itemId, toLocationId);

    // ── 4. Write TRANSFER_OUT ledger entry ─────────────────────────────
    const sourceStock = await tx.inventoryLocationStock.findUnique({
      where: { itemId_locationId: { itemId, locationId: fromLocationId } },
      select: { quantity: true },
    });
    await tx.inventoryLedger.create({
      data: {
        ledgerCode: genCode('ILG'),
        itemId,
        locationId: fromLocationId,
        batchId: sourceBatch.id,
        type: StockLedgerType.TRANSFER_OUT,
        quantityBefore: (sourceStock?.quantity ?? 0) + quantity,
        quantityChange: -quantity,
        quantityAfter: sourceStock?.quantity ?? 0,
        unitCost,
        totalValue: quantity * unitCost,
        referenceType: 'STOCK_TRANSFER',
        referenceId: transferId,
        notes: `Transfer out: ${quantity} units to ${params.toLocationId}${notes ? ` — ${notes}` : ''}`,
        performedById,
      },
    });

    // ── 5. Write TRANSFER_IN ledger entry ──────────────────────────────
    const destStock = await tx.inventoryLocationStock.findUnique({
      where: { itemId_locationId: { itemId, locationId: toLocationId } },
      select: { quantity: true },
    });
    await tx.inventoryLedger.create({
      data: {
        ledgerCode: genCode('ILG'),
        itemId,
        locationId: toLocationId,
        batchId: destBatch.id,
        type: StockLedgerType.TRANSFER_IN,
        quantityBefore: destStock?.quantity ?? 0,
        quantityChange: quantity,
        quantityAfter: (destStock?.quantity ?? 0) + quantity,
        unitCost,
        totalValue: quantity * unitCost,
        referenceType: 'STOCK_TRANSFER',
        referenceId: transferId,
        notes: `Transfer in: ${quantity} units from ${params.fromLocationId}${notes ? ` — ${notes}` : ''}`,
        performedById,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // HELPER: Batch-tracked transfer (preserve batch identity)
  // ─────────────────────────────────────────────────────────────────────
  private async handleBatchTransfer(
    tx: Prisma.TransactionClient,
    params: {
      itemId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      unitCost: number;
      transferId: string;
      performedById: string;
      notes?: string;
      selectedBatchNumber?: string;
      distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
    },
  ) {
    const {
      itemId,
      fromLocationId,
      toLocationId,
      quantity,
      unitCost,
      transferId,
      performedById,
      notes,
      selectedBatchNumber,
      distributionStrategy = 'FEFO',
    } = params;

    let remaining = quantity;

    // ── Determine which batches to draw from ───────────────────────────
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
          locationId: fromLocationId,
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
          locationId: fromLocationId,
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
        },
      });
    }

    if (sourceBatches.length === 0) {
      throw new BadRequestException(
        `No active batches with stock found for item at source location`,
      );
    }

    // ── Process each source batch ──────────────────────────────────────
    const ledgerEntries: Array<{
      batchId: string;
      locationId: string;
      qty: number;
      type: StockLedgerType;
    }> = [];

    for (const sourceBatch of sourceBatches) {
      if (remaining <= 0) break;

      const deductQty = Math.min(remaining, sourceBatch.quantity);

      //   // 1. Decrement source batch
      //   await tx.inventoryBatch.update({
      //     where: { id: sourceBatch.id },
      //     data: {
      //       quantity: { decrement: deductQty },
      //     },
      //   });

      const updatedSourceBatch = await tx.inventoryBatch.update({
        where: { id: sourceBatch.id },
        data: {
          quantity: { decrement: deductQty },
        },
        select: { quantity: true },
      });
      // Deactivate if fully consumed
      if (updatedSourceBatch.quantity <= 0) {
        await tx.inventoryBatch.update({
          where: { id: sourceBatch.id },
          data: { isActive: false },
        });
      }

      // 2. Upsert destination batch (SAME batchNumber, expiry, cost)
      const destBatch = await tx.inventoryBatch.upsert({
        where: {
          itemId_locationId_batchNumber: {
            itemId,
            locationId: toLocationId,
            batchNumber: sourceBatch.batchNumber!,
            // batchNumber: sourceBatch.batchNumber, // ← Preserve identity!
          },
        },
        create: {
          itemId,
          locationId: toLocationId,
          batchNumber: sourceBatch.batchNumber,
          expiryDate: sourceBatch.expiryDate, // ← Preserve expiry!
          quantity: deductQty,
          unitCost, // ← Preserve cost!
          isActive: true,
        },
        update: {
          quantity: { increment: deductQty },
          unitCost, // Update to latest if needed
        },
        select: { id: true },
      });

      // Track for ledger entries
      ledgerEntries.push(
        {
          batchId: sourceBatch.id,
          locationId: fromLocationId,
          qty: deductQty,
          type: StockLedgerType.TRANSFER_OUT,
        },
        {
          batchId: destBatch.id,
          locationId: toLocationId,
          qty: deductQty,
          type: StockLedgerType.TRANSFER_IN,
        },
      );

      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Could not fulfill full transfer quantity. Shortfall: ${remaining} units`,
      );
    }

    // ── Recalculate location stocks ────────────────────────────────────
    await this.recalculateLocationStock(tx, itemId, fromLocationId);
    await this.recalculateLocationStock(tx, itemId, toLocationId);

    // ── Write ledger entries ───────────────────────────────────────────
    for (const entry of ledgerEntries) {
      const stock = await tx.inventoryLocationStock.findUnique({
        where: { itemId_locationId: { itemId, locationId: entry.locationId } },
        select: { quantity: true },
      });
      const qtyAfter = stock?.quantity ?? 0;
      const qtyBefore =
        entry.type === StockLedgerType.TRANSFER_OUT
          ? qtyAfter + entry.qty
          : qtyAfter - entry.qty;

      await tx.inventoryLedger.create({
        data: {
          ledgerCode: genCode('ILG'),
          itemId,
          locationId: entry.locationId,
          batchId: entry.batchId,
          type: entry.type,
          quantityBefore: qtyBefore,
          quantityChange:
            entry.type === StockLedgerType.TRANSFER_OUT
              ? -entry.qty
              : entry.qty,
          quantityAfter: qtyAfter,
          unitCost,
          totalValue: entry.qty * unitCost,
          referenceType: 'STOCK_TRANSFER',
          referenceId: transferId,
          notes: `${entry.type === StockLedgerType.TRANSFER_OUT ? 'Transfer out' : 'Transfer in'}: ${entry.qty} units${notes ? ` — ${notes}` : ''}`,
          performedById,
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // HELPER: Recalculate location stock from batch sums
  // ─────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────
  // CRUD: List, Get One, Update, Cancel
  // ─────────────────────────────────────────────────────────────────────

  async findAll(query: StockTransferQueryDto) {
    const {
      fromLocationId,
      toLocationId,
      status,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransferWhereInput = {
      ...(fromLocationId && { fromLocationId }),
      ...(toLocationId && { toLocationId }),
      ...(status && { status }),
      ...(dateFrom || dateTo
        ? {
            transferDate: {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { transferCode: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transferDate: 'desc' },
        include: {
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              itemName: true,
              unit: true,
              quantityRequested: true,
              quantityTransferred: true,
              batchNumber: true,
              unitCost: true,
            },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

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

  async findOne(id: string) {
    // Step 1: Get location IDs first (can't reference transfer inside its own query)
    const basic = await this.prisma.stockTransfer.findUnique({
      where: { id },
      select: { fromLocationId: true, toLocationId: true },
    });
    if (!basic) throw new NotFoundException('Transfer not found');

    // Step 2: Full query with nested location stock filter
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromLocation: true,
        toLocation: true,
        performedBy: { select: { id: true, email: true } },
        items: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                batchTracking: true,
                locationStocks: {
                  where: {
                    locationId: {
                      in: [basic.fromLocationId, basic.toLocationId],
                    },
                  },
                  select: { locationId: true, quantity: true },
                },
              },
            },
          },
        },
        ledgerEntries: {
          include: {
            batch: {
              select: { id: true, batchNumber: true, expiryDate: true },
            },
            location: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return transfer;
  }

  async update(id: string, dto: UpdateStockTransferDto) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== StockTransferStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT transfers can be edited');
    }

    const { items, ...updateData } = dto;

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        ...updateData,
        ...(dto.transferDate && { transferDate: new Date(dto.transferDate) }),
        updatedAt: new Date(),
      },
      include: { fromLocation: true, toLocation: true, items: true },
    });
  }

  async cancel(id: string, notes?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status === StockTransferStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed transfer');
    }

    return this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status: StockTransferStatus.CANCELLED,
        notes: notes ?? transfer.notes,
        updatedAt: new Date(),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helper: Get available batches for an item at a location (for UI)
  // ─────────────────────────────────────────────────────────────────────
  async getAvailableBatches(itemId: string, locationId: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, batchTracking: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    if (!item.batchTracking) {
      // Non-batch: return pseudo-DEFAULT batch
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
