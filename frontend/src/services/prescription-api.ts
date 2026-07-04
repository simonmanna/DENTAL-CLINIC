// src/services/prescription-api.ts
import { Prescription, PrescriptionListResponse, PrescriptionFilters } from '@/types/prescription';

// const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token'); // or use your auth context
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export const prescriptionApi = {
  // List prescriptions with filters & pagination
  list: (filters: PrescriptionFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    return fetchAPI<PrescriptionListResponse>(`/prescriptions?${params}`);
  },

  // Get single prescription
  getById: (id: string) => 
    fetchAPI<Prescription>(`/prescriptions/${id}`),

  // Get by visit
  getByVisit: (visitId: string) => 
    fetchAPI<Prescription[]>(`/prescriptions/by-visit/${visitId}`),

  // Get by patient
  getByPatient: (patientId: string) => 
    fetchAPI<Prescription[]>(`/prescriptions/patient/${patientId}`),

  // Update prescription (status/notes)
  update: (id: string, data: { status?: string; notes?: string; dispensedBy?: string }) => 
    fetchAPI<Prescription>(`/prescriptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Dispense prescription
  dispense: (id: string, dispensedBy: string) => 
    fetchAPI<Prescription>(`/prescriptions/${id}/dispense`, {
      method: 'POST',
      body: JSON.stringify({ dispensedBy }),
    }),

  // Delete prescription
  delete: (id: string) => 
    fetchAPI<{ message: string }>(`/prescriptions/${id}`, {
      method: 'DELETE',
    }),
};