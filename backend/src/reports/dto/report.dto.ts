import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportPeriod {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export enum ReportType {
  SUMMARY = 'summary',
  FINANCIAL = 'financial',
  CLINICAL = 'clinical',
  PATIENT = 'patient',
  DENTIST = 'dentist',
  PROCEDURE = 'procedure',
  DETAILED = 'detailed',
  PATIENT_VISITS = 'patient_visits',
}

export class VisitReportQueryDto {
  @ApiProperty({ enum: ReportPeriod, default: ReportPeriod.THIS_MONTH })
  @IsEnum(ReportPeriod)
  period: ReportPeriod = ReportPeriod.THIS_MONTH;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ enum: ReportType, default: ReportType.SUMMARY })
  @IsEnum(ReportType)
  type: ReportType = ReportType.SUMMARY;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dentistId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  procedureId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ExportReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dentistId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  patientId?: string;
}