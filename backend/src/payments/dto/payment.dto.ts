// src/payments/dto/payment.dto.ts
import {
  IsString, IsEnum, IsOptional, IsNumber, IsNotEmpty,
  Min, IsArray, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, PaymentTerms, PaymentType } from '@prisma/client';

export enum PaymentContextType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  EXPENSE = 'EXPENSE',
}

// src/payments/dto/payment.dto.ts
export class CreatePaymentDto {
  @IsEnum(PaymentType)
  type: PaymentType;

  @IsString()
  sourceId: string; // purchaseOrderId or expenseId or invoiceId

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  chequeNumber?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

   // ADD THESE TWO:
  @IsOptional()
  @IsString()
  paidBy?: string;      // who processed the payment (overrides req.user.id)

  @IsOptional()
  @IsString()
  accountId?: string;   // which account to debit
}

export class PaymentQueryDto {
  @IsString()
  @IsOptional()
  contextType?: PaymentContextType;

  @IsString()
  @IsOptional()
  contextId?: string;

  @IsString()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}
