// src/billing/dto/billing.dto.ts
import {
  IsString,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { InvoiceItemType } from '@prisma/client';


export class CurrencyConversionDto {
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CreateLedgerEntryDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  visitId?: string;

  @IsString()
  type: string;

  @IsString()
  description: string;

  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Type(() => Number)
  pricePerUnit: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  subtotalPrice?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  taxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class VoidLedgerEntryDto {
  @IsString()
  reason: string;
}

export class GetLedgerQueryDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}


export class CreateInvoiceFromLedgerDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ledgerEntryIds: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  invoiceCurrency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  customExchangeRate?: number;

  @IsOptional()
  @IsEnum(['PERCENT', 'FIXED'] as const)
  discountType?: 'PERCENT' | 'FIXED';

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  discountValue?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  taxPercent?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  notes?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
export class AddInvoicePaymentDto {
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  paymentCurrency?: string;

  @IsString()
  method: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Staff id (Staff.id) of the cashier who physically received the money.
   * Frontend should default this to the logged-in user's staff record.
   */
  @IsOptional()
  @IsString()
  receivedById?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  exchangeRateAtPayment?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  generateReceipt?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amountInBaseCurrency?: number;
}

export class RefundInvoicePaymentDto {
  /** Amount to refund, in the invoice currency. Must be ≤ amount already paid. */
  @IsNumber()
  @Type(() => Number)
  amount: number;

  /** Method the money is refunded by (drives which cash/bank GL account is credited). */
  @IsString()
  method: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Staff id of the cashier processing the refund. */
  @IsOptional()
  @IsString()
  refundedById?: string;
}

export class CreateDraftInvoiceDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  visitId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? undefined : value))
  treatmentPlanId?: string;
}

export class AddEncounterItemDto {
  @IsString()
  description: string;

  @IsEnum(InvoiceItemType)
  itemType: InvoiceItemType;

  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Type(() => Number)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  discount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ActivateInvoiceDto {
  @IsOptional()
  @IsString()
  activatedBy?: string;
}

export class VoidInvoiceDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  voidedBy?: string;
}
