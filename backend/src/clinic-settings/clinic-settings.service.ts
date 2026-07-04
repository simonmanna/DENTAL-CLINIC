import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicSettingDto, UpdateClinicSettingDto } from './dto/clinic-settings.dto';

@Injectable()
export class ClinicSettingsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateClinicSettingDto) {
    const existing = await this.prisma.clinicSettings.findUnique({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Setting with key "${dto.key}" already exists`);
    }
    return this.prisma.clinicSettings.create({ data: dto });
  }

  findAll() {
    return this.prisma.clinicSettings.findMany({ orderBy: { key: 'asc' } });
  }

  async findByKey(key: string) {
    const setting = await this.prisma.clinicSettings.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting with key "${key}" not found`);
    return setting;
  }

  async update(id: string, dto: UpdateClinicSettingDto) {
    const existing = await this.prisma.clinicSettings.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Setting not found');

    if (dto.key && dto.key !== existing.key) {
      const conflict = await this.prisma.clinicSettings.findUnique({
        where: { key: dto.key },
      });
      if (conflict) {
        throw new ConflictException(`Setting with key "${dto.key}" already exists`);
      }
    }

    return this.prisma.clinicSettings.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.clinicSettings.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Setting not found');
    return this.prisma.clinicSettings.delete({ where: { id } });
  }
}
