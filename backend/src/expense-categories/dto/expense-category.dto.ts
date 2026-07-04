// src/expense-categories/dto/expense-category.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateExpenseCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /** Optional GL link — when set, expenses in this category post double-entry. */
  @ApiProperty({ required: false, description: 'LedgerAccount id to post to (optional)' })
  @IsOptional()
  @IsString()
  ledgerAccountId?: string | null;
}

export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
