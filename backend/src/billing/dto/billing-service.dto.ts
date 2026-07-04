import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';
import { BillingServiceCategory, LedgerEntryType } from '@prisma/client';

export class CreateBillingServiceDto {
  @IsString()
  serviceCode: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(LedgerEntryType)
  type: LedgerEntryType;

  @IsEnum(BillingServiceCategory)
  category: BillingServiceCategory;

  @IsNumber()
  price: number;

  @IsString()
  currency: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  defaultTaxAmount?: number;

  @IsOptional()
  @IsString()
  defaultTaxLabel?: string;

  @IsOptional()
  @IsNumber()
  priceRangeMin?: number;

  @IsOptional()
  @IsNumber()
  priceRangeMax?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBillingServiceDto extends CreateBillingServiceDto {}

export class QueryBillingServiceDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsString()
  isFavorite?: string;
}