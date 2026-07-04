// src/chart-entry/dto/chart-entry.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsDateString,
  ValidateNested,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ChartEntryType {
  CONDITION = 'CONDITION',
  EXISTING = 'EXISTING',
  PLANNED = 'PLANNED',
  COMPLETED = 'COMPLETED',
}

// ── FIX: synced with Prisma enum (was missing VOIDED + RESOLVED) ─────────────
export enum ChartEntryStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  RESOLVED = 'RESOLVED',
  VOIDED = 'VOIDED',
}

// ── FIX: canonical 9-value surface set — matches Prisma ToothSurface enum ─────
export const TOOTH_SURFACES = [
  'MESIAL',
  'DISTAL',
  'OCCLUSAL',
  'INCISAL',
  'BUCCAL',
  'LABIAL',
  'FACIAL',
  'LINGUAL',
  'PALATAL',
] as const;
export type ToothSurface = (typeof TOOTH_SURFACES)[number];

export type QuickAction =
  | 'ADD_CONDITION'
  | 'PLAN_TREATMENT'
  | 'PERFORM_NOW';

export class ActualInputDto {
  @IsString() inventoryItemId: string;
  @IsString() name: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) quantityUsed: number;
  @IsNumber() @Min(0) unitCost: number;
}

export class QuickActionDto {
  @IsString() patientId: string;
  @IsString() visitId: string;

  @IsInt()
  toothNumber: number; // validated as FDI in the service layer

  @IsArray()
  @IsOptional()
  @IsIn(TOOTH_SURFACES, { each: true })
  surfaces?: ToothSurface[];

  @IsEnum(['ADD_CONDITION', 'PLAN_TREATMENT', 'PERFORM_NOW'])
  action: QuickAction;

  @IsString() @IsOptional() providerId?: string;

  @IsString() @IsOptional() conditionLabel?: string;
  @IsString() @IsOptional() conditionCode?: string;

  @IsString() @IsOptional() procedureCatalogId?: string;
  @IsString() @IsOptional() procedureLabel?: string;
  @IsString() @IsOptional() procedureCode?: string;
  @IsNumber() @IsOptional() procedureCost?: number;
  @IsString() @IsOptional() notes?: string;
  @IsString() @IsOptional() planName?: string;

  @IsDateString() @IsOptional() diagnosedAt?: string;
  @IsDateString() @IsOptional() performedDate?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ActualInputDto)
  actualInputsUsed?: ActualInputDto[];

  @IsNumber() @IsOptional() sessionCost?: number;
}

export class CreateChartEntryDto {
  @IsString() patientId: string;
  @IsString() @IsOptional() visitId?: string;

  @IsInt() @IsOptional() toothNumber?: number;

  @IsArray()
  @IsOptional()
  @IsIn(TOOTH_SURFACES, { each: true })
  surfaces?: ToothSurface[];

  @IsEnum(ChartEntryType) type: ChartEntryType;
  @IsString() label: string;

  @IsString() @IsOptional() conditionCode?: string;
  @IsString() @IsOptional() procedureCode?: string;
  @IsString() @IsOptional() treatmentProcedureId?: string;
  @IsString() @IsOptional() procedureSessionId?: string;
  @IsString() @IsOptional() conditionId?: string;
  @IsString() @IsOptional() patientConditionId?: string;
  @IsString() @IsOptional() providerId?: string;
  @IsString() @IsOptional() notes?: string;
  @IsDateString() @IsOptional() diagnosedAt?: string;
}

export class UpdateChartEntryDto {
  @IsEnum(ChartEntryStatus) @IsOptional() status?: ChartEntryStatus;
  @IsString() @IsOptional() notes?: string;
  @IsString() @IsOptional() label?: string;
  @IsString() @IsOptional() providerId?: string;

  // M-2: optimistic-lock token. When supplied, the update is rejected with 409
  // if the row's current version differs (a concurrent edit landed first).
  // Omitted → legacy last-write-wins, so existing callers keep working.
  @IsInt() @IsOptional() expectedVersion?: number;
}

export class AddExistingProcedureDto {
  @IsString() patientId: string;
  @IsString() visitId: string;
  @IsInt() toothNumber: number;

  @IsArray()
  @IsOptional()
  @IsIn(TOOTH_SURFACES, { each: true })
  surfaces?: ToothSurface[];

  @IsString() procedureId: string;
  @IsString() procedureName: string;
  @IsString() procedureCode: string;
  @IsString() @IsOptional() providerId?: string;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateConditionDto {
  @IsString() @IsOptional() label?: string;

  @IsArray()
  @IsOptional()
  @IsIn(TOOTH_SURFACES, { each: true })
  surfaces?: ToothSurface[];

  @IsString() @IsOptional() notes?: string;
  @IsString() @IsOptional() providerId?: string;
  @IsString() @IsOptional() conditionId?: string;
  @IsString() @IsOptional() patientConditionId?: string;

  @IsEnum(['ACTIVE', 'MONITORED', 'RESOLVED', 'RULED_OUT'])
  @IsOptional()
  status?: string;

  @IsEnum(['MILD', 'MODERATE', 'SEVERE'])
  @IsOptional()
  severity?: string;

  @IsDateString() @IsOptional() diagnosedAt?: string;

  // M-2: optimistic-lock token for the underlying ChartEntry row. Omitted →
  // legacy last-write-wins (the PatientCondition.version lock still applies on
  // the linked-condition path).
  @IsInt() @IsOptional() expectedVersion?: number;
}

export interface ChartEntryResponse {
  id: string;
  patientId: string;
  visitId?: string;
  toothNumber?: number;
  surfaces: ToothSurface[];
  type: ChartEntryType;
  status: ChartEntryStatus;
  label: string;
  conditionCode?: string;
  procedureCode?: string;
  treatmentProcedureId?: string;
  procedureSessionId?: string;
  providerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuickActionResponse {
  chartEntry: ChartEntryResponse;
  treatmentPlan?: { id: string; title: string; wasCreated: boolean };
  treatmentProcedure?: { id: string; procedureName: string };
  procedureSession?: { id: string; sessionNumber: number };
}
