// src/visits/dto/report.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VisitStatus, PaymentStatus } from '@prisma/client';

export enum ReportType {
  SUMMARY = 'SUMMARY',
  FINANCIAL = 'FINANCIAL',
  CLINICAL = 'CLINICAL',
  PATIENT = 'PATIENT',
  DENTIST = 'DENTIST',
  PROCEDURE = 'PROCEDURE',
  DETAILED = 'DETAILED',
}

export enum ReportPeriod {
  TODAY = 'TODAY',
  YESTERDAY = 'YESTERDAY',
  THIS_WEEK = 'THIS_WEEK',
  LAST_WEEK = 'LAST_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  CUSTOM = 'CUSTOM',
}

export class VisitReportQueryDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType = ReportType.SUMMARY;

  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod = ReportPeriod.THIS_MONTH;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  dentistId?: string;

  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @IsOptional()
  @IsString()
  procedureId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  format?: 'json' | 'csv' | 'pdf' = 'json';
}

export class ExportReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  dentistId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;
}