// ═══════════════════════════════════════════════════════════════
// PATIENTS MODULE
// ═══════════════════════════════════════════════════════════════

// src/patients/dto/patient.dto.ts
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsBoolean,
  IsNumber,
  IsInt,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Type, Transform } from 'class-transformer';


export class CreatePatientDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  previousCardNumber?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  alternatePhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() city?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  occupation?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bloodGroup?: string;
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  allergies?: string[];
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  medicalConditions?: string[];
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  currentMedications?: string[];
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  familyGroupId?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  familyRole?: string;
}

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}

export class PatientQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  // ── NEW: Age filtering ─────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ageMax?: number;

  // ── NEW: Date range on registeredAt ────────────────────────────
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // ── NEW: Sorting ───────────────────────────────────────────────
  @IsOptional()
  @IsString()
  sortBy?: string = 'registeredAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'] as const)
  sortOrder?: 'asc' | 'desc' = 'desc';

  // ── Pagination ─────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number = 15;
}

// export class PatientQueryDto {
//   @IsOptional()
//   @IsString()
//   search?: string;

//   @IsOptional()
//   @IsEnum(Gender)
//   gender?: Gender;

//   @IsOptional()
//   @IsBoolean()
//   @Transform(({ value }) => {
//     if (value === 'true') return true;
//     if (value === 'false') return false;
//     return value;
//   })
//   isActive?: boolean;

//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)  // This transforms string "1" to number 1
//   page?: number = 1;

//   @IsOptional()
//   @IsInt()
//   @Type(() => Number)
//   limit?: number = 15;
// }

export class CreateInsuranceDto {
  @ApiProperty() @IsString() provider: string;
  @ApiProperty() @IsString() policyNumber: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  memberNumber?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coverageType?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  coveragePercent?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  maxAnnualBenefit?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
