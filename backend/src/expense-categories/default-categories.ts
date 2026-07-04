// src/expense-categories/default-categories.ts
//
// The default expense categories seeded on a fresh install (and self-healed on
// boot). Users own this list afterwards — they can rename, re-map, disable, add
// and delete. `glKey` is the canonical ledger-account systemKey each category is
// pre-linked to WHEN that account exists; categories with `glKey: null` start
// unmapped, so expenses in them are recorded but not posted to the GL until the
// user links an account (opt-in accounting).

import { GL } from '../general-ledger/gl-accounts';

export interface DefaultExpenseCategory {
  slug: string;
  name: string;
  icon?: string;
  /** Canonical ledger-account systemKey to pre-link, or null to leave unmapped. */
  glKey: string | null;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultExpenseCategory[] = [
  { slug: 'DENTAL_SUPPLIES', name: 'Dental Supplies', icon: '📦', glKey: GL.COST_OF_SUPPLIES },
  { slug: 'LABORATORY_FEES', name: 'Laboratory Fees', icon: '🔬', glKey: null },
  { slug: 'STAFF_SALARIES', name: 'Staff Salaries', icon: '👥', glKey: GL.SALARIES },
  { slug: 'UTILITIES', name: 'Utilities', icon: '⚡', glKey: GL.UTILITIES },
  { slug: 'RENT', name: 'Rent', icon: '🏢', glKey: GL.RENT },
  { slug: 'MARKETING', name: 'Marketing', icon: '📣', glKey: null },
  { slug: 'EQUIPMENT_MAINTENANCE', name: 'Equipment Maintenance', icon: '🛠️', glKey: null },
  { slug: 'EQUIPMENT_PURCHASE', name: 'Equipment Purchase', icon: '🪑', glKey: null },
  { slug: 'TRANSPORTATION', name: 'Transportation', icon: '🚗', glKey: null },
  { slug: 'CLEANING_SUPPLIES', name: 'Cleaning Supplies', icon: '🧹', glKey: GL.COST_OF_SUPPLIES },
  { slug: 'INTERNET_COMMUNICATION', name: 'Internet & Communication', icon: '🌐', glKey: GL.UTILITIES },
  { slug: 'PROFESSIONAL_FEES', name: 'Professional Fees', icon: '⚖️', glKey: null },
  { slug: 'TRAINING', name: 'Training', icon: '🎓', glKey: null },
  { slug: 'INSURANCE', name: 'Insurance', icon: '🛡️', glKey: null },
  { slug: 'TAXES', name: 'Taxes', icon: '🧾', glKey: null },
  { slug: 'MISCELLANEOUS', name: 'Miscellaneous', icon: '🗂️', glKey: GL.OTHER_EXPENSE },
];

/**
 * Map a legacy `ExpenseCategory` enum value (pre-migration) to the new category
 * slug, so historical expenses can be linked to their dynamic category.
 */
export const LEGACY_ENUM_TO_SLUG: Record<string, string> = {
  UTILITIES: 'UTILITIES',
  SALARIES: 'STAFF_SALARIES',
  SUPPLIES: 'DENTAL_SUPPLIES',
  EQUIPMENT: 'EQUIPMENT_PURCHASE',
  MAINTENANCE: 'EQUIPMENT_MAINTENANCE',
  RENT: 'RENT',
  MARKETING: 'MARKETING',
  INSURANCE: 'INSURANCE',
  LEGAL: 'PROFESSIONAL_FEES',
  TRANSPORT: 'TRANSPORTATION',
  COMMUNICATION: 'INTERNET_COMMUNICATION',
  OTHER: 'MISCELLANEOUS',
};
