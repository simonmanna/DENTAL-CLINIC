import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { CreateStockOutDto, QueryStockOutDto } from './dto/stock-out.dto';
import {
  Prisma,
  StockLedgerType,
  StockOutCategory,
  StockDocumentStatus,
} from '@prisma/client';

@Injectable()
export class StockOutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
    private readonly movements: StockMovementService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  // Document numbers come from the row-locked `document_counters` table via
  // generate_document_number(), the same source the purchase orders use.
  //
  // The previous code derived the number from COUNT(*) + 1, which two
  // concurrent requests both read as the same value — the loser hit the unique
  // index on outCode and surfaced as a 500 — and which re-issued a number
  // already printed on a document once an earlier row was deleted. Ledger
  // codes came from Date.now() plus five random characters, which is a
  // collision waiting for a quiet moment rather than a guarantee.

  // ─────────────────────────────────────────────────────────────────────────
  // CREATE — validates stock then immediately deducts
  // ─────────────────────────────────────────────────────────────────────────

  async create(dto: CreateStockOutDto, performedById?: string) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A stock-out needs at least one line item.',
      );
    }

    const stockOut = await this.prisma.$transaction(
      async (tx) => {
        const location = await tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        // The header is written first so the ledger rows have a document to
        // point at, then `totalValue` is corrected once the real cost of the
        // batches drawn is known. It used to be computed from the unit cost
        // the CLIENT sent, while the ledger rows were written at the item's
        // master cost — so a stock-out's own total disagreed with its lines.
        const created = await tx.stockOut.create({
          data: {
            outCode: await this.docNum.next('SO', tx),
            locationId: dto.locationId,
            category: dto.category ?? StockOutCategory.GENERAL_USE,
            reason: dto.reason,
            notes: dto.notes,
            performedById,
            totalValue: 0,
            items: {
              create: dto.items.map((item) => ({
                inventoryItemId: item.inventoryItemId,
                itemName: item.itemName,
                unit: item.unit,
                quantity: item.quantity,
                unitCost: 0,
                totalCost: 0,
                distributionStrategy: item.distributionStrategy ?? 'FEFO',
                notes: item.notes,
              })),
            },
          },
          include: { items: true },
        });

        let totalValue = 0;

        for (const line of dto.items) {
          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { id: line.inventoryItemId },
            select: { id: true, name: true, batchTracking: true },
          });
          // Previously this was `if (!inventoryItem) continue`, which left the
          // StockOutItem row claiming a quantity that was never deducted.
          if (!inventoryItem) {
            throw new NotFoundException(
              `Inventory item ${line.inventoryItemId} not found`,
            );
          }

          const { draws, totalCost } = await this.movements.issue(tx, {
            itemId: line.inventoryItemId,
            locationId: dto.locationId,
            quantity: line.quantity,
            strategy: inventoryItem.batchTracking
              ? (line.distributionStrategy ?? 'FEFO')
              : 'FEFO',
            selectedBatchNumber: line.selectedBatchNumber,
            type: StockLedgerType.STOCK_OUT,
            referenceType: 'STOCK_OUT',
            referenceId: created.id,
            notes: dto.reason ?? dto.notes ?? null,
            performedById,
            links: { stockOutId: created.id },
            itemName: inventoryItem.name,
          });

          totalValue += totalCost;

          // Record what was actually drawn, so the document shows the batches
          // it consumed rather than only what was asked for.
          const row = created.items.find(
            (it) => it.inventoryItemId === line.inventoryItemId,
          );
          if (row) {
            await tx.stockOutItem.update({
              where: { id: row.id },
              data: {
                unitCost:
                  line.quantity > 0
                    ? Number((totalCost / line.quantity).toFixed(2))
                    : 0,
                totalCost: Number(totalCost.toFixed(2)),
                batchNumber:
                  draws
                    .map((d) => d.batchNumber)
                    .filter(Boolean)
                    .join(', ') || null,
              },
            });
          }
        }

        await tx.stockOut.update({
          where: { id: created.id },
          data: { totalValue: Number(totalValue.toFixed(2)) },
        });

        return created;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );

    return this.findOne(stockOut.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VOID — returns the issued stock by posting the inverse movement
  // ─────────────────────────────────────────────────────────────────────────

  async void(id: string, reason: string, performedById?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A void reason is required.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.stockOut.findUnique({
          where: { id },
          select: { id: true, status: true, outCode: true },
        });
        if (!existing) throw new NotFoundException('Stock-out not found');
        if (existing.status === StockDocumentStatus.VOID) {
          throw new ConflictException(
            `Stock-out ${existing.outCode} is already void.`,
          );
        }

        // Claim the void before reversing, so two concurrent requests cannot
        // both post a compensating movement.
        const claimed = await tx.stockOut.updateMany({
          where: { id, status: StockDocumentStatus.ACTIVE },
          data: {
            status: StockDocumentStatus.VOID,
            voidedAt: new Date(),
            voidedById: performedById ?? null,
            voidReason: reason.trim(),
          },
        });
        if (claimed.count !== 1) {
          throw new ConflictException(
            'Stock-out was voided by someone else first.',
          );
        }

        await this.movements.reverseDocument(tx, {
          referenceType: 'STOCK_OUT',
          referenceId: id,
          reversalReferenceType: 'STOCK_OUT_VOID',
          reason: reason.trim(),
          performedById,
          links: { stockOutId: id },
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
                  locationStocks: {
                    select: { quantity: true, locationId: true },
                  },
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
                locationStocks: {
                  select: { quantity: true, locationId: true },
                },
              },
            },
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          include: {
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
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
    const baseWhere: Prisma.StockOutWhereInput = locationId
      ? { locationId }
      : {};
    const thisMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalRecords,
      totalValueResult,
      monthlyValueResult,
      todayCount,
      byCategory,
    ] = await Promise.all([
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
