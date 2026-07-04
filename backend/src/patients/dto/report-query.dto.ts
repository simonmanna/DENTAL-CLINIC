import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
// Add these to the existing imports
import { IsInt, IsString, IsBoolean,  } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import {
  Gender,
  Prisma,
} from '@prisma/client';


export enum ReportPeriod {
  DAILY   = 'daily',
  WEEKLY  = 'weekly',
  MONTHLY = 'monthly',
}

export class PatientReportQueryDto {
  @ApiProperty({ enum: ReportPeriod, required: false, default: ReportPeriod.MONTHLY })
  @IsOptional()
  @IsEnum(ReportPeriod)
  period?: ReportPeriod = ReportPeriod.MONTHLY;

  @ApiProperty({ required: false, example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

// ── Response shapes (also serve as TS types for the frontend) ──────────────

export interface PatientSummaryReport {
  total:      number;
  active:     number;
  inactive:   number;
  today:      number;
  thisWeek:   number;
  thisMonth:  number;
  newVsLastMonth:    number;   // % change
  newVsLastWeek:     number;
  activeRate:        number;   // active / total * 100
}

export interface TrendDataPoint {
  period:     string;   // "2024-01" | "2024-W02" | "2024-01-15"
  label:      string;   // "Jan 2024" | "Week 2" | "Jan 15"
  new:        number;
  returning:  number;
  total:      number;
}

export interface GenderDataPoint {
  gender: string;       // "MALE" | "FEMALE" | "OTHER" | "UNKNOWN"
  count:  number;
  pct:    number;
}

export interface AgeGroupDataPoint {
  group:  string;       // "0–12" | "13–17" | ...
  count:  number;
  pct:    number;
}

export interface StatusDataPoint {
  status: string;
  count:  number;
  pct:    number;
}

export interface InsuranceDataPoint {
  status: string;
  count:  number;
  pct:    number;
}

export interface CityDataPoint {
  city:   string;
  count:  number;
  pct:    number;
}

export interface GrowthDataPoint {
  period:     string;
  label:      string;
  new:        number;
  previous:   number;
  growthPct:  number;   // positive = growth, negative = decline
}

export interface PatientFullReport {
  summary:     PatientSummaryReport;
  trends:      TrendDataPoint[];
  gender:      GenderDataPoint[];
  ageGroups:   AgeGroupDataPoint[];
  status:      StatusDataPoint[];
  insurance:   InsuranceDataPoint[];
  cities:      CityDataPoint[];
  growth:      GrowthDataPoint[];
  generatedAt: string;
}


// ── Existing PatientQueryDto ─────────────────────────────────────
// export class PatientQueryDto {
//   @IsOptional()
//   @IsString()
//   search?: string;

//   @IsOptional()
//   @IsEnum(Gender)
//   gender?: Gender;

//   @IsOptional()
//   @IsBoolean()
//   @Transform(({ value }) => {
//     if (value === 'true') return true;
//     if (value === 'false') return false;
//     return value;
//   })
//   isActive?: boolean;

//   // ── NEW: Age filtering ───────────────────────────────────────
//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)
//   ageMin?: number;

//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)
//   ageMax?: number;

//   // ── NEW: Date range on registeredAt ────────────────────────
//   @IsOptional()
//   @IsDateString()
//   dateFrom?: string;

//   @IsOptional()
//   @IsDateString()
//   dateTo?: string;

//   // ── NEW: Sorting ─────────────────────────────────────────────
//   @IsOptional()
//   @IsString()
//   sortBy?: string = 'registeredAt';

//   @IsOptional()
//   @IsEnum(['asc', 'desc'] as const)
//   sortOrder?: 'asc' | 'desc' = 'desc';

//   // ── Pagination (keep existing defaults) ──────────────────────
//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)
//   page?: number = 1;

//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)
//   limit?: number = 15;
// }

export class PatientQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  // ── NEW: Age filtering ─────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ageMax?: number;

  // ── NEW: Date range on registeredAt ────────────────────────────
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // ── NEW: Sorting ────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  sortBy?: string = 'registeredAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'] as const)
  sortOrder?: 'asc' | 'desc' = 'desc';

  // ── Pagination ──────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 15;
}