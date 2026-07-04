import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockOutCategory } from '@prisma/client';

// ─── Line-item DTO ────────────────────────────────────────────────────────────
export class StockOutItemDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsString()
  @IsNotEmpty()
  itemName: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost: number;

  /**
   * FEFO = First Expired First Out (default, uses expiryDate ASC)
   * FIFO = First In First Out (uses receivedAt ASC)
   * MANUAL = caller specifies exactly which batch to draw from
   */
  @IsOptional()
  @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

  /** Only used when distributionStrategy === 'MANUAL' */
  @IsOptional()
  @IsString()
  selectedBatchNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ─── Create DTO ───────────────────────────────────────────────────────────────
export class CreateStockOutDto {
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsEnum(StockOutCategory)
  category?: StockOutCategory;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockOutItemDto)
  items: StockOutItemDto[];
}

// ─── Query DTO ────────────────────────────────────────────────────────────────
export class QueryStockOutDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(StockOutCategory)
  category?: StockOutCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}