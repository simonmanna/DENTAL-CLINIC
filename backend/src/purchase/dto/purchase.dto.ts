// src/purchase/dto/purchase.dto.ts

import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  ValidateNested,
  Min,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  PurchaseOrderStatus,
  PaymentMethod,       // ← was PurchasePaymentMethod
  StockAdjustmentReason,
  WasteCategory,
  DeliveryStatus,
  UnitOfMeasure,
  StockLedgerType,
  PaymentTerms,
} from '@prisma/client';


// ── Purchase Order Items ──────────────────────────────────────────────────────

export class CreatePOItemDto {
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsOptional()
  @IsEnum(UnitOfMeasure)
  uom?: UnitOfMeasure;

  @IsNumber()
  @Min(0.01)
  quantityOrdered: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Purchase Order ────────────────────────────────────────────────────────────

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  PaymentMethod?: PaymentMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  notes?: string | null;

  @IsOptional()
  @IsString()
  internalNotes?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePOItemDto)
  items: CreatePOItemDto[];

  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsEnum(PaymentTerms)  // ← Change from PurchasePaymentTerms to PaymentTerms
  paymentTerms?: PaymentTerms;
}

export class UpdatePurchaseOrderDto extends PartialType(
  CreatePurchaseOrderDto,
) {}

export class ApprovePurchaseOrderDto {
  @IsOptional()
  @IsString()
  approvalNotes?: string;
}

// ── Delivery ──────────────────────────────────────────────────────────────────

export class CreateDeliveryItemDto {
  @IsString()
  purchaseOrderItemId: string;

  @IsNumber()
  @Min(0)
  quantityDelivered: number;

  @IsNumber()
  @Min(0)
  quantityAccepted: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityRejected?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityBilled?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  batchNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString(undefined, {
    message: 'expiryDate must be a valid ISO 8601 date string',
  })
  expiryDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateDeliveryDto {
  @IsString()
  purchaseOrderId: string;

  @IsString()
  locationId: string;

  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  supplierRef?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDeliveryItemDto)
  items: CreateDeliveryItemDto[];
}

// ── Purchase Payment ──────────────────────────────────────────────────────────

export class CreatePurchasePaymentDto {
  @IsString()
  purchaseOrderId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  // Now uses the unified PaymentMethod enum (includes CREDIT_NOTE)
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  chequeNumber?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  accountId?: string;
}

// ── Stock Adjustment ──────────────────────────────────────────────────────────

export class CreateAdjustmentItemDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsNumber()
  quantitySystem: number;

  @IsNumber()
  @Min(0)
  quantityActual: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStockAdjustmentDto {
  @IsString()
  locationId: string;

  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAdjustmentItemDto)
  items: CreateAdjustmentItemDto[];
}

// ── Waste Record ──────────────────────────────────────────────────────────────

export class CreateWasteItemDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  itemName: string;

  @IsString()
  unit: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateWasteRecordDto {
  @IsString()
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

// ── Query / Filter ────────────────────────────────────────────────────────────

export class PurchaseOrderQueryDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number = 20;
}

export class InventoryLedgerQueryDto {
  @IsOptional() @IsString() locationId?: string;
  @IsOptional() @IsString() itemId?: string;

  @IsOptional()
  @IsEnum(StockLedgerType)
  type?: StockLedgerType;

  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 50;
}