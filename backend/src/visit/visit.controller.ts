// src/visits/visits.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { VisitsService } from './visit.service';
import {
  CreateVisitDto,
  UpdateClinicalNotesDto,
  UpdateVitalsDto,
  AddProcedureDto,
  WritePrescriptionDto,
  ProcessPaymentDto,
  CompleteVisitDto,
} from './visit.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Visits')
@ApiBearerAuth()
@Controller('visits')
export class VisitsController {
  constructor(private readonly svc: VisitsService) {}

  // ═════════════════════════════════════════════════════════════════════════════
  //  LIST & SEARCH (static routes first to avoid :id shadowing)
  // ═════════════════════════════════════════════════════════════════════════════

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
  @ApiOperation({ summary: "Get today's active visits" })
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
  @ApiOperation({ summary: 'Get patient progress reports' })
  getPatientProgressReports(@Param('patientId') patientId: string) {
    return this.svc.getProgressReportsByPatient(patientId);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  SINGLE VISIT
  // ═════════════════════════════════════════════════════════════════════════════

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

  // ═════════════════════════════════════════════════════════════════════════════
  //  VISIT LIFECYCLE
  // ═════════════════════════════════════════════════════════════════════════════

  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Create a visit from checked-in appointment' })
  create(@Body() dto: CreateVisitDto) {
    return this.svc.createVisit(dto);
  }

  /** @deprecated Use POST /visits instead */
  @Post('check-in')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Create a visit from checked-in appointment (legacy)' })
  checkIn(@Body() dto: CreateVisitDto) {
    return this.svc.createVisit(dto);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start examination' })
  startExamination(@Param('id') id: string) {
    return this.svc.startExamination(id);
  }

  @Post(':id/complete')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Complete visit' })
  complete(@Param('id') id: string, @Body() dto: CompleteVisitDto) {
    return this.svc.completeVisit(id, dto);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  //  CLINICAL DATA
  // ═════════════════════════════════════════════════════════════════════════════

  @Patch(':id/soap')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Update SOAP notes' })
  updateSOAP(@Param('id') id: string, @Body() dto: UpdateClinicalNotesDto) {
    return this.svc.updateSOAP(id, dto);
  }

  @Patch(':id/vitals')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Update vitals' })
  updateVitals(@Param('id') id: string, @Body() dto: UpdateVitalsDto) {
    return this.svc.updateVitals(id, dto);
  }

  @Post(':id/procedures')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Add procedure to visit' })
  addProcedure(@Param('id') id: string, @Body() dto: AddProcedureDto) {
    return this.svc.addProcedure(id, dto);
  }

  @Post(':id/prescriptions')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: 'Write prescription' })
  writePrescription(
    @Param('id') id: string,
    @Body() dto: WritePrescriptionDto,
  ) {
    return this.svc.writePrescription(id, dto);
  }

  // @Post(':id/payments')
  // @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  // @ApiOperation({ summary: 'Process payment' })
  // processPayment(@Param('id') id: string, @Body() dto: ProcessPaymentDto) {
  //   return this.svc.processPayment(id, dto);
  // }

}