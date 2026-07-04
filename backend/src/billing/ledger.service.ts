// src/billing/ledger.service.ts
//
// SCHEMA FIELD MAP (what Prisma actually has on LedgerEntry):
//   pricePerUnit      — price per unit in transaction currency
//   subtotalPrice     — pricePerUnit × quantity  (was never written — now fixed)
//   discountAmount    — discount in tx currency
//   taxAmount         — tax in tx currency
//   totalPrice        — subtotalPrice - discountAmount + taxAmount  (FINAL in tx currency)
//   currency          — transaction currency (e.g. 'USD', 'UGX')
//   exchangeRate      — rate used to convert to baseCurrency
//   baseCurrency      — system reporting currency ('UGX')
//   baseAmount        — totalPrice converted to baseCurrency
//
// REMOVED non-existent fields:
//   ❌ finalAmount   → use totalPrice
//   ❌ finalCurrency → use baseCurrency
//   ❌ originalCurrency → use currency
//   ❌ originalAmount  → use subtotalPrice

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLedgerEntryDto, GetLedgerQueryDto } from './dto/billing.dto';
import { LedgerEntryStatus } from '@prisma/client';
import { CurrencyService } from './currency.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely cast Prisma Decimal / number / null to number */
function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Standard include shape ───────────────────────────────────────────────────

const ENTRY_INCLUDE = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      patientCode: true,
    },
  },
  visit: {
    select: { id: true, visitCode: true },
  },
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
  ) {}

  // ── Public wrappers (called by controller) ─────────────────────────────────

  /** GET /billing/ledger */
  async getLedger(query: GetLedgerQueryDto) {
    return this.getPatientLedger({
      patientId: query.patientId,
      visitId: query.visitId,
      status: query.status,
      currency: query.currency,
      page: query.page,
      limit: query.limit,
    });
  }

  /** GET /billing/ledger/:id */
  async getEntry(id: string) {
    const entry = await this.prisma.ledgerEntry.findUnique({
      where: { id },
      include: ENTRY_INCLUDE,
    });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    return entry;
  }

  // ── Auto-create entry when a visit procedure is added ─────────────────────

  async createFromProcedure(
    visitProcedureId: string,
    procedureCurrency?: string,
    providedRate?: number,
  ) {
    const vp = await this.prisma.visitProcedure.findUnique({
      where: { id: visitProcedureId },
      include: {
        procedure: true,
        visit: { select: { patientId: true } },
      },
    });
    if (!vp) return null;

    // Idempotent — skip if entry already exists
    const existing = await this.prisma.ledgerEntry.findFirst({
      where: { sourceType: 'VISIT_PROCEDURE', sourceId: visitProcedureId },
    });
    if (existing) return existing;

    const toothLabel = vp.toothNumbers.length
      ? ` (Tooth: ${vp.toothNumbers.join(', ')})`
      : '';

    // Procedure's own currency, or caller override, or base
    const entryCurrency =
      procedureCurrency ??
      vp.procedure.currency ??
      this.currency.getBaseCurrency();
    const baseCurrency = this.currency.getBaseCurrency();

    // basePrice is Decimal → convert immediately
    const pricePerUnit: number =
      toNum(vp.procedure.basePrice) || toNum(vp.cost) || 0;
    const subtotalPrice = pricePerUnit * 1; // quantity 1 per visit-procedure line

    let baseAmount = subtotalPrice;
    let exchangeRate = providedRate ?? 1;

    if (entryCurrency !== baseCurrency) {
      const conv = await this.currency.convert(
        subtotalPrice,
        entryCurrency,
        baseCurrency,
        providedRate,
      );
      baseAmount = conv.amount;
      exchangeRate = conv.rate;
    }

    // totalPrice is in the *transaction* currency (entryCurrency)
    const totalPrice = subtotalPrice; // no discount/tax at auto-creation time

    return this.prisma.ledgerEntry.create({
      data: {
        entryCode: await this.generateCode(),
        patientId: vp.visit.patientId,
        visitId: vp.visitId,
        type: 'PROCEDURE',
        description: `${vp.procedure.name}${toothLabel}`,
        sourceType: 'VISIT_PROCEDURE',
        sourceId: vp.id,
        quantity: 1,
        pricePerUnit,
        subtotalPrice, // ✓ required — pricePerUnit × quantity
        discountAmount: 0,
        taxAmount: 0,
        totalPrice, // ✓ final in tx currency
        currency: entryCurrency,
        exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
        baseCurrency,
        baseAmount,
        notes: null,
        status: 'PENDING',
      },
      include: ENTRY_INCLUDE,
    });
  }

  // ── Auto-create entries when a prescription is dispensed ──────────────────

  async createFromPrescriptionItems(
    prescriptionId: string,
    rxCurrency?: string,
    providedRate?: number,
  ) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        items: { include: { drug: true } },
        visit: { select: { id: true } },
      },
    });
    if (!rx) return [];

    const entryCurrency = rxCurrency ?? this.currency.getBaseCurrency();
    const baseCurrency = this.currency.getBaseCurrency();
    const entries: any[] = [];

    for (const item of rx.items) {
      // Idempotent
      const existing = await this.prisma.ledgerEntry.findFirst({
        where: { sourceType: 'PRESCRIPTION_ITEM', sourceId: item.id },
      });
      if (existing) {
        entries.push(existing);
        continue;
      }

      // Line ~200-202 in createFromPrescriptionItems
      const pricePerUnit = toNum(item.drug.sellPrice); // ✓ Convert Decimal → number
      const subtotalPrice = item.quantity * pricePerUnit; // ✓ Now both are numbers
      let baseAmount = subtotalPrice;
      let exchangeRate = providedRate ?? 1;

      if (entryCurrency !== baseCurrency) {
        const conv = await this.currency.convert(
          subtotalPrice,
          entryCurrency,
          baseCurrency,
          providedRate,
        );
        baseAmount = conv.amount;
        exchangeRate = conv.rate;
      }

      const totalPrice = subtotalPrice; // no discount/tax at auto-creation time

      const entry = await this.prisma.ledgerEntry.create({
        data: {
          entryCode: await this.generateCode(),
          patientId: rx.patientId,
          visitId: rx.visit?.id ?? null,
          type: 'DRUG',
          description: `${item.drug.name}${item.drug.strength ? ' ' + item.drug.strength : ''} – ${item.dosage} × ${item.frequency} × ${item.duration}`,
          sourceType: 'PRESCRIPTION_ITEM',
          sourceId: item.id,
          quantity: item.quantity,
          pricePerUnit,
          subtotalPrice, // ✓
          discountAmount: 0,
          taxAmount: 0,
          totalPrice, // ✓
          currency: entryCurrency,
          exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
          baseCurrency,
          baseAmount,
          notes: null,
          status: 'PENDING',
        },
        include: ENTRY_INCLUDE,
      });
      entries.push(entry);
    }
    return entries;
  }

  async createFromPrescriptionItem(
    prescriptionItemId: string,
    txCurrency?: string,
    providedRate?: number,
  ) {
    const item = await this.prisma.prescriptionItem.findUnique({
      where: { id: prescriptionItemId },
      include: {
        drug: true,
        prescription: { include: { visit: true, patient: true } },
      },
    });
    if (!item) throw new NotFoundException('Prescription item not found');

    // Return existing PENDING entry — safe to call multiple times
    const existing = await this.prisma.ledgerEntry.findFirst({
      where: {
        sourceType: 'PRESCRIPTION_ITEM',
        sourceId: prescriptionItemId,
        status: 'PENDING',
      },
      include: ENTRY_INCLUDE,
    });
    if (existing) return existing;

    const entryCurrency = txCurrency ?? this.currency.getBaseCurrency();
    const baseCurrency = this.currency.getBaseCurrency();
    const quantity = toNum(item.quantity);
    const pricePerUnit = toNum(item.drug.sellPrice);
    const subtotalPrice = quantity * pricePerUnit;

    let baseAmount = subtotalPrice;
    let exchangeRate = providedRate ?? 1;

    if (entryCurrency !== baseCurrency) {
      const conv = await this.currency.convert(
        subtotalPrice,
        entryCurrency,
        baseCurrency,
        providedRate,
      );
      baseAmount = conv.amount;
      exchangeRate = conv.rate;
    }

    return this.prisma.ledgerEntry.create({
      data: {
        entryCode: await this.generateCode(),
        patientId: item.prescription.patientId,
        visitId: item.prescription.visitId,
        type: 'DRUG',
        description: `${item.drug.name}${item.drug.strength ? ' ' + item.drug.strength : ''} – ${item.dosage} × ${item.frequency} × ${item.duration}`,
        sourceType: 'PRESCRIPTION_ITEM',
        sourceId: item.id,
        quantity,
        pricePerUnit,
        subtotalPrice,
        discountAmount: 0,
        taxAmount: 0,
        totalPrice: subtotalPrice,
        currency: entryCurrency,
        exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
        baseCurrency,
        baseAmount,
        notes: null,
        status: 'PENDING',
      },
      include: ENTRY_INCLUDE,
    });
  }

  async createFromBillingService(params: {
    patientId: string;
    visitId?: string;
    serviceId: string;
    quantity?: number;
    overridePrice?: number;
    overrideCurrency?: string;
    overrideRate?: number;
    notes?: string;
  }) {
    const svc = await this.prisma.billingService.findUnique({
      where: { id: params.serviceId },
    });
    if (!svc) throw new NotFoundException('Billing service not found');
    if (!svc.isActive)
      throw new BadRequestException('This service is inactive');

    const quantity = params.quantity ?? 1;
    const entryCurrency = params.overrideCurrency ?? svc.currency;
    const baseCurrency = this.currency.getBaseCurrency();
    const pricePerUnit = params.overridePrice ?? toNum(svc.price);
    const subtotalPrice = pricePerUnit * quantity;

    let baseAmount = subtotalPrice;
    let exchangeRate = params.overrideRate ?? toNum(svc.exchangeRate ?? 1);

    if (entryCurrency !== baseCurrency) {
      if (params.overrideRate) {
        exchangeRate = params.overrideRate;
        baseAmount = subtotalPrice * exchangeRate;
      } else if (svc.currency !== baseCurrency && toNum(svc.exchangeRate) > 0) {
        exchangeRate = toNum(svc.exchangeRate);
        baseAmount = subtotalPrice * exchangeRate;
      } else {
        const conv = await this.currency.convert(
          subtotalPrice,
          entryCurrency,
          baseCurrency,
          params.overrideRate,
        );
        baseAmount = conv.amount;
        exchangeRate = conv.rate;
      }
    }

    const discountAmount = 0;
    const taxAmount = toNum(svc.defaultTaxAmount);
    const totalPrice = subtotalPrice - discountAmount + taxAmount;

    return this.prisma.ledgerEntry.create({
      data: {
        entryCode: await this.generateCode(),
        patientId: params.patientId,
        visitId: params.visitId ?? null,
        type: svc.type as any,
        description: svc.name,
        sourceType: 'BILLING_SERVICE',
        sourceId: svc.id,
        quantity,
        pricePerUnit,
        subtotalPrice,
        discountAmount,
        taxAmount,
        totalPrice,
        currency: entryCurrency,
        exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
        baseCurrency,
        // baseAmount: baseAmount - discountAmount + taxAmount,
        // Either convert totalPrice directly:
        baseAmount:
          entryCurrency === baseCurrency
            ? totalPrice
            : totalPrice * exchangeRate,
        notes: params.notes ?? null,
        status: 'PENDING',
      },
      include: ENTRY_INCLUDE,
    });
  }

  // ── Manual / generic entry creation (used by controller POST) ─────────────

  async createEntry(dto: CreateLedgerEntryDto) {
    const baseCurrency = this.currency.getBaseCurrency();
    const entryCurrency = dto.currency ?? baseCurrency;

    const pricePerUnit: number = dto.pricePerUnit;
    const quantity: number = dto.quantity;

    // subtotalPrice: explicit or computed
    const subtotalPrice: number = dto.subtotalPrice ?? pricePerUnit * quantity;

    const discountAmount: number = dto.discountAmount ?? 0;
    const taxAmount: number = dto.taxAmount ?? 0;

    // totalPrice is the FINAL in transaction currency
    const totalPrice: number = subtotalPrice - discountAmount + taxAmount;

    // Compute baseAmount (in baseCurrency)
    let baseAmount: number;
    let exchangeRate: number;

    if (dto.exchangeRate) {
      exchangeRate = dto.exchangeRate;
      baseAmount = totalPrice * exchangeRate;
    } else if (entryCurrency !== baseCurrency) {
      const conv = await this.currency.convert(
        totalPrice,
        entryCurrency,
        baseCurrency,
      );
      baseAmount = conv.amount;
      exchangeRate = conv.rate;
    } else {
      exchangeRate = 1;
      baseAmount = totalPrice;
    }

    return this.prisma.ledgerEntry.create({
      data: {
        entryCode: await this.generateCode(),
        patientId: dto.patientId,
        visitId: dto.visitId ?? null,
        type: dto.type as any,
        description: dto.description,
        sourceType: dto.sourceType ?? 'MANUAL',
        sourceId: dto.sourceId ?? null,
        quantity,
        pricePerUnit,
        subtotalPrice, // ✓ written — was missing before
        discountAmount,
        taxAmount,
        totalPrice, // ✓ correct field name (was finalAmount before)
        currency: entryCurrency,
        exchangeRate: exchangeRate !== 1 ? exchangeRate : null,
        baseCurrency, // ✓ correct field (was finalCurrency before)
        baseAmount, // ✓ correct field (was also correct before)
        notes: dto.notes ?? null,
        status: 'PENDING',
      },
      include: ENTRY_INCLUDE,
    });
  }

  // ── Get all ledger entries for a patient / visit ───────────────────────────

  async getPatientLedger(params: {
    patientId?: string;
    visitId?: string;
    status?: string;
    currency?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, currency: displayCurrency } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.patientId) where.patientId = params.patientId;
    if (params.visitId) where.visitId = params.visitId;
    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    const [data, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: ENTRY_INCLUDE,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    // Convert display amounts if caller wants a specific currency
    const processedData = await Promise.all(
      data.map(async (entry) => {
        // ✓ Use correct schema fields: totalPrice and baseCurrency
        const storedTotal = toNum(entry.totalPrice);
        const storedBase = toNum(entry.baseAmount);
        const entryBaseCurrency =
          entry.baseCurrency ?? this.currency.getBaseCurrency();

        if (displayCurrency && displayCurrency !== entryBaseCurrency) {
          try {
            const conv = await this.currency.convert(
              storedBase,
              entryBaseCurrency,
              displayCurrency,
            );
            return {
              ...entry,
              // Serialise Decimal fields to plain numbers
              pricePerUnit: toNum(entry.pricePerUnit),
              subtotalPrice: toNum(entry.subtotalPrice),
              discountAmount: toNum(entry.discountAmount),
              taxAmount: toNum(entry.taxAmount),
              totalPrice: storedTotal,
              baseAmount: storedBase,
              exchangeRate: entry.exchangeRate
                ? toNum(entry.exchangeRate)
                : null,
              // Display extras
              displayAmount: conv.amount,
              displayCurrency,
              conversionRate: conv.rate,
            };
          } catch {
            // Fallback: show base amount as-is
          }
        }

        return {
          ...entry,
          pricePerUnit: toNum(entry.pricePerUnit),
          subtotalPrice: toNum(entry.subtotalPrice),
          discountAmount: toNum(entry.discountAmount),
          taxAmount: toNum(entry.taxAmount),
          totalPrice: storedTotal,
          baseAmount: storedBase,
          exchangeRate: entry.exchangeRate ? toNum(entry.exchangeRate) : null,
          displayAmount: storedBase,
          displayCurrency: entryBaseCurrency,
        };
      }),
    );

    // Summary
    const pending = processedData.filter((e) => e.status === 'PENDING');
    const pendingTotal = pending.reduce(
      (s, e) => s + (e.displayAmount ?? 0),
      0,
    );
    const invoicedTotal = processedData
      .filter((e) => e.status === 'INVOICED')
      .reduce((s, e) => s + (e.displayAmount ?? 0), 0);

    // Group totals by display currency
    const byCurrency = processedData.reduce(
      (
        acc: Record<
          string,
          { pending: number; invoiced: number; total: number }
        >,
        entry,
      ) => {
        const curr =
          (entry as any).displayCurrency ?? entryBaseCurrencyFallback(entry);
        if (!acc[curr]) acc[curr] = { pending: 0, invoiced: 0, total: 0 };
        const amt = (entry as any).displayAmount ?? 0;
        if (entry.status === 'PENDING') acc[curr].pending += amt;
        if (entry.status === 'INVOICED') acc[curr].invoiced += amt;
        acc[curr].total += amt;
        return acc;
      },
      {},
    );

    return {
      data: processedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        pendingCount: pending.length,
        pendingTotal,
        invoicedTotal,
        byCurrency,
      },
    };
  }

  // ── Void an entry ─────────────────────────────────────────────────────────

  async voidEntry(id: string, reason: string) {
    const entry = await this.prisma.ledgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    if (entry.status === 'INVOICED') {
      throw new BadRequestException(
        'Cannot void an invoiced entry. Void the invoice first.',
      );
    }
    if (entry.status === 'VOID') {
      throw new BadRequestException('Entry is already voided');
    }
    return this.prisma.ledgerEntry.update({
      where: { id },
      data: { status: 'VOID', notes: reason },
      include: ENTRY_INCLUDE,
    });
  }

  // ── Mark as invoiced (called from InvoicesService transaction) ────────────

  // src/billing/ledger.service.ts

  async markInvoiced(ids: string[], tx?: any) {
    const db = tx || this.prisma;

    // 1. Update ledger entries to INVOICED
    await db.ledgerEntry.updateMany({
      where: { id: { in: ids } },
      data: { status: LedgerEntryStatus.INVOICED },
    });

    // 2. Find and update related TreatmentProcedures
    const entries = await db.ledgerEntry.findMany({
      where: {
        id: { in: ids },
        sourceType: { in: ['TREATMENT_PROCEDURE', 'PROCEDURE_SESSION'] },
      },
      select: { sourceId: true, sourceType: true },
    });

    const tpIds = entries
      .filter((e) => e.sourceType === 'TREATMENT_PROCEDURE' && e.sourceId)
      .map((e) => e.sourceId as string);

    const sessionIds = entries
      .filter((e) => e.sourceType === 'PROCEDURE_SESSION' && e.sourceId)
      .map((e) => e.sourceId as string);

    if (tpIds.length > 0) {
      // The procedure is now part of an invoice, but the patient has NOT paid yet.
      // The previous 'PAID' value over-counted revenue in commission reports.
      // Cash collection flips the invoice to PAID — not this step.
      await db.treatmentProcedure.updateMany({
        where: { id: { in: tpIds } },
        data: {
          paymentStatus: 'INVOICED',
          ledgerStatus: 'INVOICED',
        },
      });
    }

    if (sessionIds.length > 0) {
      await db.procedureSession.updateMany({
        where: { id: { in: sessionIds } },
        data: { ledgerStatus: 'INVOICED' },
      });
    }
  }

  // ── Mark back to pending (when invoice is voided) ─────────────────────────

  async markPending(ids: string[], tx?: any) {
    const db = tx || this.prisma;
    await db.ledgerEntry.updateMany({
      where: { id: { in: ids } },
      data: { status: LedgerEntryStatus.PENDING },
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Format: LE-YYYYMMDD-NNNN-XXX.
   *
   * The trailing 3-char random suffix exists solely to make concurrent inserts
   * (which can compute the same NNNN via count()) effectively never collide
   * on the unique constraint. Collision probability is ~1/46656 per pair, and
   * the Prisma layer would retry/throw cleanly if it ever did happen.
   */
  private async generateCode(): Promise<string> {
    const d = new Date();
    const prefix = `LE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const count = await this.prisma.ledgerEntry.count({
      where: { entryCode: { startsWith: prefix } },
    });
    const seq = String(count + 1).padStart(4, '0');
    const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `${prefix}-${seq}-${suffix}`;
  }
}

function entryBaseCurrencyFallback(entry: any): string {
  return entry.baseCurrency ?? 'UGX';
}
