import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptFilterDto } from './dto/receipt-filter.dto';
import { VoidReceiptDto } from './dto/void-receipt.dto';
import { M } from '../common/money/money';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { ClientContext } from '../common/audit/client-context';

/** @deprecated Use M.of() / M.str() from common/money. Retained for legacy paths. */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private prisma: PrismaService,
    private readonly gl: GeneralLedgerService,
  ) {}

  // NOTE: There is no `create()` method. Receipts are produced inside
  // InvoicesService.addPayment so the invoice balance, base-currency
  // conversion, and overpayment validation can't be skipped.

  async findAll(filters: ReceiptFilterDto) {
    const {
      search,
      patientId,
      invoiceId,
      status,
      paymentMethod,
      currencyCode,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page = 1,
      limit = 15,
    } = filters;

    const pageNum = parseInt(page as any, 10) || 1;
    const limitNum = parseInt(limit as any, 10) || 15;

    const where: any = {};

    // Exact-match filters
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;
    if (currencyCode) where.currencyCode = currencyCode;
    if (paymentMethod) {
      // The receipt row stores the payment method on the related Payment;
      // older receipts may have it denormalised on receipt.paymentMethod.
      // Match either path so the filter works regardless of the schema branch.
      where.OR = [
        { payment: { method: paymentMethod } },
        { paymentMethod: paymentMethod },
      ];
    }

    // Free-text search — case-insensitive substring across the receipts and
    // their invoice + patient relations. Trims and short-circuits on empty.
    if (search && search.trim().length > 0) {
      const term = search.trim();
      const textOR = [
        { receiptNumber: { contains: term, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: term, mode: 'insensitive' } } },
        {
          invoice: {
            patient: {
              OR: [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { patientCode: { contains: term, mode: 'insensitive' } },
              ],
            },
          },
        },
        { payment: { reference: { contains: term, mode: 'insensitive' } } },
        { notes: { contains: term, mode: 'insensitive' } },
      ];
      // If paymentMethod is also set, we AND its OR with the search OR.
      // Prisma accepts { AND: [{ OR: [...] }, { OR: [...] }] } for this.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: textOR }];
        delete where.OR;
      } else {
        where.OR = textOR;
      }
    }

    // Date range on generatedAt — end date is end-of-day inclusive.
    if (startDate || endDate) {
      where.generatedAt = {};
      if (startDate) where.generatedAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.generatedAt.lte = end;
      }
    }

    // Amount range on amountReceived (the actual currency the patient paid).
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amountReceived = {};
      if (minAmount !== undefined) where.amountReceived.gte = minAmount;
      if (maxAmount !== undefined) where.amountReceived.lte = maxAmount;
    }

    // Patient filter — go through the invoice relation.
    if (patientId) {
      where.invoice = { ...(where.invoice || {}), patientId };
    }

    const [data, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { generatedAt: 'desc' },
        include: {
          invoice: {
            include: {
              patient: {
                select: {
                  firstName: true,
                  lastName: true,
                  patientCode: true,
                },
              },
            },
          },
          payment: {
            select: {
              method: true,
              reference: true,
            },
          },
          account: {
            select: { id: true, name: true, type: true },
          },
          receivedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              specialization: true,
            },
          },
        },
      }),
      this.prisma.receipt.count({ where }),
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

  async findOne(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
                patientCode: true,
                phone: true,
                email: true,
              },
            },
            items: {
              include: {
                procedure: true,
                ledgerEntry: true,
              },
            },
            payments: {
              orderBy: { paidAt: 'desc' },
            },
            receipts: {
              orderBy: { generatedAt: 'desc' },
              include: {
                account: {
                  select: { id: true, name: true, type: true },
                },
                receivedBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    specialization: true,
                  },
                },
              },
            },
          },
        },
        payment: true,
        account: {
          select: { id: true, name: true, type: true },
        },
        receivedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  async getReceiptByNumber(receiptNumber: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { receiptNumber },
      include: {
        invoice: {
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
                patientCode: true,
                phone: true,
                email: true,
              },
            },
            items: {
              include: {
                procedure: true,
              },
            },
            payments: {
              orderBy: { paidAt: 'desc' },
            },
            receipts: {
              orderBy: { generatedAt: 'desc' },
              include: {
                account: {
                  select: { id: true, name: true, type: true },
                },
                receivedBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    specialization: true,
                  },
                },
              },
            },
          },
        },
        payment: true,
        account: {
          select: { id: true, name: true, type: true },
        },
        receivedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    return receipt;
  }

  async getReceiptsByInvoice(invoiceId: string) {
    return this.prisma.receipt.findMany({
      where: { invoiceId },
      orderBy: { generatedAt: 'desc' },
      include: {
        payment: {
          select: {
            method: true,
            reference: true,
            receivedBy: true,
          },
        },
        account: {
          select: { id: true, name: true, type: true },
        },
        receivedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
      },
    });
  }

  // Get receipt data formatted for printing (includes clinic info)
  async getReceiptForPrint(id: string) {
    const receipt = await this.findOne(id);

    // Get clinic settings
    const clinicSettings = await this.prisma.clinicSettings.findMany({
      where: {
        key: {
          in: [
            'clinic_name',
            'clinic_address',
            'clinic_phone',
            'clinic_email',
            'clinic_license',
          ],
        },
      },
    });

    const clinic = {
      name:
        clinicSettings.find((s) => s.key === 'clinic_name')?.value ||
        'Dental Clinic',
      address: clinicSettings.find((s) => s.key === 'clinic_address')?.value,
      phone: clinicSettings.find((s) => s.key === 'clinic_phone')?.value,
      email: clinicSettings.find((s) => s.key === 'clinic_email')?.value,
      licenseNo: clinicSettings.find((s) => s.key === 'clinic_license')?.value,
    };

    return {
      clinic,
      receipt,
      invoice: receipt.invoice,
      patient: receipt.invoice.patient,
      payments: receipt.invoice.payments,
      receipts: receipt.invoice.receipts,
    };
  }

  /**
   * Void a receipt and roll back the payment it applied to its invoice.
   *
   * Intentionally narrow: this ONLY flips the receipt to VOID and reverses
   * invoice.amountPaid / balance / baseAmountPaid / baseBalance / paymentStatus.
   * It does NOT touch cash flow entries or the invoice's status — cash flow
   * is handled by its own module and the invoice document state is separate.
   *
   * All mutations happen inside a single transaction with a fresh read of the
   * invoice so concurrent voids/payments can't lose updates.
   */
  async voidReceipt(
    id: string,
    dto: VoidReceiptDto,
    voidedByUser?: string,
    clientCtx?: ClientContext,        // <-- ipAddress/userAgent for audit
    voidedByName?: string | null,     // <-- denormalised display name for audit
  ) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        invoiceId: true,
        amountReceived: true,
        exchangeRate: true,
        baseAmountReceived: true,
        invoiceAmountApplied: true,
      },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    if ((receipt.status as string) === 'VOID') {
      throw new ConflictException('Receipt is already voided');
    }

    const effectiveVoidedBy = dto.voidedBy ?? voidedByUser ?? null;
    const effectiveVoidedByName = voidedByName ?? null;

    await this.prisma.$transaction(async (tx) => {
      // Fresh read inside the transaction.
      const invoice = await tx.invoice.findUnique({
        where: { id: receipt.invoiceId },
        select: {
          id: true,
          total: true,
          amountPaid: true,
          baseAmountPaid: true,
          baseTotal: true,
        },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice linked to receipt not found');
      }

      // All reversal arithmetic in Decimal — no float drift on void.
      const invoiceReversal = receipt.invoiceAmountApplied != null
        ? M.of(receipt.invoiceAmountApplied)
        : M.mul(M.of(receipt.amountReceived), M.of(receipt.exchangeRate ?? 1));
      const baseReversal = receipt.baseAmountReceived != null
        ? M.of(receipt.baseAmountReceived)
        : invoiceReversal;

      const newAmountPaid = M.max(M.sub(invoice.amountPaid, invoiceReversal), 0);
      const newBalance = M.max(M.sub(invoice.total, newAmountPaid), 0);
      const newBaseAmtPaid = M.max(M.sub(invoice.baseAmountPaid, baseReversal), 0);
      const newBaseBalance = M.max(M.sub(invoice.baseTotal, newBaseAmtPaid), 0);

      const isFullyPaid = M.lte(newBalance, '0.01');
      const newPaymentStatus = isFullyPaid
        ? 'PAID'
        : M.gt(newAmountPaid, 0)
          ? 'PARTIALLY_PAID'
          : 'UNPAID';

      // H2: flip ACTIVE→VOID conditionally so two concurrent/duplicate voids
      // can't both proceed. The status check at the top of this method is a
      // pre-transaction read and races; this conditional updateMany is the
      // authoritative guard. The loser matches 0 rows and bails BEFORE the
      // invoice balance is reversed a second time (which would otherwise
      // desync the invoice from the GL — the GL reversal is idempotent and
      // would skip, leaving amountPaid double-reduced).
      const flipped = await tx.receipt.updateMany({
        where: { id, status: 'ACTIVE' as any },
        data: {
          status: 'VOID' as any,
          voidedAt: new Date(),
          voidedBy: effectiveVoidedBy,
          voidReason: dto.voidReason,
          updatedById: effectiveVoidedBy ?? null,
        },
      });
      if (flipped.count === 0) {
        throw new ConflictException(
          'Receipt was already voided by a concurrent request',
        );
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: M.money(newAmountPaid).toString(),
          balance: M.money(newBalance).toString(),
          baseAmountPaid: M.money(newBaseAmtPaid).toString(),
          baseBalance: M.money(newBaseBalance).toString(),
          paymentStatus: newPaymentStatus as any,
          paidAt: isFullyPaid ? new Date() : null,
          updatedById: effectiveVoidedBy ?? null,
        },
      });

      // Audit row — written INSIDE the transaction so it commits/rolls back
      // atomically with the void itself. Without this the most security-
      // sensitive action on a receipt left no trail. Now also captures
      // userName/ipAddress/userAgent so the audit log page shows who, from
      // where, with which browser — required for incident response.
      await tx.auditLog.create({
        data: {
          userId: effectiveVoidedBy ?? null,
          userName: effectiveVoidedByName,
          action: 'VOID',
          module: 'BILLING',
          entityType: 'Receipt',
          recordId: id,
          reason: dto.voidReason ?? null,
          ipAddress: clientCtx?.ipAddress ?? null,
          userAgent: clientCtx?.userAgent ?? null,
          oldData: {
            status: receipt.status,
            amountReceived: M.str(receipt.amountReceived),
            baseAmountReceived:
              receipt.baseAmountReceived != null
                ? M.str(receipt.baseAmountReceived)
                : null,
            invoiceAmountApplied:
              receipt.invoiceAmountApplied != null
                ? M.str(receipt.invoiceAmountApplied)
                : null,
          },
          newData: {
            status: 'VOID',
            voidReason: dto.voidReason ?? null,
            invoiceReversal: M.str(invoiceReversal),
            baseReversal: M.str(baseReversal),
          },
        },
      });

      // Reverse the cash/deposit journal entry this receipt posted
      // (DR Cash · CR A/R, or DR Cash · CR Patient Deposits for an advance).
      await this.gl.reverseBySource(
        'RECEIPT',
        id,
        dto.voidReason ?? 'Receipt voided',
        effectiveVoidedBy,
        tx,
      );
    });

    return this.findOne(id);
  }

  async getStats(period: 'day' | 'week' | 'month' | 'year' = 'month') {
    // Compute startDate without mutating the same Date instance across cases.
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    let startDate: Date;
    switch (period) {
      case 'day':
        startDate = startOfToday;
        break;
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        startDate = d;
        break;
      }
      case 'month': {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        startDate = d;
        break;
      }
      case 'year': {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() - 1);
        startDate = d;
        break;
      }
    }

    // Active receipts only — voided receipts must not contribute to revenue.
    const where = {
      generatedAt: { gte: startDate },
      status: 'ACTIVE' as any,
    };

    const [totalReceipts, totalAgg, receiptsToday] = await Promise.all([
      this.prisma.receipt.count({ where }),
      this.prisma.receipt.aggregate({
        where,
        _sum: { amountReceived: true, baseAmountReceived: true },
      }),
      this.prisma.receipt.count({
        where: {
          generatedAt: { gte: startOfToday },
          status: 'ACTIVE' as any,
        },
      }),
    ]);

    return {
      totalReceipts,
      totalAmount: toNum(totalAgg._sum.amountReceived),
      totalBaseAmount: toNum(totalAgg._sum.baseAmountReceived),
      receiptsToday,
      period,
    };
  }
}
