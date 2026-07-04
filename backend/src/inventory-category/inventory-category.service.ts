import { Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { UpdateInventoryCategoryDto } from './dto/update-inventory-category.dto';
import { InventoryCategoryResponseDto } from './dto/inventory-category-response.dto';

@Injectable()
export class InventoryCategoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: CreateInventoryCategoryDto,
  ): Promise<InventoryCategoryResponseDto> {
    // Check for duplicate name or code (no id exclusion needed for create)
    const orConditions: Prisma.InventoryCategoryWhereInput[] = [];

    if (dto.name)
      orConditions.push({ name: { equals: dto.name, mode: 'insensitive' } });
    if (dto.code)
      orConditions.push({ code: { equals: dto.code, mode: 'insensitive' } });

    if (orConditions.length > 0) {
      const existing = await this.prisma.inventoryCategory.findFirst({
        where: {
          OR: orConditions,
        },
      });

      if (existing) {
        throw new ConflictException(
          existing.name.toLowerCase() === dto.name?.toLowerCase()
            ? 'Category with this name already exists'
            : 'Category with this code already exists',
        );
      }
    }

    // Validate parent exists if provided
    if (dto.parentId) {
      const parent = await this.prisma.inventoryCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.inventoryCategory.create({
      data: {
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
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { inventoryItems: true } },
      },
    });

    return this.mapToResponse(category);
  }

  async findAll(
    params: {
      search?: string;
      isActive?: boolean;
      parentId?: string | null;
      includeChildren?: boolean;
      includeItemCount?: boolean;
    } = {},
  ): Promise<InventoryCategoryResponseDto[]> {
    const {
      search,
      isActive,
      parentId,
      includeChildren = false,
      includeItemCount = true,
    } = params;

    const where: Prisma.InventoryCategoryWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive;
    if (parentId !== undefined) where.parentId = parentId;

    const include: Prisma.InventoryCategoryInclude = {
      parent: { select: { id: true, name: true, code: true } },
    };
    if (includeChildren) {
      include.children = {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      };
    }
    if (includeItemCount) {
      include._count = { select: { inventoryItems: true } };
    }

    const categories = await this.prisma.inventoryCategory.findMany({
      where,
      include,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((cat) => this.mapToResponse(cat));
  }

  async findOne(
    id: string,
    includeChildren = false,
  ): Promise<InventoryCategoryResponseDto> {
    const include: Prisma.InventoryCategoryInclude = {
      parent: { select: { id: true, name: true, code: true } },
      _count: { select: { inventoryItems: true } },
    };
    if (includeChildren) {
      include.children = {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { inventoryItems: true } } },
      };
    }

    const category = await this.prisma.inventoryCategory.findUnique({
      where: { id },
      include,
    });

    if (!category) {
      throw new NotFoundException(
        `Inventory category with ID "${id}" not found`,
      );
    }

    return this.mapToResponse(category);
  }

  async update(
    id: string,
    dto: UpdateInventoryCategoryDto,
  ): Promise<InventoryCategoryResponseDto> {
    // Check if name/code conflict with other categories
    if (dto.name || dto.code) {
      const orConditions: Prisma.InventoryCategoryWhereInput[] = [];
      
      if (dto.name) {
        orConditions.push({ 
          name: { equals: dto.name, mode: 'insensitive' } 
        });
      }
      if (dto.code) {
        orConditions.push({ 
          code: { equals: dto.code, mode: 'insensitive' } 
        });
      }

      const existing = await this.prisma.inventoryCategory.findFirst({
        where: {
          id: { not: id },
          OR: orConditions,
        },
      });

      if (existing) {
        throw new ConflictException(
          existing.name.toLowerCase() === dto.name?.toLowerCase()
            ? 'Another category with this name already exists'
            : 'Another category with this code already exists',
        );
      }
    }

    // Prevent circular reference
    if (dto.parentId === id) {
      throw new ConflictException('A category cannot be its own parent');
    }

    // Validate parent exists if changing
    if (dto.parentId) {
      const parent = await this.prisma.inventoryCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.prisma.inventoryCategory.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        parentId: dto.parentId,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { inventoryItems: true } },
      },
    });

    return this.mapToResponse(category);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const category = await this.prisma.inventoryCategory.findUnique({
      where: { id },
      include: { _count: { select: { inventoryItems: true } } },
    });

    if (!category) {
      throw new NotFoundException(
        `Inventory category with ID "${id}" not found`,
      );
    }

    // Prevent deletion if category has items or active children
    if (category._count.inventoryItems > 0) {
      throw new ConflictException(
        `Cannot delete category: ${category._count.inventoryItems} inventory items are assigned to it.`,
      );
    }

    const activeChildren = await this.prisma.inventoryCategory.count({
      where: { parentId: id, isActive: true },
    });

    if (activeChildren > 0) {
      throw new ConflictException(
        `Cannot delete category: ${activeChildren} active sub-categories depend on it.`,
      );
    }

    // Soft delete by setting isActive = false
    await this.prisma.inventoryCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      success: true,
      message: `Category "${category.name}" deactivated successfully`,
    };
  }

  async restore(id: string): Promise<InventoryCategoryResponseDto> {
    const category = await this.prisma.inventoryCategory.update({
      where: { id },
      data: { isActive: true },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { inventoryItems: true } },
      },
    });

    return this.mapToResponse(category);
  }

  async getTree(
    parentId: string | null = null,
  ): Promise<InventoryCategoryResponseDto[]> {
    const categories = await this.prisma.inventoryCategory.findMany({
      where: { parentId, isActive: true },
      include: {
        _count: { select: { inventoryItems: true } },
        children: {
          where: { isActive: true },
          include: { _count: { select: { inventoryItems: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories.map((cat) => this.mapToResponse(cat, true));
  }

  private mapToResponse(
    category: any,
    includeFullChildren = false,
  ): InventoryCategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      code: category.code,
      description: category.description,
      color: category.color,
      icon: category.icon,
      parentId: category.parentId,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      parent: category.parent,
      children: includeFullChildren
        ? category.children?.map((c: any) => this.mapToResponse(c))
        : undefined,
      _count: category._count,
    };
  }
}