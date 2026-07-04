// src/expense-categories/expense-categories.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from './dto/expense-category.dto';
import { DEFAULT_EXPENSE_CATEGORIES } from './default-categories';

export interface Actor {
  id?: string | null;
  email?: string | null;
}

@Injectable()
export class ExpenseCategoriesService implements OnModuleInit {
  private readonly logger = new Logger(ExpenseCategoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gl: GeneralLedgerService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureDefaults();
    } catch (e) {
      // Never crash app boot on a seed hiccup — categories self-heal on next run.
      this.logger.warn(
        `Could not ensure default expense categories: ${(e as Error).message}`,
      );
    }
  }

  // ── Seeding ─────────────────────────────────────────────────────────────────

  /**
   * Create any missing default categories (idempotent, keyed by `slug`). Never
   * overwrites an existing row — users own the list after first seed. Pre-links
   * each default to its canonical ledger account when that account exists.
   */
  async ensureDefaults() {
    // Make sure the canonical chart exists so GL links resolve on a fresh DB.
    await this.gl.ensureCoreAccounts().catch(() => undefined);

    for (let i = 0; i < DEFAULT_EXPENSE_CATEGORIES.length; i++) {
      const def = DEFAULT_EXPENSE_CATEGORIES[i];
      const existing = await this.prisma.expenseCategory.findUnique({
        where: { slug: def.slug },
        select: { id: true },
      });
      if (existing) continue;

      const ledgerAccountId = def.glKey
        ? (
            await this.prisma.ledgerAccount.findUnique({
              where: { systemKey: def.glKey },
              select: { id: true },
            })
          )?.id ?? null
        : null;

      await this.prisma.expenseCategory.create({
        data: {
          slug: def.slug,
          name: def.name,
          icon: def.icon ?? null,
          sortOrder: i,
          isSystem: true,
          isActive: true,
          ledgerAccountId,
        },
      });
    }
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async list(opts: { includeInactive?: boolean } = {}) {
    return this.prisma.expenseCategory.findMany({
      where: opts.includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        ledgerAccount: { select: { id: true, code: true, name: true, type: true } },
        _count: { select: { expenses: true } },
      },
    });
  }

  async getById(id: string) {
    const cat = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: {
        ledgerAccount: { select: { id: true, code: true, name: true, type: true } },
        _count: { select: { expenses: true } },
      },
    });
    if (!cat) throw new NotFoundException('Expense category not found');
    return cat;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  async create(
    dto: CreateExpenseCategoryDto,
    actor?: Actor,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Category name is required');

    const nameClash = await this.prisma.expenseCategory.findUnique({
      where: { name },
      select: { id: true },
    });
    if (nameClash) {
      throw new BadRequestException(`A category named "${name}" already exists`);
    }

    const ledgerAccountId = await this.resolveLedgerAccountId(dto.ledgerAccountId);
    const slug = await this.uniqueSlug(name);

    const created = await this.prisma.expenseCategory.create({
      data: {
        name,
        slug,
        description: dto.description ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        sortOrder: dto.sortOrder ?? 999,
        ledgerAccountId,
        isSystem: false,
        isActive: true,
      },
    });

    await this.writeAudit('CREATE', created.id, null, created, actor, null, ipAddress, userAgent);
    return created;
  }

  async update(
    id: string,
    dto: UpdateExpenseCategoryDto,
    actor?: Actor,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expense category not found');

    const data: Prisma.ExpenseCategoryUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Category name cannot be empty');
      if (name !== existing.name) {
        const clash = await this.prisma.expenseCategory.findFirst({
          where: { name, NOT: { id } },
          select: { id: true },
        });
        if (clash) {
          throw new BadRequestException(`A category named "${name}" already exists`);
        }
      }
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.color !== undefined) data.color = dto.color ?? null;
    if (dto.icon !== undefined) data.icon = dto.icon ?? null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.ledgerAccountId !== undefined) {
      const ledgerAccountId = await this.resolveLedgerAccountId(dto.ledgerAccountId);
      data.ledgerAccount = ledgerAccountId
        ? { connect: { id: ledgerAccountId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.expenseCategory.update({ where: { id }, data });
    await this.writeAudit('UPDATE', id, existing, updated, actor, null, ipAddress, userAgent);
    return updated;
  }

  async remove(
    id: string,
    actor?: Actor,
    reason?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    const cat = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } } },
    });
    if (!cat) throw new NotFoundException('Expense category not found');

    if (cat.isSystem) {
      throw new BadRequestException(
        'This is a default category and cannot be deleted. Disable it instead.',
      );
    }
    if (cat._count.expenses > 0) {
      throw new BadRequestException(
        'This category is used by existing expenses and cannot be deleted. Disable it instead.',
      );
    }

    await this.prisma.expenseCategory.delete({ where: { id } });
    await this.writeAudit('DELETE', id, cat, null, actor, reason ?? null, ipAddress, userAgent);
    return { ok: true };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Validate a caller-supplied ledger account id exists; null/'' clears the link. */
  private async resolveLedgerAccountId(
    ledgerAccountId?: string | null,
  ): Promise<string | null> {
    if (!ledgerAccountId) return null;
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { id: ledgerAccountId },
      select: { id: true, isActive: true },
    });
    if (!acc) throw new BadRequestException('Linked ledger account not found');
    if (!acc.isActive) {
      throw new BadRequestException('Cannot link to an inactive ledger account');
    }
    return acc.id;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'CATEGORY';
    let slug = base;
    let n = 1;
    while (
      await this.prisma.expenseCategory.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      slug = `${base}_${++n}`;
    }
    return slug;
  }

  private async writeAudit(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    recordId: string,
    oldData: unknown,
    newData: unknown,
    actor?: Actor,
    reason?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor?.id ?? null,
          userName: actor?.email ?? null,
          action,
          module: 'EXPENSE_CATEGORIES',
          entityType: 'ExpenseCategory',
          recordId,
          oldData: (oldData ?? undefined) as Prisma.InputJsonValue | undefined,
          newData: (newData ?? undefined) as Prisma.InputJsonValue | undefined,
          reason: reason ?? null,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Category audit log failed: ${(e as Error).message}`);
    }
  }
}
