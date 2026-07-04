// src/lib/api/inventory.ts
// Shared API client — all DHMS inventory, pharmacy, expenses, locations, consumptions

// const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// const BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3001';
const BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001";


async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Request failed');
  }
  return res.json();
}

function qs(params?: Record<string, string | undefined>): string {
  if (!params) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Types ────────────────────────────────────────────────────

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

// ── Inventory API ─────────────────────────────────────────────
export const inventoryApi = {
  // Items — supports (search?, category?) for convenience
  getItems: (search?: string, category?: string) =>
    req<InventoryItem[]>(`/inventory/items${qs({ search, category })}`),
  getItem: (id: string) => req<InventoryItem>(`/inventory/items/${id}`),
  createItem: (data: Partial<InventoryItem> & Record<string, unknown>) =>
    req<InventoryItem>('/inventory/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<InventoryItem> & Record<string, unknown>) =>
    req<InventoryItem>(`/inventory/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  recordTransaction: (id: string, data: object) =>
    req(`/inventory/items/${id}/transaction`, { method: 'POST', body: JSON.stringify(data) }),
  getStats: () => req<InventoryStats>('/inventory/items/stats'),

  // Suppliers
  getSuppliers: (search?: string) =>
    req<Supplier[]>(`/inventory/suppliers${qs({ search })}`),
  createSupplier: (data: Partial<Supplier> & Record<string, unknown>) =>
    req<Supplier>('/inventory/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: Partial<Supplier> & Record<string, unknown>) =>
    req<Supplier>(`/inventory/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Purchase Orders — aliased for page compatibility
  getPOs: (status?: string) =>
    req<PurchaseOrder[]>(`/inventory/purchase-orders${qs({ status })}`),
  getPurchaseOrders: (status?: string) =>
    req<PurchaseOrder[]>(`/inventory/purchase-orders${qs({ status })}`),
  createPO: (data: object) =>
    req<PurchaseOrder>('/inventory/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  createPurchaseOrder: (data: object) =>
    req<PurchaseOrder>('/inventory/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  receivePO: (id: string, items: object[]) =>
    req(`/inventory/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ items }) }),
  receivePurchaseOrder: (id: string, items: object[]) =>
    req(`/inventory/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ items }) }),
};

// ── Pharmacy API ──────────────────────────────────────────────
export const pharmacyApi = {
  // Drugs — supports (search?, category?) convenience overload
  getDrugs: (search?: string, category?: string) =>
    req<Drug[]>(`/pharmacy/drugs${qs({ search, category })}`),
  getDrug: (id: string) => req<Drug>(`/pharmacy/drugs/${id}`),
  createDrug: (data: Partial<Drug> & Record<string, unknown>) =>
    req<Drug>('/pharmacy/drugs', { method: 'POST', body: JSON.stringify(data) }),
  updateDrug: (id: string, data: Partial<Drug> & Record<string, unknown>) =>
    req<Drug>(`/pharmacy/drugs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adjustStock: (id: string, data: object) =>
    req(`/pharmacy/drugs/${id}/stock`, { method: 'POST', body: JSON.stringify(data) }),
  getLowStock: () => req<Drug[]>('/pharmacy/drugs/low-stock'),
  getCategories: () => req<Array<{ category: string; count: number }>>('/pharmacy/drugs/categories'),

  // Sales
  getSales: (params?: { locationId?: string; patientId?: string; saleType?: string; status?: string; from?: string; to?: string; page?: string; limit?: string }) =>
    req<PaginatedResponse<PharmacySale>>(`/pharmacy/sales${qs(params as Record<string, string>)}`),
  getSale: (id: string) => req<PharmacySale>(`/pharmacy/sales/${id}`),
  createSale: (data: object) =>
    req<PharmacySale>('/pharmacy/sales', { method: 'POST', body: JSON.stringify(data) }),
  addPayment: (id: string, data: object) =>
    req<SalePayment>(`/pharmacy/sales/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  refundSale: (id: string, reason?: string) =>
    req<PharmacySale>(`/pharmacy/sales/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getSalesStats: (params?: { locationId?: string; from?: string; to?: string }) =>
    req<PharmacySalesStats>(`/pharmacy/sales/stats${qs(params as Record<string, string>)}`),
};

// ── Expenses API ──────────────────────────────────────────────
export const expensesApi = {
  getAll: (params?: { category?: string; status?: string; from?: string; to?: string; page?: string }) =>
    req<PaginatedResponse<Expense>>(`/expenses${qs(params as Record<string, string>)}`),
  create: (data: object) =>
    req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    req<Expense>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approve: (id: string, approvedBy: string) =>
    req<Expense>(`/expenses/${id}/approve`, { method: 'POST', body: JSON.stringify({ approvedBy }) }),
  pay: (id: string, data: object) =>
    req<Expense>(`/expenses/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  reject: (id: string) =>
    req<Expense>(`/expenses/${id}/reject`, { method: 'POST' }),
  getStats: (params?: { from?: string; to?: string }) =>
    req<ExpenseStats>(`/expenses/stats${qs(params as Record<string, string>)}`),
};

// ── Supplier Payments API ─────────────────────────────────────
export const supplierPaymentsApi = {
  getAll: (params?: { supplierId?: string; purchaseOrderId?: string; page?: string }) =>
    req<PaginatedResponse<SupplierPayment>>(`/supplier-payments${qs(params as Record<string, string>)}`),
  create: (data: object) =>
    req<SupplierPayment>('/supplier-payments', { method: 'POST', body: JSON.stringify(data) }),
  getBalance: (supplierId: string) =>
    req<SupplierBalance>(`/supplier-payments/supplier/${supplierId}/balance`),
  getStats: () => req<{ totalPaid: number; byMethod: Record<string, number> }>('/supplier-payments/stats'),
};

// ── Locations API ─────────────────────────────────────────────
export const locationsApi = {
  getAll: () => req<Location[]>('/locations'),
  create: (data: object) =>
    req<Location>('/locations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    req<Location>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getStock: (id: string) =>
    req<{ drugs: Array<{ drug: Drug; quantity: number }>; items: Array<{ item: InventoryItem; quantity: number }> }>(`/locations/${id}/stock`),
  transfer: (data: object) =>
    req<StockMovement>('/locations/transfer', { method: 'POST', body: JSON.stringify(data) }),
  getMovements: (params?: { fromLocationId?: string; toLocationId?: string; type?: string; page?: string }) =>
    req<PaginatedResponse<StockMovement>>(`/locations/movements${qs(params as Record<string, string>)}`),
};

// ── Treatment Consumptions API ────────────────────────────────
export const consumptionsApi = {
  getAll: (params?: { treatmentPlanId?: string; patientId?: string; from?: string; to?: string; page?: string }) =>
    req<PaginatedResponse<TreatmentConsumption>>(`/treatment-consumptions${qs(params as Record<string, string>)}`),
  getById: (id: string) => req<TreatmentConsumption>(`/treatment-consumptions/${id}`),
  create: (data: object) =>
    req<TreatmentConsumption>('/treatment-consumptions', { method: 'POST', body: JSON.stringify(data) }),
  getStats: (params?: { from?: string; to?: string }) =>
    req<{
      topDrugs: Array<{ drugId: string; name: string; totalQty: number; totalCost: number }>;
      topItems: Array<{ itemId: string; name: string; totalQty: number; totalCost: number }>;
      totalCost: number; totalRecords: number;
    }>(`/treatment-consumptions/stats${qs(params as Record<string, string>)}`),
};