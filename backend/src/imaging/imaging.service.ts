// backend/src/modules/imaging/imaging.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImagingRecordDto } from './dto/create-imaging-record.dto';
import { UpdateImagingRecordDto } from './dto/update-imaging-record.dto';
import { ImagingQueryDto } from './dto/imaging-query.dto';
import { ImagingType, ImagingStage, Prisma } from '@prisma/client';

@Injectable()
export class ImagingService {
  constructor(private readonly prisma: PrismaService) {}

// backend/src/imaging/imaging.service.ts - Update the create method
async create(createImagingRecordDto: any) {
  // Verify patient exists
  const patient = await this.prisma.patient.findUnique({
    where: { id: createImagingRecordDto.patientId },
  });
  if (!patient) {
    throw new NotFoundException('Patient not found');
  }

  // If visitId is provided, verify visit exists
  if (createImagingRecordDto.visitId) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: createImagingRecordDto.visitId },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
  }

  // If appointmentId is provided, verify appointment exists
  if (createImagingRecordDto.appointmentId) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: createImagingRecordDto.appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
  }

  // Generate groupId if not provided (for grouping related images)
  let groupId = createImagingRecordDto.groupId;
  if (!groupId && createImagingRecordDto.type === ImagingType.CBCT) {
    groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  return this.prisma.imagingRecord.create({
    data: {
      ...createImagingRecordDto,
      groupId,
      toothNumbers: createImagingRecordDto.toothNumbers || [],
      takenAt: createImagingRecordDto.takenAt || new Date(),
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          patientCode: true,
        },
      },
      dentist: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      appointment: {
        select: {
          id: true,
          appointmentCode: true,
          scheduledAt: true,
        },
      },
      visit: {
        select: {
          id: true,
          visitCode: true,
          status: true,
        },
      },
    },
  });
}

  async findAll(query: ImagingQueryDto) {
    const {
      visitId,
      patientId,
      type,
      stage,
      groupId,
      fromDate,
      toDate,
      search,
      sortBy = 'takenAt',
      sortOrder = 'desc',
      page = '1',
      limit = '20',
    } = query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.ImagingRecordWhereInput = {};

    if (visitId) where.visitId = visitId;
    if (patientId) where.patientId = patientId;
    if (type) where.type = type;
    if (stage) where.stage = stage;
    if (groupId) where.groupId = groupId;

    if (fromDate || toDate) {
      where.takenAt = {};
      if (fromDate) where.takenAt.gte = new Date(fromDate);
      if (toDate) where.takenAt.lte = new Date(toDate);
    }

    if (search) {
      where.OR = [
        { fileName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { findings: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [records, total] = await Promise.all([
      this.prisma.imagingRecord.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              patientCode: true,
            },
          },
          dentist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          appointment: {
            select: {
              id: true,
              appointmentCode: true,
              scheduledAt: true,
            },
          },
          visit: {
            select: {
              id: true,
              visitCode: true,
              status: true,
            },
          },
          comparisons: {
            include: {
              compareImage: {
                select: {
                  id: true,
                  fileName: true,
                  thumbnailUrl: true,
                  type: true,
                  takenAt: true,
                },
              },
            },
          },
          comparedWith: {
            include: {
              baseImage: {
                select: {
                  id: true,
                  fileName: true,
                  thumbnailUrl: true,
                  type: true,
                  takenAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.imagingRecord.count({ where }),
    ]);

    return {
      data: records,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findByVisitId(visitId: string) {
    return this.prisma.imagingRecord.findMany({
      where: { visitId },
      orderBy: { takenAt: 'desc' },
      include: {
        dentist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        comparisons: {
          include: {
            compareImage: {
              select: {
                id: true,
                fileName: true,
                thumbnailUrl: true,
                type: true,
                takenAt: true,
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.imagingRecord.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientCode: true,
          },
        },
        dentist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        appointment: {
          select: {
            id: true,
            appointmentCode: true,
            scheduledAt: true,
          },
        },
        visit: {
          select: {
            id: true,
            visitCode: true,
            status: true,
          },
        },
        comparisons: {
          include: {
            compareImage: {
              select: {
                id: true,
                fileName: true,
                thumbnailUrl: true,
                type: true,
                takenAt: true,
              },
            },
          },
        },
        comparedWith: {
          include: {
            baseImage: {
              select: {
                id: true,
                fileName: true,
                thumbnailUrl: true,
                type: true,
                takenAt: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Imaging record with ID ${id} not found`);
    }

    return record;
  }

  async update(id: string, updateImagingRecordDto: UpdateImagingRecordDto) {
    await this.findOne(id); // Ensure record exists

    return this.prisma.imagingRecord.update({
      where: { id },
      data: updateImagingRecordDto,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        dentist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.imagingRecord.delete({
      where: { id },
    });
  }

  async createComparison(baseImageId: string, compareImageId: string, notes?: string) {
    // Verify both images exist
    const [baseImage, compareImage] = await Promise.all([
      this.prisma.imagingRecord.findUnique({ where: { id: baseImageId } }),
      this.prisma.imagingRecord.findUnique({ where: { id: compareImageId } }),
    ]);

    if (!baseImage) throw new NotFoundException('Base image not found');
    if (!compareImage) throw new NotFoundException('Compare image not found');

    // Check if comparison already exists
    const existing = await this.prisma.imagingComparison.findFirst({
      where: {
        baseImageId,
        compareImageId,
      },
    });

    if (existing) {
      throw new BadRequestException('Comparison already exists');
    }

    return this.prisma.imagingComparison.create({
      data: {
        baseImageId,
        compareImageId,
        notes,
      },
      include: {
        baseImage: {
          select: {
            id: true,
            fileName: true,
            thumbnailUrl: true,
            type: true,
          },
        },
        compareImage: {
          select: {
            id: true,
            fileName: true,
            thumbnailUrl: true,
            type: true,
          },
        },
      },
    });
  }

  async removeComparison(id: string) {
    const comparison = await this.prisma.imagingComparison.findUnique({
      where: { id },
    });

    if (!comparison) {
      throw new NotFoundException('Comparison not found');
    }

    return this.prisma.imagingComparison.delete({
      where: { id },
    });
  }

  async getGroupedImages(groupId: string) {
    return this.prisma.imagingRecord.findMany({
      where: { groupId },
      orderBy: { takenAt: 'asc' },
      include: {
        dentist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async getStatistics(patientId: string) {
    const stats = await this.prisma.imagingRecord.aggregate({
      where: { patientId },
      _count: {
        id: true,
      },
      _min: {
        takenAt: true,
      },
      _max: {
        takenAt: true,
      },
    });

    const typeStats = await this.prisma.imagingRecord.groupBy({
      by: ['type'],
      where: { patientId },
      _count: {
        type: true,
      },
    });

    const stageStats = await this.prisma.imagingRecord.groupBy({
      by: ['stage'],
      where: { patientId, stage: { not: null } },
      _count: {
        stage: true,
      },
    });

    return {
      total: stats._count.id,
      firstImageDate: stats._min.takenAt,
      lastImageDate: stats._max.takenAt,
      byType: typeStats.map(stat => ({
        type: stat.type,
        count: stat._count.type,
      })),
      byStage: stageStats.map(stat => ({
        stage: stat.stage,
        count: stat._count.stage,
      })),
    };
  }
}