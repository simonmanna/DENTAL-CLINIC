import { IsString, IsOptional, IsBoolean, IsInt, IsHexColor, Min, Max } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateProcedureCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  // ── Revenue mapping (category-level default) ──────────────────────────
  // LedgerAccount.id of an INCOME account. Procedures in this category post
  // revenue here unless they set their own revenueAccountId. Send `null`/""
  // to clear and fall back to the system default (TREATMENT_REVENUE).
  @IsOptional()
  @IsString()
  revenueAccountId?: string | null;
}

export class UpdateProcedureCategoryDto extends PartialType(CreateProcedureCategoryDto) {}

export class CategoryQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string;
}