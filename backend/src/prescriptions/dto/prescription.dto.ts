import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { PrescriptionStatus } from '@prisma/client';

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  visitId: string;

  @IsString()
  @IsNotEmpty()
  drugName: string;

  @IsString()
  @IsOptional()
  strength?: string;

  @IsString()
  @IsOptional()
  dosageForm?: string;

  @IsString()
  @IsNotEmpty()
  sig: string;

  @IsString()
  @IsOptional()
  quantity?: string;

  @IsString()
  @IsOptional()
  refills?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;
}

export class UpdatePrescriptionDto {
  @IsEnum(PrescriptionStatus)
  @IsOptional()
  status?: PrescriptionStatus;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  dispensedBy?: string;
}
