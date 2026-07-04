export type StockTransferStatus = 'DRAFT' | 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
export type DistributionStrategy = 'FEFO' | 'FIFO' | 'MANUAL';

export interface StockTransferItem {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unit: string;
  uom: string;
  quantityRequested: number;
  quantityTransferred: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  distributionStrategy?: DistributionStrategy | null;
  unitCost: number;
  notes?: string | null;
  // For UI
  batchTracking?: boolean;
  availableBatches?: BatchInfo[];
}

export interface BatchInfo {
  id: string;
  batchNumber: string | null;
  quantity: number;
  expiryDate?: string | null;
  receivedAt?: string | null;
}

export interface StockTransfer {
  id: string;
  transferCode: string;
  fromLocationId: string;
  fromLocation: { id: string; name: string; type: string };
  toLocationId: string;
  toLocation: { id: string; name: string; type: string };
  status: StockTransferStatus;
  transferDate: string;
  completedAt?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  performedById?: string | null;
  createdAt: string;
  updatedAt: string;
  items: StockTransferItem[];
  ledgerEntries?: any[];
  _count?: { items: number };
}

export interface CreateTransferPayload {
  fromLocationId: string;
  toLocationId: string;
  transferDate?: string;
  notes?: string;
  internalNotes?: string;
  items: {
    inventoryItemId: string;
    itemName: string;
    unit: string;
    uom: string;
    quantityRequested: number;
    quantityTransferred?: number;
    batchNumber?: string;
    expiryDate?: string;
    distributionStrategy?: DistributionStrategy;
    unitCost?: number;
    notes?: string;
  }[];
}

export const STATUS_LABELS: Record<StockTransferStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  IN_TRANSIT: 'In Transit',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_COLORS: Record<StockTransferStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-100 text-amber-700',
  IN_TRANSIT: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};