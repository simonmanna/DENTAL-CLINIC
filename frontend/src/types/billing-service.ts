// src/types/billing-service.ts
export type LedgerEntryType = 
  | 'PROCEDURE' | 'DRUG' | 'CONSULTATION' | 'SERVICE' 
  | 'LAB' | 'IMAGING' | 'OTHER' | 'TREATMENT_PROCEDURE' | 'TREATMENT_PROCEDURE_SESSION';

export type BillingServiceCategory = 
  | 'CONSULTATION' | 'PROCEDURE' | 'DIAGNOSTIC' | 'MEDICATION' 
  | 'THERAPY' | 'SURGICAL' | 'PREVENTIVE' | 'ADMINISTRATIVE' | 'OTHER';

export interface BillingService {
  id: string;
  serviceCode: string;
  name: string;
  description: string | null;
  type: LedgerEntryType;
  category: BillingServiceCategory;
  price: number;
  currency: string;
  exchangeRate: number | null;
  defaultTaxAmount: number;
  defaultTaxLabel: string | null;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  isActive: boolean;
  isFavorite: boolean;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingServiceFilters {
  search?: string;
  category?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

