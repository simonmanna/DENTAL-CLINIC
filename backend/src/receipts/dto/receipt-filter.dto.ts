import {
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrencyCode, PaymentMethod, ReceiptStatus } from '@prisma/client';

export class ReceiptFilterDto {
  // ── Free-text search ─────────────────────────────────────────────
  // Case-insensitive substring match against receipt number, invoice
  // number, patient name / patient code, and payment reference.
  @IsOptional()
  @IsString()
  search?: string;

  // ── Exact-match filters ──────────────────────────────────────────
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsIn(Object.values(ReceiptStatus))
  status?: ReceiptStatus;

  @IsOptional()
  @IsIn(Object.values(PaymentMethod))
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsIn(Object.values(CurrencyCode))
  currencyCode?: CurrencyCode;

  // ── Date range (inclusive) on generatedAt ────────────────────────
  // ISO date strings (YYYY-MM-DD) are accepted so the frontend can
  // pass raw <input type="date"> values without timezone gymnastics.
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // ── Amount range on amountReceived (currency the patient paid) ───
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  // ── Pagination ───────────────────────────────────────────────────
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 15;
}
