import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Location, LocationTreeNode } from '../types/location';
import { api } from '@/lib/api/client';


export const useLocations = (params?: { 
  type?: string; 
  isActive?: boolean; 
  search?: string 
}) => {
  return useQuery({
    queryKey: ['locations', params],
    queryFn: async () => {
      const { data } = await api.get<Location[]>('/locations', { params });
      return data;
    },
  });
};

export const useLocationTree = () => {
  return useQuery({
    queryKey: ['locations', 'tree'],
    queryFn: async () => {
      const { data } = await api.get<LocationTreeNode[]>('/locations/tree');
      return data;
    },
  });
};

export const useCreateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (location: Partial<Location>) => {
      const { data } = await api.post<Location>('/locations', location);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

export const useUpdateLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Location> & { id: string }) => {
      const response = await api.patch<Location>(`/locations/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

export const useDeleteLocation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};


async function fetchLocations(): Promise<Location[]> {
  const response = await fetch('/api/locations');
  if (!response.ok) throw new Error('Failed to fetch locations');
  return response.json();
}

