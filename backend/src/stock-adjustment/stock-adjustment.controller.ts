import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StockAdjustmentService } from './stock-adjustment.service';
import {
  CreateStockAdjustmentDto,
  ApproveAdjustmentDto,
  StockAdjustmentFilterDto,
} from './dto/stock-adjustment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

//@UseGuards(JwtAuthGuard, RolesGuard)
//@UseGuards(JwtAuthGuard)
@Controller('adjustments')
export class StockAdjustmentController {
  constructor(private readonly service: StockAdjustmentService) {}

  // GET /inventory/adjustments
  @Get()
  findAll(@Query() filter: any) {
    // ← Use `any` to bypass validation
    console.log('Query params:', filter);
    return this.service.findAll(filter);
  }

  // GET /inventory/adjustments/stats
  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  // GET /inventory/adjustments/search-items?query=xxx&locationId=yyy
  @Get('search-items')
  searchItems(
    @Query('query') query: string,
    @Query('locationId') locationId: string,
  ) {
    return this.service.searchItems(query ?? '', locationId);
  }

  // GET /inventory/adjustments/location-stock/:locationId
  @Get('location-stock/:locationId')
  getLocationStock(@Param('locationId') locationId: string) {
    return this.service.getLocationStock(locationId);
  }

  // GET /inventory/adjustments/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // POST /inventory/adjustments
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStockAdjustmentDto, @Request() req: any) {
    // In production use req.user.id from JWT
    const performedById = req.user?.id ?? 'system';
    return this.service.create(dto, performedById);
  }

  // PATCH /inventory/adjustments/:id/approve
  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveAdjustmentDto,
    @Request() req: any,
  ) {
    const approvedById = req.user?.id ?? 'system';
    return this.service.approve(id, dto, approvedById);
  }

  // PATCH /inventory/adjustments/:id/reject
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @Request() req: any,
  ) {
    const rejectedById = req.user?.id ?? 'system';
    return this.service.reject(id, body.notes ?? '', rejectedById);
  }
}
