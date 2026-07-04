import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Req,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptFilterDto } from './dto/receipt-filter.dto';
import { VoidReceiptDto } from './dto/void-receipt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { extractClientContext } from '../common/audit/client-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import type { Request as ExpressRequest } from 'express';

// Receipts are created exclusively as a side-effect of recording a payment
// against an invoice — POST /billing/invoices/:id/payments. There is no
// stand-alone receipt-create endpoint because that path bypassed invoice
// balance updates, cash flow recording, overpayment validation, and base
// currency conversion. If you need to back-fill a historical receipt,
// use the seed scripts.

// C3: receipts expose patient PII + cash detail. Reads are gated to
// billing-capable roles — clinical-only roles (NURSE / PHARMACIST /
// LAB_TECHNICIAN) have no business browsing the cash book. This restricts
// WHICH roles can read; cross-patient access within a role is intentional
// (clinic staff serve all patients). Per-tenant isolation needs a clinic
// column on the financial tables — tracked as multi-clinic follow-up.
const CAN_VIEW_BILLING = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.RECEPTIONIST,
  UserRole.DENTIST,
];

@Controller('receipts')
@UseGuards(JwtAuthGuard)
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  @Roles(...CAN_VIEW_BILLING)
  findAll(@Query() filters: ReceiptFilterDto) {
    return this.receiptsService.findAll(filters);
  }

  @Get('stats')
  @Roles(...CAN_VIEW_BILLING)
  getStats(@Query('period') period: 'day' | 'week' | 'month' | 'year') {
    return this.receiptsService.getStats(period);
  }

  @Get(':id')
  @Roles(...CAN_VIEW_BILLING)
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Get(':id/print')
  @Roles(...CAN_VIEW_BILLING)
  getReceiptForPrint(@Param('id') id: string) {
    return this.receiptsService.getReceiptForPrint(id);
  }

  @Get('by-number/:receiptNumber')
  @Roles(...CAN_VIEW_BILLING)
  getByNumber(@Param('receiptNumber') receiptNumber: string) {
    return this.receiptsService.getReceiptByNumber(receiptNumber);
  }

  @Get('invoice/:invoiceId')
  @Roles(...CAN_VIEW_BILLING)
  getByInvoice(@Param('invoiceId') invoiceId: string) {
    return this.receiptsService.getReceiptsByInvoice(invoiceId);
  }

  @Patch(':id/void')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  voidReceipt(
    @Param('id') id: string,
    @Body() dto: VoidReceiptDto,
    @Req() req: ExpressRequest,
  ) {
    const ctx = extractClientContext(req);
    const actor = (req as any).user as
      | { id?: string; email?: string; fullName?: string; name?: string }
      | undefined;
    return this.receiptsService.voidReceipt(
      id,
      dto,
      actor?.id,
      ctx,
      actor?.fullName ?? actor?.name ?? actor?.email ?? null,
    );
  }
}
