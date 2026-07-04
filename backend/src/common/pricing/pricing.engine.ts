// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/common/pricing/pricing.engine.ts
//
// Single source of truth for ALL pricing calculations in DHMS.
// Used by: ProceduresService, TreatmentPlansService, VisitProceduresService
// ═══════════════════════════════════════════════════════════════════════════

import { BadRequestException, Logger } from '@nestjs/common';
import { PricingModel, BillingUnit } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
// Add this re-export near the top, after the NestJS imports:
export { PricingModel, BillingUnit } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ProcedurePricingConfig {
  basePrice: Decimal | number;
  baseCost: Decimal | number;
  pricingModel: PricingModel;
  priceRangeMin?: Decimal | number | null;
  priceRangeMax?: Decimal | number | null;
  currency: string;
}

export interface PricingInput {
  toothNumbers?: number[];
  bracketCount?: number;
  archCount?: number;
  sessionCount?: number;
  quantityOverride?: number;
  exchangeRate?: number;
  baseCurrency?: string;
}

export interface PricingResult {
  // ── Quantity ──────────────────────────────────────────────────────────
  quantity: number;
  billingUnit: BillingUnit | null;

  // ── Per-unit values (in procedure's native currency) ──────────────────
  pricePerUnit: number;
  costPerUnit: number;

  // ── Totals (native currency) ──────────────────────────────────────────
  subtotalPrice: number;
  subtotalCost: number;
  discountAmount: number;
  taxAmount: number;
  totalPrice: number;

  // ── Multi-currency ────────────────────────────────────────────────────
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
  baseAmount: number; // totalPrice converted to baseCurrency

  // ── Audit metadata ────────────────────────────────────────────────────
  pricingModel: PricingModel;
  minApplied: boolean;
  maxApplied: boolean;
  breakdown: string; // human-readable explanation
}

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * Last-resort fallback used ONLY when no rate is supplied by the caller.
 * The canonical USD→UGX rate lives in `clinic_settings.EXCHANGE_RATE` and is
 * read via `CurrencyService.getUsdToUgxRate()` / `TreatmentPlansService.getClinicExchangeRate()`.
 * Keep this in sync with the seed value in `prisma/seeds/0-seed-clinic-settings.ts`.
 */
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 3600,
  EUR: 4000,
  GBP: 4700,
  KES: 29,
};

const USD_RATE_SANITY = { min: 3000, max: 5000 };

// ── Engine ────────────────────────────────────────────────────────────────

export class PricingEngine {
  private static readonly logger = new Logger('PricingEngine');

  /**
   * Calculate the full pricing result for a procedure.
   * This is the ONLY place math happens — no duplication across services.
   */
  static calculate(
    config: ProcedurePricingConfig,
    input: PricingInput,
  ): PricingResult {
    const baseCurrency = input.baseCurrency ?? 'UGX';
    const basePrice = Number(config.basePrice);
    const baseCost = Number(config.baseCost);

    // 1. Derive quantity from clinical context
    const quantity =
      input.quantityOverride != null
        ? Math.max(1, input.quantityOverride)
        : this.deriveQuantity(config.pricingModel, input);

    // 2. Calculate raw totals in native currency
    let subtotalPrice =
      config.pricingModel === PricingModel.FIXED
        ? basePrice
        : basePrice * quantity;

    let subtotalCost =
      config.pricingModel === PricingModel.FIXED
        ? baseCost
        : baseCost * quantity;

    // 3. Apply price constraints
    let minApplied = false;
    let maxApplied = false;

    const rangeMin =
      config.priceRangeMin != null ? Number(config.priceRangeMin) : null;
    const rangeMax =
      config.priceRangeMax != null ? Number(config.priceRangeMax) : null;

    if (rangeMin !== null && subtotalPrice < rangeMin) {
      subtotalPrice = rangeMin;
      minApplied = true;
    }
    if (rangeMax !== null && subtotalPrice > rangeMax) {
      subtotalPrice = rangeMax;
      maxApplied = true;
    }

    // 4. Derive per-unit from final total (for display)
    const pricePerUnit =
      config.pricingModel === PricingModel.FIXED
        ? subtotalPrice
        : quantity > 0
          ? subtotalPrice / quantity
          : subtotalPrice;

    const costPerUnit =
      config.pricingModel === PricingModel.FIXED
        ? subtotalCost
        : quantity > 0
          ? subtotalCost / quantity
          : subtotalCost;

    const totalPrice = subtotalPrice; // discounts/tax applied later at invoice level

    // 5. Currency conversion
    const exchangeRate = this.resolveExchangeRate(
      config.currency,
      baseCurrency,
      input.exchangeRate,
    );
    const baseAmount =
      config.currency === baseCurrency ? totalPrice : totalPrice * exchangeRate;

    // 6. Build breakdown string for audit
    const breakdown = this.buildBreakdown(
      config.pricingModel,
      basePrice,
      quantity,
      subtotalPrice,
      config.currency,
      exchangeRate,
      baseCurrency,
      minApplied,
      maxApplied,
    );

    return {
      quantity,
      billingUnit: this.modelToBillingUnit(config.pricingModel),
      pricePerUnit: this.round(pricePerUnit),
      costPerUnit: this.round(costPerUnit),
      subtotalPrice: this.round(subtotalPrice),
      subtotalCost: this.round(subtotalCost),
      discountAmount: 0,
      taxAmount: 0,
      totalPrice: this.round(totalPrice),
      currency: config.currency,
      exchangeRate,
      baseCurrency,
      baseAmount: this.round(baseAmount),
      pricingModel: config.pricingModel,
      minApplied,
      maxApplied,
      breakdown,
    };
  }

  /**
   * Derive the quantity (# billing units) from clinical context.
   * This is what replaces the scattered `quantityBasis` logic across services.
   */
  static deriveQuantity(model: PricingModel, input: PricingInput): number {
    const teeth = input.toothNumbers ?? [];

    switch (model) {
      case PricingModel.FIXED:
        return 1;

      case PricingModel.PER_TOOTH:
        return Math.max(1, teeth.length);

      case PricingModel.PER_ARCH: {
        if (input.archCount != null) return Math.max(1, input.archCount);
        // FDI numbering: upper = 11-28, lower = 31-48
        const hasUpper = teeth.some((n) => n >= 11 && n <= 28);
        const hasLower = teeth.some((n) => n >= 31 && n <= 48);
        const archCount = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0);
        return Math.max(1, archCount);
      }

      case PricingModel.PER_SESSION:
        return Math.max(1, input.sessionCount ?? 1);

      case PricingModel.PER_BRACKET:
        return Math.max(1, input.bracketCount ?? teeth.length);

      case PricingModel.PER_UNIT:
        return Math.max(1, input.quantityOverride ?? teeth.length);

      default:
        return 1;
    }
  }

  /**
   * Validate and resolve the exchange rate for a currency pair.
   */
  static resolveExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    providedRate?: number,
  ): number {
    if (fromCurrency === toCurrency) return 1;

    if (providedRate != null) {
      if (providedRate <= 0) {
        throw new BadRequestException(
          `Invalid exchange rate ${providedRate} for ${fromCurrency}→${toCurrency}`,
        );
      }
      // Sanity check for USD
      if (fromCurrency === 'USD' && toCurrency === 'UGX') {
        if (
          providedRate < USD_RATE_SANITY.min ||
          providedRate > USD_RATE_SANITY.max
        ) {
          this.logger.warn(
            `Exchange rate ${providedRate} for USD→UGX is outside normal range ` +
              `(${USD_RATE_SANITY.min}–${USD_RATE_SANITY.max})`,
          );
        }
      }
      return providedRate;
    }

    const defaultRate = DEFAULT_EXCHANGE_RATES[fromCurrency];
    if (!defaultRate) {
      throw new BadRequestException(
        `No exchange rate available for ${fromCurrency}→${toCurrency}. ` +
          `Please provide an exchangeRate.`,
      );
    }
    return defaultRate;
  }

  /**
   * Format a monetary amount with currency symbol.
   */
  static format(amount: number, currency: string): string {
    if (currency === 'UGX')
      return `UGX ${Math.round(amount).toLocaleString('en-UG')}`;
    if (currency === 'USD') return `$${amount.toFixed(2)}`;
    if (currency === 'EUR') return `€${amount.toFixed(2)}`;
    return `${currency} ${amount.toFixed(2)}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private static modelToBillingUnit(model: PricingModel): BillingUnit | null {
    const map: Partial<Record<PricingModel, BillingUnit>> = {
      [PricingModel.PER_TOOTH]: BillingUnit.TOOTH,
      [PricingModel.PER_ARCH]: BillingUnit.ARCH,
      [PricingModel.PER_SESSION]: BillingUnit.SESSION,
      [PricingModel.PER_BRACKET]: BillingUnit.BRACKET,
      [PricingModel.PER_UNIT]: BillingUnit.UNIT,
    };
    return map[model] ?? null;
  }

  private static buildBreakdown(
    model: PricingModel,
    basePrice: number,
    quantity: number,
    total: number,
    currency: string,
    exchangeRate: number,
    baseCurrency: string,
    minApplied: boolean,
    maxApplied: boolean,
  ): string {
    const parts: string[] = [];

    if (model === PricingModel.FIXED) {
      parts.push(`Fixed: ${this.format(basePrice, currency)}`);
    } else {
      parts.push(
        `${this.format(basePrice, currency)} × ${quantity} ${model.replace('PER_', '')}`,
      );
    }

    if (minApplied) parts.push('(minimum applied)');
    if (maxApplied) parts.push('(maximum cap applied)');

    if (currency !== baseCurrency) {
      parts.push(
        `→ ${this.format(total * exchangeRate, baseCurrency)} @ ${exchangeRate}`,
      );
    }

    return parts.join(' ');
  }

  private static round(n: number, decimals = 2): number {
    return Math.round(n * 10 ** decimals) / 10 ** decimals;
  }
}

// ─── Frontend-compatible utility (mirrors backend logic) ──────────────────
// Used in AddProcedureModal and other React components

export function calculateProcedureCost(
  basePrice: number,
  pricingModel: string,
  currency: string,
  quantity: number,
  exchangeRate: number,
  priceRangeMin?: number | null,
  priceRangeMax?: number | null,
): {
  pricePerUnit: number;
  subtotalPrice: number;
  totalPrice: number;
  baseAmount: number;
  rawCost: number; // alias for subtotalPrice (kept for UI compat)
  finalCostUGX: number; // alias for baseAmount (kept for UI compat)
  breakdown: string;
} {
  let subtotal = pricingModel === 'FIXED' ? basePrice : basePrice * quantity;

  let minApplied = false;
  let maxApplied = false;

  if (priceRangeMin != null && subtotal < priceRangeMin) {
    subtotal = priceRangeMin;
    minApplied = true;
  }
  if (priceRangeMax != null && subtotal > priceRangeMax) {
    subtotal = priceRangeMax;
    maxApplied = true;
  }

  const pricePerUnit = pricingModel === 'FIXED' ? subtotal : subtotal / quantity;
  const rate = currency === 'UGX' ? 1 : exchangeRate;
  const baseAmount = Math.round(subtotal * rate);

  const parts: string[] = [];
  if (pricingModel === 'FIXED') {
    parts.push(`Fixed: ${currency} ${subtotal.toLocaleString()}`);
  } else {
    parts.push(`${currency} ${basePrice.toLocaleString()} × ${quantity}`);
  }
  if (minApplied) parts.push('(min applied)');
  if (maxApplied) parts.push('(max applied)');
  if (currency !== 'UGX')
    parts.push(`→ UGX ${baseAmount.toLocaleString()} @ ${rate}`);

  return {
    pricePerUnit,
    subtotalPrice: subtotal,
    totalPrice: subtotal,
    baseAmount,
    rawCost: subtotal,
    finalCostUGX: baseAmount,
    breakdown: parts.join(' '),
  };
}

export function deriveQuantity(
  pricingModel: string,
  toothNumbers: number[] = [],
  extras?: { archCount?: number; bracketCount?: number; sessionCount?: number },
): number {
  const teeth = toothNumbers;

  switch (pricingModel) {
    case 'FIXED':
      return 1;
    case 'PER_TOOTH':
      return Math.max(1, teeth.length);
    case 'PER_ARCH': {
      if (extras?.archCount) return extras.archCount;
      const hasUpper = teeth.some((n) => n >= 11 && n <= 28);
      const hasLower = teeth.some((n) => n >= 31 && n <= 48);
      return Math.max(1, (hasUpper ? 1 : 0) + (hasLower ? 1 : 0));
    }
    case 'PER_SESSION':
      return Math.max(1, extras?.sessionCount ?? 1);
    case 'PER_BRACKET':
      return Math.max(1, extras?.bracketCount ?? teeth.length);
    case 'PER_UNIT':
      return Math.max(1, teeth.length);
    default:
      return 1;
  }
}

export function pricingUnitHint(pricingModel: string): string {
  const hints: Record<string, string> = {
    PER_TOOTH: 'Price applies per individual tooth selected',
    PER_ARCH: 'Price applies per arch (upper/lower jaw)',
    PER_SESSION: 'Price applies per treatment session',
    PER_BRACKET: 'Price applies per orthodontic bracket/tube',
    PER_UNIT: 'Price applies per unit — enter quantity',
    FIXED: 'Flat price regardless of number of teeth',
  };
  return hints[pricingModel] ?? '';
}
