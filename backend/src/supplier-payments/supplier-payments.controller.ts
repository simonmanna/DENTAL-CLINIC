import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';

@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly service: SupplierPaymentsService) {}

  @Get()
  async getAll(
    @Query('supplierId') supplierId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('page') page?: string,
  ) {
    return this.service.getAll({ supplierId, purchaseOrderId, page });
  }

  @Post()
  async create(@Body() dto: {
    supplierId: string;
    purchaseOrderId?: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    paidAt?: string;
  }) {
    return this.service.create(dto);
  }

  @Get('supplier/:supplierId/balance')
  async getBalance(@Param('supplierId') supplierId: string) {
    return this.service.getBalance(supplierId);
  }

  @Get('stats')
  async getStats() {
    return this.service.getStats();
  }
}