import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { LedgerAccountType, NormalBalance } from '@prisma/client';

export class CreateLedgerAccountDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9.\-]+$/, {
    message: 'Account code may contain letters, digits, "." and "-" only',
  })
  @MaxLength(20)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(LedgerAccountType)
  type: LedgerAccountType;

  // Optional — derived from `type` when omitted.
  @IsOptional()
  @IsEnum(NormalBalance)
  normalBalance?: NormalBalance;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateLedgerAccountDto {
  // Code changes are gated in the service:
  //   • free when the account has no postings
  //   • admin-only when the account already has postings
  //   • never for system accounts (the posting engine relies on canonical codes)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9.\-]+$/, {
    message: 'Account code may contain letters, digits, "." and "-" only',
  })
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  // Only honoured for non-system accounts with no postings yet.
  @IsOptional()
  @IsEnum(LedgerAccountType)
  type?: LedgerAccountType;
}
