// src/types/purchase.types.ts

export type PurchaseOrderStatus =
  | 'DRAFT' | 'SUBMITTED' | 'APPROVED'
  | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'CANCELLED';

export type PurchasePaymentTerms =
  | 'CASH_ON_DELIVERY' | 'NET_7' | 'NET_14' | 'NET_30' | 'NET_60' | 'CREDIT';

export type PurchasePaymentStatus =
  | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WRITTEN_OFF';

export type PurchasePaymentMethod =
  | 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'CREDIT_NOTE';

export type StockAdjustmentReason =
  | 'CYCLE_COUNT' | 'DAMAGED' | 'EXPIRED' | 'THEFT'
  | 'RETURNED_TO_SUPPLIER' | 'FOUND' | 'INITIAL_COUNT' | 'OTHER';

export type WasteCategory =
  | 'EXPIRED' | 'DAMAGED' | 'CONTAMINATED' | 'SPILLAGE' | 'BREAKAGE' | 'OTHER';

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Location {
  id: string;
  name: string;
  type: string;
}

export enum UnitOfMeasure {
  PIECES = 'PIECES',
  BOX = 'BOX',
  PACK = 'PACK',
  BOTTLE = 'BOTTLE',
  VIAL = 'VIAL',
  AMPULE = 'AMPULE',
  TABLET = 'TABLET',
  CAPSULE = 'CAPSULE',
  STRIP = 'STRIP',
  TUBE = 'TUBE',
  SYRINGE = 'SYRINGE',
  GLOVES_PAIR = 'GLOVES_PAIR',
  ROLL = 'ROLL',
  ML = 'ML',
  LITER = 'LITER',
  MG = 'MG',
  G = 'G',
  KG = 'KG',
  INCH = 'INCH',
  MM = 'MM',
  SET = 'SET',
  KIT = 'KIT',
}

export interface POItem {
  id: string;
  itemType: 'INVENTORY' | 'DRUG';
  inventoryItemId?: string;
  drugId?: string;
  itemName: string;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  taxPercent: number;
  discount: number;
  total: number;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier: Supplier;
  locationId: string;
  location: Location;
  status: PurchaseOrderStatus;
  paymentTerms: PurchasePaymentTerms;
  paymentStatus: PurchasePaymentStatus;
  orderType: 'INVENTORY' | 'DRUG';
  currency: string;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  shippingCost: number;
  total: number;
  amountPaid: number;
  balance: number;
  dueDate?: string;
  expectedDate?: string;
  notes?: string;
  internalNotes?: string;
  items: POItem[];
  payments?: PurchasePayment[];
  deliveries?: Delivery[];
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryItem {
  id: string;
  purchaseOrderItemId: string;
  itemType: string;
  itemName: string;
  unit: string;
  quantityDelivered: number;
  quantityAccepted: number;
  quantityRejected: number;
  unitCost: number;
  total: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface Delivery {
  id: string;
  deliveryCode: string;
  purchaseOrderId: string;
  locationId: string;
  location?: Location;
  status: string;
  deliveryDate: string;
  supplierRef?: string;
  invoiceNumber?: string;
  notes?: string;
  items: DeliveryItem[];
  createdAt: string;
}

export interface PurchasePayment {
  id: string;
  paymentCode: string;
  purchaseOrderId: string;
  amount: number;
  method: PurchasePaymentMethod;
  reference?: string;
  bankName?: string;
  chequeNumber?: string;
  paidAt: string;
  notes?: string;
}

export interface StockLog {
  id: string;
  logCode: string;
  itemType: 'INVENTORY' | 'DRUG';
  inventoryItem?: { id: string; name: string; unit: string };
  drug?: { id: string; name: string; unit: string };
  location: { id: string; name: string };
  transactionType: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  unitCost: number;
  batchNumber?: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface StockAdjustmentItem {
  id: string;
  itemType: 'INVENTORY' | 'DRUG';
  itemName: string;
  unit: string;
  quantitySystem: number;
  quantityActual: number;
  quantityDifference: number;
  unitCost: number;
  notes?: string;
}

export interface StockAdjustment {
  id: string;
  adjustmentCode: string;
  location: Location;
  reason: StockAdjustmentReason;
  notes?: string;
  status: string;
  items: StockAdjustmentItem[];
  createdAt: string;
}

export interface WasteItem {
  id: string;
  itemType: 'INVENTORY' | 'DRUG';
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface WasteRecord {
  id: string;
  wasteCode: string;
  location: Location;
  category: WasteCategory;
  totalValue: number;
  notes?: string;
  witnessName?: string;
  disposalMethod?: string;
  items: WasteItem[];
  createdAt: string;
}

export interface PurchaseDashboard {
  totalPOs: number;
  pendingPOs: number;
  totalPaid: number;
  totalOutstanding: number;
  recentPOs: PurchaseOrder[];
  lowStockItems: Array<{ id: string; name: string; quantity: number; minQuantity: number; unit: string }>;
  lowStockDrugs: Array<{ id: string; name: string; stockQuantity: number; minStock: number; unit: string }>;
}