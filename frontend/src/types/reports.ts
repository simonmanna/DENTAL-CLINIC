
// src/types/reports.ts

export type ReportPeriod = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM' |  'daily' | 'weekly' | 'monthly';

export type ReportType = 'SUMMARY' | 'FINANCIAL' | 'CLINICAL' | 'PATIENT' | 'DENTIST' | 'PROCEDURE' | 'DETAILED';

export interface ReportQuery {
  type: ReportType;
  period?: ReportPeriod;
  startDate?: string;
  endDate?: string;
}

// ... keep all your existing patient report interfaces below (PatientSummaryReport, etc.)
export interface PatientSummaryReport {
  total:          number;
  active:         number;
  inactive:       number;
  today:          number;
  thisWeek:       number;
  thisMonth:      number;
  newVsLastMonth: number;
  newVsLastWeek:  number;
  activeRate:     number;
}


export interface PatientSummaryReport {
  total:          number;
  active:         number;
  inactive:       number;
  today:          number;
  thisWeek:       number;
  thisMonth:      number;
  newVsLastMonth: number;   // % change (+/-)
  newVsLastWeek:  number;
  activeRate:     number;   // percentage
}

export interface TrendDataPoint {
  period:    string;
  label:     string;
  new:       number;
  returning: number;
  total:     number;
}

export interface GenderDataPoint {
  gender: string;
  count:  number;
  pct:    number;
}

export interface AgeGroupDataPoint {
  group: string;
  count: number;
  pct:   number;
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
  city:  string;
  count: number;
  pct:   number;
}

export interface GrowthDataPoint {
  period:    string;
  label:     string;
  new:       number;
  previous:  number;
  growthPct: number;
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

export interface ReportQueryParams {
  period?:    ReportPeriod;
  startDate?: string;
  endDate?:   string;
}