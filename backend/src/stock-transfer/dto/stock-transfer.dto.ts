import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockTransferStatus, UnitOfMeasure } from '@prisma/client';

export class StockTransferItemDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  uom?: UnitOfMeasure;

  @IsNumber()
  @Min(0.01)
  quantityRequested: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityTransferred?: number;

  // Batch selection (for batch-tracked items)
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStockTransferDto {
  @IsString()
  fromLocationId: string;

  @IsString()
  toLocationId: string;

  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];
}

export class UpdateStockTransferDto {
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;

  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items?: StockTransferItemDto[];
}

export class CompleteTransferDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class StockTransferQueryDto {
  @IsOptional() @IsString() fromLocationId?: string;
  @IsOptional() @IsString() toLocationId?: string;
  @IsOptional() @IsEnum(StockTransferStatus) status?: StockTransferStatus;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number = 20;
}