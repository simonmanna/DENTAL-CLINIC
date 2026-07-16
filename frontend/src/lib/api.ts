import api from './api/client';

// ─── Types for Procedures ─────────────────────────────────────────────────────

export interface Procedure {
    code?: string;
    name: string;
    category: string; // flattened category name
    description?: string;
    baseCost: number; // internal cost
    basePrice: number; // selling price
    defaultDuration: number;
    requiresXray: boolean;
    isActive: boolean;
    inputs: ProcedureInventoryInput[];
    inputsCost: number; // computed from inputs
    margin: number; // basePrice - inputsCost
  }

export interface ProcedureInventoryInput {
  inventoryItemId: string;
  locationId?: string;
  quantityUsed: number;
  unitCost: number;
  notes?: string;
  isOptional: boolean;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    category: string;
  };
  location?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export interface ProcedureCostBreakdown {
  procedure: {
    id: string;
    name: string;
    category: string;
  };
  sellingPrice: number;
  inputs: Array<{
    inventoryItem: {
      id: string;
      name: string;
      unit: string;
      category: string;
    };
    location: {
      id: string;
      name: string;
      type: string;
    } | null;
    quantityUsed: number;
    unitCost: number;
    lineCost: number;
    isOptional: boolean;
    notes?: string;
  }>;
  inputsCost: number;
  margin: number;
  marginPercent: number;
}

export interface CreateProcedureForm {
  code?: string;
  name: string;
  category: string;
  description?: string;
  baseCost: number;
  defaultDuration: number;
  requiresXray: boolean;
  isActive: boolean;
  inputs: ProcedureInputForm[];
}

export interface ProcedureInputForm {
  inventoryItemId: string;
  locationId?: string;
  quantityUsed: number;
  unitCost: number;
  notes?: string;
  isOptional: boolean;
}

// ─── API Exports ──────────────────────────────────────────────────────────────

export const authApi = {
  login: (data: any) => api.post("/auth/login", data).then((r) => r.data),
  register: (data: any) => api.post("/auth/register", data).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post("/auth/change-password", data).then((r) => r.data),
};

export const patientsApi = {

  getAll: (params?: any) =>
    api.get("/patients", { params }).then((r) => r.data),
  getById: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  getOne: (id: string) => api.get(`/patients/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/patients", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/patients/${id}`, data).then((r) => r.data),
  getStats: () => api.get("/patients/stats").then((r) => r.data),
  getVisits: (id: string, params?: any) =>
    api.get(`/patients/${id}/visits`, { params }).then((r) => r.data),
  addInsurance: (id: string, data: any) =>
    api.post(`/patients/${id}/insurance`, data).then((r) => r.data),

  getPatientTreatmentPlans: (patientId: string) =>
    api.get(`/treatment-plans/patient/${patientId}`).then((r) => r.data),

  // Fetch single treatment plan details
  getTreatmentPlan: (planId: string) =>
    api.get(`/treatment-plans/${planId}`).then((r) => r.data),
};

export const appointmentsApi = {
  getAll: (params?: any) =>
    api.get("/appointments", { params }).then((r) => r.data),
  getOne: (id: string) => api.get(`/appointments/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/appointments", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/appointments/${id}`, data).then((r) => r.data),
  checkIn: (id: string) =>
    api.post(`/appointments/${id}/check-in`).then((r) => r.data),
  confirm: (id: string) =>
    api.post(`/appointments/${id}/confirm`).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post(`/appointments/${id}/cancel`, { reason }).then((r) => r.data),
  reschedule: (id: string, data: any) =>
    api.post(`/appointments/${id}/reschedule`, data).then((r) => r.data),
  arrive: (id: string) =>
    api.post(`/appointments/${id}/arrive`).then((r) => r.data),
getAvailableSlots: (dentistId: string, date: string, duration = 30) =>
  api.get('/appointments/slots', { params: { dentistId, date, duration } }).then((r) => r.data),
draft: (id: string) =>                          // ← ADD THIS
    api.post(`/appointments/${id}/draft`).then((r) => r.data),
 delete: (id: string) =>
    api.delete(`/appointments/${id}`).then((r) => r.data),
};

export const dentalChartApi = {
  getChart: (patientId: string) =>
    api.get(`/patients/${patientId}/dental-chart`).then((r) => r.data),
  saveChart: (
    patientId: string,
    data: {
      teeth: Record<
        number,
        { condition: string; surfaces: string[]; notes: string }
      >;
    },
  ) => api.put(`/patients/${patientId}/dental-chart`, data).then((r) => r.data),
  uploadXray: (visitId: string, formData: FormData) =>
    api
      .post(`/visits/${visitId}/xrays`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),
  deleteXray: (xrayId: string) =>
    api.delete(`/xrays/${xrayId}`).then((r) => r.data),
};

// ─── Currency Configuration ───────────────────────────────────────────────────

const BASE_CURRENCY = 'UGX';

const CURRENCY_CONFIG: Record<string, { symbol: string; decimals: number; name: string }> = {
  'UGX': { symbol: 'USh', decimals: 0, name: 'Uganda Shilling' },
  'USD': { symbol: '$', decimals: 2, name: 'US Dollar' },
  'EUR': { symbol: '€', decimals: 2, name: 'Euro' },
  'GBP': { symbol: '£', decimals: 2, name: 'British Pound' },
  'KES': { symbol: 'KSh', decimals: 0, name: 'Kenyan Shilling' },
  'TZS': { symbol: 'TSh', decimals: 0, name: 'Tanzanian Shilling' },
};

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  const config = CURRENCY_CONFIG[currency] || { symbol: currency, decimals: 2 };
  const formatted = amount.toLocaleString('en-UG', {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  });
  return `${config.symbol} ${formatted}`;
}

function formatBaseCurrency(amount: number): string {
  return formatCurrency(amount, BASE_CURRENCY);
}

// ─── API Updates ──────────────────────────────────────────────────────────────

export const billingApi = {
  // Ledger
  getLedger: (visitId: string, displayCurrency?: string) =>
    api.get(`/billing/ledger?visitId=${visitId}&status=ALL${displayCurrency ? `&currency=${displayCurrency}` : ''}`).then(r => r.data),
  
  getExchangeRate: (from: string, to: string) =>
    api.get(`/billing/currencies/rate?from=${from}&to=${to}`).then(r => r.data),
  
  convertCurrency: (amount: number, from: string, to: string, rate?: number) =>
    api.post('/billing/currencies/convert', { amount, fromCurrency: from, toCurrency: to, exchangeRate: rate }).then(r => r.data),
  
  addLedgerEntry: (data: any) =>
    api.post('/billing/ledger', data).then(r => r.data),
  
  voidLedgerEntry: (id: string, reason: string) =>
    api.patch(`/billing/ledger/${id}/void`, { reason }).then(r => r.data),
  
  // Invoices
  getInvoices: (visitId: string) =>
    api.get(`/billing/invoices?visitId=${visitId}`).then(r => r.data),
  
  createInvoice: (data: any) =>
    api.post('/billing/invoices/from-ledger', data).then(r => r.data),
  
  getInvoice: (id: string) => 
    api.get(`/billing/invoices/${id}`).then(r => r.data),
  
  addPayment: (id: string, data: any) =>
    api.post(`/billing/invoices/${id}/payments`, data).then(r => r.data),
  
  voidInvoice: (id: string, reason: string) =>
    api.patch(`/billing/invoices/${id}/void`, { reason }).then(r => r.data),
  
  getReceipt: (id: string) => 
    api.get(`/billing/invoices/${id}/receipt`).then(r => r.data),
};


export const purchaseApi = {
  // ... existing methods ...

  createDelivery: async (data: any) => {
    const response = await api.post("/purchases/deliveries", data);
    return response.data;
  },

  getDeliveries: async (purchaseOrderId: string) => {
    const response = await api.get(
      `/purchases/orders/${purchaseOrderId}/deliveries`,
    );
    return response.data;
  },

  getDelivery: async (id: string) => {
    const response = await api.get(`/purchases/deliveries/${id}`);
    return response.data;
  },

  getLocationStock: async (locationId: string, itemType?: string) => {
    const response = await api.get(`/purchases/locations/${locationId}/stock`, {
      params: { itemType },
    });
    return response.data;
  },
};

export const emrApi = {
  create: (data: any) => api.post("/emr", data).then((r) => r.data),
  getByPatient: (patientId: string, params?: any) =>
    api.get(`/emr/patient/${patientId}`, { params }).then((r) => r.data),
  getTimeline: (patientId: string) =>
    api.get(`/emr/patient/${patientId}/timeline`).then((r) => r.data),
  getOne: (id: string) => api.get(`/emr/${id}`).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/emr/${id}`, data).then((r) => r.data),
  createLabOrder: (data: any) =>
    api.post("/emr/lab-orders", data).then((r) => r.data),
  getLabOrders: (params?: any) =>
    api.get("/emr/lab-orders/list", { params }).then((r) => r.data),
};

export const imagingApi = {
  getAll: (params?: any) => api.get("/imaging", { params }).then((r) => r.data),
  getByPatient: (patientId: string, type?: string) =>
    api
      .get(`/imaging/patient/${patientId}`, { params: { type } })
      .then((r) => r.data),
  getOne: (id: string) => api.get(`/imaging/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/imaging", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/imaging/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/imaging/${id}`).then((r) => r.data),
  compare: (data: any) =>
    api.post("/imaging/compare", data).then((r) => r.data),
};

export const pharmacyApi = {
  getDrugs: (params?: any) =>
    api.get("/drugs", { params }).then((r) => r.data),
  createDrug: (data: any) =>
    api.post("/drugs", data).then((r) => r.data),
  updateDrug: (id: string, data: any) =>
    api.patch(`/drugs/${id}`, data).then((r) => r.data),
  adjustStock: (id: string, data: any) =>
    api.post(`/drugs/${id}/stock`, data).then((r) => r.data),
  getLowStock: () => api.get("/drugs/low-stock").then((r) => r.data),
  getPrescriptions: (params?: any) =>
    api.get("/prescriptions", { params }).then((r) => r.data),
  createPrescription: (data: any) =>
    api.post("/prescriptions", data).then((r) => r.data),
  dispense: (id: string, dispensedBy: string) =>
    api
      .post(`/prescriptions/${id}/dispense`, { dispensedBy })
      .then((r) => r.data),
  dispenseMultiple: (data: any) =>
    api.post("/sales/dispense-multiple", data).then((r) => r.data),
    
};

// ✅ UPDATED inventoryApi with getLocations
export const inventoryApi = {
  getItems: (params?: any) =>
    api.get("/inventory/items", { params }).then((r) => {
      console.log("Raw axios response:", r);
      return r.data?.data || r.data || r;
    }),
  // getItems: (params?: any) =>
  // api.get("/inventory/items", { params }).then((r) => r.data),
  createItem: (data: any) =>
    api.post("/inventory/items", data).then((r) => r.data),
  getItem: (id: string) =>
    api.get(`/inventory/items/${id}`).then((r) => r.data),
  updateItem: (id: string, data: any) =>
    api.patch(`/items/${id}`, data).then((r) => r.data),
  transaction: (id: string, data: any) =>
    api.post(`/inventory/items/${id}/transaction`, data).then((r) => r.data),
  getStats: () => api.get("/inventory/items/stats").then((r) => r.data),
  createPO: (data: any) =>
    api.post("/inventory/purchase-orders", data).then((r) => r.data),
  getPOs: (status?: string) =>
    api
      .get("/inventory/purchase-orders", { params: { status } })
      .then((r) => r.data),
  // ✅ ADDED: Get all locations
  getLocations: () => api.get("/locations").then((r) => r.data),

  // Suppliers
    getSuppliers: (search?: string) =>
    api.get("/suppliers", { params: { search } }).then((r) => r.data),
  createSupplier: (data: any) =>
    api.post("/suppliers", data).then((r) => r.data),

};

export const staffApi = {
  getAll: (params?: any) => api.get("/staff", { params }).then((r) => r.data),
  getOne: (id: string) => api.get(`/staff/${id}`).then((r) => r.data),
  getDentists: () => api.get("/staff/dentists").then((r) => r.data),
  update: (id: string, data: any) =>
    api.patch(`/staff/${id}`, data).then((r) => r.data),
  updateSchedule: (id: string, schedules: any[]) =>
    api.post(`/staff/${id}/schedule`, { schedules }).then((r) => r.data),
};

export const reportsApi = {
  getDashboard: () => api.get("/reports/dashboard").then((r) => r.data),
  getRevenue: (params: any) =>
    api.get("/reports/revenue", { params }).then((r) => r.data),
  getAppointments: (params: any) =>
    api.get("/reports/appointments", { params }).then((r) => r.data),
  getRetention: () => api.get("/reports/retention").then((r) => r.data),
  getDentistPerformance: (params: any) =>
    api.get("/reports/dentist-performance", { params }).then((r) => r.data),
  getInventory: () => api.get("/reports/inventory").then((r) => r.data),
};

export const visitsApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    date?: string;
    search?: string;
    patientId?: string;
    dentistId?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/visits", { params }).then((r) => r.data),
  getOne: (id: string) => api.get(`/visits/${id}`).then((r) => r.data),
  create: (data: { appointmentId: string; dentistId: string }) =>
    api.post("/visits", data).then((r) => r.data),
  startExamination: (id: string) =>
    api.post(`/visits/${id}/start`).then((r) => r.data),
  complete: (id: string, data: any) =>
    api.post(`/visits/${id}/complete`, data).then((r) => r.data),
  updateSOAP: (id: string, data: any) =>
    api.patch(`/visits/${id}/soap`, data).then((r) => r.data),
  updateVitals: (id: string, data: any) =>
    api.patch(`/visits/${id}/vitals`, data).then((r) => r.data),
  addProcedure: (id: string, data: any) =>
    api.post(`/visits/${id}/procedures`, data).then((r) => r.data),
  writePrescription: (id: string, data: any) =>
    api.post(`/visits/${id}/prescriptions`, data).then((r) => r.data),
  processPayment: (id: string, data: any) =>
    api.post(`/visits/${id}/payments`, data).then((r) => r.data),
  searchDrugs: (q: string) =>
    api.get("/visits/drugs/search", { params: { q } }).then((r) => r.data),
  getProcedures: (q?: string) =>
    api.get("/visits/procedures/search", { params: { q } }).then((r) => r.data),
};

export const drugsApi = {
  getAll: (params?: {
    isActive?: boolean;
    category?: string;
    search?: string;
    requirePrescription?: boolean;
    page?: number;
    limit?: number;
  }) =>
    api.get("/drugs", { params }).then((r) => {
      // Handle both wrapped and unwrapped responses
      const response = r.data;
      console.log("Drugs API response:", response); // Debug log
      return response.data || response || [];
    }),

  /**
   * Search drugs by name (for quick search)
   */
  search: (query: string) =>
    api.get("/drugs/search", { params: { q: query } }).then((r) => {
      const response = r.data;
      return response.data || response || [];
    }),

  getOne: (id: string) => api.get(`/drugs/${id}`).then((r) => r.data),

  /**
   * Create new drug (admin/pharmacist)
   */
  create: (data: any) => api.post("/drugs", data).then((r) => r.data),

  /**
   * Update drug
   */
  update: (id: string, data: any) =>
    api.patch(`/drugs/${id}`, data).then((r) => r.data),

  /**
   * Check stock availability for multiple drugs
   */
  checkStock: (drugIds: string[]) =>
    api.post("/drugs/check-stock", { drugIds }).then((r) => r.data),
};

// ✅ COMPLETE proceduresApi with all methods needed by ProceduresPage
export const proceduresApi = {
  /** Get all procedures with pagination/filters */
  getAll: (params?: Record<string, string>) =>
    api.get("/procedures", { params }).then((r) => r.data),

  /** Get all procedure categories - FIX HERE */
   getCategories: async (): Promise<string[]> => {
    const { data } = await api.get('/procedures/categories');
    return data;
  },
  // getCategories: () =>
  //   api.get("/procedures/categories").then((r) => {
  //     // Handle both formats: array of strings OR array of {category: string} objects
  //     const data = r.data;
  //     if (Array.isArray(data) && data.length > 0) {
  //       // If backend returns [{category: 'Restorative'}, {category: 'Preventive'}]
  //       if (typeof data[0] === "object" && data[0].category) {
  //         return data.map((item: any) => item.category);
  //       }
  //       // If backend returns ['Restorative', 'Preventive']
  //       return data;
  //     }
  //     return [];
  //   }),

  /** Get single procedure by ID */
  getById: (id: string) => api.get(`/procedures/${id}`).then((r) => r.data),

  /** Get cost breakdown for a procedure */
  getCostBreakdown: (id: string): Promise<ProcedureCostBreakdown> =>
    api.get(`/procedures/${id}/cost-breakdown`).then((r) => r.data),

  /** Create new procedure */
  create: (data: CreateProcedureForm) =>
    api.post("/procedures", data).then((r) => r.data),

  /** Update procedure */
  update: (id: string, data: Partial<CreateProcedureForm>) =>
    api.patch(`/procedures/${id}`, data).then((r) => r.data),

  /** Delete procedure */
  delete: (id: string) => api.delete(`/procedures/${id}`).then((r) => r.data),

  /** Search procedures (legacy/alias) */
  search: (q: string) =>
    api.get("/procedures/catalog", { params: { q } }).then((r) => r.data),
};

export const prescriptionsApi = {
  create: (data: {
    visitId: string;
    items: Array<{
      drugId: string;
      dosage: string;
      frequency: string;
      duration: string;
      route: string;
      quantity: number;
      instructions?: string;
      refills: number;
    }>;
    notes?: string;
    validUntil?: string;
  }) => api.post("/prescriptions", data).then((r) => r.data),

  remove: (rxId: string) =>
    api.delete(`/prescriptions/${rxId}`).then((r) => r.data),

  /** Full edit – replace items / notes / validUntil. Only works on ACTIVE rx. */
  update: (
    id: string,
    data: {
      items?: Array<{
        drugId: string;
        dosage: string;
        frequency: string;
        duration: string;
        route?: string;
        quantity: number;
        instructions?: string;
        refills: number;
      }>;
      notes?: string;
      validUntil?: string;
    },
  ) => api.put(`/prescriptions/${id}/edit`, data).then((r) => r.data),

  getByVisit: (visitId: string) =>
    api.get(`/prescriptions/by-visit/${visitId}`).then((r) => r.data),

  getById: (id: string) => api.get(`/prescriptions/${id}`).then((r) => r.data),

  dispense: (id: string, dispensedBy?: string) =>
    api
      .post(`/prescriptions/${id}/dispense`, { dispensedBy })
      .then((r) => r.data),

  search: (query: string, status?: string) =>
    api
      .get(`/prescriptions`, {
        params: {
          search: query,
          status: status || "ACTIVE",
          limit: 10,
        },
      })
      .then((r) => r.data),

  getByPatient: (patientId: string, params?: any) =>
    api
      .get(`/prescriptions/patient/${patientId}`, { params })
      .then((r) => r.data),
};

export const paymentsApi = {
  create: (data: {
    visitId: string;
    amount: number;
    method: "CASH" | "CARD" | "MOBILE_MONEY" | "INSURANCE";
    reference?: string;
  }) => api.post("/payments", data).then((r) => r.data),
  remove: (paymentId: string) =>
    api.delete(`/payments/${paymentId}`).then((r) => r.data),
  getByVisit: (visitId: string) =>
    api.get(`/visits/${visitId}/payments`).then((r) => r.data),
};

// const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// const BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";
const BASE_URL = ((import.meta as any).env?.VITE_API_URL || "http://localhost:3001") + "/api";


async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("access_token"); // Fixed: use 'access_token'
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Network error" }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types for Treatment Plans ─────────────────────────────────────────────────

export interface TreatmentPlan {
  id: string;
  patientId: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  procedures: Array<{
    id: string;
    procedureId: string;
    procedureName: string;
    estimatedCost: number;
    status: string;
    notes?: string;
  }>;
  totalEstimatedCost: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTreatmentPlanForm {
  patientId: string;
  procedures: Array<{
    procedureId: string;
    estimatedCost?: number;
    notes?: string;
  }>;
  notes?: string;
}

// ─── Pagination Helper ───────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Visit Procedures Summary ────────────────────────────────────────────────

export interface VisitProcedureSummary {
  visitId: string;
  procedures: Array<{
    id: string;
    procedure: {
      id: string;
      name: string;
      category: string;
      basePrice: number;
    };
    performedAt?: string;
    cost: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  }>;
  totalCost: number;
}

export const treatmentPlansApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<PaginatedResponse<TreatmentPlan>>(`/treatment-plans${qs}`);
  },

  getOne: (id: string) => apiFetch<TreatmentPlan>(`/treatment-plans/${id}`),

  getCostSummary: (id: string) =>
    apiFetch<any>(`/treatment-plans/${id}/cost-summary`),

  create: (data: CreateTreatmentPlanForm) =>
    apiFetch<TreatmentPlan>("/treatment-plans", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateTreatmentPlanForm>) =>
    apiFetch<TreatmentPlan>(`/treatment-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateProcedureStatus: (
    id: string,
    data: { status: string; notes?: string },
  ) =>
    apiFetch<any>(`/treatment-plans/procedure/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generateInvoice: (data: {
    treatmentPlanId: string;
    procedureIds?: string[];
    discountValue?: number;
    discountType?: string;
    taxPercent?: number;
    notes?: string;
  }) =>
    apiFetch<any>("/treatment-plans/generate-invoice", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const visitProceduresApi = {
  getForVisit: (visitId: string) =>
    apiFetch<VisitProcedureSummary>(`/visit-procedures/visit/${visitId}`),

  add: (data: any) =>
    apiFetch<any>("/visit-procedures", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ message: string }>(`/visit-procedures/${id}`, {
      method: "DELETE",
    }),
};


import type { ProcedureCategory, CreateCategoryForm, CategoryHierarchy } from '../types/procedure-categories';

export const procedureCategoriesApi = {
  getAll: (params?: { search?: string; isActive?: boolean; parentId?: string }) =>
    api.get<ProcedureCategory[]>('/procedure-categories', { params }).then(r => r.data),

  getHierarchy: () =>
    api.get<CategoryHierarchy[]>('/procedure-categories/hierarchy').then(r => r.data),

  getOne: (id: string) =>
    api.get<ProcedureCategory>(`/procedure-categories/${id}`).then(r => r.data),

  create: (data: CreateCategoryForm) =>
    api.post<ProcedureCategory>('/procedure-categories', data).then(r => r.data),

  update: (id: string, data: Partial<CreateCategoryForm>) =>
    api.patch<ProcedureCategory>(`/procedure-categories/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/procedure-categories/${id}`).then(r => r.data),

  reorder: (categories: { id: string; sortOrder: number; parentId?: string | null }[]) =>
    api.post('/procedure-categories/reorder', categories),
};

export const backupsApi = {
  getStatus: () => api.get("/admin/backups/status").then((r) => r.data),
  triggerFull: () => api.post("/admin/backups/full").then((r) => r.data),
  triggerBase: () => api.post("/admin/backups/base").then((r) => r.data),
  triggerFiles: () => api.post("/admin/backups/files").then((r) => r.data),
};