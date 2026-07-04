import api from "@/lib/api/client";
// ─── Types ──────────────────────────────────────────────────────────────────

export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  unit: string;
  sellPrice: number;
  stockQuantity: number;
  requiresPrescription: boolean;
  category?: string;
}

export interface PrescriptionItem {
  id: string;
  drugId: string;
  drug: Drug;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string;
}

export interface Prescription {
  id: string;
  prescriptionCode: string;
  status: "ACTIVE" | "DISPENSED" | "EXPIRED" | "CANCELLED";
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
  };
  dentist?: { id: string; firstName: string; lastName: string };
  items: PrescriptionItem[];
  visitId?: string;
}

// ─── Create Pharmacy Sale DTO ───────────────────────────────────────────────
// NO locationId needed — backend resolves from PHARMACY_LOCATION setting

export interface CreatePharmacySaleDto {
  patientId?: string;
  prescriptionId?: string;
  saleType: "OTC" | "PRESCRIPTION" | "WALK_IN";
  notes?: string;
  servedBy?: string;
  items: Array<{
    drugId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
  payments?: Array<{
    amount: number;
    method: string;
    reference?: string;
  }>;
}

// ─── Dispense Multiple DTO ────────────────────────────────────────────────
// NO locationId needed — backend resolves from PHARMACY_LOCATION setting

export interface DispenseMultipleDto {
  patientId: string;
  servedBy?: string;
  notes?: string;
  prescriptionIds: string[];
  walkInItems?: Array<{
    drugId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
  payments?: Array<{
    amount: number;
    method: string;
    reference?: string;
  }>;
}

// ─── Drugs API ──────────────────────────────────────────────────────────────

export const drugsApi = {
  getAll: async (params?: { category?: string; lowStock?: boolean }): Promise<Drug[]> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.lowStock) queryParams.append('lowStock', 'true');
    const res = await api.get(`/pharmacy/drugs?${queryParams.toString()}`);
    return res.data;
  },

  search: async (query: string): Promise<Drug[]> => {
    if (!query.trim()) return [];
    const res = await api.get(`/pharmacy/drugs?search=${encodeURIComponent(query)}&limit=10`);
    return res.data;
  },

  getById: async (id: string): Promise<Drug> => {
    const res = await api.get(`/pharmacy/drugs/${id}`);
    return res.data;
  },
};

// ─── Prescriptions API ─────────────────────────────────────────────────────

export const prescriptionsApi = {
  getActive: async (): Promise<{ data: Prescription[] }> => {
    const res = await api.get(`/prescriptions?status=ACTIVE&limit=100`);
    return res.data;
  },

  search: async (query: string): Promise<Prescription[]> => {
    if (!query.trim()) return [];
    const res = await api.get(`/prescriptions?search=${encodeURIComponent(query)}&status=ACTIVE&limit=10`);
    return res.data;
  },

  getById: async (id: string): Promise<Prescription> => {
    const res = await api.get(`/prescriptions/${id}`);
    return res.data;
  },

   getByVisit: async (visitId: string): Promise<Prescription[]> => {
    const res = await api.get(`/prescriptions/by-visit/${visitId}`);
    return res.data;
  },

   getByPatient: async (patientId: string): Promise<Prescription[]> => {
    const res = await api.get(`/prescriptions/patient/${patientId}`);
    return res.data; // backend returns Prescription[] directly
  },

};

// ─── Pharmacy Sales API ────────────────────────────────────────────────────
// Simplified — no locationId or inventoryItemId needed

export const pharmacyApi = {
  /**
   * Create a sale (walk-in or single prescription)
   * Backend resolves location from PHARMACY_LOCATION setting
   */
  createSale: async (dto: CreatePharmacySaleDto) => {
    console.log("📤 PAYLOAD:", JSON.stringify(dto, null, 2));
    const res = await api.post('/pharmacy/sales', dto);  // ← No locationId in DTO
    return res.data;
  },

  /**
   * Dispense multiple prescriptions at once
   * Backend resolves location from PHARMACY_LOCATION setting
   */
  dispenseMultiple: async (dto: DispenseMultipleDto) => {
    const res = await api.post('/pharmacy/sales/dispense-multiple', dto);  // ← No locationId in DTO
    return res.data;
  },

  getAll: async (params?: {
    patientId?: string;
    saleType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.patientId) queryParams.append('patientId', params.patientId);
    if (params?.saleType) queryParams.append('saleType', params.saleType);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
    queryParams.append('page', String(params?.page || 1));
    queryParams.append('limit', String(params?.limit || 20));
    const res = await api.get(`/pharmacy/sales?${queryParams.toString()}`);
    return res.data;
  },

  getById: async (id: string) => {
    const res = await api.get(`/pharmacy/sales/${id}`);
    return res.data;
  },

  addPayment: async (saleId: string, payment: { amount: number; method: string; reference?: string }) => {
    const res = await api.post(`/pharmacy/sales/${saleId}/payments`, payment);
    return res.data;
  },

  refund: async (saleId: string, reason?: string) => {
    const res = await api.post(`/pharmacy/sales/${saleId}/refund`, { reason });
    return res.data;
  },

  getStats: async (params?: { dateFrom?: string; dateTo?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
    if (params?.dateTo) queryParams.append('dateTo', params.dateTo);
    const res = await api.get(`/pharmacy/sales/stats?${queryParams.toString()}`);
    return res.data;
  },
};