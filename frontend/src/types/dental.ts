// src/types/dental.ts
// SINGLE SOURCE OF TRUTH for dental enums.
// These MUST mirror the Prisma schema exactly. Do not redefine elsewhere.

export const TOOTH_SURFACES = [
  'FACIAL',
  'LINGUAL',
  'PALATAL',
  'MESIAL',
  'DISTAL',
  'OCCLUSAL',
  'INCISAL',
  'BUCCAL',
  'LABIAL',
] as const;

export type ToothSurface = (typeof TOOTH_SURFACES)[number];

export const TREATMENT_STATUSES = [
  'PENDING',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
] as const;

export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const SESSION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED',
  'VOIDED',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type SessionType = 'SINGLE' | 'MULTI';
export type BillingType = 'PAY_FULL' | 'PAY_PARTIALLY';

export type SessionLedgerStatus = 'PENDING' | 'INVOICED' | 'VOID';

export type PricingModel =
  | 'FIXED'
  | 'PER_TOOTH'
  | 'PER_ARCH'
  | 'PER_SESSION'
  | 'PER_BRACKET'
  | 'PER_UNIT';