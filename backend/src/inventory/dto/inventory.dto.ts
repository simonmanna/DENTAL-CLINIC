import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitOfMeasure } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types'; // or '@nestjs/swagger'
import { Transform } from 'class-transformer';

import { InventoryType } from '@prisma/client';

// ─── Category DTOs ──────────────────────────────────────────────────────────

export class CreateInventoryCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateInventoryCategoryDto extends CreateInventoryCategoryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

}

// ─── Inventory Item DTOs ────────────────────────────────────────────────────

export class CreateInventoryItemDto {
  
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  itemCode?: string; // Auto-generated if not provided

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  unit: string;

  @IsEnum(UnitOfMeasure)
  uom: UnitOfMeasure;

  @IsEnum(InventoryType)
  type: InventoryType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;

  @IsOptional()
  @IsString()
  location?: string;

  // @IsOptional()
  // @IsBoolean()
  // @IsOptional()
  // @Transform(({ value }) => value === 'true')
  // isActive?: boolean;
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  batchTracking?: boolean;

  // isActive?: boolean;
}

export class UpdateInventoryItemDto extends PartialType(
  CreateInventoryItemDto,
) {}
// export class UpdateInventoryItemDto extends CreateInventoryItemDto {
//   @IsOptional()
//   @IsString()
//   name: string;

//   @IsOptional()
//   @IsString()
//   unit: string;

//   @IsOptional()
//   @IsEnum(UnitOfMeasure)
//   uom: UnitOfMeasure;
// }

// ─── Query / Filter DTOs ────────────────────────────────────────────────────

export class InventoryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;


  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  lowStock?: boolean; // items below minQuantity

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}

