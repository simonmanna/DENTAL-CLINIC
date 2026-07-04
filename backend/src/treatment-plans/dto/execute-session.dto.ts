// src/treatment-plans/dto/execute-session.dto.ts
import {
  IsOptional, IsString, IsArray, IsNumber,
  IsBoolean, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ApiPropertyOptional } from '@nestjs/swagger';


export class ToothStatusDto {
  @IsNumber()
  toothNumber: number;

  @IsOptional() @IsString()
  chartEntryId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  surfaces?: string[];

  @IsString()
  status: string; // normalised to UPPER_SNAKE in service

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  performedDate?: string;
}

export class SessionImageLinkDto {
  /**
   * ID of an already-uploaded ImagingRecord to associate with this session.
   * The service will update its procedureSessionId + groupId.
   */
  @IsString()
  imagingRecordId: string;
 
  /**
   * BEFORE | AFTER | PROGRESS — overrides the record's existing stage if set.
   */
  @IsOptional() @IsString()
  stage?: string;
}
 
export class SessionImageUploadMetaDto {
  /**
   * Base64-encoded file — kept small here; prefer pre-uploading via
   * POST /imaging/upload and passing the ID via SessionImageLinkDto.
   * This field is for inline quick-capture flows only.
   */
  @IsOptional() @IsString()
  fileDataBase64?: string;
 
  @IsOptional() @IsString()
  fileName?: string;
 
  @IsOptional() @IsString()
  mimeType?: string;
 
  @IsOptional() @IsString()
  stage?: string; // BEFORE | AFTER | PROGRESS
 
  @IsOptional() @IsString()
  type?: string;  // ImagingType enum value
 
  @IsOptional() @IsArray() @IsNumber({}, { each: true })
  toothNumbers?: number[];
 
  @IsOptional() @IsString()
  notes?: string;
}


export class ExecuteSessionDto {
  @IsOptional() @IsString()   performedDate?: string;
  @IsOptional() @IsString()   performedNotes?: string;
  @IsOptional() @IsArray()    surfaces?: string[];      // surfaces treated this session
  @IsOptional() @IsArray()    actualInputsUsed?: any[];
  @IsOptional() @IsString()   dentistId?: string;
  @IsOptional() @IsString()   visitId?: string;
  @IsOptional() @IsNumber()   sessionPrice?: number;
  @IsOptional() @IsNumber()   sessionPriceOriginal?: number;
  @IsOptional() @IsBoolean()  autoAddToLedger?: boolean;

  // Clinical outcome — replaces raw status
  @IsOptional() @IsString()   outcome?: string;        // 'PARTIAL' | 'COMPLETED'
  @IsOptional() @IsBoolean()  isFinal?: boolean;       // closes the procedure when true
  @IsOptional() @IsString()   phase?: string;          // 'CLEANING' | 'SHAPING' etc.
  @IsOptional() @IsString()   providerId?: string;     // who performed this session

  // Create-and-execute (atomic): when no :sessionId is supplied, the service
  // creates the PENDING session inside the execution transaction so a failed
  // execute rolls the session back instead of leaking an orphan.
  @IsOptional() @IsString()   sessionLabel?: string;
  @IsOptional() @IsNumber()   visitGroup?: number;
  @IsOptional() @IsNumber()   sessionNumber?: number;

  // Legacy / backward compat
  @IsOptional() @IsBoolean()  markProcedureComplete?: boolean;
  @IsOptional() @IsString()   status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToothStatusDto)
  toothStatuses?: ToothStatusDto[];

  @ApiPropertyOptional({ description: 'Pre-uploaded imaging record IDs to link to this session' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionImageLinkDto)
  imagingLinks?: SessionImageLinkDto[];

   @ApiPropertyOptional({ description: 'Group ID for before/after pairing. Auto-generated if omitted.' })
  @IsOptional() @IsString()
  imagingGroupId?: string;

}