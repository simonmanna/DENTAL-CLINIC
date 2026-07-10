// src/conditions/dto/batch-patient-condition.dto.ts
// Typed bodies for the two batch endpoints. These used to be inline object
// literals, which bypass the global ValidationPipe entirely (class-validator
// only runs on real DTO classes) — the service's manual re-validation was the
// only guard. Nested @ValidateNested/@Type restores pipe-level validation.
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreatePatientConditionDto } from './create-patient-condition.dto';
import { UpdatePatientConditionDto } from './update-patient-condition.dto';

export class BatchChartEntryDto {
  @IsNumber()
  toothNumber: number;

  @IsArray()
  @IsString({ each: true })
  surfaces: string[];

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  conditionCode?: string;

  @IsOptional()
  @IsString()
  conditionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  visitId?: string;
}

export class CreatePatientConditionsBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePatientConditionDto)
  entries: CreatePatientConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchChartEntryDto)
  chartEntries?: BatchChartEntryDto[];
}

export class UpdatePatientConditionsBatchDto {
  @IsString()
  patientConditionId: string;

  @ValidateNested()
  @Type(() => UpdatePatientConditionDto)
  update: UpdatePatientConditionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchChartEntryDto)
  chartEntries: BatchChartEntryDto[];
}
