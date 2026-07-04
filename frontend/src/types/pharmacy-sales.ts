// src/types/pharmacy.ts

export enum PaymentMethod {
  CASH = "CASH" ,
  VISA_CARD = "VISA_CARD",
  MASTERCARD = "MASTERCARD",
  MTN_MOBILE_MONEY = "MTN_MOBILE_MONEY",
  AIRTEL_MONEY = "AIRTEL_MONEY",
  INSURANCE = "INSURANCE",
  BANK_TRANSFER = "BANK_TRANSFER",
  CHEQUE = "CHEQUE",
  CREDIT_NOTE = "CREDIT_NOTE",         // ← new (was only in PaymentMethod)
}

export enum PharmacySaleStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  INVOICED = 'INVOICED',
}

export enum SaleType {
  RETAIL = "RETAIL",
  WHOLESALE = "WHOLESALE",
}

export interface DrugCategory {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface Drug {
  id: string;
  name: string;
  category: DrugCategory | null;
}

export interface SaleItem {
  id: string;
  drugId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  drug: Drug;
}

export interface SalePayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

export interface PatientSummary {
  firstName: string;
  lastName: string;
  patientCode: string;
}

export interface LocationSummary {
  id: string;
  name: string;
}

export interface PharmacySale {
  id: string;
  saleCode: string;
  patientId: string | null;
  prescriptionId: string | null;
  saleType: SaleType;
  status: PharmacySaleStatus;
  subtotal: number;
  total: number;
  amountPaid: number;
  balance: number;
  notes: string | null;
  servedBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: SaleItem[];
  payments: SalePayment[];
  patient: PatientSummary | null;
  location: LocationSummary;
}

export interface SalesListResponse {
  data: PharmacySale[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SalesStats {
  totalSales: number;
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  byPaymentMethod: Record<PaymentMethod, number>;
}

export interface SalesFilters {
  locationId?: string;
  patientId?: string;
  saleType?: SaleType;
  status?: PharmacySaleStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

