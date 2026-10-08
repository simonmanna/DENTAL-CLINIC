// src/financial-reporting/dto/financial-report-query.dto.ts
import {
  IsBooleanString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Which timestamp an invoice report measures. Sales belong on `issued`. */
export const INVOICE_DATE_BASES = ['created', 'issued', 'due', 'paid'] as const;
export type InvoiceDateBasis = (typeof INVOICE_DATE_BASES)[number];

export class FinancialReportQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() dentistId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() direction?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsNumber() @Type(() => Number) page?: number;
  @IsOptional() @IsNumber() @Type(() => Number) limit?: number;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortOrder?: string;
  @IsOptional() @IsString() category?: string;

  /** Which date column the window applies to. Defaults to `created`. */
  @IsOptional() @IsIn(INVOICE_DATE_BASES) dateBasis?: InvoiceDateBasis;

  /** Staff member who took the money (receipts). */
  @IsOptional() @IsString() receivedById?: string;

  @IsOptional() @IsNumber() @Type(() => Number) minAmount?: number;
  @IsOptional() @IsNumber() @Type(() => Number) maxAmount?: number;

  /** Query strings arrive as "true"/"false"; coerce after validation. */
  @IsOptional() @IsBooleanString() overdueOnly?: string;
}
