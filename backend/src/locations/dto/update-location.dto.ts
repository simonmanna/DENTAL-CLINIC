import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateLocationDto } from './create-location.dto';
import { IsString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateLocationDto extends PartialType(
  OmitType(CreateLocationDto, ['parentId'] as const),
) {
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === 'null' ? null : value))
  parentId?: string | null;
}
