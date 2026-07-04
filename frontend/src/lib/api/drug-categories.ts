// @/lib/api/drug-categories.ts
import { api } from "./client";

export interface DrugCategory {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // children?: DrugCategory[];
  parent?: DrugCategory;
  _count?: { drugs: number };
}

export interface CreateDrugCategoryInput {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateDrugCategoryInput = Partial<CreateDrugCategoryInput>;

// ✅ Define the query params type properly
export interface DrugCategoryQueryParams {
  search?: string;
  isActive?: boolean;
  parentId?: string | null;
  // includeChildren?: boolean;
  includeItemCount?: boolean;
}

export const drugCategoriesApi = {
  // CRUD
  create: (data: CreateDrugCategoryInput) =>
    api.post<DrugCategory>("/drug-categories", data).then((res) => res.data),

    findAll: (params?: DrugCategoryQueryParams) =>
  api
    .get<{ categories: DrugCategory[] }>("/drug-categories", { params })
    .then((res) => res.data.categories),
      
  findOne: (id: string) =>
    api.get<DrugCategory>(`/drug-categories/${id}`).then((res) => res.data),

  update: (id: string, data: UpdateDrugCategoryInput) =>
    api
      .patch<DrugCategory>(`/drug-categories/${id}`, data)
      .then((res) => res.data),

  remove: (id: string) =>
    api
      .delete<{ success: boolean; message: string }>(`/drug-categories/${id}`)
      .then((res) => res.data),

  // Bonus endpoints
  getHierarchy: (activeOnly = true) =>
    api
      .get<
        DrugCategory[]
      >("/drug-categories/hierarchy", { params: { activeOnly } })
      .then((res) => res.data),

  // If your backend has a /tree endpoint (matching your NestJS controller)
  getTree: (parentId?: string | null) =>
    api
      .get<DrugCategory[]>("/drug-categories/tree", {
        params: { parentId: parentId === null ? "null" : parentId },
      })
      .then((res) => res.data),
};
