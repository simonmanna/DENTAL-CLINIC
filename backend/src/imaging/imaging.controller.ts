// backend/src/imaging/imaging.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ImagingService } from './imaging.service';
import { CreateImagingRecordDto } from './dto/create-imaging-record.dto';
import { UpdateImagingRecordDto } from './dto/update-imaging-record.dto';
import { ImagingQueryDto } from './dto/imaging-query.dto';
import { CreateImagingComparisonDto } from './dto/imaging-comparison.dto';
import { StorageService, UploadedFile } from '../storage/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UserRole } from '@prisma/client';

@Controller('imaging')
@UseGuards(JwtAuthGuard)
export class ImagingController {
  constructor(
    private readonly imagingService: ImagingService,
    private readonly storageService: StorageService,
  ) { }

  @Post()
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
  )
  async create(
    @Req() request: any,
    @Body() createDto: CreateImagingRecordDto,
    @UploadedFiles() files: { image?: UploadedFile[]; thumbnail?: UploadedFile[] },
  ) {
    console.log('Received body:', createDto);
    console.log('Received files:', files);

    // Manual file validation
    const imageFile = files.image?.[0];
    const thumbnailFile = files.thumbnail?.[0];

    if (!imageFile) {
      throw new BadRequestException('Image file is required');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/dicom'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.dicom', '.dcm'];
    const fileExtension = imageFile.originalname.toLowerCase().substring(imageFile.originalname.lastIndexOf('.'));

    if (!allowedMimeTypes.includes(imageFile.mimetype) && !allowedExtensions.includes(fileExtension)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')} or extensions: ${allowedExtensions.join(', ')}`
      );
    }

    // Validate file size (50MB)
    if (imageFile.size > 50 * 1024 * 1024) {
      throw new BadRequestException('File size too large. Maximum size is 50MB');
    }

    // Parse toothNumbers - ensure they are numbers, not strings
    let toothNumbers: number[] = [];

    if (createDto.toothNumbers) {
      if (Array.isArray(createDto.toothNumbers)) {
        // Convert each element to a number if it's a string
        toothNumbers = createDto.toothNumbers.map(num => {
          const parsed = typeof num === 'string' ? parseInt(num, 10) : num;
          return isNaN(parsed) ? null : parsed;
        }).filter(num => num !== null) as number[];
      } else if (typeof createDto.toothNumbers === 'string') {
        toothNumbers = (createDto.toothNumbers as unknown as string)
          .split(',')
          .map(num => parseInt(num.trim(), 10))
          .filter(num => !isNaN(num));
      } else if (typeof createDto.toothNumbers === 'number') {
        toothNumbers = [createDto.toothNumbers];
      }
    }

    // Check request body for toothNumbers
    if (toothNumbers.length === 0 && request.body) {
      if (request.body.toothNumbers) {
        if (typeof request.body.toothNumbers === 'string') {
          toothNumbers = request.body.toothNumbers.split(',')
            .map((num: string) => parseInt(num.trim(), 10))
            .filter((num: number) => !isNaN(num));
        } else if (Array.isArray(request.body.toothNumbers)) {
          toothNumbers = request.body.toothNumbers
            .map((num: any) => typeof num === 'string' ? parseInt(num, 10) : num)
            .filter((num: number) => !isNaN(num));
        }
      }
    }

    // Also check for indexed toothNumbers fields (toothNumbers[0], toothNumbers[1], etc.)
    for (const key in request.body) {
      if (key.startsWith('toothNumbers[')) {
        const value = parseInt(request.body[key], 10);
        if (!isNaN(value) && !toothNumbers.includes(value)) {
          toothNumbers.push(value);
        }
      }
    }

    console.log('Parsed toothNumbers (numbers):', toothNumbers);

    // Ensure fileName is provided
    const fileName = createDto.fileName || request.body.fileName || imageFile.originalname;
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }

    // Upload image
    const imageUpload = await this.storageService.uploadFile(
      imageFile,
      `imaging/${createDto.patientId}/${Date.now()}_${imageFile.originalname}`,
    );

    // Upload thumbnail if provided
    let thumbnailUpload: { url: string; path: string } | null = null;
    if (thumbnailFile) {
      if (thumbnailFile.size > 10 * 1024 * 1024) {
        throw new BadRequestException('Thumbnail size too large. Maximum size is 10MB');
      }
      thumbnailUpload = await this.storageService.uploadFile(
        thumbnailFile,
        `imaging/thumbnails/${createDto.patientId}/${Date.now()}_${thumbnailFile.originalname}`,
      );
    }

    // Prepare data for creation
    const recordData = {
      patientId: createDto.patientId,
      appointmentId: createDto.appointmentId,
      visitId: createDto.visitId,
      dentistId: createDto.dentistId,
      procedureId: createDto.procedureId,
      chartEntryId: createDto.chartEntryId,
      type: createDto.type,
      stage: createDto.stage,
      source: createDto.source,
      groupId: createDto.groupId,
      fileUrl: imageUpload.url,
      thumbnailUrl: thumbnailUpload?.url,
      storagePath: imageUpload.path,
      fileName: fileName,
      fileSize: imageFile.size,
      mimeType: imageFile.mimetype,
      toothNumbers: toothNumbers, // Use the parsed numbers array
      notes: createDto.notes,
      findings: createDto.findings,
      annotations: createDto.annotations,
      takenAt: createDto.takenAt ? new Date(createDto.takenAt) : new Date(),
    };

    console.log('Final record data:', recordData);

    const record = await this.imagingService.create(recordData);

    return record;
  }

  @Get()
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async findAll(@Query() query: ImagingQueryDto) {
    return this.imagingService.findAll(query);
  }

  @Get('visit/:visitId')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async findByVisitId(@Param('visitId') visitId: string) {
  return this.imagingService.findByVisitId(visitId);
}

  @Get('group/:groupId')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.SUPER_ADMIN)
  async getGroupedImages(@Param('groupId') groupId: string) {
    return this.imagingService.getGroupedImages(groupId);
  }

  @Get('statistics/patient/:patientId')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.SUPER_ADMIN)
  async getStatistics(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.imagingService.getStatistics(patientId);
  }

  @Get(':id')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.imagingService.findOne(id);
  }

  @Patch(':id')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.SUPER_ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateImagingRecordDto,
  ) {
    return this.imagingService.update(id, updateDto);
  }

  @Delete(':id')
  // @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const record = await this.imagingService.findOne(id);

    if (record.storagePath) {
      await this.storageService.deleteFile(record.storagePath);
    }
    if (record.thumbnailUrl) {
      const thumbnailPath = record.thumbnailUrl.replace('/uploads/', '');
      if (thumbnailPath) {
        await this.storageService.deleteFile(thumbnailPath);
      }
    }

    return this.imagingService.remove(id);
  }

  @Post('compare')
  // @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.SUPER_ADMIN)
  async createComparison(@Body() createComparisonDto: CreateImagingComparisonDto) {
    return this.imagingService.createComparison(
      createComparisonDto.baseImageId,
      createComparisonDto.compareImageId,
      createComparisonDto.notes,
    );
  }

  @Delete('compare/:id')
  // @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async removeComparison(@Param('id', ParseUUIDPipe) id: string) {
    return this.imagingService.removeComparison(id);
  }
}