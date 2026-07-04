// Re-export or define your types here for centralized type management

import type {
  ToothSurface,
  SessionType,
  BillingType,
} from '@/types/dental';

export type PricingUnit   = 'FIXED' | 'PER_TOOTH' | 'PER_ARCH' | 'PER_BRACKET' | 'PER_UNIT';
export type LedgerStatus  = 'PENDING' | 'INVOICED' | 'VOID';

// ✅ SKIPPED added — matches Prisma SessionStatus + treatment tab usage
export type TxStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ON_HOLD"
  | "PENDING"
  | "CANCELLED"
  | "SKIPPED";


export interface SurfaceDef {
  value: ToothSurface;
  label: string;
  short: string;
  desc: string;
  anteriorOnly?: boolean;
  posteriorOnly?: boolean;
}

// src/types/treatment-plans.ts

// ✅ Update ProcedureCatalogItem to include all expected fields:

export interface ProcedureCatalogItem {
  id: string;
  code?: string;
  name: string;
  // category is an object from the joined relation, not a bare string
  category: string | { id: string; name: string; color?: string };

  description?: string;

  baseCost: number;    // internal cost — Procedure.baseCost
  basePrice: number;   // selling price — Procedure.basePrice  ← renamed from defaultCost
  unitPrice?: number;

  pricingModel?: PricingUnit;
  currency?: string;

  defaultDuration?: number;
  requiresXray?: boolean;
  isActive: boolean;
  minPrice?: number;  // priceRangeMin
  maxPrice?: number;  // priceRangeMax
  billingUnit?: string;
  inputs?: InventoryInput[];
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  category: string;
}

export interface InventoryInput {
  id: string;
  inventoryItemId: string;
  quantityUsed: number;
  unitCost: number;
  isOptional: boolean;
  performedNotes?: string;
  inventoryItem: InventoryItem;
}


// export interface ProcedureCatalogItem {
//   id: string;
//   code?: string;
//   name: string;
//   category: string;
//   description?: string;
  
//   // ✅ Add missing pricing fields:
//   baseCost: number;
//   basePrice: number;
//   pricingModel?: PricingUnit;  // Use the union type, not string
//   currency?: "USD" | "UGX";    // Use union, not generic string
  
//   // ✅ Add other expected fields:
//   defaultDuration?: number;
//   requiresXray?: boolean;
//   isActive: boolean;
//   minPrice?: number;
//   maxPrice?: number;
//   billingUnit?: string;
//   inputs?: InventoryInput[];
  
//   // Keep existing:
//   // defaultCost: number;  // If backend uses this, keep it
//   // unitPrice: number;    // If backend uses this, keep it
// }

// export interface InventoryItem {
//   id: string;
//   name: string;
//   unit: string;
//   unitCost: number;
//   category: string;
// }

// export interface InventoryInput {
//   id: string;
//   inventoryItemId: string;
//   quantityUsed: number;
//   unitCost: number;
//   isOptional: boolean;
//   performedNotes?: string;
//   inventoryItem: InventoryItem;
// }

// export interface ActualInput {
//   inventoryItemId: string;
//   name: string;
//   unit: string;
//   quantityUsed: number;
//   unitCost: number;
// }

export interface ActualInput {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantityUsed: number;
  unitCost: number;
}

// ✅ ProcedureTarget — matches ProcedureTarget Prisma model
export interface ProcedureTarget {
  id: string;
  toothNumber: number | null;
  surfaces: ToothSurface[];
  unitIndex?: number | null;
}

export interface ProcedureSession {
  id: string;
  sessionNumber: number;
  sessionLabel?: string;
  status: TxStatus;
  performedDate?: string | null;
  performedNotes?: string | null;
  sessionPrice?: number | null;  // ✅ was sessionCost — now matches Prisma ProcedureSession.sessionPrice
  visitId?: string;
  visitGroup?: number;
  ledgerStatus?: LedgerStatus;
  ledgerEntry?: any;
  actualInputsUsed?: ActualInput[];
  surfaces?: ToothSurface[];
  completedDate?: string | null;
  targets?: ProcedureTarget[];   // ✅ added — normalised tooth targets per session
  isFinal?: boolean;
  phase?: string;
  outcome?: string;
}

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;

  // ── Pricing snapshot (from TreatmentProcedure DB columns) ─────────────
  totalPrice?: number;        // final selling price after discount/tax
  currency?: string;
  originalCurrency?: string;
  originalPrice?: number;
  pricePerUnit?: number;
  quantity?: number;
  pricingModel?: string;

  // ── Status & clinical ─────────────────────────────────────────────────
  status: TxStatus;
  performedNotes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  actualInputsUsed?: ActualInput[];

  // ── Session config ────────────────────────────────────────────────────
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  paymentStatus?: "PAID" | "PARTIALLY_PAID" | "OPEN" | "INVOICED";

  // ── Relations ─────────────────────────────────────────────────────────
  procedure: ProcedureCatalogItem;
  sessions?: ProcedureSession[];
  targets?: ProcedureTarget[];   // ✅ normalised tooth targets (replaces toothNumbers[])
}

export interface TreatmentPlanSummary {
  totalProcedures: number;
  plannedCount: number;
  inProgressCount: number;
  completedCount: number;
  totalCost: number;
  completedCost: number;
  remainingCost: number;
  inputsCost: number;
  completionPercent: number;
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  title: string;
  status: TxStatus;
  priority: string;
  diagnosis?: string;
  estimatedCost: number;
  actualCost: number;
  consentSigned: boolean;
  consentDate?: string;
  createdAt: string;
  dentist: { id: string; firstName: string; lastName: string };
  procedures: TreatmentProcedure[];
  summary: TreatmentPlanSummary;
}

// export interface ProcedureSession {
//   id: string;
//   sessionNumber: number;
//   sessionLabel?: string;
//   status: TxStatus | "PENDING" | "SKIPPED";
//   performedDate?: string | null;
//   performedNotes?: string | null;
//   sessionCost?: number;
//   visitId?: string;
//   visitGroup?: number;
//   ledgerStatus?: string;
//   ledgerEntry?: any;
//   actualInputsUsed?: ActualInput[];
//   surfaces?: ToothSurface[];
//   completedDate?: string | null;
// }


// export interface TreatmentProcedure {
//   id: string;
//   sequence: number;
//   visitGroup: number;
//   procedureId: string;
//   toothNumbers: number[];
//   surfaces: ToothSurface[];
//   status: TxStatus;
//   performedNotes?: string;
//   scheduledDate?: string;
//   completedAt?: string;
//   performedDate?: string;
//   actualInputsUsed?: ActualInput[];
//   sessionType?: SessionType;
//   billingType?: BillingType;
//   sessionCount?: number;
//   paymentStatus?: "PAID" | "PARTIAL" | "OPEN";
//   originalCurrency?: string;
//   originalPrice?: number;
//   currency?: string;
//   totalPrice?: number;
//   procedure: ProcedureCatalogItem;
//   sessions?: ProcedureSession[];
//   providerId?:string;
// }

// export interface TreatmentPlanSummary {
//   totalProcedures: number;
//   plannedCount: number;
//   inProgressCount: number;
//   completedCount: number;
//   totalCost: number;
//   completedCost: number;
//   remainingCost: number;
//   inputsCost: number;
//   completionPercent: number;
// }

// export interface TreatmentPlan {
//   id: string;
//   planCode: string;
//   title: string;
//   status: TxStatus;
//   priority: string;
//   diagnosis?: string;
//   estimatedCost: number;
//   actualCost: number;
//   consentSigned: boolean;
//   consentDate?: string;
//   createdAt: string;
//   dentist: { id: string; firstName: string; lastName: string };
//   procedures: TreatmentProcedure[];
//   summary: TreatmentPlanSummary;
// }

// export interface AddProcedurePayload {
//   procedureId: string;
//   toothNumbers: number[];
//   surfaces: ToothSurface[];
//   visitGroup: number;
//   sequence: number;
//   notes?: string;
//   sessionType?: SessionType;
//   sessionCount?: number;
//   billingType?: BillingType;
//   sessionVisitGroups?: Array<{ sessionNumber: number; visitGroup: number }>;
//   quantityBasis?: number;
//   exchangeRate?: number;
//   currency?: string;
//   providerId?:string;
//   visitId?:string;
// }

export interface TreatmentProcedure {
  id: string;
  sequence: number;
  visitGroup: number;
  procedureId: string;

  // ── Pricing snapshot (from TreatmentProcedure DB columns) ─────────────
  totalPrice?: number;        // final selling price after discount/tax
  currency?: string;
  originalCurrency?: string;
  originalPrice?: number;
  pricePerUnit?: number;
  quantity?: number;
  pricingModel?: string;

  // ── Status & clinical ─────────────────────────────────────────────────
  status: TxStatus;
  performedNotes?: string;
  scheduledDate?: string;
  completedAt?: string;
  performedDate?: string;
  actualInputsUsed?: ActualInput[];

  // ── Session config ────────────────────────────────────────────────────
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  paymentStatus?: "PAID" | "PARTIALLY_PAID" | "OPEN" | "INVOICED";

  // ── Relations ─────────────────────────────────────────────────────────
  procedure: ProcedureCatalogItem;
  sessions?: ProcedureSession[];
  targets?: ProcedureTarget[];   // ✅ normalised tooth targets (replaces toothNumbers[])
}

export interface TreatmentPlanSummary {
  totalProcedures: number;
  plannedCount: number;
  inProgressCount: number;
  completedCount: number;
  totalCost: number;
  completedCost: number;
  remainingCost: number;
  inputsCost: number;
  completionPercent: number;
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  title: string;
  status: TxStatus;
  priority: string;
  diagnosis?: string;
  estimatedCost: number;
  actualCost: number;
  consentSigned: boolean;
  consentDate?: string;
  createdAt: string;
  dentist: { id: string; firstName: string; lastName: string };
  procedures: TreatmentProcedure[];
  summary: TreatmentPlanSummary;
}

export interface AddProcedurePayload {
  procedureId: string;
  toothNumbers: number[];
  surfaces: ToothSurface[];
  
  // 💰 Pricing (what patient pays)
  totalPrice: number;           // Final amount patient pays (UGX)
  pricePerUnit?: number;        // Unit price (for display/audit)
  quantity?: number;            // Billing units (e.g., # of teeth)
  discountAmount?: number;      // Applied discount
  taxAmount?: number;           // Applied tax
  subtotalPrice?: number;       // pricePerUnit × quantity
  
  // 🏥 Internal cost (clinic expense - backend calculated, frontend read-only)
  subtotalCost?: number;        // For internal reporting only
  costPerUnit?: number;         // For internal reporting only
  
  // 🌍 Multi-currency
  currency: "USD" | "UGX";
  exchangeRate?: number;        // If USD procedure
  baseAmount?: number;          // totalPrice converted to base currency (UGX)
  
  // ⚙️ Billing config
  visitGroup: number;
  sequence: number;
  sessionType?: SessionType;
  billingType?: BillingType;
  sessionCount?: number;
  
  // 👥 Metadata
  providerId?: string;
  linkedConditionIds?: string[];
  visitId?: string;
  notes?: string;
  
  // 🔧 Manual override flag (backend will accept totalPrice override if this is true)
  isPriceOverridden?: boolean;

  /** Deposit amount as patient agreed to pay — stored in initialPaymentCurrency (NOT converted) */
  initialPaymentAmount?: number;
  /** Currency the patient agreed to pay the deposit in (e.g. "USD" or "UGX") */
  initialPaymentCurrency?: string;
}

// export interface AddProcedurePayload {
//   procedureId: string;
//   toothNumbers: number[];
//   surfaces: ToothSurface[];
//   visitGroup: number;
//   sequence: number;
//   notes?: string;
//   sessionType?: SessionType;
//   sessionCount?: number;
//   billingType?: BillingType;
//   sessionVisitGroups?: Array<{ sessionNumber: number; visitGroup: number }>;
//   quantityBasis?: number;
//   exchangeRate?: number;
//   currency?: string;
//   providerId?: string;
//   visitId?: string;
// }