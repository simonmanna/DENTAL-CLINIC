import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWasteRecordDto,
  ApproveWasteRecordDto,
  QueryWasteRecordsDto,
} from './dto/create-waste.dto';
import { Prisma, StockLedgerType, WasteCategory } from '@prisma/client';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';

@Injectable()
export class WasteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
    private readonly movements: StockMovementService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE  (PENDING approval — stock not yet deducted)
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateWasteRecordDto, reportedById: string) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A waste record needs at least one line item.',
      );
    }

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

    return this.prisma.$transaction(
      async (tx) => {
        const location = await tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        // Availability is checked inside the transaction. These reads used to go
        // through `this.prisma` before any transaction opened, so the quantity
        // they validated against could change before the record was written.
        for (const item of dto.items) {
          if (!item.inventoryItemId) {
            throw new BadRequestException(
              'inventoryItemId is required for waste items',
            );
          }

          const stock = await tx.inventoryLocationStock.findUnique({
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

        return tx.wasteRecord.create({
          data: {
            wasteCode: await this.docNum.next('WST', tx),
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // APPROVE  — deducts stock + writes InventoryLedger entries
  // ─────────────────────────────────────────────────────────────────────────

  async approve(id: string, dto: ApproveWasteRecordDto, approvedById: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const record = await tx.wasteRecord.findUnique({
          where: { id },
          include: { items: true, location: true },
        });

        if (!record) throw new NotFoundException('Waste record not found');
        if (record.approvedById) {
          throw new ForbiddenException('This waste record is already approved');
        }

        // Segregation of duties — a write-off destroys stock against nothing but
        // its own paperwork, so the person who raised it does not also sign it.
        if (record.reportedById && record.reportedById === approvedById) {
          throw new BadRequestException(
            'Approver cannot be the same user who reported the waste (segregation of duties).',
          );
        }

        // Claim the approval with the unapproved state asserted in the WHERE
        // clause, before any stock moves. The previous read-then-write left a
        // window in which two concurrent approvals both saw an unapproved
        // record and both deducted the same quantity.
        const claimed = await tx.wasteRecord.updateMany({
          where: { id, approvedById: null },
          data: {
            approvedById,
            approvedAt: new Date(),
            notes: dto.notes
              ? `${record.notes ?? ''}\n[Approval Notes] ${dto.notes}`.trim()
              : record.notes,
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Waste record was approved by someone else first.',
          );
        }

        let postedValue = 0;

        for (const item of record.items) {
          const inventoryItem = item.inventoryItemId
            ? await tx.inventoryItem.findUnique({
                where: { id: item.inventoryItemId },
                select: { id: true, name: true, batchTracking: true },
              })
            : null;
          // Previously both a missing inventoryItemId and a missing item row
          // were skipped with `continue`, leaving an APPROVED waste record
          // whose lines had never been deducted from anything.
          if (!item.inventoryItemId || !inventoryItem) {
            throw new NotFoundException(
              `Waste line "${item.itemName}" is not attached to an existing inventory item.`,
            );
          }

          const { totalCost } = await this.movements.issue(tx, {
            itemId: item.inventoryItemId,
            locationId: record.locationId,
            quantity: item.quantity,
            strategy: inventoryItem.batchTracking
              ? ((item as any).distributionStrategy ?? 'FEFO')
              : 'FEFO',
            selectedBatchNumber:
              item.batchNumber ?? (item as any).selectedBatchNumber ?? null,
            // A write-off exists precisely to remove stock that has expired,
            // so this is the one caller that must be allowed to reach it.
            allowExpired: true,
            type:
              record.category === WasteCategory.EXPIRED
                ? StockLedgerType.EXPIRY_WRITE_OFF
                : StockLedgerType.WASTE,
            referenceType: 'WASTE',
            referenceId: record.id,
            notes: item.reason ?? record.notes ?? null,
            performedById: approvedById,
            links: { wasteRecordId: record.id },
            itemName: inventoryItem.name,
          });

          postedValue += totalCost;

          // Restate the line and the record at the cost of the batches that
          // were actually written off, rather than the item master's figure.
          await tx.wasteItem.update({
            where: { id: item.id },
            data: {
              unitCost:
                item.quantity > 0
                  ? Number((totalCost / item.quantity).toFixed(2))
                  : 0,
              totalCost: Number(totalCost.toFixed(2)),
            },
          });
        }

        await tx.wasteRecord.update({
          where: { id: record.id },
          data: { totalValue: Number(postedValue.toFixed(2)) },
        });
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
  // VOID — undoes an APPROVED write-off by putting the stock back
  // ───────────────────────────────────────────────────────────────────────────

  async void(id: string, reason: string, performedById?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A void reason is required.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const record = await tx.wasteRecord.findUnique({
          where: { id },
          select: {
            id: true,
            wasteCode: true,
            approvedById: true,
            voidedAt: true,
          },
        });
        if (!record) throw new NotFoundException('Waste record not found');
        if (!record.approvedById) {
          throw new BadRequestException(
            'This waste record has not been approved, so no stock has moved. Reject it instead.',
          );
        }
        if (record.voidedAt) {
          throw new ConflictException(
            `Waste record ${record.wasteCode} is already void.`,
          );
        }

        const claimed = await tx.wasteRecord.updateMany({
          where: { id, voidedAt: null, approvedById: { not: null } },
          data: {
            voidedAt: new Date(),
            voidedById: performedById ?? null,
            voidReason: reason.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Waste record was voided by someone else first.',
          );
        }

        await this.movements.reverseDocument(tx, {
          referenceType: 'WASTE',
          referenceId: id,
          reversalReferenceType: 'WASTE_VOID',
          reason: reason.trim(),
          performedById,
          links: { wasteRecordId: id },
        });

        return tx.wasteRecord.findUniqueOrThrow({
          where: { id },
          include: { items: true, location: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );
  }

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
