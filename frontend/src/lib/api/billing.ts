import { api } from "./client";
import type {
  BillingService,
  LedgerEntry,
  LedgerSummary,
  Invoice,
  Payment,
  ReceiptData,
} from "../../types/billing";

export interface ServiceListResponse {
  data: BillingService[];
}

export interface LedgerListResponse {
  data: LedgerEntry[];
  summary: LedgerSummary;
}

export interface InvoiceListResponse {
  data: Invoice[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const billingApi = {
  /** Get exchange rate between two currencies */
  getExchangeRate: (from: string, to: string) =>
    api.get<{ from: string; to: string; rate: number }>("/billing/currencies/rate", { params: { from, to } })
      .then(r => r.data),

  /** Get billing services with optional category/search filters */
  getServices: (params?: { category?: string; search?: string }) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([_, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "undefined"
      )
    );
    return api
      .get<ServiceListResponse>("/billing/services", { params: cleanParams })
      .then((r) => r.data);
  },

  /** Create a ledger entry from a billing service */
  createLedgerFromService: (data: {
    patientId: string;
    visitId?: string;
    serviceId: string;
    quantity: number;
    overridePrice?: number;
    overrideCurrency?: string;
    notes?: string;
  }) =>
    api
      .post<LedgerEntry>("/billing/ledger/from-service", data)
      .then((r) => r.data),

  /** Create a manual ledger entry */
  createManualLedger: (data: {
    patientId: string;
    visitId: string;
    type: string;
    description: string;
    quantity: number;
    pricePerUnit: number;
    subtotalPrice: number;
    discountAmount: number;
    taxAmount: number;
    currency: string;
    notes?: string;
    sourceType?: string;
  }) => api.post<LedgerEntry>("/billing/ledger", data).then((r) => r.data),

  /** Get ledger entries for a visit */
  getLedger: (params: {
    visitId: string;
    status: string;
    currency: string;
  }) =>
    api
      .get<LedgerListResponse>("/billing/ledger", { params })
      .then((r) => r.data),

  /** Void a ledger entry */
  voidLedger: (id: string, reason: string) =>
    api
      .patch<LedgerEntry>(`/billing/ledger/${id}/void`, { reason })
      .then((r) => r.data),

  /**
   * List invoices with the full production filter set.
   *
   * Server-side filtering only — no client-side fallback. Every param
   * (except patientId/visitId) hits the DB. Returns `{ data, meta }` where
   * `meta.total` is the canonical row count for pagination; `meta.appliedFilters`
   * echoes the resolved filter set so the UI can render "X of Y matching …".
   *
   * Sort + pagination are passed straight through. `limit` is clamped to 200
   * server-side; default 25.
   */
  getInvoices: (params: {
    patientId?: string;
    visitId?: string;
    status?: string;            // DRAFT | POSTED | VOID | ALL
    paymentStatus?: string;     // UNPAID | PARTIALLY_PAID | PAID | ALL
    currency?: string;          // USD, UGX, …
    baseCurrency?: string;
    search?: string;            // invoiceNumber / patient name / patientCode
    dateFrom?: string;           // ISO 8601
    dateTo?: string;             // ISO 8601
    dentistId?: string;
    sortBy?: "createdAt" | "total" | "balance" | "invoiceNumber";
    sortDir?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([_, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "undefined" &&
          value !== "ALL",
      ),
    );
    return api
      .get<InvoiceListResponse>("/billing/invoices", { params: cleanParams })
      .then((r) => r.data);
  },

  /** Get a single invoice by ID */
  getInvoice: (id: string) =>
    api.get<Invoice>(`/billing/invoices/${id}`).then((r) => r.data),

  /** Create an invoice from ledger entries */
  createInvoice: (data: {
    patientId: string;
    visitId: string;
    ledgerEntryIds: string[];
    invoiceCurrency: string;
    customExchangeRate?: number;
    discountType?: string;
    discountValue?: number;
    taxPercent: number;
    notes?: string;
    dueDate?: string;
  }) =>
    api
      .post<Invoice>("/billing/invoices/from-ledger", data)
      .then((r) => r.data),

  /** Void an invoice (handles DRAFT / ACTIVE / PARTIALLY_PAID / PAID) */
  voidInvoice: (id: string, reason: string, voidedBy?: string) =>
    api
      .patch<Invoice>(`/billing/invoices/${id}/void`, { reason, voidedBy })
      .then((r) => r.data),

  /** Record a payment on an invoice */
  recordPayment: (
    invoiceId: string,
    data: {
      amount: number;
      paymentCurrency: string;
      method: string;
      reference?: string;
      notes?: string;
      generateReceipt?: boolean;
      /** Staff.id of the cashier who received the money. */
      receivedById?: string;
    },
    /**
     * Idempotency key (C1). Pass a stable value for one logical payment so a
     * double-click or network retry replays the first result instead of
     * recording a second payment. Generate once per payment attempt.
     */
    idempotencyKey?: string
  ) =>
    api
      .post<Payment>(`/billing/invoices/${invoiceId}/payments`, data, {
        headers: idempotencyKey
          ? { 'Idempotency-Key': idempotencyKey }
          : undefined,
      })
      .then((r) => r.data),

  /** Get receipt data for an invoice */
  getReceipt: (invoiceId: string) =>
    api
      .get<ReceiptData>(`/billing/invoices/${invoiceId}/receipt`)
      .then((r) => r.data),

  createLedgerFromPrescriptionItem: (data: { prescriptionItemId: string; currency?: string; exchangeRate?: number }) =>
    api.post<LedgerEntry>('/billing/ledger/from-prescription-item', data).then(r => r.data),

  // ── Invoice Lifecycle (new architecture) ──────────────────────────────────

  /** Get or create a DRAFT invoice for a patient/visit */
  getOrCreateDraftInvoice: (data: { patientId: string; visitId?: string; treatmentPlanId?: string }) =>
    api.post<Invoice>('/billing/invoices/draft', data).then(r => r.data),

  /** Get all DRAFT invoices for a patient/visit */
  getDraftInvoices: (params: { patientId: string; visitId?: string }) =>
    api.get<{ data: Invoice[] }>('/billing/invoices', {
      params: { ...params, status: 'DRAFT' },
    }).then(r => r.data),

  /** Activate a DRAFT invoice — posts CHARGE ledger entries */
  activateInvoice: (id: string, activatedBy?: string) =>
    api.post<Invoice>(`/billing/invoices/${id}/activate`, { activatedBy }).then(r => r.data),

  /** Add an encounter item to an ACTIVE invoice */
  addEncounterItem: (
    invoiceId: string,
    data: {
      description: string;
      itemType: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      currency?: string;
      exchangeRate?: number;
      notes?: string;
      prescriptionItemId?: string;
    }
  ) => api.post<Invoice>(`/billing/invoices/${invoiceId}/encounter-items`, data).then(r => r.data),

  /** Close a fully-paid invoice */
  closeInvoice: (id: string) =>
    api.patch<Invoice>(`/billing/invoices/${id}/close`).then(r => r.data),

  /** Void an invoice via the lifecycle endpoint (same comprehensive logic as voidInvoice) */
  voidInvoiceLifecycle: (id: string, reason: string, voidedBy?: string) =>
    api.patch<Invoice>(`/billing/invoices/${id}/void-new`, { reason, voidedBy }).then(r => r.data),

  /** Remove an encounter item from an invoice (recalculates totals automatically) */
  removeInvoiceItem: (invoiceId: string, itemId: string) =>
    api.delete<Invoice>(`/billing/invoices/${invoiceId}/items/${itemId}`).then(r => r.data),

  /** Update invoice meta fields (paymentTerms, notes) */
  updateInvoiceMeta: (id: string, data: { paymentTerms?: string; notes?: string }) =>
    api.patch<Invoice>(`/billing/invoices/${id}/meta`, data).then(r => r.data),

  /** Change an invoice's display currency. All items, totals & amountPaid are
   *  reconverted on the backend; base-currency snapshots are preserved. */
  changeInvoiceCurrency: (id: string, currency: string) =>
    api.patch<Invoice>(`/billing/invoices/${id}/currency`, { currency }).then(r => r.data),
};