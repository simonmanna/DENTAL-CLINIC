// src/lib/api/billing-services.ts
import axios from 'axios';
import { BillingService, BillingServiceFilters } from '@/types/billing-service';

// const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
// const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

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