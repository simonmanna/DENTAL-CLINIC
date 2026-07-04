import api from "@/lib/api/client";

export interface DirectStockInItem {
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  itemName?: string;
  unit?: string;
}

export interface DirectStockInPayload {
  locationId: string;
  items: DirectStockInItem[];
  notes?: string;
}

export interface DirectStockOutItem {
  inventoryItemId: string;
  quantity: number;
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
  selectedBatchNumber?: string;
  itemName?: string;
  unitCost?: number;
}

export interface DirectStockOutPayload {
  locationId: string;
  items: DirectStockOutItem[];
  notes?: string;
}

export interface DirectStockResult {
  code: string;
  type: 'IN' | 'OUT';
  locationId: string;
  totalValue: number;
  items: Array<{
    inventoryItemId: string;
    quantity: number;
    unitCost: number;
    batchId: string;
    itemName?: string;
  }>;
  notes?: string;
  timestamp: string;
}

export interface HistoryFilters {
  search?: string;
  locationId?: string;
  type?: 'IN' | 'OUT';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface LocationStockItem {
  id: string;
  name: string;
  itemCode: string;
  unit: string;
  unitCost: number;
  availableQty: number;
  batchTracking: boolean;
  category?: { id: string; name: string; color?: string };
}

export interface BatchInfo {
  id: string;
  batchNumber: string | null;
  quantity: number;
  expiryDate: string | null;
  receivedAt: string | null;
}

export interface BatchResponse {
  batchTracking: boolean;
  batches: BatchInfo[];
}

export interface HistoryTransaction {
  code: string;
  type: 'IN' | 'OUT';
  locationId: string;
  locationName?: string;
  totalValue: number;
  timestamp: string;
  notes?: string;
  items: Array<{
    itemId: string;
    itemName?: string;
    itemCode?: string;
    unit?: string;
    uom?: string;
    quantityChange: number;
    unitCost: number;
    totalValue: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
}

export interface HistoryResponse {
  data: HistoryTransaction[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface DirectStockStats {
  totalInValue: number;
  totalOutValue: number;
  todayIn: number;
  todayOut: number;
}

export async function directStockIn(payload: DirectStockInPayload) {
  const { data } = await api.post<DirectStockResult>('/direct-stock/in', payload);
  return data;
}

export async function directStockOut(payload: DirectStockOutPayload) {
  const { data } = await api.post<DirectStockResult>('/direct-stock/out', payload);
  return data;
}

export async function getHistory(filters: HistoryFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  });
  const { data } = await api.get<HistoryResponse>(`/direct-stock/history?${params}`);
  return data;
}

export async function getDirectStockStats(locationId?: string) {
  const params = locationId ? `?locationId=${locationId}` : '';
  const { data } = await api.get<DirectStockStats>(`/direct-stock/stats${params}`);
  return data;
}

export async function getDirectStockLocationStock(locationId: string) {
  const { data } = await api.get<LocationStockItem[]>(`/direct-stock/location-stock/${locationId}`);
  return data;
}

export async function getDirectStockBatches(itemId: string, locationId: string) {
  const { data } = await api.get<BatchResponse>(`/direct-stock/batches/${itemId}?locationId=${locationId}`);
  return data;
}
