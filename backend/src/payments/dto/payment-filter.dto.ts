import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';
import {
  PaymentType,
  CashFlowDirection,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class PaymentFilterDto {
  @IsOptional()
  @IsString()
  search?: string; // Searches paymentCode, reference, transactionId, invoiceNumber, poNumber, expenseCode

  @IsOptional()
  @IsEnum(PaymentType)
  type?: PaymentType;

  @IsOptional()
  @IsEnum(CashFlowDirection)
  direction?: CashFlowDirection;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}