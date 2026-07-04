// src/types/stock-log.ts (or wherever StockLog is defined)

export interface StockLogItem {
  id: string;
  name: string;
  itemCode: string;
  uom: string;
  // Add other fields your API returns:
  description?: string;
  category?: string;
}

export interface StockLog {
  id: string;
  ledgerCode: string;  // ← was: logCode
  
  // Item reference
  itemId: string;
  itemType: "INVENTORY" | "DRUG";
  inventoryItem?: {
    id: string;
    name: string;
    itemCode?: string;
    unit?: string;
    uom?: string;
  };
  drug?: {
    id: string;
    name: string;
    genericName?: string;
    strength?: string;
    form?: string;
    unit?: string;
    uom?: string;
  };
  
  // Location
  locationId: string;
  location: {
    id: string;
    name: string;
    type: string;
  };
  
  // Batch (optional)
  batchId?: string;
  batch?: {
    id: string;
    batchNumber?: string;
    expiryDate?: string;
  };
  
  // ✅ FIXED: Use 'type' instead of 'transactionType'
  type: string;  // StockLedgerType enum value
  
  // Stock levels
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  
  // Financials
  unitCost: number;
  totalValue: number;
  
  // Reference
  referenceType?: string;
  referenceId?: string;
  
  // Metadata
  notes?: string;
  performedById?: string;
  performedBy?: {
    id: string;
    email: string;
    role?: string;
  };

  item?: StockLogItem;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface StockLogResponse {
  data: StockLog[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}