import { api } from '@/lib/api/client';

export interface Location {
  id: string; name: string; type: string; description?: string; isActive: boolean;
  _count?: { drugStocks: number; inventoryStocks: number };
}

export interface Drug {
  id: string; name: string; genericName?: string; category: string; form?: string;
  strength?: string; manufacturer?: string; unit: string; stockQuantity: number;
  minStock: number; unitPrice: number; sellPrice: number; isActive: boolean;
  requiresPrescription: boolean; sideEffects?: string; contraindications?: string;
}

export interface InventoryItem {
  id: string; itemCode: string; name: string; category: string; unit: string;
  quantity: number; minQuantity: number; unitCost: number; location?: string;
  description?: string;
  supplier?: { id?: string; name: string };
  isActive: boolean;
}

export interface Supplier {
  id: string; name: string; contactPerson?: string; phone?: string; email?: string;
  address?: string; notes?: string; isActive: boolean;
  _count?: { inventoryItems: number; purchaseOrders: number };
}

export interface POItem {
  id: string; itemId: string; quantity: number; unitCost: number; total: number;
  receivedQty: number; item: InventoryItem;
}

export interface PurchaseOrder {
  id: string; orderNumber: string; status: string; totalCost: number;
  amountPaid?: number; paymentStatus?: string; notes?: string;
  supplier: { id?: string; name: string };
  items: POItem[];
  createdAt: string; expectedAt?: string; receivedAt?: string;
}

export interface SaleItem {
  id: string; drugId: string; drug: Drug; quantity: number;
  unitPrice: number; discount: number; total: number;
}

export interface SalePayment {
  id: string; amount: number; method: string; reference?: string; paidAt: string;
}

export interface PharmacySale {
  id: string; saleCode: string; saleType: string; status: string;
  subtotal: number; discountAmount: number; total: number;
  amountPaid: number; balance: number; notes?: string; soldBy?: string;
  location?: Location;
  patient?: { id: string; firstName: string; lastName: string; patientCode: string };
  items: SaleItem[]; payments: SalePayment[];
  createdAt: string; updatedAt: string;
}

export interface Expense {
  id: string; expenseCode: string; category: string; title: string;
  description?: string; amount: number; currency: string; status: string;
  expenseDate: string; reference?: string;
  approvedBy?: string; approvedAt?: string;
  paidBy?: string; paidAt?: string; paymentMethod?: string; paymentRef?: string;
  notes?: string; createdAt: string; updatedAt: string;
}

export interface SupplierPayment {
  id: string; amount: number; method: string; reference?: string; notes?: string;
  paidAt: string; createdAt: string;
  supplier: { id: string; name: string };
  purchaseOrder?: { id: string; orderNumber: string; totalCost: number };
}

export interface MovementItem {
  id: string; quantity: number; drug?: Drug; inventoryItem?: InventoryItem;
}

export interface StockMovement {
  id: string; movementCode: string; type: string; notes?: string; performedBy?: string;
  createdAt: string;
  fromLocation?: Location; toLocation?: Location;
  items: MovementItem[];
}

export interface ConsumptionItem {
  id: string; quantity: number; unitCost: number; totalCost: number;
  drug?: Drug; inventoryItem?: InventoryItem;
}

export interface TreatmentConsumption {
  id: string; consumptionCode: string; totalCost: number; notes?: string;
  performedBy?: string; createdAt: string;
  patient?: { id: string; firstName: string; lastName: string; patientCode: string };
  treatmentPlan?: { id: string; planCode?: string; title: string };
  items: ConsumptionItem[];
}

export interface PaginatedResponse<T> {
  data: T[]; meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface InventoryStats {
  totalItems: number; totalValue: number; lowStockItems: number; outOfStock: number;
}

export interface PharmacySalesStats {
  totalSales: number; totalRevenue: number; totalCollected: number; totalOutstanding: number;
  byPaymentMethod: Record<string, number>;
}

export interface ExpenseStats {
  totalPaid: number; totalPending: number; totalApproved: number; count: number;
  byCategory: Array<{ category: string; total: number; count: number }>;
}

export interface SupplierBalance {
  supplierId: string; supplierName: string;
  totalPurchased: number; totalPaid: number; outstanding: number;
  purchaseOrders: Array<{ id: string; orderNumber: string; totalCost: number; amountPaid: number; status: string }>;
}

function qs(params?: Record<string, string | undefined>): Record<string, string | number | boolean> {
  if (!params) return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') result[k] = v;
  }
  return result;
}

export const inventoryApi = {
  getItems: (search?: string, category?: string) =>
    api.get<InventoryItem[]>('/inventory/items', { params: { search, category } }).then(r => r.data),
  getItem: (id: string) =>
    api.get<InventoryItem>(`/inventory/items/${id}`).then(r => r.data),
  createItem: (data: Partial<InventoryItem> & Record<string, unknown>) =>
    api.post<InventoryItem>('/inventory/items', data).then(r => r.data),
  updateItem: (id: string, data: Partial<InventoryItem> & Record<string, unknown>) =>
    api.patch<InventoryItem>(`/inventory/items/${id}`, data).then(r => r.data),
  recordTransaction: (id: string, data: object) =>
    api.post(`/inventory/items/${id}/transaction`, data).then(r => r.data),
  getStats: () =>
    api.get<InventoryStats>('/inventory/items/stats').then(r => r.data),

  getSuppliers: (search?: string) =>
    api.get<Supplier[]>('/inventory/suppliers', { params: { search } }).then(r => r.data),
  createSupplier: (data: Partial<Supplier> & Record<string, unknown>) =>
    api.post<Supplier>('/inventory/suppliers', data).then(r => r.data),
  updateSupplier: (id: string, data: Partial<Supplier> & Record<string, unknown>) =>
    api.patch<Supplier>(`/inventory/suppliers/${id}`, data).then(r => r.data),

  getPOs: (status?: string) =>
    api.get<PurchaseOrder[]>('/inventory/purchase-orders', { params: qs({ status }) }).then(r => r.data),
  getPurchaseOrders: (status?: string) =>
    api.get<PurchaseOrder[]>('/inventory/purchase-orders', { params: qs({ status }) }).then(r => r.data),
  createPO: (data: object) =>
    api.post<PurchaseOrder>('/inventory/purchase-orders', data).then(r => r.data),
  createPurchaseOrder: (data: object) =>
    api.post<PurchaseOrder>('/inventory/purchase-orders', data).then(r => r.data),
  receivePO: (id: string, items: object[]) =>
    api.post(`/inventory/purchase-orders/${id}/receive`, { items }).then(r => r.data),
  receivePurchaseOrder: (id: string, items: object[]) =>
    api.post(`/inventory/purchase-orders/${id}/receive`, { items }).then(r => r.data),
};

export const pharmacyApi = {
  getDrugs: (search?: string, category?: string) =>
    api.get<Drug[]>('/pharmacy/drugs', { params: { search, category } }).then(r => r.data),
  getDrug: (id: string) =>
    api.get<Drug>(`/pharmacy/drugs/${id}`).then(r => r.data),
  createDrug: (data: Partial<Drug> & Record<string, unknown>) =>
    api.post<Drug>('/pharmacy/drugs', data).then(r => r.data),
  updateDrug: (id: string, data: Partial<Drug> & Record<string, unknown>) =>
    api.patch<Drug>(`/pharmacy/drugs/${id}`, data).then(r => r.data),
  adjustStock: (id: string, data: object) =>
    api.post(`/pharmacy/drugs/${id}/stock`, data).then(r => r.data),
  getLowStock: () =>
    api.get<Drug[]>('/pharmacy/drugs/low-stock').then(r => r.data),
  getCategories: () =>
    api.get<Array<{ category: string; count: number }>>('/pharmacy/drugs/categories').then(r => r.data),

  getSales: (params?: { locationId?: string; patientId?: string; saleType?: string; status?: string; from?: string; to?: string; page?: string; limit?: string }) =>
    api.get<PaginatedResponse<PharmacySale>>('/pharmacy/sales', { params: params as Record<string, string> }).then(r => r.data),
  getSale: (id: string) =>
    api.get<PharmacySale>(`/pharmacy/sales/${id}`).then(r => r.data),
  createSale: (data: object) =>
    api.post<PharmacySale>('/pharmacy/sales', data).then(r => r.data),
  addPayment: (id: string, data: object) =>
    api.post<SalePayment>(`/pharmacy/sales/${id}/payments`, data).then(r => r.data),
  refundSale: (id: string, reason?: string) =>
    api.post<PharmacySale>(`/pharmacy/sales/${id}/refund`, { reason }).then(r => r.data),
  getSalesStats: (params?: { locationId?: string; from?: string; to?: string }) =>
    api.get<PharmacySalesStats>('/pharmacy/sales/stats', { params: params as Record<string, string> }).then(r => r.data),
};

export const expensesApi = {
  getAll: (params?: { category?: string; status?: string; from?: string; to?: string; page?: string }) =>
    api.get<PaginatedResponse<Expense>>('/expenses', { params: params as Record<string, string> }).then(r => r.data),
  create: (data: object) =>
    api.post<Expense>('/expenses', data).then(r => r.data),
  update: (id: string, data: object) =>
    api.patch<Expense>(`/expenses/${id}`, data).then(r => r.data),
  approve: (id: string, approvedBy: string) =>
    api.post<Expense>(`/expenses/${id}/approve`, { approvedBy }).then(r => r.data),
  pay: (id: string, data: object) =>
    api.post<Expense>(`/expenses/${id}/pay`, data).then(r => r.data),
  reject: (id: string) =>
    api.post<Expense>(`/expenses/${id}/reject`).then(r => r.data),
  getStats: (params?: { from?: string; to?: string }) =>
    api.get<ExpenseStats>('/expenses/stats', { params: params as Record<string, string> }).then(r => r.data),
};

export const supplierPaymentsApi = {
  getAll: (params?: { supplierId?: string; purchaseOrderId?: string; page?: string }) =>
    api.get<PaginatedResponse<SupplierPayment>>('/supplier-payments', { params: params as Record<string, string> }).then(r => r.data),
  create: (data: object) =>
    api.post<SupplierPayment>('/supplier-payments', data).then(r => r.data),
  getBalance: (supplierId: string) =>
    api.get<SupplierBalance>(`/supplier-payments/supplier/${supplierId}/balance`).then(r => r.data),
  getStats: () =>
    api.get<{ totalPaid: number; byMethod: Record<string, number> }>('/supplier-payments/stats').then(r => r.data),
};

export const locationsApi = {
  getAll: () =>
    api.get<Location[]>('/locations').then(r => r.data),
  create: (data: object) =>
    api.post<Location>('/locations', data).then(r => r.data),
  update: (id: string, data: object) =>
    api.patch<Location>(`/locations/${id}`, data).then(r => r.data),
  getStock: (id: string) =>
    api.get<{ drugs: Array<{ drug: Drug; quantity: number }>; items: Array<{ item: InventoryItem; quantity: number }> }>(`/locations/${id}/stock`).then(r => r.data),
  transfer: (data: object) =>
    api.post<StockMovement>('/locations/transfer', data).then(r => r.data),
  getMovements: (params?: { fromLocationId?: string; toLocationId?: string; type?: string; page?: string }) =>
    api.get<PaginatedResponse<StockMovement>>('/locations/movements', { params: params as Record<string, string> }).then(r => r.data),
};

export const consumptionsApi = {
  getAll: (params?: { treatmentPlanId?: string; patientId?: string; from?: string; to?: string; page?: string }) =>
    api.get<PaginatedResponse<TreatmentConsumption>>('/treatment-consumptions', { params: params as Record<string, string> }).then(r => r.data),
  getById: (id: string) =>
    api.get<TreatmentConsumption>(`/treatment-consumptions/${id}`).then(r => r.data),
  create: (data: object) =>
    api.post<TreatmentConsumption>('/treatment-consumptions', data).then(r => r.data),
  getStats: (params?: { from?: string; to?: string }) =>
    api.get<{
      topDrugs: Array<{ drugId: string; name: string; totalQty: number; totalCost: number }>;
      topItems: Array<{ itemId: string; name: string; totalQty: number; totalCost: number }>;
      totalCost: number; totalRecords: number;
    }>('/treatment-consumptions/stats', { params: params as Record<string, string> }).then(r => r.data),
};