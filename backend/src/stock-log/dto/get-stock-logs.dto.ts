// src/stock-log/dto/get-stock-logs.dto.ts
import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockLedgerType } from '@prisma/client';  // ✅ FIXED: Was StockLogTransactionType

export class GetStockLogsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  // ✅ FIXED: Removed itemType field - InventoryLedger uses itemId directly
  // @IsOptional()
  // @IsEnum(['INVENTORY', 'DRUG'])
  // itemType?: 'INVENTORY' | 'DRUG';

  @IsOptional()
  @IsUUID()
  itemId?: string;  // ✅ FIXED: Was inventoryItemId (but now matches InventoryLedger.itemId)

  // ✅ FIXED: Removed drugId - drugs link via inventoryItem relation
  // @IsOptional()
  // @IsUUID()
  // drugId?: string;

  @IsOptional()
  @IsEnum(StockLedgerType)  // ✅ FIXED: Correct enum
  type?: StockLedgerType;   // ✅ FIXED: Was transactionType

  @IsOptional()
  @IsEnum(['PURCHASE_RECEIPT', 'USAGE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE', 'RETURN_IN', 'TRANSFER_IN', 'TRANSFER_OUT'])
  referenceType?: string;  // ✅ NEW: Filter by source document type

  @IsOptional()
  @IsUUID()
  referenceId?: string;  // ✅ NEW: Filter by source document ID

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string; // search item name

  @IsOptional()
  sortBy?: 'createdAt' | 'quantityChange' | 'totalValue' = 'createdAt';  // ✅ Added totalValue option

  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}