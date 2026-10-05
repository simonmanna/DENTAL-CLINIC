import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
    private readonly movements: StockMovementService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

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
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A stock adjustment needs at least one line item.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.findUnique({
        where: { id: dto.locationId },
        select: { id: true },
      });
      if (!location) throw new NotFoundException('Location not found');

      const enrichedItems: any[] = [];
      for (const item of dto.items) {
        if (!item.inventoryItemId) {
          throw new BadRequestException(
            `Line "${item.itemName}" has no inventory item attached.`,
          );
        }

        const stock = await tx.inventoryLocationStock.findUnique({
          where: {
            itemId_locationId: {
              itemId: item.inventoryItemId,
              locationId: dto.locationId,
            },
          },
          select: { quantity: true },
        });
        const systemQty = stock?.quantity ?? 0;

        enrichedItems.push({
          itemType: 'INVENTORY',
          inventoryItem: { connect: { id: item.inventoryItemId } },
          itemName: item.itemName,
          unit: item.unit,
          // Both figures are a snapshot for the reviewer to look at. The
          // difference that actually gets applied is recomputed at approve
          // time against the then-current system quantity — see approve().
          quantitySystem: systemQty,
          quantityActual: item.quantityActual,
          quantityDifference: item.quantityActual - systemQty,
          unitCost: item.unitCost,
          batchNumber: item.batchNumber ?? null,
          notes: item.notes ?? null,
        });
      }

      return tx.stockAdjustment.create({
        data: {
          adjustmentCode: await this.docNum.next('ADJ', tx),
          locationId: dto.locationId,
          reason: dto.reason,
          notes: dto.notes,
          status: 'PENDING',
          performedById,
          items: { create: enrichedItems },
        },
        include: { location: true, items: true },
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE — mutates stock + writes InventoryLedger entries
  // ─────────────────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveAdjustmentDto, approvedById: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const adjustment = await tx.stockAdjustment.findUnique({
          where: { id },
          include: { items: true, location: true },
        });

        if (!adjustment) throw new NotFoundException('Adjustment not found');
        if (adjustment.status !== 'PENDING') {
          throw new BadRequestException(
            `Adjustment is already ${adjustment.status}. Only PENDING adjustments can be approved.`,
          );
        }

        // Segregation of duties — whoever raised the count cannot be the one
        // who signs it off. A stock adjustment is the one write in the system
        // that can create or destroy inventory with no corresponding document,
        // so it gets the same treatment as a purchase order approval.
        if (
          adjustment.performedById &&
          adjustment.performedById === approvedById
        ) {
          throw new BadRequestException(
            'Approver cannot be the same user who raised the adjustment (segregation of duties).',
          );
        }

        // Claim the transition with the expected status in the WHERE clause,
        // before any stock is touched. Checking the status in a prior read and
        // then writing it left a window in which two concurrent approvals both
        // saw PENDING and both applied the movement.
        const claimed = await tx.stockAdjustment.updateMany({
          where: { id, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            approvedById,
            approvedAt: new Date(),
            // The reviewer's note goes in its own column. It used to be
            // written to `notes`, overwriting the explanation the submitter
            // had entered there.
            approvalNotes: dto.notes ?? null,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Adjustment is no longer PENDING — it may already have been approved.',
          );
        }

        for (const item of adjustment.items) {
          if (!item.inventoryItemId) continue;

          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { id: item.inventoryItemId },
            select: {
              id: true,
              name: true,
              batchTracking: true,
              unitCost: true,
            },
          });
          if (!inventoryItem) continue;

          // Recompute the delta against the CURRENT system quantity.
          //
          // The stored quantityDifference was calculated when the count was
          // raised. Applying it as a delta later lands the item wherever
          // "current + stale delta" happens to fall, which for a cycle count
          // is the one thing it must not do: the point of the count is that
          // on-hand ends up at the figure that was physically counted. If a
          // sale or receipt moved the item between raise and approve, the old
          // code silently produced a third number that matched neither.
          const stock = await tx.inventoryLocationStock.findUnique({
            where: {
              itemId_locationId: {
                itemId: item.inventoryItemId,
                locationId: adjustment.locationId,
              },
            },
            select: { quantity: true },
          });
          const systemQty = stock?.quantity ?? 0;
          const diff = item.quantityActual - systemQty;

          // Persist what was actually applied, so the approved record explains
          // the movement the ledger shows rather than the one first proposed.
          await tx.stockAdjustmentItem.update({
            where: { id: item.id },
            data: {
              quantitySystem: systemQty,
              quantityDifference: diff,
            },
          });

          if (diff === 0) continue;

          // A count correction is an ordinary movement in one direction or
          // the other. Both used to be hand-rolled here, with their own batch
          // walking and their own ledger arithmetic; they now go through the
          // shared path so the running balance and the costing match every
          // other document.
          if (diff > 0) {
            await this.movements.receive(tx, {
              itemId: item.inventoryItemId,
              locationId: adjustment.locationId,
              quantity: diff,
              unitCost: toNum(item.unitCost) || toNum(inventoryItem.unitCost),
              // A positive correction on a batch-tracked item needs somewhere
              // to land. The reviewer's chosen batch wins; otherwise the
              // adjustment gets a batch named after itself, so the stock is
              // traceable to the count that created it.
              batchNumber: inventoryItem.batchTracking
                ? (item.batchNumber ?? `ADJ-${adjustment.adjustmentCode}`)
                : null,
              expiryDate: null,
              type: StockLedgerType.ADJUSTMENT_IN,
              referenceType: 'ADJUSTMENT',
              referenceId: adjustment.id,
              notes: `Adjustment (${adjustment.reason})${item.notes ? ` — ${item.notes}` : ''}`,
              performedById: approvedById,
              links: { stockAdjustmentId: adjustment.id },
              // Not `requireBatchDetails`: a cycle count must be able to book
              // found stock without inventing an expiry date for it.
              requireBatchDetails: false,
              itemName: inventoryItem.name,
            });
          } else {
            await this.movements.issue(tx, {
              itemId: item.inventoryItemId,
              locationId: adjustment.locationId,
              quantity: Math.abs(diff),
              strategy: inventoryItem.batchTracking
                ? ((item as any).distributionStrategy ?? 'FEFO')
                : 'FEFO',
              selectedBatchNumber: item.batchNumber ?? null,
              // A shortfall found during a count may well be expired stock
              // that was quietly thrown away, so those batches stay reachable.
              allowExpired: true,
              type: StockLedgerType.ADJUSTMENT_OUT,
              referenceType: 'ADJUSTMENT',
              referenceId: adjustment.id,
              notes: `Adjustment (${adjustment.reason})${item.notes ? ` — ${item.notes}` : ''}`,
              performedById: approvedById,
              links: { stockAdjustmentId: adjustment.id },
              itemName: inventoryItem.name,
            });
          }
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    return this.findOne(id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VOID — undoes an APPROVED adjustment by posting the opposite movement
  // ───────────────────────────────────────────────────────────────────────────

  async void(id: string, reason: string, performedById?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A void reason is required.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const adjustment = await tx.stockAdjustment.findUnique({
          where: { id },
          select: {
            id: true,
            adjustmentCode: true,
            status: true,
            voidedAt: true,
          },
        });
        if (!adjustment) throw new NotFoundException('Adjustment not found');
        if (adjustment.status !== 'APPROVED') {
          throw new BadRequestException(
            `Only an APPROVED adjustment has moved stock. This one is ${adjustment.status} — reject it instead.`,
          );
        }
        if (adjustment.voidedAt) {
          throw new ConflictException(
            `Adjustment ${adjustment.adjustmentCode} is already void.`,
          );
        }

        const claimed = await tx.stockAdjustment.updateMany({
          where: { id, status: 'APPROVED', voidedAt: null },
          data: {
            voidedAt: new Date(),
            voidedById: performedById ?? null,
            voidReason: reason.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Adjustment was voided by someone else first.',
          );
        }

        await this.movements.reverseDocument(tx, {
          referenceType: 'ADJUSTMENT',
          referenceId: id,
          reversalReferenceType: 'ADJUSTMENT_VOID',
          reason: reason.trim(),
          performedById,
          links: { stockAdjustmentId: id },
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

  async reject(id: string, notes: string, rejectedById: string) {
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!adjustment) throw new NotFoundException('Adjustment not found');
      if (adjustment.status !== 'PENDING') {
        throw new BadRequestException(
          'Only PENDING adjustments can be rejected',
        );
      }

      const applied = await tx.stockAdjustment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          approvedById: rejectedById,
          approvedAt: new Date(),
          approvalNotes: notes ?? null,
        },
      });
      if (applied.count !== 1) {
        throw new ConflictException(
          'Adjustment is no longer PENDING — it may already have been actioned.',
        );
      }

      return tx.stockAdjustment.findUniqueOrThrow({ where: { id } });
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
