import { Prisma } from '@prisma/client';

/**
 * Safe Decimal → number conversion.
 *
 * Prisma returns Decimal columns as Prisma.Decimal objects (which have a
 * `.toNumber()` method). JS numbers have ~15 decimal digits of precision,
 * which is fine for money at clinic scale (a Ugandan clinic's annual revenue
 * fits easily). For multi-tenant or inter-bank settlement contexts, switch
 * the return type to `Decimal` and let callers decide.
 *
 * Handles:
 * - null / undefined → 0
 * - number → as-is
 * - Prisma.Decimal → toNumber()
 * - string → Number(v) with NaN → 0 fallback
 *
 * Usage:
 *   const total = toNum(visit.totalCost); // 1234.56
 *   const sum = rows.reduce((acc, r) => acc + toNum(r.amount), 0);
 */
export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const dec = v as { toNumber?: () => number };
  if (typeof dec.toNumber === 'function') {
    try {
      const n = dec.toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum a field across an array of rows, with null-safe Decimal handling.
 * Always returns a number (not a Decimal) for downstream JS arithmetic.
 */
export function sumField<T>(rows: T[], getter: (row: T) => unknown): number {
  let acc = 0;
  for (const r of rows) acc += toNum(getter(r));
  return acc;
}

/**
 * Format a money value for display. Uses no decimals if the value is a whole
 * number, otherwise 2 decimal places. Returns a string with thousand separators.
 */
export function fmtMoney(v: unknown, currency = 'UGX'): string {
  const n = toNum(v);
  const isWhole = Math.abs(n - Math.round(n)) < 0.005;
  const numStr = isWhole
    ? Math.round(n).toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${numStr} ${currency}` : numStr;
}

/**
 * Compute percentage safely (avoid divide-by-zero).
 * Returns 0 when total is 0 or negative.
 */
export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10; // 1 decimal place
}

/**
 * Re-export of the Prisma Decimal type for callers that want to type their
 * own helpers without importing the full Prisma namespace.
 */
export type MoneyDecimal = Prisma.Decimal;
