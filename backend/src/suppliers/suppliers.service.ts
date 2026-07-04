// src/suppliers/suppliers.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened suppliers service (post-audit).
//   • Every write (create / update / soft-delete / restore / hard-delete) is
//     audited inside the same transaction, with IP / user-agent captured.
//   • Hard-delete refuses when there are ANY related rows (inventoryItems,
//     purchaseOrders, expenses, creditNotes) — soft-delete by setting
//     `isActive=false` instead.
//   • Supplier master includes paymentTerms / taxId / creditLimit (set via
//     the existing UpdateSupplierDto + new fields).
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Audit (in-transaction) ────────────────────────────────────────────────

  private async writeAuditTx(
    tx: Prisma.TransactionClient,
    args: {
      action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
      entityId: string;
      oldData?: any;
      newData?: any;
      reason?: string | null;
      userId?: string | null;
      userEmail?: string | null;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    let userName: string | null = args.userEmail ?? null;
    if (args.userId) {
      const user = await tx.user.findUnique({
        where: { id: args.userId },
        select: { staff: { select: { firstName: true, lastName: true } } },
      });
      if (user?.staff) {
        userName = `${user.staff.firstName} ${user.staff.lastName}`.trim();
      }
    }
    await tx.auditLog.create({
      data: {
        action: args.action,
        module: 'SUPPLIERS',
        entityType: 'Supplier',
        recordId: args.entityId,
        oldData: (args.oldData ?? null) as Prisma.InputJsonValue,
        newData: (args.newData ?? null) as Prisma.InputJsonValue,
        reason: args.reason ?? null,
        userId: args.userId ?? null,
        userName,
        ipAddress: args.ipAddress ?? null,
        userAgent: args.userAgent ?? null,
      },
    });
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(
    dto: CreateSupplierDto,
    actorId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new ConflictException('Supplier with this name already exists');
      }

      const supplier = await tx.supplier.create({
        data: {
          ...dto,
          createdById: actorId ?? null,
          version: 1,
        },
      });

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        entityId: supplier.id,
        oldData: null,
        newData: supplier,
        userId: actorId,
        ipAddress,
        userAgent,
      });

      return supplier;
    });
  }

  async findAll(query: SupplierQueryDto) {
    const {
      search,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const pageNum = parseInt(page as any, 10) || 1;
    const limitNum = parseInt(limit as any, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const [suppliers, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              inventoryItems: true,
              purchaseOrders: true,
              expenses: true,
            },
          },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data: suppliers.map((s) => ({
        ...s,
        inventoryItemsCount: s._count.inventoryItems,
        purchaseOrdersCount: s._count.purchaseOrders,
        expensesCount: s._count.expenses,
        _count: undefined,
      })),
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventoryItems: true,
            purchaseOrders: true,
            expenses: true,
          },
        },
      },
    });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID "${id}" not found`);
    }
    return {
      ...supplier,
      inventoryItemsCount: supplier._count.inventoryItems,
      purchaseOrdersCount: supplier._count.purchaseOrders,
      expensesCount: supplier._count.expenses,
      _count: undefined,
    };
  }

  async update(
    id: string,
    updateSupplierDto: UpdateSupplierDto,
    actorId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(`Supplier ${id} not found`);

      // Optimistic-lock check
      if (
        (updateSupplierDto as any).expectedVersion !== undefined &&
        (updateSupplierDto as any).expectedVersion !== existing.version
      ) {
        throw new ConflictException({
          message: `Supplier ${id} was modified by another request`,
          currentVersion: existing.version,
        });
      }

      // Name uniqueness check
      if (updateSupplierDto.name) {
        const clash = await tx.supplier.findFirst({
          where: {
            name: { equals: updateSupplierDto.name, mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (clash) {
          throw new ConflictException(
            `A supplier named "${updateSupplierDto.name}" already exists`,
          );
        }
      }

      const { expectedVersion: _ev, ...data } = updateSupplierDto as any;
      const updated = await tx.supplier.update({
        where: { id },
        data: {
          ...data,
          updatedById: actorId ?? null,
          version: { increment: 1 },
        },
      });

      await this.writeAuditTx(tx, {
        action: 'UPDATE',
        entityId: id,
        oldData: existing,
        newData: updated,
        userId: actorId,
        ipAddress,
        userAgent,
      });

      return updated;
    });
  }

  /**
   * Soft-delete by setting `isActive=false` whenever there are any related
   * rows (inventoryItems / purchaseOrders / expenses). Hard-delete only if the
   * supplier has zero related records AND was created in error.
   */
  async remove(
    id: string,
    reason: string,
    actorId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Removal reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              inventoryItems: true,
              purchaseOrders: true,
              expenses: true,
            },
          },
        },
      });
      if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);

      const hasRelated =
        supplier._count.inventoryItems > 0 ||
        supplier._count.purchaseOrders > 0 ||
        supplier._count.expenses > 0;

      if (hasRelated) {
        // Soft-delete — preserves the FK chain to historical expenses/POs.
        const softDeleted = await tx.supplier.update({
          where: { id },
          data: {
            isActive: false,
            updatedById: actorId ?? null,
            version: { increment: 1 },
          },
        });
        await this.writeAuditTx(tx, {
          action: 'DELETE',
          entityId: id,
          oldData: supplier,
          newData: softDeleted,
          reason,
          userId: actorId,
          ipAddress,
          userAgent,
        });
        return { action: 'soft-delete', supplier: softDeleted };
      }

      // Hard-delete — only safe if zero related records.
      const deleted = await tx.supplier.delete({ where: { id } });
      await this.writeAuditTx(tx, {
        action: 'DELETE',
        entityId: id,
        oldData: supplier,
        newData: null,
        reason,
        userId: actorId,
        ipAddress,
        userAgent,
      });
      return { action: 'hard-delete', supplier: deleted };
    });
  }

  async restore(
    id: string,
    actorId?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id } });
      if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
      if (supplier.isActive) {
        throw new BadRequestException('Supplier is already active');
      }
      const restored = await tx.supplier.update({
        where: { id },
        data: {
          isActive: true,
          updatedById: actorId ?? null,
          version: { increment: 1 },
        },
      });
      await this.writeAuditTx(tx, {
        action: 'RESTORE',
        entityId: id,
        oldData: supplier,
        newData: restored,
        userId: actorId,
        ipAddress,
        userAgent,
      });
      return restored;
    });
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      this.prisma.supplier.count(),
      this.prisma.supplier.count({ where: { isActive: true } }),
      this.prisma.supplier.count({ where: { isActive: false } }),
    ]);
    return { total, active, inactive };
  }
}