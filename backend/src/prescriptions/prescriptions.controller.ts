// src/prescriptions/prescriptions.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger'; // Ensure all imports are present
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';
import { PrescriptionsService } from './prescriptions.service';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
  PrescriptionItemDto,
  EditPrescriptionDto,
} from './dto/create-prescription.dto';
import { PrescriptionStatus } from '@prisma/client';

@ApiTags('Prescriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new prescription' })
  create(@Body() dto: CreatePrescriptionDto, @Request() req) {
    return this.prescriptionsService.create(dto, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all prescriptions with filters, search, and sorting' })
  @ApiQuery({ name: 'status', required: false, enum: PrescriptionStatus })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'visitId', required: false })
  @ApiQuery({ name: 'dentistId', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by code, patient name, or drug name',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'ISO date (inclusive lower bound on createdAt)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'ISO date (inclusive upper bound on createdAt)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'prescriptionCode', 'status', 'validUntil', 'updatedAt'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: PrescriptionStatus,
    @Query('patientId') patientId?: string,
    @Query('visitId') visitId?: string,
    @Query('dentistId') dentistId?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prescriptionsService.findAll({
      status,
      patientId,
      visitId,
      dentistId,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
      page: page ? Math.max(1, parseInt(page, 10) || 1) : 1,
      limit: limit ? Math.max(1, Math.min(100, parseInt(limit, 10) || 20)) : 20,
    });
  }

  @Get('by-visit/:visitId')
  @ApiOperation({ summary: 'Get prescriptions by visit ID' })
  findByVisit(@Param('visitId') visitId: string) {
    return this.prescriptionsService.findByVisit(visitId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a prescription by ID' })
  findOne(@Param('id') id: string) {
    return this.prescriptionsService.findOne(id);
  }

  @Patch(':id')
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Update prescription status or notes' })
  update(@Param('id') id: string, @Body() dto: UpdatePrescriptionDto) {
    return this.prescriptionsService.update(id, dto);
  }

  @Put(':id/edit')
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({
    summary: 'Full edit (replace items, notes, validUntil) – only while ACTIVE',
  })
  edit(@Param('id') id: string, @Body() dto: EditPrescriptionDto) {
    return this.prescriptionsService.edit(id, dto);
  }

  @Post(':id/dispense')
  // @Roles('PHARMACIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Dispense a prescription (deducts stock)' })
  dispense(@Param('id') id: string, @Request() req) {
    return this.prescriptionsService.dispense(id, req.user.name || 'Pharmacy');
  }

  @Delete(':id')
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a prescription (only if not dispensed)' })
  remove(@Param('id') id: string) {
    return this.prescriptionsService.remove(id);
  }

  // ─── Prescription Items ─────────────────────────────────────────────────

  @Post(':id/items')
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Add an item to existing prescription' })
  addItem(
    @Param('id') id: string,
    @Body() itemDto: PrescriptionItemDto,
    @Request() req,
  ) {
    return this.prescriptionsService.addItem(id, itemDto, req.user.userId);
  }

  @Delete(':id/items/:itemId')
  // @Roles('DENTIST', 'ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Remove an item from prescription' })
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.prescriptionsService.removeItem(id, itemId);
  }

  @ApiOperation({ summary: 'Get all prescriptions for a patient' })
  @Get('patient/:patientId')
  getByPatient(@Param('patientId') patientId: string) {
    return this.prescriptionsService.getByPatient(patientId);
  }
}
