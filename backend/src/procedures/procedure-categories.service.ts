import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { LedgerAccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProcedureCategoryDto,
  UpdateProcedureCategoryDto,
  CategoryQueryDto,
} from './dto/procedure-category.dto';

@Injectable()
export class ProcedureCategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: CategoryQueryDto) {
    const where: any = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.parentId) {
      where.parentId = query.parentId === 'null' ? null : query.parentId;
    }

    const categories = await this.prisma.procedureCategory.findMany({
      where,
      include: {
        _count: {
          select: { procedures: true, children: true },
        },
        parent: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories;
  }

  async findHierarchy() {
    const categories = await this.prisma.procedureCategory.findMany({
      // Merge both conditions into one where
      where: {
        isActive: true,
        parentId: null,
      },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { procedures: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return categories;
  }

  //   async findHierarchy() {
  //     const categories = await this.prisma.procedureCategory.findMany({
  //       where: { isActive: true },
  //       include: {
  //         children: {
  //           where: { isActive: true },
  //           orderBy: { sortOrder: 'asc' },
  //         },
  //         _count: {
  //           select: { procedures: true },
  //         },
  //       },
  //       where: { parentId: null },
  //       orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  //     });

  //     return categories;
  //   }

  async findOne(id: string) {
    const category = await this.prisma.procedureCategory.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        procedures: {
          where: { isActive: true },
          select: { id: true, name: true, basePrice: true },
          take: 5,
        },
        _count: {
          select: { procedures: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    return category;
  }

  async create(dto: CreateProcedureCategoryDto) {
    // Check for duplicate name
    const existing = await this.prisma.procedureCategory.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    // Validate parent if provided
    if (dto.parentId) {
      const parent = await this.prisma.procedureCategory.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category ${dto.parentId} not found`,
        );
      }
    }

    // Optional revenue-account mapping — must be an INCOME ledger account.
    const revenueAccountId =
      this.normalizeRevenueAccountId((dto as any).revenueAccountId) ?? null;
    if (revenueAccountId) await this.assertIncomeAccount(revenueAccountId);

    return this.prisma.procedureCategory.create({
      data: {
        ...dto,
        parentId: dto.parentId || null,
        revenueAccountId,
      },
      include: {
        parent: {
          select: { id: true, name: true },
        },
        revenueAccount: true,
      },
    });
  }

  async update(id: string, dto: UpdateProcedureCategoryDto) {
    await this.findOne(id);

    // Check for duplicate name if updating name
    if (dto.name) {
      const existing = await this.prisma.procedureCategory.findFirst({
        where: {
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException(`Category "${dto.name}" already exists`);
      }
    }

    // Prevent circular reference
    if (dto.parentId === id) {
      throw new ConflictException('Category cannot be its own parent');
    }

    // Revenue-account mapping. undefined = leave unchanged; null/"" = clear;
    // string = set (validated as an INCOME account).
    const data: any = { ...dto };
    const norm = this.normalizeRevenueAccountId((dto as any).revenueAccountId);
    if (norm !== undefined) {
      if (norm) await this.assertIncomeAccount(norm);
      data.revenueAccountId = norm;
    } else {
      delete data.revenueAccountId;
    }

    return this.prisma.procedureCategory.update({
      where: { id },
      data,
      include: {
        parent: {
          select: { id: true, name: true },
        },
        revenueAccount: true,
        _count: {
          select: { procedures: true },
        },
      },
    });
  }

  // ─── Revenue-account mapping helpers ──────────────────────────────────────
  /**
   * Normalise an incoming revenueAccountId:
   *   undefined → undefined  (leave the column unchanged on update)
   *   null / "" → null       (explicit clear → fall back to system default)
   *   string    → trimmed id
   */
  private normalizeRevenueAccountId(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  }

  /** Assert the id references an existing INCOME (revenue) ledger account. */
  private async assertIncomeAccount(id: string): Promise<void> {
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!acc) {
      throw new BadRequestException(`Revenue account ${id} not found`);
    }
    if (acc.type !== LedgerAccountType.INCOME) {
      throw new BadRequestException(
        'revenueAccountId must reference an INCOME (revenue) ledger account',
      );
    }
  }

  async remove(id: string) {
    const category = await this.prisma.procedureCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { procedures: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    if (category._count.procedures > 0) {
      throw new ConflictException(
        `Cannot delete category with ${category._count.procedures} procedures. Reassign them first.`,
      );
    }

    if (category._count.children > 0) {
      throw new ConflictException(
        `Cannot delete category with sub-categories. Delete sub-categories first.`,
      );
    }

    await this.prisma.procedureCategory.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }

  async reorder(
    categories: { id: string; sortOrder: number; parentId?: string | null }[],
  ) {
    return this.prisma.$transaction(
      categories.map((cat) =>
        this.prisma.procedureCategory.update({
          where: { id: cat.id },
          data: {
            sortOrder: cat.sortOrder,
            parentId: cat.parentId === undefined ? undefined : cat.parentId,
          },
        }),
      ),
    );
  }
}
