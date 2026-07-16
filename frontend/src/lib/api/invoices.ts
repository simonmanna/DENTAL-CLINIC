// src/lib/api/invoices.ts
import { api } from "./client";

export interface InvoiceItem {
  id?: string;
  procedureId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
  toothNumbers?: number[];
  ledgerEntryId?: string;
  originalCurrency?: string;
  originalUnitPrice?: number;
  originalTotal?: number;
  exchangeRate?: number;
  status?: 'ACTIVE' | 'VOID';
}

export interface InvoiceFormData {
  patientId: string;
  visitId?: string;
  appointmentId?: string;
  status?: string;
  subtotal?: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  total?: number;
  amountPaid?: number;
  balance?: number;
  notes?: string;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  // Multi-currency
  invoiceCurrency?: string;
  customExchangeRate?: number;
  baseCurrency?: string;
  baseSubtotal?: number;
  baseDiscountAmount?: number;
  baseTaxAmount?: number;
  baseTotal?: number;
  baseAmountPaid?: number;
  baseBalance?: number;
  // Ledger
  ledgerEntryIds?: string[];
  // Items
  items?: InvoiceItem[];
}

export const invoicesApi = {
  getPatientInvoices: (patientId: string) =>
    api.get(`/invoices/patient/${patientId}`).then((r) => r.data),

  getInvoice: (id: string) => api.get(`/invoices/${id}`).then((r) => r.data),

  createInvoice: (data: InvoiceFormData) =>
    api.post(`/invoices`, data).then((r) => r.data),

  updateInvoice: (id: string, data: Partial<InvoiceFormData>) =>
    api.patch(`/invoices/${id}`, data).then((r) => r.data),

  deleteInvoice: (id: string) =>
    api.delete(`/invoices/${id}`).then((r) => r.data),

  addLedgerEntries: (invoiceId: string, ledgerEntryIds: string[]) =>
    api
      .post(`/invoices/${invoiceId}/ledger-entries`, { ledgerEntryIds })
      .then((r) => r.data),
};
