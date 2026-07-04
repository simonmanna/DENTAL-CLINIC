import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  inventoryCategoryApi,
  CategoryListParams,
} from "@/lib/api/inventory-category";
import { InventoryCategory } from "@/types/inventory";

export const CATEGORY_QUERY_KEY = "inventory-categories";

export function useCategories(params?: CategoryListParams) {
  return useQuery({
    queryKey: [CATEGORY_QUERY_KEY, params],
    queryFn: () =>
      inventoryCategoryApi.list(params).then((res: { data: any }) => {
        return Array.isArray(res.data) ? res.data : res.data?.data || [];
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCategoryTree(parentId?: string | null) {
  return useQuery({
    queryKey: [CATEGORY_QUERY_KEY, "tree", parentId],
    queryFn: () =>
      inventoryCategoryApi.getTree(parentId).then((res) => res.data),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inventoryCategoryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORY_QUERY_KEY] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      inventoryCategoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORY_QUERY_KEY] });
    },
  });
}

export function useDeactivateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inventoryCategoryApi.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORY_QUERY_KEY] });
    },
  });
}

export function useRestoreCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inventoryCategoryApi.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATEGORY_QUERY_KEY] });
    },
  });
}

// hooks/use-categories.ts (add this)
export function useParentCategories(currentCategoryId?: string | null) {
  return useQuery({
    queryKey: [CATEGORY_QUERY_KEY, "parents", currentCategoryId],
    queryFn: async () => {
      // Fetch all active categories
      const { data } = await inventoryCategoryApi.list({
        isActive: true,
        includeChildren: false,
      });

      // If editing, filter out self + descendants (prevent circular refs)
      if (currentCategoryId) {
        const current = data.find((c) => c.id === currentCategoryId);
        const descendantIds = current ? getAllDescendantIds(current, data) : [];

        return data.filter(
          (c) => c.id !== currentCategoryId && !descendantIds.includes(c.id),
        );
      }

      return data;
    },
    enabled: true, // Always fetch for dropdown
    staleTime: 10 * 60 * 1000, // 10 min cache
  });
}

// Helper: Get all descendant IDs recursively
function getAllDescendantIds(
  category: InventoryCategory,
  all: InventoryCategory[],
): string[] {
  const children = all.filter((c) => c.parentId === category.id);
  return [
    ...children.map((c) => c.id),
    ...children.flatMap((child) => getAllDescendantIds(child, all)),
  ];
}
