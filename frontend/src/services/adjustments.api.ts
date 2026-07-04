import api from "@/lib/api/client";
import type {
  StockAdjustment,
  AdjustmentStats,
  CreateAdjustmentPayload,
  StockItem,
} from "../types/stock-adjustment";

// ─── Filters ─────────────────────────────────────────────────────────────────
export interface AdjustmentFilters {
  locationId?: string;
  reason?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── List ─────────────────────────────────────────────────────────────────────
// src/services/adjustments.api.ts

export async function listAdjustments(filters: AdjustmentFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v));
  });
  
  const { data } = await api.get<{
    adjustments: StockAdjustment[];  // ✅ Expect "adjustments"
    meta: { 
      total: number; 
      page: number; 
      limit: number; 
      totalPages: number;
    };
  }>(`/adjustments?${params}`);
  
  // ✅ Return the adjustments array
  return {
    data: data.adjustments,  // Map to expected structure
    meta: data.meta,
  };
}
// export async function listAdjustments(filters: AdjustmentFilters = {}) {
//   const params = new URLSearchParams();
//   Object.entries(filters).forEach(([k, v]) => {
//     if (v !== undefined && v !== "") params.set(k, String(v));
//   });
  
//   const { data } = await api.get<{
//     // ✅ Updated response structure to match backend
//     data: StockAdjustment[];  // Array of adjustments
//     meta: { 
//       total: number; 
//       page: number; 
//       limit: number; 
//       totalPages: number;
//     };
//   }>(`/adjustments?${params}`);
  
//   return data;
// }
// export async function listAdjustments(filters: AdjustmentFilters = {}) {
//   const params = new URLSearchParams();
//   Object.entries(filters).forEach(([k, v]) => {
//     if (v !== undefined && v !== "") params.set(k, String(v));
//   });
//   const { data } = await api.get<{
//     data: StockAdjustment[];
//     meta: { total: number; page: number; limit: number; totalPages: number };
//   }>(`/adjustments?${params}`);
//   return data;
// }

// ─── Get One ──────────────────────────────────────────────────────────────────
export async function getAdjustment(id: string) {
  const { data } = await api.get<StockAdjustment>(
    `/adjustments/${id}`,
  );
  return data;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getAdjustmentStats() {
  const { data } = await api.get<AdjustmentStats>(
    `/adjustments/stats`,
  );
  return data;
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createAdjustment(payload: CreateAdjustmentPayload) {
  const { data } = await api.post<StockAdjustment>(
    `/adjustments`,
    payload,
  );
  return data;
}

// ─── Approve ──────────────────────────────────────────────────────────────────
export async function approveAdjustment(id: string, notes?: string) {
  const { data } = await api.patch<StockAdjustment>(
    `/adjustments/${id}/approve`,
    {
      notes,
    },
  );
  return data;
}

// ─── Reject ───────────────────────────────────────────────────────────────────
export async function rejectAdjustment(id: string, notes?: string) {
  const { data } = await api.patch<StockAdjustment>(
    `/adjustments/${id}/reject`,
    {
      notes,
    },
  );
  return data;
}

// ─── Location stock ───────────────────────────────────────────────────────────
export async function getLocationStock(locationId: string) {
  const { data } = await api.get<{
    location: { id: string; name: string };
    inventoryItems: StockItem[];
    drugs: StockItem[];
  }>(`/adjustments/location-stock/${locationId}`);
  return data;
}

// ─── Search items ─────────────────────────────────────────────────────────────
export async function searchItems(query: string, locationId: string) {
  const { data } = await api.get<{
    inventoryItems: StockItem[];
    drugs: StockItem[];
  }>(`/adjustments/search-items`, {
    params: { query, locationId },
  });
  return data;
}

// ─── Locations ────────────────────────────────────────────────────────────────
export async function listLocations() {
  const { data } =
    await api.get<
      { id: string; name: string; type: string; isActive: boolean }[]
    >(`/locations`);
  return data;
}

export default api;
