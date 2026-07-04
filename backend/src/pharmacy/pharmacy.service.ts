// src/pharmacy/pharmacy.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionStatus, StockLedgerType, Prisma } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Helper: Generate ledger code (match your existing genCode utility) ─────
function genLedgerCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ILG-${new Date().getFullYear()}-${timestamp}${random}`;
}

// ─── DTOs ───────────────────────────────────────────────────────────────────
export class CreateDrugDto {
  name: string;
  genericName?: string;
  categoryId?: string;
  form?: string;
  strength?: string;
  manufacturer?: string;
  unit?: string;
  unitPrice?: number;
  sellPrice?: number;
  minStock?: number;
  requiresPrescription?: boolean;
  sideEffects?: string;
  contraindications?: string;
  inventoryItemId?: string;
}

export class CreatePrescriptionDto {
  patientId: string;
  dentistId: string;
  visitId: string;
  notes?: string;
  validUntil?: string;
  items: Array<{
    drugId: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    route?: string;
    instructions?: string;
  }>;
}

export class DrugStockDto {
  type: 'PURCHASE' | 'USAGE' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
  reference?: string;
  performedBy?: string;
}

@Injectable()
export class PharmacyService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // DRUGS - Linked to InventoryItem
  // ═══════════════════════════════════════════════════════════════════════════

  async createDrug(dto: CreateDrugDto) {
    const { inventoryItemId, categoryId, ...drugData } = dto;

    const data: Prisma.DrugCreateInput = {
      ...drugData,
      unit: dto.unit || 'tablet',
    };

    if (inventoryItemId) {
      data.inventoryItem = { connect: { id: inventoryItemId } };
    }

    if (categoryId) {
      data.category = { connect: { id: categoryId } };
    }

    return this.prisma.drug.create({ data });
  }

  async getDrugs(
    search?: string,
    categoryId?: string,
    lowStock?: boolean,
    locationId?: string,
  ) {
    const drugs = await this.prisma.drug.findMany({
      where: {
        isActive: true,
        ...(categoryId && { categoryId }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { genericName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            minQuantity: true,
            unitCost: true, // ✅ For dashboard/value calculations
            locationStocks: {
              where: locationId ? { locationId } : undefined,
              select: {
                id: true, // ✅ For potential updates
                locationId: true, // ✅ For JS filtering
                quantity: true, // ✅ For stock calculations
              },
            },
          },
        },
        category: { select: { id: true, name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (lowStock) {
      return drugs.filter((d) => {
        if (!d.inventoryItem) return false;
        const totalQty = d.inventoryItem.locationStocks.reduce(
          (sum, s) => sum + s.quantity,
          0,
        );
        return totalQty <= (d.inventoryItem.minQuantity || 0);
      });
    }

    return drugs;
  }

  // async getDrugs(
  //   search?: string,
  //   categoryId?: string,
  //   lowStock?: boolean,
  //   locationId?: string,
  // ) {
  //   // ✅ Include locationStocks instead of quantity
  //   const drugs = await this.prisma.drug.findMany({
  //     where: {
  //       isActive: true,
  //       ...(categoryId && { categoryId }),
  //       ...(search && {
  //         OR: [
  //           { name: { contains: search, mode: 'insensitive' } },
  //           { genericName: { contains: search, mode: 'insensitive' } },
  //         ],
  //       }),
  //     },
  //     include: {
  //       inventoryItem: {
  //         select: {
  //           id: true,
  //           // ❌ REMOVED: quantity: true,
  //           minQuantity: true,
  //           unitCost: true,
  //           // ✅ ADD locationStocks for aggregation
  //           locationStocks: locationId
  //             ? { where: { locationId }, select: { quantity: true } }
  //             : { select: { quantity: true } },
  //         },
  //       },
  //       category: {
  //         select: { id: true, name: true, code: true },
  //       },
  //     },
  //     orderBy: { name: 'asc' },
  //   });

  //   if (lowStock) {
  //     return drugs.filter((d) => {
  //       if (!d.inventoryItem) return false;

  //       // ✅ Aggregate quantity from locationStocks
  //       const totalQty = d.inventoryItem.locationStocks.reduce(
  //         (sum, s) => sum + s.quantity,
  //         0,
  //       );

  //       return totalQty <= (d.inventoryItem.minQuantity || 0);
  //     });
  //   }

  //   return drugs;
  // }

  async getLowStockDrugs(locationId?: string) {
    const drugs = await this.prisma.drug.findMany({
      where: { isActive: true },
      include: {
        inventoryItem: {
          select: {
            // ✅ Include all fields you'll need later
            id: true,
            minQuantity: true,
            unitCost: true, // ✅ Add this!
            locationStocks: locationId
              ? {
                  where: { locationId },
                  select: { quantity: true, locationId: true },
                }
              : { select: { quantity: true, locationId: true } }, // ✅ Add locationId here too
          },
        },
      },
    });
    return drugs.filter((d) => {
      if (!d.inventoryItem) return false;

      // ✅ Aggregate from locationStocks
      const totalQty = d.inventoryItem.locationStocks.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );

      return totalQty <= (d.inventoryItem.minQuantity || 0);
    });
  }

  async updateDrug(id: string, dto: Partial<CreateDrugDto>) {
    const { inventoryItemId, categoryId, ...updateData } = dto;

    const data: Prisma.DrugUpdateInput = { ...updateData };

    if (inventoryItemId !== undefined) {
      data.inventoryItem = { connect: { id: inventoryItemId } };
    }

    if (categoryId !== undefined) {
      data.category = { connect: { id: categoryId } };
    }

    return this.prisma.drug.update({ where: { id }, data });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STOCK ADJUSTMENT - Using InventoryLedger ✅
  // ═══════════════════════════════════════════════════════════════════════════

  async adjustStock(drugId: string, dto: DrugStockDto, locationId?: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
      include: { inventoryItem: true },
    });

    if (!drug) throw new NotFoundException('Drug not found');
    if (!drug.inventoryItem)
      throw new BadRequestException('Drug is not linked to inventory');

    const inventoryItem = drug.inventoryItem;

    // ❌ REMOVED: const currentQty = inventoryItem.quantity;
    // ❌ REMOVED: const newQty = currentQty + quantityChange;

    const quantityChange =
      dto.type === 'PURCHASE' || dto.type === 'RETURN'
        ? dto.quantity
        : -dto.quantity;

    // Map DTO type to StockLedgerType enum
    const ledgerTypeMap: Record<string, StockLedgerType> = {
      PURCHASE: StockLedgerType.PURCHASE_RECEIPT,
      USAGE: StockLedgerType.USAGE,
      ADJUSTMENT:
        quantityChange > 0
          ? StockLedgerType.ADJUSTMENT_IN
          : StockLedgerType.ADJUSTMENT_OUT,
      RETURN: StockLedgerType.RETURN_IN,
    };

    await this.prisma.$transaction(async (tx) => {
      // ✅ ONLY update location-level stock (no master quantity)
      if (locationId) {
        // Get location stock before change for ledger snapshot
        const locationStock = await tx.inventoryLocationStock.findFirst({
          where: { itemId: inventoryItem.id, locationId },
          select: { id: true, quantity: true },
        });
        const qtyBefore = locationStock?.quantity ?? 0;
        const qtyAfter = qtyBefore + quantityChange;

        if (qtyAfter < 0) {
          throw new BadRequestException(
            `Insufficient stock at location. Available: ${qtyBefore}, Requested: ${Math.abs(quantityChange)}`,
          );
        }

        // 1. Upsert location stock
        if (locationStock) {
          await tx.inventoryLocationStock.update({
            where: { id: locationStock.id }, // ✅ id is now available
            data: { quantity: qtyAfter },
          });
        } else {
          await tx.inventoryLocationStock.create({
            data: {
              itemId: inventoryItem.id,
              locationId,
              quantity: Math.max(0, qtyAfter),
            },
          });
        }

        // 2. Optional: Link to specific batch if batchNumber provided
        let batchId: string | null = null;
        if (dto.batchNumber) {
          const batch = await tx.inventoryBatch.findFirst({
            where: {
              itemId: inventoryItem.id,
              locationId,
              batchNumber: dto.batchNumber,
            },
            select: { id: true },
          });
          batchId = batch?.id ?? null;
        }

        // 3. ✅ Write InventoryLedger entry
        await tx.inventoryLedger.create({
          data: {
            ledgerCode: genLedgerCode(),
            itemId: inventoryItem.id,
            locationId,
            batchId,
            type: ledgerTypeMap[dto.type],
            quantityBefore: qtyBefore,
            quantityChange,
            quantityAfter: qtyAfter,
            unitCost: dto.unitCost ?? toNum(inventoryItem.unitCost),
            totalValue:
              Math.abs(quantityChange) *
              (dto.unitCost ?? toNum(inventoryItem.unitCost)),
            referenceType: 'DRUG_ADJUSTMENT',
            referenceId: drugId,
            notes:
              dto.notes ??
              `Stock ${dto.type.toLowerCase()}: ${dto.reference ?? ''}`,
            performedById: dto.performedBy ?? null,
          },
        });
      }

      // ❌ REMOVED: Master inventoryItem.quantity update
      // await tx.inventoryItem.update({ ... });
    });

    return this.prisma.drug.findUnique({
      where: { id: drugId },
      include: {
        inventoryItem: {
          select: {
            id: true,
            unitCost: true,
            minQuantity: true,
            locationStocks: { select: { quantity: true, locationId: true } },
          },
        },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRESCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async createPrescription(dto: CreatePrescriptionDto) {
    const code = `RX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return this.prisma.prescription.create({
      data: {
        prescriptionCode: code,
        patientId: dto.patientId,
        dentistId: dto.dentistId,
        visitId: dto.visitId,
        notes: dto.notes,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        items: {
          create: dto.items.map((item) => ({
            ...item,
            refills: 0, // Default value
          })),
        },
      },
      include: {
        items: { include: { drug: true } },
        patient: {
          select: { firstName: true, lastName: true, patientCode: true },
        },
        dentist: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getPrescriptions(
    patientId?: string,
    status?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(patientId && { patientId }),
      ...(status && { status: status as PrescriptionStatus }),
    };
    const [total, records] = await Promise.all([
      this.prisma.prescription.count({ where }),
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: { include: { drug: true } },
          patient: {
            select: { firstName: true, lastName: true, patientCode: true },
          },
          dentist: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    return { data: records, meta: { total, page, limit } };
  }

  async dispensePrescription(
    id: string,
    dispensedBy: string,
    locationId?: string,
  ) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        // ✅ Ensure nested includes are correct
        items: {
          include: {
            drug: {
              include: {
                inventoryItem: {
                  select: {
                    id: true,
                    unitCost: true,
                    locationStocks: {
                      where: locationId ? { locationId } : undefined,
                      select: {
                        quantity: true,
                        locationId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.status !== PrescriptionStatus.ACTIVE)
      throw new BadRequestException('Prescription is not active');

    const effectiveLocationId =
      locationId ?? (await this.resolvePharmacyLocation());

    for (const item of rx.items) {
      if (!item.drug?.inventoryItem) continue;

      // Check stock at specific location
      const locationStock = item.drug.inventoryItem.locationStocks?.find(
        (s) => s.locationId === effectiveLocationId,
      );
      const availableQty = locationStock?.quantity ?? 0;

      if (availableQty < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${item.drug.name}" at pharmacy location. ` +
            `Available: ${availableQty}, Required: ${item.quantity}`,
        );
      }

      // Deduct stock
      await this.adjustStock(
        item.drugId,
        {
          type: 'USAGE',
          quantity: item.quantity,
          unitCost: toNum(item.drug.inventoryItem.unitCost),
          reference: rx.prescriptionCode,
          performedBy: dispensedBy,
          notes: `Dispensed for prescription ${rx.prescriptionCode}`,
        },
        effectiveLocationId,
      );
    }

    // ✅ FIXED: Added 'data:' here
    return this.prisma.prescription.update({
      where: { id },
      data: {
        // ← add this line
        status: PrescriptionStatus.DISPENSED,
        dispensedAt: new Date(),
        dispensedBy,
      }, // ← closes data object
    });
  }

  // Helper: Resolve pharmacy location (same pattern as pharmacy-sales.service)
  private async resolvePharmacyLocation(): Promise<string> {
    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'PHARMACY_LOCATION' },
    });

    if (setting?.value) {
      const loc = await this.prisma.location.findUnique({
        where: { id: setting.value },
        select: { id: true, isActive: true },
      });
      if (loc?.isActive) return loc.id;
    }

    const defaultLoc = await this.prisma.location.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });

    if (!defaultLoc) {
      throw new BadRequestException('No pharmacy location configured');
    }
    return defaultLoc.id;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES & LEDGER QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getDrugCategories() {
    const result = await this.prisma.drug.groupBy({
      by: ['categoryId'],
      _count: true,
    });

    const categoryIds = result
      .map((r) => r.categoryId)
      .filter((id): id is string => id !== null);
    const categories = await this.prisma.drugCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, code: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return result.map((r) => ({
      categoryId: r.categoryId,
      category: r.categoryId ? categoryMap.get(r.categoryId) : null,
      count: r._count,
    }));
  }

  // ✅ FIXED: Query InventoryLedger instead of stockLog
  async getStockTransactions(drugId: string, locationId?: string) {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
      include: { inventoryItem: true },
    });

    if (!drug?.inventoryItem) return [];

    return this.prisma.inventoryLedger.findMany({
      where: {
        itemId: drug.inventoryItem.id,
        ...(locationId && { locationId }),
        // Filter to pharmacy-relevant transaction types
        type: {
          in: [
            StockLedgerType.SALE,
            StockLedgerType.USAGE,
            StockLedgerType.RETURN_IN,
            StockLedgerType.PURCHASE_RECEIPT,
            StockLedgerType.ADJUSTMENT_IN,
            StockLedgerType.ADJUSTMENT_OUT,
            StockLedgerType.WASTE,
          ],
        },
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true, unit: true } },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ✅ BONUS: Get ledger entries for a specific prescription
  async getPrescriptionLedgerEntries(prescriptionId: string) {
    return this.prisma.inventoryLedger.findMany({
      where: {
        referenceType: 'PRESCRIPTION_DISPENSE',
        referenceId: prescriptionId,
      },
      include: {
        item: { select: { id: true, name: true, itemCode: true } },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  async getDashboard(locationId?: string) {
    const [lowStock, todaySales, pendingPrescriptions] = await Promise.all([
      this.getLowStockDrugs(locationId),
      this.prisma.pharmacySale.count({
        where: {
          ...(locationId && { locationId }),
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          status: { not: 'CANCELLED' },
        },
      }),
      this.prisma.prescription.count({
        where: { status: 'ACTIVE' },
      }),
    ]);

    return {
      lowStockDrugs: lowStock.length,
      lowStockDetails: lowStock.map((d) => ({
        id: d.id,
        name: d.name,
        totalQuantity:
          d.inventoryItem?.locationStocks?.reduce(
            (sum, s) => sum + s.quantity,
            0,
          ) ?? 0,
        minQuantity: d.inventoryItem?.minQuantity ?? 0,
        // ✅ unitCost must be selected in the original query to be available here
        unitCost: d.inventoryItem?.unitCost ?? 0, // ✅ Now works if selected
      })),
      todaySalesCount: todaySales,
      pendingPrescriptions,
    };
  }
}
