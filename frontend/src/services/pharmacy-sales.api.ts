import { api } from '@/lib/api/client';
import { SalesFilters, SalesListResponse, SalesStats, PharmacySale } from '@/types/pharmacy-sales';

export const pharmacySalesApi = {
  getSales: (filters: SalesFilters) =>
    api.get<SalesListResponse>('/pharmacy/sales', {
      params: Object.fromEntries(
        Object.entries(filters).filter(([_, v]) => v !== undefined && v !== '')
      ),
    }).then(res => res.data),

  getStats: (locationId?: string, dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (locationId) params.append('locationId', locationId);
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    const query = params.toString() ? `?${params}` : '';
    return api.get<SalesStats>(`/pharmacy/sales/stats${query}`).then(res => res.data);
  },

  getSale: (id: string) =>
    api.get<PharmacySale>(`/pharmacy/sales/${id}`).then(res => res.data),

  addPayment: (saleId: string, data: { amount: number; method: string; reference?: string }) =>
    api.post(`/pharmacy/sales/${saleId}/payments`, data).then(res => res.data),

  refundSale: (saleId: string, reason?: string) =>
    api.post(`/pharmacy/sales/${saleId}/refund`, { reason }).then(res => res.data),
};