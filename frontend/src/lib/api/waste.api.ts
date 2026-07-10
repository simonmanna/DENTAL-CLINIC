import type {
  WasteRecord,
  WasteStats,
  LocationStock,
  Location,
} from '../../types/waste.types';

import api from '@/lib/api/client';

// ─── Waste Records ─────────────────────────────────────────────────────────

export interface WasteQueryParams {
  locationId?: string;
  category?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface WasteListResponse {
  data: WasteRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// export const locationsApi = {
//   list: (): Promise<Location[]> =>
//     api.get('/api/locations', { params: { isActive: true } }).then((r) => r.data?.data || r.data),
// };

export const wasteApi = {
  // List all records
  list: (params: WasteQueryParams = {}): Promise<WasteListResponse> =>
    api.get('/waste', { params }).then((r) => r.data),

  // Create a new waste record
  create: (payload: {
    locationId: string;
    category: string;
    notes?: string;
    witnessName?: string;
    disposalMethod?: string;
    disposalDate?: string;
    items: Array<{
      itemType: string;
      inventoryItemId?: string;
      drugId?: string;
      itemName: string;
      unit: string;
      quantity: number;
      unitCost: number;
      batchNumber?: string;
      expiryDate?: string;
      reason?: string;
    }>;
  }): Promise<WasteRecord> => api.post('/waste', payload).then((r) => r.data),

  // Get single record
  get: (id: string): Promise<WasteRecord> =>
    api.get(`/waste/${id}`).then((r) => r.data),

  // Approve record
  approve: (id: string, notes?: string): Promise<WasteRecord> =>
    api.patch(`/waste/${id}/approve`, { notes }).then((r) => r.data),

  // Reject record
  reject: (id: string, reason: string): Promise<WasteRecord> =>
    api.patch(`/waste/${id}/reject`, { reason }).then((r) => r.data),

  // Get stats
  stats: (locationId?: string): Promise<WasteStats> =>
    api.get('/waste/stats', { params: { locationId } }).then((r) => r.data),

  // Get location stock
  locationStock: (locationId: string): Promise<LocationStock> =>
    api.get(`/waste/location-stock/${locationId}`).then((r) => r.data),

  getAvailableBatches: (itemId: string, locationId: string) =>
    api.get<{ batchTracking: boolean; batches: Array<{
      id: string;
      batchNumber: string | null;
      quantity: number;
      expiryDate?: string;
      receivedAt?: string;
    }> }>(`/waste/items/${itemId}/batches?locationId=${locationId}`)
      .then((r) => r.data),
};

// ─── Locations ─────────────────────────────────────────────────────────────

export const locationsApi = {
  list: (): Promise<Location[]> =>
    api.get('/locations', { params: { isActive: true } }).then((r) => r.data?.data || r.data),
};
