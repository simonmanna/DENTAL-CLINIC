import axios from 'axios';
import type {
  Drug,
  DrugFormValues,
  DrugQueryParams,
  PaginatedDrugs,
  DrugStats,
  DrugCategory,
} from '../../types/drug.types';
import { api } from './client';

// Adjust baseURL to match your NestJS app
// const api = axios.create({
//   baseURL: import.meta.env?.VITE_API_URL || "http://localhost:3001",
//   headers: { 'Content-Type': 'application/json' },
// });

// // Attach JWT automatically if present
// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem('accessToken');
//   if (token) config.headers.Authorization = `Bearer ${token}`;
//   return config;
// });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildParams(query: DrugQueryParams): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  if (query.page !== undefined)                params.page = query.page;
  if (query.limit !== undefined)               params.limit = query.limit;
  if (query.search)                            params.search = query.search;
  if (query.categoryId)                        params.categoryId = query.categoryId;
  if (query.uom)                               params.uom = query.uom;
  if (query.isActive !== undefined)            params.isActive = query.isActive;
  if (query.requiresPrescription !== undefined) params.requiresPrescription = query.requiresPrescription;
  if (query.sortBy)                            params.sortBy = query.sortBy;
  if (query.sortOrder)                         params.sortOrder = query.sortOrder;
  return params;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const drugsApi = {
  getAll: async (query: DrugQueryParams = {}): Promise<PaginatedDrugs> => {
    const { data } = await api.get<PaginatedDrugs>('/drugs', { params: buildParams(query) });
    return data;
  },

  getOne: async (id: string): Promise<Drug> => {
    const { data } = await api.get<Drug>(`/drugs/${id}`);
    return data;
  },

  create: async (payload: Partial<DrugFormValues>): Promise<Drug> => {
    const { data } = await api.post<Drug>('/drugs', payload);
    return data;
  },

  update: async (id: string, payload: Partial<DrugFormValues>): Promise<Drug> => {
    const { data } = await api.patch<Drug>(`/drugs/${id}`, payload);
    return data;
  },

  toggleActive: async (id: string): Promise<Drug> => {
    const { data } = await api.patch<Drug>(`/drugs/${id}/toggle`);
    return data;
  },

  delete: async (id: string): Promise<{ deleted: boolean; id: string } | Drug> => {
    const { data } = await api.delete(`/drugs/${id}`);
    return data;
  },

  getCategories: async (): Promise<DrugCategory[]> => {
    const { data } = await api.get<DrugCategory[]>('/drugs/categories');
    return data;
  },

  getStats: async (): Promise<DrugStats> => {
    const { data } = await api.get<DrugStats>('/drugs/stats');
    return data;
  },
};
