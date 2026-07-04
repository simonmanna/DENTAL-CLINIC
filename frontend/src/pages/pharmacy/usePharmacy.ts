import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api/client';

import type {
  Drug,
  DrugCategory,
  DrugCategoryCount,     // Legacy for backward compat
  DrugStats,
  PaginationMeta,
  DrugStockTransaction,
  DrugLocationStock,
} from './drugs.types';

// ─── Query params type ────────────────────────────────────────────────────────

interface DrugQueryParams {
  search?: string;
  categoryId?: string;     // Changed from category
  lowStock?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
  locationId?: string;        // New: filter by location stock
}

// ─── useDrugs ─────────────────────────────────────────────────────────────────

export function useDrugs(defaultParams?: DrugQueryParams) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState<DrugQueryParams>(defaultParams ?? {});

  const load = useCallback(async (overrides?: DrugQueryParams) => {
    setLoading(true);
    const merged = { ...params, ...overrides };
    setParams(merged);

    try {
      const res = await api.get('/pharmacy/drugs', {
        params: {
          ...merged,
          // Clean up undefined values
          search: merged.search || undefined,
          categoryId: merged.categoryId || undefined,
          lowStock: merged.lowStock || undefined,
          isActive: merged.isActive !== undefined ? merged.isActive : undefined,
          locationId: merged.locationId || undefined,
        },
      });

      const responseData: Drug[] = res.data?.data ?? res.data ?? [];
      const responseMeta: PaginationMeta = res.data?.meta ?? {
        page: 1,
        limit: 50,
        total: responseData.length,
        totalPages: 1,
      };

      setDrugs(responseData);
      setPagination(responseMeta);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load drugs');
      setDrugs([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load(defaultParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { drugs, pagination, loading, reload: load };
}

// ─── useDrugCategories ────────────────────────────────────────────────────────
// NEW: Full category management

export function useDrugCategories() {
  const [categories, setCategories] = useState<DrugCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/pharmacy/drug-categories');
      setCategories(res.data?.data ?? []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to load categories');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createCategory = useCallback(async (data: Partial<DrugCategory>) => {
    const res = await api.post('/pharmacy/drug-categories', data);
    await load(); // Refresh
    return res.data?.data;
  }, [load]);

  const updateCategory = useCallback(async (id: string, data: Partial<DrugCategory>) => {
    const res = await api.put(`/pharmacy/drug-categories/${id}`, data);
    await load();
    return res.data?.data;
  }, [load]);

  const deleteCategory = useCallback(async (id: string) => {
    await api.delete(`/pharmacy/drug-categories/${id}`);
    await load();
  }, [load]);

  return {
    categories,
    loading,
    reload: load,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}

// ─── useCategories (Legacy) ─────────────────────────────────────────────────
// Kept for backward compatibility - returns flat list with counts

export function useCategories() {
  const [categories, setCategories] = useState<DrugCategoryCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/pharmacy/drugs/categories')  // Legacy endpoint
      .then((res) => setCategories(res.data?.data ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}

// ─── useDrugStats ─────────────────────────────────────────────────────────────

export function useDrugStats() {
  const [stats, setStats] = useState<DrugStats>({
    totalDrugs: 0,
    outOfStock: 0,
    lowStock: 0,
    stockValue: 0,
    rxOnly: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/pharmacy/drugs/stats')
      .then((res) => setStats(res.data?.data ?? res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, reload: load };
}

// ─── useDrugLocationStock ─────────────────────────────────────────────────────
// NEW: Per-location stock management

export function useDrugLocationStock(drugId: string) {
  const [stocks, setStocks] = useState<DrugLocationStock[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!drugId) return;
    setLoading(true);
    try {
      const res = await api.get(`/pharmacy/drugs/${drugId}/locations`);
      setStocks(res.data?.data ?? []);
    } catch {
      toast.error('Failed to load location stocks');
    } finally {
      setLoading(false);
    }
  }, [drugId]);

  useEffect(() => {
    if (drugId) load();
  }, [drugId, load]);

  const transferStock = useCallback(async (
    fromLocationId: string,
    toLocationId: string,
    quantity: number,
    batchNumber?: string
  ) => {
    await api.post(`/pharmacy/drugs/${drugId}/transfer`, {
      fromLocationId,
      toLocationId,
      quantity,
      batchNumber,
    });
    await load();
  }, [drugId, load]);

  return { stocks, loading, reload: load, transferStock };
}

// ─── useStockTransactions ─────────────────────────────────────────────────────

export function useStockTransactions(drugId: string) {
  const [transactions, setTransactions] = useState<DrugStockTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      if (!drugId) return;
      setLoading(true);
      try {
        const res = await api.get(`/pharmacy/drugs/${drugId}/transactions`, {
          params: { page, limit: 20 },
        });
        setTransactions(res.data?.data ?? []);
        setPagination(res.data?.meta ?? { page, limit: 20, total: 0, totalPages: 0 });
      } catch {
        toast.error('Failed to load transactions');
      } finally {
        setLoading(false);
      }
    },
    [drugId],
  );

  useEffect(() => {
    if (drugId) load();
  }, [drugId, load]);

  return { transactions, pagination, loading, reload: load };
}

// ─── useLocations ─────────────────────────────────────────────────────────────
// NEW: Fetch available locations for stock operations

export function useLocations() {
  const [locations, setLocations] = useState<Array<{
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/locations', { params: { isActive: true } })
      .then((res) => setLocations(res.data?.data ?? []))
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, []);

  return { locations, loading };
}