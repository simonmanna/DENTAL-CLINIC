// src/purchase/purchase.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ApprovePurchaseOrderDto,
  CreateDeliveryDto,
  CreatePurchasePaymentDto,
  PurchaseOrderQueryDto,
  InventoryLedgerQueryDto,
} from './dto/purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────
  @Get('dashboard')
  getDashboard() {
    return this.purchaseService.getPurchaseDashboard();
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────
  @Get('orders')
  getOrders(@Query() query: PurchaseOrderQueryDto) {
    return this.purchaseService.getPurchaseOrders(query);
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.purchaseService.getPurchaseOrder(id);
  }

  @Post('orders')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createOrder(@Body() dto: CreatePurchaseOrderDto, @Request() req: any) {
    return this.purchaseService.createPurchaseOrder(dto, req.user.id);
  }

  @Put('orders/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  updateOrder(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseService.updatePurchaseOrder(id, dto);
  }

  @Patch('orders/:id/submit')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @HttpCode(HttpStatus.OK)
  submitOrder(@Param('id') id: string) {
    return this.purchaseService.submitPurchaseOrder(id);
  }

  @Patch('orders/:id/approve')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  approveOrder(
    @Param('id') id: string,
    @Body() dto: ApprovePurchaseOrderDto,
    @Request() req: any,
  ) {
    return this.purchaseService.approvePurchaseOrder(id, req.user.id, dto);
  }

  @Patch('orders/:id/cancel')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  cancelOrder(@Param('id') id: string) {
    return this.purchaseService.cancelPurchaseOrder(id);
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────
  @Get('orders/:id/deliveries')
  getOrderDeliveries(@Param('id') id: string) {
    return this.purchaseService.getPurchaseOrderDeliveries(id);
  }

  @Get('deliveries/:id')
  getDelivery(@Param('id') id: string) {
    return this.purchaseService.getDelivery(id);
  }

  @Post('deliveries')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createDelivery(@Body() dto: CreateDeliveryDto, @Request() req: any) {
    return this.purchaseService.createDelivery(dto, req.user.id);
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  @Patch('deliveries/:id/void')
  @Roles('SUPER_ADMIN', 'ADMIN')
  voidDelivery(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.purchaseService.voidDelivery(id, reason, req.user.id);
  }

  @Get('orders/:id/payments')
  getPayments(@Param('id') id: string) {
    return this.purchaseService.getPurchasePayments(id);
  }

  @Post('payments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  createPayment(@Body() dto: CreatePurchasePaymentDto, @Request() req: any) {
    // FIX DOUBLE-PAY-PATH: the duplicate PO-payment path in
    // purchase.service.createPurchasePayment has been removed; this endpoint
    // now delegates to PaymentsService.createPurchaseOrderPayment so both
    // routes (POST /payments and POST /purchases/payments) hit the same
    // row-locked transactional implementation.
    return this.purchaseService.createPurchasePaymentViaPaymentsService(
      dto,
      req.user.id,
    );
  }

  // ── Stock Adjustments and Waste Records ────────────────────────────────────
  //
  // Moved out of this controller. Both used to be served here by a second,
  // divergent implementation in PurchaseService that wrote location stock
  // without touching the batch rows the rest of the system treats as truth,
  // and applied with no approval step. Use the owning modules:
  //
  //    /adjustments   StockAdjustmentController  (batch-aware, PENDING → APPROVED)
  //    /waste         WasteController            (batch-aware, PENDING → APPROVED)

  // ── Inventory Ledger (replaces /stock-logs) ────────────────────────────────
  @Get('inventory-ledger')
  getInventoryLedger(@Query() query: InventoryLedgerQueryDto) {
    return this.purchaseService.getInventoryLedger(query);
  }

  // ── Location Stock ─────────────────────────────────────────────────────────
  @Get('locations/:locationId/stock')
  getLocationStock(@Param('locationId') locationId: string) {
    return this.purchaseService.getLocationStock(locationId);
  }
}
