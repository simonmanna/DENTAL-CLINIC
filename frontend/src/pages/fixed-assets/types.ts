// src/pages/fixed-assets/types.ts

export type AssetStatus = 'ACTIVE' | 'IDLE' | 'UNDER_MAINTENANCE' | 'DISPOSED' | 'LOST' | 'LEASED';
export type AssetCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'SCRAP';
export type AssetCategory =
  | 'DENTAL_EQUIPMENT' | 'IMAGING_EQUIPMENT' | 'STERILIZATION'
  | 'LABORATORY' | 'OFFICE_EQUIPMENT' | 'FURNITURE'
  | 'VEHICLES' | 'BUILDING' | 'IT_INFRASTRUCTURE'
  | 'MEDICAL_INSTRUMENTS' | 'OTHER';
export type DepreciationMethod = 'STRAIGHT_LINE' | 'DECLINING_BALANCE' | 'NONE';
export type MaintenanceType = 'PREVENTIVE' | 'CORRECTIVE' | 'CALIBRATION' | 'INSPECTION' | 'OTHER';
export type MaintenanceStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';
export type DisposalMethod = 'SOLD' | 'SCRAPPED' | 'DONATED' | 'WRITTEN_OFF' | 'RETURNED_TO_SUPPLIER' | 'STOLEN_LOST';

export interface FixedAsset {
  id: string;
  assetCode: string;
  name: string;
  description?: string;
  category: AssetCategory;
  status: AssetStatus;
  condition: AssetCondition;
  purchaseDate: string;
  purchaseCost: string;
  currency: string;
  invoiceNumber?: string;
  warrantyExpiry?: string;
  serialNumber?: string;
  modelNumber?: string;
  manufacturer?: string;
  locationId?: string;
  assignedToStaffId?: string;
  depreciationMethod: DepreciationMethod;
  usefulLifeYears?: number;
  salvageValue?: string;
  depreciationRate?: string;
  isDepreciable: boolean;
  currentBookValue: string;
  accumulatedDepreciation: string;
  lastDepreciationDate?: string;
  disposedAt?: string;
  disposalMethod?: DisposalMethod;
  disposalValue?: string;
  disposalNotes?: string;
  notes?: string;
  tags: string[];
  attachments: string[];
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string };
  location?: { id: string; name: string; type: string };
  assignedToStaff?: { id: string; firstName: string; lastName: string };
  maintenanceRecords?: AssetMaintenance[];
}

export interface AssetMaintenance {
  id: string;
  maintenanceCode: string;
  assetId: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  title: string;
  description?: string;
  scheduledDate: string;
  completedDate?: string;
  nextDueDate?: string;
  estimatedCost?: string;
  actualCost?: string;
  serviceProvider?: string;
  technicianName?: string;
  conditionAfter?: AssetCondition;
  findings?: string;
  partsReplaced?: string;
  createdAt: string;
}

export interface AssetSummary {
  counts: { total: number; active: number; underMaintenance: number; disposed: number; idle: number };
  financials: {
    totalCost: string;
    totalBookValue: string;
    totalDepreciation: string;
    depreciationPercent: string;
  };
  alerts: { warrantyExpiring: number; maintenanceDue: number };
  byCategory: Array<{ category: string; count: number; bookValue: string }>;
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  DENTAL_EQUIPMENT: 'Dental Equipment',
  IMAGING_EQUIPMENT: 'Imaging Equipment',
  STERILIZATION: 'Sterilization',
  LABORATORY: 'Laboratory',
  OFFICE_EQUIPMENT: 'Office Equipment',
  FURNITURE: 'Furniture',
  VEHICLES: 'Vehicles',
  BUILDING: 'Building',
  IT_INFRASTRUCTURE: 'IT Infrastructure',
  MEDICAL_INSTRUMENTS: 'Medical Instruments',
  OTHER: 'Other',
};

export const STATUS_CONFIG: Record<AssetStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:            { label: 'Active',            color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  IDLE:              { label: 'Idle',              color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200' },
  UNDER_MAINTENANCE: { label: 'Maintenance',       color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  DISPOSED:          { label: 'Disposed',          color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  LOST:              { label: 'Lost',              color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  LEASED:            { label: 'Leased',            color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
};

export const CONDITION_CONFIG: Record<AssetCondition, { label: string; color: string }> = {
  EXCELLENT: { label: 'Excellent', color: 'text-emerald-600' },
  GOOD:      { label: 'Good',     color: 'text-green-600' },
  FAIR:      { label: 'Fair',     color: 'text-amber-600' },
  POOR:      { label: 'Poor',     color: 'text-orange-600' },
  SCRAP:     { label: 'Scrap',    color: 'text-red-600' },
};
