import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiPropertyOptional()
  color: string | null;

  @ApiPropertyOptional()
  icon: string | null;

  @ApiPropertyOptional()
  parentId: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Add parent relation info
  @ApiPropertyOptional({
    type: () => ParentCategoryDto,
    description: 'Parent category details (if nested)',
  })
  parent?: ParentCategoryDto | null;

  @ApiPropertyOptional({ 
    type: [InventoryCategoryResponseDto],
    description: 'Child categories (when includeChildren=true)',
  })
  children?: InventoryCategoryResponseDto[];

  @ApiPropertyOptional()
  _count?: { inventoryItems: number };
}

// Separate DTO for parent reference (lightweight)
export class ParentCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  code: string | null;
}