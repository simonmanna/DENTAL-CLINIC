// src/suppliers/suppliers.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-hardened suppliers controller (post-audit).
//   • @Roles on every endpoint — RECEPTIONIST cannot create/edit/delete vendors.
//   • Soft-delete by default; hard-delete reserved for retention job.
// ─────────────────────────────────────────────────────────────────────────────
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
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierQueryDto } from './dto/supplier-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { extractClientContext } from '../common/audit/client-context';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: any,
    @Body() dto: CreateSupplierDto,
    @CurrentUser('id') actorId: string | undefined,
  ) {
    const ctx = extractClientContext(req);
    return this.suppliersService.create(dto, actorId, ctx.ipAddress, ctx.userAgent);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PHARMACIST)
  findAll(@Query() query: SupplierQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PHARMACIST)
  getStats() {
    return this.suppliersService.getStats();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PHARMACIST)
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('id') actorId: string | undefined,
  ) {
    const ctx = extractClientContext(req);
    return this.suppliersService.update(id, dto, actorId, ctx.ipAddress, ctx.userAgent);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser('id') actorId: string | undefined,
  ) {
    const ctx = extractClientContext(req);
    return this.suppliersService.remove(
      id,
      body?.reason ?? 'No reason supplied',
      actorId,
      ctx.ipAddress,
      ctx.userAgent,
    );
  }

  @Post(':id/restore')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  restore(
    @Req() req: any,
    @Param('id') id: string,
    @CurrentUser('id') actorId: string | undefined,
  ) {
    const ctx = extractClientContext(req);
    return this.suppliersService.restore(id, actorId, ctx.ipAddress, ctx.userAgent);
  }
}