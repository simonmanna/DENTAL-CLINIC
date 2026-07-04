// src/dto/cashflow.dto.ts
import {
  IsString, IsEnum, IsOptional, IsBoolean, IsNumber,
  IsNotEmpty, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccountType, AccountCurrency } from '@prisma/client';

// ─── Account DTOs ──────────────────────────────────────────────────────────────

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsEnum(AccountCurrency)
  @IsOptional()
  currency?: AccountCurrency;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankBranch?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  openingBalance?: number;
}

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  bankBranch?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

// ─── Cash Flow DTOs ────────────────────────────────────────────────────────────

export class RecordCashInDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  exchangeRate?: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  recordedById?: string;

  @IsString()
  @IsOptional()
  receiptId?: string;
}

export class RecordCashOutDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  exchangeRate?: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  recordedById?: string;

  @IsString()
  @IsOptional()
  expenseId?: string;

  @IsString()
  @IsOptional()
  purchasePaymentId?: string;
}

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @IsString()
  @IsNotEmpty()
  toAccountId: string;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  exchangeRate?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  recordedById?: string;
}

export class OpenDayDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsNumber()
  @Type(() => Number)
  openingBalance: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CloseDayDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  closedById?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CashFlowQueryDto {
  @IsString()
  @IsOptional()
  accountId?: string;

  @IsString()
  @IsOptional()
  direction?: 'IN' | 'OUT';

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}