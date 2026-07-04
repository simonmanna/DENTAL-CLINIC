// src/pharmacy/hooks/usePharmacy.ts
import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api/client";
// import { api } from "../lib/api"; // Your axios instance
import { useQuery } from "@tanstack/react-query";
import type {
  Drug,
  PharmacySale,
  Prescription,
  PharmacyDashboard,
  SalesStats,
} from "../lib/api/pharmacy";
import { toast } from "sonner";
import { pharmacyApi } from "@/lib/api/inventory";

// ─── Generic pagination state ──────────────────────────────────────────────────

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ─── useDrugs ──────────────────────────────────────────────────────────────────

export function useDrugs(initialParams?: {
  search?: string;
  category?: string;
  isActive?: boolean;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsRef = useRef(initialParams);

  const load = useCallback(async (params?: typeof initialParams) => {
    const p = params ?? paramsRef.current;
    setLoading(true);
    setError(null);
    try {
      // const res = await api.get("/drugs", { params: p });
      const res = await api.get("/pharmacy/drugs", { params: p });
      setDrugs(res.data.data);
      setPagination(res.data.meta);
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ?? e.message ?? "Failed to load drugs";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(initialParams);
  }, []);

  return { drugs, pagination, loading, error, reload: load };
}

// ─── useDrugSearch (for autocomplete) ──────────────────────────────────────────

export function useDrugSearch(searchQuery: string) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    const fetchDrugs = async () => {
      if (!debouncedQuery.trim()) {
        setDrugs([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await api.get(
          `/pharmacy/drugs?search=${encodeURIComponent(debouncedQuery)}&limit=10`,
        );
        setDrugs(res.data.data || res.data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch drugs");
        setDrugs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDrugs();
  }, [debouncedQuery]);

  return { drugs, loading, error };
}

// ─── useCategories ─────────────────────────────────────────────────────────────

// ─── useCategories ─────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<
    Array<{ category: string; count: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        // const res = await api.get("drugs/categories");
        const res = await api.get("/pharmacy/drugs/categories");
        setCategories(res.data.data || res.data || []);
        console.log(res.data);
      } catch (e) {
        console.warn("Categories endpoint not available yet");
        setCategories([]); // Return empty array on 404/error
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return categories;
}

// export function useCategories() {
//   // In usePharmacy.ts - useCategories hook
//   const { data: categories } = useQuery({
//     queryKey: ["drugCategories"],
//     queryFn: async () => {
//       try {
//         const res = await drugApi.getCategories(); // or whatever the call is
//         return res.data;
//       } catch (e) {
//         console.warn("Categories endpoint not available yet");
//         return []; // Return empty array on 404
//       }
//     },
//     initialData: [], // Start with empty array
//   });

//   return categories;
// }

// ─── useSales ──────────────────────────────────────────────────────────────────

export function useSales(initialParams?: {
  locationId?: string;
  patientId?: string;
  saleType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  const [sales, setSales] = useState<PharmacySale[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (params?: typeof initialParams) => {
    setLoading(true);
    try {
      const res = await api.get("/pharmacy/sales", {
        params: params ?? initialParams,
      });
      setSales(res.data.data);
      setPagination(res.data.meta);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  return { sales, pagination, loading, reload: load };
}

// ─── usePrescriptions ──────────────────────────────────────────────────────────

export function usePrescriptions(initialParams?: {
  patientId?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (params?: typeof initialParams) => {
    setLoading(true);
    try {
      // const res = await api.get("/prescriptions", {
      const res = await api.get("/pharmacy/prescriptions", {
        params: params ?? initialParams,
      });
      setPrescriptions(res.data.data);
      setPagination(res.data.meta);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Failed to load prescriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  return { prescriptions, pagination, loading, reload: load };
}

// ─── usePrescriptionSearch (for autocomplete) ──────────────────────────────────

export function usePrescriptionSearch(searchQuery: string) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    const fetchPrescriptions = async () => {
      if (!debouncedQuery.trim()) {
        setPrescriptions([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await api.get(
          `/prescriptions?search=${encodeURIComponent(debouncedQuery)}&status=ACTIVE&limit=10`,
        );
        setPrescriptions(res.data.data || res.data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch prescriptions");
        setPrescriptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPrescriptions();
  }, [debouncedQuery]);

  return { prescriptions, loading, error };
}

// ─── usePharmacyDashboard ──────────────────────────────────────────────────────

export function usePharmacyDashboard() {
  const [dashboard, setDashboard] = useState<PharmacyDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/pharmacy/dashboard");
      setDashboard(res.data);
    } catch (e) {
      // silently fail for dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []);

  return { dashboard, loading, reload: load };
}

// ─── useSalesStats ─────────────────────────────────────────────────────────────

export function useSalesStats(params?: {
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/pharmacy/sales/stats", { params })
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params?.locationId, params?.dateFrom, params?.dateTo]);

  return { stats, loading };
}

// ─── useCreateSale ─────────────────────────────────────────────────────────────

export interface CreatePharmacySaleDto {
  patientId?: string;
  prescriptionId?: string;
  saleType: "OTC" | "PRESCRIPTION" | "WALK_IN";
  notes?: string;
  servedBy?: string;
  items: Array<{
    drugId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
  payments?: Array<{
    amount: number;
    method: string;
    reference?: string;
  }>;
}

export function useCreateSale() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createSale = useCallback(async (dto: CreatePharmacySaleDto) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // No locationId needed — backend resolves from PHARMACY_LOCATION setting
      const result = await pharmacyApi.createSale(dto);
      setSuccess("Sale completed successfully");
      return result;
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err.message || "Failed to create sale",
      );
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return { createSale, loading, error, success, reset };
}
