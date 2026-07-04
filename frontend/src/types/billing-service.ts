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

// src/lib/api/billing-services.ts
import axios from 'axios';

// const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";


export const billingServiceApi = {
  getAll: async (params: {
    skip?: number;
    take?: number;
  } & BillingServiceFilters) => {
    const { data } = await axios.get(`${API_URL}/billing-services`, { params });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await axios.get(`${API_URL}/billing-services/${id}`);
    return data;
  },

  create: async (payload: Omit<BillingService, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data } = await axios.post(`${API_URL}/billing-services`, payload);
    return data;
  },

  update: async (id: string, payload: Partial<BillingService>) => {
    const { data } = await axios.put(`${API_URL}/billing-services/${id}`, payload);
    return data;
  },

  delete: async (id: string) => {
    await axios.delete(`${API_URL}/billing-services/${id}`);
  },

  toggleFavorite: async (id: string) => {
    const { data } = await axios.post(`${API_URL}/billing-services/${id}/toggle-favorite`);
    return data;
  },

  duplicate: async (id: string) => {
    const { data } = await axios.post(`${API_URL}/billing-services/${id}/duplicate`);
    return data;
  },
};