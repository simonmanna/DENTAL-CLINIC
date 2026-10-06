// src/treatment-plans/dto/edit-session.dto.ts
import {
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  ValidateNested,
  IsEnum,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ToothSurface } from '@prisma/client';

export class EditToothStatusDto {
  @IsInt()
  toothNumber: number;

  @IsOptional()
  @IsString()
  chartEntryId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: string[];

  @IsString()
  status: string; // PENDING | IN_PROGRESS | COMPLETED | SKIPPED

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EditSessionDto {
  // ── Existing fields ───────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: string[]; // new desired surface list

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  // No editedById: the audit actor is the authenticated user (JWT), passed by
  // the controller. A body field let any client attribute the edit to anyone.

  // ── Newly-editable fields on an executed session ──────────────────────
  @IsOptional()
  @IsISO8601()
  performedDate?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsString()
  outcome?: string; // 'PARTIAL' | 'COMPLETED'

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditToothStatusDto)
  toothStatuses?: EditToothStatusDto[];

  // ── (H2) Optimistic-lock token — reject a stale edit from a 2nd clinician ──
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class DeleteSessionDto {
  @IsString()
  reason: string; // required — why deleting

  // No deletedById: the actor comes from the JWT (see EditSessionDto).

  // ── (H2) Optimistic-lock token ────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

// Backwards-compat alias (kept so any stale imports still compile).
export { DeleteSessionDto as VoidSessionDto };
