// src/billing/invoice-lifecycle.service.ts
//
// Manages the Invoice state machine:
//   DRAFT → POSTED (activated) ─┬─ paymentStatus transitions to PARTIALLY_PAID / PAID
//                               └─ VOID (terminal — flips status only, see InvoicesService.voidInvoice)
//
// Key rule: LedgerEntries are ONLY posted at activation time (CHARGE type).
// Draft invoices are planning documents — no accounting impact until activated.
// There is no CLOSED status. `activatedAt` records the DRAFT→POSTED transition;
// fully-paid invoices stay POSTED with paymentStatus=PAID.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyService } from './currency.service';
import {
  InvoiceStatus,
  InvoicePaymentStatus,
  InvoiceItemType,
  LedgerEntryType,
  Prisma,
} from '@prisma/client';
import { withUniqueCodeRetry } from './utils/unique-code';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { GeneralLedgerService, GL } from '../general-ledger/general-ledger.service';
import { M, type Money } from '../common/money/money';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export interface AddEncounterItemDto {
  description: string;
  itemType: InvoiceItemType;
  quantity: number;
  unitPrice: number;
  discount?: number;
  currency?: string;
  exchangeRate?: number;
  notes?: string;
}

@Injectable()
export class InvoiceLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
    private readonly docNum: DocumentNumberService,
    private readonly gl: GeneralLedgerService,
  ) {}

  // ── Find or create the DRAFT invoice for a patient/visit/plan ─────────────
  //
  // Per the Adding Procedure spec:
  //   • If an existing DRAFT already covers this patient/visit/plan → return it
  //     unchanged (currency is the first caller's choice, and that currency
  //     becomes the "main" invoice currency for the rest of the visit).
  //   • Otherwise create a new DRAFT with the caller-supplied `currency`.
  //     Caller decides which currency to use:
  //       – partial payment → the deposit currency (initialPaymentCurrency)
  //       – pay in full     → the procedure currency
  //     The clinic's base currency is NOT used unless the caller explicitly
  //     requests it (pass `baseCurrency` as `currency`).
  //
  // `exchangeRate` is the source→base rate for the new invoice. For a
  // UGX-denominated invoice this stays 1; for USD it is the current rate.

  async getOrCreateDraft(
    patientId: string,
    visitId?: string | null,
    treatmentPlanId?: string | null,
    options?: { currency?: string; exchangeRate?: number },
  ) {
    const where: any = {
      patientId,
      status: InvoiceStatus.DRAFT,
    };
    if (visitId) where.visitId = visitId;
    if (treatmentPlanId) where.treatmentPlanId = treatmentPlanId;

    const existing = await this.prisma.invoice.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    // Wrap the create in a transaction so the document-number increment is
    // rolled back if the INSERT fails — otherwise a failure leaves a permanent
    // gap in the INV-YY-NNNN sequence. See DocumentNumberService header.
    const baseCurrency = this.currency.getBaseCurrency();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoiceNumber = await this.generateInvoiceNumber(tx);
        const currency = options?.currency ?? baseCurrency;
        const rate = options?.exchangeRate ?? 1;
        const isBase = currency === baseCurrency;

        return tx.invoice.create({
          data: {
          invoiceNumber,
          patientId,
          visitId: visitId ?? null,
          treatmentPlanId: treatmentPlanId ?? null,
          status: InvoiceStatus.DRAFT,
          currency,
          exchangeRate: rate,
          baseCurrency,
          // baseSubtotal / baseTotal / baseBalance are kept in the clinic base
          // currency. For a base-currency invoice, baseX === X. For a foreign
          // currency invoice, baseX = X * rate.
          subtotal: 0,
          discountAmount: 0,
          taxPercent: 0,
          taxAmount: 0,
          total: 0,
          amountPaid: 0,
          balance: 0,
          baseSubtotal: 0,
          baseDiscountAmount: 0,
          baseTaxAmount: 0,
          baseTotal: 0,
          baseAmountPaid: 0,
          baseBalance: 0,
          // The patient's chosen deposit is persisted here at invoice creation
          // time so the deposit currency is locked to the invoice currency.
          // (The spec calls these `initialCurrency` + `initialReceipt`; the
          //  schema uses the more verbose `initialPaymentCurrency` +
          //  `initialPaymentAmount`. See invoices.service.ts for the same.)
          ...(isBase ? {} : {}),
          },
        });
      });
    } catch (e) {
      // H4: a concurrent first-procedure add raced us to create the DRAFT for
      // this (patient, visit, plan). The partial unique index
      // `invoices_one_active_draft` rejects the second insert — return the
      // winner instead of creating a duplicate draft that could be activated
      // and bill the visit twice.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const winner = await this.prisma.invoice.findFirst({
          where,
          orderBy: { createdAt: 'desc' },
        });
        if (winner) return winner;
      }
      throw e;
    }
  }

  // ── Add a TreatmentProcedure as a line item on the visit's invoice ──────────
  //
  //  Resolution order:
  //    1. Existing POSTED invoice for this visit
  //       → append item + post a CHARGE ledger entry immediately
  //    2. Existing DRAFT invoice for this visit / plan
  //       → append item only (ledger entry is posted at activation)
  //    3. No invoice yet
  //       → create a new DRAFT and append

  async addProcedureItem(
    patientId: string,
    visitId: string | null,
    treatmentPlanId: string | null,
    tp: {
      id: string;
      description: string;
      quantity: number;
      pricePerUnit: number;
      discountAmount: number;
      taxAmount: number;
      totalPrice: number;
      currency: string;
      exchangeRate?: number | null;
      baseAmount: number;
    },
    initialPaymentAmount?: number | null,
    initialPaymentCurrency?: string | null,
  ) {
    // ── 1. Resolve the invoice to use ────────────────────────────────────────
    let invoice: Awaited<ReturnType<typeof this.prisma.invoice.findFirst>>;
    let invoiceIsActive = false;

    if (visitId) {
      // Check for an already-posted invoice on this visit first
      const activeInv = await this.prisma.invoice.findFirst({
        where: {
          patientId,
          visitId,
          status: InvoiceStatus.POSTED,
        },
        orderBy: { activatedAt: 'desc' },
      });
      if (activeInv) {
        invoice = activeInv;
        invoiceIsActive = true;
      }
    }

    if (!invoiceIsActive) {
      // Decide the DRAFT invoice's main currency per the Adding Procedure spec.
      //
      // Resolution order:
      //   1. Existing DRAFT already on file → reuse it as-is. The first
      //      caller's currency wins; subsequent procedures must use whatever
      //      currency that draft is in (the line-item conversion is handled
      //      by `toInvoiceCcy` below).
      //   2. No existing DRAFT + partial payment → use the deposit currency
      //      (initialPaymentCurrency) as the new invoice's main currency,
      //      with rate 1 (the patient already chose to pay in this currency).
      //   3. No existing DRAFT + pay in full → use the procedure's currency.
      //   4. No deposit info available → fall back to the clinic base
      //      currency (UGX) for backward compatibility.
      const existingDraft = await this.prisma.invoice.findFirst({
        where: {
          patientId,
          status: InvoiceStatus.DRAFT,
          ...(visitId ? { visitId } : {}),
          ...(treatmentPlanId ? { treatmentPlanId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingDraft) {
        invoice = existingDraft;
      } else {
        const baseCurrency = this.currency.getBaseCurrency();
        let newCurrency: string;
        let newRate: number;
        if (
          initialPaymentAmount != null &&
          initialPaymentAmount > 0 &&
          initialPaymentCurrency
        ) {
          // Partial: invoice currency = deposit currency.
          newCurrency = initialPaymentCurrency;
          newRate = 1;
        } else if (tp.currency && tp.currency !== baseCurrency) {
          // Pay in full in a non-base currency: invoice currency = procedure
          // currency, rate = the procedure's source→base rate.
          newCurrency = tp.currency;
          newRate = toNum(tp.exchangeRate ?? 1);
        } else {
          // Base-currency procedure OR no deposit info: stay in base.
          newCurrency = baseCurrency;
          newRate = 1;
        }
        invoice = await this.getOrCreateDraft(
          patientId,
          visitId,
          treatmentPlanId,
          { currency: newCurrency, exchangeRate: newRate },
        );
      }
    }

    // ── 2. Build the invoice-item payload ────────────────────────────────────
    const existing = await this.prisma.invoiceItem.findFirst({
      where: { invoiceId: invoice!.id, treatmentProcedureId: tp.id },
    });

    const discount = toNum(tp.discountAmount);
    // tp.exchangeRate is the source→base rate (e.g. USD→UGX); keep it on the
    // item so recalc can derive base amounts from the original snapshot.
    const rate = toNum(tp.exchangeRate ?? 1);
    const baseCurrency = this.currency.getBaseCurrency();
    const invoiceCurrency = invoice!.currency;

    // Convert a source-currency amount into the invoice's currency. The item's
    // unitPrice/total/discount MUST be stored in the invoice currency so the
    // invoice subtotal (sum of item.total) is internally consistent.
    const toInvoiceCcy = async (amount: number): Promise<number> => {
      if (amount === 0 || tp.currency === invoiceCurrency) return amount;
      if (invoiceCurrency === baseCurrency) return amount * rate;
      const conv = await this.currency.convert(
        amount,
        tp.currency,
        invoiceCurrency,
      );
      return toNum(conv.amount);
    };

    const unitPriceInv =
      Math.round((await toInvoiceCcy(toNum(tp.pricePerUnit))) * 100) / 100;
    const totalInv =
      Math.round((await toInvoiceCcy(toNum(tp.totalPrice))) * 100) / 100;
    const discountInv = Math.round((await toInvoiceCcy(discount)) * 100) / 100;

    const itemData = {
      invoiceId: invoice!.id,
      description: tp.description,
      itemType: InvoiceItemType.TREATMENT_PROCEDURE,
      treatmentProcedureId: tp.id,
      quantity: tp.quantity,
      unitPrice: unitPriceInv,
      discount: discountInv,
      total: totalInv,
      toothNumbers: [],
      originalCurrency: tp.currency,
      originalUnitPrice: toNum(tp.pricePerUnit),
      originalTotal: toNum(tp.totalPrice),
      exchangeRate: rate !== 1 ? rate : 1,
    };

    // ── 3a. ACTIVE / PARTIALLY_PAID — item + CHARGE ledger entry in one tx ───
    if (invoiceIsActive) {
      const baseAmt =
        tp.currency === baseCurrency
          ? toNum(tp.totalPrice)
          : toNum(tp.totalPrice) * rate;

      // Resolve the procedure's mapped revenue account (→ category → default).
      const revenueAccountId =
        await this.revenueAccountIdForTreatmentProcedure(tp.id);

      await this.prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.invoiceItem.update({ where: { id: existing.id }, data: itemData });
        } else {
          await tx.invoiceItem.create({ data: itemData });
        }

        // Post a CHARGE ledger entry only for brand-new items.
        // On an update the original entry already exists — recalcActive adjusts totals.
        if (!existing) {
          await withUniqueCodeRetry(
            () => this.generateLedgerEntryCode(tx),
            (entryCode) =>
              tx.ledgerEntry.create({
                data: {
                  entryCode,
                  patientId,
                  visitId: visitId ?? null,
                  type: LedgerEntryType.CHARGE,
                  description: tp.description,
                  sourceType: InvoiceItemType.TREATMENT_PROCEDURE,
                  sourceId: tp.id,
                  quantity: tp.quantity,
                  pricePerUnit: toNum(tp.pricePerUnit),
                  subtotalPrice: toNum(tp.pricePerUnit) * tp.quantity,
                  discountAmount: discount,
                  taxAmount: toNum(tp.taxAmount),
                  totalPrice: toNum(tp.totalPrice),
                  currency: tp.currency,
                  exchangeRate: rate !== 1 ? rate : null,
                  baseCurrency,
                  baseAmount: Math.round(baseAmt * 100) / 100,
                  status: 'INVOICED',
                },
              }),
          );

          // Incremental revenue recognition: an item added to an already-POSTED
          // invoice raises the receivable, so post DR A/R · CR Revenue now.
          await this.gl.safePost(
            {
              memo: `Item added to invoice ${invoice!.invoiceNumber}: ${tp.description}`,
              sourceType: 'INVOICE',
              sourceId: invoice!.id,
              patientId,
              skipIfZero: true,
              lines: [
                { key: GL.ACCOUNTS_RECEIVABLE, debit: M.money(baseAmt), patientId },
                revenueAccountId
                  ? { accountId: revenueAccountId, credit: M.money(baseAmt) }
                  : { key: GL.TREATMENT_REVENUE, credit: M.money(baseAmt) },
              ],
            },
            tx,
          );
        }
      });

      if (initialPaymentAmount != null && initialPaymentAmount > 0) {
        // Spec wording: deposit stored as "initialCurrency & initialReceipt".
        // DB field names: initialPaymentCurrency / initialPaymentAmount.
        await this.prisma.invoice.update({
          where: { id: invoice!.id },
          data: {
            initialPaymentAmount,
            initialPaymentCurrency: initialPaymentCurrency ?? null,
          },
        });
      }

      return this.recalcActive(invoice!.id);
    }

    // ── 3b. DRAFT — append item only (ledger entry is posted at activation) ───
    if (existing) {
      await this.prisma.invoiceItem.update({ where: { id: existing.id }, data: itemData });
    } else {
      await this.prisma.invoiceItem.create({ data: itemData });
    }

    // If a partial payment amount was requested, store it on the invoice
    // (only set if the caller explicitly passed a value — don't overwrite existing)
    //
    // Spec wording: "User's initial deposit amount & currency to pay is
    // registered in the draft invoice as initialCurrency & initialReceipt".
    // Schema field names: `initialPaymentAmount` (= spec's `initialReceipt`)
    // and `initialPaymentCurrency` (= spec's `initialCurrency`). The amount
    // is kept in the deposit currency — NOT converted to the invoice
    // currency — so the deposit receipt can be displayed in the patient's
    // chosen currency even when the invoice itself is in a different one.
    if (initialPaymentAmount != null && initialPaymentAmount > 0) {
      await this.prisma.invoice.update({
        where: { id: invoice!.id },
        data: {
          initialPaymentAmount,
          // Store the currency the patient agreed to pay the deposit in (e.g. "USD").
          // The amount is kept in that same currency — NOT converted to the invoice currency.
          initialPaymentCurrency: initialPaymentCurrency ?? null,
        },
      });
    }

    return this.recalcDraft(invoice!.id);
  }

  // ── Update pricing on an existing TreatmentProcedure invoice line ─────────
  //
  // Called from the edit-procedure flow when the doctor changes
  // totalPrice / pricePerUnit / quantity / discountAmount / taxAmount / currency
  // AFTER the procedure has already been added to an invoice.
  //
  // SAFETY:
  //   • If the linked invoice is PAID (or has any payments), we refuse and
  //     throw ConflictException — modifying a paid line item would corrupt the
  //     settled amount and break the audit trail.
  //   • If the linked invoice is VOID or CANCELLED, the item is already out of
  //     billing; we no-op (the TP update is the source of truth going forward).
  //   • If no InvoiceItem exists for the TP, we create one (so an edit on a TP
  //     whose addProcedureItem call had previously failed is recovered here).
  //
  // Returns the affected invoiceId (null if no item was touched).
  async updateProcedureItemPricing(
    treatmentProcedureId: string,
    pricing: {
      description: string;
      quantity: number;
      pricePerUnit: number;
      discountAmount: number;
      taxAmount: number;
      totalPrice: number;
      currency: string;
      exchangeRate?: number | null;
    },
  ): Promise<{ invoiceId: string | null; created: boolean; invoiceStatus: string | null }> {
    const item = await this.prisma.invoiceItem.findFirst({
      where: { treatmentProcedureId },
      include: {
        invoice: {
          select: {
            id: true,
            status: true,
            paymentStatus: true,
            amountPaid: true,
            currency: true,
          },
        },
      },
    });

    if (!item) {
      // No item yet — defer to addProcedureItem (which handles DRAFT creation).
      return { invoiceId: null, created: false, invoiceStatus: null };
    }

    if (item.invoice.status === InvoiceStatus.VOID) {
      // Invoice is out of play — nothing to update on the billing side.
      return { invoiceId: item.invoice.id, created: false, invoiceStatus: item.invoice.status };
    }

    // A POSTED invoice has already had a CHARGE ledger entry posted to the
    // general ledger (see addProcedureItem). Mutating its line items would
    // corrupt the posted amount, so we refuse and ask the user to either
    // void the invoice or issue a credit note.
    if (item.invoice.status === InvoiceStatus.POSTED) {
      throw new ConflictException(
        `Cannot change price — invoice ${item.invoice.id} is POSTED ` +
          `(already billed to the general ledger). ` +
          `Void the invoice or create a credit note to change the price.`,
      );
    }

    const isPaid =
      item.invoice.paymentStatus === InvoicePaymentStatus.PAID ||
      Number(item.invoice.amountPaid) > 0;
    if (isPaid) {
      throw new ConflictException(
        `Cannot change price — invoice ${item.invoice.id} has payments ` +
          `(paymentStatus=${item.invoice.paymentStatus}, amountPaid=${item.invoice.amountPaid}). ` +
          `Void or refund payments first.`,
      );
    }

    const baseCurrency = this.currency.getBaseCurrency();
    const invoiceCurrency = item.invoice.currency;
    const rate = toNum(pricing.exchangeRate ?? 1);

    const toInvoiceCcy = async (amount: number): Promise<number> => {
      if (amount === 0 || pricing.currency === invoiceCurrency) return amount;
      if (invoiceCurrency === baseCurrency) return amount * rate;
      const conv = await this.currency.convert(amount, pricing.currency, invoiceCurrency);
      return toNum(conv.amount);
    };

    const unitPriceInv = Math.round((await toInvoiceCcy(toNum(pricing.pricePerUnit))) * 100) / 100;
    const totalInv = Math.round((await toInvoiceCcy(toNum(pricing.totalPrice))) * 100) / 100;
    const discountInv = Math.round((await toInvoiceCcy(toNum(pricing.discountAmount))) * 100) / 100;

    await this.prisma.invoiceItem.update({
      where: { id: item.id },
      data: {
        description: pricing.description,
        quantity: pricing.quantity,
        unitPrice: unitPriceInv,
        discount: discountInv,
        total: totalInv,
        originalCurrency: pricing.currency,
        originalUnitPrice: toNum(pricing.pricePerUnit),
        originalTotal: toNum(pricing.totalPrice),
        exchangeRate: rate !== 1 ? rate : 1,
      },
    });

    await this.recalcInvoice(item.invoice.id);

    return { invoiceId: item.invoice.id, created: false, invoiceStatus: item.invoice.status };
  }

  // ── Remove a TreatmentProcedure item from its Draft invoice ───────────────

  async removeProcedureItem(treatmentProcedureId: string) {
    const item = await this.prisma.invoiceItem.findFirst({
      where: { treatmentProcedureId },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!item) return;

    if (!['DRAFT', 'ACTIVE'].includes(item.invoice.status)) {
      throw new BadRequestException(
        `Cannot remove items from a ${item.invoice.status} invoice`,
      );
    }

    await this.prisma.invoiceItem.delete({ where: { id: item.id } });
    await this.recalcDraft(item.invoice.id);
  }

  // ── Reverse ALL billing for a treatment procedure (cancel / remove) ────────
  //
  // Runs INSIDE the caller's transaction so the billing reversal commits or
  // rolls back atomically with the clinical cancellation. Call recalcInvoice()
  // afterwards (post-commit) to refresh invoice totals.
  //
  // It does two things:
  //   1. VOIDs every non-void CHARGE ledger entry sourced from this procedure
  //      (these are written by addProcedureItem when the invoice is POSTED).
  //   2. Deletes the procedure's InvoiceItem so the patient stops being billed.
  //
  // SAFETY: if the invoice already has payments against it, we refuse to silently
  // drop the line (that would corrupt the paid/total relationship). The caller's
  // whole transaction rolls back and the user is told to refund/void first.
  async voidProcedureBillingTx(
    tx: Prisma.TransactionClient,
    treatmentProcedureId: string,
    reason?: string,
  ): Promise<{ invoiceId: string | null }> {
    await tx.ledgerEntry.updateMany({
      where: {
        sourceType: InvoiceItemType.TREATMENT_PROCEDURE,
        sourceId: treatmentProcedureId,
        status: { not: 'VOID' },
      },
      data: {
        status: 'VOID',
        notes: reason ? `Voided: ${reason}` : 'Procedure cancelled/removed',
      },
    });

    const item = await tx.invoiceItem.findFirst({
      where: { treatmentProcedureId },
      include: {
        invoice: { select: { id: true, status: true, amountPaid: true } },
      },
    });
    if (!item) return { invoiceId: null };

    // Whole invoice already void — nothing else to reverse.
    if (item.invoice.status === InvoiceStatus.VOID) {
      return { invoiceId: null };
    }

    if (toNum(item.invoice.amountPaid) > 0) {
      throw new BadRequestException(
        'This procedure is billed on an invoice that already has payments. ' +
          'Void or refund the payment before cancelling/removing the procedure.',
      );
    }

    await tx.invoiceItem.delete({ where: { id: item.id } });
    return { invoiceId: item.invoice.id };
  }

  // ── Recompute invoice totals after a structural change (post-commit) ───────
  async recalcInvoice(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    if (!inv) return;
    if (inv.status === InvoiceStatus.DRAFT) return this.recalcDraft(invoiceId);
    if (inv.status === InvoiceStatus.POSTED) return this.recalcActive(invoiceId);
  }

  // ── Activate a Draft invoice — posts CHARGE ledger entries ─────────────────

  async activateInvoice(invoiceId: string, activatedBy?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          include: {
            // Resolve each item's GL revenue account: a direct procedure line,
            // or the procedure behind a treatment-procedure line. Category is
            // the fallback when the procedure has no own mapping.
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

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ConflictException(
        `Invoice is already ${invoice.status} — only DRAFT invoices can be activated`,
      );
    }
    if (!invoice.items.length) {
      throw new BadRequestException('Cannot activate an invoice with no items');
    }

    const baseCurrency = this.currency.getBaseCurrency();

    return this.prisma.$transaction(async (tx) => {
      // Accumulate the base-currency gross revenue + invoice-currency subtotal
      // so we can post a single balanced journal entry that books discount to
      // contra-revenue and tax to a liability (DR A/R == final invoice total).
      let totalBaseRevenue = M.zero();
      let subtotalInv = 0;

      // Split gross revenue across the GL revenue account each item maps to
      // (procedure.revenueAccountId → category.revenueAccountId → default).
      // `defaultRevenue` collects items with no mapping (→ TREATMENT_REVENUE).
      const revenueByAccountId = new Map<string, Money>();
      let defaultRevenue = M.zero();

      // Post one CHARGE ledger entry per invoice item for audit granularity
      for (const item of invoice.items) {
        const entryCurrency = item.originalCurrency ?? invoice.currency;
        const rate = toNum(item.exchangeRate ?? invoice.exchangeRate ?? 1);
        const originalTotal = toNum(item.originalTotal ?? item.total);
        const baseAmt = entryCurrency === baseCurrency
          ? originalTotal
          : originalTotal * rate;

        const baseAmtMoney = M.money(baseAmt);
        totalBaseRevenue = M.add(totalBaseRevenue, baseAmtMoney);
        subtotalInv += toNum(item.total);

        // Bucket this item's gross contribution under its resolved revenue
        // account (Σ buckets == grossBase, so the journal stays balanced).
        const itemProc =
          (item as any).treatmentProcedure?.procedure ??
          (item as any).procedure ??
          null;
        const itemRevenueAccountId = this.pickRevenueAccountId(itemProc);
        if (itemRevenueAccountId) {
          revenueByAccountId.set(
            itemRevenueAccountId,
            M.add(
              revenueByAccountId.get(itemRevenueAccountId) ?? M.zero(),
              baseAmtMoney,
            ),
          );
        } else {
          defaultRevenue = M.add(defaultRevenue, baseAmtMoney);
        }

        await withUniqueCodeRetry(
          () => this.generateLedgerEntryCode(tx),
          (entryCode) =>
            tx.ledgerEntry.create({
              data: {
                entryCode,
                patientId: invoice.patientId,
                visitId: invoice.visitId ?? null,
                type: LedgerEntryType.CHARGE,
                description: item.description,
                sourceType: item.itemType ?? 'INVOICE_ITEM',
                sourceId: item.treatmentProcedureId ?? item.id,
                quantity: item.quantity,
                pricePerUnit: toNum(item.unitPrice),
                subtotalPrice: toNum(item.unitPrice) * item.quantity,
                discountAmount: toNum(item.discount ?? 0),
                taxAmount: 0,
                totalPrice: toNum(item.total),
                currency: entryCurrency,
                exchangeRate: rate !== 1 ? rate : null,
                baseCurrency,
                baseAmount: Math.round(baseAmt * 100) / 100,
                notes: activatedBy ? `Activated by ${activatedBy}` : null,
                status: 'INVOICED',
              },
            }),
        );
      }

      // ── Double-entry posting: recognise revenue, discount & tax ──────────
      // An invoice-level discount is booked to contra-revenue and tax to a
      // liability, so DR A/R equals the invoice's FINAL payable total and the
      // GL reconciles to the invoice. Balanced by construction:
      //   DR A/R (net total) + DR Sales Discount == CR Revenue (gross) + CR Tax
      const grossBase = M.money(totalBaseRevenue);
      const dv = toNum(invoice.discountValue);
      const discAmtInv =
        invoice.discountType === 'PERCENT' ? (subtotalInv * dv) / 100 : dv;
      const discountRatio =
        subtotalInv > 0 ? M.div(M.of(discAmtInv), M.of(subtotalInv)) : M.zero();
      const baseDiscount = M.money(M.mul(grossBase, discountRatio));
      const taxPercent = toNum(invoice.taxPercent);
      const baseTaxable = M.sub(grossBase, baseDiscount);
      const baseTax = M.money(M.applyPct(baseTaxable, taxPercent));
      const baseTotal = M.money(M.add(baseTaxable, baseTax));

      // One credit line per distinct revenue account, plus the default bucket.
      // Σ(revenue credits) == grossBase, so the entry balances exactly as before.
      const revenueLines: any[] = [];
      if (M.isPositive(defaultRevenue)) {
        revenueLines.push({
          key: GL.TREATMENT_REVENUE,
          credit: M.money(defaultRevenue),
        });
      }
      for (const [accountId, amt] of revenueByAccountId) {
        if (M.isPositive(amt)) {
          revenueLines.push({ accountId, credit: M.money(amt) });
        }
      }
      // Safety net: never post an unbalanced entry if bucketing produced nothing.
      if (revenueLines.length === 0 && M.isPositive(grossBase)) {
        revenueLines.push({ key: GL.TREATMENT_REVENUE, credit: grossBase });
      }

      await this.gl.safePost(
        {
          memo: `Invoice ${invoice.invoiceNumber} posted`,
          sourceType: 'INVOICE',
          sourceId: invoice.id,
          patientId: invoice.patientId,
          postedById: activatedBy ?? null,
          skipIfZero: true,
          lines: [
            {
              key: GL.ACCOUNTS_RECEIVABLE,
              debit: baseTotal,
              patientId: invoice.patientId,
            },
            ...revenueLines,
            ...(M.isPositive(baseDiscount)
              ? [{ key: GL.SALES_DISCOUNT, debit: baseDiscount }]
              : []),
            ...(M.isPositive(baseTax)
              ? [{ key: GL.TAX_PAYABLE, credit: baseTax }]
              : []),
          ],
        },
        tx,
      );

      // ── Apply any advance the patient paid while the invoice was DRAFT ────
      // Those payments were booked DR Cash · CR Patient Deposits (a liability).
      // Now that there's a receivable, move the deposit against it (capped at
      // the receivable): DR Patient Deposits · CR Accounts Receivable.
      const depositBase = M.money(invoice.baseAmountPaid ?? 0);
      if (M.isPositive(depositBase)) {
        const applied = M.money(M.min(depositBase, baseTotal));
        if (M.isPositive(applied)) {
          await this.gl.safePost(
            {
              memo: `Apply patient deposit to invoice ${invoice.invoiceNumber}`,
              sourceType: 'INVOICE',
              sourceId: invoice.id,
              patientId: invoice.patientId,
              postedById: activatedBy ?? null,
              lines: [
                { key: GL.PATIENT_DEPOSITS, debit: applied },
                {
                  key: GL.ACCOUNTS_RECEIVABLE,
                  credit: applied,
                  patientId: invoice.patientId,
                },
              ],
            },
            tx,
          );
        }
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.POSTED,
          activatedAt: new Date(),
          issuedAt: new Date(),
        },
      });
    });

    // Sync stored invoice totals (discount/tax/balance) so the invoice row
    // reconciles with the GL entry we just posted.
    return this.recalcActive(invoiceId);
  }

  // ── Add an encounter item to a DRAFT or POSTED invoice ─────────────────────

  async addEncounterItem(invoiceId: string, dto: AddEncounterItemDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        currency: true,
        exchangeRate: true,
        patientId: true,
        visitId: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (!['DRAFT', 'POSTED'].includes(invoice.status)) {
      throw new BadRequestException(
        `Items can only be added to DRAFT or POSTED invoices (current: ${invoice.status})`,
      );
    }

    const isDraft = invoice.status === InvoiceStatus.DRAFT;
    const baseCurrency = this.currency.getBaseCurrency();
    const itemCurrency = dto.currency || invoice.currency;
    const discount = dto.discount ?? 0;

    // ── Currency model ────────────────────────────────────────────────────
    // We store every item against a lossless base-currency snapshot so the
    // invoice can be re-priced into any currency later (see changeCurrency):
    //   • originalCurrency / originalUnitPrice / originalTotal  → as supplied
    //   • exchangeRate  → source → base rate  (NOT source → invoice)
    //   • unitPrice / total / discount        → projected into invoice currency
    //
    // The caller supplies unitPrice + discount in `itemCurrency`. If it passes
    // `dto.exchangeRate`, we trust it as the source→base rate; otherwise we look
    // it up. The base→invoice leg uses the invoice's own stored rate so the new
    // item is priced at the same rate as the rest of the invoice.
    const baseToInvoice =
      invoice.currency === baseCurrency
        ? 1
        : toNum(invoice.exchangeRate) ||
          (await this.currency.getExchangeRate(baseCurrency, invoice.currency));

    let srcToBase: number;
    if (itemCurrency === baseCurrency) {
      srcToBase = 1;
    } else if (itemCurrency === invoice.currency) {
      // Item is already priced in the invoice currency (e.g. a manually typed
      // line). Invert the invoice's own base rate so the price round-trips back
      // to exactly what the caller supplied, regardless of the live rate.
      srcToBase = baseToInvoice ? 1 / baseToInvoice : 1;
    } else {
      srcToBase =
        dto.exchangeRate ??
        (await this.currency.getExchangeRate(itemCurrency, baseCurrency));
    }

    // Projection source → invoice currency. When the item already matches the
    // invoice currency this is exactly 1 (no drift from rounding).
    const srcToInvoice =
      itemCurrency === invoice.currency ? 1 : srcToBase * baseToInvoice;

    // Source-currency snapshot (exactly what the caller gave us).
    const originalTotal =
      Math.round((dto.quantity * dto.unitPrice - discount) * 100) / 100;

    // Projected into the invoice currency for the display/charged columns.
    const unitPrice = Math.round(dto.unitPrice * srcToInvoice * 100) / 100;
    const invDiscount = Math.round(discount * srcToInvoice * 100) / 100;
    const itemTotal =
      Math.round((dto.quantity * unitPrice - invDiscount) * 100) / 100;

    // Base-currency total (invariant, used for ledger + future re-pricing).
    const baseTotal = Math.round(originalTotal * srcToBase * 100) / 100;

    // Rate persisted on the item must be source→base for changeCurrency.
    const rate = srcToBase;

    if (isDraft) {
      // DRAFT — create item only (ledger entries are posted at activation)
      await this.prisma.invoiceItem.create({
        data: {
          invoiceId,
          description: dto.description,
          itemType: dto.itemType,
          quantity: dto.quantity,
          unitPrice,
          discount: invDiscount,
          total: itemTotal,
          toothNumbers: [],
          originalCurrency: itemCurrency,
          originalUnitPrice: dto.unitPrice,
          originalTotal,
          exchangeRate: rate,
        },
      });
      return this.recalcDraft(invoiceId);
    }

    // ACTIVE / PARTIALLY_PAID — create item + post CHARGE ledger entry
    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.create({
        data: {
          invoiceId,
          description: dto.description,
          itemType: dto.itemType,
          quantity: dto.quantity,
          unitPrice,
          discount: invDiscount,
          total: itemTotal,
          toothNumbers: [],
          originalCurrency: itemCurrency,
          originalUnitPrice: dto.unitPrice,
          originalTotal,
          exchangeRate: rate,
        },
      });

      await withUniqueCodeRetry(
        () => this.generateLedgerEntryCode(tx),
        (entryCode) =>
          tx.ledgerEntry.create({
            data: {
              entryCode,
              patientId: invoice.patientId,
              visitId: invoice.visitId ?? null,
              type: LedgerEntryType.CHARGE,
              description: dto.description,
              sourceType: dto.itemType,
              quantity: dto.quantity,
              pricePerUnit: dto.unitPrice,
              subtotalPrice: dto.quantity * dto.unitPrice,
              discountAmount: discount,
              taxAmount: 0,
              totalPrice: originalTotal,
              currency: itemCurrency,
              exchangeRate: rate !== 1 ? rate : null,
              baseCurrency,
              baseAmount: Math.round(baseTotal * 100) / 100,
              notes: dto.notes ?? null,
              status: 'INVOICED',
            },
          }),
      );

      // Incremental revenue recognition for an item added to a POSTED invoice.
      await this.gl.safePost(
        {
          memo: `Item added to invoice ${invoice.id}: ${dto.description}`,
          sourceType: 'INVOICE',
          sourceId: invoiceId,
          patientId: invoice.patientId,
          skipIfZero: true,
          lines: [
            {
              key: GL.ACCOUNTS_RECEIVABLE,
              debit: M.money(baseTotal),
              patientId: invoice.patientId,
            },
            { key: GL.TREATMENT_REVENUE, credit: M.money(baseTotal) },
          ],
        },
        tx,
      );
    });

    return this.recalcActive(invoiceId);
  }

  // ── Get draft invoice summary for a patient/visit ─────────────────────────

  async getDraftSummary(patientId: string, visitId?: string) {
    const where: any = { patientId, status: InvoiceStatus.DRAFT };
    if (visitId) where.visitId = visitId;

    return this.prisma.invoice.findMany({
      where,
      include: {
        items: {
          select: {
            id: true,
            description: true,
            itemType: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            total: true,
            treatmentProcedureId: true,
            originalCurrency: true,
            originalTotal: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async recalcDraft(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { amountPaid: true, baseAmountPaid: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found during recalc');

    const items = await this.prisma.invoiceItem.findMany({
      where: { invoiceId },
      select: { total: true, originalTotal: true, exchangeRate: true },
    });

    // All money math via M (Decimal) — see common/money/money.ts header.
    const subtotal: Money = M.money(M.sum(items.map((i) => i.total)));
    const baseSubtotal: Money = M.money(
      M.sum(
        items.map((i) =>
          M.mul(M.of(i.originalTotal ?? i.total), M.of(i.exchangeRate ?? 1)),
        ),
      ),
    );

    const amtPaid = M.of(invoice.amountPaid);
    const baseAmtPaid = M.of(invoice.baseAmountPaid);
    const balance = M.max(M.sub(subtotal, amtPaid), 0);
    const baseBalance = M.max(M.sub(baseSubtotal, baseAmtPaid), 0);

    const newPaymentStatus: InvoicePaymentStatus = M.lte(balance, '0.01')
      ? InvoicePaymentStatus.PAID
      : M.isPositive(amtPaid)
        ? InvoicePaymentStatus.PARTIALLY_PAID
        : InvoicePaymentStatus.UNPAID;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: M.str(subtotal),
        discountAmount: '0',
        taxAmount: '0',
        total: M.str(subtotal),
        balance: M.str(balance),
        baseSubtotal: M.str(baseSubtotal),
        baseDiscountAmount: '0',
        baseTaxAmount: '0',
        baseTotal: M.str(baseSubtotal),
        baseBalance: M.str(baseBalance),
        paymentStatus: newPaymentStatus,
      },
    });
  }

  private async recalcActive(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        taxPercent: true,
        discountValue: true,
        discountType: true,
        amountPaid: true,
        baseAmountPaid: true,
        status: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found during recalc');

    const items = await this.prisma.invoiceItem.findMany({
      where: { invoiceId },
      select: { total: true, originalTotal: true, exchangeRate: true },
    });

    const subtotal: Money = M.money(M.sum(items.map((i) => i.total)));
    const baseSubtotal: Money = M.money(
      M.sum(
        items.map((i) =>
          M.mul(M.of(i.originalTotal ?? i.total), M.of(i.exchangeRate ?? 1)),
        ),
      ),
    );

    const discountValue = M.of(invoice.discountValue);
    const discountAmount: Money = M.money(
      invoice.discountType === 'PERCENT'
        ? M.applyPct(subtotal, discountValue)
        : discountValue,
    );
    const taxPercent = M.of(invoice.taxPercent);

    const taxableAmount = M.sub(subtotal, discountAmount);
    const taxAmount = M.money(M.applyPct(taxableAmount, taxPercent));
    const total: Money = M.money(M.add(taxableAmount, taxAmount));
    const amtPaid = M.of(invoice.amountPaid);
    const balance = M.sub(total, amtPaid);

    const discountRatio: Money = M.isPositive(subtotal)
      ? M.div(discountAmount, subtotal)
      : M.zero();
    const baseDiscountAmount: Money = M.money(M.mul(baseSubtotal, discountRatio));
    const baseTaxableAmount = M.sub(baseSubtotal, baseDiscountAmount);
    const baseTaxAmount = M.money(M.applyPct(baseTaxableAmount, taxPercent));
    const baseTotal: Money = M.money(M.add(baseTaxableAmount, baseTaxAmount));
    const baseAmtPaid = M.of(invoice.baseAmountPaid);
    const baseBalance = M.sub(baseTotal, baseAmtPaid);

    const newPaymentStatus: InvoicePaymentStatus = M.lte(balance, '0.01')
      ? InvoicePaymentStatus.PAID
      : M.isPositive(amtPaid)
        ? InvoicePaymentStatus.PARTIALLY_PAID
        : InvoicePaymentStatus.UNPAID;

    return this.prisma.invoice.update({
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
    });
  }

  // ── Revenue-account resolution (per-procedure → category → system default) ──
  /**
   * Pure pick: a procedure's own revenueAccountId wins; else its category's;
   * else null (→ caller falls back to the GL.TREATMENT_REVENUE system account).
   */
  private pickRevenueAccountId(
    proc?: {
      revenueAccountId?: string | null;
      category?: { revenueAccountId?: string | null } | null;
    } | null,
  ): string | null {
    return proc?.revenueAccountId ?? proc?.category?.revenueAccountId ?? null;
  }

  /** Resolve the revenue account for a TreatmentProcedure by its id. */
  private async revenueAccountIdForTreatmentProcedure(
    treatmentProcedureId: string,
  ): Promise<string | null> {
    const tp = await this.prisma.treatmentProcedure.findUnique({
      where: { id: treatmentProcedureId },
      select: {
        procedure: {
          select: {
            revenueAccountId: true,
            category: { select: { revenueAccountId: true } },
          },
        },
      },
    });
    return this.pickRevenueAccountId(tp?.procedure ?? null);
  }

  // Unified, concurrency-safe document numbering (INV-YY-NNNN).
  private async generateInvoiceNumber(tx?: Prisma.TransactionClient): Promise<string> {
    return this.docNum.next('INV', tx);
  }

  // LE-YY-NNNN. Atomic via the document-number counter; no retry needed.
  private async generateLedgerEntryCode(tx?: Prisma.TransactionClient): Promise<string> {
    return this.docNum.next('LE', tx);
  }
}
