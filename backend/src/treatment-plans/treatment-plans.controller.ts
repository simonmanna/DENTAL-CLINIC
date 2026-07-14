// src/treatment-plans/treatment-plans.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import {
  CreateTreatmentPlanDto,
  UpdateTreatmentPlanDto,
  AddTreatmentProcedureDto,
  ReorderProceduresDto,
} from './dto/treatment-plan.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import {
  TreatmentPlansService,
  ReportFilters,
} from './treatment-plans.service';
import { ExecuteSessionDto } from './dto/execute-session.dto';
import { EditSessionDto, DeleteSessionDto } from './dto/edit-session.dto';

import type { UpdateSessionDto } from './dto/treatment-plan.dto';

import { PricingCalculationDto } from './dto/pricing-calculation.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

// Treatment plans, procedures and sessions are confidential clinical data.
// RECEPTIONIST / PHARMACIST / LAB_TECHNICIAN are EXCLUDED (least privilege) —
// mirrors CHART_ENTRY_READ_ROLES in chart-entry.controller.ts.
const CLINICAL_READ_ROLES = [
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

// Catalog + visit-ledger reads expose pricing/billing data but no diagnoses;
// front-desk staff need them to bill.
const BILLING_READ_ROLES = [
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

// Audit snapshots contain old/new JSON of clinical records — restricted to
// the roles that can already mutate those records.
const AUDIT_READ_ROLES = [
  UserRole.DENTIST,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

// Only entity types owned by this module may be read through the generic
// audit endpoint — an open entityType would let callers dump the audit trail
// of any table by guessing its model name.
const AUDITABLE_ENTITY_TYPES = new Set([
  'TreatmentPlan',
  'TreatmentProcedure',
  'ProcedureSession',
  'PatientCondition',
  'ChartEntry',
]);

@ApiTags('Treatment Plans')
@ApiBearerAuth()
@Controller('treatment-plans')
export class TreatmentPlansController {
  constructor(private readonly svc: TreatmentPlansService) {}

  // ── Catalog (MUST be before :id routes) ───────────────────────────────────
  @ApiOperation({ summary: 'Search procedure catalog' })
  @Roles(...BILLING_READ_ROLES)
  @Get('catalog/search')
  getCatalog(@Query('q') q?: string, @Query('category') category?: string) {
    return this.svc.getProcedureCatalog(q, category);
  }

  @ApiOperation({ summary: 'Get procedure categories' })
  @Roles(...BILLING_READ_ROLES)
  @Get('catalog/categories')
  getCategories() {
    return this.svc.getProcedureCategories();
  }

  // ── Ledger view (MUST be before :id routes) ───────────────────────────────
  @ApiOperation({ summary: 'Get ledger entries for a visit' })
  @Roles(...BILLING_READ_ROLES)
  @Get('ledger/visit/:visitId')
  getVisitLedger(@Param('visitId') visitId: string) {
    return this.svc.getVisitLedger(visitId);
  }

  // ── Plan CRUD ─────────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Get all treatment plans for a patient' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId')
  getPatientPlans(@Param('patientId') patientId: string) {
    return this.svc.getPatientTreatmentPlans(patientId);
  }

  @ApiOperation({ summary: 'Get single treatment plan' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getTreatmentPlan(id);
  }

  @ApiOperation({ summary: 'Create new treatment plan' })
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateTreatmentPlanDto) {
    return this.svc.createTreatmentPlan(dto);
  }

  @ApiOperation({ summary: 'Update treatment plan header' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTreatmentPlanDto) {
    return this.svc.updateTreatmentPlan(id, dto);
  }

  @ApiOperation({
    summary: 'Delete a treatment plan (only allowed when it has no procedures)',
  })
  @ApiResponse({ status: 200, description: 'Plan deleted' })
  @ApiResponse({
    status: 400,
    description: 'Plan still has procedures — cannot be deleted',
  })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  deletePlan(@Param('id') id: string) {
    return this.svc.deleteTreatmentPlan(id);
  }

  // ── Procedures within a Plan ───────────────────────────────────────────────
  @ApiOperation({ summary: 'Reorder / move procedures between visits' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Patch(':id/procedures/reorder')
  reorderProcedures(
    @Param('id') id: string,
    @Body() dto: ReorderProceduresDto,
  ) {
    return this.svc.reorderProcedures(id, dto);
  }

  @ApiOperation({ summary: 'Add procedure to treatment plan' })
  @ApiResponse({ status: 201, description: 'Procedure added successfully' })
  @ApiResponse({
    status: 400,
    description: 'Validation error or no active visit',
  })
  @ApiResponse({ status: 404, description: 'Plan or procedure not found' })
  @ApiResponse({
    status: 409,
    description:
      'Duplicate active procedure on the same tooth/surface (race-condition guard)',
  })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/procedures')
  addProcedure(
    @Param('id') id: string,
    @Body() dto: AddTreatmentProcedureDto,
    @CurrentUser('id') currentUserId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.svc.addProcedure(id, dto, currentUserId, idempotencyKey);
  }

  @ApiOperation({
    summary:
      'Retry invoice-item creation for committed procedures that have none (billing-drift recovery)',
  })
  @Roles(UserRole.ADMIN, UserRole.DENTIST)
  @Post(':id/procedures/reconcile-invoices')
  reconcileInvoices(@Param('id') planId: string) {
    return this.svc.reconcileMissingInvoiceItems(planId);
  }

  @ApiOperation({ summary: 'Remove procedure from treatment plan' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Delete(':id/procedures/:procedureId')
  removeProcedure(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Body() body: { reason?: string } = {},
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.svc.removeProcedure(
      id,
      procedureId,
      currentUserId,
      body.reason,
    );
  }

  @ApiOperation({ summary: 'Mark procedure as completed (all sessions)' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/complete')
  markComplete(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
    @Body('visitId') visitId: string | undefined,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.svc.markProcedureComplete(id, procedureId, visitId, currentUserId);
  }

  @ApiOperation({ summary: 'Cancel a procedure' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/cancel')
  cancelProcedure(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Body() body: { reason?: string } = {},
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.svc.cancelProcedure(
      planId,
      procedureId,
      body.reason,
      currentUserId,
    );
  }

  // ── Sessions within a Procedure ────────────────────────────────────────────
  @ApiOperation({ summary: 'Get all sessions for a procedure' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':id/procedures/:procedureId/sessions')
  getSessions(
    @Param('id') id: string,
    @Param('procedureId') procedureId: string,
  ) {
    return this.svc.getProcedureSessions(id, procedureId);
  }

  @ApiOperation({ summary: 'Create a new session for a procedure' })
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions')
  createSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.svc.createSession(planId, procedureId, dto);
  }

  @ApiOperation({
    summary: 'Record / update a session (clinical notes, completion)',
  })
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Patch(':id/procedures/:procedureId/sessions/:sessionId')
  updateSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.svc.updateSession(planId, procedureId, sessionId, dto);
  }

  @ApiOperation({ summary: 'Manually add a session to the ledger' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions/:sessionId/ledger')
  addSessionToLedger(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.addSessionToLedger(planId, procedureId, sessionId);
  }

  @ApiOperation({
    summary: 'Add an extra session to a multi-session procedure',
  })
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions/extra')
  addExtraSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Body()
    dto: {
      visitGroup: number;
      sessionCost: number;
      notes?: string;
      autoBill?: boolean;
      visitId?: string;
      providerId?: string;
    },
  ) {
    return this.svc.addExtraSession(planId, procedureId, dto);
  }

  // @ApiOperation({
  //   summary: 'Execute/Complete a treatment session with ledger integration',
  // })
  // @Post(':id/procedures/:procedureId/sessions/execute')
  // async executeSession(
  //   @Param('id') planId: string,
  //   @Param('procedureId') procedureId: string,
  //   @Body() dto: CreateSessionDto & { autoAddToLedger?: boolean },
  // ) {
  //   if (!dto.dentistId) {
  //     throw new BadRequestException('dentistId is required');
  //   }
  //   if (dto.sessionCost === undefined || dto.sessionCost === null) {
  //     throw new BadRequestException('sessionCost is required');
  //   }
  //   return this.svc.executeSession(planId, procedureId, {
  //     ...dto,
  //     performedDate: dto.performedDate || new Date().toISOString(),
  //   });
  // }

  // Atomic create-and-execute: no sessionId — the service creates the PENDING
  // session inside the execution transaction, so a failed execute never leaks an
  // orphan session and a retry can't accumulate empty ones.
  @ApiOperation({
    summary: 'Create a session and execute it in a single atomic transaction',
  })
  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions/execute')
  async createAndExecuteSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Body() dto: ExecuteSessionDto,
    @CurrentUser('id') currentUserId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.dentistId) {
      throw new BadRequestException('dentistId is required');
    }

    return this.svc.executeSession(
      planId,
      procedureId,
      {
        ...dto,
        sessionId: undefined,
        performedDate: dto.performedDate || new Date().toISOString(),
        idempotencyKey: idempotencyKey || undefined,
      },
      currentUserId,
    );
  }

  @Roles(UserRole.DENTIST, UserRole.NURSE, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions/:sessionId/execute')
  async executeSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: ExecuteSessionDto,
    @CurrentUser('id') currentUserId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.dentistId) {
      throw new BadRequestException('dentistId is required');
    }

    return this.svc.executeSession(
      planId,
      procedureId,
      {
        ...dto,
        sessionId,
        performedDate: dto.performedDate || new Date().toISOString(),
        idempotencyKey: idempotencyKey || undefined,
      },
      currentUserId,
    );
  }

  // ── Plan utilities ─────────────────────────────────────────────────────────
  @ApiOperation({ summary: 'Get plan summary and statistics' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':id/summary')
  getPlanSummary(@Param('id') planId: string) {
    return this.svc.getPlanSummary(planId);
  }

  @ApiOperation({ summary: 'Duplicate a treatment plan' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/duplicate')
  duplicatePlan(
    @Param('id') planId: string,
    @Body('newPatientId') newPatientId?: string,
  ) {
    return this.svc.duplicatePlan(planId, newPatientId);
  }

  @ApiOperation({ summary: 'Get all treatment procedures for a patient' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId/procedures')
  async getPatientProcedures(@Param('patientId') patientId: string) {
    return this.svc.getPatientProcedures(patientId);
  }

  @ApiOperation({ summary: 'Get procedures for a specific tooth' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId/tooth/:toothNumber/procedures')
  async getToothProcedures(
    @Param('patientId') patientId: string,
    @Param('toothNumber') toothNumber: string,
  ) {
    return this.svc.getToothProcedures(patientId, parseInt(toothNumber));
  }

  // In treatment-plans.controller.ts, add these routes:

  @ApiOperation({
    summary: 'Get patient conditions linkable to a procedure (filter by teeth)',
  })
  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId/conditions')
  getPatientConditions(
    @Param('patientId') patientId: string,
    @Query('teeth') teeth?: string, // comma-separated tooth numbers
  ) {
    const toothNumbers = teeth
      ? teeth.split(',').map(Number).filter(Boolean)
      : undefined;
    return this.svc.getPatientConditionsForTeeth(patientId, toothNumbers);
  }

  @ApiOperation({ summary: 'Get condition links for a procedure' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':id/procedures/:procedureId/conditions')
  getProcedureConditionLinks(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
  ) {
    return this.svc.getProcedureConditionLinks(planId, procedureId);
  }

  @ApiOperation({ summary: 'Update condition links for a procedure' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Patch(':id/procedures/:procedureId/conditions')
  updateProcedureConditionLinks(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Body('linkedConditionIds') linkedConditionIds: string[],
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.svc.updateProcedureConditionLinks(
      planId,
      procedureId,
      linkedConditionIds,
      currentUserId,
    );
  }

  // After the executeSession route:

  @ApiOperation({
    summary: 'Edit session surfaces and notes (audited correction)',
  })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Patch(':id/procedures/:procedureId/sessions/:sessionId/edit')
  editSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: EditSessionDto,
  ) {
    return this.svc.editSession(planId, procedureId, sessionId, dto);
  }

  @ApiOperation({
    summary:
      'Soft-delete a session and reverse every side effect (chart entries, ledger, imaging links, progress-report links)',
  })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Delete(':id/procedures/:procedureId/sessions/:sessionId')
  deleteSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: DeleteSessionDto,
  ) {
    return this.svc.deleteSession(planId, procedureId, sessionId, dto);
  }

  // Backwards-compatible alias for the old `POST .../void` route.
  @ApiOperation({ summary: 'Deprecated alias for DELETE session' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':id/procedures/:procedureId/sessions/:sessionId/void')
  voidSession(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: DeleteSessionDto,
  ) {
    return this.svc.deleteSession(planId, procedureId, sessionId, dto);
  }

  @ApiOperation({ summary: 'Get audit history for a session' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':id/procedures/:procedureId/sessions/:sessionId/edits')
  getSessionEditHistory(
    @Param('id') planId: string,
    @Param('procedureId') procedureId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.getSessionEditHistory(planId, procedureId, sessionId);
  }

  @ApiOperation({
    summary:
      'Generic audit log for any entity (newest first). entityType is the model name, e.g. "ProcedureSession".',
  })
  @Roles(...AUDIT_READ_ROLES)
  @Get('audit/:entityType/:entityId')
  getEntityAuditLog(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    if (!AUDITABLE_ENTITY_TYPES.has(entityType)) {
      throw new BadRequestException(
        `entityType must be one of: ${[...AUDITABLE_ENTITY_TYPES].join(', ')}`,
      );
    }
    return this.svc.getEntityAuditLog(entityType, entityId);
  }

  @ApiOperation({ summary: 'Get all executed procedure sessions for a visit' })
  @Roles(...CLINICAL_READ_ROLES)
  @Get('visit/:visitId/sessions')
  getSessionsByVisit(@Param('visitId') visitId: string) {
    return this.svc.getSessionsByVisit(visitId);
  }

  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId/sessions')
  getPatientExecutedSessions(@Param('patientId') patientId: string) {
    return this.svc.getPatientExecutedSessions(patientId);
  }

  @Roles(...CLINICAL_READ_ROLES)
  @Get('patient/:patientId/patient-visits')
  async getPatientVisits(@Param('patientId') patientId: string) {
    return this.svc.getPatientVisits(patientId);
  }

  // In visits service/controller
  // src/visits/visits.service.ts

  @ApiOperation({ summary: 'Treatment plans report (paginated & filterable)' })
  @ApiResponse({ status: 200, description: 'Report returned successfully' })
  @Roles(...AUDIT_READ_ROLES)
  @Get('reports/plans')
  getTreatmentPlansReport(@Query() filters: any) {
    return this.svc.getTreatmentPlansReport(filters as ReportFilters);
  }

  @ApiOperation({ summary: 'Procedures report (paginated & filterable)' })
  @ApiResponse({ status: 200, description: 'Report returned successfully' })
  @Roles(...AUDIT_READ_ROLES)
  @Get('reports/procedures')
  getProceduresReport(@Query() filters: any) {
    return this.svc.getProceduresReport(filters as ReportFilters);
  }

  @ApiOperation({ summary: 'Sessions report (paginated & filterable)' })
  @ApiResponse({ status: 200, description: 'Report returned successfully' })
  @Roles(...AUDIT_READ_ROLES)
  @Get('reports/sessions')
  getSessionsReport(@Query() filters: any) {
    return this.svc.getSessionsReport(filters as ReportFilters);
  }

  @Roles(...BILLING_READ_ROLES)
  @Post('pricing/calculate')
  @ApiOperation({ summary: 'Calculate procedure pricing preview' })
  @ApiBody({ type: PricingCalculationDto })
  async calculateProcedurePricing(@Body() dto: PricingCalculationDto) {
    return this.svc.calculateProcedurePricing(dto);
  }
}
