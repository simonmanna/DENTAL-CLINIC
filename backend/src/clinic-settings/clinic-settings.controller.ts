import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ClinicSettingsService } from './clinic-settings.service';
import { CreateClinicSettingDto, UpdateClinicSettingDto } from './dto/clinic-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Clinic Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clinic-settings')
export class ClinicSettingsController {
  constructor(private readonly svc: ClinicSettingsService) {}

  @Post()
  // @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateClinicSettingDto) {
    return this.svc.create(dto);
  }

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':key')
  findByKey(@Param('key') key: string) {
    return this.svc.findByKey(key);
  }

  @Patch(':id')
  // @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateClinicSettingDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  // @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
