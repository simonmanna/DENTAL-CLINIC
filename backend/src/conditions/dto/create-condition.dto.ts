// src/modules/conditions/dto/create-condition.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsArray,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ConditionCategory,
  ConditionCodingSystem,
  ConditionSeverity,
  PatientConditionStatus,
} from '@prisma/client';

export class CreateConditionDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  snodentCode?: string;

  @IsOptional()
  @IsString()
  snomedCtCode?: string;

  @IsOptional()
  @IsString()
  icd10Code?: string;

  @IsOptional()
  @IsString()
  icd10Term?: string;

  @IsOptional()
  @IsEnum(ConditionCodingSystem)
  codingSystem?: ConditionCodingSystem;

  @IsEnum(ConditionCategory)
  category: ConditionCategory;

  @IsOptional()
  @IsString()
  affectedArea?: string;

  @IsOptional()
  @IsBoolean()
  isToothSpecific?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresSurface?: boolean;

  @IsOptional()
  @IsEnum(ConditionSeverity)
  defaultSeverity?: ConditionSeverity;

  @IsOptional()
  @IsBoolean()
  isFavourite?: boolean;
}

