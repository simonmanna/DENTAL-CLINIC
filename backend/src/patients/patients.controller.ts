import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  UpdatePatientDto,
  PatientQueryDto,
  CreateInsuranceDto,
} from './dto/patient.dto';
import { PatientReportQueryDto, ReportPeriod } from './dto/report-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly svc: PatientsService) {}

  // ─── Write operations ─────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.svc.create(dto);
  }

  // ─── Collection + Reporting endpoints (MUST come before :id) ───────

  @Get()
  findAll(@Query() query: PatientQueryDto) {
    return this.svc.findAll(query);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Patient list analytics (filtered KPIs)' })
  getAnalytics(@Query() query: PatientQueryDto) {
    return this.svc.getPatientAnalytics(query);
  }

  // @Get('analytics')
  // @ApiOperation({ summary: 'Patient list analytics (filtered KPIs)' })
  // getAnalytics(@Query() query: PatientQueryDto) {
  //   return this.svc.getPatientAnalytics(query);
  // }

  // @Get()
  // findAll(@Query() query: any) {
  //   return this.svc.findAll(query);
  // }

  @Get('stats')
  getStats() {
    return this.svc.getStats();
  }

  @Get('reports')
  @ApiOperation({ summary: 'Full patient analytics report' })
  @ApiQuery({ name: 'period',    enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', type: String,       required: false, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate',   type: String,       required: false, example: '2024-12-31' })
  getFullReport(@Query() query: PatientReportQueryDto) {
    return this.svc.getFullPatientReport(query);
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Patient KPI summary cards' })
  getSummaryReport() {
    return this.svc.getPatientSummary();
  }

  @Get('reports/trends')
  @ApiOperation({ summary: 'New patient registrations over time' })
  @ApiQuery({ name: 'period',    enum: ReportPeriod, required: false })
  @ApiQuery({ name: 'startDate', type: String,       required: false })
  @ApiQuery({ name: 'endDate',   type: String,       required: false })
  getTrends(@Query() query: PatientReportQueryDto) {
    const start = query.startDate ? new Date(query.startDate) : undefined;
    const end   = query.endDate   ? new Date(query.endDate)   : undefined;
    return this.svc.getRegistrationTrends(query.period, start, end);
  }

  @Get('reports/demographics')
  @ApiOperation({ summary: 'Age groups and gender distribution' })
  async getDemographics() {
    const [gender, ageGroups] = await Promise.all([
      this.svc.getGenderDistribution(),
      this.svc.getAgeGroupDistribution(),
    ]);
    return { gender, ageGroups };
  }

  @Get('reports/status')
  @ApiOperation({ summary: 'Active vs inactive patients' })
  getStatusReport() {
    return this.svc.getStatusDistribution();
  }

  @Get('reports/insurance')
  @ApiOperation({ summary: 'Insurance status breakdown' })
  getInsuranceReport() {
    return this.svc.getInsuranceDistribution();
  }

  @Get('reports/cities')
  @ApiOperation({ summary: 'Patient distribution by city' })
  getCitiesReport() {
    return this.svc.getCityDistribution();
  }

  @Get('reports/growth')
  @ApiOperation({ summary: 'Month-over-month patient growth rate' })
  getGrowthReport() {
    return this.svc.getGrowthRate();
  }

  // ─── Single-patient endpoints (:id must come LAST) ──────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.svc.deactivate(id);
  }

  @Get(':id/visits')
  getVisits(
    @Param('id') id: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.svc.getVisitHistory(id, page, limit);
  }

  @Post(':id/insurance')
  addInsurance(@Param('id') id: string, @Body() dto: CreateInsuranceDto) {
    return this.svc.addInsurance(id, dto);
  }
}