// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrugCategory {
  id: string;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
  children?: DrugCategory[];
  isActive: boolean;
  sortOrder: number;
  _count?: { drugs: number };
  createdAt: string;
  updatedAt: string;
}

export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category: string;           // mapped from category.name
  form?: string;
  strength?: string;
  unit?: string;
  unitPrice: number;          // converted from string
  sellPrice: number;          // converted from string
  // isActive: boolean;
  requiresPrescription: boolean;
  stockQuantity: number;      // mapped from inventoryItem.quantity
  minStock: number;           // mapped from inventoryItem.minQuantity
  
  // Optional: keep original nested data if dialogs need it
  inventoryItem?: {
    id: string;
    itemCode: string;
    quantity: number;
    minQuantity: number;
    unitCost: number;
  };
  categoryObj?: {
    id: string;
    name: string;
    color: string;
    icon: string;
  };
}

// export interface Drug {
//   id: string;
//   name: string;
//   genericName?: string;
//   category: string;           // mapped from category.name
//   form?: string;
//   strength?: string;
//   unit?: string;
//   unitPrice: number;          // converted from string
//   sellPrice: number;          // converted from string
//   isActive: boolean;
//   requiresPrescription: boolean;
//   stockQuantity: number;      // mapped from inventoryItem.quantity
//   minStock: number;           // mapped from inventoryItem.minQuantity
  
//   // Optional: keep original nested data if dialogs need it
//   inventoryItem?: {
//     id: string;
//     itemCode: string;
//     quantity: number;
//     minQuantity: number;
//     unitCost: number;
//   };
//   categoryObj?: {
//     id: string;
//     name: string;
//     color: string;
//     icon: string;
//   };
// }

// export interface Drug {
//   id: string;
//   name: string;
//   genericName?: string;
  
//   // NEW: Category relation instead of string
//   categoryId?: string;
//   category?: DrugCategory | null;
  
//   // Keep for backward compatibility during migration
//   categoryLegacy?: string;
  
//   form?: string;
//   strength?: string;
//   manufacturer?: string;
//   unit: string;
//   uom?: string;
//   unitPrice: number;
//   sellPrice: number;
  
//   // Stock is now aggregated from InventoryLocationStock
//   stockQuantity: number;
//   minStock: number;
  
//   requiresPrescription: boolean;
//   isActive: boolean;
  
//   // Inventory link
//   inventoryItemId?: string;
  
//   createdAt: string;
//   updatedAt: string;
// }

export interface DrugStockTransaction {
  id: string;
  drugId: string;
  inventoryItemId?: string;
  locationId?: string;
  locationName?: string;
  type: StockTransactionType;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
  performedBy?: string;
  performedByStaff?: string;
  createdAt: string;
}

export type StockTransactionType =
  | 'PURCHASE'
  | 'USAGE'
  | 'ADJUSTMENT'
  | 'RETURN'
  | 'EXPIRED'
  | 'DAMAGED'
  | 'TRANSFER';

// Legacy interface for dropdown compatibility
export interface DrugCategoryCount {
  category: string;
  count: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DrugStats {
  totalDrugs: number;
  outOfStock: number;
  lowStock: number;
  stockValue: number;
  rxOnly: number;
}

// ─── Location-specific stock ─────────────────────────────────────────────────

export interface DrugLocationStock {
  id: string;
  drugId: string;
  locationId: string;
  locationName: string;
  locationType: string;
  quantity: number;
  minQuantity: number;
  batchNumber?: string;
  expiryDate?: string;
  unitCost: number;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export interface DrugFormData {
  name: string;
  genericName: string;
  categoryId: string;        // Changed from category string
  form: string;
  strength: string;
  manufacturer: string;
  unit: string;
  unitPrice: number;
  sellPrice: number;
  minStock: number;
  requiresPrescription: boolean;
  isActive: boolean;
  // Optional: initial stock when creating
  initialStock?: number;
  initialLocationId?: string;
}

export const EMPTY_DRUG_FORM: DrugFormData = {
  name: '',
  genericName: '',
  categoryId: '',           // Changed from category: ''
  form: 'tablet',
  strength: '',
  manufacturer: '',
  unit: 'tablet',
  unitPrice: 0,
  sellPrice: 0,
  minStock: 10,
  requiresPrescription: false,
  isActive: true,
};

export const DRUG_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'ointment',
  'drops',
  'inhaler',
  'patch',
  'suppository',
  'gel',
  'powder',
  'solution',
  'suspension',
];

export const STOCK_TRANSACTION_TYPES: {
  value: StockTransactionType;
  label: string;
  isInflow: boolean;
}[] = [
  { value: 'PURCHASE', label: 'Purchase / Restock', isInflow: true },
  { value: 'RETURN', label: 'Return from Patient', isInflow: true },
  { value: 'ADJUSTMENT', label: 'Manual Adjustment (+)', isInflow: true },
  { value: 'USAGE', label: 'Usage / Dispensed', isInflow: false },
  { value: 'EXPIRED', label: 'Expired', isInflow: false },
  { value: 'DAMAGED', label: 'Damaged / Lost', isInflow: false },
  { value: 'TRANSFER', label: 'Transfer Out', isInflow: false },
];

// ─── Stock Adjustment Form ───────────────────────────────────────────────────

export interface StockAdjustmentFormData {
  type: StockTransactionType;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  reference?: string;
  notes?: string;
  performedBy?: string;
  locationId?: string;      // Required: which location to adjust
}