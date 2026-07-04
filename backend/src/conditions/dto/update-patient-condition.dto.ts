// src/conditions/dto/update-patient-condition.dto.ts
import {
  IsOptional,
  IsUUID,
  IsNumber,
  IsArray,
  IsString,
  IsEnum
} from 'class-validator';
import { ConditionSeverity, PatientConditionStatus } from '@prisma/client';

export class UpdatePatientConditionDto {
  @IsOptional()
  @IsString()
  conditionId?: string;

  @IsOptional()
  @IsNumber()
  toothNumber?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  surfaces?: string[];

  @IsOptional()
  @IsEnum(ConditionSeverity)
  severity?: ConditionSeverity;

  @IsOptional()
  @IsEnum(PatientConditionStatus)
  status?: PatientConditionStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosedBy?: string;       // free-text fallback

  @IsOptional()
  @IsString()
  providerId?: string;        // ← NEW: staff FK

  @IsOptional()
  @IsUUID()
  visitId?: string;

  @IsOptional()
  diagnosedAt?: Date | string;

  // Required by the service when the edit changes a substantive clinical
  // field (conditionId, tooth, surfaces, severity, provider, diagnosedAt,
  // notes). Pure status flips don't need it.
  @IsOptional()
  @IsString()
  editReason?: string;

  // OL-1: optimistic-lock token. If supplied, the service updates with
  // `where: { id, version: expectedVersion }` and bumps the row's version.
  // A count=0 result raises 409 with the current version so the client can
  // re-fetch, re-merge, and re-submit. Omitting the field preserves the
  // legacy "last-write-wins" behaviour (NOT recommended for clinical edits).
  @IsOptional()
  @IsNumber()
  expectedVersion?: number;
}