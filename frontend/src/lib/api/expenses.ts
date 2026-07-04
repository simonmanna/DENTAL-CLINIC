// ─────────────────────────────────────────────────────────────────────────────
// src/lib/api/expenses.ts
// ─────────────────────────────────────────────────────────────────────────────

import api from '@/lib/api/client';

export type { Expense, ExpenseStats, Account, User, Supplier } from '../../types/expenses';

// ── Expenses ─────────────────────────────────────────────────────────────────

export type ExpenseStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'POSTED'
  | 'VOID';

export type ExpensePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export const expensesApi = {
  getAll: async (params: {
    page: number; limit: number;
    categoryId?: string; status?: ExpenseStatus;
    paymentStatus?: ExpensePaymentStatus;
    dateFrom?: string; dateTo?: string; search?: string;
    paymentType?: string;
  }) => {
    const response = await api.get('/expenses', { params });
    return response.data;
  },

  getStats: async (dateFrom?: string, dateTo?: string) => {
    const response = await api.get('/expenses/stats', { params: { dateFrom, dateTo } });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/expenses/${id}`);
    return response.data;
  },

  getPayments: async (id: string) => {
    const response = await api.get(`/expenses/${id}/payments`);
    return response.data;
  },

  // Audit trail for an expense (its own changes + its payments')
  getAudit: async (id: string) => {
    const response = await api.get(`/expenses/${id}/audit`);
    return response.data;
  },

  create: async (data: {
    title: string;
    categoryId: string;
    amount: number;
    createdBy: string;
    description?: string;
    expenseDate?: string;
    notes?: string;
    supplierId?: string;
    paymentType?: 'CASH' | 'CREDIT';
    // Cash-only fields
    paymentMethod?: string;
    accountId?: string;
    paymentReference?: string;
    paymentNotes?: string;
  }) => {
    const response = await api.post('/expenses', data);
    return response.data;
  },

  update: async (id: string, data: {
    title?: string; categoryId?: string; amount?: number;
    description?: string; expenseDate?: string;
    notes?: string; supplierId?: string;
  }) => {
    const response = await api.patch(`/expenses/${id}`, data);
    return response.data;
  },

  // Hard-delete: only allowed for unpaid expenses or already-voided ones
  delete: async (id: string) => {
    const response = await api.delete(`/expenses/${id}`);
    return response.data;
  },

  // Soft-cancel: marks as CANCELLED (must be unpaid)
  cancel: async (id: string, reason?: string) => {
    const response = await api.post(`/expenses/${id}/cancel`, { reason });
    return response.data;
  },

  // Void: reverses ALL underlying payments + cash flow, marks expense VOID
  void: async (id: string, data: { voidReason: string; voidedBy?: string }) => {
    const response = await api.post(`/expenses/${id}/void`, data);
    return response.data;
  },

  approve: async (id: string, data: { approvedBy: string; approvalNotes?: string }) => {
    const response = await api.post(`/expenses/${id}/approve`, data);
    return response.data;
  },

  reject: async (id: string, reason?: string) => {
    const response = await api.post(`/expenses/${id}/reject`, { reason });
    return response.data;
  },

  pay: async (id: string, data: {
    paidBy: string; paymentMethod: string;
    reference?: string; paymentNotes?: string; accountId: string;
  }) => {
    const response = await api.post(`/expenses/${id}/pay`, data);
    return response.data;
  },
};

// ── Payments (void & delete individual payments separately) ────────────
export const paymentsApi = {
  void: async (id: string, data: { voidReason: string; voidedBy?: string }) => {
    const response = await api.post(`/payments/${id}/void`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/payments/${id}`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/payments/${id}`);
    return response.data;
  },
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersApi = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },
};

// ── Accounts ──────────────────────────────────────────────────────────────────

export const accountsApi = {
  getAll: async () => {
    const response = await api.get('/accounts');
    return response.data;
  },
};

// ── Suppliers ─────────────────────────────────────────────────────────────────

export const suppliersApi = {
  getAll: async () => {
    const response = await api.get('/suppliers');
    return response.data;
  },
};