// src/lib/api/treatment-procedures.ts
import { api } from './client';

export interface TreatmentTarget {
  id: string;
  toothNumber: number;
  surfaces: string[];
  unitIndex: number | null;
}

export interface TreatmentProcedure {
  id:              string;
  treatmentPlanId: string;
  procedureId:     string;
  toothNumbers:    number[];
  surfaces:        string[];
  notes:           string | null;
  status:          string;       // PLANNED | IN_PROGRESS | COMPLETED | CANCELLED
  sequence:        number;
  visitGroup:      number;
  totalPrice:      number;
  currency:        string;
  sessionType:     string;
  sessionCount:    number;
  billingType:     string;
  paymentStatus:   string;       // OPEN | PENDING | PAID | PARTIAL
  providerId?:     string;
  // Pricing snapshot for the edit dialog
  pricePerUnit?:   number;
  quantity?:       number;
  subtotalPrice?:  number;
  discountAmount?: number;
  taxAmount?:      number;
  // Linked invoice — locks pricing fields when POSTED/PAID
  invoiceId?:             string | null;
  invoiceStatus?:         string | null;
  invoicePaymentStatus?: string | null;
  invoiceAmountPaid?:    number;
  procedure: {
    id:       string;
    name:     string;
    code:     string;
    category: any;
    basePrice?: number;
  };
  targets:   TreatmentTarget[];
  sessions:  any[];
  /** Total sessions ever recorded — used to determine edit mode */
  sessionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export const treatmentProceduresApi = {

  // ── Get all procedures for a patient ─────────────────────────────────────
  getPatientProcedures: async (patientId: string): Promise<TreatmentProcedure[]> => {
    const response = await api.get(`/treatment-plans/patient/${patientId}/procedures`);
    // Normalise: attach sessionsCount from sessions array length if not returned by API.
    // Backend already attaches invoiceId / invoiceStatus / invoicePaymentStatus /
    // invoiceAmountPaid for the edit dialog's pricing lock.
    return (response.data as any[]).map(p => ({
      ...p,
      sessionsCount: p.sessionsCount ?? (p.sessions?.length ?? 0),
    }));
  },

  // ── Get procedures for a specific tooth ───────────────────────────────────
  getToothProcedures: async (
    patientId: string,
    toothNumber: number,
  ): Promise<TreatmentProcedure[]> => {
    const response = await api.get(
      `/treatment-plans/patient/${patientId}/tooth/${toothNumber}/procedures`,
    );
    return (response.data as any[]).map(p => ({
      ...p,
      sessionsCount: p.sessionsCount ?? (p.sessions?.length ?? 0),
    }));
  },

  // ── Update procedure (delegates to the /edit endpoint) ────────────────────
  updateProcedure: async (
    planId: string,
    procedureId: string,
    payload: {
      notes?:         string;
      providerId?:    string;
      cost?:          number;
      surfaces?:      string[];
      toothNumbers?:  number[];
      sequence?:      number;
      visitGroup?:    number;
      scheduledDate?: string;
    },
  ) => {
    const response = await api.patch(
      `/treatment-plans/${planId}/procedures/${procedureId}/edit`,
      payload,
    );
    return response.data;
  },
};
