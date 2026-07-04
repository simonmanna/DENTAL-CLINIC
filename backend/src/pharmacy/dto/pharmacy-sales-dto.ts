import { PaymentMethod, SaleType } from '@prisma/client';

import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsBoolean
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Nested DTOs ─────────────────────────────────────────────────────────────

class SaleItemDto {
  @IsString()
  drugId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  discount?: number;
}

class PaymentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;
}

class WalkInItemDto {
  @IsString()
  drugId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  discount?: number;
}

// ─── Main DTOs ───────────────────────────────────────────────────────────────

export class CreatePharmacySaleDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  prescriptionId?: string;

  @IsEnum(SaleType)
  saleType: SaleType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  servedBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  // pharmacy-sales-dto.ts — add to CreatePharmacySaleDto
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  generateInvoice?: boolean; // default true for patient sales

  @IsOptional()
  @IsString()
  invoiceCurrency?: string; // defaults to 'BASE' (UGX)
}

export class AddSalePaymentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class DispenseMultipleDto {
  @IsString()
  patientId: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  servedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsString({ each: true })
  prescriptionIds: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WalkInItemDto)
  walkInItems?: WalkInItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];
}