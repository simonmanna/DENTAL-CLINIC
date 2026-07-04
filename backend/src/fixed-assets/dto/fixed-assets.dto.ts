// src/fixed-assets/dto/fixed-assets.dto.ts

import {
  IsString, IsOptional, IsEnum, IsDateString, IsNumber,
  IsBoolean, IsArray, IsPositive, Min, Max
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export enum AssetStatus { ACTIVE = 'ACTIVE', IDLE = 'IDLE', UNDER_MAINTENANCE = 'UNDER_MAINTENANCE', DISPOSED = 'DISPOSED', LOST = 'LOST', LEASED = 'LEASED' }
export enum AssetCondition { EXCELLENT = 'EXCELLENT', GOOD = 'GOOD', FAIR = 'FAIR', POOR = 'POOR', SCRAP = 'SCRAP' }
export enum AssetCategory {
  DENTAL_EQUIPMENT = 'DENTAL_EQUIPMENT', IMAGING_EQUIPMENT = 'IMAGING_EQUIPMENT',
  STERILIZATION = 'STERILIZATION', LABORATORY = 'LABORATORY', OFFICE_EQUIPMENT = 'OFFICE_EQUIPMENT',
  FURNITURE = 'FURNITURE', VEHICLES = 'VEHICLES', BUILDING = 'BUILDING',
  IT_INFRASTRUCTURE = 'IT_INFRASTRUCTURE', MEDICAL_INSTRUMENTS = 'MEDICAL_INSTRUMENTS', OTHER = 'OTHER'
}
export enum DepreciationMethod { STRAIGHT_LINE = 'STRAIGHT_LINE', DECLINING_BALANCE = 'DECLINING_BALANCE', NONE = 'NONE' }
export enum MaintenanceType { PREVENTIVE = 'PREVENTIVE', CORRECTIVE = 'CORRECTIVE', CALIBRATION = 'CALIBRATION', INSPECTION = 'INSPECTION', OTHER = 'OTHER' }
export enum MaintenanceStatus { SCHEDULED = 'SCHEDULED', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED', OVERDUE = 'OVERDUE' }
export enum DisposalMethod { SOLD = 'SOLD', SCRAPPED = 'SCRAPPED', DONATED = 'DONATED', WRITTEN_OFF = 'WRITTEN_OFF', RETURNED_TO_SUPPLIER = 'RETURNED_TO_SUPPLIER', STOLEN_LOST = 'STOLEN_LOST' }
export enum AssetMovementType { INITIAL_PLACEMENT = 'INITIAL_PLACEMENT', TRANSFER = 'TRANSFER', LOAN = 'LOAN', RETURN = 'RETURN' }

// ── Create Asset ──────────────────────────────────────────────────────────────

export class CreateFixedAssetDto {
  @IsString()
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsEnum(AssetCategory)
  category: AssetCategory;

  @IsEnum(AssetCondition) @IsOptional()
  condition?: AssetCondition;

  @IsDateString()
  purchaseDate: string;

  @IsNumber() @IsPositive()
  purchaseCost: number;

  @IsOptional() @IsString()
  currency?: string;

  @IsOptional() @IsString()
  supplierId?: string;

  @IsOptional() @IsString()
  invoiceNumber?: string;

  @IsOptional() @IsDateString()
  warrantyExpiry?: string;

  @IsOptional() @IsString()
  serialNumber?: string;

  @IsOptional() @IsString()
  modelNumber?: string;

  @IsOptional() @IsString()
  manufacturer?: string;

  @IsOptional() @IsString()
  locationId?: string;

  @IsOptional() @IsString()
  assignedToStaffId?: string;

  @IsEnum(DepreciationMethod) @IsOptional()
  depreciationMethod?: DepreciationMethod;

  @IsOptional() @IsNumber() @Min(1) @Max(100)
  usefulLifeYears?: number;

  @IsOptional() @IsNumber() @Min(0)
  salvageValue?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  depreciationRate?: number;

  @IsOptional() @IsDateString()
  depreciationStartDate?: string;

  @IsOptional() @IsBoolean()
  isDepreciable?: boolean;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  attachments?: string[];
}

export class UpdateFixedAssetDto extends PartialType(CreateFixedAssetDto) {
  @IsOptional() @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional() @IsEnum(AssetCondition)
  condition?: AssetCondition;
}

// ── Dispose Asset ─────────────────────────────────────────────────────────────

export class DisposeAssetDto {
  @IsEnum(DisposalMethod)
  disposalMethod: DisposalMethod;

  @IsDateString()
  disposedAt: string;

  @IsOptional() @IsNumber() @Min(0)
  disposalValue?: number;

  @IsOptional() @IsString()
  disposalNotes?: string;
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export class CreateMaintenanceDto {
  @IsString()
  assetId: string;

  @IsEnum(MaintenanceType)
  type: MaintenanceType;

  @IsString()
  title: string;

  @IsOptional() @IsString()
  description?: string;

  @IsDateString()
  scheduledDate: string;

  @IsOptional() @IsDateString()
  nextDueDate?: string;

  @IsOptional() @IsNumber() @Min(0)
  estimatedCost?: number;

  @IsOptional() @IsString()
  serviceProvider?: string;

  @IsOptional() @IsString()
  technicianName?: string;
}

export class CompleteMaintenanceDto {
  @IsDateString()
  completedDate: string;

  @IsOptional() @IsNumber() @Min(0)
  actualCost?: number;

  @IsOptional() @IsEnum(AssetCondition)
  conditionAfter?: AssetCondition;

  @IsOptional() @IsString()
  findings?: string;

  @IsOptional() @IsString()
  partsReplaced?: string;

  @IsOptional() @IsDateString()
  nextDueDate?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  attachments?: string[];
}

// ── Asset Transfer ────────────────────────────────────────────────────────────

export class TransferAssetDto {
  @IsString()
  assetId: string;

  @IsOptional() @IsString()
  toLocationId?: string;

  @IsOptional() @IsString()
  toStaffId?: string;

  @IsOptional() @IsString()
  reason?: string;

  @IsEnum(AssetMovementType) @IsOptional()
  type?: AssetMovementType;

  @IsOptional() @IsDateString()
  expectedReturnDate?: string;
}

// ── Post Depreciation ─────────────────────────────────────────────────────────

export class PostDepreciationDto {
  @IsArray() @IsString({ each: true })
  assetIds: string[];  // Empty array = all depreciable active assets

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsOptional() @IsString()
  notes?: string;
}

// ── Query Filters ─────────────────────────────────────────────────────────────

export class FixedAssetQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional() @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional() @IsEnum(AssetCondition)
  condition?: AssetCondition;

  @IsOptional() @IsString()
  locationId?: string;

  @IsOptional() @IsString()
  supplierId?: string;

  @IsOptional() @IsString()
  assignedToStaffId?: string;

  @IsOptional() @IsBoolean()
  warrantyExpiringSoon?: boolean;  // Within 30 days

  @IsOptional() @IsBoolean()
  maintenanceDueSoon?: boolean;    // Within 14 days

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100)
  limit?: number;
}
