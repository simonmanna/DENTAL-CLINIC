// Centralized money arithmetic. Use this instead of raw + - * / on amounts.
//
// Why: JavaScript number arithmetic on Decimal-backed columns loses precision
// (0.1 + 0.2 = 0.30000000000000004). Doing it inside service code is the
// single biggest source of silent drift in the books.
//
// Rules:
//   1. Money columns in Prisma are Decimal. Service code receives them as
//      Prisma.Decimal instances (never as JS number).
//   2. Sum / diff / mul / div ALWAYS go through this module.
//   3. Outbound JSON responses may coerce to string via .toString(); never to
//      .toNumber() unless explicitly needed for a UI computation, and even
//      then only at the very edge of the system.
//
// Storage scale: 2 decimal places. Rounding strategy: ROUND_HALF_EVEN
// (banker's rounding) — matches accounting convention, avoids the systematic
// upward bias of HALF_UP across thousands of receipts.

import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
export type Money = Prisma.Decimal;

const MONEY_SCALE = 2;
const QUANTITY_SCALE = 4;
const ROUND_MODE = Decimal.ROUND_HALF_EVEN;

export type Numeric =
  | Prisma.Decimal
  | Prisma.Decimal.Value
  | { toString(): string }
  | null
  | undefined;

function toDec(v: Numeric): Prisma.Decimal {
  if (v === null || v === undefined) return new Decimal(0);
  if (v instanceof Decimal) return v;
  // Prisma.Decimal accepts string, number, Decimal.Value.
  // Avoid `Number(v)` round-trips — they re-introduce float drift.
  return new Decimal(v as Prisma.Decimal.Value);
}

export const M = {
  /** Zero in money scale. */
  zero(): Money {
    return new Decimal(0);
  },

  /** Convert any safe input into a Decimal. Does NOT round. */
  of(v: Numeric): Money {
    return toDec(v);
  },

  /** Round to the canonical money scale (2dp, banker's rounding). */
  money(v: Numeric): Money {
    return toDec(v).toDecimalPlaces(MONEY_SCALE, ROUND_MODE);
  },

  /** Round to the quantity scale (4dp). */
  quantity(v: Numeric): Money {
    return toDec(v).toDecimalPlaces(QUANTITY_SCALE, ROUND_MODE);
  },

  add(a: Numeric, b: Numeric): Money {
    return toDec(a).plus(toDec(b));
  },

  sub(a: Numeric, b: Numeric): Money {
    return toDec(a).minus(toDec(b));
  },

  mul(a: Numeric, b: Numeric): Money {
    return toDec(a).times(toDec(b));
  },

  div(a: Numeric, b: Numeric): Money {
    return toDec(a).dividedBy(toDec(b));
  },

  neg(a: Numeric): Money {
    return toDec(a).negated();
  },

  abs(a: Numeric): Money {
    return toDec(a).abs();
  },

  /** Sum a list with full precision; round at the end via M.money(). */
  sum(values: Iterable<Numeric>): Money {
    let total = new Decimal(0);
    for (const v of values) total = total.plus(toDec(v));
    return total;
  },

  /** Apply a percentage. pct of 18.5 means 18.5%. */
  applyPct(amount: Numeric, pct: Numeric): Money {
    return toDec(amount).times(toDec(pct)).dividedBy(100);
  },

  cmp(a: Numeric, b: Numeric): -1 | 0 | 1 {
    return toDec(a).comparedTo(toDec(b)) as -1 | 0 | 1;
  },

  eq(a: Numeric, b: Numeric): boolean {
    return toDec(a).equals(toDec(b));
  },

  gt(a: Numeric, b: Numeric): boolean {
    return toDec(a).greaterThan(toDec(b));
  },

  gte(a: Numeric, b: Numeric): boolean {
    return toDec(a).greaterThanOrEqualTo(toDec(b));
  },

  lt(a: Numeric, b: Numeric): boolean {
    return toDec(a).lessThan(toDec(b));
  },

  lte(a: Numeric, b: Numeric): boolean {
    return toDec(a).lessThanOrEqualTo(toDec(b));
  },

  isZero(v: Numeric): boolean {
    return toDec(v).isZero();
  },

  isNegative(v: Numeric): boolean {
    return toDec(v).isNegative();
  },

  isPositive(v: Numeric): boolean {
    return toDec(v).isPositive();
  },

  max(a: Numeric, b: Numeric): Money {
    return Decimal.max(toDec(a), toDec(b));
  },

  min(a: Numeric, b: Numeric): Money {
    return Decimal.min(toDec(a), toDec(b));
  },

  /** Clamp `v` into [lo, hi]. */
  clamp(v: Numeric, lo: Numeric, hi: Numeric): Money {
    return Decimal.max(Decimal.min(toDec(v), toDec(hi)), toDec(lo));
  },

  /** Convert via FX rate then round to money scale. */
  fx(amount: Numeric, rate: Numeric): Money {
    return toDec(amount).times(toDec(rate)).toDecimalPlaces(MONEY_SCALE, ROUND_MODE);
  },

  /** Plain-string for JSON responses without losing precision. */
  str(v: Numeric): string {
    return toDec(v).toFixed(MONEY_SCALE);
  },
};

// Backwards-compatible thin alias for code that imports `Money`.
export { M as Money$ };
