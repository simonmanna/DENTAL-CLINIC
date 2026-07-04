// src/hooks/use-drug-categories.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  drugCategoriesApi,
  DrugCategory,
  CreateDrugCategoryInput,
  UpdateDrugCategoryInput,
} from "@/lib/api/drug-categories";
import { api } from "@/lib/api/client";
import { toast } from "sonner";

export const DRUG_CATEGORIES_KEY = ["drug-categories"];

interface DrugCategoryQueryParams {
  search?: string;
  isActive?: boolean;
  parentId?: string | null;
  includeChildren?: boolean;
}

export function useDrugCategories(params?: DrugCategoryQueryParams) {
  return useQuery({
    queryKey: ["drug-categories", params],
    queryFn: async () => {
      try {
        console.log("🔍 Fetching with params:", params);
        const response = await api.get<{ categories: DrugCategory[] }>(
          "/drug-categories",
          { params },
        );
        console.log("📡 Raw Axios response:", {
          status: response.status,
          data: response.data,
        });
        return response.data.categories;
      } catch (error: any) {
        console.error("❌ API Error:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        });
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useDrugCategory(id: string) {
  return useQuery({
    queryKey: [...DRUG_CATEGORIES_KEY, id],
    queryFn: () => drugCategoriesApi.findOne(id), // ✅ Fixed
    enabled: !!id,
  });
}

export function useUpdateDrugCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDrugCategoryInput }) =>
      drugCategoriesApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...DRUG_CATEGORIES_KEY, variables.id],
      });
      queryClient.invalidateQueries({ queryKey: DRUG_CATEGORIES_KEY });
      toast.success("Success", { description: "Category updated successfully" });
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.response?.data?.message || "Failed to update category",
      });
    },
  });
}

export function useDeleteDrugCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => drugCategoriesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DRUG_CATEGORIES_KEY });
      toast.success("Success", { description: "Category deactivated successfully" });
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.response?.data?.message || "Failed to delete category",
      });
    },
  });
}

export function useDrugCategoryHierarchy(activeOnly = true) {
  return useQuery({
    queryKey: [...DRUG_CATEGORIES_KEY, "hierarchy", { activeOnly }],
    queryFn: () => drugCategoriesApi.getHierarchy(activeOnly),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateDrugCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDrugCategoryInput) => drugCategoriesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drug-categories"] });
      toast.success("Success", { description: "Category created successfully" });
    },
    onError: (error: any) => {
      toast.error("Error", {
        description: error.response?.data?.message || "Failed to create category",
      });
    },
  });
}