import { api } from '@/lib/api/client';
import { BillingService, BillingServiceFilters } from '@/types/billing-service';

export const billingServiceApi = {
  getAll: async (params: {
    skip?: number;
    take?: number;
  } & BillingServiceFilters) => {
    const { data } = await api.get('/billing-services', { params });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await api.get(`/billing-services/${id}`);
    return data;
  },

  create: async (payload: Omit<BillingService, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { data } = await api.post('/billing-services', payload);
    return data;
  },

  update: async (id: string, payload: Partial<BillingService>) => {
    const { data } = await api.put(`/billing-services/${id}`, payload);
    return data;
  },

  delete: async (id: string) => {
    await api.delete(`/billing-services/${id}`);
  },

  toggleFavorite: async (id: string) => {
    const { data } = await api.post(`/billing-services/${id}/toggle-favorite`);
    return data;
  },

  duplicate: async (id: string) => {
    const { data } = await api.post(`/billing-services/${id}/duplicate`);
    return data;
  },
};