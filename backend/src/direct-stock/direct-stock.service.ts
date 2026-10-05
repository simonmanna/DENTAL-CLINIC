import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  StockLedgerType,
  StockOutCategory,
  StockDocumentStatus,
} from '@prisma/client';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { DirectStockInDto, DirectStockOutDto } from './dto/direct-stock.dto';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class DirectStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
    private readonly movements: StockMovementService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // DIRECT STOCK IN — same logic as PurchaseService.updateStockOnReceipt
  // ───────────────────────────────────────────────────────────────────────────

  async stockIn(dto: DirectStockInDto, performedById?: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('A stock-in needs at least one line item.');
    }

    const doc = await this.prisma.$transaction(
      async (tx) => {
        const location = await tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        const created = await tx.stockIn.create({
          data: {
            inCode: await this.docNum.next('DSI', tx),
            locationId: dto.locationId,
            notes: dto.notes,
            performedById,
            totalValue: 0,
          },
        });

        let totalValue = 0;
        const items: Array<{
          inventoryItemId: string;
          quantity: number;
          unitCost: number;
          batchId: string;
          itemName?: string;
        }> = [];

        for (const line of dto.items) {
          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { id: line.inventoryItemId },
            select: {
              id: true,
              name: true,
              unit: true,
              batchTracking: true,
              unitCost: true,
            },
          });
          if (!inventoryItem) {
            throw new NotFoundException(
              `Inventory item ${line.inventoryItemId} not found`,
            );
          }

          const unitCost = line.unitCost ?? toNum(inventoryItem.unitCost);
          const expiryDate = line.expiryDate ? new Date(line.expiryDate) : null;

          const received = await this.movements.receive(tx, {
            itemId: line.inventoryItemId,
            locationId: dto.locationId,
            quantity: line.quantity,
            unitCost,
            batchNumber: line.batchNumber,
            expiryDate,
            type: StockLedgerType.STOCK_IN,
            referenceType: 'STOCK_IN',
            referenceId: created.id,
            notes: dto.notes ?? null,
            performedById,
            links: { stockInId: created.id },
            requireBatchDetails: inventoryItem.batchTracking,
            itemName: inventoryItem.name,
          });

          const lineTotal = line.quantity * unitCost;
          totalValue += lineTotal;

          await tx.stockInItem.create({
            data: {
              stockInId: created.id,
              inventoryItemId: line.inventoryItemId,
              itemName: line.itemName ?? inventoryItem.name,
              unit: line.unit ?? inventoryItem.unit,
              quantity: line.quantity,
              unitCost,
              totalCost: Number(lineTotal.toFixed(2)),
              batchNumber: line.batchNumber?.trim() || null,
              expiryDate,
            },
          });

          items.push({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            unitCost,
            batchId: received.batchId,
            itemName: inventoryItem.name,
          });
        }

        await tx.stockIn.update({
          where: { id: created.id },
          data: { totalValue: Number(totalValue.toFixed(2)) },
        });

        return {
          id: created.id,
          code: created.inCode,
          totalValue: Number(totalValue.toFixed(2)),
          items,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );

    return {
      id: doc.id,
      code: doc.code,
      type: 'IN' as const,
      locationId: dto.locationId,
      totalValue: doc.totalValue,
      items: doc.items,
      notes: dto.notes,
      timestamp: new Date(),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DIRECT STOCK OUT
  //
  // Persisted as a StockOut document. This endpoint used to write nothing but
  // ledger rows, duplicating StockOutService's logic with its own subtly
  // different copy; now there is one issue document in the system whichever
  // screen raised it.
  // ───────────────────────────────────────────────────────────────────────────

  async stockOut(dto: DirectStockOutDto, performedById?: string) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        'A stock-out needs at least one line item.',
      );
    }

    const doc = await this.prisma.$transaction(
      async (tx) => {
        const location = await tx.location.findUnique({
          where: { id: dto.locationId },
          select: { id: true },
        });
        if (!location) throw new NotFoundException('Location not found');

        const created = await tx.stockOut.create({
          data: {
            outCode: await this.docNum.next('DSO', tx),
            locationId: dto.locationId,
            category: StockOutCategory.GENERAL_USE,
            reason: 'Direct stock out',
            notes: dto.notes,
            performedById,
            totalValue: 0,
          },
        });

        let totalValue = 0;
        const items: Array<{
          inventoryItemId: string;
          quantity: number;
          unitCost: number;
          batchId: string;
          itemName?: string;
        }> = [];

        for (const line of dto.items) {
          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { id: line.inventoryItemId },
            select: {
              id: true,
              name: true,
              unit: true,
              batchTracking: true,
            },
          });
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
            notes: dto.notes ?? null,
            performedById,
            links: { stockOutId: created.id },
            itemName: inventoryItem.name,
          });

          totalValue += totalCost;

          await tx.stockOutItem.create({
            data: {
              stockOutId: created.id,
              inventoryItemId: line.inventoryItemId,
              itemName: line.itemName ?? inventoryItem.name,
              unit: inventoryItem.unit,
              quantity: line.quantity,
              unitCost:
                line.quantity > 0
                  ? Number((totalCost / line.quantity).toFixed(2))
                  : 0,
              totalCost: Number(totalCost.toFixed(2)),
              distributionStrategy: line.distributionStrategy ?? 'FEFO',
              batchNumber:
                draws
                  .map((d) => d.batchNumber)
                  .filter(Boolean)
                  .join(', ') || null,
            },
          });

          items.push({
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            unitCost:
              line.quantity > 0
                ? Number((totalCost / line.quantity).toFixed(2))
                : 0,
            batchId: draws[0]?.batchId ?? '',
            itemName: inventoryItem.name,
          });
        }

        await tx.stockOut.update({
          where: { id: created.id },
          data: { totalValue: Number(totalValue.toFixed(2)) },
        });

        return {
          id: created.id,
          code: created.outCode,
          totalValue: Number(totalValue.toFixed(2)),
          items,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );

    return {
      id: doc.id,
      code: doc.code,
      type: 'OUT' as const,
      locationId: dto.locationId,
      totalValue: doc.totalValue,
      items: doc.items,
      notes: dto.notes,
      timestamp: new Date(),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VOID
  // ───────────────────────────────────────────────────────────────────────────

  async voidStockIn(id: string, reason: string, performedById?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A void reason is required.');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.stockIn.findUnique({
          where: { id },
          select: { id: true, status: true, inCode: true },
        });
        if (!existing) throw new NotFoundException('Stock-in not found');
        if (existing.status === StockDocumentStatus.VOID) {
          throw new ConflictException(
            `Stock-in ${existing.inCode} is already void.`,
          );
        }

        const claimed = await tx.stockIn.updateMany({
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
            'Stock-in was voided by someone else first.',
          );
        }

        // Taking a receipt back out can fail if the stock has since been
        // issued — reverseDocument says so explicitly rather than driving the
        // batch negative.
        await this.movements.reverseDocument(tx, {
          referenceType: 'STOCK_IN',
          referenceId: id,
          reversalReferenceType: 'STOCK_IN_VOID',
          reason: reason.trim(),
          performedById,
          links: { stockInId: id },
        });

        return tx.stockIn.findUniqueOrThrow({
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

  // ───────────────────────────────────────────────────────────────────────────
  // HISTORY — reads the documents, not a reconstruction of the ledger
  //
  // This used to page over InventoryLedger rows and then group them by
  // reference, so `total` counted ledger rows while `data` held transactions:
  // a page of 20 rows could return 7 records and the page count was wrong for
  // any multi-line movement. Now that both directions have header tables, the
  // documents themselves are the thing being paged.
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
    const {
      search,
      locationId,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;

    const createdAt =
      startDate || endDate
        ? {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate
              ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) }
              : {}),
          }
        : undefined;

    const wantIn = type !== 'OUT';
    const wantOut = type !== 'IN';

    const inWhere: Prisma.StockInWhereInput = {
      ...(locationId && { locationId }),
      ...(createdAt && { createdAt }),
      ...(search
        ? {
            OR: [
              { inCode: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    itemName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const outWhere: Prisma.StockOutWhereInput = {
      ...(locationId && { locationId }),
      ...(createdAt && { createdAt }),
      ...(search
        ? {
            OR: [
              { outCode: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    itemName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const include = {
      location: { select: { id: true, name: true } },
      items: {
        include: {
          inventoryItem: {
            select: {
              id: true,
              name: true,
              itemCode: true,
              unit: true,
              uom: true,
            },
          },
        },
      },
    } as const;

    // Both directions live in separate tables, so a combined page is built by
    // taking the first page*limit of each, merging on timestamp and slicing.
    // Totals are exact counts, not a guess.
    const take = page * limit;

    const [ins, outs, inTotal, outTotal] = await Promise.all([
      wantIn
        ? this.prisma.stockIn.findMany({
            where: inWhere,
            include,
            orderBy: { createdAt: 'desc' },
            take,
          })
        : Promise.resolve([]),
      wantOut
        ? this.prisma.stockOut.findMany({
            where: outWhere,
            include,
            orderBy: { createdAt: 'desc' },
            take,
          })
        : Promise.resolve([]),
      wantIn
        ? this.prisma.stockIn.count({ where: inWhere })
        : Promise.resolve(0),
      wantOut
        ? this.prisma.stockOut.count({ where: outWhere })
        : Promise.resolve(0),
    ]);

    const mapDoc = (doc: any, docType: 'IN' | 'OUT', code: string) => ({
      id: doc.id,
      code,
      type: docType,
      status: doc.status,
      locationId: doc.locationId,
      locationName: doc.location?.name,
      totalValue: toNum(doc.totalValue),
      timestamp: doc.createdAt,
      notes: doc.notes ?? undefined,
      performedById: doc.performedById ?? undefined,
      voidedAt: doc.voidedAt ?? undefined,
      voidReason: doc.voidReason ?? undefined,
      items: (doc.items ?? []).map((it: any) => ({
        itemId: it.inventoryItemId,
        itemName: it.itemName ?? it.inventoryItem?.name,
        itemCode: it.inventoryItem?.itemCode,
        unit: it.unit ?? it.inventoryItem?.unit,
        uom: it.inventoryItem?.uom,
        quantityChange: docType === 'IN' ? it.quantity : -it.quantity,
        unitCost: toNum(it.unitCost),
        totalValue: toNum(it.totalCost),
        batchNumber: it.batchNumber ?? undefined,
        expiryDate: it.expiryDate ?? undefined,
      })),
    });

    const merged = [
      ...ins.map((d: any) => mapDoc(d, 'IN', d.inCode)),
      ...outs.map((d: any) => mapDoc(d, 'OUT', d.outCode)),
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const total = inTotal + outTotal;
    const data = merged.slice((page - 1) * limit, (page - 1) * limit + limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

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

  // ───────────────────────────────────────────────────────────────────────────
  // STATS
  // ───────────────────────────────────────────────────────────────────────────

  async getStats(locationId?: string) {
    const baseWhereIn: Prisma.InventoryLedgerWhereInput = {
      referenceType: 'DIRECT_STOCK_IN',
      ...(locationId ? { locationId } : {}),
    };
    const baseWhereOut: Prisma.InventoryLedgerWhereInput = {
      referenceType: 'DIRECT_STOCK_OUT',
      ...(locationId ? { locationId } : {}),
    };

    const [totalInValue, totalOutValue, todayIn, todayOut] = await Promise.all([
      this.prisma.inventoryLedger.aggregate({
        where: baseWhereIn,
        _sum: { totalValue: true },
      }),
      this.prisma.inventoryLedger.aggregate({
        where: baseWhereOut,
        _sum: { totalValue: true },
      }),
      this.prisma.inventoryLedger.count({
        where: {
          ...baseWhereIn,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.inventoryLedger.count({
        where: {
          ...baseWhereOut,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
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
