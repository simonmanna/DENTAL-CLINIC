// backend/src/modules/imaging/dto/imaging-comparison.dto.ts
import { IsUUID, IsString, IsOptional } from 'class-validator';

export class CreateImagingComparisonDto {
  @IsString()
  baseImageId: string;

  @IsString()
  compareImageId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}