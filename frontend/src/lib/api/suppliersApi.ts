// src/lib/api/suppliersApi.ts

import { api } from '@/lib/api/client';

export const suppliersApi = {
  getAll: (search?: string) =>
    api.get("/suppliers", { params: { search } }).then((r) => r.data),

  getSuppliers: (search?: string) =>
    api.get("/suppliers", { params: { search } }).then((r) => r.data),
  
  getById: (id: string) =>
    api.get(`/suppliers/${id}`).then((r) => r.data),
  
  create: (data: any) =>
    api.post("/suppliers", data).then((r) => r.data),
  
  update: (id: string, data: any) =>
    api.patch(`/suppliers/${id}`, data).then((r) => r.data),
  
  delete: (id: string) =>
    api.delete(`/suppliers/${id}`).then((r) => r.data),
};