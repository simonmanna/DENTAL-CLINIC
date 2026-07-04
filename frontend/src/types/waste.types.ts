export type WasteCategory =
  | 'EXPIRED'
  | 'DAMAGED'
  | 'CONTAMINATED'
  | 'SPILLAGE'
  | 'BREAKAGE'
  | 'OTHER';

export type ItemType = 'INVENTORY' | 'DRUG';

export interface WasteItemForm {
  id: string;
  itemType: ItemType;
  inventoryItemId?: string;
  drugId?: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  reason?: string;
  availableQty: number;
  
  // ✅ NEW: Batch tracking fields
  batchTracking?: boolean;
  availableBatches?: Array<{
    id: string;
    batchNumber: string | null;
    quantity: number;
    expiryDate?: string;
    receivedAt?: string;
  }>;
  selectedBatchNumber?: string;
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';
}

// export interface WasteItemForm {
//   id: string; // local UUID for form key
//   itemType: ItemType;
//   inventoryItemId?: string;
//   drugId?: string;
//   itemName: string;
//   unit: string;
//   quantity: number;
//   unitCost: number;
//   batchNumber?: string;
//   expiryDate?: string;
//   reason?: string;
//   availableQty: number;
// }

export interface WasteItem {
  id: string;
  wasteId: string;
  itemType: ItemType;
  inventoryItemId?: string;
  drugId?: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  expiryDate?: string;
  reason?: string;
  inventoryItem?: { id: string; name: string; itemCode: string };
  drug?: { id: string; name: string; genericName?: string };
}

export interface WasteRecord {
  id: string;
  wasteCode: string;
  locationId: string;
  location: { id: string; name: string; type: string };
  category: WasteCategory;
  reportedById?: string;
  approvedById?: string;
  approvedAt?: string;
  totalValue: number;
  notes?: string;
  witnessName?: string;
  disposalMethod?: string;
  disposalDate?: string;
  attachments: string[];
  createdAt: string;
  updatedAt: string;
  items: WasteItem[];
  stockLogs?: StockLogEntry[];
}

export interface StockLogEntry {
  id: string;
  logCode: string;
  transactionType: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  unitCost: number;
  createdAt: string;
  inventoryItem?: { name: string };
  drug?: { name: string };
}

export interface LocationStockItem {
  id: string;
  name: string;
  itemCode?: string;
  genericName?: string;
  unit: string;
  unitCost: number;
  availableQty: number;
  batchNumber?: string;
  expiryDate?: string;
  stockId: string;
  type: ItemType;
}

export interface LocationStock {
  inventoryItems: LocationStockItem[];
  drugs: LocationStockItem[];
}

export interface WasteStats {
  totalRecords: number;
  pendingApproval: number;
  totalLossValue: number;
  monthlyLossValue: number;
  byCategory: Array<{
    category: WasteCategory;
    _count: number;
    _sum: { totalValue: number };
  }>;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export const WASTE_CATEGORY_META: Record<
  WasteCategory,
  { label: string; color: string; bg: string; icon: string }
> = {
  EXPIRED: {
    label: 'Expired',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    icon: '⏰',
  },
  DAMAGED: {
    label: 'Damaged',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: '💢',
  },
  CONTAMINATED: {
    label: 'Contaminated',
    color: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
    icon: '⚠️',
  },
  SPILLAGE: {
    label: 'Spillage',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: '💧',
  },
  BREAKAGE: {
    label: 'Breakage',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50 border-yellow-200',
    icon: '🔨',
  },
  OTHER: {
    label: 'Other',
    color: 'text-gray-700',
    bg: 'bg-gray-50 border-gray-200',
    icon: '📦',
  },
};
