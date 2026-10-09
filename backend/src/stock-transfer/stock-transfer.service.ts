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
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';

@Injectable()
export class StockTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
    private readonly movements: StockMovementService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // CREATE Transfer (DRAFT state - no stock movement yet)
  // ─────────────────────────────────────────────────────────────────────
  async create(dto: CreateStockTransferDto, performedById: string) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A stock transfer needs at least one line item.',
      );
    }
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Cannot transfer to the same location');
    }

    // Everything — location lookups, stock checks, batch checks and the write —
    // runs inside one Serializable transaction. These reads used to go through
    // `this.prisma`, outside any transaction, so the quantity they validated
    // against could change before the transfer row was written.
    return this.prisma.$transaction(
      async (tx) => {
        const [fromLoc, toLoc] = await Promise.all([
          tx.location.findUnique({ where: { id: dto.fromLocationId } }),
          tx.location.findUnique({ where: { id: dto.toLocationId } }),
        ]);

        if (!fromLoc) throw new NotFoundException('Source location not found');
        if (!toLoc)
          throw new NotFoundException('Destination location not found');

        const enrichedItems: any[] = [];

        for (const item of dto.items) {
          const invItem = await tx.inventoryItem.findUnique({
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
            throw new NotFoundException(
              `Item ${item.inventoryItemId} not found`,
            );

          const sourceStock = await tx.inventoryLocationStock.findUnique({
            where: {
              itemId_locationId: {
                itemId: item.inventoryItemId,
                locationId: dto.fromLocationId,
              },
            },
            select: { quantity: true },
          });
          const availableQty = sourceStock?.quantity ?? 0;

          if (item.quantityRequested > availableQty) {
            throw new BadRequestException(
              `Insufficient stock for "${invItem.name}" at ${fromLoc.name}. Available: ${availableQty}, Requested: ${item.quantityRequested}`,
            );
          }

          if (invItem.batchTracking) {
            if (item.distributionStrategy === 'MANUAL' && !item.batchNumber) {
              throw new BadRequestException(
                `Item "${invItem.name}" has batch tracking enabled. Please select a batch or use auto-distribution.`,
              );
            }
            if (item.batchNumber) {
              const batch = await tx.inventoryBatch.findFirst({
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

          enrichedItems.push({
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
          });
        }

        return tx.stockTransfer.create({
          data: {
            transferCode: await this.docNum.next('TRF', tx),
            fromLocationId: dto.fromLocationId,
            toLocationId: dto.toLocationId,
            // Always DRAFT — completion is what moves the stock.
            status: StockTransferStatus.DRAFT,
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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // COMPLETE Transfer (executes stock movement: TRANSFER_OUT + TRANSFER_IN)
  // ─────────────────────────────────────────────────────────────────────
  async complete(id: string, dto: CompleteTransferDto, performedById: string) {
    await this.prisma.$transaction(
      async (tx) => {
        // Claim the transition FIRST, with the expected status in the WHERE
        // clause. Reading the status and then writing it left a window in which
        // two concurrent completes both saw DRAFT and both moved the stock.
        const claimed = await tx.stockTransfer.updateMany({
          where: { id, status: StockTransferStatus.DRAFT },
          data: {
            status: StockTransferStatus.COMPLETED,
            completedAt: new Date(),
            ...(dto.notes ? { notes: dto.notes } : {}),
          },
        });

        if (claimed.count !== 1) {
          const existing = await tx.stockTransfer.findUnique({
            where: { id },
            select: { status: true },
          });
          if (!existing) throw new NotFoundException('Transfer not found');
          throw new ConflictException(
            `Transfer is ${existing.status}. Only DRAFT transfers can be completed.`,
          );
        }

        const transfer = await tx.stockTransfer.findUniqueOrThrow({
          where: { id },
          include: { items: true, fromLocation: true, toLocation: true },
        });

        for (const item of transfer.items) {
          const qty = item.quantityTransferred;
          if (qty <= 0) continue;

          const invItem = await tx.inventoryItem.findUnique({
            where: { id: item.inventoryItemId },
            select: {
              id: true,
              name: true,
              batchTracking: true,
              unitCost: true,
            },
          });
          // Previously `if (!invItem) continue`, which marked the transfer
          // COMPLETED while that line moved nothing.
          if (!invItem) {
            throw new NotFoundException(
              `Transfer line "${item.itemName}" refers to inventory item ${item.inventoryItemId}, which no longer exists.`,
            );
          }

          // A transfer is an issue at the source and a receipt at the
          // destination, and it must be cost-neutral: the destination is
          // credited at the cost the stock actually left the source at, not
          // at the item master's figure. Both halves were hand-rolled copies
          // before, each with its own ledger arithmetic.
          const { draws } = await this.movements.issue(tx, {
            itemId: item.inventoryItemId,
            locationId: transfer.fromLocationId,
            quantity: qty,
            strategy: invItem.batchTracking
              ? ((item.distributionStrategy as 'FEFO' | 'FIFO' | 'MANUAL') ??
                'FEFO')
              : 'FEFO',
            selectedBatchNumber: item.batchNumber ?? null,
            type: StockLedgerType.TRANSFER_OUT,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes:
              item.notes ??
              `Transfer to ${transfer.toLocation?.name ?? transfer.toLocationId}`,
            performedById,
            links: { stockTransferId: transfer.id },
            itemName: invItem.name,
          });

          // One receipt per source batch, so batch identity and its cost
          // survive the move instead of being flattened into one lot.
          for (const draw of draws) {
            const batch = await tx.inventoryBatch.findUnique({
              where: { id: draw.batchId },
              select: { batchNumber: true, expiryDate: true },
            });

            await this.movements.receive(tx, {
              itemId: item.inventoryItemId,
              locationId: transfer.toLocationId,
              quantity: draw.quantity,
              unitCost: draw.unitCost,
              batchNumber: invItem.batchTracking
                ? (batch?.batchNumber ?? draw.batchNumber)
                : null,
              expiryDate: batch?.expiryDate ?? draw.expiryDate,
              type: StockLedgerType.TRANSFER_IN,
              referenceType: 'TRANSFER',
              referenceId: transfer.id,
              notes:
                item.notes ??
                `Transfer from ${transfer.fromLocation?.name ?? transfer.fromLocationId}`,
              performedById,
              links: { stockTransferId: transfer.id },
              // The source batch already carries whatever batch details exist;
              // a transfer must not refuse to move stock that was booked in
              // before batch tracking was switched on for the item.
              requireBatchDetails: false,
              preserveBatchNumber: invItem.batchTracking,
              itemName: invItem.name,
            });
          }
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );

    return this.findOne(id);
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
    const { items, ...updateData } = dto;

    return this.prisma.$transaction(
      async (tx) => {
        const transfer = await tx.stockTransfer.findUnique({
          where: { id },
          select: { id: true, status: true, fromLocationId: true },
        });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.DRAFT) {
          throw new BadRequestException('Only DRAFT transfers can be edited');
        }

        // Line edits used to be destructured off the payload and then
        // dropped on the floor — the call returned 200 and changed nothing.
        // They are applied here, re-validated against current stock the same
        // way create() does.
        if (items) {
          if (items.length === 0) {
            throw new BadRequestException(
              'A stock transfer needs at least one line item.',
            );
          }

          const enrichedItems: any[] = [];
          for (const item of items) {
            const invItem = await tx.inventoryItem.findUnique({
              where: { id: item.inventoryItemId },
              select: {
                id: true,
                name: true,
                unit: true,
                uom: true,
                unitCost: true,
              },
            });
            if (!invItem)
              throw new NotFoundException(
                `Item ${item.inventoryItemId} not found`,
              );

            const sourceStock = await tx.inventoryLocationStock.findUnique({
              where: {
                itemId_locationId: {
                  itemId: item.inventoryItemId,
                  locationId: transfer.fromLocationId,
                },
              },
              select: { quantity: true },
            });
            const availableQty = sourceStock?.quantity ?? 0;
            if (item.quantityRequested > availableQty) {
              throw new BadRequestException(
                `Insufficient stock for "${invItem.name}". Available: ${availableQty}, Requested: ${item.quantityRequested}`,
              );
            }

            enrichedItems.push({
              transferId: id,
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
            });
          }

          await tx.stockTransferItem.deleteMany({
            where: { transferId: id },
          });
          await tx.stockTransferItem.createMany({ data: enrichedItems });
        }

        const applied = await tx.stockTransfer.updateMany({
          where: { id, status: StockTransferStatus.DRAFT },
          data: {
            ...updateData,
            ...(dto.transferDate && {
              transferDate: new Date(dto.transferDate),
            }),
            updatedAt: new Date(),
          },
        });
        if (applied.count !== 1) {
          throw new ConflictException(
            'Transfer is no longer a DRAFT. Reload and retry.',
          );
        }

        return tx.stockTransfer.findUnique({
          where: { id },
          include: { fromLocation: true, toLocation: true, items: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(id: string, notes?: string) {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!transfer) throw new NotFoundException('Transfer not found');
      if (transfer.status === StockTransferStatus.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed transfer');
      }

      // A completed transfer has already moved stock, so the cancel must lose
      // the race against a concurrent complete rather than overwrite it.
      const applied = await tx.stockTransfer.updateMany({
        where: { id, status: { not: StockTransferStatus.COMPLETED } },
        data: {
          status: StockTransferStatus.CANCELLED,
          ...(notes ? { notes } : {}),
          updatedAt: new Date(),
        },
      });
      if (applied.count !== 1) {
        throw new ConflictException(
          'Transfer was completed before it could be cancelled.',
        );
      }

      return tx.stockTransfer.findUniqueOrThrow({ where: { id } });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helper: Get available batches for an item at a location (for UI)
  // ─────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // REVERSE — undoes a COMPLETED transfer by moving the stock back
  // ───────────────────────────────────────────────────────────────────────────

  async reverse(id: string, reason: string, performedById?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reversal reason is required.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const transfer = await tx.stockTransfer.findUnique({
          where: { id },
          select: { id: true, transferCode: true, status: true },
        });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.COMPLETED) {
          throw new BadRequestException(
            `Only a COMPLETED transfer has moved stock. This one is ${transfer.status} — cancel it instead.`,
          );
        }

        const claimed = await tx.stockTransfer.updateMany({
          where: { id, status: StockTransferStatus.COMPLETED },
          data: {
            status: StockTransferStatus.REVERSED,
            voidedAt: new Date(),
            voidedById: performedById ?? null,
            voidReason: reason.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Transfer was reversed by someone else first.',
          );
        }

        // Reversing puts the stock back at the source and takes it off the
        // destination. If the destination has already issued it, the
        // reversal refuses rather than going negative.
        await this.movements.reverseDocument(tx, {
          referenceType: 'TRANSFER',
          referenceId: id,
          reversalReferenceType: 'TRANSFER_VOID',
          reason: reason.trim(),
          performedById,
          links: { stockTransferId: id },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );

    return this.findOne(id);
  }

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
