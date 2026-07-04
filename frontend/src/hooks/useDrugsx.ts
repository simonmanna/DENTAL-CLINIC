// ─── Types ────────────────────────────────────────────────────────────────────

export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unit: string;
  uom?: string;
  unitPrice: number;
  sellPrice: number;
  stockQuantity: number;
  minStock: number;
  requiresPrescription: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DrugStockTransaction {
  id: string;
  drugId: string;
  type: StockTransactionType;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
  performedBy?: string;
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

export interface DrugCategory {
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
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export interface DrugFormData {
  name: string;
  genericName: string;
  category: string;
  form: string;
  strength: string;
  manufacturer: string;
  unit: string;
  unitPrice: number;
  sellPrice: number;
  minStock: number;
  requiresPrescription: boolean;
  isActive: boolean;
}

export const EMPTY_DRUG_FORM: DrugFormData = {
  name: '',
  genericName: '',
  category: '',
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
