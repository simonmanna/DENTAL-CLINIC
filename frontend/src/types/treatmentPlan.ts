// src/types/treatmentPlan.ts

export type PricingUnit   = 'FIXED' | 'PER_TOOTH' | 'PER_ARCH' | 'PER_BRACKET' | 'PER_UNIT';
export type SessionType   = 'SINGLE' | 'MULTI';
export type BillingType   = 'PAY_FULL' | 'PAY_PARTIALLY';
export type SessionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type LedgerStatus  = 'PENDING' | 'INVOICED' | 'VOID';
export type TxStatus      = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export type ToothSurface =
  | "FACIAL"
  | "LINGUAL"
  | "PALATAL"
  | "MESIAL"
  | "DISTAL"
  | "OCCLUSAL"
  | "INCISAL";

export interface InventoryInput {
  id: string;
  inventoryItemId: string;
  quantityUsed: number;
  unitCost: number;
  isOptional: boolean;
  inventoryItem: { id: string; name: string; unit: string; unitCost: number; category: string };
}

export interface ProcedureCatalogItem {
  id: string;
  code?: string;
  name?: string;
  category: string;
  description?: string;
  baseCost: number;
  basePrice: number;
  defaultDuration?: number;
  requiresXray?: boolean;
  isActive: boolean;
  currency?: string;
  minPrice?: number;
  maxPrice?: number;
  pricingModel?: string;
  billingUnit?: string;
  inputs?: InventoryInput[];
}

export interface LedgerEntryRef {
  id: string;
  entryCode: string;
  status: string;
  total: number;
}

export interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  visitGroup: number;
  status: SessionStatus;
  performedDate?: string | null;
  performedNotes?: string | null;
  sessionCost: number;
  sessionPrice?: number;
  actualInputsUsed?: any[];
  surfaces?: string[];
  ledgerStatus: LedgerStatus;
  ledgerEntry?: LedgerEntryRef | null;
}

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;
  toothNumbers: number[];
  surfaces: string[];
  cost: number;
  status: TxStatus;
  notes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  performedNotes?: string;
  actualInputsUsed?: any[];
  // Pricing snapshot
  pricingUnit?: PricingUnit;
  quantityBasis?: number;
  unitPrice?: number;
  currency?: string;
  exchangeRate?: number;
  // Sessions
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  sessions?: ProcedureSession[];
  providerId?:string;
  procedure: {
    id: string;
    code?: string;
    name: string;
    category: string;
    description?: string;
    baseCost: number;
    basePrice: number;
    pricingUnit?: PricingUnit;
    currency?: string;
    minPrice?: number;
    maxPrice?: number;
    inputs: InventoryInput[];
  };
 
}

export interface AddProcedurePayload {
  procedureId: string;
  toothNumbers: number[];
  surfaces: string[];
  cost: number;
  visitGroup: number;
  sequence: number;
  notes?: string;
  sessionType?: SessionType;
  sessionCount?: number;
  billingType?: BillingType;
  sessionVisitGroups?: Array<{ sessionNumber: number; visitGroup: number }>;
  quantityBasis?: number;
  exchangeRate?: number;
  currency?: string;
  providerId?:string;
  visitId?:string;
}

