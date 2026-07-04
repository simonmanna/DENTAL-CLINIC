// src/prescriptions/dto/create-prescription.dto.ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsDateString,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrescriptionStatus } from '@prisma/client';

export class PrescriptionItemDto {
  @IsString()
  @IsNotEmpty()
  drugId: string;

  @IsString()
  @IsNotEmpty()
  dosage: string; // e.g., "1 tablet", "5ml"

  @IsString()
  @IsNotEmpty()
  frequency: string; // e.g., "three times daily", "every 6 hours"

  @IsString()
  @IsNotEmpty()
  duration: string; // e.g., "7 days", "2 weeks"

  @IsString()
  @IsOptional()
  route?: string; // e.g., "oral", "topical", "injection"

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  instructions?: string; // Patient-friendly instructions (Sig)

  @IsInt()
  @Min(0)
  refills: number = 0;
}

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  visitId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  @IsNotEmpty()
  items: PrescriptionItemDto[];

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

export class AddPrescriptionItemDto {
  @IsString()
  @IsNotEmpty()
  prescriptionId: string;

  @ValidateNested()
  @Type(() => PrescriptionItemDto)
  item: PrescriptionItemDto;
}

// Full edit: replace items, update notes/validUntil. Only allowed when ACTIVE.
export class EditPrescriptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  @IsOptional()
  items?: PrescriptionItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;
}