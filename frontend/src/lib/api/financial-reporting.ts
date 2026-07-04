// src/lib/api/financial-reporting.ts

const BASE = "/financial-reporting";

export interface FinancialReportFilters {
  search?: string;
  startDate?: string;
  endDate?: string;
  patientId?: string;
  dentistId?: string;
  accountId?: string;
  status?: string;
  paymentStatus?: string;
  method?: string;
  type?: string;
  direction?: string;
  currency?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  category?: string;
}

// ── Typed response shapes ──────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// --- Invoices ---
export interface InvoicePatient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
  phone?: string;
  email?: string;
}

export interface InvoiceDoctorRef {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus?: string;
  currency: string;
  baseCurrency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  baseTotal: number;
  baseAmountPaid: number;
  baseBalance: number;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  createdAt: string;
  patient?: InvoicePatient;
  visit?: { id: string; visitCode: string; dentist?: InvoiceDoctorRef };
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    procedure?: { name: string; code: string };
  }[];
  receipts: {
    id: string;
    receiptNumber: string;
    amountReceived: number;
    currency: string;
    generatedAt: string;
  }[];
  payments: {
    id: string;
    paymentCode: string;
    amount: number;
    method: string;
    status: string;
    paidAt: string;
  }[];
}

export interface InvoiceSummary {
  total: number;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  totalBaseRevenue?: number;
  totalBaseCollected?: number;
  collectionRate?: number;
  outstandingCount: number;
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  statusBreakdown: {
    status: string;
    count: number;
    total: number;
    paid: number;
  }[];
  paymentStatusBreakdown?: {
    paymentStatus: string;
    count: number;
    total: number;
    paid: number;
    balance: number;
  }[];
  revenueByProcedure: { name: string; total: number; count: number }[];
  revenueByDoctor: {
    name: string;
    total: number;
    paid: number;
    count: number;
  }[];
  paymentsByMethod: { method: string; total: number; count: number }[];
  agingBuckets?: { label: string; count: number; amount: number }[];
}

export interface InvoicesReport {
  data: InvoiceRow[];
  pagination: PaginationMeta;
  summary: InvoiceSummary;
}

// --- Receipts ---
export interface ReceiptRow {
  id: string;
  receiptNumber: string;
  amountReceived: number;
  currency: string;             // plain string (mirrors currencyCode)
  currencyCode?: string;
  exchangeRate?: number;
  baseAmountReceived?: number;
  invoiceAmountApplied?: number;
  status?: "ACTIVE" | "VOID";
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  generatedAt: string;
  generatedBy?: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid?: number;
    balance?: number;
    currency: string;
    status: string;
    paymentStatus?: string;
    issuedAt?: string;
    patient?: InvoicePatient;
    visit?: { id: string; visitCode: string; dentist?: InvoiceDoctorRef };
  };
}

export interface ReceiptSummary {
  total: number;                 // total rows matching status filter
  totalActiveCount?: number;     // count of ACTIVE receipts
  totalCollected: number;        // in BASE currency (UGX equivalent)
  totalBaseCollected?: number;
  byCurrency?: {
    currency: string;
    total: number;               // sum in that currency
    totalBase: number;           // sum converted to base currency
    count: number;
  }[];
  voidedCount?: number;
  voidedTotalBase?: number;
  dailyCollections: { date: string; total: number; count: number }[];
  methodBreakdown: { method: string; total: number; count: number }[];
}

export interface ReceiptsReport {
  data: ReceiptRow[];
  pagination: PaginationMeta;
  summary: ReceiptSummary;
}

// --- Payments ---
export interface PaymentRow {
  id: string;
  paymentCode: string;
  type: string;
  direction: "IN" | "OUT";
  amount: number;
  method: string;
  status: string;
  currency: string;
  baseAmount: number;
  reference?: string;
  transactionId?: string;
  bankName?: string;
  chequeNumber?: string;
  receivedBy?: string;
  notes?: string;
  paidAt: string;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    patient?: InvoicePatient;
  };
  purchaseOrder?: { id: string; poNumber: string; supplier?: { name: string } };
  expense?: {
    id: string;
    expenseCode: string;
    title: string;
    category: string;
  };
  account?: string;
  party?: string;
  contextLabel?: string;
}

export interface PaymentSummary {
  total: number;
  totalIn: number;
  totalOut: number;
  netAmount: number;
  inCount: number;
  outCount: number;
  byMethod: {
    method: string;
    direction: string;
    total: number;
    count: number;
  }[];
  byType: { type: string; total: number; count: number }[];
}

export interface PaymentsReport {
  data: PaymentRow[];
  pagination: PaginationMeta;
  summary: PaymentSummary;
}

// ── API functions ──────────────────────────────────────────────────────────

import { api } from "./client";

/**
 * Clean query params: remove undefined, null, empty string, and string "undefined".
 */
function cleanParams(
  params: Record<string, any>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined",
    ),
  ) as Record<string, string | number>;
}

export const financialReportingApi = {
  /** Get invoices report */
  getInvoicesReport: (filters: FinancialReportFilters) =>
    api
      .get<InvoicesReport>(`${BASE}/invoices`, {
        params: cleanParams(filters),
      })
      .then((r) => r.data),

  /** Get receipts report */
  getReceiptsReport: (filters: FinancialReportFilters) =>
    api
      .get<ReceiptsReport>(`${BASE}/receipts`, {
        params: cleanParams(filters),
      })
      .then((r) => r.data),

  /** Get payments report */
  getPaymentsReport: (filters: FinancialReportFilters) =>
    api
      .get<PaymentsReport>(`${BASE}/payments`, {
        params: cleanParams(filters),
      })
      .then((r) => r.data),

  getExpensesReport: (filters: FinancialReportFilters) =>
    api
      .get<{
        data: ExpenseRow[];
        pagination: PaginationMeta;
        summary: any;
      }>(`${BASE}/expenses`, { params: cleanParams(filters) })
      .then((r) => r.data),
};

export interface ExpenseRow {
  id: string;
  expenseCode: string;
  category: string;
  title: string;
  description?: string | null;
  amount: number;
  expenseDate: string;
  status: string;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  paidAt?: string | null;
  attachments: string[];
  notes?: string | null;
  createdAt: string;
  createdByName?: string | null;
  approvedByName?: string | null;
  totalPaid: number;
  payments: {
    id: string;
    paymentCode: string;
    amount: number;
    method: string;
    status: string;
    currency: string;
    paidAt: string;
  }[];
}

