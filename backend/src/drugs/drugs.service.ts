import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';
import { QueryDrugsDto } from './dto/query-drugs.dto';
import { Prisma } from '@prisma/client';

// ─── SELECT CONSTANTS ──────────────────────────────────────────────────────

// ✅ Base drug select — for list views
const DRUG_SELECT = {
  id: true,
  name: true,
  genericName: true,
  form: true,
  strength: true,
  manufacturer: true,
  unit: true,
  uom: true,
  unitPrice: true,
  sellPrice: true,
  isActive: true,
  requiresPrescription: true,
  createdAt: true,
  updatedAt: true,
  categoryId: true,
  category: {
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
    },
  },
  inventoryItemId: true,
  inventoryItem: {
    select: {
      id: true,
      name: true,
      itemCode: true,
      unitCost: true,
      minQuantity: true,
      // ✅ FIXED: Include locationId so we can filter in JS
      locationStocks: {
        select: {
          quantity: true,
          locationId: true, // ← Critical for filtering
          location: {
            select: { id: true, name: true },
          },
        },
      },
    },
  },
  _count: {
    select: {
      prescriptionItems: true,
      saleItems: true,
    },
  },
} satisfies Prisma.DrugSelect;

// const DRUG_SELECT = {
//   id: true,
//   name: true,
//   genericName: true,
//   form: true,
//   strength: true,
//   manufacturer: true,
//   unit: true,
//   uom: true,
//   unitPrice: true,
//   sellPrice: true,
//   isActive: true,
//   requiresPrescription: true,
//   createdAt: true,
//   updatedAt: true,
//   categoryId: true,
//   category: {
//     select: {
//       id: true,
//       name: true,
//       code: true,
//       color: true,
//     },
//   },
//   inventoryItemId: true,
//   // ✅ FIXED: Use locationStocks instead of quantity
//   inventoryItem: {
//     select: {
//       id: true,
//       name: true,
//       itemCode: true,
//       unitCost: true,
//       minQuantity: true,
//       // ✅ Include locationStocks for aggregation
//       locationStocks: {
//         select: {
//           quantity: true,
//           locationId: true,
//           location: { select: { id: true, name: true } },
//         },
//       },
//     },
//   },
//   _count: {
//     select: {
//       prescriptionItems: true,
//       saleItems: true,
//     },
//   },
// } satisfies Prisma.DrugSelect;

// ✅ Detailed select for single-drug view
const DRUG_SELECT_DETAILED = {
  ...DRUG_SELECT,
  prescriptionItems: {
    select: {
      id: true,
      dosage: true,
      frequency: true,
      quantity: true,
      prescription: {
        select: {
          prescriptionCode: true,
          createdAt: true,
          patient: {
            select: {
              firstName: true,
              lastName: true,
              patientCode: true,
            },
          },
        },
      },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.DrugSelect;

@Injectable()
export class DrugsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── HELPER: Aggregate quantity from location stocks ─────────────────────

  // ✅ In DrugsService class:

  private aggregateLocationStock(
    locationStocks: { quantity: number; locationId?: string }[], // ✅ locationId is optional
    locationId?: string,
  ): number {
    if (!locationStocks?.length) return 0;

    if (locationId) {
      const stock = locationStocks.find((s) => s.locationId === locationId);
      return stock?.quantity ?? 0;
    }

    return locationStocks.reduce((sum, s) => sum + s.quantity, 0);
  }
  // private aggregateLocationStock(
  //   locationStocks: { quantity: number; locationId: string }[], // ✅ Updated type
  //   locationId?: string,
  // ): number {
  //   if (!locationStocks?.length) return 0;

  //   if (locationId) {
  //     const stock = locationStocks.find((s) => s.locationId === locationId);
  //     return stock?.quantity ?? 0;
  //   }

  //   return locationStocks.reduce((sum, s) => sum + s.quantity, 0);
  // }
  // private aggregateLocationStock(
  //   locationStocks: { quantity: number }[],
  //   locationId?: string
  // ): number {
  //   if (!locationStocks?.length) return 0;

  //   if (locationId) {
  //     const stock = locationStocks.find((s) => s.locationId === locationId);
  //     return stock?.quantity ?? 0;
  //   }

  //   return locationStocks.reduce((sum, s) => sum + s.quantity, 0);
  // }

  // ─── HELPER: Enrich drug with aggregated stock info ───────────────────────
  private enrichDrugWithStock(drug: any, locationId?: string) {
    if (!drug.inventoryItem) return drug;

    const totalQuantity = this.aggregateLocationStock(
      drug.inventoryItem.locationStocks,
      locationId,
    );
    const stockValue = totalQuantity * (drug.inventoryItem.unitCost ?? 0);
    const isLowStock = totalQuantity <= (drug.inventoryItem.minQuantity ?? 0);

    return {
      ...drug,
      totalQuantity,
      stockValue,
      isLowStock,
      inventoryItem: {
        ...drug.inventoryItem,
        totalQuantity,
      },
    };
  }

  // ─── CREATE ────────────────────────────────────────────────────────────────

  async create(dto: CreateDrugDto) {
    if (dto.categoryId) {
      const category = await this.prisma.drugCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, isActive: true },
      });
      if (!category)
        throw new NotFoundException(
          `Drug category not found: ${dto.categoryId}`,
        );
      if (!category.isActive)
        throw new BadRequestException('Drug category is inactive');
    }

    if (dto.inventoryItemId) {
      const existing = await this.prisma.drug.findFirst({
        where: { inventoryItemId: dto.inventoryItemId },
        select: { id: true, name: true },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory item already linked to drug: "${existing.name}"`,
        );
      }
    }

    const drug = await this.prisma.drug.create({
      data: {
        // ✅ FIXED: Added 'data:' key
        name: dto.name,
        genericName: dto.genericName,
        form: dto.form,
        strength: dto.strength,
        manufacturer: dto.manufacturer,
        unit: dto.unit ?? 'tablet',
        uom: dto.uom,
        unitPrice: dto.unitPrice ?? 0,
        sellPrice: dto.sellPrice ?? 0,
        isActive: dto.isActive ?? true,
        requiresPrescription: dto.requiresPrescription ?? false,
        ...(dto.categoryId && {
          category: { connect: { id: dto.categoryId } },
        }),
        ...(dto.inventoryItemId && {
          inventoryItem: { connect: { id: dto.inventoryItemId } },
        }),
      },
      select: DRUG_SELECT,
    });

    return this.enrichDrugWithStock(drug);
  }

  // ─── FIND ALL ──────────────────────────────────────────────────────────────

  async findAll(query: QueryDrugsDto) {
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      uom,
      isActive,
      requiresPrescription,
      lowStock,
      locationId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.DrugWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { genericName: { contains: search, mode: 'insensitive' } },
          { manufacturer: { contains: search, mode: 'insensitive' } },
          { strength: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(uom && { uom }),
      ...(isActive !== undefined && { isActive }),
      ...(requiresPrescription !== undefined && { requiresPrescription }),
    };

    const allowedSortFields = [
      'name',
      'createdAt',
      'sellPrice',
      'unitPrice',
      'updatedAt',
    ];
    const orderField = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'createdAt';

    if (lowStock) {
      const allDrugs = await this.prisma.drug.findMany({
        where,
        select: DRUG_SELECT,
        orderBy: { [orderField]: sortOrder },
      });

      const filtered = allDrugs.filter((drug) => {
        if (!drug.inventoryItem) return false;
        const totalQty = this.aggregateLocationStock(
          drug.inventoryItem.locationStocks,
          locationId,
        );
        const minQty = drug.inventoryItem.minQuantity ?? 0;
        return totalQty <= minQty;
      });

      const paginated = filtered.slice(skip, skip + limit);
      const enriched = paginated.map((d) => this.enrichDrugWithStock(d));

      return {
        data: enriched,
        meta: {
          total: filtered.length,
          page,
          limit,
          totalPages: Math.ceil(filtered.length / limit),
          hasNextPage: page < Math.ceil(filtered.length / limit),
          hasPrevPage: page > 1,
        },
      };
    }

    const [drugs, total] = await this.prisma.$transaction([
      this.prisma.drug.findMany({
        where,
        select: DRUG_SELECT,
        skip,
        take: limit,
        orderBy: { [orderField]: sortOrder },
      }),
      this.prisma.drug.count({ where }),
    ]);

    const enriched = drugs.map((d) => this.enrichDrugWithStock(d, locationId));

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  // ─── FIND ONE ──────────────────────────────────────────────────────────────

  async findOne(id: string, locationId?: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id },
      select: DRUG_SELECT_DETAILED,
    });

    if (!drug) throw new NotFoundException(`Drug not found: ${id}`);

    return this.enrichDrugWithStock(drug, locationId);
  }

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDrugDto) {
    const current = await this.prisma.drug.findUnique({
      where: { id },
      select: { inventoryItemId: true },
    });
    if (!current) throw new NotFoundException(`Drug not found: ${id}`);

    if (dto.categoryId) {
      const category = await this.prisma.drugCategory.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, isActive: true },
      });
      if (!category)
        throw new NotFoundException(
          `Drug category not found: ${dto.categoryId}`,
        );
      if (!category.isActive)
        throw new BadRequestException('Drug category is inactive');
    }

    const incomingInventoryId = dto.inventoryItemId;
    const isChangingInventory =
      incomingInventoryId !== undefined &&
      incomingInventoryId !== current.inventoryItemId;

    if (isChangingInventory && incomingInventoryId) {
      const existing = await this.prisma.drug.findFirst({
        where: { inventoryItemId: incomingInventoryId, NOT: { id } },
        select: { id: true, name: true },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory item already linked to drug: "${existing.name}"`,
        );
      }
    }

    const updated = await this.prisma.drug.update({
      where: { id },
      data: {
        // ✅ FIXED: Added 'data:' key
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.genericName !== undefined && { genericName: dto.genericName }),
        ...(dto.form !== undefined && { form: dto.form }),
        ...(dto.strength !== undefined && { strength: dto.strength }),
        ...(dto.manufacturer !== undefined && {
          manufacturer: dto.manufacturer,
        }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.uom !== undefined && { uom: dto.uom }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.sellPrice !== undefined && { sellPrice: dto.sellPrice }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.requiresPrescription !== undefined && {
          requiresPrescription: dto.requiresPrescription,
        }),
        ...(dto.categoryId !== undefined && {
          category: dto.categoryId
            ? { connect: { id: dto.categoryId } }
            : { disconnect: true },
        }),
        ...(incomingInventoryId !== undefined && {
          inventoryItem: incomingInventoryId
            ? { connect: { id: incomingInventoryId } }
            : { disconnect: true },
        }),
      },
      select: DRUG_SELECT,
    });

    return this.enrichDrugWithStock(updated);
  }

  // ─── TOGGLE ACTIVE ─────────────────────────────────────────────────────────

  async toggleActive(id: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!drug) throw new NotFoundException(`Drug not found: ${id}`);

    const updated = await this.prisma.drug.update({
      where: { id },
      data: { isActive: !drug.isActive }, // ✅ FIXED: Added 'data:' key
      select: DRUG_SELECT,
    });

    return this.enrichDrugWithStock(updated);
  }

  // ─── SOFT DELETE ───────────────────────────────────────────────────────────

  async remove(id: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { prescriptionItems: true, saleItems: true } },
      },
    });
    if (!drug) throw new NotFoundException(`Drug not found: ${id}`);

    const hasUsage =
      drug._count.prescriptionItems > 0 || drug._count.saleItems > 0;

    if (hasUsage) {
      const deactivated = await this.prisma.drug.update({
        where: { id },
        data: { isActive: false }, // ✅ FIXED: Added 'data:' key
        select: DRUG_SELECT,
      });
      return this.enrichDrugWithStock(deactivated);
    }

    await this.prisma.drug.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ─── CATEGORIES ────────────────────────────────────────────────────────────

  async getCategories() {
    return this.prisma.drugCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        icon: true,
        parentId: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  // ─── STATS ────────────────────────────────────────────────────────────────

  async getStats(locationId?: string) {
    const [total, active, requiresPrescription, byCategory] = await Promise.all(
      [
        this.prisma.drug.count(),
        this.prisma.drug.count({ where: { isActive: true } }),
        this.prisma.drug.count({ where: { requiresPrescription: true } }),
        this.prisma.drug.groupBy({
          by: ['categoryId'],
          _count: { id: true },
          where: { isActive: true },
        }),
      ],
    );

    let lowStockCount = 0;
    if (locationId) {
      const drugsWithStock = await this.prisma.drug.findMany({
        where: { isActive: true, inventoryItem: { isNot: null } },
        select: {
          inventoryItem: {
            select: {
              minQuantity: true,
              locationStocks: {
                where: { locationId },
                select: { quantity: true },
              },
            },
          },
        },
      });
      lowStockCount = drugsWithStock.filter((d) => {
        if (!d.inventoryItem) return false;
        const totalQty = this.aggregateLocationStock(
          d.inventoryItem.locationStocks,
        );
        return totalQty <= (d.inventoryItem.minQuantity ?? 0);
      }).length;
    } else {
      const drugsWithStock = await this.prisma.drug.findMany({
        where: { isActive: true, inventoryItem: { isNot: null } },
        select: {
          inventoryItem: {
            select: {
              minQuantity: true,
              locationStocks: { select: { quantity: true } },
            },
          },
        },
      });
      lowStockCount = drugsWithStock.filter((d) => {
        if (!d.inventoryItem) return false;
        const totalQty = this.aggregateLocationStock(
          d.inventoryItem.locationStocks,
        );
        return totalQty <= (d.inventoryItem.minQuantity ?? 0);
      }).length;
    }

    return {
      total,
      active,
      inactive: total - active,
      requiresPrescription,
      overTheCounter: total - requiresPrescription,
      lowStock: lowStockCount,
      byCategory,
    };
  }
}
