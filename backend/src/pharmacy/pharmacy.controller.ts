// src/pharmacy/pharmacy.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PharmacySalesService } from './pharmacy-sales.service';
import {
  CreatePharmacySaleDto,
  AddSalePaymentDto,
} from './dto/pharmacy-sales-dto';
import {
  PharmacyService,
  CreateDrugDto,
  CreatePrescriptionDto,
  DrugStockDto,
} from './pharmacy.service';

@ApiTags('Pharmacy')
@ApiBearerAuth()
@Controller('pharmacy')
export class PharmacyController {
  constructor(
    private pharmacyService: PharmacyService,
    private salesService: PharmacySalesService,
  ) {}

  // ─── Drugs ─────────────────────────────────────────────────────────

  @Post('drugs')
  @ApiOperation({ summary: 'Create a new drug' })
  createDrug(@Body() dto: CreateDrugDto) {
    return this.pharmacyService.createDrug(dto);
  }

  @Get('drugs')
  @ApiOperation({ summary: 'List all drugs with filters' })
  getDrugs(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('lowStock') lowStock?: boolean,
    @Query('isActive') isActive?: boolean,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.pharmacyService.getDrugs(search, category, lowStock);
  }

  @Get('drugs/low-stock')
  @ApiOperation({ summary: 'Get low stock drugs' })
  getLowStock() {
    return this.pharmacyService.getLowStockDrugs();
  }

  @Get('drugs/categories')
  @ApiOperation({ summary: 'Get drug categories' })
  getCategories() {
    return this.pharmacyService.getDrugCategories();
  }

  @Patch('drugs/:id')
  @ApiOperation({ summary: 'Update a drug' })
  updateDrug(@Param('id') id: string, @Body() dto: Partial<CreateDrugDto>) {
    return this.pharmacyService.updateDrug(id, dto);
  }

  @Post('drugs/:id/stock')
  @ApiOperation({ summary: 'Adjust drug stock' })
  adjustStock(@Param('id') id: string, @Body() dto: DrugStockDto) {
    return this.pharmacyService.adjustStock(id, dto);
  }

  @Get('drugs/:id/transactions')
  @ApiOperation({ summary: 'Get stock transactions for a drug' })
  getTransactions(@Param('id') id: string) {
    return this.pharmacyService.getStockTransactions(id);
  }

  // ─── Prescriptions ─────────────────────────────────────────────────

  @Post('prescriptions')
  @ApiOperation({ summary: 'Create a prescription' })
  createPrescription(@Body() dto: CreatePrescriptionDto) {
    return this.pharmacyService.createPrescription(dto);
  }

  @Get('prescriptions')
  @ApiOperation({ summary: 'List prescriptions' })
  getPrescriptions(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.pharmacyService.getPrescriptions(
      patientId,
      status,
      +page,
      +limit,
    );
  }

  @Post('prescriptions/:id/dispense')
  @ApiOperation({ summary: 'Dispense a prescription' })
  dispense(@Param('id') id: string, @Body() body: { dispensedBy: string }) {
    return this.pharmacyService.dispensePrescription(id, body.dispensedBy);
  }

  // ─── Sales ───────────────────────────────────────────────────────────

  @Post('sales')
  @ApiOperation({ summary: 'Create a new pharmacy sale' })
  createSale(@Body() dto: CreatePharmacySaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get('sales')
  @ApiOperation({ summary: 'List all pharmacy sales with filters' })
  getSales(
    @Query('locationId') locationId?: string,
    @Query('patientId') patientId?: string,
    @Query('saleType') saleType?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.salesService.getSales({
      locationId,
      patientId,
      saleType,
      status,
      dateFrom,
      dateTo,
      page: +page,
      limit: +limit,
    });
  }

  @Get('sales/stats')
  @ApiOperation({ summary: 'Get pharmacy sales statistics' })
  getSalesStats(
    @Query('locationId') locationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.salesService.getSalesStats(locationId, dateFrom, dateTo);
  }

  @Get('sales/:id')
  @ApiOperation({ summary: 'Get a specific sale' })
  getSale(@Param('id') id: string) {
    return this.salesService.getSale(id);
  }

  @Post('sales/:id/payments')
  @ApiOperation({ summary: 'Add payment to a sale' })
  addPayment(@Param('id') id: string, @Body() dto: AddSalePaymentDto) {
    return this.salesService.addPayment(id, dto);
  }

  @Post('sales/:id/refund')
  @ApiOperation({ summary: 'Refund a sale' })
  refund(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.salesService.refundSale(id, body.reason);
  }

  // ─── Dashboard (Missing in your code!) ───────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Get pharmacy dashboard data' })
  getDashboard() {
    // You need to implement this in your service
    return (
      this.pharmacyService.getDashboard?.() || {
        message: 'Dashboard endpoint - implement in service',
      }
    );
  }
}
