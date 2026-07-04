// ─────────────────────────────────────────────────────────────────────────────
// src/types/expenses.ts
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  staff?: { firstName: string; lastName: string } | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
}

export type ExpenseStatus =
  | "DRAFT"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "POSTED"
  | "VOID";

export type ExpensePaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export interface ExpenseCategoryRef {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  ledgerAccountId?: string | null;
}

export interface Expense {
  id: string;
  expenseCode: string;
  /** Live category link (may be null if the category was later deleted). */
  categoryId?: string | null;
  category?: ExpenseCategoryRef | null;
  /** Permanent snapshot of the category name at creation time. */
  categoryName: string;
  title: string;
  description?: string;
  amount: number;
  amountPaid?: number;
  balance?: number;
  expenseDate: string;
  status: ExpenseStatus;
  paymentStatus?: ExpensePaymentStatus;
  paymentType?: "CASH" | "CREDIT";
  supplier?: Supplier | null;
  approvedBy?: { staff?: { firstName: string; lastName: string } | null } | null;
  approvedAt?: string;
  approvalNotes?: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  createdBy?: { staff?: { firstName: string; lastName: string } | null };
  createdAt: string;
}

export interface ExpenseStats {
  totalPaid: number;
  totalPaidCount: number;
  totalUnpaid: number;
  totalUnpaidCount: number;
  totalPartiallyPaid: number;
  totalPartiallyPaidCount: number;
  totalOutstanding: number;
  voidedCount: number;
  voidedAmount: number;
  count: number;
  grandTotal: number;
  grandTotalPaid: number;
  grandTotalBalance: number;
  byCategory: { category: string; _sum: { amount: number; balance?: number }; _count: { id: number } }[];
  bySupplier?: { supplierId: string | null; supplierName: string | null; _sum: { amount: number; balance?: number }; _count: { id: number } }[];
  byStatus?: { status: string; _sum: { amount: number }; _count: { id: number } }[];
  byPaymentStatus?: { paymentStatus: string; _sum: { amount: number; amountPaid: number; balance: number }; _count: { id: number } }[];
  outstandingPayables?: { amount: number | string; count: number };
}

export interface AuditLogRow {
  id: string;
  action: string;
  module: string;
  entityType: string | null;
  recordId: string | null;
  userId: string | null;
  userName: string | null;
  oldData: unknown;
  newData: unknown;
  reason: string | null;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  currentBalance: number;
}


