// src/fixed-assets/fixed-assets.controller.ts

import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, Request, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FixedAssetsService } from './fixed-assets.service';
import {
  CreateFixedAssetDto, UpdateFixedAssetDto, DisposeAssetDto,
  CreateMaintenanceDto, CompleteMaintenanceDto, TransferAssetDto,
  PostDepreciationDto, FixedAssetQueryDto,
} from './dto/fixed-assets.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';


@Controller('fixed-assets')
@Public()
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard)
export class FixedAssetsController {
  constructor(private readonly service: FixedAssetsService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  // ── Assets CRUD ───────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateFixedAssetDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id);
  }

  @Get()
  findAll(@Query() query: FixedAssetQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFixedAssetDto, @Request() req: any) {
    return this.service.update(id, dto, req.user?.id);
  }

  // ── Disposal ──────────────────────────────────────────────────────────────

  @Post(':id/dispose')
  @HttpCode(HttpStatus.OK)
  dispose(@Param('id') id: string, @Body() dto: DisposeAssetDto, @Request() req: any) {
    return this.service.dispose(id, dto, req.user?.id);
  }

  // ── Transfer ──────────────────────────────────────────────────────────────

  @Post('transfer')
  transfer(@Body() dto: TransferAssetDto, @Request() req: any) {
    return this.service.transfer(dto, req.user?.id);
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  @Post('maintenance')
  createMaintenance(@Body() dto: CreateMaintenanceDto, @Request() req: any) {
    return this.service.createMaintenance(dto, req.user?.id);
  }

  @Patch('maintenance/:maintenanceId/complete')
  completeMaintenance(
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: CompleteMaintenanceDto,
    @Request() req: any,
  ) {
    return this.service.completeMaintenance(maintenanceId, dto, req.user?.id);
  }

  // ── Depreciation ──────────────────────────────────────────────────────────

  @Post('depreciation/post')
  @HttpCode(HttpStatus.OK)
  postDepreciation(@Body() dto: PostDepreciationDto, @Request() req: any) {
    return this.service.postDepreciation(dto, req.user?.id);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// src/fixed-assets/fixed-assets.module.ts
// ─────────────────────────────────────────────────────────────────────────────

/*
import { Module } from '@nestjs/common';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
  exports: [FixedAssetsService],
})
export class FixedAssetsModule {}
*/

// Add FixedAssetsModule to your AppModule imports array.
// That's the only change needed in app.module.ts.
