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
import { StockTransferService } from './stock-transfer.service';
import {
  CreateStockTransferDto,
  UpdateStockTransferDto,
  CompleteTransferDto,
  StockTransferQueryDto,
} from './dto/stock-transfer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('stock-transfers')
@UseGuards(JwtAuthGuard)
export class StockTransferController {
  constructor(private readonly service: StockTransferService) {}

  @Get()
  findAll(@Query() query: StockTransferQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateStockTransferDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStockTransferDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string, @Body() dto: CompleteTransferDto, @Request() req: any) {
    return this.service.complete(id, dto, req.user.id);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Body('notes') notes?: string) {
    return this.service.cancel(id, notes);
  }

  // Helper: Get available batches for item at location (for UI)
  @Get('items/:itemId/batches')
  getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.service.getAvailableBatches(itemId, locationId);
  }
}