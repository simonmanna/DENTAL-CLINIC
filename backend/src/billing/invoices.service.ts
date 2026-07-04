// src/billing/invoices.service.ts
//
// FIELD-NAME MAP (schema → what we use here)
// LedgerEntry.pricePerUnit     — price per unit in transaction currency
// LedgerEntry.subtotalPrice    — pricePerUnit × quantity
// LedgerEntry.discountAmount   — discount in transaction currency
// LedgerEntry.taxAmount        — tax in transaction currency
// LedgerEntry.totalPrice       — subtotalPrice - discountAmount + taxAmount (FINAL in tx currency)
// LedgerEntry.currency         — transaction currency (e.g. 'USD')
// LedgerEntry.exchangeRate     — rate used to convert to baseCurrency
// LedgerEntry.baseCurrency     — system base currency ('UGX')
// LedgerEntry.baseAmount       — totalPrice converted to baseCurrency
//
// InvoiceItem.unitPrice        — price per unit in invoice currency
// InvoiceItem.discount         — line-level discount already baked in
// InvoiceItem.total            — final amount in invoice currency
// InvoiceItem.originalCurrency — tx currency of the originating ledger entry
// InvoiceItem.originalUnitPrice— pricePerUnit in originating currency
// InvoiceItem.originalTotal    — finalTotal in originating currency
// InvoiceItem.exchangeRate     — rate applied (entry→invoice currency)

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { CurrencyService } from './currency.service';
import {
  CreateInvoiceFromLedgerDto,
  AddInvoicePaymentDto,
  RefundInvoicePaymentDto,
} from './dto/billing.dto';
import { InvoiceStatus, InvoicePaymentStatus, Prisma, Receipt } from '@prisma/client';
import { PaymentAccountResolverService } from './payment-account-resolver.service';
import { M, type Money } from '../common/money/money';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import {
  GeneralLedgerService,
  GL,
} from '../general-ledger/general-ledger.service';
import { glCashKeyForMethod } from '../general-ledger/gl-accounts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `M.of(v)` from common/money. Kept temporarily so existing
 * call sites compile while the migration to Decimal-end-to-end proceeds.
 * New code MUST NOT introduce JS number arithmetic on monetary values.
 */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Select shape — must exactly match Prisma schema field names ──────────────

const INVOICE_SELECT = {
  id: true,
  invoiceNumber: true,
  status: true,
  // invoice-currency amounts
  subtotal: true,
  discountType: true,
  discountValue: true,
  discountAmount: true,
  taxPercent: true,
  taxAmount: true,
  total: true,
  amountPaid: true,
  balance: true,
  // base-currency amounts
  baseSubtotal: true,
  baseDiscountAmount: true,
  baseTaxAmount: true,
  baseTotal: true,
  baseAmountPaid: true,
  baseBalance: true,
  // currency metadata
  currency: true,
  exchangeRate: true,
  baseCurrency: true,
  // lifecycle timestamps
  activatedAt: true,
  voidedAt: true,
  voidedBy: true,
  voidReason: true,
  treatmentPlanId: true,
  patientId: true,
  visitId: true,
  initialPaymentAmount: true,
  initialPaymentCurrency: true,
  paymentStatus: true,
  paymentTerms: true,
  // misc
  notes: true,
  dueDate: true,
  issuedAt: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      patientCode: true,
      phone: true,
      email: true,
      address: true,
    },
  },
  visit: {
    select: {
      id: true,
      visitCode: true,
      dentist: {
        select: {
          firstName: true,
          lastName: true,
          specialization: true,
        },
      },
    },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      description: true,
      itemType: true,
      treatmentProcedureId: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      total: true,
      toothNumbers: true,
      ledgerEntryId: true,
      originalCurrency: true,
      originalUnitPrice: true,
      originalTotal: true,
      exchangeRate: true,
      ledgerEntry: {
        select: {
          id: true,
          entryCode: true,
          type: true,
          sourceType: true,
          currency: true,
          totalPrice: true,
          baseAmount: true,
          exchangeRate: true,
        },
      },
    },
  },
  receipts: {
    orderBy: { generatedAt: 'desc' as const },
    select: {
      id: true,
      receiptNumber: true,
      amountReceived: true,
      currencyCode: true,
      currency: true,
      exchangeRate: true,
      baseAmountReceived: true,
      invoiceAmountApplied: true,
      status: true,
      voidedAt: true,
      voidedBy: true,
      voidReason: true,
      generatedAt: true,
      generatedBy: true,
      receivedById: true,
      receivedByName: true,
      receivedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialization: true,
        },
      },
      notes: true,
      metadata: true,
    },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly currency: CurrencyService,
    private readonly accountResolver: PaymentAccountResolverService,
    private readonly docNum: DocumentNumberService,
    private readonly gl: GeneralLedgerService,
  ) {}

  // ── Create invoice from selected ledger entries ────────────────────────────

  async createFromLedger(dto: CreateInvoiceFromLedgerDto, createdBy?: string) {
    if (!dto.ledgerEntryIds?.length) {
      throw new BadRequestException(
        'Select at least one ledger entry to invoice',
      );
    }

    // Fetch entries — must be PENDING and belong to this patient
    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        id: { in: dto.ledgerEntryIds },
        patientId: dto.patientId,
        status: 'PENDING',
      },
    });

    if (entries.length !== dto.ledgerEntryIds.length) {
      const foundIds = new Set(entries.map((e) => e.id));
      const bad = dto.ledgerEntryIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Some entries are invalid, already invoiced, or belong to another patient: ${bad.join(', ')}`,
      );
    }

    const baseCurrency = this.currency.getBaseCurrency(); // 'UGX'

    // ── Determine invoice currency & exchange rate ──────────────────────────
    let invoiceCurrency: string;
    let invoiceExchangeRate: number;

    if (!dto.invoiceCurrency || dto.invoiceCurrency === 'BASE') {
      invoiceCurrency = baseCurrency;
      invoiceExchangeRate = 1;
    } else if (dto.invoiceCurrency === 'ORIGINAL') {
      invoiceCurrency = baseCurrency;
      invoiceExchangeRate = 1;
    } else {
      invoiceCurrency = dto.invoiceCurrency;
      invoiceExchangeRate = dto.customExchangeRate
        ? dto.customExchangeRate
        : await this.currency.getExchangeRate(baseCurrency, invoiceCurrency);
    }

    // ── Build invoice line items (all arithmetic via M = Decimal) ──────────
    const invoiceExchangeRateD: Money = M.of(invoiceExchangeRate);
    let subtotalInInvoiceCurrency: Money = M.zero();

    const itemData: Array<{
      description: string;
      quantity: number;
      unitPrice: string;
      discount: string;
      total: string;
      toothNumbers: number[];
      ledgerEntryId: string;
      originalCurrency: string;
      originalUnitPrice: string;
      originalTotal: string;
      exchangeRate: string;
    }> = [];

    for (const entry of entries) {
      const entryCurrency: string = entry.currency ?? baseCurrency;
      const entryExchangeRate = M.of(entry.exchangeRate ?? 1);
      const entryPricePerUnit = M.of(entry.pricePerUnit);
      const entryQuantity = Number(entry.quantity ?? 0); // counts stay Int
      const entrySubtotal = M.of(entry.subtotalPrice);
      const entryDiscount = M.of(entry.discountAmount);
      const entryTax = M.of(entry.taxAmount);
      const entryTotalInTxCurrency = M.of(entry.totalPrice);
      const entryBaseAmount = M.of(entry.baseAmount);

      const computedTotal = M.gt(entrySubtotal, 0)
        ? M.add(M.sub(entrySubtotal, entryDiscount), entryTax)
        : M.add(
            M.sub(M.mul(entryPricePerUnit, entryQuantity), entryDiscount),
            entryTax,
          );

      const effectiveTxTotal = M.gt(entryTotalInTxCurrency, 0)
        ? entryTotalInTxCurrency
        : computedTotal;

      let itemTotalInInvoiceCurrency: Money;
      let itemUnitPriceInInvoiceCurrency: Money;
      let itemExchangeRate: Money;

      if (entryCurrency === invoiceCurrency) {
        itemTotalInInvoiceCurrency = effectiveTxTotal;
        itemUnitPriceInInvoiceCurrency = entryPricePerUnit;
        itemExchangeRate = M.of(1);
      } else if (invoiceCurrency === baseCurrency) {
        itemTotalInInvoiceCurrency = M.gt(entryBaseAmount, 0)
          ? entryBaseAmount
          : M.mul(effectiveTxTotal, entryExchangeRate);
        itemUnitPriceInInvoiceCurrency = M.mul(
          entryPricePerUnit,
          entryExchangeRate,
        );
        itemExchangeRate = entryExchangeRate;
      } else {
        const baseTotal = M.gt(entryBaseAmount, 0)
          ? entryBaseAmount
          : M.mul(effectiveTxTotal, entryExchangeRate);
        itemTotalInInvoiceCurrency = M.mul(baseTotal, invoiceExchangeRateD);
        itemUnitPriceInInvoiceCurrency = M.mul(
          M.mul(entryPricePerUnit, entryExchangeRate),
          invoiceExchangeRateD,
        );
        itemExchangeRate = M.mul(entryExchangeRate, invoiceExchangeRateD);
      }

      itemTotalInInvoiceCurrency = M.money(itemTotalInInvoiceCurrency);
      itemUnitPriceInInvoiceCurrency = M.money(itemUnitPriceInInvoiceCurrency);

      subtotalInInvoiceCurrency = M.add(
        subtotalInInvoiceCurrency,
        itemTotalInInvoiceCurrency,
      );

      itemData.push({
        description: entry.description,
        quantity: entryQuantity,
        unitPrice: itemUnitPriceInInvoiceCurrency.toString(),
        discount: '0',
        total: itemTotalInInvoiceCurrency.toString(),
        toothNumbers: [],
        ledgerEntryId: entry.id,
        originalCurrency: entryCurrency,
        originalUnitPrice: M.money(entryPricePerUnit).toString(),
        originalTotal: M.money(effectiveTxTotal).toString(),
        exchangeRate: itemExchangeRate.toString(),
      });
    }

    subtotalInInvoiceCurrency = M.money(subtotalInInvoiceCurrency);

    // ── Invoice-level discount ─────────────────────────────────────────────
    let invoiceDiscountAmount: Money = M.zero();
    const discountValue = M.of(dto.discountValue ?? 0);
    if (M.gt(discountValue, 0)) {
      invoiceDiscountAmount =
        dto.discountType === 'PERCENT'
          ? M.applyPct(subtotalInInvoiceCurrency, discountValue)
          : discountValue;
    }
    invoiceDiscountAmount = M.money(invoiceDiscountAmount);

    const taxPercent = M.of(dto.taxPercent ?? 0);
    const taxableAmount = M.sub(
      subtotalInInvoiceCurrency,
      invoiceDiscountAmount,
    );
    const invoiceTaxAmount = M.money(M.applyPct(taxableAmount, taxPercent));
    const invoiceTotal = M.money(M.add(taxableAmount, invoiceTaxAmount));

    // ── Base-currency (UGX) equivalents for reporting ──────────────────────
    let baseSubtotal: Money = M.zero();
    for (const entry of entries) {
      const baseAmt = M.of(entry.baseAmount);
      if (M.gt(baseAmt, 0)) {
        baseSubtotal = M.add(baseSubtotal, baseAmt);
      } else {
        const txTotal = M.of(entry.totalPrice);
        const rate = M.of(entry.exchangeRate ?? 1);
        baseSubtotal = M.add(baseSubtotal, M.mul(txTotal, rate));
      }
    }
    baseSubtotal = M.money(baseSubtotal);

    const discountRatio = M.gt(subtotalInInvoiceCurrency, 0)
      ? M.div(invoiceDiscountAmount, subtotalInInvoiceCurrency)
      : M.zero();
    const baseDiscountAmount = M.money(M.mul(baseSubtotal, discountRatio));
    const baseTaxableAmount = M.sub(baseSubtotal, baseDiscountAmount);
    const baseTaxAmount = M.money(M.applyPct(baseTaxableAmount, taxPercent));
    const baseTotal = M.money(M.add(baseTaxableAmount, baseTaxAmount));

    // ── Persist in a transaction. The sequence number is generated INSIDE the
    // transaction so a rollback unwinds the number too (no orphan increment). ──
    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.generateInvoiceNumber(tx);
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          createdById: createdBy ?? null,
          updatedById: createdBy ?? null,
          patientId: dto.patientId,
          visitId: dto.visitId ?? null,
          status: InvoiceStatus.POSTED,
          currency: invoiceCurrency,
          exchangeRate: invoiceExchangeRateD.toString(),
          baseCurrency,
          subtotal: subtotalInInvoiceCurrency.toString(),
          discountType: dto.discountType ?? null,
          discountValue: M.money(discountValue).toString(),
          discountAmount: invoiceDiscountAmount.toString(),
          taxPercent: taxPercent.toString(),
          taxAmount: invoiceTaxAmount.toString(),
          total: invoiceTotal.toString(),
          amountPaid: '0',
          balance: invoiceTotal.toString(),
          baseSubtotal: baseSubtotal.toString(),
          baseDiscountAmount: baseDiscountAmount.toString(),
          baseTaxAmount: baseTaxAmount.toString(),
          baseTotal: baseTotal.toString(),
          baseAmountPaid: '0',
          baseBalance: baseTotal.toString(),
          notes: dto.notes ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          issuedAt: new Date(),
        },
      });

      await tx.invoiceItem.createMany({
        data: itemData.map((item) => ({ ...item, invoiceId: inv.id })),
      });

      await tx.ledgerEntry.updateMany({
        where: { id: { in: dto.ledgerEntryIds } },
        data: { status: 'INVOICED' },
      });

      const ledgerEntries = await tx.ledgerEntry.findMany({
        where: { id: { in: dto.ledgerEntryIds } },
        select: { id: true, sourceType: true, sourceId: true },
      });

      const treatmentProcedureIds = ledgerEntries
        .filter((e) => e.sourceType === 'TREATMENT_PROCEDURE' && e.sourceId)
        .map((e) => e.sourceId!);

      if (treatmentProcedureIds.length > 0) {
        await tx.treatmentProcedure.updateMany({
          where: { id: { in: treatmentProcedureIds } },
          data: {
            paymentStatus: 'INVOICED',
            // Optionally sync ledgerStatus if you want both fields consistent
            // ledgerStatus: 'INVOICED'
          },
        });
      }

      const rxItemSourceIds = ledgerEntries
        .filter((e) => e.sourceType === 'PRESCRIPTION_ITEM' && e.sourceId)
        .map((e) => e.sourceId!);

      if (rxItemSourceIds.length > 0) {
        const prescriptionItems = await tx.prescriptionItem.findMany({
          where: { id: { in: rxItemSourceIds } },
          select: { prescriptionId: true },
        });

        const prescriptionIds = [
          ...new Set(prescriptionItems.map((pi) => pi.prescriptionId)),
        ];

        if (prescriptionIds.length > 0) {
          // Only update ACTIVE prescriptions — don't touch already-dispensed ones
          await tx.prescription.updateMany({
            where: {
              id: { in: prescriptionIds },
              status: 'ACTIVE',
            },
            data: {
              status: 'DISPENSED',
              dispensedAt: new Date(),
            },
          });
        }
      }

      return inv;
    });

    return this.getInvoice(invoice.id);
  }

  // ── Add manual item to existing invoice ───────────────────────────────────

  async addItem(
    invoiceId: string,
    item: {
      description: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      currency?: string;
      exchangeRate?: number;
    },
  ) {
    const invoice = await this.assertEditable(invoiceId);
    const discount = item.discount ?? 0;
    const itemCurrency = item.currency || invoice.currency;
    const originalUnitPrice = item.unitPrice;
    const originalSubtotal = item.quantity * item.unitPrice;
    const originalTotal = originalSubtotal - discount;

    let finalUnitPrice = item.unitPrice;
    let finalTotal = originalTotal;
    let itemExchangeRate = 1;

    if (item.currency && item.currency !== invoice.currency) {
      const conversion = await this.currency.convert(
        item.unitPrice,
        item.currency,
        invoice.currency,
        item.exchangeRate,
      );
      finalUnitPrice = conversion.amount;
      finalTotal = item.quantity * finalUnitPrice - discount;
      itemExchangeRate = conversion.rate;
    }

    await this.prisma.invoiceItem.create({
      data: {
        invoiceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: finalUnitPrice,
        discount,
        total: finalTotal,
        toothNumbers: [],
        originalCurrency: itemCurrency,
        originalUnitPrice,
        originalTotal,
        exchangeRate: itemExchangeRate,
      },
    });

    return this.recalcAndSave(invoiceId);
  }

  // ── Remove item from invoice ───────────────────────────────────────────────

  async removeItem(invoiceId: string, itemId: string) {
    await this.assertEditable(invoiceId);

    const item = await this.prisma.invoiceItem.findFirst({
      where: { id: itemId, invoiceId },
    });
    if (!item) throw new NotFoundException('Invoice item not found');

    if (item.ledgerEntryId) {
      await this.prisma.ledgerEntry.update({
        where: { id: item.ledgerEntryId },
        data: { status: 'PENDING' },
      });
    }

    await this.prisma.invoiceItem.delete({ where: { id: itemId } });
    return this.recalcAndSave(invoiceId);
  }

  // ── Record a payment (NO Payment creation, only Receipt) ───────────────────

  // ── Record a payment (NO Payment creation, only Receipt) ───────────────────

  // ── New private helper ─────────────────────────────────────────────────────
  private async getSystemExchangeRate(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number | null> {
    // Currently only USD→UGX is stored in clinic_settings.
    // Key = "EXCHANGE_RATE", value = "3750" (UGX per 1 USD, for example).
    const isUsdToUgx =
      fromCurrency.toUpperCase() === 'USD' &&
      toCurrency.toUpperCase() === 'UGX';

    if (!isUsdToUgx) return null; // no system rate for other pairs yet

    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'EXCHANGE_RATE' },
      select: { value: true },
    });

    if (!setting?.value) return null;

    const rate = parseFloat(setting.value);
    return isNaN(rate) || rate <= 0 ? null : rate;
  }

  async addPayment(
    invoiceId: string,
    dto: AddInvoicePaymentDto,
    currentUserId?: string,
    idempotencyKey?: string,
  ) {
    // ── 0. Idempotency replay (C1) ───────────────────────────────────────────
    // A double-click or a client network retry must NOT create a second
    // payment + receipt. If this key already produced a response, replay it.
    if (idempotencyKey) {
      const prior = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (prior?.response) {
        return { ...(prior.response as any), _idempotent: true };
      }
    }

    // ── 1. Load invoice ──────────────────────────────────────────────────────
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        balance: true,
        status: true,
        invoiceNumber: true,
        patientId: true,
        currency: true,
        baseCurrency: true,
        exchangeRate: true,
        baseBalance: true,
        baseAmountPaid: true,
        baseTotal: true,
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') {
      throw new BadRequestException(
        'Cannot record a payment against a voided invoice',
      );
    }

    // ── 2. Guard: balance & amount ───────────────────────────────────────────
    const invoiceBalance = M.of(invoice.balance);
    if (M.lte(invoiceBalance, 0)) {
      throw new BadRequestException('Invoice is already fully paid');
    }
    if (M.lte(dto.amount, 0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    // ── 3. Resolve exchange rate (server-authoritative, H3) ──────────────────
    // The FX rate drives the base-currency GL posting + stored
    // baseAmountReceived, so it must NEVER come from the client (a rigged rate
    // would mis-state recognised revenue and the refund FX basis). Priority:
    //   1. clinic_settings EXCHANGE_RATE   (admin-set, authoritative)
    //   2. CurrencyService stored rate     (server-side lookup)
    //   3. invoice.exchangeRate            (rate locked at invoice creation)
    //   4. 1                               (same-currency / last resort)
    // `dto.exchangeRateAtPayment` is intentionally ignored.
    const paymentCurrency = dto.paymentCurrency || invoice.currency;
    const baseCurrency = invoice.baseCurrency ?? 'UGX';
    const rateTarget =
      invoice.currency !== paymentCurrency ? invoice.currency : baseCurrency;

    const systemRate = await this.getSystemExchangeRate(
      paymentCurrency,
      rateTarget,
    );

    let resolvedRate: number;
    if (systemRate != null) {
      resolvedRate = systemRate;
    } else if (paymentCurrency !== rateTarget) {
      // Server-side stored rate (throws for unsupported pairs → fall back to
      // the invoice's locked rate rather than trusting anything client-sent).
      try {
        resolvedRate = await this.currency.getExchangeRate(
          paymentCurrency,
          rateTarget,
        );
      } catch {
        resolvedRate = invoice.exchangeRate ? Number(invoice.exchangeRate) : 1;
      }
    } else {
      resolvedRate = invoice.exchangeRate ? Number(invoice.exchangeRate) : 1;
    }

    // ── 4. Convert amounts (all math via Decimal — no JS float arithmetic) ───
    let paymentInInvoiceCurrency: Money = M.of(dto.amount);
    let paymentInBaseCurrency: Money = M.of(dto.amount);

    if (paymentCurrency !== invoice.currency) {
      const conv = await this.currency.convert(
        dto.amount,
        paymentCurrency,
        invoice.currency,
        resolvedRate,
      );
      paymentInInvoiceCurrency = M.of(conv.amount);
    }

    if (paymentCurrency !== baseCurrency) {
      const baseConv = await this.currency.convert(
        dto.amount,
        paymentCurrency,
        baseCurrency,
        resolvedRate,
      );
      paymentInBaseCurrency = M.of(baseConv.amount);
    }

    // ── 5. Overpayment guard (0.01 tolerance for FX rounding noise) ──────────
    // DB CHECK (balance >= 0) is the safety net — this check exists to give a
    // friendly error before the UPDATE trips the constraint.
    if (M.gt(paymentInInvoiceCurrency, M.add(invoiceBalance, '0.01'))) {
      throw new BadRequestException(
        `Payment of ${M.str(paymentInInvoiceCurrency)} ${invoice.currency} ` +
          `exceeds remaining balance of ${M.str(invoiceBalance)}`,
      );
    }

    // ── 6. Resolve cashier name (outside the transaction) ────────────────────
    let receivedByName: string | null = null;
    if (dto.receivedById) {
      const cashier = await this.prisma.staff.findUnique({
        where: { id: dto.receivedById },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!cashier) {
        throw new BadRequestException(
          `receivedById ${dto.receivedById} does not match an active staff record`,
        );
      }
      receivedByName = `${cashier.firstName} ${cashier.lastName}`;
    }

    // ── 7. Resolve receiving account (informational only) ────────────────────
    const account = await this.accountResolver.resolve(
      dto.method,
      dto.paymentCurrency ?? invoice.currency,
    );

    // ── 8. Persist (transaction) ─────────────────────────────────────────────
    let result: { receipt: Receipt | null; glEntry: unknown };
    try {
      result = await this.prisma.$transaction(async (tx) => {
      // Atomic conditional UPDATE — concurrent payments can no longer lose
      // updates because the row's WHERE clause refuses to credit past the
      // remaining balance (or against a VOID invoice). If 0 rows match, either
      // a concurrent payment just filled the invoice up or it was voided.
      const paymentInv = M.money(paymentInInvoiceCurrency);
      const paymentBase = M.money(paymentInBaseCurrency);

      const updatedRows = await tx.$queryRaw<
        Array<{
          amountPaid: any;
          balance: any;
          baseAmountPaid: any;
          baseBalance: any;
          paymentStatus: string;
        }>
      >(Prisma.sql`
        UPDATE "invoices"
        SET
          "amountPaid"     = "amountPaid"     + ${paymentInv}::numeric,
          "balance"        = "total"          - ("amountPaid" + ${paymentInv}::numeric),
          "baseAmountPaid" = "baseAmountPaid" + ${paymentBase}::numeric,
          "baseBalance"    = "baseTotal"      - ("baseAmountPaid" + ${paymentBase}::numeric),
          "paymentStatus"  = CASE
            WHEN ("total" - ("amountPaid" + ${paymentInv}::numeric)) <= 0.01
              THEN 'PAID'::"InvoicePaymentStatus"
            ELSE 'PARTIALLY_PAID'::"InvoicePaymentStatus"
          END,
          "paidAt" = CASE
            WHEN ("total" - ("amountPaid" + ${paymentInv}::numeric)) <= 0.01
              THEN NOW()
            ELSE NULL
          END,
          "updatedById" = ${currentUserId ?? null}
        WHERE "id" = ${invoiceId}
          AND "balance" >= ${paymentInv}::numeric
          AND "status" <> 'VOID'::"InvoiceStatus"
        RETURNING
          "amountPaid",
          "balance",
          "baseAmountPaid",
          "baseBalance",
          "paymentStatus"
      `);

      if (updatedRows.length === 0) {
        // Either overpayment (balance < amount) or status flipped to VOID
        // between the outer load and this UPDATE. Re-read to give a precise
        // error message.
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { status: true, balance: true, currency: true },
        });
        if (!current) {
          throw new NotFoundException('Invoice disappeared mid-transaction');
        }
        if (current.status === 'VOID') {
          throw new BadRequestException(
            'Cannot record a payment against a voided invoice',
          );
        }
        throw new BadRequestException(
          `Payment of ${M.str(paymentInInvoiceCurrency)} ${current.currency} ` +
            `exceeds remaining balance of ${M.str(current.balance)}`,
        );
      }

      const fresh = updatedRows[0];
      const rateUsed = M.of(resolvedRate);

      // ── 8a. Receipt ──────────────────────────────────────────────────────
      let receipt: Receipt | null = null;
      if (dto.generateReceipt !== false) {
        const receiptNumber = await this.generateReceiptNumber(tx);
        receipt = await tx.receipt.create({
          data: {
            receiptNumber,
            invoiceId,
            amountReceived: M.money(dto.amount).toString(),
            currencyCode: paymentCurrency as any,
            currency: paymentCurrency,
            exchangeRate: rateUsed.toString(),
            baseAmountReceived: M.money(paymentInBaseCurrency).toString(),
            invoiceAmountApplied: M.money(paymentInInvoiceCurrency).toString(),
            generatedBy: dto.receivedById ?? currentUserId ?? null,
            createdById: currentUserId ?? null,
            receivedById: dto.receivedById ?? null,
            receivedByName,
            accountId: account?.id ?? null,
            paymentMethod: dto.method as any,
            notes: dto.notes ?? null,
            metadata: {
              method: dto.method,
              reference: dto.reference ?? null,
              transactionId: dto.transactionId ?? null,
              paymentCurrency,
              exchangeRateUsed: rateUsed.toString(),
              originalAmount: M.str(dto.amount),
            },
          },
        });
      }

      // The atomic UPDATE above already set amountPaid / balance / paymentStatus /
      // paidAt authoritatively from the post-write state. No second write needed —
      // recomputing here would either be a no-op or reintroduce the lost-update
      // race the UPDATE was meant to close.
      const isFullyPaid = fresh.paymentStatus === 'PAID';
      const newAmountPaid = M.of(fresh.amountPaid);
      const newBalance = M.of(fresh.balance);

      // ── 8d. Double-entry posting ─────────────────────────────────────────
      // Always DR the cash/bank account the money landed in. The credit side
      // depends on whether revenue has been recognised yet:
      //   • DRAFT invoice  → money is an advance → CR Patient Deposits (liability)
      //   • POSTED invoice → settles the receivable → CR Accounts Receivable
      const isDraft = invoice.status === 'DRAFT';
      const cashKey = glCashKeyForMethod(dto.method);
      const creditKey = isDraft ? GL.PATIENT_DEPOSITS : GL.ACCOUNTS_RECEIVABLE;
      const baseAmt = M.money(paymentInBaseCurrency);

      const glEntry = await this.gl.safePost(
        {
          memo: `Payment on invoice ${invoice.invoiceNumber}${
            receipt ? ` (receipt ${receipt.receiptNumber})` : ''
          }`,
          sourceType: 'RECEIPT',
          sourceId: receipt?.id ?? invoiceId,
          patientId: invoice.patientId,
          postedById: currentUserId ?? null,
          skipIfZero: true,
          lines: [
            {
              key: cashKey,
              debit: baseAmt,
              currency: paymentCurrency,
              fxAmount: dto.amount,
              fxRate: resolvedRate,
            },
            {
              key: creditKey,
              credit: baseAmt,
              patientId: isDraft ? undefined : invoice.patientId,
            },
          ],
        },
        tx,
      );

      // ── 8e. Idempotency marker (C1) ──────────────────────────────────────
      // Written INSIDE the tx so a concurrent duplicate request trips the PK
      // unique constraint and rolls its WHOLE transaction back — it can never
      // create a second payment/receipt. The full response is stored
      // post-commit (best-effort) so a later retry replays it.
      if (idempotencyKey) {
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            scope: 'INVOICE_PAYMENT',
            response: Prisma.DbNull,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      return { receipt, glEntry };
      });
    } catch (e) {
      // A racing duplicate (same Idempotency-Key) committed first; its in-tx
      // marker tripped the PK unique constraint here. Replay its result instead
      // of surfacing the raw constraint error — and crucially WITHOUT charging
      // a second payment.
      if (
        idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const prior = await this.prisma.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (prior?.response) {
          return { ...(prior.response as any), _idempotent: true };
        }
        // Winner committed but hasn't stored its full response yet — return the
        // current invoice state rather than double-charging.
        return { ...(await this.getInvoice(invoiceId)), _idempotent: true };
      }
      throw e;
    }

    // ── 9. Return refreshed invoice + receipt ────────────────────────────────
    const response = {
      ...(await this.getInvoice(invoiceId)),
      receipt: result.receipt,
    };

    // Persist the full response so a future retry with the same key replays it
    // verbatim. Best-effort: the in-tx marker already provides the dedupe; this
    // only enriches the replay payload, so a failure here must not fail the
    // payment that already committed.
    if (idempotencyKey) {
      try {
        await this.prisma.idempotencyKey.update({
          where: { key: idempotencyKey },
          data: {
            response: JSON.parse(
              JSON.stringify(response),
            ) as Prisma.InputJsonValue,
          },
        });
      } catch {
        /* replay store is best-effort */
      }
    }

    return response;
  }

  /**
   * Refund money already received against an invoice — the inverse of
   * {@link addPayment}. Cash leaves the clinic, so amountPaid/balance are
   * restored, a negative ("refund") Receipt is written, and an audit row is
   * recorded. Accounting is optional/non-blocking (safePost):
   *   • POSTED invoice → DR Accounts Receivable · CR Cash/Bank
   *   • DRAFT  invoice → DR Patient Deposits    · CR Cash/Bank (return advance)
   *
   * FX handling: the refund's base-currency amount is computed by allocating
   * the refund across ACTIVE receipts in FIFO (chronological) order and using
   * EACH receipt's own stored `baseAmountReceived / invoiceAmountApplied`
   * ratio. This matches the rate the patient was originally credited at —
   * critical if the invoice's display exchange rate has since changed
   * (e.g. via `changeCurrency`) and we don't want the GL reversal to disagree
   * with the original GL posting.
   *
   * LIMITATION: per-receipt "already refunded" attribution is not tracked.
   * Multiple partial refunds against the same receipt will each consume the
   * full `invoiceAmountApplied` for allocation purposes, which over-counts
   * at the receipt level. The invoice-level cap (`amount > alreadyPaid`)
   * still prevents money from leaving the clinic twice; the receipt-level
   * attribution is only used to pick the FX rate. A future enhancement would
   * store `refundedInvoiceAmount` on the receipt to make attribution exact.
   */
  async refundPayment(
    invoiceId: string,
    dto: RefundInvoicePaymentDto,
    currentUserId?: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        patientId: true,
        currency: true,
        baseCurrency: true,
        exchangeRate: true,
        amountPaid: true,
        baseAmountPaid: true,
        total: true,
        baseTotal: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Cannot refund a voided invoice');
    }

    const amount = M.of(dto.amount);
    if (M.lte(amount, 0)) {
      throw new BadRequestException('Refund amount must be greater than zero');
    }
    const alreadyPaid = M.of(invoice.amountPaid);
    if (M.gt(amount, M.add(alreadyPaid, '0.01'))) {
      throw new BadRequestException(
        `Refund of ${M.str(amount)} exceeds the amount paid (${M.str(alreadyPaid)})`,
      );
    }

    // ── Allocate the refund across ACTIVE receipts (FIFO) and compute the
    //    base-currency refund amount using each receipt's stored rate. ─────
    const baseCurrency = invoice.baseCurrency ?? 'UGX';
    const invoiceHeaderRate = M.of(invoice.exchangeRate);

    const activeReceipts = await this.prisma.receipt.findMany({
      where: { invoiceId, status: 'ACTIVE' },
      orderBy: { generatedAt: 'asc' },
      select: {
        id: true,
        invoiceAmountApplied: true,
        baseAmountReceived: true,
        exchangeRate: true,
      },
    });

    let remaining = amount;
    let refundBase: Money = M.zero();
    const allocations: Array<{
      receiptId: string;
      applied: Money;
      appliedBase: Money;
    }> = [];

    for (const rcpt of activeReceipts) {
      if (M.isZero(remaining)) break;

      // invoiceAmountApplied is positive for ACTIVE receipts (per schema comment
      // on InvoiceAmountApplied). It's the invoice-currency amount originally
      // credited to the invoice by THIS receipt.
      const appliedAvailable = M.of(rcpt.invoiceAmountApplied ?? 0);
      if (M.lte(appliedAvailable, 0)) continue;

      // Per-receipt base-per-invoice ratio. Falls back to the invoice header
      // rate if the receipt has no base-amount snapshot (legacy data).
      let perReceiptBaseRatio: Money;
      if (
        M.isPositive(appliedAvailable) &&
        rcpt.baseAmountReceived != null
      ) {
        perReceiptBaseRatio = M.div(M.of(rcpt.baseAmountReceived), appliedAvailable);
      } else {
        perReceiptBaseRatio = invoiceHeaderRate;
      }

      const portion = M.min(remaining, appliedAvailable);
      const portionBase = M.money(M.mul(portion, perReceiptBaseRatio));

      refundBase = M.add(refundBase, portionBase);
      remaining = M.sub(remaining, portion);
      allocations.push({ receiptId: rcpt.id, applied: portion, appliedBase: portionBase });
    }

    // If no ACTIVE receipts were found, fall back to the invoice header rate so
    // the GL still balances. Logs the assumption via the audit row below.
    if (M.isPositive(remaining)) {
      const fallbackBase = M.money(M.mul(remaining, invoiceHeaderRate));
      refundBase = M.add(refundBase, fallbackBase);
      remaining = M.zero();
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // H1: atomic conditional UPDATE — the refund only applies if the row still
      // has at least `amount` paid (and isn't VOID). Two concurrent refunds can
      // no longer BOTH pass a stale cap check and each emit a cash-out: the
      // loser matches 0 rows and is rejected before any negative receipt / GL
      // credit is written. Mirrors the addPayment overpayment guard.
      const refundInv = M.money(amount);
      const refundBaseM = M.money(refundBase);

      const updatedRows = await tx.$queryRaw<
        Array<{
          amountPaid: any;
          balance: any;
          baseAmountPaid: any;
          baseBalance: any;
        }>
      >(Prisma.sql`
        UPDATE "invoices"
        SET
          "amountPaid"     = "amountPaid" - ${refundInv}::numeric,
          "balance"        = "total" - ("amountPaid" - ${refundInv}::numeric),
          "baseAmountPaid" = GREATEST("baseAmountPaid" - ${refundBaseM}::numeric, 0),
          "baseBalance"    = "baseTotal" - GREATEST("baseAmountPaid" - ${refundBaseM}::numeric, 0),
          "paymentStatus"  = CASE
            WHEN ("amountPaid" - ${refundInv}::numeric) <= 0.01
              THEN 'UNPAID'::"InvoicePaymentStatus"
            ELSE 'PARTIALLY_PAID'::"InvoicePaymentStatus"
          END,
          "paidAt"      = NULL,
          "updatedById" = ${currentUserId ?? null}
        WHERE "id" = ${invoiceId}
          AND "status" <> 'VOID'::"InvoiceStatus"
          AND "amountPaid" >= ${refundInv}::numeric
        RETURNING
          "amountPaid",
          "balance",
          "baseAmountPaid",
          "baseBalance"
      `);

      if (updatedRows.length === 0) {
        // Either the invoice was voided, or a concurrent refund already drew the
        // paid amount below this refund. Re-read for a precise message.
        const current = await tx.invoice.findUnique({
          where: { id: invoiceId },
          select: { status: true, amountPaid: true },
        });
        if (!current) {
          throw new NotFoundException('Invoice disappeared mid-refund');
        }
        if (current.status === 'VOID') {
          throw new BadRequestException('Cannot refund a voided invoice');
        }
        throw new BadRequestException(
          `Refund of ${M.str(amount)} exceeds the amount currently paid ` +
            `(${M.str(current.amountPaid)})`,
        );
      }

      // Negative receipt → reduces net collections + gives the patient a
      // refund document. The receipt's exchangeRate mirrors the weighted
      // average of the per-receipt allocations so a future reversal can
      // recover the same base figure.
      const receiptNumber = await this.generateReceiptNumber(tx);
      const weightedRate = M.isPositive(amount)
        ? M.div(refundBase, amount)
        : invoiceHeaderRate;
      const receipt = await tx.receipt.create({
        data: {
          receiptNumber,
          invoiceId,
          amountReceived: M.money(M.neg(amount)).toString(),
          currencyCode: invoice.currency as any,
          currency: invoice.currency,
          exchangeRate: M.money(weightedRate).toString(),
          baseAmountReceived: M.money(M.neg(refundBase)).toString(),
          invoiceAmountApplied: M.money(M.neg(amount)).toString(),
          generatedBy: dto.refundedById ?? currentUserId ?? null,
          createdById: currentUserId ?? null,
          receivedById: dto.refundedById ?? null,
          paymentMethod: dto.method as any,
          notes: dto.notes ?? dto.reason,
          metadata: {
            kind: 'REFUND',
            reason: dto.reason,
            reference: dto.reference ?? null,
            method: dto.method,
            allocations: allocations.map((a) => ({
              receiptId: a.receiptId,
              appliedInvoiceAmount: M.str(a.applied),
              appliedBaseAmount: M.str(a.appliedBase),
            })),
          },
        },
      });

      // ── Double-entry: money leaves → CR Cash; offset depends on whether
      //    revenue was recognised (POSTED → DR A/R) or it was an advance
      //    (DRAFT → DR Patient Deposits).
      const isDraft = invoice.status === 'DRAFT';
      const cashKey = glCashKeyForMethod(dto.method);
      const debitKey = isDraft ? GL.PATIENT_DEPOSITS : GL.ACCOUNTS_RECEIVABLE;
      const baseAmt = M.money(refundBase);

      const glEntry = await this.gl.safePost(
        {
          memo: `Refund on invoice ${invoice.invoiceNumber} (receipt ${receipt.receiptNumber}): ${dto.reason}`,
          sourceType: 'REFUND',
          sourceId: receipt.id,
          patientId: invoice.patientId,
          postedById: currentUserId ?? null,
          skipIfZero: true,
          lines: [
            {
              key: debitKey,
              debit: baseAmt,
              patientId: isDraft ? undefined : invoice.patientId,
            },
            { key: cashKey, credit: baseAmt },
          ],
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          userId: currentUserId ?? null,
          action: 'REFUND',
          module: 'BILLING',
          entityType: 'Invoice',
          recordId: invoiceId,
          reason: dto.reason,
          newData: {
            amount: M.str(amount),
            baseAmount: M.str(refundBase),
            currency: invoice.currency,
            baseCurrency,
            method: dto.method,
            receiptId: receipt.id,
            weightedExchangeRate: M.str(weightedRate),
            allocations: allocations.map((a) => ({
              receiptId: a.receiptId,
              appliedInvoiceAmount: M.str(a.applied),
              appliedBaseAmount: M.str(a.appliedBase),
            })),
          } as Prisma.InputJsonValue,
        },
      });

      return { receipt, glEntry };
    });

    return {
      ...(await this.getInvoice(invoiceId)),
      receipt: result.receipt,
    };
  }

  /**
   * Void an invoice document.
   *
   * Scope (intentionally narrow):
   *   • Flips invoice.status to VOID and stamps audit fields.
   *   • Marks linked ledger entries VOID so the patient ledger stops showing
   *     them as outstanding charges.
   *   • Resets linked TreatmentProcedure.paymentStatus → PENDING and
   *     ledgerStatus → UNPOSTED so the clinician can re-bill them later.
   *   • Writes an audit_log row so the void is discoverable in compliance
   *     reports (C7).
   *
   * Refuses to void an invoice while it has any ACTIVE receipts. The caller
   * must void the receipts first (each one rolls back its own GL line via
   * ReceiptsService.voidReceipt); only then can the invoice itself be voided.
   * This prevents orphaned cash — a voided invoice with active receipts is
   * a guaranteed accounting inconsistency.
   *
   * Out of scope (deliberately):
   *   • Receipts stay ACTIVE — voiding a receipt is a separate action
   *     handled by ReceiptsService.voidReceipt, which rolls back the money.
   *   • Cash flow entries stay untouched — they reflect cash that was
   *     physically received.
   */
  async voidInvoice(
    id: string,
    dto: { reason?: string; voidedBy?: string } = {},
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        invoiceNumber: true,
        amountPaid: true,
        items: { select: { ledgerEntryId: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is already voided');
    }
    if (!['DRAFT', 'POSTED'].includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot void a ${invoice.status} invoice. Only DRAFT and POSTED invoices can be voided.`,
      );
    }

    // Refuse while any receipts are ACTIVE — they must be voided first so
    // their cash flow is reversed before the invoice is torn down.
    const activeReceiptCount = await this.prisma.receipt.count({
      where: { invoiceId: id, status: 'ACTIVE' },
    });
    if (activeReceiptCount > 0) {
      throw new BadRequestException(
        `Cannot void invoice ${invoice.invoiceNumber}: ${activeReceiptCount} active ` +
          `receipt(s) must be voided first so their cash flow is reversed.`,
      );
    }

    const ledgerEntryIds = invoice.items
      .map((i) => i.ledgerEntryId)
      .filter(Boolean) as string[];

    await this.prisma.$transaction(async (tx) => {
      // 1. Flip the invoice.
      await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.VOID,
          voidedAt: new Date(),
          voidedBy: dto.voidedBy ?? null,
          voidReason: dto.reason ?? null,
          updatedById: dto.voidedBy ?? null,
        },
      });

      // 1a. Audit row — written INSIDE the transaction so it commits/rolls
      //     back atomically with the void itself. The receipt count is
      //     captured at write time for forensics ("voided with N already-
      //     voided receipts").
      const voidedReceipts = await tx.receipt.count({
        where: { invoiceId: id, status: 'VOID' },
      });
      await tx.auditLog.create({
        data: {
          userId: dto.voidedBy ?? null,
          action: 'VOID',
          module: 'BILLING',
          entityType: 'Invoice',
          recordId: id,
          reason: dto.reason ?? null,
          oldData: {
            status: invoice.status,
            amountPaid: M.str(invoice.amountPaid),
            activeReceiptsAtVoidTime: 0,
            voidedReceiptsAtVoidTime: voidedReceipts,
          } as Prisma.InputJsonValue,
          newData: {
            status: InvoiceStatus.VOID,
            voidReason: dto.reason ?? null,
          } as Prisma.InputJsonValue,
        },
      });

      // 1b. Reverse the revenue-recognition journal entries (DR A/R · CR Revenue
      //     and any deposit application) posted at activation. Reversing entries
      //     are appended — the originals are kept VOID for audit, never deleted.
      //     Receipts/payments stay ACTIVE and are reversed separately when voided.
      await this.gl.safeReverseBySource(
        'INVOICE',
        id,
        dto.reason ?? 'Invoice voided',
        dto.voidedBy ?? null,
        tx,
      );

      if (ledgerEntryIds.length === 0) return;

      // 2. Look up source rows BEFORE we void the ledger entries (the
      //    sourceType / sourceId stay readable either way, but doing it
      //    first keeps the queries simple to follow).
      const entries = await tx.ledgerEntry.findMany({
        where: { id: { in: ledgerEntryIds } },
        select: { sourceType: true, sourceId: true },
      });

      const tpIds = entries
        .filter((e) => e.sourceType === 'TREATMENT_PROCEDURE' && e.sourceId)
        .map((e) => e.sourceId as string);

      const sessionIds = entries
        .filter((e) => e.sourceType === 'PROCEDURE_SESSION' && e.sourceId)
        .map((e) => e.sourceId as string);

      // 3. Mark the ledger entries themselves VOID.
      await tx.ledgerEntry.updateMany({
        where: { id: { in: ledgerEntryIds } },
        data: { status: 'VOID' },
      });

      // 4. Reset linked treatment procedures so the clinician can re-bill them.
      if (tpIds.length > 0) {
        await tx.treatmentProcedure.updateMany({
          where: { id: { in: tpIds } },
          data: {
            paymentStatus: 'OPEN',
            ledgerStatus: 'UNPOSTED',
          },
        });
      }

      // 5. Same for procedure sessions.
      if (sessionIds.length > 0) {
        await tx.procedureSession.updateMany({
          where: { id: { in: sessionIds } },
          data: { ledgerStatus: 'UNPOSTED' },
        });
      }
    });

    return this.getInvoice(id);
  }

  // ── Get a single invoice ───────────────────────────────────────────────────

  async getInvoice(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: INVOICE_SELECT,
    });
    if (!inv) throw new NotFoundException('Invoice not found');

    return {
      ...inv,
      formatted: {
        total: this.currency.formatAmount(inv.total, inv.currency),
        amountPaid: this.currency.formatAmount(inv.amountPaid, inv.currency),
        balance: this.currency.formatAmount(inv.balance, inv.currency),
        baseTotal: this.currency.formatAmount(
          inv.baseTotal ?? 0,
          inv.baseCurrency ?? 'UGX',
        ),
      },
    };
  }

  // ── Get receipt data (for printing) ───────────────────────────────────────

  async getReceipt(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        patient: true,
        visit: {
          include: {
            dentist: {
              select: {
                firstName: true,
                lastName: true,
                specialization: true,
              },
            },
          },
        },
        items: true,
        receipts: { orderBy: { generatedAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const settingRows = await this.prisma.clinicSettings.findMany({
      where: {
        key: {
          in: [
            'clinic_name',
            'clinic_phone',
            'clinic_address',
            'clinic_email',
            'clinic_logo',
          ],
        },
      },
    });
    const config: Record<string, string> = {};
    settingRows.forEach((s) => {
      config[s.key] = s.value;
    });

    return {
      clinic: {
        name: config['clinic_name'] || 'Dental Clinic',
        phone: config['clinic_phone'] || '',
        address: config['clinic_address'] || '',
        email: config['clinic_email'] || '',
        logo: config['clinic_logo'] || null,
      },
      invoice,
      patient: invoice.patient,
      dentist: invoice.visit?.dentist ?? null,
      receipts: invoice.receipts,
      currencyInfo: {
        invoiceCurrency: invoice.currency,
        baseCurrency: invoice.baseCurrency,
        exchangeRate: invoice.exchangeRate,
      },
    };
  }

  // ── List invoices (with optional filters) ─────────────────────────────────
  //
  // Production-grade filter set (post-2026-06-22 hardening):
  //   patientId, visitId           — exact relation match
  //   status                       — InvoiceStatus enum (DRAFT | POSTED | VOID)
  //   paymentStatus                — InvoicePaymentStatus enum
  //   currency, baseCurrency       — exact string match
  //   search                       — case-insensitive substring across
  //                                 invoiceNumber + patient firstName +
  //                                 lastName + patientCode
  //   dateFrom, dateTo             — half-open date range on createdAt
  //   dentistId                    — visit.dentistId relation match
  //   sortBy                       — createdAt | total | balance | invoiceNumber
  //   sortDir                      — asc | desc
  //
  // Invalid enum values are caught and rejected with 400 BEFORE reaching
  // Prisma (raw enum errors used to surface as HTTP 500). Page + limit are
  // clamped (page ≥ 1, 1 ≤ limit ≤ 200) for predictable response shape.

  async getPatientInvoices(params: {
    patientId?: string;
    visitId?: string;
    status?: string;
    paymentStatus?: string;
    currency?: string;
    baseCurrency?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    dentistId?: string;
    sortBy?: 'createdAt' | 'total' | 'balance' | 'invoiceNumber';
    sortDir?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    // ── Validate enums up-front. Prisma throws P2009 / raw enum errors that
    //    surface as HTTP 500 if we let them through. Sets kept as readonly
    //    arrays for `.includes()` — avoids the TS2802 Set-iteration flag. ──
    const VALID_STATUS = ['DRAFT', 'POSTED', 'VOID'] as const;
    const VALID_PAYMENT_STATUS = [
      'UNPAID',
      'PARTIALLY_PAID',
      'PAID',
    ] as const;
    const VALID_SORT_BY = [
      'createdAt',
      'total',
      'balance',
      'invoiceNumber',
    ] as const;
    const VALID_SORT_DIR = ['asc', 'desc'] as const;

    if (
      params.status &&
      params.status !== 'ALL' &&
      !VALID_STATUS.includes(params.status as any)
    ) {
      throw new BadRequestException(
        `Invalid status "${params.status}". Allowed: ${VALID_STATUS.join(', ')}`,
      );
    }
    if (
      params.paymentStatus &&
      params.paymentStatus !== 'ALL' &&
      !VALID_PAYMENT_STATUS.includes(params.paymentStatus as any)
    ) {
      throw new BadRequestException(
        `Invalid paymentStatus "${params.paymentStatus}". Allowed: ${VALID_PAYMENT_STATUS.join(', ')}`,
      );
    }
    if (params.sortBy && !VALID_SORT_BY.includes(params.sortBy)) {
      throw new BadRequestException(
        `Invalid sortBy "${params.sortBy}". Allowed: ${VALID_SORT_BY.join(', ')}`,
      );
    }
    if (params.sortDir && !VALID_SORT_DIR.includes(params.sortDir)) {
      throw new BadRequestException(
        `Invalid sortDir "${params.sortDir}". Allowed: ${VALID_SORT_DIR.join(', ')}`,
      );
    }

    // Parse + clamp pagination. Default page=1, limit=25, max=200 (matches
    // audit-log page so a single mental model applies across the app).
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const limit = Math.min(200, Math.max(1, Math.floor(params.limit ?? 25)));

    // Parse date bounds (optional). Invalid date strings throw — controller
    // should forward ISO strings; we surface a clear 400 for anything else.
    let dateGte: Date | undefined;
    let dateLte: Date | undefined;
    if (params.dateFrom) {
      const d = new Date(params.dateFrom);
      if (isNaN(d.getTime())) {
        throw new BadRequestException(
          `Invalid dateFrom "${params.dateFrom}" (expected ISO 8601)`,
        );
      }
      dateGte = d;
    }
    if (params.dateTo) {
      const d = new Date(params.dateTo);
      if (isNaN(d.getTime())) {
        throw new BadRequestException(
          `Invalid dateTo "${params.dateTo}" (expected ISO 8601)`,
        );
      }
      dateLte = d;
    }

    // ── Build Prisma where clause ─────────────────────────────────────
    const where: Prisma.InvoiceWhereInput = {};
    if (params.patientId) where.patientId = params.patientId;
    if (params.visitId) where.visitId = params.visitId;
    if (params.status && params.status !== 'ALL') where.status = params.status as any;
    if (params.paymentStatus && params.paymentStatus !== 'ALL') {
      where.paymentStatus = params.paymentStatus as any;
    }
    if (params.currency) where.currency = params.currency;
    if (params.baseCurrency) where.baseCurrency = params.baseCurrency;
    if (params.dentistId) {
      where.visit = { dentistId: params.dentistId } as any;
    }
    if (dateGte || dateLte) {
      where.createdAt = {};
      if (dateGte) (where.createdAt as Prisma.DateTimeFilter).gte = dateGte;
      if (dateLte) (where.createdAt as Prisma.DateTimeFilter).lte = dateLte;
    }

    // Free-text search across invoice number + patient names + patient code.
    // Empty/whitespace strings are ignored (don't add a no-op OR clause).
    if (params.search && params.search.trim().length > 0) {
      const q = params.search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { patient: { firstName: { contains: q, mode: 'insensitive' } } },
        { patient: { lastName: { contains: q, mode: 'insensitive' } } },
        { patient: { patientCode: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Sort. `balance` and `total` are Decimal columns — Prisma sorts them
    // numerically, not lexicographically (Prisma 4+).
    const sortBy = (params.sortBy ?? 'createdAt') as
      | 'createdAt'
      | 'total'
      | 'balance'
      | 'invoiceNumber';
    const sortDir = (params.sortDir ?? 'desc') as 'asc' | 'desc';

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortDir },
        select: INVOICE_SELECT,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        // Echo the applied filter set so the frontend can show "X of Y
        // matching <filters>" without re-deriving the query state.
        appliedFilters: {
          patientId: params.patientId ?? null,
          visitId: params.visitId ?? null,
          status: params.status ?? 'ALL',
          paymentStatus: params.paymentStatus ?? 'ALL',
          currency: params.currency ?? null,
          baseCurrency: params.baseCurrency ?? null,
          search: params.search ?? null,
          dateFrom: params.dateFrom ?? null,
          dateTo: params.dateTo ?? null,
          dentistId: params.dentistId ?? null,
          sortBy,
          sortDir,
        },
      },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async assertEditable(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true, currency: true, baseTotal: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (['VOID'].includes(invoice.status)) {
      throw new BadRequestException(`Cannot edit a ${invoice.status} invoice`);
    }
    return invoice;
  }

  /** Recompute invoice totals from its current items and persist */
  private async recalcAndSave(invoiceId: string) {
    const items = await this.prisma.invoiceItem.findMany({
      where: { invoiceId },
      select: {
        total: true,
        discount: true,
        originalTotal: true,
        exchangeRate: true,
      },
    });

    // All money math via M (Decimal) — no JS float drift. M.sum returns full
    // precision; M.money() rounds once at the end to banker's-rounded 2dp.
    const subtotal: Money = M.money(M.sum(items.map((i) => i.total)));

    const baseSubtotal: Money = M.money(
      M.sum(
        items.map((i) =>
          M.mul(M.of(i.originalTotal ?? i.total), M.of(i.exchangeRate ?? 1)),
        ),
      ),
    );

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        taxPercent: true,
        discountValue: true,
        discountType: true,
        amountPaid: true,
        baseCurrency: true,
        exchangeRate: true,
        baseAmountPaid: true,
      },
    });
    if (!invoice)
      throw new NotFoundException('Invoice not found during recalc');

    const discountValue = M.of(invoice.discountValue);
    const taxPercent = M.of(invoice.taxPercent);
    const amtPaid = M.of(invoice.amountPaid);
    const baseAmtPaid = M.of(invoice.baseAmountPaid);

    const discountAmount: Money = M.money(
      invoice.discountType === 'PERCENT'
        ? M.applyPct(subtotal, discountValue)
        : discountValue,
    );

    const taxableAmount = M.sub(subtotal, discountAmount);
    const taxAmount = M.money(M.applyPct(taxableAmount, taxPercent));
    const total: Money = M.money(M.add(taxableAmount, taxAmount));
    const balance = M.sub(total, amtPaid);

    const discountRatio: Money = M.isPositive(subtotal)
      ? M.div(discountAmount, subtotal)
      : M.zero();
    const baseDiscountAmount: Money = M.money(M.mul(baseSubtotal, discountRatio));
    const baseTaxableAmount = M.sub(baseSubtotal, baseDiscountAmount);
    const baseTaxAmount = M.money(M.applyPct(baseTaxableAmount, taxPercent));
    const baseTotal: Money = M.money(M.add(baseTaxableAmount, baseTaxAmount));
    const baseBalance = M.sub(baseTotal, baseAmtPaid);

    const newPaymentStatus: InvoicePaymentStatus = M.lte(balance, '0.01')
      ? InvoicePaymentStatus.PAID
      : M.isPositive(amtPaid)
        ? InvoicePaymentStatus.PARTIALLY_PAID
        : InvoicePaymentStatus.UNPAID;

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: M.str(subtotal),
        discountAmount: M.str(discountAmount),
        taxAmount: M.str(taxAmount),
        total: M.str(total),
        balance: M.str(M.max(balance, 0)),
        baseSubtotal: M.str(baseSubtotal),
        baseDiscountAmount: M.str(baseDiscountAmount),
        baseTaxAmount: M.str(baseTaxAmount),
        baseTotal: M.str(baseTotal),
        baseBalance: M.str(M.max(baseBalance, 0)),
        paymentStatus: newPaymentStatus,
      },
      select: INVOICE_SELECT,
    });

    // ACC-1: keep the GL revenue recognition reconciled to the (possibly newly
    // discounted/taxed/re-priced) invoice total. Idempotent delta — no-op if
    // nothing changed; non-blocking via safePost.
    await this.syncInvoiceRevenueGl(invoiceId);

    return updated;
  }

  /**
   * ACC-1: reconcile an invoice's GL revenue recognition to its CURRENT totals.
   * Posts only the DELTA between the invoice's target recognition (gross
   * revenue / discount / tax, plus the balancing A/R) and what has already been
   * posted for it — so a discount/tax/currency change on an already-POSTED
   * invoice updates the GL instead of letting A/R drift. Idempotent (delta nets
   * to zero → no-op) and non-blocking (safePost). POSTED invoices only.
   *
   * It touches only the recognition quartet (A/R, Revenue, Sales Discount, Tax);
   * payment/deposit entries on A/R are separate and intentionally untouched.
   */
  private async syncInvoiceRevenueGl(invoiceId: string) {
    if (!(await this.gl.isAutoPostingEnabled())) return;

    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        invoiceNumber: true,
        patientId: true,
        baseSubtotal: true,
        baseDiscountAmount: true,
        baseTaxAmount: true,
        // Items + their resolved revenue accounts so the revenue delta can be
        // split across the same per-procedure / per-category accounts that
        // activateInvoice posts to (procedure → category → default).
        items: {
          select: {
            total: true,
            originalTotal: true,
            exchangeRate: true,
            procedure: {
              select: {
                revenueAccountId: true,
                category: { select: { revenueAccountId: true } },
              },
            },
            treatmentProcedure: {
              select: {
                procedure: {
                  select: {
                    revenueAccountId: true,
                    category: { select: { revenueAccountId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!inv || inv.status !== InvoiceStatus.POSTED) return;

    const targetRevenueTotal = M.money(inv.baseSubtotal ?? 0);
    const targetDiscount = M.money(inv.baseDiscountAmount ?? 0);
    const targetTax = M.money(inv.baseTaxAmount ?? 0);

    // Resolve the fallback (default) revenue account id once. If it can't be
    // resolved we can't reconcile per-account safely — bail rather than drift.
    const defaultAcc = await this.prisma.ledgerAccount.findUnique({
      where: { systemKey: GL.TREATMENT_REVENUE },
      select: { id: true },
    });
    if (!defaultAcc) return;
    const defaultAccountId = defaultAcc.id;

    // ── Target gross revenue per account id (base currency) ──────────────────
    // Everything resolves to a concrete accountId (default bucket included) so a
    // procedure mapped to the Treatment Revenue account itself merges correctly.
    const targetByAccountId = new Map<string, Money>();
    let bucketed = M.zero();
    for (const item of inv.items) {
      const base = M.money(
        M.mul(M.of(item.originalTotal ?? item.total), M.of(item.exchangeRate ?? 1)),
      );
      const proc =
        (item as any).treatmentProcedure?.procedure ??
        (item as any).procedure ??
        null;
      const accId =
        proc?.revenueAccountId ??
        proc?.category?.revenueAccountId ??
        defaultAccountId;
      targetByAccountId.set(
        accId,
        M.add(targetByAccountId.get(accId) ?? M.zero(), base),
      );
      bucketed = M.add(bucketed, base);
    }
    // Push any rounding residual into the default bucket so Σ(targets) ties to
    // the invoice's stored baseSubtotal exactly (A/R must reconcile precisely).
    const residual = M.sub(targetRevenueTotal, bucketed);
    if (!M.isZero(residual)) {
      targetByAccountId.set(
        defaultAccountId,
        M.add(targetByAccountId.get(defaultAccountId) ?? M.zero(), residual),
      );
    }

    // ── Net revenue already posted for this invoice, per account ─────────────
    // Scan INCOME accounts (excluding the contra Sales Discount, handled below)
    // so remapped procedures' old accounts get wound back to zero too.
    const discountAcc = await this.prisma.ledgerAccount.findUnique({
      where: { systemKey: GL.SALES_DISCOUNT },
      select: { id: true },
    });
    const postedRevenue = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          sourceType: 'INVOICE',
          sourceId: invoiceId,
          status: 'POSTED',
        },
        account: {
          type: 'INCOME',
          ...(discountAcc ? { id: { not: discountAcc.id } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const netByAccountId = new Map<string, Money>();
    for (const row of postedRevenue) {
      netByAccountId.set(
        row.accountId,
        M.sub(M.money(row._sum.credit ?? 0), M.money(row._sum.debit ?? 0)),
      );
    }

    // ── Revenue deltas across union(target, already-posted) ──────────────────
    const allRevenueAccountIds = new Set<string>([
      ...targetByAccountId.keys(),
      ...netByAccountId.keys(),
    ]);
    let totalRevDelta = M.zero();
    const revenueLegs: any[] = [];
    for (const accId of allRevenueAccountIds) {
      const target = targetByAccountId.get(accId) ?? M.zero();
      const net = netByAccountId.get(accId) ?? M.zero();
      const delta = M.sub(target, net);
      totalRevDelta = M.add(totalRevDelta, delta);
      const line = this.signedGlLeg({ accountId: accId }, delta, false);
      if (line) revenueLegs.push(line);
    }

    const discDelta = M.sub(
      targetDiscount,
      await this.netPostedForInvoice(invoiceId, { systemKey: GL.SALES_DISCOUNT }, 'debit'),
    );
    const taxDelta = M.sub(
      targetTax,
      await this.netPostedForInvoice(invoiceId, { systemKey: GL.TAX_PAYABLE }, 'credit'),
    );
    const arDelta = M.add(M.sub(totalRevDelta, discDelta), taxDelta);

    const lines = [
      this.signedGlLeg({ key: GL.ACCOUNTS_RECEIVABLE }, arDelta, true, inv.patientId),
      ...revenueLegs,
      this.signedGlLeg({ key: GL.SALES_DISCOUNT }, discDelta, true),
      this.signedGlLeg({ key: GL.TAX_PAYABLE }, taxDelta, false),
    ].filter((l): l is NonNullable<typeof l> => l !== null);

    if (lines.length === 0) return;

    await this.gl.safePost({
      memo: `Invoice ${inv.invoiceNumber} revenue/discount/tax adjustment`,
      sourceType: 'INVOICE',
      sourceId: invoiceId,
      patientId: inv.patientId,
      skipIfZero: true,
      lines,
    });
  }

  /**
   * Net amount already posted for an invoice on one account (by systemKey or id),
   * returned on the requested normal side. Used by the revenue/discount/tax
   * reconciliation in {@link syncInvoiceRevenueGl}.
   */
  private async netPostedForInvoice(
    invoiceId: string,
    ref: { systemKey?: string; accountId?: string },
    side: 'credit' | 'debit',
  ): Promise<Money> {
    let accountId = ref.accountId;
    if (!accountId && ref.systemKey) {
      const acc = await this.prisma.ledgerAccount.findUnique({
        where: { systemKey: ref.systemKey },
        select: { id: true },
      });
      if (!acc) return M.zero();
      accountId = acc.id;
    }
    if (!accountId) return M.zero();
    const agg = await this.prisma.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: {
          sourceType: 'INVOICE',
          sourceId: invoiceId,
          status: 'POSTED',
        },
      },
      _sum: { debit: true, credit: true },
    });
    const debit = M.money(agg._sum.debit ?? 0);
    const credit = M.money(agg._sum.credit ?? 0);
    return side === 'credit' ? M.sub(credit, debit) : M.sub(debit, credit);
  }

  /**
   * Place a signed amount on an account's normal side, flipping to the opposite
   * side when negative — so every emitted line carries a single non-negative
   * amount. Accepts either a systemKey (`key`) or a raw `accountId`. Returns null
   * for a zero amount (no line needed).
   */
  private signedGlLeg(
    ref: { key?: string; accountId?: string },
    signed: Money,
    normalDebit: boolean,
    patientId?: string,
  ): Record<string, unknown> | null {
    const amt = M.money(signed);
    if (M.isZero(amt)) return null;
    const negative = M.isNegative(amt);
    const abs = M.money(negative ? M.neg(amt) : amt);
    const onDebit = normalDebit ? !negative : negative;
    const target = ref.key ? { key: ref.key } : { accountId: ref.accountId };
    return onDebit
      ? { ...target, debit: abs, ...(patientId ? { patientId } : {}) }
      : { ...target, credit: abs, ...(patientId ? { patientId } : {}) };
  }

  /**
   * Change the invoice's display currency.
   *
   * - Allowed in DRAFT or POSTED state only.
   * - Item-level *base* values (originalUnitPrice × item.exchangeRate) are
   *   treated as invariant; we just re-project them into the new invoice
   *   currency via `newRate = baseCurrency → newCurrency`.
   * - amountPaid is reprojected from baseAmountPaid so receipts stay correct.
   * - FLAT discountValue is converted; PERCENT is currency-neutral.
   * - Returns the recalculated invoice.
   */
  async changeCurrency(id: string, dto: { currency: string }) {
    if (!dto?.currency) {
      throw new BadRequestException('currency is required');
    }
    const newCurrency = dto.currency.toUpperCase();

    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['DRAFT', 'POSTED'].includes(invoice.status)) {
      throw new BadRequestException(
        `Cannot change currency of a ${invoice.status} invoice`,
      );
    }

    const baseCurrency =
      invoice.baseCurrency || this.currency.getBaseCurrency();
    const oldRate = M.of(invoice.exchangeRate);

    // No-op if same currency: just recalc to be safe.
    if (newCurrency === invoice.currency) {
      return this.recalcAndSave(id);
    }

    // newRate represents: 1 baseCurrency = newRate × newCurrency
    const newRate: Money =
      newCurrency === baseCurrency
        ? M.of(1)
        : M.of(await this.currency.getExchangeRate(baseCurrency, newCurrency));

    await this.prisma.$transaction(async (tx) => {
      // 1) Convert each item to the new invoice currency, preserving its
      //    original-currency snapshot (so future currency changes stay lossless).
      // All arithmetic via M (Decimal) — chained mul of origUnitPrice * itemBaseRate
      // * newRate loses cents on JS Number.
      for (const item of invoice.items) {
        const origUnitPrice = M.of(item.originalUnitPrice ?? item.unitPrice);
        const origTotal = M.of(item.originalTotal ?? item.total);
        const itemBaseRate = M.of(item.exchangeRate ?? 1); // 1 orig = X base
        const qty = M.of(item.quantity);
        const origDiscount = M.max(
          M.sub(M.mul(qty, origUnitPrice), origTotal),
          0,
        );

        // Base-currency values (invariant)
        const baseUnitPrice = M.mul(origUnitPrice, itemBaseRate);
        const baseTotal = M.mul(origTotal, itemBaseRate);
        const baseDiscount = M.mul(origDiscount, itemBaseRate);

        // Project into new invoice currency, round once at the end
        const newUnitPrice = M.money(M.mul(baseUnitPrice, newRate));
        const newTotal = M.money(M.mul(baseTotal, newRate));
        const newDiscount = M.money(M.mul(baseDiscount, newRate));

        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            unitPrice: M.str(newUnitPrice),
            total: M.str(newTotal),
            discount: M.str(newDiscount),
          },
        });
      }

      // 2) Reproject amountPaid from base so receipts stay consistent.
      const newAmountPaid = M.money(M.mul(M.of(invoice.baseAmountPaid), newRate));

      // 3) Convert FLAT discount value (PERCENT is currency-neutral)
      let newDiscountValue: Money = M.of(invoice.discountValue);
      if (invoice.discountType === 'FLAT' && M.isPositive(oldRate)) {
        const baseDiscountValue = M.div(M.of(invoice.discountValue), oldRate);
        newDiscountValue = M.money(M.mul(baseDiscountValue, newRate));
      }

      // 4) Update invoice header. recalcAndSave will then recompute the
      //    aggregate totals from the freshly-converted items.
      await tx.invoice.update({
        where: { id },
        data: {
          currency: newCurrency,
          exchangeRate: M.str(newRate),
          amountPaid: M.str(newAmountPaid),
          discountValue: M.str(newDiscountValue),
        },
      });
    });

    return this.recalcAndSave(id);
  }

  async updateMeta(id: string, dto: { paymentTerms?: string; notes?: string }) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(dto.paymentTerms !== undefined && {
          paymentTerms: dto.paymentTerms,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      select: INVOICE_SELECT,
    });
  }

  // Atomic per-tenant sequence. The year is part of the sequence KEY so each
  // calendar year starts a fresh counter — matches tax-authority expectations.
  // Unified document numbering: INV-YY-NNNN.
  private async generateInvoiceNumber(
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    return this.docNum.next('INV', tx);
  }

  // RCPT-YY-NNNN
  private async generateReceiptNumber(
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    return this.docNum.next('RCT', tx);
  }
}
