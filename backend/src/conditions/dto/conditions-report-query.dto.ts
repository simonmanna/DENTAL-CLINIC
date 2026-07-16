import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum PatientConditionStatusEnum {
  ACTIVE = 'ACTIVE',
  MONITORED = 'MONITORED',
  IN_TREATMENT = 'IN_TREATMENT',
  RESOLVED = 'RESOLVED',
  RULED_OUT = 'RULED_OUT',
}

export enum ConditionCategoryEnum {
  CARIES = 'CARIES',
  PERIODONTAL = 'PERIODONTAL',
  PULPAL = 'PULPAL',
  PERIAPICAL = 'PERIAPICAL',
  FRACTURE = 'FRACTURE',
  EROSION_ATTRITION = 'EROSION_ATTRITION',
  DEVELOPMENTAL = 'DEVELOPMENTAL',
  NEOPLASTIC = 'NEOPLASTIC',
  TRAUMATIC = 'TRAUMATIC',
  RESTORATIVE = 'RESTORATIVE',
  OTHER = 'OTHER',
}

export enum ConditionSeverityEnum {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
}

export class ConditionsReportQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsEnum(PatientConditionStatusEnum)
  status?: PatientConditionStatusEnum;

  @IsOptional()
  @IsEnum(ConditionCategoryEnum)
  category?: ConditionCategoryEnum;

  @IsOptional()
  @IsEnum(ConditionSeverityEnum)
  severity?: ConditionSeverityEnum;

  @IsOptional()
  @IsString()
  dentistId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
