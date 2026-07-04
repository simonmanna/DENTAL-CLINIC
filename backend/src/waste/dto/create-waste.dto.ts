import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsDateString,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WasteCategory } from '@prisma/client';

export class CreateWasteItemDto {
  @IsEnum(['INVENTORY'])
  itemType: 'INVENTORY';

  @IsOptional()
  @IsString()
  inventoryItemId: string;

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
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  // ✅ Keep batchNumber (from database)
  @IsOptional()
  @IsString()
  batchNumber?: string | null;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  // ✅ NEW: Batch selection for batch-tracked items
  @IsOptional()
  @IsString()
  selectedBatchNumber?: string; // For manual selection

  // ✅ NEW: Distribution strategy
  @IsOptional()
  @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

  @IsOptional()
  @IsString()
  reason?: string | null; // ✅ Allow null
}
// export class CreateWasteItemDto {
//   @IsEnum(['INVENTORY'])
//   itemType: 'INVENTORY';

//   @IsOptional()
//   @IsString()
//   inventoryItemId: string;

//   @IsOptional()
//   @IsString()
//   drugId?: string;

//   @IsString()
//   @IsNotEmpty()
//   itemName: string;

//   @IsString()
//   @IsNotEmpty()
//   unit: string;

//   @IsNumber()
//   @IsPositive()
//   quantity: number;

//   @IsNumber()
//   @Min(0)
//   unitCost: number;

//   // ✅ Batch tracking fields
//   @IsOptional()
//   @IsString()
//   batchNumber?: string;

//   @IsOptional()
//   @IsDateString()
//   expiryDate?: string;

//   // ✅ NEW: Batch selection strategy
//   @IsOptional()
//   @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
//   distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

//   @IsOptional()
//   @IsString()
//   reason?: string;
// }

export class CreateWasteRecordDto {
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsEnum(WasteCategory)
  category: WasteCategory;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  witnessName?: string;

  @IsOptional()
  @IsString()
  disposalMethod?: string;

  @IsOptional()
  @IsDateString()
  disposalDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWasteItemDto)
  items: CreateWasteItemDto[];
}

export class ApproveWasteRecordDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryWasteRecordsDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(WasteCategory)
  category?: WasteCategory;

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
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
