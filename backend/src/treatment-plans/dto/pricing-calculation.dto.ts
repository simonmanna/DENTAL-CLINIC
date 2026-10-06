// src/treatment-plans/dto/pricing-calculation.dto.ts
import { IsString, IsNumber, IsOptional, IsArray, IsInt, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger'; // Optional, if using Swagger

export class PricingCalculationDto {
  @ApiProperty({ description: 'Procedure ID or code' })
  @IsString()
  procedureId: string;

  @ApiProperty({ description: 'Selected tooth numbers (FDI notation)', example: [16, 17] })
  @IsArray()
  @IsNumber({}, { each: true })
  toothNumbers: number[];

  @ApiProperty({ description: 'Optional quantity override for PER_TOOTH/PER_ARCH pricing', required: false })
  @IsOptional()
  @IsInt()
  quantityBasis?: number;

  @ApiProperty({ description: 'SINGLE | MULTI (PER_SESSION pricing)', required: false })
  @IsOptional()
  @IsIn(['SINGLE', 'MULTI'])
  sessionType?: string;

  @ApiProperty({ description: 'Planned sessions (MULTI)', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sessionCount?: number;

  /** Ignored — the procedure's catalogue currency is used. Kept for old clients. */
  @IsOptional()
  @IsString()
  currency?: string;

  /** Ignored — the clinic exchange rate is used. Kept for old clients. */
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;
}