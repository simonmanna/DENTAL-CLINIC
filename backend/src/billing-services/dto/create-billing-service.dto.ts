// src/billing-services/dto/create-billing-service.dto.ts
import { 
  IsString, 
  IsOptional, 
  IsEnum, 
  IsNumber, 
  IsBoolean, 
  Min, 
  Max,
  Length 
} from 'class-validator';
import { Type } from 'class-transformer';
import { LedgerEntryType, BillingServiceCategory } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBillingServiceDto {
  @ApiProperty()
  @IsString()
  @Length(2, 50)
  serviceCode: string;

  @ApiProperty()
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: LedgerEntryType, default: 'SERVICE' })
  @IsEnum(LedgerEntryType)
  type: LedgerEntryType = 'SERVICE';

  @ApiProperty({ enum: BillingServiceCategory, default: 'OTHER' })
  @IsEnum(BillingServiceCategory)
  category: BillingServiceCategory = 'OTHER';

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string = 'UGX';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  exchangeRate?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultTaxAmount?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultTaxLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceRangeMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceRangeMax?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean = false;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}