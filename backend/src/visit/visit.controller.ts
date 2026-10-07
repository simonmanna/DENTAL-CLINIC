// src/visit/visit.controller.ts
//
// Authorisation note: this controller carried no `@Roles(...)` metadata, so
// any authenticated principal — a pharmacist, a lab technician — could write
// SOAP notes, record procedures and issue prescriptions. Clinical writes are
// now restricted to the clinical roles, prescribing to prescribers, and the
// acting user is passed down so the service can audit the write and decide
// whether an amendment to a closed record is permitted.
//
// Reads stay authenticated-only: pharmacy, lab and reception screens all show
// visit context legitimately.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { VisitsService } from './visit.service';
// `import type`: ActingUser appears in decorated signatures, which
// emitDecoratorMetadata would otherwise try to emit a runtime reference for.
import type { ActingUser } from './visit.service';
import {
  CreateVisitDto,
  CreateWalkInVisitDto,
  UpdateClinicalNotesDto,
  UpdateVitalsDto,
  AddProcedureDto,
  WritePrescriptionDto,
  CompleteVisitDto,
  CancelVisitDto,
  RemoveVisitProcedureDto,
} from './visit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/** Opening and closing an encounter — front desk included. */
const CAN_MANAGE_VISIT = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
];

/** Writing into the clinical record. */
const CAN_CHART = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.NURSE,
];

/** Prescribing. Nurses chart vitals but do not prescribe. */
const CAN_PRESCRIBE = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST];

@ApiTags('Visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(private readonly svc: VisitsService) {}

  // ═════════════════════════════════════════════════════════════════════════
  //  LIST & SEARCH (static routes first to avoid :id shadowing)
  // ═════════════════════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({ summary: 'List visits with filters and pagination' })
  findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('patientId') patientId?: string,
    @Query('dentistId') dentistId?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.svc.getAllVisits({
      page,
      limit,
      status,
      date,
      patientId,
      dentistId,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get('active')
  @ApiOperation({ summary: "Get a day's active visits (default: today)" })
  getActive(@Query('date') date?: string) {
    return this.svc.getActiveVisits(date);
  }

  @Get('drugs/search')
  @ApiOperation({ summary: 'Search drugs for prescription' })
  searchDrugs(@Query('q') q = '') {
    return this.svc.searchDrugs(q);
  }

  @Get('procedures/search')
  @ApiOperation({ summary: 'Search available procedures' })
  getProcedures(@Query('q') q?: string) {
    return this.svc.getProcedures(q);
  }

  @Get('patients/:patientId/progress-reports')
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get patient progress reports' })
  getPatientProgressReports(@Param('patientId') patientId: string) {
    return this.svc.getProgressReportsByPatient(patientId);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SINGLE VISIT
  // ═════════════════════════════════════════════════════════════════════════

  @Get(':id')
  @ApiOperation({ summary: 'Get visit dashboard' })
  getOne(@Param('id') id: string) {
    return this.svc.getVisitDashboard(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get visit dashboard (explicit)' })
  getDashboard(@Param('id') id: string) {
    return this.svc.getVisitDashboard(id);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  VISIT LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════════

  @Post()
  @Roles(...CAN_MANAGE_VISIT)
  @ApiOperation({ summary: 'Create a visit from checked-in appointment' })
  create(@Body() dto: CreateVisitDto, @CurrentUser() user: ActingUser) {
    return this.svc.createVisit(dto, user);
  }

  /** @deprecated Use POST /visits instead */
  @Post('check-in')
  @Roles(...CAN_MANAGE_VISIT)
  @ApiOperation({
    summary: 'Create a visit from checked-in appointment (legacy)',
  })
  checkIn(@Body() dto: CreateVisitDto, @CurrentUser() user: ActingUser) {
    return this.svc.createVisit(dto, user);
  }

  @Post('walk-in')
  @Roles(...CAN_MANAGE_VISIT)
  @ApiOperation({
    summary: 'Open a visit for a walk-in patient (creates the appointment too)',
  })
  createWalkIn(
    @Body() dto: CreateWalkInVisitDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.createWalkInVisit(dto, user);
  }

  @Post(':id/start')
  @Roles(...CAN_CHART)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start examination' })
  startExamination(@Param('id') id: string, @CurrentUser() user: ActingUser) {
    return this.svc.startExamination(id, user);
  }

  @Post(':id/complete')
  @Roles(...CAN_CHART)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete visit' })
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteVisitDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.completeVisit(id, dto, user);
  }

  @Post(':id/cancel')
  @Roles(...CAN_MANAGE_VISIT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an open visit (patient left, wrong patient, etc.)',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelVisitDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.cancelVisit(id, dto.reason, user);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CLINICAL DATA
  // ═════════════════════════════════════════════════════════════════════════

  @Patch(':id/soap')
  @Roles(...CAN_CHART)
  @ApiOperation({ summary: 'Update SOAP notes' })
  updateSOAP(
    @Param('id') id: string,
    @Body() dto: UpdateClinicalNotesDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.updateSOAP(id, dto, user);
  }

  @Patch(':id/vitals')
  @Roles(...CAN_CHART)
  @ApiOperation({ summary: 'Update vitals' })
  updateVitals(
    @Param('id') id: string,
    @Body() dto: UpdateVitalsDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.updateVitals(id, dto, user);
  }

  @Post(':id/procedures')
  @Roles(...CAN_CHART)
  @ApiOperation({
    summary: 'Add procedure to visit (priced from the procedure catalogue)',
  })
  addProcedure(
    @Param('id') id: string,
    @Body() dto: AddProcedureDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.addProcedure(id, dto, user);
  }

  @Delete('procedures/:visitProcedureId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove a visit procedure (soft delete; stock returned, invoice line reversed)',
  })
  removeProcedure(
    @Param('visitProcedureId') visitProcedureId: string,
    @Body() dto: RemoveVisitProcedureDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.removeProcedure(visitProcedureId, dto, user);
  }

  @Post(':id/prescriptions')
  @Roles(...CAN_PRESCRIBE)
  @ApiOperation({ summary: 'Write prescription' })
  writePrescription(
    @Param('id') id: string,
    @Body() dto: WritePrescriptionDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.svc.writePrescription(id, dto, user);
  }
}
