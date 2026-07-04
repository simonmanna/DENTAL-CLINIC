import { api } from "./client";

export interface Receipt {
  id: string;
  receiptNumber: string;
  invoiceId: string;
  paymentId?: string;
  amountReceived: number;
  currencyCode?: string;
  exchangeRate?: number | null;
  baseAmountReceived?: number | null;
  invoiceAmountApplied?: number | null;
  /** ACTIVE or VOID */
  status: 'ACTIVE' | 'VOID';
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  generatedAt: string;
  generatedBy?: string;
  receivedById?: string | null;
  receivedByName?: string | null;
  /** Populated when the backend includes the staff relation. */
  receivedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    specialization?: string | null;
  } | null;
  notes?: string;
  metadata?: Record<string, unknown> | null;
  invoice: {
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    balance: number;
    patient: {
      firstName: string;
      lastName: string;
      patientCode: string;
    };
  };
  payment?: {
    method: string;
    reference?: string;
  };
  /** Payment mode stored directly on the receipt. */
  paymentMethod?: string | null;
  /** Account the payment was received into (name/type shown on receipts). */
  account?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export interface ReceiptFilters {
  search?: string;
  patientId?: string;
  invoiceId?: string;
  status?: 'ACTIVE' | 'VOID';
  paymentMethod?: string;
  currencyCode?: 'UGX' | 'USD';
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
}

export interface ReceiptStats {
  totalReceipts: number;
  totalAmount: number;
  receiptsToday: number;
  period: string;
}

export const receiptsApi = {
  getAll: (filters: ReceiptFilters = {}) => 
    api.get('/receipts', { params: filters }),
  
  getById: (id: string) => 
    api.get(`/receipts/${id}`),
  
  getByNumber: (receiptNumber: string) => 
    api.get(`/receipts/by-number/${receiptNumber}`),
  
  getByInvoice: (invoiceId: string) => 
    api.get(`/receipts/invoice/${invoiceId}`),
  
  getForPrint: (id: string) => 
    api.get(`/receipts/${id}/print`),
  
  getStats: (period: 'day' | 'week' | 'month' | 'year' = 'month') =>
    api.get('/receipts/stats', { params: { period } }),

  // Receipts are created automatically when you record a payment against an
  // invoice — there is no stand-alone "create receipt" endpoint. Use
  // billingApi.recordPayment(invoiceId, ...) instead.

  voidReceipt: (id: string, data: { voidReason: string; voidedBy?: string }) =>
    api.patch(`/receipts/${id}/void`, data),
};