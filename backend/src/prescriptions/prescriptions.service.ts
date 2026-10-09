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
import { PrescriptionStatus, Prisma } from '@prisma/client';
import { clinicDateRange } from '../reports-common';
import { PrescriptionStockService } from '../common/inventory/prescription-stock.service';
import { StockMovementService } from '../common/inventory/stock-movement.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';

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
  constructor(
    private prisma: PrismaService,
    private readonly prescriptionStock?: PrescriptionStockService,
  ) {}

  /** Injected in the app; built on demand in unit specs. */
  private rxStock(): PrescriptionStockService {
    return (
      this.prescriptionStock ??
      new PrescriptionStockService(
        new StockMovementService(new DocumentNumberService(this.prisma)),
      )
    );
  }

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

  async dispense(
    id: string,
    dispensedBy: string,
    locationId?: string,
    actorUserId?: string | null,
  ) {
    const effectiveLocationId =
      locationId ?? (await this.resolvePharmacyLocation());

    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      select: {
        id: true,
        prescriptionCode: true,
        status: true,
        items: {
          select: {
            id: true,
            quantity: true,
            drug: { select: { name: true, inventoryItemId: true } },
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

    const unlinked = prescription.items
      .filter((i) => !i.drug?.inventoryItemId)
      .map((i) => i.drug?.name ?? i.id);
    if (unlinked.length > 0) {
      throw new BadRequestException(
        `Not linked to inventory, so stock cannot be issued: ${unlinked.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Each line leaves stock once. If the posted invoice already issued it,
      // handing it over moves nothing more.
      for (const item of prescription.items) {
        await this.rxStock().issueOnce(tx, {
          prescriptionItemId: item.id,
          quantity: item.quantity,
          locationId: effectiveLocationId,
          notes: `Prescription ${prescription.prescriptionCode} dispensed`,
          performedById: actorUserId ?? null,
        });
      }

      // Claim the status inside the transaction. The check above ran outside
      // it, so two simultaneous dispenses could both pass; the second now
      // finds the status changed and rolls back its stock movement.
      const claimed = await tx.prescription.updateMany({
        where: {
          id,
          status: {
            notIn: [PrescriptionStatus.DISPENSED, PrescriptionStatus.CANCELLED],
          },
        },
        data: {
          status: PrescriptionStatus.DISPENSED,
          dispensedBy: dispensedBy || 'Pharmacy',
          dispensedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'This prescription was dispensed or cancelled in the meantime.',
        );
      }
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
    /** `HH:mm` clinic-local bounds on the first / last day. */
    startTime?: string;
    endTime?: string;
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
      startTime,
      endTime,
      sortBy,
      sortOrder = 'desc',
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.PrescriptionWhereInput = {};
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (visitId) where.visitId = visitId;
    if (dentistId) where.dentistId = dentistId;

    // Inclusive clinic-day bounds. `new Date('2026-10-07')` is UTC midnight, so
    // using it directly as `lte` excluded the whole of the "to" day — a report
    // filtered to a single day came back empty.
    const dateRange = clinicDateRange(dateFrom, dateTo, { startTime, endTime });
    if (dateRange) where.createdAt = dateRange;

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
