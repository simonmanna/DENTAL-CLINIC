import { api } from "./client";
import type {
  Patient,
  PatientStats,
  PatientVisit,
  CreatePatientForm,
  UpdatePatientForm,
  AddInsuranceForm,
} from "../../types/patients";

export const patientsApi = {
  /** Get all patients with pagination/filters */
  getAll: (params?: Record<string, string | number | undefined>) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([_, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "undefined",
      ),
    );

     return api.get<{ data: Patient[]; meta?: any }>("/patients", { params: cleanParams })
      .then((r) => r.data.data); 
      

  },

getAllWithMeta: (params?: Record<string, string | number | undefined>) => {
  const cleanParams = Object.fromEntries(
    Object.entries(params || {}).filter(
      ([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined",
    ),
  );

  return api
    .get<any>("/patients", { params: cleanParams })
    .then((r) => {
      const payload = r.data;

      // Case 1: Server returns a plain array
      if (Array.isArray(payload)) {
        return { data: payload as Patient[], meta: null };
      }

      // Case 2: Server returns { data: [...], meta: {...} }
      if (payload && typeof payload === "object") {
        return {
          data: (payload.data as Patient[]) ?? [],
          meta: payload.meta ?? null,
        };
      }

      // Fallback
      return { data: [], meta: null };
    });
},

  /** Get single patient by ID */
  getOne: (id: string) =>
    api.get<Patient>(`/patients/${id}`).then((r) => r.data),

  /** Create new patient */
  create: (data: CreatePatientForm) =>
    api.post<Patient>("/patients", data).then((r) => r.data),

  /** Update patient */
  update: (id: string, data: UpdatePatientForm) =>
    api.patch<Patient>(`/patients/${id}`, data).then((r) => r.data),

  /** Get patient statistics */
  getStats: () => api.get<PatientStats>("/patients/stats").then((r) => r.data),

  /** Get patient analytics */
  getAnalytics: (params?: Record<string, string | number | undefined>) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(
        ([_, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          value !== "undefined",
      ),
    );
    // TODO: Replace `any` with a proper AnalyticsResponse type
    return api
      .get<any>("/patients/analytics", { params: cleanParams })
      .then((r) => r.data);
  },

  /** Get patient's visit history */
  getVisits: (id: string, params?: Record<string, string>) =>
    api
      .get<PatientVisit[]>(`/patients/${id}/visits`, { params })
      .then((r) => r.data),

  /** Add insurance to patient */
  addInsurance: (id: string, data: AddInsuranceForm) =>
    api
      .post<{ message: string }>(`/patients/${id}/insurance`, data)
      .then((r) => r.data),

  /** Get treatment plans for a patient */
  getPatientTreatmentPlans: (patientId: string) =>
    api.get(`/treatment-plans/patient/${patientId}`).then((r) => r.data),

  /** Get single treatment plan details */
  getTreatmentPlan: (planId: string) =>
    api.get(`/treatment-plans/${planId}`).then((r) => r.data),
};
