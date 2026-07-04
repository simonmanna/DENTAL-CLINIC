import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { DrugsService } from './drugs.service';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';
import { QueryDrugsDto } from './dto/query-drugs.dto';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { Roles } from '../auth/decorators/roles.decorator';
// import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('Drugs')
// @ApiBearerAuth()
// @UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drugs')
export class DrugsController {
  constructor(private readonly drugsService: DrugsService) {}

  // ─── POST /drugs ────────────────────────────────────────────────────────────

  @Post()
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new drug' })
  @ApiResponse({ status: 201, description: 'Drug created successfully' })
  create(@Body() dto: CreateDrugDto) {
    return this.drugsService.create(dto);
  }

  // ─── GET /drugs ─────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get paginated list of drugs' })
  findAll(@Query() query: QueryDrugsDto) {
    return this.drugsService.findAll(query);
  }

  // ─── GET /drugs/stats ───────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get drug statistics' })
  getStats() {
    return this.drugsService.getStats();
  }

  // ─── GET /drugs/categories ──────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Get all active drug categories (for dropdowns)' })
  getCategories() {
    return this.drugsService.getCategories();
  }

  // ─── GET /drugs/:id ─────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single drug by ID' })
  @ApiParam({ name: 'id', description: 'Drug ID' })
  findOne(@Param('id') id: string) {
    return this.drugsService.findOne(id);
  }

  // ─── PATCH /drugs/:id ───────────────────────────────────────────────────────

  @Patch(':id')
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Update a drug' })
  @ApiParam({ name: 'id', description: 'Drug ID' })
  update(@Param('id') id: string, @Body() dto: UpdateDrugDto) {
    return this.drugsService.update(id, dto);
  }

  // ─── PATCH /drugs/:id/toggle ────────────────────────────────────────────────

  @Patch(':id/toggle')
  // @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  @ApiOperation({ summary: 'Toggle drug active/inactive status' })
  @ApiParam({ name: 'id', description: 'Drug ID' })
  toggleActive(@Param('id') id: string) {
    return this.drugsService.toggleActive(id);
  }

  // ─── DELETE /drugs/:id ──────────────────────────────────────────────────────

  @Delete(':id')
  // @Roles('SUPER_ADMIN', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (or deactivate if referenced) a drug' })
  @ApiParam({ name: 'id', description: 'Drug ID' })
  remove(@Param('id') id: string) {
    return this.drugsService.remove(id);
  }
}
