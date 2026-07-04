import { ApiProperty } from '@nestjs/swagger';

export class DrugCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  code: string | null;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  color: string | null;

  @ApiProperty({ nullable: true })
  icon: string | null;

  @ApiProperty({ nullable: true })
  parentId: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // @ApiProperty({ type: [DrugCategoryResponseDto], nullable: true })
  // children?: DrugCategoryResponseDto[];

  @ApiProperty({ nullable: true })
  parent?: DrugCategoryResponseDto;

  @ApiProperty()
  _count: { drugs: number };
}