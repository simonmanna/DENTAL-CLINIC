// src/services/staffApi.ts
// IMPORTANT: Import from the shared api instance that has the working token interceptor
import { api } from '../lib/api/client';
import { Staff, CreateStaffRequest } from '../types/staff';

export const staffApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    isActive?: boolean;
  }) => api.get('/staff', { params }).then(r => r.data),

  getById: (id: string) => api.get(`/staff/${id}`).then(r => r.data),

  create: (data: CreateStaffRequest) => api.post('/staff', data).then(r => r.data),

  update: (id: string, data: Partial<CreateStaffRequest>) => api.patch(`/staff/${id}`, data).then(r => r.data),

  toggleActive: (id: string) => api.patch(`/staff/${id}/toggle-active`).then(r => r.data),

  delete: (id: string) => api.delete(`/staff/${id}`).then(r => r.data),

  updateSchedule: (id: string, schedules: any[]) => api.post(`/staff/${id}/schedule`, { schedules }).then(r => r.data),

  addPerformanceNote: (id: string, data: { period: string; notes: string; rating?: number }) => 
    api.post(`/staff/${id}/performance`, data).then(r => r.data),
};