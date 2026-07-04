import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockAdjustmentReason } from '@prisma/client';

export class AdjustmentItemDto {
  @IsString()
  @IsNotEmpty()
  itemType: 'INVENTORY' | 'DRUG'; // 'INVENTORY' | 'DRUG'

  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsOptional()
  @IsString()
  drugId?: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsNumber()
  @Min(0)
  quantitySystem: number; // what system says

  @IsNumber()
  @Min(0)
  quantityActual: number; // what was physically counted

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

export class CreateStockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  items: AdjustmentItemDto[];
}

export class ApproveAdjustmentDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockAdjustmentFilterDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(StockAdjustmentReason)
  reason?: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
