import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum ClinicalReportType {
  TREATMENT_HISTORY = 'treatment_history',
  PLAN_VS_COMPLETED = 'plan_vs_completed',
  PROCEDURE_SESSIONS = 'procedure_sessions',
  PROCEDURE_OUTCOMES = 'procedure_outcomes',
  DENTAL_CHART_STATUS = 'dental_chart_status',
  DIAGNOSIS_TRENDS = 'diagnosis_trends',
  PATIENT_VISITS = 'patient_visits',
  DENTIST_ACTIVITY = 'dentist_activity',
}

export enum ReportPeriodClinical {
  TODAY = 'today',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  LAST_3_MONTHS = 'last_3_months',
  LAST_6_MONTHS = 'last_6_months',
  THIS_YEAR = 'this_year',
  CUSTOM = 'custom',
}

export class ClinicalReportQueryDto {
  @ApiPropertyOptional({ enum: ClinicalReportType })
  @IsOptional()
  @IsEnum(ClinicalReportType)
  type?: ClinicalReportType;

  @ApiPropertyOptional({ enum: ReportPeriodClinical })
  @IsOptional()
  @IsEnum(ReportPeriodClinical)
  period?: ReportPeriodClinical;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dentistId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  procedureId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsInt()
    @Min(1)
    // R-15 fix: cap limit at 500 to prevent OOM via huge limit params.
    @Max(500)
    limit?: number = 50;
  }