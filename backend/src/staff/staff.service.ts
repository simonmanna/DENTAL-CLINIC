import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async findAll(role?: UserRole, search?: string) {
    return this.prisma.staff.findMany({
      where: {
        ...(role && { user: { role } }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        user: {
          select: {
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
          },
        },
        schedules: true,
        _count: { select: { appointments: true } },
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, role: true, isActive: true } },
        schedules: true,
        performanceNotes: { orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { appointments: true } },
      },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    return staff;
  }

  async update(id: string, data: any) {
    const { email, role, ...staffData } = data;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void email; // reserved for future use — User model updates should go via /users/:id
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void role;  // reserved for future use — User model updates should go via /users/:id

    return this.prisma.staff.update({
      where: { id },
      data: staffData,
    });
  }

  async updateSchedule(
    staffId: string,
    schedules: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isWorking: boolean;
    }>,
  ) {
    await this.prisma.staffSchedule.deleteMany({ where: { staffId } });
    return this.prisma.staffSchedule.createMany({
      data: schedules.map((s) => ({ ...s, staffId })),
    });
  }

  async addPerformanceNote(
    staffId: string,
    data: { period: string; notes: string; rating?: number },
  ) {
    return this.prisma.performanceNote.create({ data: { staffId, ...data } });
  }

  async getDentists() {
    return this.prisma.staff.findMany({
      where: { user: { role: 'DENTIST', isActive: true } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
        isAvailable: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }

  async toggleAvailability(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      throw new NotFoundException('Staff not found');
    }
    return this.prisma.staff.update({
      where: { id },
      data: { isAvailable: !staff.isAvailable },
    });
  }

  // Add these missing methods to StaffService:

  async create(data: any) {
    // Check email exists
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictException('Email already exists');

    // Hash password
    const hashed = await bcrypt.hash(data.password, 10);

    // Generate staff code
    const prefix = data.role.substring(0, 3).toUpperCase();
    const count = await this.prisma.staff.count({
      where: { user: { role: data.role } },
    });
    const code = `${prefix}-${String(count + 1).padStart(3, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashed,
          role: data.role,
          isActive: true,
        },
      });

      return tx.staff.create({
        data: {
          userId: user.id,
          staffCode: code,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          specialization: data.specialization,
          licenseNumber: data.licenseNumber,
          qualification: data.qualification,
          bio: data.bio,
          isAvailable: data.isAvailable ?? true,
          joiningDate: new Date(),
        },
        include: {
          user: { select: { email: true, role: true, isActive: true } },
          schedules: true,
        },
      });
    });
  }

  async remove(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException('Staff not found');
    await this.prisma.user.delete({ where: { id: staff.userId } });
    return { message: 'Staff deleted' };
  }

  async toggleActive(id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    await this.prisma.user.update({
      where: { id: staff.userId },
      data: { isActive: !staff.user.isActive },
    });

    return {
      message: `Staff ${staff.user.isActive ? 'deactivated' : 'activated'}`,
    };
  }
}
