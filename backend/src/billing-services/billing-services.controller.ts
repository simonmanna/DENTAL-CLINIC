// src/billing-services/billing-services.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { BillingServicesService } from './billing-services.service';
import { CreateBillingServiceDto } from './dto/create-billing-service.dto';
import { UpdateBillingServiceDto } from './dto/update-billing-service.dto';
import { BillingServiceResponseDto } from './dto/billing-service-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { UseGuards } from '@nestjs/common';

// The service catalogue carries prices, so only practice management edits it;
// the roles that raise invoices need to read it.
const CAN_EDIT_CATALOGUE = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
const CAN_VIEW_CATALOGUE = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DENTIST,
  UserRole.RECEPTIONIST,
];

@ApiTags('Billing Services')
@UseGuards(JwtAuthGuard)
@Controller('billing-services')
export class BillingServicesController {
  constructor(private readonly service: BillingServicesService) {}

  @Post()
  @Roles(...CAN_EDIT_CATALOGUE)
  @ApiOperation({ summary: 'Create new billing service' })
  @ApiResponse({ status: 201, type: BillingServiceResponseDto })
  @ApiResponse({ status: 409, description: 'Service code already exists' })
  create(@Body() dto: CreateBillingServiceDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(...CAN_VIEW_CATALOGUE)
  @ApiOperation({ summary: 'Get all billing services with pagination and filters' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  findAll(
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip: number,
    @Query('take', new DefaultValuePipe(10), ParseIntPipe) take: number,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('isActive') isActive?: boolean,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.service.findAll({ skip, take, search, category, isActive, sortBy, sortOrder });
  }

  @Get(':id')
  @Roles(...CAN_VIEW_CATALOGUE)
  @ApiOperation({ summary: 'Get billing service by ID' })
  @ApiResponse({ status: 200, type: BillingServiceResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(...CAN_EDIT_CATALOGUE)
  @ApiOperation({ summary: 'Update billing service' })
  @ApiResponse({ status: 200, type: BillingServiceResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateBillingServiceDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(...CAN_EDIT_CATALOGUE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete billing service' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/toggle-favorite')
  @Roles(...CAN_VIEW_CATALOGUE)
  @ApiOperation({ summary: 'Toggle favorite status' })
  toggleFavorite(@Param('id') id: string) {
    return this.service.toggleFavorite(id);
  }

  @Post(':id/duplicate')
  @Roles(...CAN_EDIT_CATALOGUE)
  @ApiOperation({ summary: 'Duplicate billing service' })
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }
}