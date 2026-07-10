// src/lib/api-extensions.ts
// Add these to your existing api.ts / api layer
// Each function maps to a real backend endpoint

import { api } from "@/lib/api/client";
// ─── Visits ──────────────────────────────────────────────────────────────────

export const visitsApi = {
  getOne: (id: string) =>
    api.get(`/visits/${id}`).then(r => r.data),

  create: (data: { appointmentId: string; dentistId: string }) =>
    api.post('/visits', data).then(r => r.data),

  startExamination: (id: string) =>
    api.patch(`/visits/${id}/start-examination`).then(r => r.data),

  complete: (id: string, data: { followUpNotes: string; nextAppointment?: string }) =>
    api.patch(`/visits/${id}/complete`, data).then(r => r.data),

  /** Save / update SOAP notes */
  updateSOAP: (id: string, data: { subjective: string; objective: string; assessment: string; plan: string }) =>
    api.patch(`/visits/${id}/soap`, data).then(r => r.data),

  /** Add a procedure to the visit */
  addProcedure: (visitId: string, data: { procedureId: string; toothNumber?: string; notes?: string }) =>
    api.post(`/visits/${visitId}/procedures`, data).then(r => r.data),

  /** Remove a procedure from the visit */
  removeProcedure: (visitId: string, procedureId: string) =>
    api.delete(`/visits/${visitId}/procedures/${procedureId}`).then(r => r.data),

  /** Apply a discount to the visit bill */
  applyDiscount: (visitId: string, amount: number) =>
    api.patch(`/visits/${visitId}/discount`, { amount }).then(r => r.data),

  getAll: (params?: { search?: string; date?: string; page?: number; limit?: number }) =>
    api.get('/visits', { params }).then(r => r.data),
};

// ─── Dental Chart ─────────────────────────────────────────────────────────────

export const dentalChartApi = {
  /** Get chart for a patient (persists across visits) */
  getChart: (patientId: string) =>
    api.get(`/patients/${patientId}/dental-chart`).then(r => r.data),

  /** Save full chart state */
  saveChart: (patientId: string, data: { teeth: Record<number, { condition: string; surfaces: string[]; notes: string }> }) =>
    api.put(`/patients/${patientId}/dental-chart`, data).then(r => r.data),

  /** Upload an x-ray image tied to a visit */
  uploadXray: (visitId: string, formData: FormData) =>
    api.post(`/visits/${visitId}/xrays`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  /** Delete an x-ray */
  deleteXray: (xrayId: string) =>
    api.delete(`/xrays/${xrayId}`).then(r => r.data),
};

// ─── Procedures Catalog ───────────────────────────────────────────────────────

export const proceduresApi = {
  /** Search the procedure catalog by name or ADA code */
  search: (q: string) =>
    api.get('/procedures/catalog', { params: { q } }).then(r => r.data),

  /** Get all catalog procedures */
  getAll: () =>
    api.get('/procedures/catalog').then(r => r.data),
};

// ─── Prescriptions ────────────────────────────────────────────────────────────

export const prescriptionsApi = {
  /** Create a prescription for a visit */
  create: (data: {
    visitId: string;
    drugName: string;
    strength: string;
    dosageForm: string;
    sig: string;
    quantity: string;
    refills: string;
    notes: string;
  }) =>
    api.post('/prescriptions', data).then(r => r.data),

  /** Remove / void a prescription */
  remove: (rxId: string) =>
    api.delete(`/prescriptions/${rxId}`).then(r => r.data),

  /** Get prescriptions for a visit */
  getByVisit: (visitId: string) =>
    api.get(`/visits/${visitId}/prescriptions`).then(r => r.data),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentsApi = {
  /** Record a payment against a visit */
  create: (data: {
    visitId: string;
    amount: number;
    method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'INSURANCE';
    reference?: string;
  }) =>
    api.post('/payments', data).then(r => r.data),

  /** Reverse a payment */
  remove: (paymentId: string) =>
    api.delete(`/payments/${paymentId}`).then(r => r.data),

  /** Get payments for a visit */
  getByVisit: (visitId: string) =>
    api.get(`/visits/${visitId}/payments`).then(r => r.data),
};

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointmentsApi = {
  getAll: (params?: { search?: string; date?: string; page?: number; limit?: number }) =>
    api.get('/appointments', { params }).then(r => r.data),

  getOne: (id: string) =>
    api.get(`/appointments/${id}`).then(r => r.data),

  checkIn: (id: string) =>
    api.patch(`/appointments/${id}/check-in`).then(r => r.data),

  cancel: (id: string, reason: string) =>
    api.patch(`/appointments/${id}/cancel`, { reason }).then(r => r.data),

  book: (data: {
    patientId: string;
    dentistId: string;
    scheduledAt: string;
    duration: number;
    type: string;
    notes?: string;
  }) =>
    api.post('/appointments', data).then(r => r.data),
};

// ─── Expected backend visit shape (for reference) ─────────────────────────────
/*
  GET /visits/:id → {
    id, status, checkedInAt, subjective, objective, assessment, plan,
    progress: { checkedIn, examStarted, proceduresDone, prescriptionsDone, paymentDone, completed },
    patient: { id, firstName, lastName, patientCode, phone },
    dentist: { id, firstName, lastName },
    procedures: [{ id, cost, status, toothNumber, notes, procedure: { id, name, adaCode } }],
    prescriptions: [{ id, drugName, strength, dosageForm, sig, quantity, refills, notes, status }],
    payments: [{ id, amount, method, reference, createdAt }],
    financials: { proceduresTotal, amountPaid, balance, discount },
    xrays: [{ id, url, label, uploadedAt }],
  }
*/
