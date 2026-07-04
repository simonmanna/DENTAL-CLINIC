// backend/src/modules/imaging/dto/update-imaging-record.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateImagingRecordDto } from './create-imaging-record.dto';

export class UpdateImagingRecordDto extends PartialType(CreateImagingRecordDto) {}

