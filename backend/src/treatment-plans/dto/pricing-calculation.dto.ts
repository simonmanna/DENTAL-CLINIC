// src/treatment-plans/dto/pricing-calculation.dto.ts
import { IsString, IsNumber, IsOptional, IsArray, IsInt } from 'class-validator';
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

  @ApiProperty({ description: 'Procedure currency (USD or UGX)', example: 'UGX' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'Exchange rate if currency is USD', required: false, example: 3700 })
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;
}