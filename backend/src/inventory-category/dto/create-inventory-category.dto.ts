// create-inventory-category.dto.ts
import { IsString, IsOptional, IsBoolean, IsInt, Min, IsHexColor } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInventoryCategoryDto {
  @ApiProperty({ example: 'Consumable', description: 'Category name' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'CONS', description: 'Short code for API/UI', required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ example: 'Items that are used up during procedures', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '#4A90D9', description: 'Hex color for UI badges', required: false })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiProperty({ example: 'Package', description: 'Lucide icon name', required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ description: 'Parent category ID for hierarchical structure', required: false })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 1, description: 'Sort order in lists', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}