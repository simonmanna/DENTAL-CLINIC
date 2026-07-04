// src/stock-log/stock-log.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GetStockLogsDto } from './dto/get-stock-logs.dto';
import { StockLedgerType, Prisma } from '@prisma/client';  // ✅ FIXED imports

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class StockLogService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // GET STOCK LOGS (Now: Inventory Ledger Entries)
  // ═══════════════════════════════════════════════════════════════════════════

  async getStockLogs(dto: GetStockLogsDto) {
    const {
      locationId,
      itemId,  // ✅ FIXED: Was inventoryItemId
      type,    // ✅ FIXED: Was transactionType
      referenceType,
      referenceId,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = dto;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 50;
    const skip = (pageNum - 1) * limitNum;

    // ✅ FIXED: Use InventoryLedgerWhereInput
    const where: Prisma.InventoryLedgerWhereInput = {
      ...(locationId && { locationId }),
      ...(itemId && { itemId }),  // ✅ FIXED: Direct itemId filter
      ...(type && { type }),      // ✅ FIXED: Use StockLedgerType enum
      ...(referenceType && { referenceType }),  // ✅ NEW: Polymorphic filter
      ...(referenceId && { referenceId }),      // ✅ NEW: Polymorphic filter
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { lte: new Date(dateTo) } }),
      ...(search && {
        OR: [
          {
            item: { name: { contains: search, mode: 'insensitive' } },  // ✅ FIXED: 'item' relation
          },
          { notes: { contains: search, mode: 'insensitive' } },
          { ledgerCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      // ✅ FIXED: Use inventoryLedger instead of stockLog
      this.prisma.inventoryLedger.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          // ✅ FIXED: Relation is 'item' not 'inventoryItem'
          item: {
            select: { 
              id: true, 
              name: true, 
              itemCode: true, 
              uom: true,
              unit: true,
              category: { select: { name: true } },
            },
          },
          location: {
            select: { id: true, name: true, type: true },
          },
          batch: {  // ✅ NEW: Include batch info if available
            select: { 
              id: true, 
              batchNumber: true, 
              expiryDate: true,
              receivedAt: true,
            },
          },
          performedBy: {
            select: { id: true, email: true, role: true },
          },
          performedByStaff: {  // ✅ NEW: Include staff performer if available
            select: { 
              id: true, 
              firstName: true, 
              lastName: true,
              specialization: true,
            },
          },
          // ✅ Optional: Include source document previews via polymorphic pattern
          // (Would need custom resolver or separate queries for each referenceType)
        },
      }),
      this.prisma.inventoryLedger.count({ where }),  // ✅ FIXED
    ]);

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET LEDGER FOR SPECIFIC ITEM
  // ═══════════════════════════════════════════════════════════════════════════

  async getItemLedger(
    itemId: string,  // ✅ FIXED: Single itemId parameter
    locationId?: string,
    type?: StockLedgerType[],  // ✅ NEW: Optional type filter
  ) {
    return this.prisma.inventoryLedger.findMany({
      where: {
        itemId,  // ✅ FIXED: Direct itemId filter
        ...(locationId && { locationId }),
        ...(type && type.length > 0 && { type: { in: type } }),  // ✅ NEW: Type filter
      },
      include: {
        item: {
          select: { 
            id: true, 
            name: true, 
            itemCode: true, 
            unit: true,
            uom: true,
            unitCost: true,
          },
        },
        location: { 
          select: { id: true, name: true, type: true, address: true } 
        },
        batch: {
          select: { 
            id: true, 
            batchNumber: true, 
            expiryDate: true,
            isActive: true,
          },
        },
        performedBy: { 
          select: { id: true, email: true, role: true } 
        },
        performedByStaff: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true,
            licenseNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,  // Reasonable default limit for item history
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE LEDGER ENTRY (Internal helper for other services)
  // ═══════════════════════════════════════════════════════════════════════════

  // ✅ FIXED: Use InventoryLedgerCreateInput
  // async createLedgerEntry(data: Prisma.InventoryLedgerCreateInput) {
  //   // Validate required fields
  //   if (!data.itemId || !data.locationId || !data.type) {
  //     throw new BadRequestException(
  //       'Missing required fields: itemId, locationId, and type are required',
  //     );
  //   }

  //   // Auto-calculate totalValue if not provided
  //   const ledgerData = {
  //     ...data,
  //     totalValue: data.totalValue ?? Math.abs(data.quantityChange) * (data.unitCost ?? 0),
  //     ledgerCode: data.ledgerCode ?? this.generateLedgerCode(),  // Auto-generate if not provided
  //   };

  //   return this.prisma.inventoryLedger.create({ 
  //      ledgerData,
  //     include: {
  //       item: { select: { id: true, name: true, itemCode: true } },
  //       location: { select: { id: true, name: true } },
  //       batch: { select: { id: true, batchNumber: true } },
  //     },
  //   });
  // }

  // ✅ Helper: Generate unique ledger code
  private generateLedgerCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `ILG-${new Date().getFullYear()}-${timestamp}${random}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BONUS: Analytics & Reporting Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get stock movement summary for an item at a location
   */
  async getItemStockSummary(itemId: string, locationId: string, days?: number) {
    const dateFilter = days 
      ? { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } }
      : {};

    const entries = await this.prisma.inventoryLedger.findMany({
      where: {
        itemId,
        locationId,
        ...dateFilter,
      },
      select: {
        type: true,
        quantityChange: true,
        unitCost: true,
        totalValue: true,
        createdAt: true,
      },
    });

    const summary = entries.reduce((acc, entry) => {
      if (entry.quantityChange > 0) {
        acc.totalIn += entry.quantityChange;
        acc.valueIn += toNum(entry.totalValue);
      } else {
        acc.totalOut += Math.abs(entry.quantityChange);
        acc.valueOut += toNum(entry.totalValue);
      }
      return acc;
    }, {
      totalIn: 0,
      totalOut: 0,
      netChange: 0,
      valueIn: 0,
      valueOut: 0,
      netValue: 0,
      transactionCount: entries.length,
    });

    summary.netChange = summary.totalIn - summary.totalOut;
    summary.netValue = summary.valueIn - summary.valueOut;

    return summary;
  }

  /**
   * Get ledger entries by reference (e.g., all entries for a specific sale/delivery)
   */
  async getByReference(referenceType: string, referenceId: string) {
    return this.prisma.inventoryLedger.findMany({
      where: { referenceType, referenceId },
      include: {
        item: { select: { id: true, name: true, itemCode: true, unit: true } },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get expiring stock alert: batches with ledger entries that expire soon
   */
  async getExpiringStockAlert(daysUntilExpiry = 30, locationId?: string) {
    return this.prisma.inventoryBatch.findMany({
      where: {
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: {
          lte: new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000),
          gte: new Date(),  // Only future expiries
        },
        ...(locationId && { locationId }),
      },
      include: {
        item: {
          select: { 
            id: true, 
            name: true, 
            itemCode: true,
            unit: true,
            minQuantity: true,
          },
        },
        location: { select: { id: true, name: true } },
        // Count recent ledger entries for this batch
        ledgerEntries: {
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          select: { id: true },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }
}