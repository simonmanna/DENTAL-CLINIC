// src/prescriptions/prescriptions.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
  PrescriptionItemDto,
  EditPrescriptionDto,
} from './dto/create-prescription.dto';
import { PrescriptionStatus, StockLedgerType, Prisma } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Helper: Generate ledger code ─────
function genLedgerCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ILG-${new Date().getFullYear()}-${timestamp}${random}`;
}

const PRESCRIPTION_SELECT = {
  id: true,
  prescriptionCode: true,
  visitId: true,
  patientId: true,
  dentistId: true,
  status: true,
  notes: true,
  validUntil: true,
  dispensedAt: true,
  dispensedBy: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      patientCode: true,
      dateOfBirth: true,
      previousCardNumber: true,
    },
  },
  dentist: {
    select: { id: true, firstName: true, lastName: true },
  },
  visit: {
    select: { id: true, visitCode: true, status: true },
  },
  items: {
    select: {
      id: true,
      drugId: true,
      drug: {
        select: {
          id: true,
          name: true,
          genericName: true,
          strength: true,
          form: true,
          sellPrice: true,
        },
      },
      dosage: true,
      frequency: true,
      duration: true,
      route: true,
      quantity: true,
      instructions: true,
      refills: true,
      createdAt: true,
    },
  },
};

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  // ─── Create with Multiple Items ───────────────────────────────────────────

  async create(dto: CreatePrescriptionDto, dentistId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: dto.visitId },
      select: { id: true, patientId: true, dentistId: true, status: true },
    });

    if (!visit) throw new NotFoundException('Visit not found');
    if (visit.status === 'COMPLETED') {
      throw new BadRequestException(
        'Cannot add prescriptions to a completed visit',
      );
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'At least one prescription item is required',
      );
    }

    const drugIds = dto.items.map((i) => i.drugId);
    const drugs = await this.prisma.drug.findMany({
      where: { id: { in: drugIds } },
      select: { id: true, name: true, requiresPrescription: true },
    });

    if (drugs.length !== drugIds.length) {
      const foundIds = new Set(drugs.map((d) => d.id));
      const missing = drugIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Invalid drug IDs: ${missing.join(', ')}`);
    }

    const prescriptionCode = await this.generateCode();
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Resolve dentist:
    //   1. Use the visit's dentistId (the dentist who's actually conducting the visit)
    //   2. Fall back to the request user only if they map to a Staff record
    //      (req.user.userId is the User.id; Prescription.dentistId references Staff.id,
    //      so a raw userId would either fail the FK or silently mismatch).
    let resolvedDentistId: string | null = visit.dentistId ?? null;
    if (!resolvedDentistId && dentistId) {
      const staffByUser = await this.prisma.staff.findFirst({
        where: { userId: dentistId },
        select: { id: true },
      });
      resolvedDentistId = staffByUser?.id ?? null;
    }

    const prescription = await this.prisma.$transaction(async (tx) => {
      const rx = await tx.prescription.create({
        data: {
          prescriptionCode,
          visitId: dto.visitId,
          patientId: visit.patientId,
          dentistId: resolvedDentistId,
          status: PrescriptionStatus.ACTIVE,
          validUntil,
          notes: dto.notes,
        },
      });

      await tx.prescriptionItem.createMany({
        data: dto.items.map((item) => ({
          prescriptionId: rx.id,
          drugId: item.drugId,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          quantity: item.quantity,
          instructions: item.instructions,
          refills: item.refills,
        })),
      });

      return rx;
    });

    return this.findOne(prescription.id);
  }

  // ─── Add/Remove Item ──────────────────────────────────────────────────────

  async addItem(
    prescriptionId: string,
    itemDto: PrescriptionItemDto,
    dentistId: string,
  ) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: { id: true, dentistId: true, status: true },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException('Cannot modify dispensed prescription');
    }
    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify cancelled prescription');
    }

    const drug = await this.prisma.drug.findUnique({
      where: { id: itemDto.drugId },
      select: { id: true },
    });
    if (!drug) throw new NotFoundException('Drug not found');

    await this.prisma.prescriptionItem.create({
      data: {
        prescriptionId,
        drugId: itemDto.drugId,
        dosage: itemDto.dosage,
        frequency: itemDto.frequency,
        duration: itemDto.duration,
        route: itemDto.route,
        quantity: itemDto.quantity,
        instructions: itemDto.instructions,
        refills: itemDto.refills,
      },
    });

    return this.findOne(prescriptionId);
  }

  async removeItem(prescriptionId: string, itemId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: { status: true },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException('Cannot modify dispensed prescription');
    }

    const item = await this.prisma.prescriptionItem.findFirst({
      where: { id: itemId, prescriptionId },
    });

    if (!item) throw new NotFoundException('Prescription item not found');

    await this.prisma.prescriptionItem.delete({ where: { id: itemId } });

    const remainingItems = await this.prisma.prescriptionItem.count({
      where: { prescriptionId },
    });

    if (remainingItems === 0) {
      await this.prisma.prescription.update({
        where: { id: prescriptionId },
        data: { status: PrescriptionStatus.CANCELLED },
      });
    }

    return this.findOne(prescriptionId);
  }

  // ─── Find Methods ─────────────────────────────────────────────────────────

  async findByVisit(visitId: string) {
    return this.prisma.prescription.findMany({
      where: { visitId },
      orderBy: { createdAt: 'desc' },
      select: PRESCRIPTION_SELECT,
    });
  }

  async findOne(id: string) {
    const rx = await this.prisma.prescription.findUnique({
      where: { id },
      select: PRESCRIPTION_SELECT,
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  async update(id: string, dto: UpdatePrescriptionDto) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');

    if (
      dto.status === PrescriptionStatus.ACTIVE &&
      prescription.status === PrescriptionStatus.DISPENSED
    ) {
      throw new BadRequestException(
        'Cannot reactivate a dispensed prescription',
      );
    }

    const updateData: Prisma.PrescriptionUpdateInput = {
      ...(dto.status && { status: dto.status }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };

    if (dto.dispensedBy) {
      updateData.dispensedBy = dto.dispensedBy;
      updateData.dispensedAt = new Date();
      updateData.status = PrescriptionStatus.DISPENSED;
    }

    return this.prisma.prescription.update({
      where: { id },
      data: updateData,
      select: PRESCRIPTION_SELECT,
    });
  }

  // ─── Full Edit (replace items + notes + validUntil) ───────────────────────
  // Only allowed while the prescription is ACTIVE.

  async edit(id: string, dto: EditPrescriptionDto) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException('Cannot edit a dispensed prescription');
    }
    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled prescription');
    }

    // Validate items if provided
    if (dto.items !== undefined) {
      if (!dto.items.length) {
        throw new BadRequestException('At least one item is required');
      }
      const drugIds = dto.items.map((i) => i.drugId);
      const drugs = await this.prisma.drug.findMany({
        where: { id: { in: drugIds } },
        select: { id: true },
      });
      if (drugs.length !== drugIds.length) {
        const foundIds = new Set(drugs.map((d) => d.id));
        const missing = drugIds.filter((x) => !foundIds.has(x));
        throw new BadRequestException(
          `Invalid drug IDs: ${missing.join(', ')}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.PrescriptionUpdateInput = {};
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.validUntil !== undefined) {
        data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
      }
      if (Object.keys(data).length) {
        await tx.prescription.update({ where: { id }, data });
      }

      // Replace all items when provided
      if (dto.items !== undefined) {
        await tx.prescriptionItem.deleteMany({
          where: { prescriptionId: id },
        });
        await tx.prescriptionItem.createMany({
          data: dto.items.map((item) => ({
            prescriptionId: id,
            drugId: item.drugId,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            route: item.route,
            quantity: item.quantity,
            instructions: item.instructions,
            refills: item.refills,
          })),
        });
      }

      return tx.prescription.findUnique({
        where: { id },
        select: PRESCRIPTION_SELECT,
      });
    });
  }

  // ─── Dispense with InventoryLedger ✅ PRODUCTION READY ────────────────────

  async dispense(id: string, dispensedBy: string, locationId?: string) {
    // Resolve location first
    const effectiveLocationId =
      locationId ?? (await this.resolvePharmacyLocation());

    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            drug: {
              include: {
                inventoryItem: {
                  select: {
                    id: true,
                    unitCost: true,
                    minQuantity: true,
                    // ✅ Include locationStocks instead of quantity
                    locationStocks: {
                      where: { locationId: effectiveLocationId },
                      select: { quantity: true, locationId: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException('Already dispensed');
    }
    if (prescription.status === PrescriptionStatus.CANCELLED) {
      throw new BadRequestException('Cannot dispense cancelled prescription');
    }

    // Check stock availability at the specific location
    const stockIssues: string[] = [];
    for (const item of prescription.items) {
      const inventoryItem = item.drug?.inventoryItem;
      if (!inventoryItem) {
        stockIssues.push(`${item.drug.name}: not linked to inventory`);
        continue;
      }

      // ✅ Aggregate quantity from locationStocks at this location
      const locationStock = inventoryItem.locationStocks.find(
        (s) => s.locationId === effectiveLocationId,
      );
      const availableQty = locationStock?.quantity ?? 0;

      if (availableQty < item.quantity) {
        stockIssues.push(
          `${item.drug.name}: requested ${item.quantity}, available ${availableQty}`,
        );
      }
    }

    if (stockIssues.length > 0) {
      throw new BadRequestException(
        `Insufficient stock at location:\n${stockIssues.join('\n')}`,
      );
    }

    // Deduct stock + write InventoryLedger in transaction
    await this.prisma.$transaction(async (tx) => {
      for (const item of prescription.items) {
        const inventoryItem = item.drug?.inventoryItem;
        if (!inventoryItem) continue;

        const quantityChange = -item.quantity;
        const unitCost = toNum(inventoryItem.unitCost);

        // ✅ Get location stock before change for ledger snapshot
        const locationStock = await tx.inventoryLocationStock.findFirst({
          where: { itemId: inventoryItem.id, locationId: effectiveLocationId },
          select: { id: true, quantity: true },
        });
        const qtyBefore = locationStock?.quantity ?? 0;
        const qtyAfter = qtyBefore + quantityChange;

        if (qtyAfter < 0) {
          throw new BadRequestException(
            `Stock would go negative for ${item.drug.name}. Available: ${qtyBefore}, Requested: ${item.quantity}`,
          );
        }

        // 1. ✅ Update location stock ONLY (no master quantity update)
        if (locationStock) {
          await tx.inventoryLocationStock.update({
            where: { id: locationStock.id },
            data: { quantity: qtyAfter },
          });
        } else if (qtyAfter > 0) {
          await tx.inventoryLocationStock.create({
            data: {
              itemId: inventoryItem.id,
              locationId: effectiveLocationId,
              quantity: qtyAfter,
              minQuantity: inventoryItem.minQuantity ?? 0,
            },
          });
        }

        // 2. ✅ Optional: Deduct from specific batch (FIFO)
        let batchId: string | null = null;
        const oldestBatch = await tx.inventoryBatch.findFirst({
          where: {
            itemId: inventoryItem.id,
            locationId: effectiveLocationId,
            isActive: true,
            quantity: { gt: 0 },
          },
          orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
          select: { id: true, quantity: true },
        });

        if (oldestBatch) {
          const newBatchQty = oldestBatch.quantity - item.quantity;
          await tx.inventoryBatch.update({
            where: { id: oldestBatch.id },
            data: {
              quantity: { decrement: item.quantity },
              isActive: newBatchQty > 0,
            },
          });
          batchId = oldestBatch.id;
        }

        // 3. ✅ Write InventoryLedger entry
        await tx.inventoryLedger.create({
          data: {
            ledgerCode: genLedgerCode(),
            itemId: inventoryItem.id,
            locationId: effectiveLocationId,
            batchId,
            type: StockLedgerType.USAGE,
            quantityBefore: qtyBefore,
            quantityChange,
            quantityAfter: qtyAfter,
            unitCost,
            totalValue: Math.abs(quantityChange) * unitCost,
            referenceType: 'PRESCRIPTION_DISPENSE',
            referenceId: prescription.id,
            notes: `Prescription dispensed: ${item.quantity} ${item.drug.name} (${item.dosage}, ${item.frequency}, ${item.duration})`,
            performedById: dispensedBy ?? null,
          },
        });
      }

      // 4. Mark prescription as dispensed
      await tx.prescription.update({
        where: { id },
        data: {
          status: PrescriptionStatus.DISPENSED,
          dispensedBy: dispensedBy || 'Pharmacy',
          dispensedAt: new Date(),
        },
      });
    });

    return this.findOne(id);
  }

  // ─── Helper: Resolve pharmacy location ────────────────────────────────────
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

  // ─── Remove Prescription ──────────────────────────────────────────────────

  async remove(id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');
    if (prescription.status === PrescriptionStatus.DISPENSED) {
      throw new BadRequestException('Cannot delete dispensed prescription');
    }

    await this.prisma.prescription.delete({ where: { id } });
    return { message: 'Prescription deleted' };
  }

  // ─── Find All (Paginated) ─────────────────────────────────────────────────

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: PrescriptionStatus;
    patientId?: string;
    visitId?: string;
    dentistId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      limit = 20,
      status,
      patientId,
      visitId,
      dentistId,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder = 'desc',
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.PrescriptionWhereInput = {};
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (visitId) where.visitId = visitId;
    if (dentistId) where.dentistId = dentistId;

    // Date range filter on createdAt (inclusive bounds, ISO strings from controller)
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const d = new Date(dateFrom);
        if (!isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (dateTo) {
        const d = new Date(dateTo);
        if (!isNaN(d.getTime())) where.createdAt.lte = d;
      }
    }

    if (search) {
      where.OR = [
        { prescriptionCode: { contains: search, mode: 'insensitive' } },
        { patient: { firstName: { contains: search, mode: 'insensitive' } } },
        { patient: { lastName: { contains: search, mode: 'insensitive' } } },
        {
          items: {
            some: { drug: { name: { contains: search, mode: 'insensitive' } } },
          },
        },
      ];
    }

    // Whitelist sortable fields — prevents arbitrary Prisma orderBy injection
    const orderBy: Prisma.PrescriptionOrderByWithRelationInput = (() => {
      const dir: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
      switch (sortBy) {
        case 'prescriptionCode':
          return { prescriptionCode: dir };
        case 'status':
          return { status: dir };
        case 'validUntil':
          return { validUntil: dir };
        case 'updatedAt':
          return { updatedAt: dir };
        case 'createdAt':
        default:
          return { createdAt: dir };
      }
    })();

    const [total, data] = await Promise.all([
      this.prisma.prescription.count({ where }),
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: PRESCRIPTION_SELECT,
      }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Code Generator ───────────────────────────────────────────────────────

  private async generateCode(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await this.prisma.prescription.count({
      where: { createdAt: { gte: startOfDay, lte: endOfDay } },
    });

    const seq = String(count + 1).padStart(3, '0');
    return `RX-${dateStr}-${seq}`;
  }

  async getByPatient(patientId: string) {
    return this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        items: { include: { drug: true } },
        dentist: { select: { id: true, firstName: true, lastName: true } },
        visit: { select: { id: true, visitCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── BONUS: Get ledger entries for a prescription (audit trail) ───────────

  async getPrescriptionLedgerEntries(prescriptionId: string) {
    return this.prisma.inventoryLedger.findMany({
      where: {
        referenceType: 'PRESCRIPTION_DISPENSE',
        referenceId: prescriptionId,
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            unit: true,
            uom: true,
          },
        },
        location: { select: { id: true, name: true } },
        batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        performedBy: { select: { id: true, email: true, role: true } },
        performedByStaff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
