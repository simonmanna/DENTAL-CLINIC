// src/types/procedures.ts

export type TreatmentStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export type PricingModel = 'FIXED' | 'PER_TOOTH' | 'PER_ARCH' | 'PER_SESSION' | 'PER_BRACKET' | 'PER_UNIT';
export type BillingUnit = 'TOOTH' | 'ARCH' | 'SESSION' | 'BRACKET' | 'UNIT';

export interface ProcedureInventoryInput {
  id: string;
  inventoryItemId: string;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    category: string;
    unitCost: number;
  };
  locationId?: string;
  location?: {
    id: string;
    name: string;
    type: string;
  };
  quantityUsed: number;
  unitCost: number;
  lineCost: number; // quantityUsed * unitCost
  isOptional: boolean;
  notes?: string;
}

export interface Procedure {
  id: string;
  code?: string;
  name: string;
  category: string; // flattened category name
  categoryId?: string;
  description?: string;
  baseCost: number; // internal cost
  basePrice: number; // selling price
  defaultDuration: number;
  requiresXray: boolean;
  isActive: boolean;
  pricingModel: PricingModel;
  billingUnit?: BillingUnit;
  currency: string;
  priceRangeMin?: number;
  priceRangeMax?: number;
  /** GL revenue account override (LedgerAccount.id). Falls back to category → default. */
  revenueAccountId?: string | null;
  inputs: ProcedureInventoryInput[];
  inputsCost: number; // computed from inputs
  margin: number; // basePrice - inputsCost
  marginPercent: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TreatmentProcedure {
  id: string;
  procedureId: string;
  procedure: Procedure;
  toothNumbers: number[];
  cost: number; // selling price for this procedure in the plan
  sequence: number;
  status: TreatmentStatus;
  scheduledDate?: string;
  notes?: string;
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  title: string;
  description?: string;
  diagnosis?: string;
  priority: string; // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  notes?: string;
  consentSigned: boolean;
  status: TreatmentStatus;
  progress: number; // percentage
  completedCount: number;
  estimatedCost: number; // sum of procedure.cost
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
  };
  dentist: {
    id: string;
    firstName: string;
    lastName: string;
    staffCode: string;
  };
  procedures: TreatmentProcedure[];
  createdAt?: string;
  updatedAt?: string;
}