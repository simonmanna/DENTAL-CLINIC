import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TreatmentConsumptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(params: {
    treatmentPlanId?: string;
    patientId?: string;
    from?: string;
    to?: string;
    page?: string;
  }) {
    const where: any = {};
    if (params.treatmentPlanId) where.treatmentPlanId = params.treatmentPlanId;
    if (params.patientId) where.patientId = params.patientId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    const pageNum = Math.max(1, parseInt(params.page || '1'));
    const pageSize = 20;
    const skip = (pageNum - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.treatmentConsumption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          treatmentPlan: { select: { id: true, title: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        },
      }),
      this.prisma.treatmentConsumption.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pageNum, limit: pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getById(id: string) {
    return this.prisma.treatmentConsumption.findUniqueOrThrow({
      where: { id },
      include: {
        treatmentPlan: { select: { id: true, title: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
      },
    });
  }

  async create(dto: {
    treatmentPlanId?: string;
    patientId?: string;
    itemType: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unitCost: number;
    notes?: string;
    performedById?: string;
  }) {
    const { nanoid } = await import('nanoid');
    const consumptionCode = `CONS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
    const totalCost = dto.quantity * dto.unitCost;

    return this.prisma.treatmentConsumption.create({
      data: {
        consumptionCode,
        treatmentPlanId: dto.treatmentPlanId || null,
        patientId: dto.patientId || null,
        itemType: dto.itemType,
        itemId: dto.itemId,
        itemName: dto.itemName,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        totalCost,
        notes: dto.notes,
        performedById: dto.performedById || null,
      },
      include: {
        treatmentPlan: { select: { id: true, title: true } },
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
      },
    });
  }

  async getStats(params: { from?: string; to?: string }) {
    const where: any = {};
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    const consumptions = await this.prisma.treatmentConsumption.findMany({
      where,
      select: { itemType: true, itemId: true, itemName: true, quantity: true, totalCost: true },
    });

    const topDrugs: Record<string, { drugId: string; name: string; totalQty: number; totalCost: number }> = {};
    const topItems: Record<string, { itemId: string; name: string; totalQty: number; totalCost: number }> = {};

    for (const c of consumptions) {
      const totalCost = Number(c.totalCost);
      if (c.itemType === 'DRUG') {
        if (!topDrugs[c.itemId]) {
          topDrugs[c.itemId] = { drugId: c.itemId, name: c.itemName, totalQty: 0, totalCost: 0 };
        }
        topDrugs[c.itemId].totalQty += c.quantity;
        topDrugs[c.itemId].totalCost += totalCost;
      } else {
        if (!topItems[c.itemId]) {
          topItems[c.itemId] = { itemId: c.itemId, name: c.itemName, totalQty: 0, totalCost: 0 };
        }
        topItems[c.itemId].totalQty += c.quantity;
        topItems[c.itemId].totalCost += totalCost;
      }
    }

    return {
      topDrugs: Object.values(topDrugs).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10),
      topItems: Object.values(topItems).sort((a, b) => b.totalCost - a.totalCost).slice(0, 10),
      totalCost: consumptions.reduce((s, c) => s + Number(c.totalCost), 0),
      totalRecords: consumptions.length,
    };
  }
}