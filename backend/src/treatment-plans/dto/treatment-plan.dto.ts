// FILE: src/treatment-plans/dto/treatment-plan.dto.ts

import {
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
  IsEnum,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ArrayMinSize,
  IsObject,
  IsInt,
  IsIn,
} from 'class-validator';
import {
  TreatmentStatus,
  ToothSurface,
  SessionStatus,
  BillingType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTreatmentPlanDto {
  @IsString()
  patientId: string;

  @IsString()
  dentistId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsEnum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  consentSigned?: boolean;

  @IsOptional()
  @IsDateString()
  consentDate?: string;

  @IsOptional()
  @IsEnum([
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'ON_HOLD',
    'CANCELLED',
    'REFERRED',
  ])
  status?: string;
}

export class UpdateTreatmentPlanDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;

  @IsOptional()
  @IsEnum([
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'ON_HOLD',
    'CANCELLED',
    'REFERRED',
  ])
  status?: string;

  @IsOptional()
  @IsEnum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  consentSigned?: boolean;

  @IsOptional()
  @IsDateString()
  consentDate?: string;
}

export class AddTreatmentProcedureDto {
  @IsString() procedureId: string;

  @IsNumber({}, { each: true })
  @ArrayMinSize(1, { message: 'At least one tooth number is required' })
  toothNumbers: number[];

  @IsString({ each: true }) surfaces: ToothSurface[];

  // 💰 Pricing (required: final price patient pays)
  @IsNumber() totalPrice: number; // ← renamed from "cost"

  // Optional pricing breakdown (for audit/override tracking)
  @IsOptional() @IsNumber() pricePerUnit?: number;
  @IsOptional() @IsInt() quantity?: number;
  @IsOptional() @IsNumber() subtotalPrice?: number;
  @IsOptional() @IsNumber() discountAmount?: number;
  @IsOptional() @IsNumber() taxAmount?: number;

  // Internal cost (backend-calculated, frontend should not override)
  @IsOptional() @IsNumber() subtotalCost?: number;
  @IsOptional() @IsNumber() costPerUnit?: number;

  // Multi-currency
  @IsIn(['USD', 'UGX'], {
    message: 'currency must be one of: USD, UGX',
  })
  currency: string;
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsOptional() @IsNumber() baseAmount?: number;

  // Override flag
  @IsOptional() @IsBoolean() isPriceOverridden?: boolean;

  // @IsOptional()
  // @IsArray()
  // @IsNumber({}, { each: true })
  // toothNumbers?: number[];

  // @IsOptional()
  // @IsArray()
  // @IsEnum(ToothSurface, { each: true })
  // surfaces?: ToothSurface[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  visitGroup?: number;

  @IsOptional()
  @IsEnum(['SINGLE', 'MULTI'])
  sessionType?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  sessionCount?: number;

  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  @IsOptional()
  @IsBoolean()
  autoCreateLedger?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityBasis?: number; // Override auto-calculated quantity

  // @IsOptional()
  // @IsNumber()
  // @Min(0)
  // exchangeRate?: number;

  @IsOptional()
  @IsString()
  visitId?: string;

  // ── NEW: optional condition links ──────────────────────────────────────
  @ApiPropertyOptional({
    description: 'PatientCondition IDs to link to this procedure',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedConditionIds?: string[];

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  /**
   * Suggested partial payment amount — as entered by the doctor.
   *
   * Spec wording: the deposit is "registered in the draft invoice as
   * initialCurrency & initialReceipt". The schema/JSON field names use
   * the more verbose `initialPaymentAmount` (a.k.a. spec's
   * `initialReceipt`) and `initialPaymentCurrency` (a.k.a. spec's
   * `initialCurrency`). The amount is kept in the deposit currency —
   * NOT converted to the invoice currency.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialPaymentAmount?: number;

  /**
   * Currency the patient agreed to pay the deposit in (e.g. "USD" or
   * "UGX"). Spec wording: `initialCurrency`.
   */
  @IsOptional()
  @IsString()
  initialPaymentCurrency?: string;
}

export class ReorderProceduresDto {
  @IsArray()
  @ArrayMinSize(1)
  procedures: {
    id: string;
    sequence: number;
    visitGroup: number;
  }[];
}

export class CreateSessionDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  visitGroup?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  sessionNumber?: number;

  @IsOptional()
  @IsString()
  sessionLabel?: string;

  @IsOptional()
  @IsEnum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED'])
  status?: SessionStatus;

  @IsOptional()
  @IsDateString()
  performedDate?: string;

  @IsOptional()
  @IsString()
  performedNotes?: string;

  @IsOptional()
  @IsArray()
  actualInputsUsed?: any[];

  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: ToothSurface[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  sessionPrice?: number;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;
}

export class UpdateSessionDto {
  // COMPLETED is deliberately absent — completion goes through the
  // execute-session flow so chart entries and condition resolution stay in
  // sync with the session status.
  @IsOptional()
  @IsEnum(['PENDING', 'IN_PROGRESS', 'SKIPPED', 'CANCELLED'])
  status?: SessionStatus;

  @IsOptional()
  @IsDateString()
  performedDate?: string;

  @IsOptional()
  @IsString()
  performedNotes?: string;

  @IsOptional()
  @IsArray()
  actualInputsUsed?: any[];

  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: ToothSurface[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  sessionPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  visitGroup?: number;
}
