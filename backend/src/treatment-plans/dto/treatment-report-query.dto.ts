// src/treatment-plans/dto/treatment-report-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BillingType, SessionStatus, TreatmentStatus } from '@prisma/client';

/**
 * Query shape shared by the three TreatmentReports endpoints.
 *
 * These were previously typed `@Query() filters: any`, so an unparseable date
 * or an unknown status reached Prisma verbatim and surfaced as a 500. Validating
 * here turns those into a 400 that names the offending field.
 */
export class TreatmentReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() dentistId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() patientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() priority?: string;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

/** Plans and procedures both key off {@link TreatmentStatus}. */
export class TreatmentPlanReportQueryDto extends TreatmentReportQueryDto {
  @ApiPropertyOptional({ enum: TreatmentStatus })
  @IsOptional()
  @IsEnum(TreatmentStatus)
  status?: TreatmentStatus;
}

export class ProcedureReportQueryDto extends TreatmentPlanReportQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() procedureId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;

  @ApiPropertyOptional({ enum: BillingType })
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;
}

/** Sessions use their own status enum, not {@link TreatmentStatus}. */
export class SessionReportQueryDto extends TreatmentReportQueryDto {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentProcedureId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBooleanString()
  isFinal?: string;
}
