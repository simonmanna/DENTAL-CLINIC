// src/utils/procedurePricing.ts

import type { PricingModel, ToothSurface } from '@/types/dental';

export type PricingUnit =
  | "FIXED"
  | "PER_TOOTH"
  | "PER_ARCH"
  | "PER_BRACKET"
  | "PER_UNIT"
  | "PER_QUADRANT" // Added for periodontal work
  | "PER_SEXTANT"; // Added for scaling/root planing

export type Currency = "UGX" | "USD" | "EUR" | "GBP"; // Extended for international patients

// src/utils/procedurePricing.ts

export interface PriceEstimate {
  // 💰 Price fields (what patient pays)
  totalPrice?: number;           // Final amount in UGX (alias for estimatedTotalUGX)
  pricePerUnit?: number;         // Unit price for display
  subtotalPrice?: number;        // pricePerUnit × quantity
  discountAmount?: number;       // Applied discount
  taxAmount?: number;            // Applied tax
  
  // 🏥 Cost fields (internal clinic cost)
  subtotalCost?: number;         // Internal cost subtotal
  costPerUnit?: number;          // Internal cost per unit
  baseAmount?: number;           // USD → UGX converted base amount
  
  // 📊 Core calculation fields
  quantity: number;
  currency: Currency;
  exchangeRate?: number;         // If USD procedure
  pricingModel: PricingUnit;
  
  // 🔢 Raw values
  rawCost: number;               // Pre-conversion, pre-constraints
  estimatedTotalUGX: number;     // Final UGX amount (for backwards compat)
  
  // 🔍 Debug/audit
  breakdown: string;
}

// export interface PriceEstimate {
//   quantity: number;
//   estimatedTotalUGX: number;
//   rawCost: number;
//   currency: Currency;
//   breakdown: string;
// }

export interface PricingResult {
  unitPrice: number; // Original currency
  quantity: number;
  rawCost: number; // In original currency before constraints
  finalCost: number; // In original currency after min/max
  finalCostUGX: number; // Converted to UGX for accounting
  currency: Currency;
  exchangeRate: number;
  exchangeRateDate: Date;
  breakdown: string;
  constraints: {
    minApplied: boolean;
    maxApplied: boolean;
  };
  // For audit trail
  calculationDetails: {
    baseAmount: number;
    quantityMultiplier: number;
    minPrice?: number;
    maxPrice?: number;
  };
}

export interface LedgerEntryPayload {
  // Core amounts - STORED EXACTLY AS CALCULATED
  originalAmount: number; // In procedure's native currency
  originalCurrency: Currency;
  finalAmount: number; // In UGX (your base accounting currency)
  finalCurrency: Currency; // Always 'UGX' for ledger consistency

  // Exchange tracking
  exchangeRate: number;
  exchangeRateDate: Date;

  // Audit fields
  calculationMethod: "FIXED" | "PER_UNIT";
  quantityBasis: number;
  unitPrice: number;

  // Metadata for invoicing flexibility
  displayAmount?: number; // Can be overridden for patient display
  displayCurrency?: Currency; // Patient-preferred currency
}

export function calculateProcedureCost(
  defaultCost: number,
  pricingUnit: PricingUnit = "FIXED",
  currency: Currency = "UGX",
  quantity: number = 1,
  exchangeRate: number = 3700,
  minPrice?: number,
  maxPrice?: number,
  options?: {
    toothNumbers?: number[];
    archCount?: number;
    bracketCount?: number;
    exchangeRateDate?: Date;
  },
): PricingResult {
  const actualQuantity = deriveQuantity(
    pricingUnit,
    options?.toothNumbers || [],
    options?.bracketCount || 1,
    options?.archCount,
  );
  const effectiveQuantity = quantity || actualQuantity;

  // Calculate base amount in original currency
  let rawCost =
    pricingUnit === "FIXED"
      ? defaultCost
      : defaultCost * Math.max(1, effectiveQuantity);

  // Apply constraints
  let minApplied = false;
  let maxApplied = false;
  let finalCost = rawCost;

  if (minPrice != null && rawCost < minPrice) {
    finalCost = minPrice;
    minApplied = true;
  }
  if (maxPrice != null && rawCost > maxPrice) {
    finalCost = maxPrice;
    maxApplied = true;
  }

  // Convert to UGX for ledger (your base currency)
  const isForeign = currency !== "UGX";
  const effectiveRate = isForeign ? exchangeRate : 1;
  const finalCostUGX = isForeign
    ? Math.round(finalCost)
    : finalCost;

  // Format breakdown
  const fmtNum = (n: number, curr: Currency = currency) =>
    curr === "USD"
      ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : curr === "EUR"
        ? `€${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : curr === "GBP"
          ? `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `UGX ${n.toLocaleString("en-UG")}`;

  const unitWord: Record<PricingUnit, string> = {
    FIXED: "procedure",
    PER_TOOTH: "tooth",
    PER_ARCH: "arch",
    PER_BRACKET: "bracket",
    PER_UNIT: "unit",
    PER_QUADRANT: "quadrant",
    PER_SEXTANT: "sextant",
  };

  const breakdown =
    pricingUnit === "FIXED"
      ? fmtNum(finalCost)
      : `${effectiveQuantity} ${unitWord[pricingUnit]}${effectiveQuantity !== 1 ? "s" : ""} × ${fmtNum(defaultCost)} = ${fmtNum(finalCost)}`;

  return {
    unitPrice: defaultCost,
    quantity: effectiveQuantity,
    rawCost,
    finalCost,
    finalCostUGX,
    currency,
    exchangeRate: effectiveRate,
    exchangeRateDate: options?.exchangeRateDate || new Date(),
    breakdown,
    constraints: { minApplied, maxApplied },
    calculationDetails: {
      baseAmount: defaultCost,
      quantityMultiplier: effectiveQuantity,
      minPrice,
      maxPrice,
    },
  };
}

export function deriveQuantity(
  pricingUnit: PricingUnit, // Note: was PricingModel, should match your type
  toothNumbers: number[] = [],
  bracketCount = 1,
  archCount?: number,
): number {
  switch (pricingUnit) {
    case "PER_TOOTH":
      return Math.max(1, toothNumbers.length);

    case "PER_ARCH": {
      if (archCount != null && archCount > 0) return archCount;
      const hasUpper = toothNumbers.some((n) => (n >= 11 && n <= 28) || (n >= 1 && n <= 16));
      const hasLower = toothNumbers.some((n) => (n >= 31 && n <= 48) || (n >= 17 && n <= 32));
      return Math.max(1, (hasUpper ? 1 : 0) + (hasLower ? 1 : 0));
    }

    case "PER_QUADRANT": {
      const quadrants = new Set<number>();
      toothNumbers.forEach((n) => {
        if (n >= 11 && n <= 18) quadrants.add(1);
        if (n >= 21 && n <= 28) quadrants.add(2);
        if (n >= 31 && n <= 38) quadrants.add(3);
        if (n >= 41 && n <= 48) quadrants.add(4);
      });
      return Math.max(1, quadrants.size);
    }

    case "PER_SEXTANT": {
      const sextants = new Set<number>();
      toothNumbers.forEach((n) => {
        if ([17, 16, 11, 21, 26, 27].includes(n)) sextants.add(1); // Upper right
        if ([47, 46, 41, 31, 36, 37].includes(n)) sextants.add(2); // Lower right
        // Extend for other sextants as needed
      });
      return Math.max(1, sextants.size);
    }

    case "PER_BRACKET":
      return Math.max(1, bracketCount);

    case "PER_UNIT":
      return Math.max(1, toothNumbers.length || bracketCount);

    case "FIXED":
    default:
      return 1;
  }
}

// export function deriveQuantity(
//   pricingModel: PricingModel,
//   toothNumbers: number[] = [],
//   bracketCount = 1,
//   options?.archCount,
// ): number {
//   switch (pricingModel) {
//     case 'PER_TOOTH':
//       return Math.max(1, toothNumbers.length);
//     case 'PER_ARCH': {
//       const hasUpper = toothNumbers.some((n) => n >= 11 && n <= 28);
//       const hasLower = toothNumbers.some((n) => n >= 31 && n <= 48);
//       return Math.max(1, (hasUpper ? 1 : 0) + (hasLower ? 1 : 0));
//     }
//     case 'PER_BRACKET':
//       return Math.max(1, bracketCount);
//     case 'PER_UNIT':
//       return Math.max(1, toothNumbers.length || bracketCount);
//     case 'FIXED':
//     case 'PER_SESSION':
//     default:
//       return 1;
//   }
// }

// export function estimateProcedureCost(
//   basePrice: number,
//   pricingModel: PricingUnit,
//   currency: Currency,
//   quantity: number,
//   exchangeRate = 3700,
// ): PriceEstimate {
//   const qty = Math.max(1, quantity);
//   const rawCost = pricingModel === 'FIXED' ? basePrice : basePrice * qty;
//   const isForeign = currency !== 'UGX';
//   const estimatedTotalUGX = Math.round(isForeign ? rawCost * exchangeRate : rawCost);

//   const breakdown =
//     pricingModel === 'FIXED'
//       ? `Est. ${currency} ${basePrice.toLocaleString()} (fixed)`
//       : `Est. ${currency} ${basePrice.toLocaleString()} × ${qty} (${pricingModel
//           .toLowerCase()
//           .replace('_', ' ')})`;

//   return { quantity: qty, estimatedTotalUGX, rawCost, currency, breakdown };
// }


// export function deriveQuantity(
//   pricingUnit: PricingUnit,
//   toothNumbers: number[],
//   bracketCount: number = 1,
//   archCount?: number,
// ): number {
//   switch (pricingUnit) {
//     case "PER_TOOTH":
//       return Math.max(1, toothNumbers.length);

//     case "PER_ARCH": {
//       if (archCount) return archCount;
//       const hasUpper = toothNumbers.some(
//         (n) => (n >= 11 && n <= 28) || (n >= 1 && n <= 16),
//       );
//       const hasLower = toothNumbers.some(
//         (n) => (n >= 31 && n <= 48) || (n >= 17 && n <= 32),
//       );
//       return Math.max(1, (hasUpper ? 1 : 0) + (hasLower ? 1 : 0));
//     }

//     case "PER_QUADRANT": {
//       // Quadrants: 1 (upper right), 2 (upper left), 3 (lower left), 4 (lower right)
//       const quadrants = new Set<number>();
//       toothNumbers.forEach((n) => {
//         if (n >= 11 && n <= 18) quadrants.add(1);
//         if (n >= 21 && n <= 28) quadrants.add(2);
//         if (n >= 31 && n <= 38) quadrants.add(3);
//         if (n >= 41 && n <= 48) quadrants.add(4);
//       });
//       return Math.max(1, quadrants.size);
//     }

//     case "PER_SEXTANT": {
//       // Sextants for periodontal charting
//       const sextants = new Set<number>();
//       toothNumbers.forEach((n) => {
//         if ([17, 16, 11, 21, 26, 27].includes(n)) sextants.add(1);
//         if ([47, 46, 41, 31, 36, 37].includes(n)) sextants.add(2);
//         // ... extend logic for all sextants
//       });
//       return Math.max(1, sextants.size);
//     }

//     case "PER_BRACKET":
//       return Math.max(1, bracketCount);

//     case "PER_UNIT":
//       return Math.max(1, toothNumbers.length || bracketCount);

//     default:
//       return 1;
//   }
// }


// src/utils/procedurePricing.ts

export function estimateProcedureCost(
  basePrice: number,
  pricingModel: PricingUnit,
  currency: Currency,
  quantity: number,
  exchangeRate = 3700,
): PriceEstimate {
  const qty = Math.max(1, quantity);
  const rawCost = pricingModel === 'FIXED' ? basePrice : basePrice * qty;
  const isForeign = currency !== 'UGX';
  // UGX equivalent – still computed for ledger, not for display
  const estimatedTotalUGX = Math.round(isForeign ? rawCost * exchangeRate : rawCost);

  return {
    // Core fields in ORIGINAL currency
    totalPrice: rawCost,                   // 🔁 was estimatedTotalUGX
    pricePerUnit: basePrice,               // 🔁 stays original
    subtotalPrice: basePrice * qty,        // 🔁 stays original
    discountAmount: 0,
    taxAmount: 0,

    // Cost fields (placeholders)
    subtotalCost: rawCost * 0.3,
    costPerUnit: basePrice * 0.3,
    baseAmount: rawCost,                   // 🔁 raw original amount (not undefined)

    // Quantity & currency
    quantity: qty,
    currency,
    pricingModel,

    // For internal use only
    rawCost,
    estimatedTotalUGX,                     // still available if needed

    // Exchange info
    exchangeRate: isForeign ? exchangeRate : undefined,

    // Human‑readable breakdown
    breakdown:
      pricingModel === 'FIXED'
        ? `${currency} ${basePrice.toLocaleString()} (fixed)`
        : `${qty} × ${currency} ${basePrice.toLocaleString()} (${pricingModel.toLowerCase().replace('_', ' ')})`,
  };
}

// export function estimateProcedureCost(
//   basePrice: number,
//   pricingModel: PricingUnit,
//   currency: Currency,
//   quantity: number,
//   exchangeRate = 3700,
// ): PriceEstimate {
//   const qty = Math.max(1, quantity);
  
//   // Calculate raw cost in original currency
//   const rawCost = pricingModel === 'FIXED' ? basePrice : basePrice * qty;
  
//   // Convert to UGX for accounting
//   const isForeign = currency !== 'UGX';
//   const estimatedTotalUGX = Math.round(isForeign ? rawCost * exchangeRate : rawCost);
  
//   // Build comprehensive result
//   return {
//     // Core fields
//     quantity: qty,
//     currency,
//     pricingModel,
//     rawCost,
//     estimatedTotalUGX,
    
//     // Price fields (what patient pays)
//     totalPrice: estimatedTotalUGX,        // ✅ Alias for component compatibility
//     pricePerUnit: basePrice,
//     subtotalPrice: basePrice * qty,
//     discountAmount: 0,                    // No discount logic yet
//     taxAmount: 0,                         // No tax logic yet
    
//     // Cost fields (internal - placeholder for now)
//     subtotalCost: rawCost * 0.3,          // Example: 30% cost ratio
//     costPerUnit: basePrice * 0.3,
//     baseAmount: isForeign ? rawCost : undefined,
    
//     // Metadata
//     exchangeRate: isForeign ? exchangeRate : undefined,
    
//     // Debug
//     breakdown: pricingModel === 'FIXED'
//       ? `Est. ${currency} ${basePrice.toLocaleString()} (fixed)`
//       : `Est. ${currency} ${basePrice.toLocaleString()} × ${qty} (${pricingModel.toLowerCase().replace('_', ' ')})`,
//   };
// }

export function pricingUnitHint(unit: PricingUnit): string {
  const map: Record<PricingUnit, string> = {
    FIXED: "Fixed price regardless of complexity",
    PER_TOOTH: "Priced per tooth treated",
    PER_ARCH: "Priced per dental arch (upper/lower)",
    PER_BRACKET: "Priced per orthodontic bracket/buccal tube",
    PER_UNIT: "Priced per generic unit",
    PER_QUADRANT: "Priced per periodontal quadrant",
    PER_SEXTANT: "Priced per periodontal sextant",
  };
  return map[unit] ?? "";
}

// Helper for frontend display formatting
export function formatPrice(
  amount: number,
  currency: Currency,
  locale: string = "en-UG",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: currency === "UGX" ? 0 : 2,
    maximumFractionDigits: currency === "UGX" ? 0 : 2,
  }).format(amount);
}
