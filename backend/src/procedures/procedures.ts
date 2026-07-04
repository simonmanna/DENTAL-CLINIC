// src/types/procedures.ts

export type ToothSurface = 'MESIAL' | 'DISTAL' | 'OCCLUSAL' | 'BUCCAL' | 'LINGUAL' | 'LABIAL' | 'INCISAL' | 'PALATAL';
export type TreatmentStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';

export interface Location {
  id: string;
  name: string;
  type: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  category: string;
  unitCost: number;
  quantity?: number;
}

export interface ProcedureInventoryInput {
  id: string;
  inventoryItemId: string;
  inventoryItem: InventoryItem;
  locationId?: string;
  location?: Location;
  quantityUsed: number;
  unitCost: number;
  lineCost: number;
  isOptional: boolean;
  notes?: string;
}

export interface Procedure {
  id: string;
  code?: string;
  name: string;
  category: string;
  description?: string;
  defaultCost: number;
  defaultDuration: number;
  requiresXray: boolean;
  isActive: boolean;
  inputs: ProcedureInventoryInput[];
  inputsCost: number;
  margin: number;
  _count?: { visitProcedures: number; treatmentProcedures: number };
}

export interface ProcedureCostBreakdown {
  procedure: { id: string; name: string; category: string };
  sellingPrice: number;
  inputs: ProcedureInventoryInput[];
  inputsCost: number;
  margin: number;
  marginPercent: number;
}

export interface TreatmentProcedure {
  id: string;
  procedureId: string;
  procedure: Pick<Procedure, 'id' | 'name' | 'code' | 'category' | 'defaultCost'> & {
    inputs?: ProcedureInventoryInput[];
  };
  toothNumbers: number[];
  status: TreatmentStatus;
  sequence: number;
  scheduledDate?: string;
  completedAt?: string;
  cost: number;
  notes?: string;
}

export interface TreatmentPlan {
  id: string;
  planCode: string;
  patientId: string;
  patient: { id: string; firstName: string; lastName: string; patientCode: string; phone?: string };
  dentistId: string;
  dentist: { id: string; firstName: string; lastName: string; staffCode: string };
  title: string;
  description?: string;
  diagnosis?: string;
  status: TreatmentStatus;
  priority: string;
  estimatedCost: number;
  actualCost: number;
  startDate?: string;
  endDate?: string;
  completedAt?: string;
  consentSigned: boolean;
  consentDate?: string;
  notes?: string;
  procedures: TreatmentProcedure[];
  completedCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface VisitInventoryUsage {
  id: string;
  inventoryItemId: string;
  inventoryItem: Pick<InventoryItem, 'id' | 'name' | 'unit'>;
  locationId: string;
  location: Location;
  quantityUsed: number;
  unitCost: number;
  totalCost: number;
  batchNumber?: string;
  notes?: string;
}

export interface VisitProcedure {
  id: string;
  visitId: string;
  procedureId: string;
  procedure: Pick<Procedure, 'id' | 'name' | 'code' | 'category' | 'defaultCost'>;
  toothNumbers: number[];
  surfaces: ToothSurface[];
  notes?: string;
  cost: number;
  performedAt: string;
  inventoryUsages: VisitInventoryUsage[];
}

export interface VisitProcedureSummary {
  procedures: VisitProcedure[];
  summary: {
    procedureCount: number;
    procedureCost: number;
    inventoryCost: number;
    totalCost: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

// Form types
export interface ProcedureInputForm {
  inventoryItemId: string;
  locationId?: string;
  quantityUsed: number;
  unitCost: number;
  notes?: string;
  isOptional: boolean;
}

export interface CreateProcedureForm {
  code?: string;
  name: string;
  category: string;
  description?: string;
  defaultCost: number;
  defaultDuration: number;
  requiresXray: boolean;
  isActive: boolean;
  inputs: ProcedureInputForm[];
}

export interface TreatmentProcedureForm {
  procedureId: string;
  toothNumbers: number[];
  cost: number;
  sequence: number;
  scheduledDate?: string;
  notes?: string;
}

export interface CreateTreatmentPlanForm {
  patientId: string;
  dentistId: string;
  title: string;
  description?: string;
  diagnosis?: string;
  priority: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  consentSigned: boolean;
  procedures: TreatmentProcedureForm[];
}
