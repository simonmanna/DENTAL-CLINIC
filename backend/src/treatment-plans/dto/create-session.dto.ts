// src/treatment-plans/dto/create-session.dto.ts
import { SessionStatus, ToothSurface } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ActualInputDto {
  @IsString()
  inventoryItemId: string;

  @IsString()
  name: string;

  @IsString()
  unit: string;

  @IsNumber()
  quantityUsed: number;

  @IsNumber()
  unitCost: number;
}

export class CreateSessionDto {
  @IsOptional()
  @IsNumber()
  sessionNumber?: number;

  @IsOptional()
  @IsString()
  sessionLabel?: string;

  @IsEnum(SessionStatus)
  status: SessionStatus;

  @IsNumber()
  visitGroup: number;

  @IsOptional()
  @IsNumber()
  sessionCost?: number;

  @IsOptional()
  @IsString()
  performedDate?: string;

  @IsOptional()
  @IsString()
  performedNotes?: string;

  @IsOptional()
  @IsString()
  dentistId?: string;

  @IsOptional()
  @IsString()
  visitId?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActualInputDto)
  actualInputsUsed?: ActualInputDto[];

  @IsOptional()
  @IsArray()
  @IsEnum(ToothSurface, { each: true })
  surfaces?: ToothSurface[];


}