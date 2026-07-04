import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { DirectStockService } from './direct-stock.service';
import {
  DirectStockInDto,
  DirectStockOutDto,
  DirectStockQueryDto,
} from './dto/direct-stock.dto';

@Controller('direct-stock')
export class DirectStockController {
  constructor(private readonly directStockService: DirectStockService) {}

  @Post('in')
  async stockIn(@Body() dto: DirectStockInDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.directStockService.stockIn(dto, userId);
  }

  @Post('out')
  async stockOut(@Body() dto: DirectStockOutDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.directStockService.stockOut(dto, userId);
  }

  @Get('history')
  async getHistory(@Query() query: DirectStockQueryDto) {
    return this.directStockService.getHistory({
      search: query.search,
      locationId: query.locationId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  @Get('stats')
  async getStats(@Query('locationId') locationId?: string) {
    return this.directStockService.getStats(locationId);
  }

  @Get('location-stock/:locationId')
  async getLocationStock(@Param('locationId') locationId: string) {
    return this.directStockService.getLocationStock(locationId);
  }

  @Get('batches/:itemId')
  async getAvailableBatches(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.directStockService.getAvailableBatches(itemId, locationId);
  }
}
