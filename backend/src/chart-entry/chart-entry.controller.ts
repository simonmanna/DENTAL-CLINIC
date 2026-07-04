// src/chart-entry/chart-entry.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChartEntryService } from './chart-entry.service';
import {
  QuickActionDto,
  CreateChartEntryDto,
  UpdateChartEntryDto,
  ChartEntryStatus,
  AddExistingProcedureDto,
} from './dto/chart-entry.dto';
import { UpdateConditionDto } from './dto/chart-entry.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { extractClientContext } from '../common/audit/client-context';

// Diagnoses + chart history are confidential clinical data. RECEPTIONIST /
// PHARMACIST / LAB_TECHNICIAN are EXCLUDED (least privilege) — front-desk
// staff schedule and bill, they do not read diagnoses or chart entries.
// Mirrors PATIENT_CONDITION_READ_ROLES in conditions.controller.ts.
const CHART_ENTRY_READ_ROLES = [
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

@ApiTags('Chart Entries')
@ApiBearerAuth()
@Controller('chart-entries')
@UseGuards(JwtAuthGuard)
export class ChartEntryController {
  constructor(private readonly chartEntryService: ChartEntryService) {}

  @Get()
  @Roles(...CHART_ENTRY_READ_ROLES)
  getPatientEntries(
    @Query('patientId') patientId: string,
    @Query('visitId') visitId?: string,
  ) {
    return this.chartEntryService.getPatientEntries(patientId, visitId);
  }

  @Get('tooth/:patientId/:toothNumber')
  @Roles(...CHART_ENTRY_READ_ROLES)
  getToothHistory(
    @Param('patientId') patientId: string,
    @Param('toothNumber') toothNumber: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.chartEntryService.getToothHistory(
      patientId,
      parseInt(toothNumber, 10),
      limit != null ? parseInt(limit, 10) : undefined,
      offset != null ? parseInt(offset, 10) : undefined,
    );
  }

  @Post()
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  createEntry(@Body() dto: CreateChartEntryDto, @Request() req) {
    // Prefer explicit providerId from body; fall back to JWT staff
    return this.chartEntryService.createEntry({
      ...dto,
      providerId: dto.providerId ?? req.user?.staffId,
    });
  }

  @Post('quick-action')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  // AUDIT-FORENSIC: client context flows into every audit row this quick
  // action creates (chart entry / treatment plan / procedure / session).
  quickAction(@Body() dto: QuickActionDto, @Request() req) {
    // req.user.id is the auth User id — pass it as actorUserId so every
    // record the quick action creates lands an AuditLog row stamped with
    // who created it. Previously the quick-action engine wrote NO audit,
    // leaving the chart/condition/treatment-plan trail incomplete on the
    // very path clinicians use most.
    const ctx = extractClientContext(req);
    return this.chartEntryService.executeQuickAction(
      {
        ...dto,
        providerId: dto.providerId ?? req.user?.staffId, // ← inject from JWT
      },
      req.user?.id ?? null,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // Atomic supersede of every ACTIVE ChartEntry that points at the same
  // PatientCondition — used by the edit-condition flow so the old multi-tooth
  // rows are closed in one round-trip before the new ones are written.
  @Patch('supersede-by-condition/:patientConditionId')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  @HttpCode(HttpStatus.OK)
  supersedeByPatientCondition(
    @Param('patientConditionId') patientConditionId: string,
  ) {
    return this.chartEntryService.supersedeByPatientCondition(
      patientConditionId,
    );
  }

  @Patch(':id')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  updateEntry(
    @Param('id') id: string,
    @Body() dto: UpdateChartEntryDto,
    @Request() req,
  ) {
    const ctx = extractClientContext(req);
    return this.chartEntryService.updateEntry(id, dto, req.user?.id, ctx.ipAddress, ctx.userAgent);
  }

  @Patch(':id/supersede')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  @HttpCode(HttpStatus.OK)
  supersedeEntry(
    @Param('id') id: string,
    @Body() b?: { expectedVersion?: number },
  ) {
    return this.chartEntryService.supersedeEntry(id, b?.expectedVersion);
  }

  @Post('existing')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  addExistingProcedure(@Body() dto: AddExistingProcedureDto, @Request() req) {
    return this.chartEntryService.addExistingProcedure({
      ...dto,
      providerId: dto.providerId ?? req.user?.staffId,
    });
  }

  @Patch(':id/condition')
  @Roles(UserRole.DENTIST, UserRole.NURSE)
  @HttpCode(HttpStatus.OK)
  updateCondition(
    @Param('id') id: string,
    @Body() dto: UpdateConditionDto,
    @Request() req,
  ) {
    const ctx = extractClientContext(req);
    return this.chartEntryService.updateCondition(
      id,
      {
        ...dto,
        // Inject logged-in staff as fallback if not explicitly provided
        providerId: dto.providerId ?? req.user?.staffId,
      },
      req.user?.id,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Patch(':id/void')
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  voidEntry(
    @Param('id') id: string,
    @Body() b: { reason?: string; expectedVersion?: number },
    @Request() req,
  ) {
    const ctx = extractClientContext(req);
    return this.chartEntryService.voidEntry(
      id,
      b?.reason,
      req.user?.id,
      ctx.ipAddress,
      ctx.userAgent,
      b?.expectedVersion,
    );
  }
}
