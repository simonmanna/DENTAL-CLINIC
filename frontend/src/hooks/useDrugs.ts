import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { drugsApi } from '../lib/api/drugs.api';
import type { DrugFormValues, DrugQueryParams } from '../types/drug.types';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const drugKeys = {
  all:        ['drugs'] as const,
  lists:      () => [...drugKeys.all, 'list'] as const,
  list:       (q: DrugQueryParams) => [...drugKeys.lists(), q] as const,
  details:    () => [...drugKeys.all, 'detail'] as const,
  detail:     (id: string) => [...drugKeys.details(), id] as const,
  categories: () => [...drugKeys.all, 'categories'] as const,
  stats:      () => [...drugKeys.all, 'stats'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useDrugs(query: DrugQueryParams = {}) {
  return useQuery({
    queryKey: drugKeys.list(query),
    queryFn: () => drugsApi.getAll(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useDrug(id: string) {
  return useQuery({
    queryKey: drugKeys.detail(id),
    queryFn: () => drugsApi.getOne(id),
    enabled: !!id,
  });
}

export function useDrugCategories() {
  return useQuery({
    queryKey: drugKeys.categories(),
    queryFn: drugsApi.getCategories,
    staleTime: 5 * 60_000, // 5 min — categories rarely change
  });
}

export function useDrugStats() {
  return useQuery({
    queryKey: drugKeys.stats(),
    queryFn: drugsApi.getStats,
    staleTime: 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateDrug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<DrugFormValues>) => drugsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: drugKeys.lists() });
      qc.invalidateQueries({ queryKey: drugKeys.stats() });
      toast.success('Drug created successfully');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to create drug';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });
}

export function useUpdateDrug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<DrugFormValues> }) =>
      drugsApi.update(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: drugKeys.lists() });
      qc.invalidateQueries({ queryKey: drugKeys.detail(id) });
      toast.success('Drug updated successfully');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to update drug';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });
}

export function useToggleDrugActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => drugsApi.toggleActive(id),
    onSuccess: (drug) => {
      qc.invalidateQueries({ queryKey: drugKeys.lists() });
      qc.invalidateQueries({ queryKey: drugKeys.stats() });
      toast.success(`Drug ${drug.isActive ? 'activated' : 'deactivated'}`);
    },
    onError: () => toast.error('Failed to toggle drug status'),
  });
}

export function useDeleteDrug() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => drugsApi.delete(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: drugKeys.lists() });
      qc.invalidateQueries({ queryKey: drugKeys.stats() });
      if ('deleted' in result && result.deleted) {
        toast.success('Drug permanently deleted');
      } else {
        toast.info('Drug deactivated (referenced by existing records)');
      }
    },
    onError: () => toast.error('Failed to delete drug'),
  });
}
