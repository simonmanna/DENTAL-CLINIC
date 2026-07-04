// src/lib/api/pharmacy.ts
// import { api as apiClient } from '../api';
// import { apiClient } from '../api-client'; // your existing axios/fetch wrapper

// ─── Types ─────────────────────────────────────────────────────────────────────
// src/lib/api/pharmacy.ts
import api from '@/lib/api/client';


export interface Drug {
  id: string;
  name: string;
  genericName?: string | null;
  category: string;
  form?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
  unit: string;
  stockQuantity: number;
  minStock: number;
  unitPrice: number;
  sellPrice: number;
  isActive: boolean;
  requiresPrescription: boolean;
  sideEffects?: string | null;
  contraindications?: string | null;
  createdAt: string;
  updatedAt: string;
  locationStocks?: DrugLocationStock[];
  _count?: { prescriptionItems: number; saleItems: number };
}

export interface DrugLocationStock {
  id: string;
  drugId: string;
  locationId: string;
  quantity: number;
  minStock: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  location: { id: string; name: string; type: string };
}

export interface DrugStockTransaction {
  id: string;
  drugId: string;
  type: string;
  quantity: number;
  unitCost?: number | null;
  totalCost?: number | null;
  reference?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  locationId?: string | null;
  notes?: string | null;
  performedBy?: string | null;
  createdAt: string;
}

export interface PrescriptionItem {
  id: string;
  drugId: string;
  drug: Drug;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  route?: string | null;
  instructions?: string | null;
  refills: number;
}

export interface Prescription {
  id: string;
  prescriptionCode: string;
  patientId: string;
  visitId: string;
  dentistId?: string | null;
  status: 'ACTIVE' | 'DISPENSED' | 'EXPIRED' | 'CANCELLED';
  notes?: string | null;
  validUntil?: string | null;
  dispensedAt?: string | null;
  dispensedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PrescriptionItem[];
  patient?: { firstName: string; lastName: string; patientCode: string };
  dentist?: { firstName: string; lastName: string };
}

export interface PharmacySaleItem {
  id: string;
  drugId: string;
  drug: { id: string; name: string; unit: string };
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface PharmacySalePayment {
  id: string;
  saleId: string;
  amount: number;
  method: string;
  reference?: string | null;
  createdAt: string;
}

export interface PharmacySale {
  id: string;
  saleCode: string;
  locationId: string;
  location?: { id: string; name: string };
  patientId?: string | null;
  patient?: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  prescriptionId?: string | null;
  prescription?: { id: string; prescriptionCode: string } | null;
  saleType: 'OTC' | 'PRESCRIPTION' | 'WALK_IN';
  notes?: string | null;
  servedBy?: string | null;
  subtotal: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  items: PharmacySaleItem[];
  payments: PharmacySalePayment[];
  createdAt: string;
  updatedAt: string;
}

export interface PharmacyDashboard {
  drugs: {
    total: number;
    lowStock: number;
    outOfStock: number;
    stockValue: number;
    expiringIn30Days: number;
  };
  prescriptions: { active: number };
  sales: {
    today: { count: number; revenue: number; collected: number };
    month: { count: number; revenue: number; collected: number };
  };
}

export interface SalesStats {
  overview: {
    totalSales: number;
    totalRevenue: number;
    totalCollected: number;
    totalOutstanding: number;
    averageSaleValue: number;
  };
  byStatus: Array<{ status: string; count: number; total: number }>;
  byPaymentMethod: Array<{ method: string; count: number; amount: number }>;
  topDrugs: Array<{ drugId: string; drug?: Partial<Drug>; _sum: { quantity: number; total: number } }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── Drug API ──────────────────────────────────────────────────────────────────

export const drugApi = {
  getAll: (params?: {
    search?: string; category?: string; isActive?: boolean;
    lowStock?: boolean; requiresPrescription?: boolean;
    page?: number; limit?: number;
  }): Promise<PaginatedResponse<Drug>> =>
    api.get('/pharmacy/drugs', { params }),

  getOne: (id: string): Promise<Drug> =>
    api.get(`/pharmacy/drugs/${id}`),

  create: (data: Partial<Drug>): Promise<Drug> =>
    api.post('/pharmacy/drugs', data),

  update: (id: string, data: Partial<Drug>): Promise<Drug> =>
    api.patch(`/pharmacy/drugs/${id}`, data),

  adjustStock: (id: string, data: {
    type: string; quantity: number; unitCost?: number;
    batchNumber?: string; expiryDate?: string; reference?: string;
    notes?: string; performedBy?: string; locationId?: string;
  }): Promise<Drug> =>
    api.post(`/pharmacy/drugs/${id}/stock`, data),

  getTransactions: (id: string, limit?: number): Promise<DrugStockTransaction[]> =>
    api.get(`/pharmacy/drugs/${id}/transactions`, { params: { limit } }),

  getLowStock: (): Promise<{ outOfStock: Drug[]; lowStock: Drug[]; total: number }> =>
    api.get('/pharmacy/drugs/low-stock'),

  getCategories: (): Promise<Array<{ category: string; count: number }>> =>
    api.get('/pharmacy/drugs/categories'),
};

// ─── Prescription API ──────────────────────────────────────────────────────────

export const prescriptionApi = {
  getAll: (params?: {
    patientId?: string; dentistId?: string; status?: string;
    dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }): Promise<PaginatedResponse<Prescription>> =>
    api.get('/pharmacy/prescriptions', { params }),

  getOne: (id: string): Promise<Prescription> =>
    api.get(`/pharmacy/prescriptions/${id}`),

  create: (data: {
    patientId: string; visitId: string; dentistId?: string;
    notes?: string; validUntil?: string;
    items: Array<{
      drugId: string; dosage: string; frequency: string;
      duration: string; quantity: number; route?: string;
      instructions?: string; refills?: number;
    }>;
  }): Promise<Prescription> =>
    api.post('/pharmacy/prescriptions', data),

  dispense: (id: string, dispensedBy: string): Promise<Prescription> =>
    api.post(`/pharmacy/prescriptions/${id}/dispense`, { dispensedBy }),
};

// ─── Sales API ─────────────────────────────────────────────────────────────────

export const salesApi = {
  getAll: (params?: {
    locationId?: string; patientId?: string; saleType?: string;
    status?: string; dateFrom?: string; dateTo?: string;
    page?: number; limit?: number;
  }): Promise<PaginatedResponse<PharmacySale>> =>
    api.get('/pharmacy/sales', { params }),

  getOne: (id: string): Promise<PharmacySale> =>
    api.get(`/pharmacy/sales/${id}`),

  create: (data: {
    locationId: string; patientId?: string; prescriptionId?: string;
    saleType: string; notes?: string; servedBy?: string;
    items: Array<{ drugId: string; quantity: number; unitPrice: number; discount?: number }>;
    payments?: Array<{ amount: number; method: string; reference?: string }>;
  }): Promise<PharmacySale> =>
    api.post('/pharmacy/sales', data),

  addPayment: (id: string, data: {
    amount: number; method: string; reference?: string;
  }): Promise<{ payment: PharmacySalePayment; sale: PharmacySale }> =>
    api.post(`/pharmacy/sales/${id}/payments`, data),

  refund: (id: string, reason?: string): Promise<PharmacySale> =>
    api.post(`/pharmacy/sales/${id}/refund`, { reason }),

  getStats: (params?: {
    locationId?: string; dateFrom?: string; dateTo?: string;
  }): Promise<SalesStats> =>
    api.get('/pharmacy/sales/stats', { params }),
};

// ─── Dashboard API ─────────────────────────────────────────────────────────────

export const pharmacyDashboardApi = {
  get: (): Promise<PharmacyDashboard> =>
    api.get('/pharmacy/dashboard'),
};