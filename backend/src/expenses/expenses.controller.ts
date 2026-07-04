// src/expenses/expenses.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened expense controller (post-audit).
//   • @Roles on every endpoint — receptionists cannot create/approve/pay/void.
//   • Idempotency-Key header replay for every write (browser-retry safe).
//   • Client-context (IP / user-agent) extracted once and threaded through to
//     the audit log; pay/void endpoints accept it via @Req().
//   • Soft-delete only — financial rows are never hard-deleted.
//   • DRFT-only edits: APPROVED rows must be voided + recreated, or amended
//     through the new POST /expenses/:id/amend flow (re-enters approval queue).
// ─────────────────────────────────────────────────────────────────────────────
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
  Headers,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ExpensesService,
  CreateExpenseDto,
  UpdateExpenseDto,
  ApproveExpenseDto,
  PayExpenseDto,
  VoidExpenseDto,
  PayPartialExpenseDto,
  AmendExpenseDto,
} from './expenses.service';
import { ExpenseStatus, ExpensePaymentStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { extractClientContext } from '../common/audit/client-context';

function actorOf(req: any): { id: string | null; email: string | null } {
  return {
    id: req?.user?.id ?? req?.user?.userId ?? null,
    email: req?.user?.email ?? null,
  };
}

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.PHARMACIST)
  @ApiOperation({
    summary:
      'Create an expense. Idempotent via Idempotency-Key header (24h replay).',
  })
  create(
    @Req() req: any,
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') actorId: string | undefined,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.createExpense(
      dto,
      { id: actorId, email: req.user?.email ?? null },
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List expenses with filters' })
  getAll(
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: ExpenseStatus,
    @Query('paymentStatus') paymentStatus?: ExpensePaymentStatus,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('paymentType') paymentType?: string,
    @Query('limit') limit = 20,
  ) {
    return this.svc.getExpenses({
      categoryId,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      search,
      paymentType,
      page: +page,
      limit: +limit,
    });
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Expense statistics' })
  getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.svc.getExpenseStats(dateFrom, dateTo);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single expense' })
  getOne(@Param('id') id: string) {
    return this.svc.getExpenseById(id);
  }

  @Get(':id/audit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Audit trail for an expense (incl. its payments)' })
  getAudit(@Param('id') id: string) {
    return this.svc.getExpenseAudit(id);
  }

  // PATCH restricted to DRAFT only. APPROVED rows must be voided + recreated
  // or amended through POST /:id/amend (which re-enters approval queue).
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Update a DRAFT expense (APPROVED requires amend)' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.updateExpense(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // POST /:id/amend — explicit re-approval flow for APPROVED expenses.
  // Creates a draft amendment (carry-over fields) and requires re-approval,
  // preserving a full audit trail of who-changed-what-when and why.
  @Post(':id/amend')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.PHARMACIST)
  @ApiOperation({
    summary:
      'Request amendment of an APPROVED expense (re-enters approval queue)',
  })
  amend(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AmendExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.amendExpense(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // Soft-delete only — never hard-deletes a financial row. Reports can still
  // surface deleted rows in an "archive" view by passing ?includeDeleted=true.
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Soft-delete an expense (never hard-deletes a financial row)',
  })
  @HttpCode(HttpStatus.OK)
  delete(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { deletedReason: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!body?.deletedReason?.trim()) {
      throw new Error('deletedReason is required');
    }
    const ctx = extractClientContext(req);
    return this.svc.softDeleteExpense(
      id,
      body.deletedReason,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Post(':id/restore')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore a soft-deleted expense' })
  restore(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.restoreExpense(
      id,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // ─── Workflow ───────────────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a DRAFT expense' })
  approve(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ApproveExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.approveExpense(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Post(':id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a DRAFT/APPROVED expense' })
  reject(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.rejectExpense(
      id,
      body?.reason,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Post(':id/cancel')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DENTIST, UserRole.NURSE, UserRole.PHARMACIST)
  @ApiOperation({ summary: 'Cancel an unpaid expense (creator-self allowed)' })
  cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.cancelExpense(
      id,
      body?.reason,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Post(':id/void')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Void an expense — reverses ALL underlying payments and their cash flow',
  })
  void(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: VoidExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.voidExpense(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // Full payment — covers the entire remaining balance.
  @Post(':id/pay')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pay the remaining balance of an APPROVED expense' })
  pay(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: PayExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.payExpense(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  // Partial payment — caller specifies the amount. Overpayment is rejected.
  @Post(':id/pay-partial')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Pay a partial amount of an APPROVED expense (overpayment rejected)',
  })
  payPartial(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: PayPartialExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    return this.svc.payExpensePartial(
      id,
      dto,
      actorOf(req),
      idempotencyKey,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payments for an expense' })
  getPayments(@Param('id') id: string) {
    return this.svc.getExpensePayments(id);
  }
}