import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import {
  Supplier,
  SuppliersResponse,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierQueryParams,
  SupplierStats,
} from '@/types/supplier';

const SUPPLIERS_KEY = 'suppliers';

export const useSuppliers = (params: SupplierQueryParams = {}) => {
  return useQuery<SuppliersResponse>({
    queryKey: [SUPPLIERS_KEY, params],
    queryFn: async () => {
      const { data } = await api.get('/suppliers', { params });
      return data;
    },
  });
};

export const useSupplier = (id: string) => {
  return useQuery<Supplier>({
    queryKey: [SUPPLIERS_KEY, id],
    queryFn: async () => {
      const { data } = await api.get(`/suppliers/${id}`);
      return data;
    },
    enabled: !!id,
  });
};

export const useSupplierStats = () => {
  return useQuery<SupplierStats>({
    queryKey: [SUPPLIERS_KEY, 'stats'],
    queryFn: async () => {
      const { data } = await api.get('/suppliers/stats');
      return data;
    },
  });
};

export const useCreateSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateSupplierInput) => {
      const { data } = await api.post('/suppliers', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_KEY] });
    },
  });
};

export const useUpdateSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateSupplierInput }) => {
      const { data } = await api.patch(`/suppliers/${id}`, input);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_KEY] });
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_KEY, variables.id] });
    },
  });
};

export const useDeleteSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_KEY] });
    },
  });
};

export const useRestoreSupplier = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/suppliers/${id}/restore`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SUPPLIERS_KEY] });
    },
  });
};