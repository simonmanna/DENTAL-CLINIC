import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsDateString,
  ArrayMinSize,
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

  // `status` is deliberately absent. Accepting it here let a caller create a
  // transfer that was already COMPLETED — the stock never moved, so the source
  // kept quantity it had supposedly shipped and the destination was never
  // credited. A new transfer is always DRAFT; it moves through
  // PATCH /stock-transfers/:id/complete, which is what performs the movement.

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
  @ArrayMinSize(1, { message: 'At least one line item is required' })
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];
}

export class UpdateStockTransferDto {
  // `status` is deliberately absent here as well. PUT /stock-transfers/:id
  // spread the payload straight onto the row, so sending status: COMPLETED
  // marked a DRAFT transfer complete without moving any stock. Completion and
  // cancellation have their own endpoints, which do the work.

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
  @ArrayMinSize(1, { message: 'At least one line item is required' })
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
