import {api} from '@/lib/api/client';

// ─── Types (Preserved) ───────────────────────────────────────────────────

export interface InventoryLocationStock {
  id: string;
  locationId: string;
  quantity: number;
  minQuantity: number;
  updatedAt: string;
  location: {
    id: string;
    name: string;
    type: string;  // LocationType enum as string
  };
}

export interface Location {
  id: string;
  name: string;
  type: string;
}

// ─── Report Types ──────────────────────────────────────────────────────────
export interface InventoryReportPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InventoryReportResponse<T> {
  data: T[];
  pagination: InventoryReportPagination;
  summary: any;
}

export type UnitOfMeasure =
  | 'PIECES' | 'BOX' | 'PACK' | 'BOTTLE' | 'VIAL' | 'AMPULE'
  | 'TABLET' | 'CAPSULE' | 'STRIP' | 'TUBE' | 'SYRINGE' | 'GLOVES_PAIR'
  | 'ROLL' | 'ML' | 'LITER' | 'MG' | 'G' | 'KG' | 'INCH' | 'MM'
  | 'SET' | 'KIT';

export const UOM_LABELS: Record<UnitOfMeasure, string> = {
  PIECES: 'Pieces (pcs)',   BOX: 'Box',         PACK: 'Pack',
  BOTTLE: 'Bottle',        VIAL: 'Vial',        AMPULE: 'Ampule',
  TABLET: 'Tablet',        CAPSULE: 'Capsule',  STRIP: 'Strip',
  TUBE: 'Tube',            SYRINGE: 'Syringe',  GLOVES_PAIR: 'Pair (Gloves)',
  ROLL: 'Roll',            ML: 'mL',            LITER: 'Liter',
  MG: 'mg',                G: 'g',              KG: 'kg',
  INCH: 'inch',            MM: 'mm',            SET: 'Set',
  KIT: 'Kit',
};

export interface InventoryCategory {
  id: string;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string;
  parent?: { id: string; name: string; color?: string };
  children?: InventoryCategory[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  _count?: { inventoryItems: number };
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  name: string;
  description?: string;
  unit: string;
  uom: string;  // UnitOfMeasure enum
  type: string; // InventoryType enum
  unitCost: number;
  minQuantity: number;
  isActive: boolean;
  batchTracking?: boolean;
  createdAt: string;
  updatedAt: string;
  
  // ✅ NEW: Aggregated from locationStocks (replaces old `quantity` field)
  totalQuantity?: number;
  
  // ✅ NEW: Per-location stock breakdown
  locationStocks?: InventoryLocationStock[];
  
  // ✅ Computed helpers for UI convenience
  stockValue?: number;
  isLowStock?: boolean;
  
  // Relations
  category?: {
    id: string;
    name: string;
    code?: string;
    color?: string;
    icon?: string;
    parentId?: string;
    parent?: { id: string; name: string };
  };
  supplier?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  
  // Counts
  _count?: {
    ledgerEntries?: number;
    locationStocks?: number;
    procedureInputs?: number;
    purchaseOrderItems?: number;
    transactions?: number;  // If you alias ledgerEntries as transactions
  };
  
  // Nested data (populated on detail view)
  stockLogs?: any[];  // InventoryLedger entries
  procedureInputs?: any[];
  purchaseOrderItems?: any[];
  transactions?: any[];  // If you alias ledgerEntries
}

export function getTotalQuantity(item: InventoryItem): number {
  // Legacy support (if API still returns it temporarily)
  if ('quantity' in item && typeof item.quantity === 'number') {
    return item.quantity;
  }
  
  // Preferred: aggregated total from backend
  if (typeof item.totalQuantity === 'number') {
    return item.totalQuantity;
  }
  
  // Fallback: sum from locationStocks
  if (Array.isArray(item.locationStocks)) {
    return item.locationStocks.reduce((sum, ls) => sum + ls.quantity, 0);
  }
  
  return 0;
}

export function isItemLowStock(item: InventoryItem): boolean {
  const totalQty = getTotalQuantity(item);
  return totalQty < (item.minQuantity ?? 0);
}

/**
 * Check if item is out of stock
 */
export function isItemOutOfStock(item: InventoryItem): boolean {
  return getTotalQuantity(item) === 0;
}


export interface InventoryStats {
  total: number;
  lowStock: number;
  outOfStock: number;
  stockValue: number;
  categoryBreakdown: { id: string; name: string; color?: string; count: number }[];
}

export interface PaginatedInventory {
  data: InventoryItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}


// ─── Inventory API Client ───────────────────────────────────────────────

const INVENTORY_BASE = '/inventory';

export const inventoryApi = {
  // Stats
  getStats: () => 
    api.get<InventoryStats>(`${INVENTORY_BASE}/stats`).then(res => res.data),

  // Categories
  getCategories: (flat = false) =>
    api.get<InventoryCategory[]>(`${INVENTORY_BASE}/categories`, { params: { flat } }).then(res => res.data),

  createCategory: (data: Partial<InventoryCategory>) =>
    api.post<InventoryCategory>(`${INVENTORY_BASE}/categories`, data).then(res => res.data),

  updateCategory: (id: string, data: Partial<InventoryCategory>) =>
    api.put<InventoryCategory>(`${INVENTORY_BASE}/categories/${id}`, data).then(res => res.data),

  deleteCategory: (id: string) =>
    api.delete(`${INVENTORY_BASE}/categories/${id}`).then(res => res.data),

  // Items
  getItems: (params: Record<string, any> = {}) => {
    // Axios handles object-to-query-string conversion automatically via 'params'
    return api.get<PaginatedInventory>(INVENTORY_BASE, { params }).then(res => res.data);
  },

  getItem: (id: string) => 
    api.get<InventoryItem>(`${INVENTORY_BASE}/${id}`).then(res => res.data),

  createItem: (data: Partial<InventoryItem>) =>
    api.post<InventoryItem>(INVENTORY_BASE, data).then(res => res.data),

  updateItem: (id: string, data: Partial<InventoryItem>) =>
    api.put<InventoryItem>(`${INVENTORY_BASE}/${id}`, data).then(res => res.data),

  deactivate: (id: string) =>
    api.patch(`${INVENTORY_BASE}/${id}/deactivate`).then(res => res.data),

 getLocations: () => 
    api.get<Location[]>("/locations").then((r) => r.data),  

 getSuppliers: (params?: { isActive?: boolean; limit?: number }) =>
    api.get<Supplier[]>('/suppliers', { params }).then(res => res.data),


 getItemsReport: (params: Record<string, any> = {}) =>
    api.get<InventoryReportResponse<any>>(`${INVENTORY_BASE}/reports/items`, { params })
      .then(res => res.data),

  getLedgerReport: (params: Record<string, any> = {}) =>
    api.get<InventoryReportResponse<any>>(`${INVENTORY_BASE}/reports/ledger`, { params })
      .then(res => res.data),
};


export default api;