// src/services/pharmacy-sales.api.ts
import axios, { AxiosInstance } from 'axios';
import { SalesFilters, SalesListResponse, SalesStats, PharmacySale } from '@/types/pharmacy-sales';

// const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";


export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('📤 RAW REQUEST BODY:', 
    typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
  );
  return config;
});

// Response interceptor: handle 401 + token refresh
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    console.error('📥 ERROR RESPONSE:', err.response?.data);
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken: refresh,
        });
        localStorage.setItem('access_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const pharmacySalesApi = {
  /** Get paginated sales list with filters */
  getSales: (filters: SalesFilters) =>
    api.get<SalesListResponse>('/pharmacy/sales', {
      params: Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== undefined && v !== '')
      ),
    }).then(res => res.data),

  /** Get sales statistics */
  getStats: (locationId?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (locationId) params.append('locationId', locationId);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    const query = params.toString() ? `?${params}` : '';
    return api.get<SalesStats>(`/pharmacy/sales/stats${query}`).then(res => res.data);
  },

  /** Get single sale details */
  getSale: (id: string) =>
    api.get<PharmacySale>(`/pharmacy/sales/${id}`).then(res => res.data),

  /** Add payment to sale */
  addPayment: (saleId: string, data: { amount: number; method: string; reference?: string }) =>
    api.post(`/pharmacy/sales/${saleId}/payments`, data).then(res => res.data),

  /** Refund a sale */
  refundSale: (saleId: string, reason?: string) =>
    api.post(`/pharmacy/sales/${saleId}/refund`, { reason }).then(res => res.data),
};

export default api;