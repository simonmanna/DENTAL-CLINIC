// src/payments/payments.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened payments controller (post-audit).
//   • @Roles restored on every write — no more "anyone can record a vendor
//     payment".
//   • Idempotency-Key + client-context on POST/void.
//   • DELETE /payments/:id removed entirely — the only safe way to remove a
//     payment is void + retention period. Hard-deletes lose audit trail.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { extractClientContext } from '../common/audit/client-context';
import { PaymentFilterDto } from './dto/payment-filter.dto';
import type { Request } from 'express';

interface RequestWithUser extends Request {
  user: { id: string; email: string; role: UserRole };
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const ctx = extractClientContext(req);
    // Idempotency replay — the service will short-circuit on a repeated key.
    const replay = idempotencyKey
      ? await this.paymentsService.findExistingByIdempotencyKey(idempotencyKey)
      : null;
    if (replay) return replay;

    // Full name for the audit row (falls back to email if your auth payload
    // doesn't carry a name; controller is the right place to look this up
    // once per request, not inside the service).
    const actorName =
      (req.user as any)?.fullName ??
      (req.user as any)?.name ??
      req.user?.email ??
      null;

    switch (dto.type) {
      case 'PURCHASE_ORDER':
        return this.paymentsService.createPurchaseOrderPayment(
          dto.sourceId,
          dto.amount,
          dto.method,
          req.user.id,
          dto.reference,
          dto.bankName,
          dto.chequeNumber,
          dto.transactionId,
          dto.notes,
          dto.paidAt ? new Date(dto.paidAt) : undefined,
          dto.accountId,
          undefined,
          ctx,
          actorName,
        );

      case 'EXPENSE':
        return this.paymentsService.createExpensePayment(
          dto.sourceId,
          dto.amount,
          dto.method,
          req.user.id,
          dto.reference,
          dto.bankName,
          dto.chequeNumber,
          dto.transactionId,
          dto.notes,
          dto.paidAt ? new Date(dto.paidAt) : undefined,
          dto.accountId,
          undefined,
          ctx,
          actorName,
        );

      case 'INVOICE_RECEIPT':
        throw new Error('Invoice payments should be handled by billing service');

      default:
        throw new Error(`Unsupported payment type: ${dto.type}`);
    }
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAll(@Query() filters: PaymentFilterDto) {
    return this.paymentsService.findAll(filters);
  }

  @Get('purchase-order/:purchaseOrderId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getPurchaseOrderPayments(@Param('purchaseOrderId') purchaseOrderId: string) {
    return this.paymentsService.getPurchaseOrderPayments(purchaseOrderId);
  }

  @Get('expense/:expenseId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getExpensePayments(@Param('expenseId') expenseId: string) {
    return this.paymentsService.getExpensePayments(expenseId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getPayment(@Param('id') id: string) {
    return this.paymentsService.getPayment(id);
  }

  @Get('summary/:contextType/:contextId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getPaymentSummary(
    @Param('contextType') contextType: string,
    @Param('contextId') contextId: string,
  ) {
    if (contextType === 'purchase-order') {
      return this.paymentsService.getPaymentSummary(contextId, undefined);
    } else if (contextType === 'expense') {
      return this.paymentsService.getPaymentSummary(undefined, contextId);
    } else {
      throw new Error(`Unsupported context type: ${contextType}`);
    }
  }

  @Get('cash-flow/entries')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getCashFlowEntries(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const paymentType = type as any;
    return this.paymentsService.getCashFlowEntriesWithPayments(
      pageNum,
      limitNum,
      paymentType,
    );
  }

  @Post(':id/void')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async voidPayment(
    @Param('id') id: string,
    @Body() body: { voidReason: string; voidedBy?: string },
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!body?.voidReason) {
      throw new Error('voidReason is required');
    }
    const replay = idempotencyKey
      ? await this.paymentsService.findExistingByIdempotencyKey(idempotencyKey)
      : null;
    if (replay) return replay;
    const ctx = extractClientContext(req);
    const actorName =
      (req.user as any)?.fullName ??
      (req.user as any)?.name ??
      req.user?.email ??
      null;
    return this.paymentsService.voidPayment(
      id,
      body.voidReason,
      body.voidedBy ?? req.user?.id,
      undefined,
      ctx,
      actorName,
    );
  }

  /**
   * Note: hard-delete of a Payment is intentionally NOT exposed here. The
   * only safe way to remove a payment is to VOID it (which preserves the
   * audit trail and rolls back the source document's balance). The
   * internal `deletePayment` method is only callable by the retention job.
   */
}