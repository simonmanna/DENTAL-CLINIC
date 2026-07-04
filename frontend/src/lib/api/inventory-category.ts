import axios from "axios";

const DEBUG = true; // Toggle this to false to disable logs

// const API_BASE = import.meta.env?.VITE_API_URL || "http://localhost:3001";

import api from '@/lib/api/client';


import { InventoryCategory } from '../../types/inventory';

export interface CreateCategoryInput {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryInput extends Partial<CreateCategoryInput> {}

export interface CategoryListParams {
  search?: string;
  isActive?: boolean;
  parentId?: string | null;
  includeChildren?: boolean;
  includeItemCount?: boolean;
}

export const inventoryCategoryApi = {
  // Create
  create: (data: CreateCategoryInput) =>
    api.post<InventoryCategory>('/inventory-categories', data),

  // List with filters
  list: (params?: CategoryListParams) =>
    api.get<InventoryCategory[]>('/inventory-categories', { params }),

  // Get hierarchical tree
  getTree: (parentId?: string | null) =>
    api.get<InventoryCategory[]>('/inventory-categories/tree', {
      params: { parentId: parentId === null ? 'null' : parentId },
    }),

  // Get single
  getById: (id: string, includeChildren = false) =>
    api.get<InventoryCategory>(`/inventory-categories/${id}`, {
      params: { includeChildren: includeChildren ? 'true' : undefined },
    }),

  // Update
  update: (id: string, data: UpdateCategoryInput) =>
    api.patch<InventoryCategory>(`/inventory-categories/${id}`, data),

  // Soft delete (deactivate)
  deactivate: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/inventory-categories/${id}`),

  // Restore
  restore: (id: string) =>
    api.post<InventoryCategory>(`/inventory-categories/${id}/restore`),
};