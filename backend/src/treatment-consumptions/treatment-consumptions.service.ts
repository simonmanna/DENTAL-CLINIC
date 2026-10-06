import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { CreateTreatmentConsumptionDto } from './dto/create-treatment-consumption.dto';

@Injectable()
export class TreatmentConsumptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockMovementService,
    private readonly docNum: DocumentNumberService,
  ) {}

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

  async create(dto: CreateTreatmentConsumptionDto, actorUserId?: string) {
    // Resolve what is being consumed: a drug draws on its linked inventory
    // item, an inventory item on itself.
    let inventoryItemId: string;
    let itemName: string;
    if (dto.itemType === 'DRUG') {
      const drug = await this.prisma.drug.findUnique({
        where: { id: dto.itemId },
        select: { name: true, inventoryItemId: true },
      });
      if (!drug) throw new NotFoundException('Drug not found');
      if (!drug.inventoryItemId) {
        throw new BadRequestException(
          `${drug.name} is not linked to a stock item, so its use cannot be recorded against stock.`,
        );
      }
      inventoryItemId = drug.inventoryItemId;
      itemName = drug.name;
    } else {
      const item = await this.prisma.inventoryItem.findUnique({
        where: { id: dto.itemId },
        select: { id: true, name: true },
      });
      if (!item) throw new NotFoundException('Inventory item not found');
      inventoryItemId = item.id;
      itemName = item.name;
    }

    if (dto.treatmentPlanId) {
      const plan = await this.prisma.treatmentPlan.findUnique({
        where: { id: dto.treatmentPlanId },
        select: { patientId: true },
      });
      if (!plan) throw new NotFoundException('Treatment plan not found');
      if (dto.patientId && dto.patientId !== plan.patientId) {
        throw new BadRequestException('The plan belongs to a different patient.');
      }
      dto.patientId = plan.patientId;
    }

    const locationId = dto.locationId ?? (await this.defaultLocationId());
    if (!locationId) {
      throw new BadRequestException(
        'No stock location given and none configured (CLINICAL_STOCK_LOCATION).',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const consumptionCode = await this.docNum.next('CONS', tx);
      const row = await tx.treatmentConsumption.create({
        data: {
          consumptionCode,
          treatmentPlanId: dto.treatmentPlanId || null,
          patientId: dto.patientId || null,
          itemType: dto.itemType,
          itemId: dto.itemId,
          itemName,
          quantity: dto.quantity,
          unitCost: 0,
          totalCost: 0,
          notes: dto.notes,
          performedById: actorUserId ?? null,
        },
      });
      // Stock leaves through the one stock path; the cost is the cost of
      // the batches actually drawn (no client unitCost).
      const issued = await this.stock.issue(tx, {
        itemId: inventoryItemId,
        locationId,
        quantity: dto.quantity,
        referenceType: 'TREATMENT_CONSUMPTION',
        referenceId: row.id,
        notes: dto.notes ?? `Treatment consumption ${consumptionCode}`,
        performedById: actorUserId ?? null,
        itemName,
      });
      const totalCost = Math.round(issued.totalCost * 100) / 100;
      return tx.treatmentConsumption.update({
        where: { id: row.id },
        data: {
          totalCost,
          unitCost: Math.round((totalCost / dto.quantity) * 100) / 100,
        },
        include: {
          treatmentPlan: { select: { id: true, title: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        },
      });
    });
  }

  private async defaultLocationId(): Promise<string | null> {
    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'CLINICAL_STOCK_LOCATION' },
    });
    if (setting?.value) return setting.value;
    const loc = await this.prisma.location.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    return loc?.id ?? null;
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