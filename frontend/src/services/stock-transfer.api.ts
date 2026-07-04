import api from "@/lib/api/client";
import type {
  StockTransfer,
  CreateTransferPayload,
  BatchInfo,
} from "../types/stock-transfer";

export interface TransferFilters {
  fromLocationId?: string;
  toLocationId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listTransfers(filters: TransferFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v));
  });
  const { data } = await api.get<{
    data: StockTransfer[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }>(`/stock-transfers?${params}`);
  return data;
}

export async function getTransfer(id: string) {
  const { data } = await api.get<StockTransfer>(`/stock-transfers/${id}`);
  return data;
}

export async function createTransfer(payload: CreateTransferPayload) {
  const { data } = await api.post<StockTransfer>("/stock-transfers", payload);
  return data;
}

export async function updateTransfer(id: string, payload: Partial<CreateTransferPayload>) {
  const { data } = await api.put<StockTransfer>(`/stock-transfers/${id}`, payload);
  return data;
}

export async function completeTransfer(id: string, notes?: string) {
  const { data } = await api.patch<StockTransfer>(`/stock-transfers/${id}/complete`, { notes });
  return data;
}

export async function cancelTransfer(id: string, notes?: string) {
  const { data } = await api.patch<StockTransfer>(`/stock-transfers/${id}/cancel`, { notes });
  return data;
}

export async function getAvailableBatches(itemId: string, locationId: string) {
  const { data } = await api.get<{ batchTracking: boolean; batches: BatchInfo[] }>(
    `/stock-transfers/items/${itemId}/batches?locationId=${locationId}`
  );
  return data;
}

export async function listLocations() {
  const { data } = await api.get<{ id: string; name: string; type: string; isActive: boolean }[]>("/locations");
  return data.filter((l: any) => l.isActive);
}