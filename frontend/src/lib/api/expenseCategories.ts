// ─────────────────────────────────────────────────────────────────────────────
// src/lib/api/expenseCategories.ts
// Dynamic expense categories (CRUD) with an optional GL ledger-account link.
// ─────────────────────────────────────────────────────────────────────────────

import api from '@/lib/api/client';

export interface ExpenseCategoryLedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  ledgerAccountId?: string | null;
  ledgerAccount?: ExpenseCategoryLedgerAccount | null;
  /** Number of expenses using this category (drives delete-vs-disable). */
  _count?: { expenses: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateExpenseCategoryInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  /** Optional GL link — when set, expenses in this category post double-entry. */
  ledgerAccountId?: string | null;
}

export type UpdateExpenseCategoryInput = Partial<
  CreateExpenseCategoryInput & { isActive: boolean }
>;

export const expenseCategoriesApi = {
  list: async (includeInactive = false): Promise<ExpenseCategory[]> => {
    const res = await api.get('/expense-categories', {
      params: includeInactive ? { includeInactive: true } : {},
    });
    return res.data;
  },

  getById: async (id: string): Promise<ExpenseCategory> => {
    const res = await api.get(`/expense-categories/${id}`);
    return res.data;
  },

  create: async (data: CreateExpenseCategoryInput): Promise<ExpenseCategory> => {
    const res = await api.post('/expense-categories', data);
    return res.data;
  },

  update: async (
    id: string,
    data: UpdateExpenseCategoryInput,
  ): Promise<ExpenseCategory> => {
    const res = await api.patch(`/expense-categories/${id}`, data);
    return res.data;
  },

  remove: async (id: string) => {
    const res = await api.delete(`/expense-categories/${id}`);
    return res.data;
  },
};
