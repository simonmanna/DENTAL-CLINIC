// src/pharmacy/pharmacy-sales.controller.ts
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
import {
  CreatePharmacySaleDto,
  AddSalePaymentDto,
  DispenseMultipleDto,
} from './dto/pharmacy-sales-dto';
import { PharmacySalesService } from './pharmacy-sales.service';

@ApiTags('Pharmacy Sales')
@ApiBearerAuth()
@Controller('pharmacy/sales')
export class PharmacySalesController {
  constructor(private svc: PharmacySalesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new pharmacy sale (walk-in or prescription)',
  })
  create(@Body() dto: CreatePharmacySaleDto) {
    return this.svc.createSale(dto);
  }


    @Get()
  @ApiOperation({ summary: 'List all pharmacy sales with filters' })
  getAll(
    @Query('locationId') locationId?: string,
    @Query('patientId') patientId?: string,
    @Query('saleType') saleType?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.svc.getSales({
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


  // @Post('dispense-multiple')
  // @ApiOperation({
  //   summary: 'Dispense multiple prescriptions for same patient in one sale',
  // })

  @Post('dispense-multiple')
  @ApiOperation({
    summary: 'Dispense multiple prescriptions for same patient in one sale',
  })
  dispenseMultiple(@Body() dto: DispenseMultipleDto) {
    return this.svc.dispenseMultiple(dto);
  }

  // dispenseMultiple(@Body() dto: DispenseMultipleDto) {
  //   return this.svc.dispenseMultiple(dto);
  // }


  // @Get()
  // @ApiOperation({ summary: 'List all pharmacy sales with filters' })
  // getAll(
  //   @Query('locationId') locationId?: string,
  //   @Query('patientId') patientId?: string,
  //   @Query('saleType') saleType?: string,
  //   @Query('status') status?: string,
  //   @Query('dateFrom') dateFrom?: string,
  //   @Query('dateTo') dateTo?: string,
  //   @Query('page') page = 1,
  //   @Query('limit') limit = 20,
  // ) {
  //   return this.svc.getSales({
  //     locationId,
  //     patientId,
  //     saleType,
  //     status,
  //     dateFrom,
  //     dateTo,
  //     page: +page,
  //     limit: +limit,
  //   });
  // }

  @Get('stats')
  @ApiOperation({ summary: 'Get pharmacy sales statistics' })
  getStats(
    @Query('locationId') locationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.svc.getSalesStats(locationId, dateFrom, dateTo);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.getSale(id);
  }

  @Post(':id/payments')
  @ApiOperation({
    summary: 'Add a payment to an existing sale (credit payment)',
  })
  addPayment(@Param('id') id: string, @Body() dto: AddSalePaymentDto) {
    return this.svc.addPayment(id, dto);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Refund a sale and restore stock' })
  refund(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.svc.refundSale(id, body.reason);
  }
}
