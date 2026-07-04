// src/drugs/dto/query-drugs.dto.ts
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { UnitOfMeasure } from '@prisma/client';
import { Type } from 'class-transformer';

export class QueryDrugsDto {
  @IsOptional()
  @Type(() => Number) // ⭐ Convert string "1" → number 1
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  uom?: UnitOfMeasure;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;

  // ✅ NEW: Filter for low-stock items
  @IsOptional()
  @IsBoolean()
  lowStock?: boolean;

  // ✅ NEW: Filter stock by specific location
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'createdAt' | 'sellPrice' | 'unitPrice' | 'updatedAt' =
    'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
