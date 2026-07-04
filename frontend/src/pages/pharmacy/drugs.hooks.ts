import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
// import { api } from '@/lib/api';
import api from '@/lib/api/client';

import type {
  Drug,
  DrugCategory,
  DrugStats,
  PaginationMeta,
  DrugStockTransaction,
} from './drugs.types';

// ─── Query params type ────────────────────────────────────────────────────────

interface DrugQueryParams {
  search?: string;
  category?: string;
  lowStock?: boolean;
  // isActive?: boolean;
  page?: number;
  limit?: number;
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
      const res = await api.get('/drugs', {
        params: {
          ...merged,
          search: merged.search || undefined,
          category: merged.category || undefined,
          lowStock: merged.lowStock || undefined,
          // isActive: merged.isActive !== undefined ? merged.isActive : undefined,
        },
      });

      const payload = res.data;
      const rawData = Array.isArray(payload?.data) ? payload.data : [];
      const meta = payload?.meta ?? {
        page: merged.page ?? 1,
        limit: merged.limit ?? 50,
        total: rawData.length,
        totalPages: 1,
      };

      // ─── MAP backend shape → frontend Drug type ─────────────────────────
      const mapped: Drug[] = rawData.map((d: any) => ({
        id: d.id,
        name: d.name,
        genericName: d.genericName,
        category: d.category?.name ?? d.category ?? '',
        form: d.form,
        strength: d.strength,
        unit: d.unit,
        unitPrice: Number(d.unitPrice) || 0,
        sellPrice: Number(d.sellPrice) || 0,
        // isActive: d.isActive,
        requiresPrescription: d.requiresPrescription,
        stockQuantity: d.inventoryItem?.quantity ?? 0,
        minStock: d.inventoryItem?.minQuantity ?? 0,
      }));

      setDrugs(mapped);
      setPagination(meta);
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
 
// export function useDrugs(defaultParams?: DrugQueryParams) {
//   const [drugs, setDrugs] = useState<Drug[]>([]);
//   const [pagination, setPagination] = useState<PaginationMeta>({
//     page: 1,
//     limit: 50,
//     total: 0,
//     totalPages: 0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [params, setParams] = useState<DrugQueryParams>(defaultParams ?? {});

//   const load = useCallback(async (overrides?: DrugQueryParams) => {
//   setLoading(true);
//   const merged = { ...params, ...overrides };
//   setParams(merged);

//   try {
//     const res = await api.get('/drugs', {
//       params: {
//         search: merged.search || undefined,
//         categoryId: merged.category || undefined, // ← adjust param name if needed
//         lowStock: merged.lowStock !== undefined ? String(merged.lowStock) : undefined,
//         isActive: merged.isActive !== undefined ? String(merged.isActive) : undefined,
//         page: merged.page ?? 1,
//         limit: merged.limit ?? 50,
//       },
//     });

//       const payload = res.data;
//       const rawData = Array.isArray(payload?.data) ? payload.data : [];
//       const meta = payload?.meta ?? {
//         page: merged.page ?? 1,
//         limit: merged.limit ?? 50,
//         total: rawData.length,
//         totalPages: 1,
//       };

//       // ─── MAP backend shape → frontend Drug type ─────────────────────────
//       const mapped: Drug[] = rawData.map((d: any) => ({
//         id: d.id,
//         name: d.name,
//         genericName: d.genericName,
//         category: d.category?.name ?? d.category ?? '',
//         form: d.form,
//         strength: d.strength,
//         unit: d.unit,
//         unitPrice: Number(d.unitPrice) || 0,
//         sellPrice: Number(d.sellPrice) || 0,
//         isActive: d.isActive,
//         requiresPrescription: d.requiresPrescription,
//         stockQuantity: d.inventoryItem?.quantity ?? 0,
//         minStock: d.inventoryItem?.minQuantity ?? 0,
//       }));

//       setDrugs(mapped);
//       setPagination(meta);
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message ?? 'Failed to load drugs');
//       setDrugs([]);
//     } finally {
//       setLoading(false);
//     }
//   }, [params]);

//   useEffect(() => {
//     load(defaultParams);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return { drugs, pagination, loading, reload: load };
// }

// export function useDrugs(defaultParams?: DrugQueryParams) {
//   const [drugs, setDrugs] = useState<Drug[]>([]);
//   const [pagination, setPagination] = useState<PaginationMeta>({
//     page: 1,
//     limit: 50,
//     total: 0,
//     totalPages: 0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [params, setParams] = useState<DrugQueryParams>(defaultParams ?? {});

//   const load = useCallback(async (overrides?: DrugQueryParams) => {
//     setLoading(true);
//     const merged = { ...params, ...overrides };
//     setParams(merged);

//     try {
//       const res = await api.get('/drugs', {
//         params: {
//           ...merged,
//           search: merged.search || undefined,
//           categoryId: merged.category || undefined, // backend expects categoryId (UUID), not category name
//           lowStock: merged.lowStock || undefined,
//           isActive: merged.isActive !== undefined ? merged.isActive : undefined,
//         },
//       });

//       // Handle wrapped response: { data: [...], meta: {...} }
//       const payload = res.data;
//       const rawData = Array.isArray(payload?.data) ? payload.data : [];
//       const meta = payload?.meta ?? {
//         page: merged.page ?? 1,
//         limit: merged.limit ?? 50,
//         total: rawData.length,
//         totalPages: 1,
//       };

//       // ─── MAP backend fields → frontend Drug type ───────────────────────
//       const mappedDrugs: Drug[] = rawData.map((d: any) => ({
//         id: d.id,
//         name: d.name,
//         genericName: d.genericName,
//         // category comes back as { id, name, color, icon } — we need the string name
//         category: typeof d.category === 'string' ? d.category : d.category?.name ?? '',
//         form: d.form,
//         strength: d.strength,
//         unit: d.unit,
//         // Prices come back as strings — convert to numbers
//         unitPrice: Number(d.unitPrice) || 0,
//         sellPrice: Number(d.sellPrice) || 0,
//         isActive: d.isActive,
//         requiresPrescription: d.requiresPrescription,
//         // Stock lives inside inventoryItem, not on the root
//         stockQuantity: d.inventoryItem?.quantity ?? 0,
//         minStock: d.inventoryItem?.minQuantity ?? 0,
//         // Keep the full nested objects if any dialog/detail view needs them
//         inventoryItem: d.inventoryItem,
//         categoryObj: typeof d.category === 'object' ? d.category : undefined,
//       }));

//       setDrugs(mappedDrugs);
//       setPagination(meta);
//     } catch (err: any) {
//       toast.error(err?.response?.data?.message ?? 'Failed to load drugs');
//       setDrugs([]);
//     } finally {
//       setLoading(false);
//     }
//   }, [params]);

//   useEffect(() => {
//     load(defaultParams);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return { drugs, pagination, loading, reload: load };
// }
// export function useDrugs(defaultParams?: DrugQueryParams) {
//   const [drugs, setDrugs] = useState<Drug[]>([]);
//   const [pagination, setPagination] = useState<PaginationMeta>({
//     page: 1,
//     limit: 50,
//     total: 0,
//     totalPages: 0,
//   });
//   const [loading, setLoading] = useState(true);
//   const [params, setParams] = useState<DrugQueryParams>(defaultParams ?? {});

// const load = useCallback(async (overrides?: DrugQueryParams) => {
//   setLoading(true);
//   const merged = { ...params, ...overrides };
//   setParams(merged);

//   try {
//     const res = await api.get('/drugs', {
//       params: {
//         ...merged,
//         search: merged.search || undefined,
//         category: merged.category || undefined,
//         lowStock: merged.lowStock || undefined,
//         isActive: merged.isActive !== undefined ? merged.isActive : undefined,
//       },
//     });

//     // ─── SAFE PARSING: Handle multiple backend response shapes ─────────────
//     const payload = res.data;

//     let responseData: Drug[] = [];
//     let responseMeta: PaginationMeta = {
//       page: merged.page ?? 1,
//       limit: merged.limit ?? 50,
//       total: 0,
//       totalPages: 0,
//     };

//     if (Array.isArray(payload)) {
//       // Shape: [ {...}, {...} ]  (plain array)
//       responseData = payload;
//       responseMeta.total = payload.length;
//       responseMeta.totalPages = 1;
//     } else if (payload && typeof payload === 'object') {
//       // Shape: { data: [...], meta: {...} }  (wrapped)
//       // OR:    { items: [...], pagination: {...} } (alternative names)
//       responseData = Array.isArray(payload.data)
//         ? payload.data
//         : Array.isArray(payload.items)
//         ? payload.items
//         : [];

//       responseMeta = payload.meta ?? payload.pagination ?? {
//         page: merged.page ?? 1,
//         limit: merged.limit ?? 50,
//         total: responseData.length,
//         totalPages: 1,
//       };
//     }

//     setDrugs(responseData);
//     setPagination(responseMeta);
//   } catch (err: any) {
//     toast.error(err?.response?.data?.message ?? 'Failed to load drugs');
//     setDrugs([]);
//     setPagination({
//       page: merged.page ?? 1,
//       limit: merged.limit ?? 50,
//       total: 0,
//       totalPages: 0,
//     });
//   } finally {
//     setLoading(false);
//   }
// }, [params]);

//   useEffect(() => {
//     load(defaultParams);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return { drugs, pagination, loading, reload: load };
// }

// ─── useCategories ────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<DrugCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/drugs/categories')
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
    rxOnly: 0, // ✅ Add the missing required property
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/drugs/stats')
      .then((res) => setStats(res.data?.data ?? res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, reload: load };
}

// export function useDrugStats() {
//   const [stats, setStats] = useState<DrugStats>({
//     totalDrugs: 0,
//     outOfStock: 0,
//     lowStock: 0,
//     stockValue: 0,
//   });
//   const [loading, setLoading] = useState(true);

//   const load = useCallback(() => {
//     setLoading(true);
//     api
//       .get('/drugs/stats')
//       .then((res) => setStats(res.data?.data ?? res.data))
//       .catch(() => {})
//       .finally(() => setLoading(false));
//   }, []);

//   useEffect(() => {
//     load();
//   }, [load]);

//   return { stats, loading, reload: load };
// }

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
        const res = await api.get(`/drugs/${drugId}/transactions`, {
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