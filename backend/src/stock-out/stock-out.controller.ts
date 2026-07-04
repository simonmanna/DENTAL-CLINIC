import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { StockOutService } from './stock-out.service';
import { CreateStockOutDto, QueryStockOutDto } from './dto/stock-out.dto';

@Controller('stock-out')
export class StockOutController {
  constructor(private readonly stockOutService: StockOutService) {}

  // ─── Stats ─────────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@Query('locationId') locationId?: string) {
    return this.stockOutService.getStats(locationId);
  }

  // ─── Location stock (for the form) ────────────────────────────────────────
  @Get('location-stock/:locationId')
  async getLocationStock(@Param('locationId') locationId: string) {
    return this.stockOutService.getLocationStock(locationId);
  }

  // ─── Available batches for a specific item+location ───────────────────────
  @Get('batches/:itemId')
  async getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.stockOutService.getAvailableBatches(itemId, locationId);
  }

  // ─── List ─────────────────────────────────────────────────────────────────
  @Get()
  async findAll(@Query() query: QueryStockOutDto) {
    return this.stockOutService.findAll(query);
  }

  // ─── Get one ──────────────────────────────────────────────────────────────
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.stockOutService.findOne(id);
  }

  // ─── Create ───────────────────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStockOutDto,
    // Replace with @CurrentUser() decorator from your JWT guard when auth is enabled
    // @Req() req: any,
  ) {
    const performedById = undefined; // req.user?.id
    return this.stockOutService.create(dto, performedById);
  }
}