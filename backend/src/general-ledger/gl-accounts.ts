// src/general-ledger/gl-accounts.ts
//
// The canonical Chart of Accounts for the clinic's double-entry general ledger.
//
// IMPORTANT: the posting engine references these accounts by their stable
// `systemKey` (e.g. "ACCOUNTS_RECEIVABLE"), NOT by their `code`. That lets an
// accountant freely renumber/rename the code (1100 → 1200 "Patient Receivables")
// without breaking any automatic posting. `code` here is only the DEFAULT code
// used when the account is first seeded.

import { LedgerAccountType, NormalBalance } from '@prisma/client';

/** The side an account increases on, derived from its type. */
export function defaultNormalBalance(type: LedgerAccountType): NormalBalance {
  return type === LedgerAccountType.ASSET || type === LedgerAccountType.EXPENSE
    ? NormalBalance.DEBIT
    : NormalBalance.CREDIT;
}

export interface CanonicalAccount {
  key: string; // stable systemKey — what the engine resolves by
  code: string; // default code when seeded (user-editable afterwards)
  name: string;
  type: LedgerAccountType;
  normalBalance: NormalBalance;
  description?: string;
}

const A = LedgerAccountType.ASSET;
const L = LedgerAccountType.LIABILITY;
const EQ = LedgerAccountType.EQUITY;
const I = LedgerAccountType.INCOME;
const EX = LedgerAccountType.EXPENSE;
const DR = NormalBalance.DEBIT;
const CR = NormalBalance.CREDIT;

/** Stable systemKeys the posting engine references. */
export const GL = {
  CASH_ON_HAND: 'CASH_ON_HAND',
  BANK: 'BANK',
  MOBILE_MONEY: 'MOBILE_MONEY',
  ACCOUNTS_RECEIVABLE: 'ACCOUNTS_RECEIVABLE',
  INVENTORY: 'INVENTORY',

  PATIENT_DEPOSITS: 'PATIENT_DEPOSITS',
  TAX_PAYABLE: 'TAX_PAYABLE',
  ACCOUNTS_PAYABLE: 'ACCOUNTS_PAYABLE',

  OWNERS_EQUITY: 'OWNERS_EQUITY',

  TREATMENT_REVENUE: 'TREATMENT_REVENUE',
  CONSULTATION_REVENUE: 'CONSULTATION_REVENUE',
  PHARMACY_REVENUE: 'PHARMACY_REVENUE',
  OTHER_INCOME: 'OTHER_INCOME',
  // ── Dental-discipline revenue sub-accounts ────────────────────────────
  // Seeded defaults so a clinic can map procedures/categories to a specific
  // revenue line out of the box (Restorative, Endodontic, …). TREATMENT_REVENUE
  // (4000) stays the fallback for anything unmapped. Codes are user-editable.
  RESTORATIVE_REVENUE: 'RESTORATIVE_REVENUE',
  ENDODONTIC_REVENUE: 'ENDODONTIC_REVENUE',
  PROSTHODONTIC_REVENUE: 'PROSTHODONTIC_REVENUE',
  ORAL_SURGERY_REVENUE: 'ORAL_SURGERY_REVENUE',
  PREVENTIVE_REVENUE: 'PREVENTIVE_REVENUE',
  ORTHODONTIC_REVENUE: 'ORTHODONTIC_REVENUE',
  // Contra-revenue: discounts granted on invoices. INCOME type but normal
  // DEBIT, so it nets against revenue on the income statement.
  SALES_DISCOUNT: 'SALES_DISCOUNT',

  COST_OF_SUPPLIES: 'COST_OF_SUPPLIES',
  SALARIES: 'SALARIES',
  RENT: 'RENT',
  UTILITIES: 'UTILITIES',
  OTHER_EXPENSE: 'OTHER_EXPENSE',
} as const;

export const CANONICAL_ACCOUNTS: CanonicalAccount[] = [
  // ── Assets (normal DEBIT) ───────────────────────────────────────────────
  { key: GL.CASH_ON_HAND, code: '1000', name: 'Cash on Hand', type: A, normalBalance: DR },
  { key: GL.BANK, code: '1010', name: 'Bank', type: A, normalBalance: DR },
  { key: GL.MOBILE_MONEY, code: '1020', name: 'Mobile Money', type: A, normalBalance: DR },
  {
    key: GL.ACCOUNTS_RECEIVABLE,
    code: '1100',
    name: 'Accounts Receivable (Patients)',
    type: A,
    normalBalance: DR,
    description: 'Amounts owed by patients for posted invoices',
  },
  { key: GL.INVENTORY, code: '1200', name: 'Inventory (Dental Supplies)', type: A, normalBalance: DR },

  // ── Liabilities (normal CREDIT) ─────────────────────────────────────────
  {
    key: GL.PATIENT_DEPOSITS,
    code: '2100',
    name: 'Patient Deposits (Advances)',
    type: L,
    normalBalance: CR,
    description: 'Money received before treatment/revenue is recognised',
  },
  { key: GL.TAX_PAYABLE, code: '2200', name: 'Tax Payable', type: L, normalBalance: CR },
  { key: GL.ACCOUNTS_PAYABLE, code: '2300', name: 'Accounts Payable', type: L, normalBalance: CR },

  // ── Equity (normal CREDIT) ──────────────────────────────────────────────
  { key: GL.OWNERS_EQUITY, code: '3000', name: "Owner's Equity", type: EQ, normalBalance: CR },

  // ── Income (normal CREDIT) ──────────────────────────────────────────────
  { key: GL.TREATMENT_REVENUE, code: '4000', name: 'Treatment Revenue', type: I, normalBalance: CR },
  { key: GL.CONSULTATION_REVENUE, code: '4100', name: 'Consultation Revenue', type: I, normalBalance: CR },
  { key: GL.PHARMACY_REVENUE, code: '4200', name: 'Pharmacy Revenue', type: I, normalBalance: CR },
  {
    key: GL.SALES_DISCOUNT,
    code: '4050',
    name: 'Sales Discounts',
    type: I,
    normalBalance: DR, // contra-revenue — reduces net revenue
    description: 'Discounts granted on invoices (contra-revenue)',
  },
  { key: GL.OTHER_INCOME, code: '4900', name: 'Other Income', type: I, normalBalance: CR },

  // ── Dental-discipline revenue (normal CREDIT) ───────────────────────────
  // Map procedures/categories to these on the catalog screens. Codes avoid the
  // 4100/4200 already used by Consultation/Pharmacy above; rename freely in the UI.
  { key: GL.RESTORATIVE_REVENUE, code: '4110', name: 'Restorative Revenue', type: I, normalBalance: CR, description: 'Fillings, build-ups, restorations' },
  { key: GL.ENDODONTIC_REVENUE, code: '4120', name: 'Endodontic Revenue', type: I, normalBalance: CR, description: 'Root canal therapy' },
  { key: GL.PROSTHODONTIC_REVENUE, code: '4130', name: 'Prosthodontic Revenue', type: I, normalBalance: CR, description: 'Crowns, bridges, dentures, implants' },
  { key: GL.ORAL_SURGERY_REVENUE, code: '4140', name: 'Oral Surgery Revenue', type: I, normalBalance: CR, description: 'Extractions and surgical procedures' },
  { key: GL.PREVENTIVE_REVENUE, code: '4150', name: 'Preventive Revenue', type: I, normalBalance: CR, description: 'Scaling, polishing, fluoride, sealants' },
  { key: GL.ORTHODONTIC_REVENUE, code: '4160', name: 'Orthodontic Revenue', type: I, normalBalance: CR, description: 'Braces and aligners' },

  // ── Expenses (normal DEBIT) ─────────────────────────────────────────────
  { key: GL.COST_OF_SUPPLIES, code: '5000', name: 'Cost of Supplies', type: EX, normalBalance: DR },
  { key: GL.SALARIES, code: '5100', name: 'Salaries & Wages', type: EX, normalBalance: DR },
  { key: GL.RENT, code: '5200', name: 'Rent', type: EX, normalBalance: DR },
  { key: GL.UTILITIES, code: '5300', name: 'Utilities', type: EX, normalBalance: DR },
  { key: GL.OTHER_EXPENSE, code: '5900', name: 'Other Expense', type: EX, normalBalance: DR },
];

const BY_KEY = new Map(CANONICAL_ACCOUNTS.map((a) => [a.key, a]));
const BY_CODE = new Map(CANONICAL_ACCOUNTS.map((a) => [a.code, a]));

export function canonicalByKey(key: string): CanonicalAccount | undefined {
  return BY_KEY.get(key);
}
export function canonicalByCode(code: string): CanonicalAccount | undefined {
  return BY_CODE.get(code);
}

/**
 * Map a physical cash/bank Account's `type` (AccountType enum) to the GL cash
 * account systemKey its money lands in. Falls back to Cash on Hand.
 */
export function glCashKeyForAccountType(accountType?: string | null): string {
  switch (accountType) {
    case 'BANK':
      return GL.BANK;
    case 'MOBILE_MONEY':
      return GL.MOBILE_MONEY;
    case 'CASH':
    case 'PETTY_CASH':
    default:
      return GL.CASH_ON_HAND;
  }
}

/**
 * Map an expense category to the GL expense account systemKey it should hit.
 * Keyword-matched so it tolerates free-text or enum categories. Falls back to
 * Other Expense — so an unmapped category still books to a real account rather
 * than failing the post.
 */
export function glExpenseKeyForCategory(category?: string | null): string {
  const c = (category ?? '').toUpperCase();
  if (/SALAR|PAYROLL|WAGE|STAFF/.test(c)) return GL.SALARIES;
  if (/RENT|LEASE/.test(c)) return GL.RENT;
  if (/UTILIT|ELECTRIC|WATER|INTERNET|POWER|FUEL/.test(c)) return GL.UTILITIES;
  if (/SUPPL|MATERIAL|CONSUMABLE|INVENTORY|STOCK|LAB|DRUG|MEDIC/.test(c))
    return GL.COST_OF_SUPPLIES;
  return GL.OTHER_EXPENSE;
}

/**
 * Map a PaymentMethod to the GL cash account systemKey the money lands in.
 * Mirrors PaymentAccountResolverService. Falls back to Cash on Hand.
 */
export function glCashKeyForMethod(method?: string | null): string {
  switch (method) {
    case 'MTN_MOBILE_MONEY':
    case 'AIRTEL_MONEY':
      return GL.MOBILE_MONEY;
    case 'VISA_CARD':
    case 'MASTERCARD':
    case 'BANK_TRANSFER':
    case 'CHEQUE':
    case 'INSURANCE':
      return GL.BANK;
    case 'CASH':
    default:
      return GL.CASH_ON_HAND;
  }
}
