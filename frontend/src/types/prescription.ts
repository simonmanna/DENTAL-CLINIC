// src/types/prescription.ts
// ✅ Frontend-safe types - NO @prisma/client imports!

// ─── Runtime enum object (available in browser) ─────────────────────────────
export const PRESCRIPTION_STATUS = {
  ACTIVE: 'ACTIVE',
  DISPENSED: 'DISPENSED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

// ─── TypeScript type (erased at runtime, but needed for compilation) ───────
// ✅ DO NOT COMMENT THIS OUT:
export type PrescriptionStatus = keyof typeof PRESCRIPTION_STATUS;

// ─── Runtime utilities ─────────────────────────────────────────────────────
export const PRESCRIPTION_STATUS_VALUES = Object.values(PRESCRIPTION_STATUS);

export function toPrescriptionStatus(value: string): PrescriptionStatus | null {
  return PRESCRIPTION_STATUS_VALUES.includes(value as PrescriptionStatus)
    ? (value as PrescriptionStatus)
    : null;
}

export function isPrescriptionStatus(value: string): value is PrescriptionStatus {
  return PRESCRIPTION_STATUS_VALUES.includes(value as PrescriptionStatus);
}

// ─── Data interfaces ───────────────────────────────────────────────────────
export interface Drug {
  id: string;
  name: string;
  genericName?: string;
  strength?: string;
  form?: string;
}

export interface PrescriptionItem {
  id: string;
  drugId: string;
  drug: Drug;
  dosage?: string;
  frequency?: string;
  duration?: string;
  route?: string;
  quantity: number;
  instructions?: string;
  refills?: number;
  createdAt: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  dateOfBirth?: string;
  previousCardNumber?: string;
}

export interface Dentist {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Visit {
  id: string;
  visitCode: string;
  status: string;
}

export interface Prescription {
  id: string;
  prescriptionCode: string;
  visitId: string;
  patientId: string;
  dentistId: string;
  status: PrescriptionStatus; // ✅ Now this type is defined!
  notes?: string;
  validUntil?: string;
  dispensedAt?: string;
  dispensedBy?: string;
  createdAt: string;
  updatedAt: string;
  patient: Patient;
  dentist: Dentist;
  visit: Visit;
  items: PrescriptionItem[];
}

export interface PrescriptionListResponse {
  data: Prescription[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PrescriptionFilters {
  status?: PrescriptionStatus;
  patientId?: string;
  visitId?: string;
  dentistId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'prescriptionCode' | 'status' | 'validUntil' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}