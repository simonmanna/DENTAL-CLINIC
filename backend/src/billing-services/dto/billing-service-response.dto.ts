// src/billing-services/dto/billing-service-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { LedgerEntryType, BillingServiceCategory } from '@prisma/client';

export class BillingServiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  serviceCode: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string | null;

  @ApiProperty({ enum: LedgerEntryType })
  type: LedgerEntryType;

  @ApiProperty({ enum: BillingServiceCategory })
  category: BillingServiceCategory;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  exchangeRate: number | null;

  @ApiProperty()
  defaultTaxAmount: number;

  @ApiProperty()
  defaultTaxLabel: string | null;

  @ApiProperty()
  priceRangeMin: number | null;

  @ApiProperty()
  priceRangeMax: number | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isFavorite: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  notes: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}