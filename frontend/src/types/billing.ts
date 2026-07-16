
import type { LedgerEntryType, BillingServiceCategory } from "@/types/shared";

// ── Billing Service DTOs ─────────────────────────────────────────────────────

export interface CreateBillingServiceDto {
  serviceCode: string;
  name: string;
  description?: string;
  type: LedgerEntryType;
  category: BillingServiceCategory;
  price: number;
  currency: string;
  exchangeRate?: number;
  defaultTaxAmount?: number;
  defaultTaxLabel?: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
  isActive?: boolean;
  isFavorite?: boolean;
  sortOrder?: number;
  notes?: string;
}

export interface UpdateBillingServiceDto extends CreateBillingServiceDto {}

export interface QueryBillingServiceDto {
  search?: string;
  category?: string;
  isActive?: string;
  isFavorite?: string;
}

export interface BillingService {
  id: string;
  serviceCode: string;
  name: string;
  description?: string;
  type:
    | "PROCEDURE"
    | "DRUG"
    | "CONSULTATION"
    | "SERVICE"
    | "LAB"
    | "IMAGING"
    | "OTHER"
    | "TREATMENT_PROCEDURE"
    | "TREATMENT_PROCEDURE_SESSION";
  category:
    | "CONSULTATION"
    | "PROCEDURE"
    | "DIAGNOSTIC"
    | "MEDICATION"
    | "THERAPY"
    | "SURGICAL"
    | "PREVENTIVE"
    | "ADMINISTRATIVE"
    | "OTHER";
  price: number;
  currency: string;
  exchangeRate?: number;
  defaultTaxAmount: number;
  defaultTaxLabel?: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
  isActive: boolean;
  isFavorite: boolean;
  sortOrder: number;
  notes?: string;
}

export interface LedgerEntry {
  id: string;
  entryCode: string;
  type:
    | "PROCEDURE"
    | "DRUG"
    | "CONSULTATION"
    | "SERVICE"
    | "LAB"
    | "IMAGING"
    | "OTHER"
    | "TREATMENT_PROCEDURE"
    | "TREATMENT_PROCEDURE_SESSION";
  description: string;
  sourceType?: string;
  sourceId?: string;
  quantity: number;
  pricePerUnit: number;
  subtotalPrice: number;
  discountAmount: number;
  taxAmount: number;
  totalPrice: number;
  currency: string;
  exchangeRate: number | null;
  baseCurrency: string;
  baseAmount: number;
  notes?: string;
  status: "PENDING" | "INVOICED" | "VOID";
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  itemType?: string;
  treatmentProcedureId?: string;
  status?: 'ACTIVE' | 'VOID';
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  originalCurrency: string;
  originalUnitPrice: number;
  originalTotal: number;
  exchangeRate: number;
  toothNumbers?: number[];
  ledgerEntryId?: string;
  ledgerEntry?: {
    id: string;
    entryCode: string;
    type: string;
    sourceType?: string;
    currency: string;
    totalPrice: number;
    baseAmount: number;
    exchangeRate: number;
  };
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  baseAmount: number;
  exchangeRate: number;
  method: string;
  status: string;
  reference?: string;
  transactionId?: string;
  notes?: string;
  receivedBy?: string;
  paidAt: string;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  /** Amount in the currency the patient actually paid (e.g. 10 for 10 USD) */
  amountReceived: number;
  /** The currency the patient paid in — maps to Receipt.currencyCode */
  currencyCode: string;
  /** Exchange rate snapshot at time of payment */
  exchangeRate?: number | null;
  /** Equivalent in base currency (UGX) */
  baseAmountReceived?: number | null;
  /** Exact amount deducted from invoice.amountPaid (for lossless reversal) */
  invoiceAmountApplied?: number | null;
  /** ACTIVE or VOID */
  status: 'ACTIVE' | 'VOID';
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  generatedAt: string;
  createdAt: string;
  generatedBy?: string | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId?: string;
  visitId?: string;
  treatmentPlanId?: string;
  status:
    | "DRAFT"
    | "POSTED"
    | "VOID"
    // Legacy values for backward-compat with existing DB rows
    | "ACTIVE"
    | "ISSUED"
    | "PARTIALLY_PAID"
    | "PAID"
    | "CLOSED"
    | "OVERDUE"
    | "CANCELLED"
    | "REFUNDED";
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
  subtotal: number;
  discountAmount: number;
  discountType?: string;
  discountValue?: number;
  taxPercent?: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  baseSubtotal: number;
  baseDiscountAmount: number;
  baseTaxAmount: number;
  baseTotal: number;
  baseAmountPaid: number;
  baseBalance: number;
  notes?: string;
  dueDate?: string;
  issuedAt?: string;
  paidAt?: string;
  activatedAt?: string;
  closedAt?: string;
  initialPaymentAmount?: number;   // deposit amount as patient agreed (in initialPaymentCurrency)
  initialPaymentCurrency?: string; // currency the patient agreed to pay the deposit in
  paymentStatus?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  paymentTerms?: string;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  createdAt: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  visit?: { id: string; visitCode: string };
  items: InvoiceItem[];
  payments: Payment[];
  receipts: ReceiptRecord[];
}

export interface LedgerSummary {
  pendingCount: number;
  pendingTotal: number;
  invoicedTotal: number;
  byCurrency: Record<string, any>;
}

export interface ServiceListResponse {
  data: BillingService[];
}

export interface LedgerListResponse {
  data: LedgerEntry[];
  summary: LedgerSummary;
}

export interface InvoiceListResponse {
  data: Invoice[];
}

export interface ReceiptData {
  clinic?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logo?: string | null;
  };
  invoice: Invoice;
  patient?: {
    firstName?: string;
    lastName?: string;
    patientCode?: string;
    phone?: string;
  };
  dentist?: {
    firstName?: string;
    lastName?: string;
    specialization?: string;
  };
  payments?: Payment[];
  receipts?: ReceiptRecord[];
}