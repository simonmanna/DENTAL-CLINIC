// src/treatment-plans/dto/update-treatment-procedure.dto.ts
// DTOs for EDIT procedure operations.
//
// Mirrors AddTreatmentProcedureDto where it makes sense so that what a user
// entered at add time can be edited later. The notable differences from add:
//   • `procedureId` is NOT editable (changing the procedure after planning
//     would silently re-anchor chart entries to a different clinical code).
//   • `status` cannot be set to CANCELLED here — use POST /cancel.
//   • `toothNumbers` is rejected (409) once sessions exist.

import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsEnum,
  IsDateString,
  IsObject,
  IsBoolean,
  IsInt,
  Min,
  Max,
  ArrayMinSize,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ToothSurface,
  TreatmentStatus,
  BillingType,
  SessionType,
} from '@prisma/client';

export class UpdateTreatmentProcedureDto {
  // ── Always editable — clinical notes / assignment ──────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sequence?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  visitGroup?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  // ── Editable only when NO sessions exist — full replacement ───────────────
  @ApiPropertyOptional({
    description:
      'Replace tooth assignment. Rejected (409) once any session exists.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  toothNumbers?: number[];

  // ── Surface edit — allowed with audit log + UI warning when sessions exist ─
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: ToothSurface[];

  // ── Status — CANCELLED/REFERRED must use POST /cancel. Routine status
  //     flips do NOT require editReason and are always audited. ──────────────
  @ApiPropertyOptional({
    description:
      'Routine status flip. Does NOT require editReason even with sessions.',
  })
  @IsOptional()
  @IsEnum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'])
  status?: TreatmentStatus;

  // ── Performed-at audit fields (always editable, but date-validated below) ─
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  performedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedNotes?: string;

  @ApiPropertyOptional({
    description: 'Snapshot of materials / inputs used at performance time.',
  })
  @IsOptional()
  @IsObject()
  actualInputsUsed?: Record<string, any>;

  // ── Pricing — mirrors AddTreatmentProcedureDto ────────────────────────────
  //     Edit only allowed when paymentStatus != PAID. The TP row and the
  //     linked InvoiceItem are updated atomically; if the invoice is POSTED
  //     with payments, the edit is rejected (409).
  @ApiPropertyOptional({ description: 'Final price the patient pays.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotalCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerUnit?: number;

  @ApiPropertyOptional({
    description: 'ISO 4217 currency code. Must be one of: USD, UGX.',
  })
  @IsOptional()
  @IsIn(['USD', 'UGX'], {
    message: 'currency must be one of: USD, UGX',
  })
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPriceOverridden?: boolean;

  @ApiPropertyOptional({
    description: 'Override auto-calculated quantity at pricing time.',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantityBasis?: number;

  // ── Session config — mirrors AddTreatmentProcedureDto ─────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sessionCount?: number;

  // ── Billing type — mirrors AddTreatmentProcedureDto ───────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  // ── Initial payment (deposit) — mirrors AddTreatmentProcedureDto ──────────
  @ApiPropertyOptional({
    description:
      'Suggested partial payment amount as entered by the doctor (in initialPaymentCurrency).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialPaymentAmount?: number;

  @ApiPropertyOptional({
    description:
      'Currency the patient agreed to pay the deposit in (e.g. USD or UGX).',
  })
  @IsOptional()
  @IsString()
  initialPaymentCurrency?: string;

  // ── Condition links — replace-all semantics (same as the separate endpoint)
  @ApiPropertyOptional({
    description:
      'Replace the set of PatientCondition IDs linked to this procedure. ' +
      'Empty array removes all links. Omitted = no change.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedConditionIds?: string[];

  // ── Clinical-audit reason (required for substantive edits with sessions) ─
  @ApiPropertyOptional({
    description:
      'Required when a substantive clinical field (tooth/surfaces/sequence/visitGroup/scheduledDate/provider/price/billingType/sessionType) is edited and sessions exist.',
  })
  @IsOptional()
  @IsString()
  editReason?: string;

  @ApiPropertyOptional({
    description:
      'User id of the editor (for audit). Body value is overwritten by the JWT actor.',
  })
  @IsOptional()
  @IsString()
  editedById?: string;

  // ── (H2) Optimistic-lock token ────────────────────────────────────────────
  @ApiPropertyOptional({
    description:
      'Version of the procedure the client last read. If supplied and it no ' +
      'longer matches, the edit is rejected (409) to prevent a lost update.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

// ─── Cancel DTO ───────────────────────────────────────────────────────────────

export class CancelProcedureDto {
  @ApiPropertyOptional({
    description: 'Human-readable reason for cancellation.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─── Delete validation response (returned by canDelete endpoint) ──────────────

export interface ProcedureDeleteEligibility {
  canDelete: boolean;
  canCancel: boolean;
  reason?: string;
  sessionsCount: number;
  paymentStatus: string;
  status: string;
}
