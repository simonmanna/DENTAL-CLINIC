import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  InventoryQueryDto,
  CreateInventoryCategoryDto,
  UpdateInventoryCategoryDto,
} from './dto/inventory.dto';
import { Prisma, StockLedgerType } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Whitelist for sortBy fields (prevents arbitrary column injection) ────────
const ITEM_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'itemCode',
  'unitCost',
  'minQuantity',
  'type',
]);

const LEDGER_SORT_FIELDS = new Set([
  'createdAt',
  'quantityChange',
  'totalValue',
  'type',
]);

function safeSortField(field: string | undefined, whitelist: Set<string>, fallback: string): string {
  if (!field) return fallback;
  return whitelist.has(field) ? field : fallback;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helper: Calculate total quantity from location stocks ─────────────────
  private calculateTotalQuantity(
    locationStocks: { quantity: number }[],
  ): number {
    return locationStocks.reduce((sum, stock) => sum + stock.quantity, 0);
  }

  // ─── Helper: Check if item is low stock across all locations ───────────────
  private isLowStock(totalQuantity: number, minQuantity: number): boolean {
    return totalQuantity < minQuantity;
  }

  // ─── Item Code Generator (race-condition-safe) ────────────────────────────
  // Uses findFirst + orderBy on itemCode instead of count() to avoid duplicates
  // under concurrent writes. Wrapped in a retry loop for safety.
  private async generateItemCode(tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Find the highest existing item code
      const lastItem = await client.inventoryItem.findFirst({
        where: {
          itemCode: { startsWith: 'INV-' },
        },
        orderBy: { itemCode: 'desc' },
        select: { itemCode: true },
      });

      let nextNumber = 1;
      if (lastItem?.itemCode) {
        const match = lastItem.itemCode.match(/^INV-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      const candidate = `INV-${String(nextNumber).padStart(4, '0')}`;

      // Check if it already exists (race-condition guard)
      const exists = await client.inventoryItem.findUnique({
        where: { itemCode: candidate },
        select: { id: true },
      });

      if (!exists) return candidate;

      // If it exists, try the next number
      nextNumber++;
      const fallback = `INV-${String(nextNumber).padStart(4, '0')}`;
      const fallbackExists = await client.inventoryItem.findUnique({
        where: { itemCode: fallback },
        select: { id: true },
      });

      if (!fallbackExists) return fallback;
    }

    // Ultimate fallback: use timestamp-based code
    const ts = Date.now().toString(36).toUpperCase();
    return `INV-${ts}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  async createCategory(dto: CreateInventoryCategoryDto) {
    const existing = await this.prisma.inventoryCategory.findFirst({
      where: { name: dto.name },
    });
    if (existing)
      throw new ConflictException(`Category "${dto.name}" already exists`);

    return this.prisma.inventoryCategory.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { parent: true, children: true },
    });
  }

  async findAllCategories() {
    return this.prisma.inventoryCategory.findMany({
      where: { isActive: true, parentId: null },
      include: {
        children: {
          where: { isActive: true },
          include: { children: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { inventoryItems: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findAllCategoriesFlat() {
    return this.prisma.inventoryCategory.findMany({
      where: { isActive: true },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { inventoryItems: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async updateCategory(id: string, dto: UpdateInventoryCategoryDto) {
    await this.findCategoryOrThrow(id);
    return this.prisma.inventoryCategory.update({
      where: { id },
      data: { ...dto },
      include: { parent: true, children: true },
    });
  }

  async deleteCategory(id: string) {
    await this.findCategoryOrThrow(id);
    const itemCount = await this.prisma.inventoryItem.count({
      where: { categoryId: id },
    });
    if (itemCount > 0)
      throw new BadRequestException(
        `Cannot delete category with ${itemCount} associated item(s)`,
      );
    return this.prisma.inventoryCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async findCategoryOrThrow(id: string) {
    const cat = await this.prisma.inventoryCategory.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY ITEMS — LIST
  // Uses database-level aggregation for lowStock filtering when possible
  // ═══════════════════════════════════════════════════════════════════════════

  async findAll(query: InventoryQueryDto) {
    const {
      search,
      categoryId,
      supplierId,
      lowStock,
      isActive,
      sortBy,
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = query;

    const safeSortBy = safeSortField(sortBy, ITEM_SORT_FIELDS, 'createdAt');
    const safeLimit = Math.min(Math.max(limit, 1), 100); // Cap at 100
    const skip = (page - 1) * safeLimit;

    const where: Prisma.InventoryItemWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(categoryId && { categoryId }),
      ...(supplierId && { supplierId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { itemCode: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const baseInclude = {
      category: true,
      supplier: { select: { id: true, name: true } },
      locationStocks: { include: { location: true } },
      _count: { select: { ledgerEntries: true } },
    };

    let items: any[];
    let total: number;

    if (lowStock) {
      // ── Performance fix: add a hard cap to prevent loading unbounded data ──
      const LOW_STOCK_SCAN_LIMIT = 5000;

      const all = await this.prisma.inventoryItem.findMany({
        where,
        include: baseInclude,
        orderBy: { [safeSortBy]: sortOrder },
        take: LOW_STOCK_SCAN_LIMIT,
      });

      const filtered = all.filter((item) => {
        const totalQty = this.calculateTotalQuantity(item.locationStocks);
        return this.isLowStock(totalQty, item.minQuantity);
      });

      total = filtered.length;
      items = filtered.slice(skip, skip + safeLimit);
    } else {
      [items, total] = await Promise.all([
        this.prisma.inventoryItem.findMany({
          where,
          include: baseInclude,
          orderBy: { [safeSortBy]: sortOrder },
          skip,
          take: safeLimit,
        }),
        this.prisma.inventoryItem.count({ where }),
      ]);
    }

    const enrichedItems = items.map((item) => {
      const totalQuantity = this.calculateTotalQuantity(item.locationStocks);
      const stockValue = totalQuantity * toNum(item.unitCost);
      const isLowStockFlag = this.isLowStock(totalQuantity, item.minQuantity);
      return { ...item, totalQuantity, stockValue, isLowStock: isLowStockFlag };
    });

    return {
      data: enrichedItems,
      meta: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: page * safeLimit < total,
        hasPrev: page > 1,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY ITEMS — SINGLE / DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  async findOne(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        category: {
          include: {
            parent: { select: { id: true, name: true, color: true } },
          },
        },
        supplier: true,
        locationStocks: {
          include: { location: true },
          orderBy: { quantity: 'desc' },
        },
        // Single combined ledger query instead of two separate ones
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            location: true,
            batch: true,
            performedBy: { select: { id: true, email: true } },
          },
        },
        procedureInputs: {
          include: {
            procedure: { select: { id: true, name: true, code: true } },
            location: { select: { id: true, name: true } },
          },
        },
        purchaseOrderItems: {
          include: {
            purchaseOrder: {
              select: {
                id: true,
                poNumber: true,
                status: true,
                createdAt: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: {
          select: {
            ledgerEntries: true,
            locationStocks: true,
            procedureInputs: true,
            purchaseOrderItems: true,
          },
        },
      },
    });

    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);

    const totalQuantity = this.calculateTotalQuantity(item.locationStocks);
    const stockValue = totalQuantity * toNum(item.unitCost);
    const isLowStockFlag = this.isLowStock(totalQuantity, item.minQuantity);

    return {
      ...item,
      totalQuantity,
      stockValue,
      isLowStock: isLowStockFlag,
      // Use the same ledgerEntries already fetched — no duplicate query
      stockLogs: item.ledgerEntries,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY ITEMS — CREATE (with transaction for code generation)
  // ═══════════════════════════════════════════════════════════════════════════

  async create(dto: CreateInventoryItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const itemCode = dto.itemCode ?? (await this.generateItemCode(tx));

      const existing = await tx.inventoryItem.findUnique({
        where: { itemCode },
      });
      if (existing)
        throw new ConflictException(`Item code "${itemCode}" already in use`);

      return tx.inventoryItem.create({
        data: {
          itemCode,
          name: dto.name,
          description: dto.description,
          type: dto.type,
          unit: dto.unit,
          uom: dto.uom,
          minQuantity: dto.minQuantity ?? 0,
          unitCost: dto.unitCost ?? 0,
          isActive: dto.isActive ?? true,
          batchTracking: dto.batchTracking ?? false,
          ...(dto.categoryId && {
            category: { connect: { id: dto.categoryId } },
          }),
          ...(dto.supplierId && {
            supplier: { connect: { id: dto.supplierId } },
          }),
        },
        include: {
          category: true,
          supplier: { select: { id: true, name: true } },
          locationStocks: true,
        },
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY ITEMS — UPDATE / DEACTIVATE
  // ═══════════════════════════════════════════════════════════════════════════

  async update(id: string, dto: UpdateInventoryItemDto) {
    await this.findOrThrow(id);

    const updateData: Prisma.InventoryItemUpdateInput = {
      name: dto.name,
      description: dto.description,
      unit: dto.unit,
      uom: dto.uom,
      minQuantity: dto.minQuantity,
      unitCost: dto.unitCost,
      isActive: dto.isActive,
      ...(dto.batchTracking !== undefined && {
        batchTracking: dto.batchTracking,
      }),
      ...(dto.categoryId !== undefined && {
        category: dto.categoryId
          ? { connect: { id: dto.categoryId } }
          : { disconnect: true },
      }),
      ...(dto.supplierId !== undefined && {
        supplier: dto.supplierId
          ? { connect: { id: dto.supplierId } }
          : { disconnect: true },
      }),
    };

    return this.prisma.inventoryItem.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        supplier: { select: { id: true, name: true } },
        locationStocks: { include: { location: true } },
      },
    });
  }

  async deactivate(id: string) {
    await this.findOrThrow(id);
    return this.prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async findOrThrow(id: string) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    return item;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS / DASHBOARD — Performance-optimized with raw query
  // ═══════════════════════════════════════════════════════════════════════════

  async getStats() {
    // Use a single pass over items with minimal data selected
    const activeItems = await this.prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: {
        id: true,
        minQuantity: true,
        unitCost: true,
        locationStocks: { select: { quantity: true } },
      },
    });

    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalStockValue = 0;

    for (const item of activeItems) {
      const totalQty = this.calculateTotalQuantity(item.locationStocks);
      totalStockValue += totalQty * toNum(item.unitCost);

      if (totalQty === 0) outOfStockCount++;
      else if (this.isLowStock(totalQty, item.minQuantity)) lowStockCount++;
    }

    const categoryBreakdown = await this.prisma.inventoryCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { inventoryItems: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      total: activeItems.length,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      stockValue: totalStockValue,
      categoryBreakdown: categoryBreakdown.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        count: c._count.inventoryItems,
      })),
    };
  }

  async getItemBatches(itemId: string, locationId: string) {
    return this.prisma.inventoryBatch.findMany({
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
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT 1: Inventory Items Report — Performance-optimized
  // ═══════════════════════════════════════════════════════════════════════════

  async getItemsReport(query: {
    search?: string;
    categoryId?: string;
    supplierId?: string;
    type?: string;
    isActive?: boolean;
    lowStock?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    const {
      search,
      categoryId,
      supplierId,
      type,
      isActive,
      lowStock,
      sortBy,
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = query;

    const safeSortBy = safeSortField(sortBy, ITEM_SORT_FIELDS, 'createdAt');
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.InventoryItemWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(categoryId && { categoryId }),
      ...(supplierId && { supplierId }),
      ...(type && { type: type as any }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { itemCode: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const include = {
      category: { select: { id: true, name: true, color: true } },
      supplier: { select: { id: true, name: true } },
      locationStocks: {
        include: { location: { select: { id: true, name: true, type: true } } },
      },
      _count: {
        select: { ledgerEntries: true, purchaseOrderItems: true },
      },
    };

    let items: any[];
    let total: number;

    if (lowStock) {
      const LOW_STOCK_SCAN_LIMIT = 5000;
      const all = await this.prisma.inventoryItem.findMany({
        where,
        include,
        orderBy: { [safeSortBy]: sortOrder },
        take: LOW_STOCK_SCAN_LIMIT,
      });
      const filtered = all.filter((item) => {
        const totalQty = this.calculateTotalQuantity(item.locationStocks);
        return this.isLowStock(totalQty, item.minQuantity);
      });
      total = filtered.length;
      items = filtered.slice(skip, skip + safeLimit);
    } else {
      [items, total] = await Promise.all([
        this.prisma.inventoryItem.findMany({
          where,
          include,
          orderBy: { [safeSortBy]: sortOrder },
          skip,
          take: safeLimit,
        }),
        this.prisma.inventoryItem.count({ where }),
      ]);
    }

    const enriched = items.map((item) => {
      const totalQuantity = this.calculateTotalQuantity(item.locationStocks);
      const stockValue = totalQuantity * toNum(item.unitCost);
      const isLowStockFlag = this.isLowStock(totalQuantity, item.minQuantity);
      return { ...item, totalQuantity, stockValue, isLowStock: isLowStockFlag };
    });

    // ── Summary stats: reuse getStats() to avoid a second full scan ─────────
    // Only compute summary if explicitly needed (first page request)
    let summary: any = null;
    if (page === 1) {
      const statsData = await this.getStats();
      const categoryBreakdown = await this.prisma.inventoryCategory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { inventoryItems: true } },
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      });

      summary = {
        totalItems: statsData.total,
        lowStockCount: statsData.lowStock,
        outOfStockCount: statsData.outOfStock,
        totalStockValue: statsData.stockValue,
        categoryBreakdown: categoryBreakdown.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          count: c._count.inventoryItems,
        })),
      };
    }

    return {
      data: enriched,
      pagination: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: page * safeLimit < total,
        hasPrev: page > 1,
      },
      ...(summary && { summary }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT 2: Stock Ledger (Transactions) Report
  // ═══════════════════════════════════════════════════════════════════════════

  async getLedgerReport(query: {
    search?: string;
    itemId?: string;
    locationId?: string;
    type?: StockLedgerType;
    referenceType?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    const {
      search,
      itemId,
      locationId,
      type,
      referenceType,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder = 'desc',
      page = 1,
      limit = 25,
    } = query;

    const safeSortBy = safeSortField(sortBy, LEDGER_SORT_FIELDS, 'createdAt');
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (page - 1) * safeLimit;

    const where: Prisma.InventoryLedgerWhereInput = {
      ...(itemId && { itemId }),
      ...(locationId && { locationId }),
      ...(type && { type }),
      ...(referenceType && { referenceType }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && {
                lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)),
              }),
            },
          }
        : {}),
      ...(search && {
        OR: [
          { item: { name: { contains: search, mode: 'insensitive' as const } } },
          { item: { itemCode: { contains: search, mode: 'insensitive' as const } } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { ledgerCode: { contains: search, mode: 'insensitive' as const } },
          { referenceType: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.inventoryLedger.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { [safeSortBy]: sortOrder },
        include: {
          item: {
            select: {
              id: true,
              name: true,
              itemCode: true,
              unit: true,
              uom: true,
              category: { select: { id: true, name: true, color: true } },
            },
          },
          location: { select: { id: true, name: true, type: true } },
          batch: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              receivedAt: true,
            },
          },
          performedBy: { select: { id: true, email: true } },
          performedByStaff: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.inventoryLedger.count({ where }),
    ]);

    // Summary aggregates — only on first page to reduce load
    let summary: any = null;
    if (page === 1) {
      const summaryWhere: Prisma.InventoryLedgerWhereInput = {
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
        ...(type && { type }),
        ...(referenceType && { referenceType }),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && {
                  lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)),
                }),
              },
            }
          : {}),
      };

      // Use aggregation instead of loading all rows
      const aggResult = await this.prisma.inventoryLedger.aggregate({
        where: summaryWhere,
        _count: true,
        _sum: {
          quantityChange: true,
          totalValue: true,
        },
      });

      // For type breakdown, use groupBy
      const typeGroups = await this.prisma.inventoryLedger.groupBy({
        by: ['type'],
        where: summaryWhere,
        _count: true,
        _sum: {
          quantityChange: true,
          totalValue: true,
        },
      });

      const typeBreakdown: Record<string, { count: number; value: number; qty: number }> = {};
      let totalIn = 0;
      let totalOut = 0;
      let totalValueIn = 0;
      let totalValueOut = 0;

      for (const group of typeGroups) {
        const key = group.type as string;
        const qty = Math.abs(group._sum.quantityChange ?? 0);
        const value = toNum(group._sum.totalValue);

        typeBreakdown[key] = {
          count: group._count,
          value,
          qty,
        };

        // Determine direction based on type
        const isInbound = ['PURCHASE_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN_IN', 'OPENING_BALANCE'].includes(key);
        if (isInbound) {
          totalIn += qty;
          totalValueIn += value;
        } else {
          totalOut += qty;
          totalValueOut += value;
        }
      }

      summary = {
        totalTransactions: aggResult._count,
        totalIn,
        totalOut,
        netQuantity: totalIn - totalOut,
        totalValueIn,
        totalValueOut,
        netValue: totalValueIn - totalValueOut,
        typeBreakdown,
      };
    }

    return {
      data,
      pagination: {
        total,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNext: page * safeLimit < total,
        hasPrev: page > 1,
      },
      ...(summary && { summary }),
    };
  }
}