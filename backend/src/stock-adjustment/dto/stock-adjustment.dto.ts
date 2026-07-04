import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockAdjustmentReason } from '@prisma/client';

export class AdjustmentItemDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsNumber()
  @Min(0)
  quantitySystem: number;

  @IsNumber()
  @Min(0)
  quantityActual: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  // ✅ Keep batchNumber (from database)
  @IsOptional()
  @IsString()
  batchNumber?: string | null;

  // ✅ NEW: For manual batch selection by ID
  @IsOptional()
  @IsString()
  batchId?: string;

  // ✅ NEW: Distribution strategy
  @IsOptional()
  @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

  @IsOptional()
  @IsString()
  notes?: string | null; // ✅ Allow null
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
  @IsInt() // ← ⚠️ Query params are strings!
  page?: number;

  @IsOptional()
  limit?: number;
}
