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
} from 'class-validator';
import { Type } from 'class-transformer';

export class EditToothStatusDto {
  @IsNumber()
  toothNumber: number;

  @IsOptional()
  @IsString()
  chartEntryId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
  @IsString({ each: true })
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

  @IsOptional()
  @IsString()
  editedById?: string;

  // ── Newly-editable fields on an executed session ──────────────────────
  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
  deletedById?: string;

  // ── (H2) Optimistic-lock token ────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

// Backwards-compat alias (kept so any stale imports still compile).
export { DeleteSessionDto as VoidSessionDto };
