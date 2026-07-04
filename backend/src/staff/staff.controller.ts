// src/staff/staff.controller.ts (simplified version without RBAC)
import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
// @UseGuards(JwtAuthGuard) // Just use JWT guard for now
export class StaffController {
  constructor(private svc: StaffService) {}

  @Post()
  create(@Body() data: any) {
    return this.svc.create(data);
  }

  @Get()
  findAll(@Query('role') role?: UserRole, @Query('search') search?: string) {
    return this.svc.findAll(role, search);
  }

  @Get('dentists')
  getDentists() {
    return this.svc.getDentists();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.svc.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/schedule')
  updateSchedule(@Param('id') id: string, @Body() b: { schedules: any[] }) {
    return this.svc.updateSchedule(id, b.schedules);
  }

  @Post(':id/performance')
  addPerf(@Param('id') id: string, @Body() data: any) {
    return this.svc.addPerformanceNote(id, data);
  }

  @Patch(':id/availability')
  toggleAvail(@Param('id') id: string) {
    return this.svc.toggleAvailability(id);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.svc.toggleActive(id);
  }
}