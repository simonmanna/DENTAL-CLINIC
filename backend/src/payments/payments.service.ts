// src/payments/payments.service.ts
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
  Prisma,
  PaymentType,
  CashFlowDirection,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { PaymentFilterDto } from './dto/payment-filter.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { ExpensesService } from '../expenses/expenses.service';
import { M } from '../common/money/money';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { GeneralLedgerService, GL } from '../general-ledger/general-ledger.service';
import { glCashKeyForMethod } from '../general-ledger/gl-accounts';
import { ClientContext } from '../common/audit/client-context';

// Retained for non-document internal codes (e.g. cash-flow entries) that are not
// part of the PREFIX-YY-NNNN human-readable document namespace.
function genCode(prefix: string) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${timestamp}${random}`;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expensesService: ExpensesService,
    private readonly docNum: DocumentNumberService,
    private readonly gl: GeneralLedgerService,
  ) {}

  /**
   * Idempotency replay lookup — if a payment was already created (or
   * voided) under this key, return the stored response with the
   * `_idempotent: true` flag. Returns null if no prior request exists.
   */
  async findExistingByIdempotencyKey(key: string): Promise<any | null> {
    const prior = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!prior?.response) return null;
    return { ...(prior.response as any), _idempotent: true };
  }

  async findAll(filters: PaymentFilterDto) {
    const {
      search,
      type,
      direction,
      method,
      status,
      fromDate,
      toDate,
      page,
      limit,
    } = filters;

    const take = limit || 20;
    const skip = ((page || 1) - 1) * take;

    const where: Prisma.PaymentWhereInput = {
      AND: [
        type ? { type } : {},
        direction ? { direction } : {},
        method ? { method } : {},
        status ? { status } : {},
        fromDate || toDate
          ? {
              paidAt: {
                ...(fromDate ? { gte: new Date(fromDate) } : {}),
                ...(toDate ? { lte: new Date(toDate) } : {}),
              },
            }
          : {},
        search
          ? {
              OR: [
                { paymentCode: { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } },
                { transactionId: { contains: search, mode: 'insensitive' } },
                {
                  invoice: {
                    invoiceNumber: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  purchaseOrder: {
                    poNumber: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  expense: {
                    expenseCode: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {},
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              patient: { select: { firstName: true, lastName: true } },
            },
          },
          purchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              supplier: { select: { name: true } },
            },
          },
          expense: {
            select: {
              id: true,
              expenseCode: true,
              title: true,
              category: true,
            },
          },
          receipts: { select: { id: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        receiptCount: p.receipts.length,
        receipts: undefined, // strip array for list payload
      })),
      meta: {
        total,
        page: page || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }


  // ─────────────────────────────────────────────
  // PURCHASE ORDER PAYMENTS
  // ─────────────────────────────────────────────

  async createPurchaseOrderPayment(
      purchaseOrderId: string,
      amount: number,
      method: PaymentMethod,
      userId: string,
      reference?: string,
      bankName?: string,
      chequeNumber?: string,
      transactionId?: string,
      notes?: string,
      paidAt?: Date,
      accountId?: string,
      tx?: Prisma.TransactionClient, // <-- optional outer-TX (for row-locked callers)
      clientCtx?: ClientContext,       // <-- ipAddress/userAgent for audit
      actorName?: string | null,       // <-- denormalised display name for audit
    ) {
      const client = tx ?? this.prisma;

      if (tx) {
        // Row-lock the PO for the duration of the caller's transaction.
        await client.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${purchaseOrderId} FOR UPDATE`;
      }

      const po = await client.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
      });

      if (!po) throw new NotFoundException('Purchase order not found');
      if (po.paymentStatus === 'PAID') {
        throw new BadRequestException('This order is already fully paid');
      }
      if (M.gt(amount, M.add(po.balance, '0.01'))) {
        throw new BadRequestException(
          `Payment exceeds balance. Balance: ${M.str(po.balance)}`,
        );
      }

      const run = async (useTx: Prisma.TransactionClient) => {
        const payment = await useTx.payment.create({
          data: {
            paymentCode: await this.docNum.next('PAY', useTx),
            type: PaymentType.PURCHASE_ORDER,
            direction: CashFlowDirection.OUT,
            purchaseOrderId,
            amount: M.money(amount).toString(),
            method,
            status: 'COMPLETED',
            reference,
            bankName,
            chequeNumber,
            transactionId,
            notes,
            currency: 'UGX',
            exchangeRate: '1',
            baseAmount: M.money(amount).toString(),
            recordedById: userId,
            createdById: userId,
            updatedById: userId,
            paidAt: paidAt || new Date(),
          },
        });

        const newAmountPaid = M.add(po.amountPaid, amount);
        const newBalance = M.sub(po.total, newAmountPaid);
        const paymentStatus = M.lte(newBalance, '0.01')
          ? 'PAID'
          : M.gt(newAmountPaid, 0)
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

        await useTx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            amountPaid: M.money(newAmountPaid).toString(),
            balance: M.money(M.max(newBalance, 0)).toString(),
            paymentStatus,
            version: { increment: 1 },
          },
        });

        await this.writeAudit(
          'CREATE',
          payment.id,
          null,
          payment,
          { id: userId, userName: actorName ?? null, email: null },
          undefined,
          clientCtx,
          useTx,
        );

        return payment;
      };

      return tx ? run(tx) : this.prisma.$transaction(run);
    }

  // ─────────────────────────────────────────────
  // EXPENSE PAYMENTS
  // ─────────────────────────────────────────────

  async createExpensePayment(
    expenseId: string,
    amount: number,
    method: PaymentMethod,
    userId: string,
    reference?: string,
    bankName?: string,
    chequeNumber?: string,
    transactionId?: string,
    notes?: string,
    paidAt?: Date,
    accountId?: string,
    tx?: Prisma.TransactionClient, // <-- optional outer-TX (for row-locked callers)
    clientCtx?: ClientContext,       // <-- ipAddress/userAgent for audit
    actorName?: string | null,       // <-- denormalised display name for audit
    ) {
    const client = tx ?? this.prisma;

    // If the caller opened a transaction, the row lock should already be held.
    // We re-fetch the expense and do the balance check inside the same client
    // so the check sees the locked row.
    const expense = await client.expense.findUnique({
      where: { id: expenseId },
    });

    if (!expense) throw new NotFoundException('Expense not found');

    if (['VOID', 'CANCELLED', 'REJECTED'].includes(expense.status as string)) {
      throw new BadRequestException(`Cannot pay a ${expense.status} expense`);
    }

    if (expense.paymentStatus === 'PAID') {
      throw new BadRequestException('This expense is already fully paid');
    }

    const remaining = M.sub(expense.amount ?? 0, expense.amountPaid ?? 0);
    if (M.gt(amount, M.add(remaining, '0.01'))) {
      throw new BadRequestException(
        `Payment exceeds expense remaining balance. Remaining: ${M.str(remaining)}`,
      );
    }

    const run = async (useTx: Prisma.TransactionClient) => {
      const payment = await useTx.payment.create({
        data: {
          paymentCode: await this.docNum.next('PAY', useTx),
          type: PaymentType.EXPENSE,
          direction: CashFlowDirection.OUT,
          expenseId,
          amount,
          method,
          status: 'COMPLETED',
          reference,
          bankName,
          chequeNumber,
          transactionId,
          notes,
          currency: 'UGX',
          exchangeRate: 1,
          baseAmount: amount,
          recordedById: userId,
          paidAt: paidAt || new Date(),
        },
      });

      // Recompute inside the same TX so the read-modify-write is atomic.
      await this.expensesService.recomputePaymentStatus(expenseId, useTx);

      // ACC-2: clear Accounts Payable when a CREDIT expense is paid.
      if (
        expense.paymentType !== 'CASH' &&
        (await this.gl.hasPostedEntry('EXPENSE', expenseId, useTx))
      ) {
        await this.gl.safePost({
          memo: `Expense payment ${payment.paymentCode} for ${expense.expenseCode}`,
          sourceType: 'EXPENSE_PAYMENT',
          sourceId: payment.id,
          postedById: userId ?? null,
          skipIfZero: true,
          lines: [
            { key: GL.ACCOUNTS_PAYABLE, debit: M.money(amount) },
            { key: glCashKeyForMethod(method), credit: M.money(amount) },
          ],
        });
      }

      await this.writeAudit(
        'CREATE',
        payment.id,
        null,
        payment,
        { id: userId, userName: actorName ?? null, email: null },
        undefined,
        clientCtx,
        useTx,
      );

      return payment;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
    }

  // ─────────────────────────────────────────────
  // VOID PAYMENT
  // ─────────────────────────────────────────────

  async voidPayment(
    id: string,
    voidReason: string,
    voidedBy?: string,
    tx?: Prisma.TransactionClient, // <-- optional outer-TX (for atomic voids)
    clientCtx?: ClientContext,       // <-- ipAddress/userAgent for audit
    voidedByName?: string | null,    // <-- denormalised user name for audit row
    ) {
    const client = tx ?? this.prisma;

    const payment = await client.payment.findUnique({
      where: { id },
      include: {
        expense: { select: { id: true, status: true } },
        purchaseOrder: {
          select: { id: true, amountPaid: true, total: true },
        },
        invoice: { select: { id: true } },
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'VOIDED' || payment.status === 'REFUNDED') {
      throw new ConflictException('Payment is already voided');
    }

    if (payment.type === PaymentType.INVOICE_RECEIPT) {
      throw new BadRequestException(
        'Invoice receipt payments must be voided via the receipt void endpoint',
      );
    }

    // 1. Mark payment as VOIDED
    await client.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.VOIDED,
        voidedAt: new Date(),
        voidedBy: voidedBy ?? null,
        voidReason,
      },
    });

    // 2. Roll back the source document's amountPaid / paymentStatus
    if (payment.type === PaymentType.EXPENSE && payment.expense) {
      await this.expensesService.recomputePaymentStatus(
        payment.expense.id,
        client as Prisma.TransactionClient,
      );
    } else if (
      payment.type === PaymentType.PURCHASE_ORDER &&
      payment.purchaseOrder
    ) {
      await this.recomputePurchaseOrderPaymentStatus(
        payment.purchaseOrder.id,
        client as Prisma.TransactionClient,
      );
    }

    // 3. Reverse the settlement journal entry (DR A/P · CR Cash) so the books
    // stay balanced. No-op when nothing was posted.
    await this.gl.safeReverseBySource(
      'EXPENSE_PAYMENT',
      id,
      `Payment voided: ${voidReason}`,
      voidedBy ?? null,
      client as Prisma.TransactionClient,
    );

    await this.writeAudit(
      'VOID',
      id,
      { status: payment.status },
      { status: PaymentStatus.VOIDED },
      { id: voidedBy ?? null, userName: voidedByName ?? null, email: null },
      voidReason,
      clientCtx,
      client as Prisma.TransactionClient,
    );

    return this.getPayment(id);
    }

  // ─────────────────────────────────────────────
  // DELETE PAYMENT (hard)
  // ─────────────────────────────────────────────

  async deletePayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { _count: { select: { receipts: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status !== 'VOIDED') {
      throw new BadRequestException(
        'Only voided payments can be deleted. Void it first, then delete.',
      );
    }
    if (payment._count.receipts > 0) {
      throw new BadRequestException(
        'Payment has receipts attached — void the receipts first.',
      );
    }

    return this.prisma.payment.delete({ where: { id } });
  }

  // ─────────────────────────────────────────────
  // Recompute purchase order paymentStatus from active payments
  // ─────────────────────────────────────────────
  private async recomputePurchaseOrderPaymentStatus(
    purchaseOrderId: string,
    tx?: Prisma.TransactionClient,
    ) {
    const client = tx ?? this.prisma;
    const po = await client.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { total: true },
    });
    if (!po) return;

    const agg = await client.payment.aggregate({
      where: {
        purchaseOrderId,
        type: PaymentType.PURCHASE_ORDER,
        status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] },
      },
      _sum: { amount: true },
    });
    const totalPaid = M.of(agg._sum.amount ?? 0);
    const balance = M.max(M.sub(po.total, totalPaid), 0);
    const paymentStatus =
      M.lte(balance, '0.01') && M.gt(totalPaid, 0)
        ? 'PAID'
        : M.gt(totalPaid, 0)
          ? 'PARTIALLY_PAID'
          : 'UNPAID';

    await client.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        amountPaid: M.money(totalPaid).toString(),
        balance: M.money(balance).toString(),
        paymentStatus: paymentStatus as any,
        version: { increment: 1 },
      },
    });
    }

  // ─────────────────────────────────────────────
  // GET PAYMENTS
  // ─────────────────────────────────────────────

  async getPurchaseOrderPayments(purchaseOrderId: string) {
    return this.prisma.payment.findMany({
      where: {
        purchaseOrderId: purchaseOrderId,
        type: PaymentType.PURCHASE_ORDER,
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  async getExpensePayments(expenseId: string) {
    return this.prisma.payment.findMany({
      where: {
        expenseId: expenseId,
        type: PaymentType.EXPENSE,
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
        purchaseOrder: {
          include: {
            supplier: true,
          },
        },
        expense: true,
      },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  // ─────────────────────────────────────────────
  // CASH FLOW ENTRIES WITH PAYMENTS
  // ─────────────────────────────────────────────

  async getCashFlowEntriesWithPayments(
    page: number = 1,
    limit: number = 50,
    type?: PaymentType,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      ...(type && { type }),
    };

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paidAt: 'desc' },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              patient: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          purchaseOrder: {
            select: {
              poNumber: true,
              supplier: {
                select: {
                  name: true,
                },
              },
            },
          },
          expense: {
            select: {
              expenseCode: true,
              title: true,
              category: true,
              amount: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Money movements are now read directly from the payment ledger.
    const transformedEntries = payments.map((p) => ({
      id: p.id,
      entryCode: p.paymentCode,
      account: null as string | null,
      direction: p.direction,
      amount: p.amount,
      currency: p.currency,
      description: p.notes ?? null,
      entryDate: p.paidAt ?? p.createdAt,
      contextLabel:
        p.purchaseOrder?.poNumber ||
        p.expense?.expenseCode ||
        p.invoice?.invoiceNumber,
      party:
        p.purchaseOrder?.supplier?.name ||
        p.expense?.title ||
        (p.invoice?.patient
          ? `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}`
          : null),
      paymentMethod: p.method,
      reference: p.reference,
      notes: p.notes,
    }));

    return {
      data: transformedEntries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─────────────────────────────────────────────
  // UTILITY METHODS
  // ─────────────────────────────────────────────

  async getPaymentSummary(purchaseOrderId?: string, expenseId?: string) {
    if (purchaseOrderId) {
      // FIX RPT-VOID: exclude VOIDED/FAILED/REFUNDED from the totalPaid sum
      // so the summary doesn't over-state the amount after a void.
      const payments = await this.prisma.payment.findMany({
        where: {
          purchaseOrderId,
          status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] },
        },
        orderBy: { paidAt: 'desc' },
      });

      const totalPaid = payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      return {
        payments,
        totalPaid,
        paymentCount: payments.length,
      };
    }

    if (expenseId) {
      const payments = await this.prisma.payment.findMany({
        where: {
          expenseId,
          status: { notIn: ['VOIDED', 'FAILED', 'REFUNDED'] },
        },
        orderBy: { paidAt: 'desc' },
      });

      const totalPaid = payments.reduce(
        (sum, p) => sum + Number(p.amount),
        0,
      );

      return {
        payments,
        totalPaid,
        paymentCount: payments.length,
      };
    }

    throw new BadRequestException(
      'Either purchaseOrderId or expenseId must be provided',
    );
    }

  // ─────────────────────────────────────────────
  // AUDIT TRAIL
  // ─────────────────────────────────────────────

  /**
   * Append-only audit row for a payment state change.
   *
   * Failure mode (post-hardening):
   *   - Errors are logged via Nest Logger at `error` level (was: `console.warn`,
   *     which silently dropped them). Never rethrown inside a transaction —
   *     the financial change must commit; the audit row is best-effort but
   *     its failure is now loud in the log stream for monitoring/alerting.
   *   - `userName` is preferred over `email` so historical audit rows show
   *     the human-readable actor; `email` remains a fallback for legacy callers.
   *   - `ipAddress` and `userAgent` come from `extractClientContext(req)` in
   *     the controller and are persisted alongside the row so investigators
   *     can trace a financial action to a network origin.
   */
  private async writeAudit(
    action: 'CREATE' | 'VOID' | 'DELETE',
    recordId: string,
    oldData: unknown,
    newData: unknown,
    actor?: { id?: string | null; userName?: string | null; email?: string | null },
    reason?: string,
    clientCtx?: ClientContext,
    tx?: Prisma.TransactionClient,
    ) {
    try {
      const client = tx ?? this.prisma;
      await client.auditLog.create({
        data: {
          userId: actor?.id ?? null,
          userName: actor?.userName ?? actor?.email ?? null,
          action,
          module: 'PAYMENTS',
          entityType: 'Payment',
          recordId,
          oldData: this.toAuditJson(oldData),
          newData: this.toAuditJson(newData),
          reason: reason ?? null,
          ipAddress: clientCtx?.ipAddress ?? null,
          userAgent: clientCtx?.userAgent ?? null,
        },
      });
    } catch (e) {
      // Surface the failure loudly so monitoring/alerting can pick it up.
      // The financial action above has already committed; we do not roll it
      // back, but a missed audit row is a compliance gap worth investigating.
      this.logger.error(
        `[payment audit] write failed — action=${action} recordId=${recordId} actor=${actor?.id ?? 'null'} error=${(e as Error).message}`,
        (e as Error).stack,
      );
    }
    }

  /** JSON-safe snapshot (Decimal→string, Date→ISO) for audit storage. */
  private toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value == null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
