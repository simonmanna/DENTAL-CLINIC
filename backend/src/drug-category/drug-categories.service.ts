import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDrugCategoryDto } from './dto/create-drug-category.dto';
import { UpdateDrugCategoryDto } from './dto/update-drug-category.dto';
import { QueryDrugCategoryDto } from './dto/query-drug-category.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class DrugCategoriesService {
  constructor(private prisma: PrismaService) {}

  // ─── HELPER: Aggregate quantity from location stocks ─────────────────────
  private aggregateLocationStock(
    locationStocks: { quantity: number; locationId?: string }[], 
    locationId?: string
  ): number {
    if (!locationStocks?.length) return 0;
    
    if (locationId) {
      const stock = locationStocks.find((s) => s.locationId === locationId);
      return stock?.quantity ?? 0;
    }
    
    return locationStocks.reduce((sum, s) => sum + s.quantity, 0);
  }

  // ─── HELPER: Enrich drug with aggregated stock info ──────────────────────
  private enrichDrugWithStock(drug: any, locationId?: string) {
    if (!drug.inventoryItem) return drug;

    const totalQuantity = this.aggregateLocationStock(
      drug.inventoryItem.locationStocks, 
      locationId
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
        totalQuantity, // alias for convenience
      },
    };
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateDrugCategoryDto) {
    const existing = await this.prisma.drugCategory.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.drugCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException(`Parent category #${dto.parentId} not found`);
    }

    const category = await this.prisma.drugCategory.create({
      data: {  // ← FIXED: added `data:`
        name: dto.name,
        code: dto.code,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        parentId: dto.parentId,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: {
        parent: { select: { id: true, name: true } },
        // children: { select: { id: true, name: true } },
        _count: { select: { drugs: true } },
      },
    });

    return {
      category,
      message: 'Drug category created successfully',
    };
  }

  // ─── Find All ──────────────────────────────────────────────────────────────

  async findAll(query: QueryDrugCategoryDto) {
    const { search, parentId, isActive } = query;

    const where: Prisma.DrugCategoryWhereInput = {
      ...(isActive !== undefined ? { isActive } : { isActive: true }),
      ...(parentId !== undefined ? { parentId: parentId || null } : {}),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const categories = await this.prisma.drugCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, color: true } },
        // children: { 
        //   where: { isActive: true },
        //   select: { id: true, name: true, color: true, sortOrder: true } 
        // },
        _count: { select: { drugs: true } },
      },
    });

    return { categories };
  }

  // ─── Find One ──────────────────────────────────────────────────────────────

  async findOne(id: string, locationId?: string) {
    const category = await this.prisma.drugCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, color: true } },
        // children: {
        //   where: { isActive: true },
        //   orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        //   include: {
        //     _count: { select: { drugs: true } },
        //   },
        // },
        drugs: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            genericName: true,
            strength: true,
            form: true,
            unitPrice: true,
            sellPrice: true,
            // ✅ FIXED: Use locationStocks instead of quantity
            inventoryItem: {
              select: {
                id: true,
                itemCode: true,
                minQuantity: true,
                unitCost: true,
                locationStocks: {
                  select: { 
                    quantity: true, 
                    locationId: true,  // ✅ Required for filtering
                    location: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
          take: 50,
        },
        _count: { select: { drugs: true } },
      },
    });

    if (!category) throw new NotFoundException(`Drug category #${id} not found`);
    
    // ✅ Enrich drugs with aggregated stock info
    const enrichedDrugs = category.drugs.map((drug: any) => 
      this.enrichDrugWithStock(drug, locationId)
    );

    return { 
      ...category,
      drugs: enrichedDrugs,
    };  // ← FIXED: removed extra braces
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDrugCategoryDto) {
    const category = await this.prisma.drugCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Drug category #${id} not found`);

    if (dto.parentId === id) {
      throw new ConflictException('Category cannot be its own parent');
    }

    if (dto.parentId) {
      const parent = await this.prisma.drugCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) throw new NotFoundException(`Parent category #${dto.parentId} not found`);
    }

    const updated = await this.prisma.drugCategory.update({
      where: { id },
      data: {  // ← FIXED: added `data:`
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
      include: {
        parent: { select: { id: true, name: true } },
        // children: { select: { id: true, name: true } },
        _count: { select: { drugs: true } },
      },
    });

    return {
      updated,
      message: 'Drug category updated successfully',
    };
  }

  // ─── Soft Delete ───────────────────────────────────────────────────────────

  async remove(id: string) {
    const category = await this.prisma.drugCategory.findUnique({
      where: { id },
      include: { _count: { select: { drugs: true, children: true } } },
    });
    if (!category) throw new NotFoundException(`Drug category #${id} not found`);

    if (category._count.drugs > 0) {
      throw new ConflictException(
        `Cannot delete category with ${category._count.drugs} associated drugs. Please reassign or delete drugs first.`
      );
    }

    // if (category._count.children > 0) {
    //   throw new ConflictException(
    //     `Cannot delete category with ${category._count.children} sub-categories. Please reassign or delete children first.`
    //   );
    // }

    await this.prisma.drugCategory.delete({ where: { id } });

    return { message: 'Drug category deleted successfully' };
  }

  // ─── Toggle Active ─────────────────────────────────────────────────────────

  async toggleActive(id: string) {
    const category = await this.prisma.drugCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Drug category #${id} not found`);

    const updated = await this.prisma.drugCategory.update({
      where: { id },
      data: { isActive: !category.isActive },  // ← FIXED: added `data:`
      include: {
        _count: { select: { drugs: true } },
      },
    });

    return {
      updated,
      message: `Category ${updated.isActive ? 'activated' : 'deactivated'} successfully`,
    };
  }

  // ─── Get Hierarchy Tree ────────────────────────────────────────────────────

  async getTree() {
    const categories = await this.prisma.drugCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        // children: {
        //   where: { isActive: true },
        //   orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        //   include: {
        //     children: {
        //       where: { isActive: true },
        //       orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        //       select: { id: true, name: true, color: true, icon: true },
        //     },
        //     _count: { select: { drugs: true } },
        //   },
        // },
        _count: { select: { drugs: true } },
      },
    });

    const rootCategories = categories.filter(c => !c.parentId);

    return { rootCategories };
  }
}