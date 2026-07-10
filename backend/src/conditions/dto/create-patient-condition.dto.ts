// src/conditions/dto/create-patient-condition.dto.ts
import {
  IsUUID,
  IsOptional,
  IsNumber,
  IsArray,
  IsString,
  IsEnum,
  IsDate
} from 'class-validator';
import { ConditionSeverity, PatientConditionStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreatePatientConditionDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsString()
  conditionId: string;

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
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosedBy?: string;       // free-text fallback (keep for backward compat)

  @IsOptional()
  @IsString()
  providerId?: string;        // ← NEW: staff FK

  @IsOptional()
  @IsEnum(PatientConditionStatus)
  status?: PatientConditionStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  diagnosedAt?: Date;
}