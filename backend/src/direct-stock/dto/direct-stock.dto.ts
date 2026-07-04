import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
  MinLength,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DirectStockInItemDto {
  @IsString()
  @MinLength(1)
  inventoryItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class DirectStockInDto {
  @IsString()
  @MinLength(1)
  locationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectStockInItemDto)
  items: DirectStockInItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DirectStockOutItemDto {
  @IsString()
  @MinLength(1)
  inventoryItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsEnum(['FEFO', 'FIFO', 'MANUAL'])
  distributionStrategy?: 'FEFO' | 'FIFO' | 'MANUAL';

  @IsOptional()
  @IsString()
  selectedBatchNumber?: string;

  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsNumber()
  unitCost?: number;
}

export class DirectStockOutDto {
  @IsString()
  @MinLength(1)
  locationId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DirectStockOutItemDto)
  items: DirectStockOutItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DirectStockQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  type?: 'IN' | 'OUT';

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
