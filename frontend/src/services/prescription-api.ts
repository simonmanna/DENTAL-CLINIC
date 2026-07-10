import { api } from '@/lib/api/client';
import { Prescription, PrescriptionListResponse, PrescriptionFilters } from '@/types/prescription';

export const prescriptionApi = {
  list: (filters: PrescriptionFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return api.get<PrescriptionListResponse>(`/prescriptions?${params}`).then(r => r.data);
  },

  getById: (id: string) =>
    api.get<Prescription>(`/prescriptions/${id}`).then(r => r.data),

  getByVisit: (visitId: string) =>
    api.get<Prescription[]>(`/prescriptions/by-visit/${visitId}`).then(r => r.data),

  getByPatient: (patientId: string) =>
    api.get<Prescription[]>(`/prescriptions/patient/${patientId}`).then(r => r.data),

  update: (id: string, data: { status?: string; notes?: string; dispensedBy?: string }) =>
    api.patch<Prescription>(`/prescriptions/${id}`, data).then(r => r.data),

  dispense: (id: string, dispensedBy: string) =>
    api.post<Prescription>(`/prescriptions/${id}/dispense`, { dispensedBy }).then(r => r.data),

  delete: (id: string) =>
    api.delete<{ message: string }>(`/prescriptions/${id}`).then(r => r.data),
};