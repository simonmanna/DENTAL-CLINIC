// src/treatment-plans/treatment-plans-edit.controller.ts
// NEW ROUTES — wire into your main AppModule or merge into TreatmentPlansController.
//
// Endpoints added:
//   GET    /treatment-plans/:planId/procedures/:procedureId/delete-eligibility
//   PATCH  /treatment-plans/:planId/procedures/:procedureId/edit
//   POST   /treatment-plans/:planId/procedures/:procedureId/cancel
//   DELETE /treatment-plans/:planId/procedures/:procedureId

import { Controller, Get, Patch, Post, Param, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { TreatmentPlansEditService } from './treatment-plans-edit.service';
import { UpdateTreatmentProcedureDto } from './dto/update-treatment-procedure.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

// Mirrors CLINICAL_READ_ROLES in treatment-plans.controller.ts — clinical
// reads exclude front-desk roles.
const CLINICAL_READ_ROLES = [
  UserRole.DENTIST,
  UserRole.NURSE,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

// NOTE — the `cancel` and `DELETE` endpoints were intentionally removed from
// this controller. They live in `TreatmentPlansController` so that there is
// exactly ONE canonical route per procedure mutation. (NestJS will happily
// register two controllers on the same path; whichever Express matched first
// won, and route resolution became brittle.)
//
// What stays here:
//   • GET    .../delete-eligibility   — UI gate for showing Delete vs Cancel
//   • PATCH  .../edit                 — field-guarded edit (locks toothNumbers
//                                       once sessions exist; honours editReason)

@ApiTags('Treatment Plans — Edit')
@ApiBearerAuth()
@Controller('treatment-plans')
export class TreatmentPlansEditController {
  constructor(private readonly editSvc: TreatmentPlansEditService) {}

  // ── 1. Check delete eligibility (UI calls this before showing button) ───────

  @ApiOperation({
    summary: 'Check if a procedure can be hard-deleted or only cancelled',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns canDelete, canCancel, reason, sessionsCount, paymentStatus, status',
  })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':planId/procedures/:procedureId/delete-eligibility')
  checkDeleteEligibility(
    @Param('planId') planId: string,
    @Param('procedureId') procedureId: string,
  ) {
    return this.editSvc.checkProcedureDeleteEligibility(planId, procedureId);
  }

  // ── 2. Edit procedure (field-guarded) ────────────────────────────────────────

  @ApiOperation({
    summary: 'Edit a procedure — field locking enforced server-side',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated procedure with audit + optional warning',
  })
  @ApiResponse({
    status: 400,
    description: 'Locked field violation or price guard',
  })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Patch(':planId/procedures/:procedureId/edit')
  updateProcedure(
    @Param('planId') planId: string,
    @Param('procedureId') procedureId: string,
    @Body() dto: UpdateTreatmentProcedureDto,
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    // Audit actor pulled from JWT — body cannot lie about who edited.
    return this.editSvc.updateProcedureWithGuards(
      planId,
      procedureId,
      dto,
      currentUserId,
    );
  }

  // ── Which status transitions are allowed from the current one? ─────────
  // Frontend uses this to render only valid options in the status dropdown.
  @ApiOperation({
    summary: 'Get allowed status transitions from the current procedure status',
  })
  @Roles(...CLINICAL_READ_ROLES)
  @Get(':planId/procedures/:procedureId/allowed-status-transitions')
  getAllowedStatusTransitions(
    @Param('planId') planId: string,
    @Param('procedureId') procedureId: string,
  ) {
    return this.editSvc.getAllowedStatusTransitions(planId, procedureId);
  }

  // ── Restore a cancelled procedure back to PLANNED ─────────────────────
  @ApiOperation({
    summary: 'Restore a CANCELLED procedure back to PLANNED',
    description:
      'Reverses a prior cancellation: status → PLANNED, cancellationReason cleared, ' +
      'previously-superseded chart entries flipped back to ACTIVE. Requires a reason; ' +
      'audited as a RESTORE action.',
  })
  @ApiResponse({ status: 200, description: 'Procedure restored' })
  @ApiResponse({ status: 404, description: 'Procedure not found' })
  @ApiResponse({
    status: 409,
    description: 'Procedure is not in CANCELLED status',
  })
  @Roles(UserRole.DENTIST, UserRole.ADMIN)
  @Post(':planId/procedures/:procedureId/restore')
  restoreProcedure(
    @Param('planId') planId: string,
    @Param('procedureId') procedureId: string,
    @Body() body: { reason: string },
    @CurrentUser('id') currentUserId: string | undefined,
  ) {
    return this.editSvc.restoreCancelledProcedure(
      planId,
      procedureId,
      body?.reason ?? '',
      currentUserId,
    );
  }
}
