export type StockAdjustmentReason =
  | 'CYCLE_COUNT'
  | 'DAMAGED'
  | 'EXPIRED'
  | 'THEFT'
  | 'RETURNED_TO_SUPPLIER'
  | 'FOUND'
  | 'INITIAL_COUNT'
  | 'OTHER';

export type AdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ItemType = 'INVENTORY' | 'DRUG';

export interface Location {
  id: string;
  name: string;
  type: string;
}
// src/types/stock-adjustment.ts

export interface StockAdjustment {
  id: string;
  adjustmentCode: string;
  locationId: string;
  location: {
    id: string;
    name: string;
    type: string;  // LocationType enum as string
  };
  reason: StockAdjustmentReason;
  notes?: string | null;
  status: AdjustmentStatus;
  approvedById?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  performedById?: string | null;
  createdAt: string;
  updatedAt: string;
  
  // ✅ Items array (required)
  items: AdjustmentItem[];
  
  // ✅ Counts (optional, populated by include)
  _count?: {
    items?: number;
  };
}

export interface AdjustmentItem {
  id?: string;
  itemType: "INVENTORY" | "DRUG";
  inventoryItemId?: string | null;
  drugId?: string | null;
  itemName: string;
  unit: string;
  quantitySystem: number;
  quantityActual: number;
  quantityDifference: number;
  unitCost: number;
  batchNumber?: string | null;
  notes?: string | null;
}

// ✅ API Response Type
export interface AdjustmentsResponse {
  data: StockAdjustment[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface StockItem {
  id: string;
  type: ItemType;  // 'INVENTORY' | 'DRUG'
  name: string;
  genericName?: string | null;
  code?: string;
  unit: string;
  uom: string;
  unitCost: number;
  currentStock: number;
  minQuantity?: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  category?: string | null;
  // ✅ ADD THESE:
  batchTracking?: boolean;  // Critical for conditional batch UI
  location?: string;        // Optional storage location display
}

// export interface AdjustmentItem {
//   id?: string;
//   itemType: ItemType;
//   inventoryItemId?: string | null;
//   drugId?: string | null;
//   itemName: string;
//   unit: string;
//   quantitySystem: number;
//   quantityActual: number;
//   quantityDifference: number;
//   unitCost: number;
//   batchNumber?: string | null;
//   notes?: string | null;
// }

// export interface StockAdjustment {
//   id: string;
//   adjustmentCode: string;
//   locationId: string;
//   location: Location;
//   reason: StockAdjustmentReason;
//   notes?: string | null;
//   status: AdjustmentStatus;
//   approvedById?: string | null;
//   approvedAt?: string | null;
//   approvalNotes?: string | null;
//   performedById?: string | null;
//   items: AdjustmentItem[];
//   _count?: { items: number };
//   createdAt: string;
//   updatedAt: string;
// }

// export interface StockItem {
//   id: string;
//   type: ItemType;
//   name: string;
//   genericName?: string | null;
//   code?: string;
//   unit: string;
//   uom: string;
//   unitCost: number;
//   currentStock: number;
//   batchNumber?: string | null;
//   expiryDate?: string | null;
//   category?: string | null;
// }

export interface AdjustmentStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  thisMonth: number;
  totalValueAdjusted: number;
}

export interface CreateAdjustmentPayload {
  locationId: string;
  reason: StockAdjustmentReason;
  notes?: string;
  items: {
    itemType: ItemType;
    inventoryItemId?: string;
    drugId?: string;
    itemName: string;
    unit: string;
    quantitySystem: number;
    quantityActual: number;
    unitCost: number;
    batchNumber?: string;
    notes?: string;
  }[];
}

export const REASON_LABELS: Record<StockAdjustmentReason, string> = {
  CYCLE_COUNT: 'Cycle Count',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  THEFT: 'Theft / Loss',
  RETURNED_TO_SUPPLIER: 'Returned to Supplier',
  FOUND: 'Found / Surplus',
  INITIAL_COUNT: 'Initial Count',
  OTHER: 'Other',
};

export const REASON_COLORS: Record<StockAdjustmentReason, string> = {
  CYCLE_COUNT: 'blue',
  DAMAGED: 'red',
  EXPIRED: 'orange',
  THEFT: 'red',
  RETURNED_TO_SUPPLIER: 'purple',
  FOUND: 'green',
  INITIAL_COUNT: 'teal',
  OTHER: 'gray',
};
