// src/modules/conditions/conditions.controller.ts
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
    HttpCode,
    HttpStatus,
    UseGuards,
    Request,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { ConditionsService } from './conditions.service';
import { CreateConditionDto } from './dto/create-condition.dto';
import { UpdateConditionDto } from './dto/update-condition.dto';
import { ConditionQueryDto } from './dto/condition-query.dto';
import { CreatePatientConditionDto } from './dto/create-patient-condition.dto';
import { UpdatePatientConditionDto } from './dto/update-patient-condition.dto';
import {
  CreatePatientConditionsBatchDto,
  UpdatePatientConditionsBatchDto,
} from './dto/batch-patient-condition.dto';
import { PatientConditionQueryDto } from './dto/patient-condition-query.dto';
import { ResolvePatientConditionDto } from './dto/resolve-patient-condition.dto';
import { DeletePatientConditionDto } from './dto/delete-patient-condition.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { extractClientContext } from '../common/audit/client-context';

import { Condition, PatientCondition, UserRole } from '@prisma/client';

// Diagnoses are confidential clinical data. RECEPTIONIST is intentionally
// EXCLUDED (least privilege) — front-desk staff schedule and bill, they do
// not read diagnoses or condition audit logs. ADMIN/SUPER_ADMIN retain access
// for clinical correction and oversight (and bypass @Roles globally anyway).
//
// TODO(multi-tenant): once `clinicId` is added to Patient + User and the JWT
// carries the claim, add a clinic-scope check so a clinician in clinic A
// cannot read diagnoses for a patient in clinic B.
const PATIENT_CONDITION_READ_ROLES = [
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
];

// The condition CATALOG is non-patient reference data (diagnosis definitions
// + codes). Readable by any clinical role incl. front desk so the UI can label
// codes, but explicitly gated rather than left open to every authenticated
// principal.
const CONDITION_CATALOG_READ_ROLES = [
    UserRole.DENTIST,
    UserRole.NURSE,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.RECEPTIONIST,
];

@ApiTags('Conditions')
@ApiBearerAuth()
@Controller('conditions')
export class ConditionsController {
    constructor(private readonly conditionsService: ConditionsService) { }

    // ==================== Condition Catalog Endpoints ====================

    @Get()
    @Roles(...CONDITION_CATALOG_READ_ROLES)
    async findAll(@Query() query: ConditionQueryDto) {
        return this.conditionsService.findAll({
            isActive: query.isActive,
            isFavourite: query.isFavourite,
            category: query.category,
            search: query.search,
        });
    }
    // @Get()
    // @ApiOperation({ summary: 'Get all conditions' })
    // @ApiQuery({ name: 'isActive', required: false, type: Boolean })
    // @ApiQuery({ name: 'isFavourite', required: false, type: Boolean })
    // @ApiQuery({ name: 'category', required: false, type: String })
    // @ApiQuery({ name: 'search', required: false, type: String })
    // @ApiResponse({ status: 200, description: 'Returns list of conditions' })
    // async findAll(@Query() query: ConditionQueryDto): Promise<Condition[]> {
    //     return this.conditionsService.findAll(query);
    // }

    // NOTE: GET /conditions/:id is declared at the END of this controller.
    // A parametric `:id` route registered before the static `patient` routes
    // would greedily capture `GET /conditions/patient` (matching id="patient"),
    // shadowing findPatientConditions. NestJS registers handlers in declaration
    // order, so all `patient/*` routes must precede the bare `:id` route.

    @Post()
    @Roles(UserRole.ADMIN, UserRole.DENTIST)
    @ApiOperation({ summary: 'Create a new condition' })
    @ApiResponse({ status: 201, description: 'Condition created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input or duplicate name' })
    async create(
        @Body() dto: CreateConditionDto,
        @CurrentUser('id') actorUserId: string | undefined,
        @Request() req: any,
    ): Promise<Condition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.create(dto, false, actorUserId, ctx.ipAddress, ctx.userAgent);
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN, UserRole.DENTIST)
    @ApiOperation({ summary: 'Update a condition' })
    @ApiResponse({ status: 200, description: 'Condition updated successfully' })
    @ApiResponse({ status: 404, description: 'Condition not found' })
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateConditionDto,
        @CurrentUser('id') actorUserId: string | undefined,
        @Request() req: any,
    ): Promise<Condition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.update(id, dto, actorUserId, ctx.ipAddress, ctx.userAgent);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Delete a condition' })
    @ApiResponse({ status: 204, description: 'Condition deleted successfully' })
    @ApiResponse({ status: 403, description: 'Cannot delete system condition' })
    @ApiResponse({ status: 400, description: 'Condition is in use' })
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(
        @Param('id') id: string,
        @CurrentUser('id') actorUserId: string | undefined,
        @Request() req: any,
    ): Promise<void> {
        const ctx = extractClientContext(req);
        await this.conditionsService.remove(id, actorUserId, ctx.ipAddress, ctx.userAgent);
    }

    @Patch(':id/favourite')
    @Roles(UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({ summary: 'Toggle favourite status' })
    @ApiResponse({ status: 200, description: 'Favourite status toggled' })
    async toggleFavourite(
        @Param('id') id: string,
        @CurrentUser('id') actorUserId: string | undefined,
        @Request() req: any,
    ): Promise<Condition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.toggleFavourite(id, actorUserId, ctx.ipAddress, ctx.userAgent);
    }

    // ==================== Patient Condition Endpoints ====================

@Get('patient')
@Roles(...PATIENT_CONDITION_READ_ROLES)
@ApiOperation({ summary: 'Get patient conditions' })
@ApiResponse({ status: 200, description: 'Returns list of patient conditions' })
@ApiResponse({ status: 404, description: 'Patient not found' })
async findPatientConditions(
    @Query() query: PatientConditionQueryDto,
): Promise<PatientCondition[]> {
    return this.conditionsService.findPatientConditions(
        query.patientId,
        query.visitId,
    );
}

@Get('patient/:id')
@Roles(...PATIENT_CONDITION_READ_ROLES)
@ApiOperation({ summary: 'Get patient condition by ID' })
@ApiResponse({ status: 200, description: 'Returns the patient condition' })
@ApiResponse({ status: 404, description: 'Patient condition not found' })
async findOnePatientCondition(@Param('id') id: string): Promise<PatientCondition> {
    return this.conditionsService.findOnePatientCondition(id);
}

    @Post('patient')
    @Roles(UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({ summary: 'Create a patient condition' })
    async createPatientCondition(
        @Body() dto: CreatePatientConditionDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Headers('idempotency-key') idempotencyKey?: string,
        @Request() req?: any,
    ): Promise<PatientCondition> {
        // The audit actor is always the LOGGED-IN user (User.id from JWT).
        // `providerId` / `diagnosedBy` stay as clinical fields on the row.
        // I1: optional Idempotency-Key — replays the original 201 if the
        // client retries (network blip / double-click / two browser tabs).
        const ctx = extractClientContext(req);
        return this.conditionsService.createPatientCondition(
            dto,
            currentUserId,
            idempotencyKey,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

    // ── Batch: atomic multi-tooth create ─────────────────────────────────────
    // Wraps the whole set in a single $transaction. Either every (PatientCondition
    // + ChartEntry) lands or none does — fixes the "click save twice → 11 instead
    // of 8" duplication when the loop bails halfway through.
    @Post('patient/batch')
    @Roles(UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({
        summary:
            'Atomic batch create of patient conditions across multiple teeth (one TX)',
    })
    async createPatientConditionsBatch(
        @Body() body: CreatePatientConditionsBatchDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Headers('idempotency-key') idempotencyKey?: string,
        @Request() req?: any,
    ) {
        const ctx = extractClientContext(req);
        return this.conditionsService.createPatientConditionsBatch(
            body.entries,
            body.chartEntries ?? [],
            currentUserId,
            idempotencyKey,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

    // Batch update — supersedes the prior chart entries for the same
    // PatientCondition(s) and rewrites them atomically.
    @Patch('patient/batch')
    @Roles(UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({
        summary:
            'Atomic batch update — supersede stale ChartEntries for a patient condition and rewrite per tooth',
    })
    async updatePatientConditionsBatch(
        @Body() body: UpdatePatientConditionsBatchDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Headers('idempotency-key') idempotencyKey?: string,
        @Request() req?: any,
    ) {
        const ctx = extractClientContext(req);
        return this.conditionsService.updatePatientConditionWithChartEntries(
            body.patientConditionId,
            body.update,
            body.chartEntries,
            currentUserId,
            idempotencyKey,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

    @Patch('patient/:id')
    @Roles(UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({ summary: 'Update a patient condition' })
    @ApiResponse({ status: 200, description: 'Patient condition updated successfully' })
    @ApiResponse({ status: 404, description: 'Patient condition not found' })
    async updatePatientCondition(
        @Param('id') id: string,
        @Body() dto: UpdatePatientConditionDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Headers('idempotency-key') idempotencyKey?: string,
        @Request() req?: any,
    ): Promise<PatientCondition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.updatePatientCondition(
            id,
            dto,
            currentUserId,
            idempotencyKey,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

    @Delete('patient/:id')
    @Roles(UserRole.DENTIST, UserRole.ADMIN)
    @ApiOperation({
        summary:
            'Soft-delete a patient condition (clinical history is preserved; row is hidden by default and ACTIVE chart entries are voided)',
    })
    @ApiResponse({ status: 200, description: 'Patient condition soft-deleted' })
    @ApiResponse({
        status: 400,
        description: 'Reason is required',
    })
    async removePatientCondition(
        @Param('id') id: string,
        @Body() dto: DeletePatientConditionDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Request() req?: any,
    ): Promise<{ success: boolean }> {
        const ctx = extractClientContext(req);
        await this.conditionsService.removePatientCondition(
            id,
            currentUserId,
            dto.reason,
            ctx.ipAddress,
            ctx.userAgent,
        );
        return { success: true };
    }

    @Post('patient/:id/restore')
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: 'Restore a soft-deleted patient condition' })
    @ApiResponse({ status: 200, description: 'Patient condition restored' })
    async restorePatientCondition(
        @Param('id') id: string,
        @CurrentUser('id') currentUserId: string | undefined,
        @Request() req?: any,
    ): Promise<PatientCondition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.restorePatientCondition(
            id,
            currentUserId,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

    @Patch('patient/:id/resolve')
    @Roles(UserRole.DENTIST, UserRole.NURSE)
    @ApiOperation({ summary: 'Mark patient condition as resolved' })
    @ApiResponse({ status: 200, description: 'Patient condition resolved' })
    async resolvePatientCondition(
        @Param('id') id: string,
        @Body() dto: ResolvePatientConditionDto,
        @CurrentUser('id') currentUserId: string | undefined,
        @Request() req?: any,
    ): Promise<PatientCondition> {
        const ctx = extractClientContext(req);
        return this.conditionsService.resolvePatientCondition(
            id,
            currentUserId,
            dto.procedureId,
            ctx.ipAddress,
            ctx.userAgent,
        );
    }

@Get('patient/:id/audit-log')
@Roles(...PATIENT_CONDITION_READ_ROLES)
@ApiOperation({
    summary: 'Audit history for a patient condition (newest first)',
})
async getPatientConditionAuditLog(@Param('id') id: string) {
    return this.conditionsService.getPatientConditionAuditLog(id);
}

    // ==================== Catalog by-id (declared last — see note above) ====================

    @Get(':id')
    @Roles(...CONDITION_CATALOG_READ_ROLES)
    @ApiOperation({ summary: 'Get condition by ID' })
    @ApiResponse({ status: 200, description: 'Returns the condition' })
    @ApiResponse({ status: 404, description: 'Condition not found' })
    async findOne(@Param('id') id: string): Promise<Condition> {
        return this.conditionsService.findOne(id);
    }
}