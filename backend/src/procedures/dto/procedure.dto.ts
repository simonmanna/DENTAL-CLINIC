import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { PricingModel, BillingUnit } from '@prisma/client';

export class ProcedureInventoryInputDto {
  @IsString()
  inventoryItemId: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsNumber()
  @Min(0)
  quantityUsed: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

export class CreateProcedureDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name: string;

  @IsString()
  category: string; // Category name (will be resolved to categoryId)

  @IsOptional()
  @IsString()
  description?: string;

  // Internal cost (what clinic pays for materials/time)
  @IsNumber()
  @Min(0)
  baseCost: number;

  // Selling price (what patient pays) - defaults to baseCost if not provided
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultDuration?: number;

  @IsOptional()
  @IsBoolean()
  requiresXray?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // New pricing fields
  @IsOptional()
  @IsEnum(PricingModel)
  pricingModel?: PricingModel;

  @IsOptional()
  @IsEnum(BillingUnit)
  billingUnit?: BillingUnit;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceRangeMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceRangeMax?: number;

  // ── Revenue mapping (per-procedure override) ──────────────────────────
  // LedgerAccount.id of an INCOME account. Overrides the category default.
  // Send `null` (or "") to clear and fall back to the category / system default.
  @IsOptional()
  @IsString()
  revenueAccountId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcedureInventoryInputDto)
  inputs?: ProcedureInventoryInputDto[];
}

export class UpdateProcedureDto extends PartialType(CreateProcedureDto) {}

export class ProcedureQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

// ─── Visit Procedure DTOs ───────────────────────────────────────────────────

export class VisitInventoryUsageDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  locationId: string;

  @IsNumber()
  @Min(0)
  quantityUsed: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddVisitProcedureDto {
  @IsString()
  visitId: string;

  @IsString()
  procedureId: string;

  @IsOptional()
  @IsArray()
  toothNumbers?: number[];

  @IsOptional()
  @IsArray()
  surfaces?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number; // override default cost

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitInventoryUsageDto)
  inventoryUsages?: VisitInventoryUsageDto[];
}

export class UpdateVisitProcedureDto extends PartialType(
  AddVisitProcedureDto,
) {}
