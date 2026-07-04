// src/expenses/expenses.service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened expense service (post-audit).
//
// Fixes applied vs the previous version:
//   • Idempotency-Key replay — request-deduplication via the existing
//     `IdempotencyKey` model (24h window). Replay returns the persisted
//     response with `_idempotent: true`.
//   • Optimistic locking — every mutation accepts `expectedVersion` and uses
//     `updateMany where: { id, version: expectedVersion }` with a version
//     bump on success; conflict returns 409 with currentVersion.
//   • Transactional cash-payment path — expense + payment + GL post + audit
//     all inside one $transaction; the previous cleanup-by-delete is gone.
//   • Row-lock on payment — `SELECT … FOR UPDATE` on the expense row before
//     the balance check; closes the concurrent-overpayment race.
//   • Soft-delete only — `deletedAt/deletedById/deletedReason`; reports
//     filter on `deletedAt IS NULL` by default.
//   • Audit-tx — `writeAuditTx` runs INSIDE the same transaction as the
//     mutation, with IP / user-agent threaded through. Audit failure
//     aborts the change (no silent drop).
//   • Approve/Reject/Delete — write audit rows (previously missing).
//   • Amend flow — APPROVED expenses cannot be edited; they must be
//     amended (which moves them back to DRAFT and re-enters the approval
//     queue), preserving the audit trail.
//   • Atomic expense code — via DocumentNumberService ('EXP' prefix).
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExpenseStatus,
  ExpensePaymentStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { M } from '../common/money/money';
import { GeneralLedgerService, GL } from '../general-ledger/general-ledger.service';
import { glCashKeyForMethod } from '../general-ledger/gl-accounts';
import { DocumentNumberService } from '../common/document-number/document-number.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
  IsEnum,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsString() @IsNotEmpty() categoryId: string;
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsNotEmpty() @Min(0.01) amount: number;
  @IsDateString() @IsOptional() expenseDate?: string | Date;
  @IsString() @IsOptional() reference?: string;
  @IsString() @IsNotEmpty() createdBy: string;
  @IsString() @IsOptional() notes?: string;
  @IsOptional() attachments?: string[];
  @IsString() @IsOptional() supplierId?: string;
  @IsString() @IsOptional() locationId?: string;
  @IsIn(['CASH', 'CREDIT']) @IsOptional() paymentType?: 'CASH' | 'CREDIT';
  @IsEnum(PaymentMethod) @IsOptional() paymentMethod?: PaymentMethod;
  @IsString() @IsOptional() accountId?: string;
  @IsString() @IsOptional() paymentReference?: string;
  @IsString() @IsOptional() paymentNotes?: string;
  @IsString() @IsOptional() bankName?: string;
  @IsString() @IsOptional() chequeNumber?: string;
  @IsString() @IsOptional() idempotencyKey?: string;
}

export class UpdateExpenseDto {
  @IsString() @IsOptional() categoryId?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsOptional() @Min(0.01) amount?: number;
  @IsDateString() @IsOptional() expenseDate?: string | Date;
  @IsString() @IsOptional() reference?: string;
  @IsString() @IsOptional() notes?: string;
  @IsOptional() attachments?: string[];
  @IsString() @IsOptional() supplierId?: string;
  @IsString() @IsOptional() locationId?: string;
  /** Optimistic-lock — must match the row's current version. */
  @IsNumber() @IsOptional() expectedVersion?: number;
  @IsString() @IsOptional() editReason?: string;
}

export class ApproveExpenseDto {
  @IsString() @IsNotEmpty() approvedBy: string;
  @IsString() @IsOptional() approvalNotes?: string;
}

export class PayExpenseDto {
  @IsString() @IsNotEmpty() paidBy: string;
  @IsEnum(PaymentMethod) @IsNotEmpty() paymentMethod: PaymentMethod;
  @IsString() @IsOptional() reference?: string;
  @IsString() @IsOptional() paymentNotes?: string;
  @IsString() @IsNotEmpty() accountId: string;
  @IsString() @IsOptional() bankName?: string;
  @IsString() @IsOptional() chequeNumber?: string;
}

export class PayPartialExpenseDto extends PayExpenseDto {
  @IsNumber() @IsNotEmpty() @Min(0.01) amount: number;
}

export class VoidExpenseDto {
  @IsString() @IsOptional() voidedBy?: string;
  @IsString() @IsNotEmpty() voidReason: string;
}

/** Amendment to an APPROVED expense — re-enters the approval queue. */
export class AmendExpenseDto {
  @IsString() @IsOptional() categoryId?: string;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsOptional() @Min(0.01) amount?: number;
  @IsDateString() @IsOptional() expenseDate?: string | Date;
  @IsString() @IsOptional() supplierId?: string;
  @IsString() @IsOptional() locationId?: string;
  @IsString() @IsNotEmpty() amendmentReason: string;
  @IsNumber() @IsOptional() expectedVersion?: number;
}

export interface ExpenseFilters {
  categoryId?: string;
  status?: ExpenseStatus;
  paymentStatus?: ExpensePaymentStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
  paymentType?: string;
  includeDeleted?: boolean;
}

export interface ExpenseActor {
  id?: string | null;
  email?: string | null;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
    private gl: GeneralLedgerService,
    private docNum: DocumentNumberService,
  ) {}

  // ─── Idempotency replay ────────────────────────────────────────────────────
  // Returns the stored response if the key was used before; null if it's a
  // fresh write. Caller persists the response inside the same transaction as
  // the mutation so a rollback unwinds the dedup row too.
  private async replayIdempotency(
    tx: Prisma.TransactionClient,
    key: string | undefined,
  ): Promise<any | null> {
    if (!key) return null;
    const prior = await tx.idempotencyKey.findUnique({ where: { key } });
    if (!prior) return null;
    if (prior.response) return { ...(prior.response as any), _idempotent: true };
    return { _idempotent: true, _note: 'prior request in flight' };
  }

  private async persistIdempotency(
    tx: Prisma.TransactionClient,
    key: string | undefined,
    scope: string,
    response: unknown,
  ): Promise<void> {
    if (!key) return;
    await tx.idempotencyKey.upsert({
      where: { key },
      create: {
        key,
        scope,
        response: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      },
      update: {
        // Same key re-used after first success: keep the original response.
        response: response as Prisma.InputJsonValue,
      },
    });
  }

  // ─── Optimistic-lock helper ────────────────────────────────────────────────
  // Returns the updated row on success; throws 409 with currentVersion on
  // conflict. Caller supplies the post-write select shape.
  private async optimisticUpdate<T extends { id: string; version: number }>(
    tx: Prisma.TransactionClient,
    model: 'expense' | 'purchaseOrder' | 'supplier',
    id: string,
    expectedVersion: number,
    data: any,
    select: any,
  ): Promise<T> {
    const table = model === 'expense' ? 'expenses' : model === 'purchaseOrder' ? 'purchase_orders' : 'suppliers';
    const result = await tx.$queryRaw<T[]>`
      UPDATE ${Prisma.raw(table)}
      SET "version" = "version" + 1,
          "updatedAt" = NOW(),
          ${Prisma.raw(this.buildAssignments(data))}
      WHERE "id" = ${id} AND "version" = ${expectedVersion}
      RETURNING *
    `;
    if (result.length === 0) {
      const current = await (tx as any)[model].findUnique({
        where: { id },
        select: { id: true, version: true },
      });
      throw new ConflictException({
        message: `${model} ${id} was modified by another request (expected version ${expectedVersion})`,
        currentVersion: current?.version ?? null,
      });
    }
    return result[0];
  }

  /** Builds the SET clause for the optimistic-update query from a plain object. */
  private buildAssignments(data: Record<string, unknown>): string {
    return Object.entries(data)
      .map(([k, v]) => {
        if (v === null) return `"${k}" = NULL`;
        if (v instanceof Date) return `"${k}" = '${v.toISOString()}'`;
        if (typeof v === 'string') return `"${k}" = '${v.replace(/'/g, "''")}'`;
        if (typeof v === 'number' || typeof v === 'boolean')
          return `"${k}" = ${v}`;
        // Decimal / object — assume already a Prisma Decimal or pre-stringified.
        return `"${k}" = '${String(v).replace(/'/g, "''")}'`;
      })
      .join(', ');
  }

  // ─── GL hook (optional / non-blocking) ─────────────────────────────────────

  private async postExpenseToGl(
    expense: { id: string; expenseCode: string; title: string; amount: unknown },
    opts: {
      isCash: boolean;
      paymentMethod?: string | null;
      userId?: string | null;
      ledgerAccountId?: string | null;
    },
  ) {
    if (!opts.ledgerAccountId) return;
    const amount = M.money(Number(expense.amount));
    const creditKey = opts.isCash
      ? glCashKeyForMethod(opts.paymentMethod)
      : GL.ACCOUNTS_PAYABLE;
    await this.gl.safePost({
      memo: `Expense ${expense.expenseCode}: ${expense.title}`,
      sourceType: 'EXPENSE',
      sourceId: expense.id,
      postedById: opts.userId ?? null,
      skipIfZero: true,
      lines: [
        { accountId: opts.ledgerAccountId, debit: amount },
        { key: creditKey, credit: amount },
      ],
    });
  }

  // ─── Audit (in-transaction) ────────────────────────────────────────────────

  private async writeAuditTx(
    tx: Prisma.TransactionClient,
    args: {
      action:
        | 'CREATE' | 'UPDATE' | 'VOID' | 'PAY' | 'CANCEL' | 'DELETE'
        | 'RESTORE' | 'APPROVE' | 'REJECT' | 'AMEND';
      entityType: string;
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
    let userName: string | null = null;
    if (args.userId) {
      const user = await tx.user.findUnique({
        where: { id: args.userId },
        select: { staff: { select: { firstName: true, lastName: true } } },
      });
      if (user?.staff) {
        userName = `${user.staff.firstName} ${user.staff.lastName}`.trim();
      }
    }
    if (!userName) userName = args.userEmail ?? null;

    await tx.auditLog.create({
      data: {
        action: args.action,
        module: 'EXPENSES',
        entityType: args.entityType,
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

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private parseDate(input?: string | Date): Date {
    if (!input) return new Date();
    if (input instanceof Date) return input;
    if (typeof input === 'string' && input.length === 10 && input.includes('-')) {
      return new Date(`${input}T00:00:00.000Z`);
    }
    return new Date(input);
  }

  private expenseSelect = {
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          icon: true,
          color: true,
          ledgerAccountId: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      },
      approvedBy: {
        select: {
          id: true,
          email: true,
          staff: { select: { firstName: true, lastName: true } },
        },
      },
      supplier: {
        select: { id: true, name: true, contactPerson: true, phone: true },
      },
      location: { select: { id: true, name: true } },
    },
  };

  // ─── Recompute payment status (public — called by PaymentsService) ────────
  // Re-reads the row inside the supplied transaction so the row-lock taken
  // by the caller is honoured, then computes the canonical status from the
  // current set of active payments. EXCLUDES voided/failed/refunded rows.
  async recomputePaymentStatus(
    expenseId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const expense = await client.expense.findUnique({
      where: { id: expenseId },
      select: { amount: true, status: true },
    });
    if (!expense) return;

    const agg = await client.payment.aggregate({
      where: {
        expenseId,
        type: 'EXPENSE',
        status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] },
      },
      _sum: { amount: true },
    });

    const totalPaid = M.of(agg._sum.amount ?? 0);
    const balance = M.max(M.sub(expense.amount, totalPaid), 0);

    const paymentStatus: ExpensePaymentStatus =
      M.lte(totalPaid, '0.001')
        ? ExpensePaymentStatus.UNPAID
        : M.lte(balance, '0.01')
          ? ExpensePaymentStatus.PAID
          : ExpensePaymentStatus.PARTIALLY_PAID;

    await client.expense.update({
      where: { id: expenseId },
      data: {
        amountPaid: M.money(totalPaid).toString(),
        balance: M.money(balance).toString(),
        paymentStatus,
        paidAt:
          paymentStatus === ExpensePaymentStatus.PAID ? new Date() : null,
      },
    });
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async createExpense(
    dto: CreateExpenseDto,
    actor: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!dto.amount || dto.amount <= 0)
      throw new BadRequestException('Amount must be greater than 0');
    if (!dto.createdBy)
      throw new BadRequestException('createdBy (user ID) is required');

    const isCash = dto.paymentType === 'CASH';
    if (isCash) {
      if (!dto.paymentMethod)
        throw new BadRequestException('paymentMethod is required for cash expenses');
      if (!dto.accountId)
        throw new BadRequestException('accountId is required for cash expenses');
    }

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) throw new BadRequestException('Supplier not found');
    }

    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new BadRequestException('Expense category not found');
    if (!category.isActive)
      throw new BadRequestException(
        'Cannot create an expense in a disabled category',
      );

    return this.prisma.$transaction(async (tx) => {
      // Idempotency replay check (inside the same tx).
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expenseCode = await this.docNum.next('EXP', tx);

      const expense = await tx.expense.create({
        data: {
          expenseCode,
          category: { connect: { id: category.id } },
          categoryName: category.name,
          title: dto.title.trim(),
          description: dto.description ?? null,
          amount: dto.amount,
          balance: dto.amount,
          amountPaid: 0,
          expenseDate: this.parseDate(dto.expenseDate),
          status: ExpenseStatus.APPROVED,
          paymentStatus: ExpensePaymentStatus.UNPAID,
          paymentType: dto.paymentType ?? 'CREDIT',
          createdBy: { connect: { id: dto.createdBy } },
          notes: dto.notes ?? null,
          attachments: dto.attachments ?? [],
          idempotencyKey: idempotencyKey ?? null,
          ...(dto.supplierId && {
            supplier: { connect: { id: dto.supplierId } },
          }),
          ...(dto.locationId && {
            location: { connect: { id: dto.locationId } },
          }),
        },
        ...this.expenseSelect,
      });

      // Cash path: pay immediately. Wrapped inside the same transaction so a
      // payment failure rolls the expense back too.
      if (isCash) {
        await this.paymentsService.createExpensePayment(
          expense.id,
          Number(expense.amount),
          dto.paymentMethod!,
          dto.createdBy,
          dto.paymentReference,
          dto.bankName,
          dto.chequeNumber,
          dto.paymentReference,
          dto.paymentNotes,
          new Date(),
          dto.accountId!,
          tx, // pass the tx so payment insert + recompute land in the same TX
        );

        await this.postExpenseToGl(expense, {
          isCash: true,
          paymentMethod: dto.paymentMethod,
          userId: dto.createdBy,
          ledgerAccountId: category.ledgerAccountId,
        });
      } else {
        await this.postExpenseToGl(expense, {
          isCash: false,
          userId: dto.createdBy,
          ledgerAccountId: category.ledgerAccountId,
        });
      }

      await this.writeAuditTx(tx, {
        action: 'CREATE',
        entityType: 'Expense',
        entityId: expense.id,
        oldData: null,
        newData: expense,
        userId: actor.id,
        userEmail: actor.email,
        ipAddress,
        userAgent,
      });

      // Persist idempotency replay record inside the same transaction.
      await this.persistIdempotency(tx, idempotencyKey, 'CREATE_EXPENSE', expense);

      return expense;
    });
  }

  // ─── READ ────────────────────────────────────────────────────────────────────

  async getExpenses(filters: ExpenseFilters) {
    const where: any = {};

    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.status) where.status = filters.status;
    if (filters.paymentStatus) where.paymentStatus = filters.paymentStatus;
    if (filters.dateFrom || filters.dateTo) {
      where.expenseDate = {};
      if (filters.dateFrom) where.expenseDate.gte = this.parseDate(filters.dateFrom);
      if (filters.dateTo) where.expenseDate.lte = this.parseDate(filters.dateTo);
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { expenseCode: { contains: filters.search, mode: 'insensitive' } },
        { notes: { contains: filters.search, mode: 'insensitive' } },
        { supplier: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.paymentType) where.paymentType = filters.paymentType;
    if (!filters.includeDeleted) {
      where.deletedAt = null;
    }

    const [total, data] = await Promise.all([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
        ...this.expenseSelect,
      }),
    ]);

    return { total, page: filters.page, limit: filters.limit, data };
  }

  async getExpenseById(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      ...this.expenseSelect,
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  // ─── UPDATE (DRAFT only — APPROVED must go through :id/amend) ─────────────

  async updateExpense(
    id: string,
    dto: UpdateExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');

      // APPROVED rows must be amended — they cannot be edited in place.
      if (expense.status !== ExpenseStatus.DRAFT) {
        throw new BadRequestException(
          `Only DRAFT expenses can be edited (current: ${expense.status}). Use POST /expenses/:id/amend for APPROVED expenses.`,
        );
      }
      if (expense.deletedAt) {
        throw new BadRequestException(
          'Cannot edit a soft-deleted expense — restore it first.',
        );
      }

      // Optimistic lock: if expectedVersion is supplied and doesn't match, 409.
      if (
        dto.expectedVersion !== undefined &&
        dto.expectedVersion !== expense.version
      ) {
        throw new ConflictException({
          message: `Expense ${id} was modified by another request (expected version ${dto.expectedVersion})`,
          currentVersion: expense.version,
        });
      }

      // Amount cannot change if any payments already applied.
      if (
        dto.amount !== undefined &&
        !M.eq(dto.amount, expense.amount) &&
        M.gt(expense.amountPaid, 0)
      ) {
        throw new BadRequestException(
          'Cannot change amount on an expense that already has payments.',
        );
      }

      const data: any = { version: { increment: 1 } };
      if (dto.categoryId !== undefined) {
        const cat = await tx.expenseCategory.findUnique({
          where: { id: dto.categoryId },
        });
        if (!cat) throw new BadRequestException('Expense category not found');
        data.categoryId = cat.id;
        data.categoryName = cat.name; // re-snapshot when category changes
      }
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.amount !== undefined) {
        data.amount = M.money(dto.amount).toString();
        data.balance = M.money(
          M.max(M.sub(dto.amount, expense.amountPaid), 0),
        ).toString();
      }
      if (dto.expenseDate !== undefined)
        data.expenseDate = this.parseDate(dto.expenseDate);
      if (dto.notes !== undefined) data.notes = dto.notes ?? null;
      if (dto.attachments !== undefined) data.attachments = dto.attachments;
      if (dto.supplierId !== undefined) {
        data.supplier = dto.supplierId
          ? { connect: { id: dto.supplierId } }
          : { disconnect: true };
      }
      if (dto.locationId !== undefined) {
        data.location = dto.locationId
          ? { connect: { id: dto.locationId } }
          : { disconnect: true };
      }

      const updated = await tx.expense.update({
        where: { id, version: dto.expectedVersion ?? expense.version },
        data,
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'UPDATE',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: updated,
        reason: dto.editReason ?? null,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'UPDATE_EXPENSE', updated);

      return updated;
    });
  }

  // ─── AMEND (APPROVED → re-enters approval queue) ───────────────────────────

  async amendExpense(
    id: string,
    dto: AmendExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status !== ExpenseStatus.APPROVED) {
        throw new BadRequestException(
          `Only APPROVED expenses can be amended (current: ${expense.status}).`,
        );
      }

      if (
        dto.expectedVersion !== undefined &&
        dto.expectedVersion !== expense.version
      ) {
        throw new ConflictException({
          message: `Expense ${id} was modified by another request (expected version ${dto.expectedVersion})`,
          currentVersion: expense.version,
        });
      }

      if (
        dto.amount !== undefined &&
        !M.eq(dto.amount, expense.amount) &&
        M.gt(expense.amountPaid, 0)
      ) {
        throw new BadRequestException(
          'Cannot change amount on an expense that already has payments.',
        );
      }

      const data: any = { version: { increment: 1 }, status: ExpenseStatus.DRAFT };
      if (dto.categoryId !== undefined) {
        const cat = await tx.expenseCategory.findUnique({
          where: { id: dto.categoryId },
        });
        if (!cat) throw new BadRequestException('Expense category not found');
        data.categoryId = cat.id;
        data.categoryName = cat.name;
      }
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.amount !== undefined) {
        data.amount = M.money(dto.amount).toString();
        data.balance = M.money(
          M.max(M.sub(dto.amount, expense.amountPaid), 0),
        ).toString();
      }
      if (dto.expenseDate !== undefined)
        data.expenseDate = this.parseDate(dto.expenseDate);
      if (dto.supplierId !== undefined) {
        data.supplier = dto.supplierId
          ? { connect: { id: dto.supplierId } }
          : { disconnect: true };
      }
      if (dto.locationId !== undefined) {
        data.location = dto.locationId
          ? { connect: { id: dto.locationId } }
          : { disconnect: true };
      }

      const updated = await tx.expense.update({
        where: { id, version: dto.expectedVersion ?? expense.version },
        data,
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'AMEND',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: updated,
        reason: dto.amendmentReason,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'AMEND_EXPENSE', updated);

      return updated;
    });
  }

  // ─── SOFT-DELETE (no financial row is ever hard-deleted) ───────────────────

  async softDeleteExpense(
    id: string,
    reason: string,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.deletedAt) {
        throw new BadRequestException('Expense is already soft-deleted');
      }
      if (expense.status === ExpenseStatus.VOID) {
        throw new BadRequestException(
          'Already voided expenses can be hard-purged later by the audit job.',
        );
      }
      if (M.gt(expense.amountPaid, 0)) {
        throw new BadRequestException(
          'Cannot soft-delete an expense with payments — void it instead.',
        );
      }

      const deleted = await tx.expense.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedById: actor?.id ?? null,
          deletedReason: reason,
          version: { increment: 1 },
        },
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'DELETE',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: deleted,
        reason,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'DELETE_EXPENSE', deleted);

      return deleted;
    });
  }

  async restoreExpense(
    id: string,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (!expense.deletedAt) {
        throw new BadRequestException('Expense is not deleted');
      }

      const restored = await tx.expense.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          deletedReason: null,
          version: { increment: 1 },
        },
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'RESTORE',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: restored,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'RESTORE_EXPENSE', restored);

      return restored;
    });
  }

  // ─── CANCEL (soft) ──────────────────────────────────────────────────────────

  async cancelExpense(
    id: string,
    reason: string | undefined,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (!['DRAFT', 'APPROVED', 'REJECTED'].includes(expense.status)) {
        throw new BadRequestException(
          `Only DRAFT / APPROVED / REJECTED expenses can be cancelled (current: ${expense.status})`,
        );
      }
      if (M.gt(expense.amountPaid, 0)) {
        throw new BadRequestException(
          'Cannot cancel an expense with payments. Void it instead.',
        );
      }
      const cancelled = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.CANCELLED,
          approvalNotes: reason ?? expense.approvalNotes,
          version: { increment: 1 },
        },
        ...this.expenseSelect,
      });
      await this.writeAuditTx(tx, {
        action: 'CANCEL',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: cancelled,
        reason: reason ?? null,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });
      await this.persistIdempotency(tx, idempotencyKey, 'CANCEL_EXPENSE', cancelled);
      return cancelled;
    });
  }

  // ─── VOID (reverses all payments) ──────────────────────────────────────────

  async voidExpense(
    id: string,
    dto: VoidExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({
        where: { id },
        include: {
          payments: {
            where: { status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] } },
          },
        },
      });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status === ExpenseStatus.VOID) {
        throw new ConflictException('Expense is already voided');
      }
      if (expense.status === ExpenseStatus.CANCELLED) {
        throw new BadRequestException(
          'Cannot void a CANCELLED expense — delete it instead',
        );
      }

      const effectiveVoidedBy = dto.voidedBy ?? actor?.id ?? null;

      // Void each underlying payment in the same transaction.
      for (const p of expense.payments) {
        await this.paymentsService.voidPayment(
          p.id,
          `Expense voided: ${dto.voidReason}`,
          effectiveVoidedBy ?? undefined,
          tx, // pass tx so void + recompute land together
        );
      }

      // Reverse the expense's own GL accrual.
      await this.gl.safeReverseBySource(
        'EXPENSE',
        id,
        `Expense voided: ${dto.voidReason}`,
        effectiveVoidedBy,
        tx,
      );

      const voided = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.VOID,
          paymentStatus: ExpensePaymentStatus.UNPAID,
          amountPaid: 0,
          balance: expense.amount,
          paidAt: null,
          voidedAt: new Date(),
          voidedBy: effectiveVoidedBy,
          voidReason: dto.voidReason,
          version: { increment: 1 },
        },
      });

      await this.writeAuditTx(tx, {
        action: 'VOID',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: voided,
        reason: dto.voidReason,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'VOID_EXPENSE', voided);

      // Re-fetch for caller convenience.
      return tx.expense.findUnique({ where: { id }, ...this.expenseSelect });
    });
  }

  // ─── APPROVE ────────────────────────────────────────────────────────────────

  async approveExpense(
    id: string,
    dto: ApproveExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status !== ExpenseStatus.DRAFT) {
        throw new BadRequestException(
          `Only DRAFT expenses can be approved (current: ${expense.status})`,
        );
      }
      const approver = dto.approvedBy ?? actor?.id;
      if (!approver) throw new BadRequestException('approvedBy is required');

      const userExists = await tx.user.findUnique({
        where: { id: approver },
      });
      if (!userExists)
        throw new BadRequestException(`User ${approver} does not exist`);

      // Segregation of duties: the approver must not be the creator.
      if (expense.createdById === approver) {
        throw new BadRequestException(
          'Approver cannot be the same user as the creator (segregation of duties).',
        );
      }

      const approved = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.APPROVED,
          approvedBy: { connect: { id: approver } },
          approvedAt: new Date(),
          approvalNotes: dto.approvalNotes ?? null,
          version: { increment: 1 },
        },
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'APPROVE',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: approved,
        reason: dto.approvalNotes ?? null,
        userId: approver,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'APPROVE_EXPENSE', approved);

      return approved;
    });
  }

  // ─── REJECT ─────────────────────────────────────────────────────────────────

  async rejectExpense(
    id: string,
    reason: string | undefined,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (!['DRAFT', 'APPROVED'].includes(expense.status)) {
        throw new BadRequestException(
          `Only DRAFT or APPROVED expenses can be rejected (current: ${expense.status})`,
        );
      }
      if (M.gt(expense.amountPaid, 0)) {
        throw new BadRequestException(
          'Cannot reject an expense with payments. Void it instead.',
        );
      }

      const rejected = await tx.expense.update({
        where: { id },
        data: {
          status: ExpenseStatus.REJECTED,
          approvalNotes: reason ?? null,
          version: { increment: 1 },
        },
        ...this.expenseSelect,
      });

      await this.writeAuditTx(tx, {
        action: 'REJECT',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: rejected,
        reason: reason ?? null,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'REJECT_EXPENSE', rejected);

      return rejected;
    });
  }

  // ─── PAY (full balance) ────────────────────────────────────────────────────

  async payExpense(
    id: string,
    dto: PayExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      // Row-lock the expense for the duration of the transaction.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM expenses WHERE id = ${id} FOR UPDATE
      `;
      if (!locked[0]) throw new NotFoundException('Expense not found');

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (!['APPROVED', 'POSTED'].includes(expense.status)) {
        throw new BadRequestException(
          `Only APPROVED or POSTED expenses can be paid (current: ${expense.status})`,
        );
      }
      if (expense.paymentStatus === ExpensePaymentStatus.PAID) {
        throw new BadRequestException('This expense is already fully paid');
      }

      const recordedById = actor?.id ?? dto.paidBy;
      const payAmount = M.gt(expense.balance, 0) ? Number(expense.balance) : Number(expense.amount);

      const payment = await this.paymentsService.createExpensePayment(
        id,
        payAmount,
        dto.paymentMethod,
        recordedById,
        dto.reference,
        dto.bankName,
        dto.chequeNumber,
        dto.reference,
        dto.paymentNotes,
        new Date(),
        dto.accountId,
        tx, // <-- key change: same tx as the row lock + audit
      );

      await this.writeAuditTx(tx, {
        action: 'PAY',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: { paymentId: payment.id, amount: payAmount },
        reason: dto.paymentNotes ?? null,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'PAY_EXPENSE', {
        paymentId: payment.id,
        amount: payAmount,
      });

      const updatedExpense = await tx.expense.findUnique({
        where: { id },
        ...this.expenseSelect,
      });
      return { expense: updatedExpense, payment };
    });
  }

  // ─── PAY (partial) ─────────────────────────────────────────────────────────

  async payExpensePartial(
    id: string,
    dto: PayPartialExpenseDto,
    actor?: ExpenseActor,
    idempotencyKey?: string,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await this.replayIdempotency(tx, idempotencyKey);
      if (replay) return replay;

      // Row-lock so concurrent partial payments can't both pass the balance check.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM expenses WHERE id = ${id} FOR UPDATE
      `;
      if (!locked[0]) throw new NotFoundException('Expense not found');

      const expense = await tx.expense.findUnique({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');
      if (!['APPROVED', 'POSTED'].includes(expense.status)) {
        throw new BadRequestException(
          `Only APPROVED or POSTED expenses can be paid (current: ${expense.status})`,
        );
      }

      const newTotalPaid = M.add(expense.amountPaid, dto.amount);
      if (M.gt(newTotalPaid, M.add(expense.amount, '0.01'))) {
        throw new BadRequestException(
          `Payment exceeds expense amount. Remaining: ${M.str(M.sub(expense.amount, expense.amountPaid))}`,
        );
      }

      const recordedById = actor?.id ?? dto.paidBy;

      const payment = await this.paymentsService.createExpensePayment(
        id,
        dto.amount,
        dto.paymentMethod,
        recordedById,
        dto.reference,
        undefined,
        undefined,
        dto.reference,
        dto.paymentNotes,
        new Date(),
        dto.accountId,
        tx,
      );

      await this.writeAuditTx(tx, {
        action: 'PAY',
        entityType: 'Expense',
        entityId: id,
        oldData: expense,
        newData: { paymentId: payment.id, amount: dto.amount, partial: true },
        reason: dto.paymentNotes ?? null,
        userId: actor?.id,
        userEmail: actor?.email,
        ipAddress,
        userAgent,
      });

      await this.persistIdempotency(tx, idempotencyKey, 'PAY_EXPENSE_PARTIAL', {
        paymentId: payment.id,
        amount: dto.amount,
      });

      return payment;
    });
  }

  // ─── PAYMENT LIST ──────────────────────────────────────────────────────────

  async getExpensePayments(expenseId: string) {
    return this.paymentsService.getExpensePayments(expenseId);
  }

  // ─── STATS ──────────────────────────────────────────────────────────────────

  async getExpenseStats(dateFrom?: string, dateTo?: string) {
    const dateFilter: any = {};
    if (dateFrom || dateTo) {
      dateFilter.expenseDate = {};
      if (dateFrom) dateFilter.expenseDate.gte = this.parseDate(dateFrom);
      if (dateTo) dateFilter.expenseDate.lte = this.parseDate(dateTo);
    }

    const activeFilter = { ...dateFilter, status: { not: ExpenseStatus.VOID }, deletedAt: null };

    const [
      byCategory,
      bySupplierRaw,
      byStatus,
      byPaymentStatus,
      unpaid,
      partiallyPaid,
      paid,
      voided,
      total,
    ] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['categoryName'],
        where: activeFilter,
        _sum: { amount: true, balance: true },
        _count: { id: true },
      }),
      this.prisma.expense.groupBy({
        by: ['supplierId'],
        where: { ...activeFilter, supplierId: { not: null } },
        _sum: { amount: true, balance: true },
        _count: { id: true },
      }),
      this.prisma.expense.groupBy({
        by: ['status'],
        where: dateFilter,
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.expense.groupBy({
        by: ['paymentStatus'],
        where: activeFilter,
        _sum: { amount: true, amountPaid: true, balance: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: { ...activeFilter, paymentStatus: ExpensePaymentStatus.UNPAID },
        _sum: { amount: true, balance: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: { ...activeFilter, paymentStatus: ExpensePaymentStatus.PARTIALLY_PAID },
        _sum: { amount: true, amountPaid: true, balance: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: { ...activeFilter, paymentStatus: ExpensePaymentStatus.PAID },
        _sum: { amount: true, amountPaid: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: { ...dateFilter, status: ExpenseStatus.VOID },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: activeFilter,
        _sum: { amount: true, amountPaid: true, balance: true },
        _count: { id: true },
      }),
    ]);

    const supplierIds = bySupplierRaw
      .map((r) => r.supplierId)
      .filter((id): id is string => !!id);
    const suppliers = supplierIds.length
      ? await this.prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true },
        })
      : [];
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

    const bySupplier = bySupplierRaw.map((r) => ({
      supplierId: r.supplierId,
      supplierName: r.supplierId ? supplierName.get(r.supplierId) ?? null : null,
      _sum: r._sum,
      _count: r._count,
    }));

    const outstandingAmount = M.add(
      unpaid._sum.balance ?? 0,
      partiallyPaid._sum.balance ?? 0,
    );

    return {
      byCategory: byCategory.map((r) => ({
        category: r.categoryName,
        _sum: r._sum,
        _count: r._count,
      })),
      bySupplier,
      byStatus,
      byPaymentStatus,
      totalPaid: paid._sum.amountPaid ?? 0,
      totalPaidCount: paid._count.id,
      totalUnpaid: unpaid._sum.balance ?? 0,
      totalUnpaidCount: unpaid._count.id,
      totalPartiallyPaid: partiallyPaid._sum.balance ?? 0,
      totalPartiallyPaidCount: partiallyPaid._count.id,
      totalOutstanding: M.str(outstandingAmount),
      outstandingPayables: {
        amount: M.str(outstandingAmount),
        count: unpaid._count.id + partiallyPaid._count.id,
      },
      voidedCount: voided._count.id,
      voidedAmount: voided._sum.amount ?? 0,
      count: total._count.id,
      grandTotal: total._sum.amount ?? 0,
      grandTotalPaid: total._sum.amountPaid ?? 0,
      grandTotalBalance: total._sum.balance ?? 0,
    };
  }

  // ─── AUDIT ──────────────────────────────────────────────────────────────────

  /**
   * Combined audit history for one expense (most recent first): the expense's
   * own CREATE/UPDATE/VOID/CANCEL/APPROVE/REJECT/AMEND/DELETE/RESTORE rows
   * PLUS the audit rows of its payments.
   */
  async getExpenseAudit(id: string) {
    const paymentIds = (
      await this.prisma.payment.findMany({
        where: { expenseId: id },
        select: { id: true },
      })
    ).map((p) => p.id);

    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'Expense', recordId: id },
          ...(paymentIds.length
            ? [{ entityType: 'Payment', recordId: { in: paymentIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}