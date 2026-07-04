// src/pharmacy/pharmacy-sales.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentMethod,
  SaleType,
  PharmacySaleStatus,
  StockLedgerType,
  Prisma,
} from '@prisma/client';
import {
  CreatePharmacySaleDto,
  AddSalePaymentDto,
  DispenseMultipleDto,
} from './dto/pharmacy-sales-dto';

import { LedgerService } from '../billing/ledger.service';
import { InvoicesService } from '../billing/invoices.service';
import {
  LedgerEntryType, LedgerEntryStatus
} from '@prisma/client';

// ─── Internal helper types ──────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function genEntryCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `LE-${new Date().getFullYear()}-${timestamp}${random}`;
}

type DrugWithInventory = Prisma.DrugGetPayload<{
  include: {
    inventoryItem: {
      include: {
        locationStocks: true;
        batches?: true; // Optional: for FIFO batch selection
      };
    };
  };
}>;

// ─── Code generator (match your existing genCode utility) ───────────────────
function genLedgerCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ILG-${new Date().getFullYear()}-${timestamp}${random}`;
}

@Injectable()
export class PharmacySalesService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,           // ← add
    private invoices: InvoicesService,        // ← add
  ) { }
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async resolveLocationId(locationId?: string): Promise<string> {
    if (locationId) {
      const loc = await this.prisma.location.findUnique({
        where: { id: locationId },
        select: { id: true, name: true, isActive: true },
      });
      if (!loc)
        throw new BadRequestException(`Location "${locationId}" not found`);
      if (!loc.isActive)
        throw new BadRequestException(`Location "${loc.name}" is inactive`);
      return loc.id;
    }

    const setting = await this.prisma.clinicSettings.findUnique({
      where: { key: 'PHARMACY_LOCATION' },
    });

    if (setting?.value) {
      const loc = await this.prisma.location.findUnique({
        where: { id: setting.value },
        select: { id: true, isActive: true },
      });
      if (loc?.isActive) return loc.id;
      console.warn(
        `PHARMACY_LOCATION setting points to invalid/inactive location "${setting.value}"`,
      );
    }

    const defaultLoc = await this.prisma.location.findFirst({
      where: { isDefault: true, isActive: true },
      select: { id: true },
    });
    if (!defaultLoc) {
      throw new BadRequestException(
        'No pharmacy location configured. Set PHARMACY_LOCATION in ClinicSettings or pass locationId.',
      );
    }
    return defaultLoc.id;
  }

  private async getDrugWithInventory(
    drugId: string,
    locationId: string,
  ): Promise<DrugWithInventory> {
    const drug = await this.prisma.drug.findUnique({
      where: { id: drugId },
      include: {
        inventoryItem: {
          include: {
            locationStocks: { where: { locationId } },
            batches: {
              where: { locationId, isActive: true, quantity: { gt: 0 } },
              orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
            },
          },
        },
      },
    });
    if (!drug) throw new NotFoundException(`Drug "${drugId}" not found`);
    return drug;
  }

  private getAvailableStock(
    drug: DrugWithInventory,
    locationId: string,
  ): number {
    if (!drug.inventoryItem) return 0;

    // Sum quantities from ALL batches at this location
    const locationStock = drug.inventoryItem.locationStocks.find(
      (s) => s.locationId === locationId,
    );

    return locationStock?.quantity ?? 0; // Return 0 if no stock record exists
  }

  private async upsertLocationStock(
    tx: Prisma.TransactionClient,
    inventoryItemId: string,
    locationId: string,
    quantityChange: number,
  ): Promise<void> {
    const existing = await tx.inventoryLocationStock.findFirst({
      where: { itemId: inventoryItemId, locationId },
    });

    if (existing) {
      const newQty = existing.quantity + quantityChange;
      if (newQty < 0) {
        throw new BadRequestException(
          `Location stock would go negative for inventoryItem "${inventoryItemId}". ` +
          `Current: ${existing.quantity}, change: ${quantityChange}`,
        );
      }
      await tx.inventoryLocationStock.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      const qty = Math.max(0, quantityChange);
      await tx.inventoryLocationStock.create({
        data: { itemId: inventoryItemId, locationId, quantity: qty },
      });
    }
  }

  /**
   * ✅ NEW: Write to InventoryLedger (replaces createStockLog)
   */
  private async createInventoryLedgerEntry(
    tx: Prisma.TransactionClient,
    params: {
      inventoryItemId: string;
      locationId: string;
      batchId?: string | null;
      type: StockLedgerType;
      quantityBefore: number;
      quantityChange: number;
      quantityAfter: number;
      unitCost: number;
      referenceType: string; // e.g. 'PHARMACY_SALE'
      referenceId: string; // e.g. sale.id or saleCode
      notes: string;
      performedById?: string | null;
      performedByStaffId?: string | null;
    },
  ): Promise<void> {
    const {
      inventoryItemId,
      locationId,
      batchId,
      type,
      quantityBefore,
      quantityChange,
      quantityAfter,
      unitCost,
      referenceType,
      referenceId,
      notes,
      performedById,
      performedByStaffId,
    } = params;

    await tx.inventoryLedger.create({
      data: {
        ledgerCode: genLedgerCode(),
        itemId: inventoryItemId,
        locationId,
        batchId: batchId ?? null,
        type,
        quantityBefore,
        quantityChange,
        quantityAfter,
        unitCost,
        totalValue: Math.abs(quantityChange) * unitCost,
        referenceType,
        referenceId,
        notes,
        performedById: performedById ?? null,
        performedByStaffId: performedByStaffId ?? null,
      },
    });
  }

  /**
   * Deduct stock + write InventoryLedger entry for pharmacy sale
   */

  private async deductDrugStock(
    tx: Prisma.TransactionClient,
    drugId: string,
    locationId: string,
    quantity: number,
    saleId: string,
    saleCode: string,
    servedBy?: string | null,
    performedByStaffId?: string | null,
    logNotePrefix = 'Pharmacy sale',
  ): Promise<void> {
    const drug = await tx.drug.findUnique({
      where: { id: drugId },
      include: {
        inventoryItem: {
          include: {
            locationStocks: { where: { locationId } },
            batches: {
              where: { locationId, isActive: true, quantity: { gt: 0 } },
              orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });

    if (!drug?.inventoryItem) return;

    const inventoryItemId = drug.inventoryItem.id;
    const unitCost = toNum(drug.inventoryItem.unitCost);

    // Get location stock before change
    const locationStock = await tx.inventoryLocationStock.findFirst({
      where: { itemId: inventoryItemId, locationId },
      select: { quantity: true },
    });
    const qtyBefore = locationStock?.quantity ?? 0;

    // 1. Update location stock only ✅
    await this.upsertLocationStock(tx, inventoryItemId, locationId, -quantity);

    // ❌ REMOVED: No longer update master inventoryItem.quantity
    // const updated = await tx.inventoryItem.update({ ... });

    // 2. Optional: Deduct from specific batch (FIFO)
    let batchId: string | null = null;
    if (drug.inventoryItem.batches?.[0]) {
      const oldestBatch = drug.inventoryItem.batches[0];
      const newBatchQty = oldestBatch.quantity - quantity;

      await tx.inventoryBatch.update({
        where: { id: oldestBatch.id },
        data: {
          quantity: { decrement: quantity },
          isActive: newBatchQty > 0,
        },
      });
      batchId = oldestBatch.id;
    }

    // 3. Write InventoryLedger entry ✅
    await this.createInventoryLedgerEntry(tx, {
      inventoryItemId,
      locationId,
      batchId,
      type: StockLedgerType.SALE,
      quantityBefore: qtyBefore,
      quantityChange: -quantity,
      quantityAfter: qtyBefore - quantity,
      unitCost,
      referenceType: 'PHARMACY_SALE',
      referenceId: saleId,
      notes: `${logNotePrefix}: ${saleCode}${servedBy ? ` | Staff: ${servedBy}` : ''}`,
      performedById: null,
      performedByStaffId: performedByStaffId ?? null,
    });
  }

  /**
   * Restore stock + write InventoryLedger entry for refund
   */
  private async restoreDrugStock(
    tx: Prisma.TransactionClient,
    drugId: string,
    locationId: string,
    quantity: number,
    saleId: string,
    saleCode: string,
    reason: string,
    performedByStaffId?: string | null,
  ): Promise<void> {
    const drug = await tx.drug.findUnique({
      where: { id: drugId },
      include: { inventoryItem: true },
    });

    if (!drug?.inventoryItem) return;

    const inventoryItemId = drug.inventoryItem.id;
    const unitCost = toNum(drug.inventoryItem.unitCost);

    const locationStock = await tx.inventoryLocationStock.findFirst({
      where: { itemId: inventoryItemId, locationId },
      select: { quantity: true },
    });
    const qtyBefore = locationStock?.quantity ?? 0;

    // 1. Restore location stock only ✅
    await this.upsertLocationStock(tx, inventoryItemId, locationId, quantity);

    // ❌ REMOVED: No master quantity update
    // const updated = await tx.inventoryItem.update({ ... });

    // 2. Write InventoryLedger entry ✅
    await this.createInventoryLedgerEntry(tx, {
      inventoryItemId,
      locationId,
      batchId: null,
      type: StockLedgerType.RETURN_IN,
      quantityBefore: qtyBefore,
      quantityChange: quantity,
      quantityAfter: qtyBefore + quantity,
      unitCost,
      referenceType: 'PHARMACY_SALE_REFUND',
      referenceId: saleId,
      notes: `Pharmacy refund: ${reason || 'No reason provided'} | Original sale: ${saleCode}`,
      performedById: null,
      performedByStaffId: performedByStaffId ?? null,
    });
  }


  private async createLedgerEntriesForSale(
    sale: {
      id: string;
      saleCode: string;
      patientId: string | null;
      visitId?: string | null;
      items: Array<{
        drugId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        total: number;
        drug?: { name: string } | null;
      }>;
    },
  ): Promise<string[]> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[LEDGER DEBUG] createLedgerEntriesForSale() ENTERED');
    console.log('[LEDGER DEBUG] sale.id:', sale.id);
    console.log('[LEDGER DEBUG] sale.saleCode:', sale.saleCode);
    console.log('[LEDGER DEBUG] sale.patientId:', sale.patientId);
    console.log('[LEDGER DEBUG] sale.visitId:', sale.visitId);
    console.log('[LEDGER DEBUG] sale.items count:', sale.items?.length ?? 0);
    console.log('[LEDGER DEBUG] sale.items:', JSON.stringify(sale.items, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!sale.patientId) {
      console.warn('[LEDGER DEBUG] ❌ ABORTED: sale.patientId is null/undefined');
      return [];
    }

    const ledgerEntryIds: string[] = [];

    for (const [index, item] of sale.items.entries()) {
      console.log(`\n[LEDGER DEBUG] ── Processing item #${index} ──`);
      console.log('[LEDGER DEBUG] raw item:', JSON.stringify(item));

      // ── FIX: explicit Number() casts — guards against Prisma Decimal objects ──
      const unitPrice = Number(item.unitPrice);
      const quantity = Number(item.quantity);
      const discountAmount = Number(item.discount ?? 0);
      const subtotal = quantity * unitPrice;
      const totalPrice = subtotal - discountAmount;

      console.log('[LEDGER DEBUG] CASTED VALUES:');
      console.log('  unitPrice (raw→casted):', item.unitPrice, '→', unitPrice, '(type:', typeof unitPrice + ')');
      console.log('  quantity (raw→casted):', item.quantity, '→', quantity, '(type:', typeof quantity + ')');
      console.log('  discount (raw→casted):', item.discount, '→', discountAmount, '(type:', typeof discountAmount + ')');
      console.log('  subtotal:', subtotal);
      console.log('  totalPrice:', totalPrice);

      // Guard: if prices are still 0 after cast, log a warning
      if (unitPrice === 0) {
        console.warn(
          `[LedgerEntry] ⚠️ unitPrice is 0 for drugId=${item.drugId} in sale=${sale.id}. ` +
          `Check that DTO prices are being passed through correctly.`,
        );
      }

      const description = item.drug?.name
        ? `${item.drug.name} × ${quantity}`
        : `Drug sale × ${quantity}`;

      console.log('[LEDGER DEBUG] description:', description);

      console.log('[LEDGER DEBUG] About to CREATE ledgerEntry with data:');
      console.log(JSON.stringify({
        entryCode: '<will be generated>',
        patientId: sale.patientId,
        visitId: sale.visitId ?? null,
        type: LedgerEntryType.DRUG,
        description,
        sourceType: 'PHARMACY_SALE',
        sourceId: sale.id,
        quantity,
        pricePerUnit: unitPrice,
        subtotalPrice: subtotal,
        discountAmount,
        taxAmount: 0,
        totalPrice,
        currency: 'UGX',
        exchangeRate: 1,
        baseCurrency: 'UGX',
        baseAmount: totalPrice,
        status: LedgerEntryStatus.PENDING,
      }, null, 2));

      const entry = await this.prisma.ledgerEntry.create({
        data: {
          entryCode: genEntryCode(),
          patientId: sale.patientId,
          visitId: sale.visitId ?? null,
          type: LedgerEntryType.DRUG,
          description,
          sourceType: 'PHARMACY_SALE',
          sourceId: sale.id,
          quantity,
          pricePerUnit: unitPrice,
          subtotalPrice: subtotal,
          discountAmount,
          taxAmount: 0,
          totalPrice,
          currency: 'UGX',
          exchangeRate: 1,
          baseCurrency: 'UGX',
          baseAmount: totalPrice,
          status: LedgerEntryStatus.PENDING,
        },
      });

      console.log('[LEDGER DEBUG] ✅ CREATED ledgerEntry.id:', entry.id);
      console.log('[LEDGER DEBUG] created entry:', JSON.stringify(entry, null, 2));

      ledgerEntryIds.push(entry.id);
    }

    console.log('\n[LEDGER DEBUG] RETURNING ledgerEntryIds:', ledgerEntryIds);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return ledgerEntryIds;
  }

  async createSale(dto: CreatePharmacySaleDto, userId?: string, staffId?: string) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('[SALE DEBUG] createSale() ENTERED');
    console.log('[SALE DEBUG] dto:', JSON.stringify(dto, null, 2));
    console.log('[SALE DEBUG] userId:', userId);
    console.log('[SALE DEBUG] staffId:', staffId);
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('[SALE DEBUG] ── Step 0: resolveLocationId ──');
    console.log('[SALE DEBUG] dto.locationId:', dto.locationId);
    const locationId = await this.resolveLocationId(dto.locationId);
    console.log('[SALE DEBUG] resolved locationId:', locationId);

    // ── NEW: Handle WALK-IN patient ──────────────────────────────────────────
    let patientId = dto.patientId;

    // If no patientId is provided OR saleType is WALK_IN, use/ensure WALK-IN patient
    if (!patientId || dto.saleType === SaleType.WALK_IN) {
      console.log('[SALE DEBUG] ── Step 0b: Resolving WALK-IN patient ──');

      // Find existing WALK-IN patient by code
      let walkInPatient = await this.prisma.patient.findFirst({
        where: {
          patientCode: 'WALK-IN',
          isActive: true,
        },
      });

      // If WALK-IN patient doesn't exist, create it
      if (!walkInPatient) {
        console.log('[SALE DEBUG] WALK-IN patient not found, creating new one...');

        walkInPatient = await this.prisma.patient.create({
          data: {
            patientCode: 'WALK-IN',
            firstName: 'Walk-In',
            lastName: 'Patient',
            isActive: true,
            registeredAt: new Date(),
          },
        });

        console.log('[SALE DEBUG] Created WALK-IN patient with id:', walkInPatient.id);
      } else {
        console.log('[SALE DEBUG] Found existing WALK-IN patient with id:', walkInPatient.id);
      }

      patientId = walkInPatient.id;
      console.log('[SALE DEBUG] Using patientId:', patientId);
    }

    // Determine if we should generate an invoice
    // For WALK-IN sales, always generate invoice if patient exists (which it now does)
    const shouldGenerateInvoice = dto.generateInvoice !== false && !!patientId;
    console.log('[SALE DEBUG] shouldGenerateInvoice:', shouldGenerateInvoice);
    console.log('  dto.generateInvoice:', dto.generateInvoice);
    console.log('  patientId:', patientId);

    // ── Stock validation ───────────────────────────────────────────────────
    console.log('\n[SALE DEBUG] ── Step 1: Stock validation ──');
    for (const [index, item] of dto.items.entries()) {
      console.log(`[SALE DEBUG] Validating item #${index}:`, JSON.stringify(item));
      const drug = await this.getDrugWithInventory(item.drugId, locationId);
      console.log('[SALE DEBUG] fetched drug:', JSON.stringify(drug, null, 2));

      if (drug.inventoryItem) {
        const available = this.getAvailableStock(drug, locationId);
        console.log('[SALE DEBUG] available stock:', available, '| requested:', item.quantity);
        if (available < item.quantity) {
          console.error(`[SALE DEBUG] ❌ INSUFFICIENT STOCK for "${drug.name}"`);
          throw new BadRequestException(
            `Insufficient stock for "${drug.name}". Available: ${available}, Requested: ${item.quantity}`,
          );
        }
        console.log('[SALE DEBUG] ✅ Stock OK');
      } else {
        console.log('[SALE DEBUG] ⚠️ No inventoryItem for this drug');
      }
    }

    // ── Prescription validation ──────────────────────────────────────────────
    console.log('\n[SALE DEBUG] ── Step 2: Prescription validation ──');
    if (dto.prescriptionId) {
      console.log('[SALE DEBUG] dto.prescriptionId:', dto.prescriptionId);
      const rx = await this.prisma.prescription.findUnique({
        where: { id: dto.prescriptionId },
      });
      console.log('[SALE DEBUG] fetched prescription:', JSON.stringify(rx, null, 2));

      if (!rx) {
        console.error('[SALE DEBUG] ❌ Prescription not found');
        throw new NotFoundException('Prescription not found');
      }
      if (rx.status !== 'ACTIVE') {
        console.error(`[SALE DEBUG] ❌ Prescription not active, status: ${rx.status}`);
        throw new BadRequestException(
          `Prescription is not active (status: ${rx.status})`,
        );
      }
      console.log('[SALE DEBUG] ✅ Prescription valid');
    } else {
      console.log('[SALE DEBUG] No prescriptionId provided, skipping prescription check');
    }

    // ── Calculations ───────────────────────────────────────────────────────
    console.log('\n[SALE DEBUG] ── Step 3: Calculations ──');
    const subtotal = dto.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0),
      0,
    );
    const paymentsToRecord = shouldGenerateInvoice ? [] : (dto.payments ?? []);
    const amountPaid = paymentsToRecord.reduce((sum, p) => sum + p.amount, 0);
    const balance = subtotal - amountPaid;
    const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    console.log('[SALE DEBUG] subtotal:', subtotal);
    console.log('[SALE DEBUG] paymentsToRecord:', JSON.stringify(paymentsToRecord));
    console.log('[SALE DEBUG] amountPaid:', amountPaid);
    console.log('[SALE DEBUG] balance:', balance);
    console.log('[SALE DEBUG] generated saleCode:', saleCode);

    const saleStatus = shouldGenerateInvoice
      ? PharmacySaleStatus.INVOICED
      : balance <= 0
        ? PharmacySaleStatus.COMPLETED
        : PharmacySaleStatus.PENDING;
    console.log('[SALE DEBUG] determined saleStatus:', saleStatus);

    // ── Sale creation + stock deduction (transaction) ───────────────────────
    console.log('\n[SALE DEBUG] ── Step 4: BEGIN PRISMA TRANSACTION ──');
    console.log('[SALE DEBUG] Transaction data to create:');
    console.log(JSON.stringify({
      saleCode,
      locationId,
      patientId,
      prescriptionId: dto.prescriptionId ?? null,
      saleType: dto.saleType,
      notes: dto.notes ?? null,
      servedBy: dto.servedBy ?? null,
      subtotal,
      total: subtotal,
      amountPaid,
      balance,
      status: saleStatus,
      items: dto.items.map((i) => ({
        drugId: i.drugId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount ?? 0,
        total: i.quantity * i.unitPrice - (i.discount ?? 0),
      })),
      payments: paymentsToRecord,
    }, null, 2));

    const sale = await this.prisma.$transaction(async (tx) => {
      console.log('[SALE DEBUG] Inside transaction, creating pharmacySale...');

      const created = await tx.pharmacySale.create({
        data: {
          saleCode,
          locationId,
          patientId,
          prescriptionId: dto.prescriptionId ?? null,
          saleType: dto.saleType,
          notes: dto.notes ?? null,
          servedBy: dto.servedBy ?? null,
          subtotal,
          total: subtotal,
          amountPaid,
          balance,
          status: saleStatus,
          items: {
            create: dto.items.map((i) => ({
              drugId: i.drugId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount ?? 0,
              total: i.quantity * i.unitPrice - (i.discount ?? 0),
            })),
          },
          ...(paymentsToRecord.length && {
            payments: { create: paymentsToRecord.map((p) => ({ ...p })) },
          }),
        },
        include: {
          items: {
            include: {
              drug: {
                select: { id: true, name: true },
              },
            },
          },
          payments: true,
          location: { select: { id: true, name: true } },
          patient: { select: { firstName: true, lastName: true, patientCode: true } },
        },
      });

      console.log('[SALE DEBUG] ✅ pharmacySale CREATED with id:', created.id);
      console.log('[SALE DEBUG] created sale:', JSON.stringify(created, null, 2));

      // ── Stock deduction ──────────────────────────────────────────────────
      console.log('\n[SALE DEBUG] ── Step 4b: Stock deduction ──');
      for (const [index, item] of dto.items.entries()) {
        console.log(`[SALE DEBUG] Deducting stock for item #${index}: drugId=${item.drugId}, qty=${item.quantity}`);
        await this.deductDrugStock(
          tx, item.drugId, locationId, item.quantity,
          created.id, saleCode, dto.servedBy, staffId,
        );
        console.log(`[SALE DEBUG] ✅ Stock deducted for item #${index}`);
      }

      // ── Prescription update ──────────────────────────────────────────────
      if (dto.prescriptionId) {
        console.log('\n[SALE DEBUG] ── Step 4c: Update prescription status ──');
        console.log('[SALE DEBUG] Updating prescription', dto.prescriptionId, 'to DISPENSED');
        const updatedRx = await tx.prescription.update({
          where: { id: dto.prescriptionId },
          data: {
            status: 'DISPENSED',
            dispensedAt: new Date(),
            dispensedBy: dto.servedBy ?? null,
          },
        });
        console.log('[SALE DEBUG] ✅ Prescription updated:', JSON.stringify(updatedRx, null, 2));
      }

      console.log('[SALE DEBUG] Transaction complete, returning created sale');
      return created;
    });

    console.log('\n[SALE DEBUG] ✅ TRANSACTION COMMITTED');
    console.log('[SALE DEBUG] sale.id:', sale.id);
    console.log('[SALE DEBUG] sale.items:', JSON.stringify(sale.items, null, 2));

    // ── Ledger entries + invoice ─────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('[SALE DEBUG] ── Step 5: Ledger entries + Invoice generation ──');
    console.log('[SALE DEBUG] shouldGenerateInvoice:', shouldGenerateInvoice);
    console.log('═══════════════════════════════════════════════════════\n');

    let invoice: Awaited<ReturnType<InvoicesService['createFromLedger']>> | null = null;

    if (shouldGenerateInvoice) {
      console.log('[SALE DEBUG] Invoice generation branch: ENTERED');
      try {
        // Build sale object for ledger entries
        console.log('\n[SALE DEBUG] ── Building saleForLedger ──');
        console.log('[SALE DEBUG] dto.items:', JSON.stringify(dto.items, null, 2));
        console.log('[SALE DEBUG] sale.items from DB:', JSON.stringify(sale.items, null, 2));

        const saleForLedger = {
          id: sale.id,
          saleCode: sale.saleCode,
          patientId: sale.patientId!,
          visitId: null as string | null,
          items: dto.items.map((dtoItem) => {
            // Find the drug name from the sale include
            const saleItem = sale.items.find((si) => si.drugId === dtoItem.drugId);
            const mappedItem = {
              drugId: dtoItem.drugId,
              quantity: dtoItem.quantity,
              unitPrice: Number(dtoItem.unitPrice),
              discount: Number(dtoItem.discount ?? 0),
              total: dtoItem.quantity * Number(dtoItem.unitPrice) - Number(dtoItem.discount ?? 0),
              drug: saleItem?.drug ? { name: saleItem.drug.name } : null,
            };
            console.log(`[SALE DEBUG] Mapped item for drugId=${dtoItem.drugId}:`, JSON.stringify(mappedItem));
            return mappedItem;
          }),
        };

        console.log('\n[SALE DEBUG] saleForLedger object:');
        console.log(JSON.stringify(saleForLedger, null, 2));

        console.log('\n[SALE DEBUG] ── Calling createLedgerEntriesForSale() ──');
        const ledgerEntryIds = await this.createLedgerEntriesForSale(saleForLedger);
        console.log('\n[SALE DEBUG] Returned from createLedgerEntriesForSale()');
        console.log('[SALE DEBUG] ledgerEntryIds:', ledgerEntryIds);

        if (ledgerEntryIds.length > 0) {
          console.log('\n[SALE DEBUG] ✅ ledgerEntryIds.length > 0, proceeding to create invoice');
          console.log('[SALE DEBUG] Calling invoices.createFromLedger() with:');
          console.log(JSON.stringify({
            patientId: sale.patientId!,
            visitId: undefined,
            ledgerEntryIds,
            invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
            notes: `Pharmacy sale: ${saleCode}`,
          }, null, 2));

          invoice = await this.invoices.createFromLedger({
            patientId: sale.patientId!,
            visitId: undefined,
            ledgerEntryIds,
            invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
            notes: `Pharmacy sale: ${saleCode}`,
          });

          console.log('[SALE DEBUG] ✅ Invoice created:', JSON.stringify(invoice, null, 2));

          // After invoice is created successfully, update ledger entries to INVOICED
          if (ledgerEntryIds.length > 0) {
            console.log('[SALE DEBUG] ── Updating ledger entries to INVOICED ──');
            await this.prisma.ledgerEntry.updateMany({
              where: {
                id: { in: ledgerEntryIds },
              },
              data: {
                status: 'INVOICED',
              },
            });
            console.log('[SALE DEBUG] ✅ Ledger entries updated to INVOICED');
          }

          // Write invoiceId back to pharmacySale
          console.log('\n[SALE DEBUG] ── Writing invoiceId back to pharmacySale ──');
          const updatedSale = await this.prisma.pharmacySale.update({
            where: { id: sale.id },
            data: { invoiceId: invoice.id },
          });
          console.log('[SALE DEBUG] ✅ pharmacySale updated with invoiceId:', updatedSale.invoiceId);
        } else {
          console.warn('[SALE DEBUG] ⚠️ ledgerEntryIds is EMPTY, skipping invoice creation');
        }
      } catch (err) {
        console.error('\n[SALE DEBUG] ❌ FAILED to generate invoice:');
        console.error('[SALE DEBUG] Error name:', err.name);
        console.error('[SALE DEBUG] Error message:', err.message);
        console.error('[SALE DEBUG] Error stack:', err.stack);
        console.error('[SALE DEBUG] Full error:', err);
      }
    } else {
      console.log('[SALE DEBUG] ⏭️ Invoice generation SKIPPED (shouldGenerateInvoice=false)');
      console.log('  Reason: generateInvoice is false OR no patientId');
      console.log('  dto.generateInvoice:', dto.generateInvoice);
      console.log('  patientId:', patientId);
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('[SALE DEBUG] createSale() RETURNING');
    console.log('[SALE DEBUG] sale.id:', sale.id);
    console.log('[SALE DEBUG] invoice:', invoice ? 'PRESENT (id=' + invoice.id + ')' : 'NULL');
    console.log('═══════════════════════════════════════════════════════\n');

    return { ...sale, invoice };
  }

  // async createSale(dto: CreatePharmacySaleDto, userId?: string, staffId?: string) {
  //   console.log('\n═══════════════════════════════════════════════════════');
  //   console.log('[SALE DEBUG] createSale() ENTERED');
  //   console.log('[SALE DEBUG] dto:', JSON.stringify(dto, null, 2));
  //   console.log('[SALE DEBUG] userId:', userId);
  //   console.log('[SALE DEBUG] staffId:', staffId);
  //   console.log('═══════════════════════════════════════════════════════\n');

  //   console.log('[SALE DEBUG] ── Step 0: resolveLocationId ──');
  //   console.log('[SALE DEBUG] dto.locationId:', dto.locationId);
  //   const locationId = await this.resolveLocationId(dto.locationId);
  //   console.log('[SALE DEBUG] resolved locationId:', locationId);

  //   const shouldGenerateInvoice = dto.generateInvoice !== false && !!dto.patientId;
  //   console.log('[SALE DEBUG] shouldGenerateInvoice:', shouldGenerateInvoice);
  //   console.log('  dto.generateInvoice:', dto.generateInvoice);
  //   console.log('  !!dto.patientId:', !!dto.patientId);

  //   // ── Stock validation ───────────────────────────────────────────────────
  //   console.log('\n[SALE DEBUG] ── Step 1: Stock validation ──');
  //   for (const [index, item] of dto.items.entries()) {
  //     console.log(`[SALE DEBUG] Validating item #${index}:`, JSON.stringify(item));
  //     const drug = await this.getDrugWithInventory(item.drugId, locationId);
  //     console.log('[SALE DEBUG] fetched drug:', JSON.stringify(drug, null, 2));

  //     if (drug.inventoryItem) {
  //       const available = this.getAvailableStock(drug, locationId);
  //       console.log('[SALE DEBUG] available stock:', available, '| requested:', item.quantity);
  //       if (available < item.quantity) {
  //         console.error(`[SALE DEBUG] ❌ INSUFFICIENT STOCK for "${drug.name}"`);
  //         throw new BadRequestException(
  //           `Insufficient stock for "${drug.name}". Available: ${available}, Requested: ${item.quantity}`,
  //         );
  //       }
  //       console.log('[SALE DEBUG] ✅ Stock OK');
  //     } else {
  //       console.log('[SALE DEBUG] ⚠️ No inventoryItem for this drug');
  //     }
  //   }

  //   // ── Prescription validation ──────────────────────────────────────────────
  //   console.log('\n[SALE DEBUG] ── Step 2: Prescription validation ──');
  //   if (dto.prescriptionId) {
  //     console.log('[SALE DEBUG] dto.prescriptionId:', dto.prescriptionId);
  //     const rx = await this.prisma.prescription.findUnique({
  //       where: { id: dto.prescriptionId },
  //     });
  //     console.log('[SALE DEBUG] fetched prescription:', JSON.stringify(rx, null, 2));

  //     if (!rx) {
  //       console.error('[SALE DEBUG] ❌ Prescription not found');
  //       throw new NotFoundException('Prescription not found');
  //     }
  //     if (rx.status !== 'ACTIVE') {
  //       console.error(`[SALE DEBUG] ❌ Prescription not active, status: ${rx.status}`);
  //       throw new BadRequestException(
  //         `Prescription is not active (status: ${rx.status})`,
  //       );
  //     }
  //     console.log('[SALE DEBUG] ✅ Prescription valid');
  //   } else {
  //     console.log('[SALE DEBUG] No prescriptionId provided, skipping prescription check');
  //   }

  //   // ── Calculations ───────────────────────────────────────────────────────
  //   console.log('\n[SALE DEBUG] ── Step 3: Calculations ──');
  //   const subtotal = dto.items.reduce(
  //     (sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0),
  //     0,
  //   );
  //   const paymentsToRecord = shouldGenerateInvoice ? [] : (dto.payments ?? []);
  //   const amountPaid = paymentsToRecord.reduce((sum, p) => sum + p.amount, 0);
  //   const balance = subtotal - amountPaid;
  //   const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  //   console.log('[SALE DEBUG] subtotal:', subtotal);
  //   console.log('[SALE DEBUG] paymentsToRecord:', JSON.stringify(paymentsToRecord));
  //   console.log('[SALE DEBUG] amountPaid:', amountPaid);
  //   console.log('[SALE DEBUG] balance:', balance);
  //   console.log('[SALE DEBUG] generated saleCode:', saleCode);

  //   const saleStatus = shouldGenerateInvoice
  //     ? PharmacySaleStatus.PENDING
  //     : balance <= 0
  //       ? PharmacySaleStatus.COMPLETED
  //       : PharmacySaleStatus.PENDING;
  //   console.log('[SALE DEBUG] determined saleStatus:', saleStatus);

  //   // ── Step 1: sale + stock deduction (transaction) ───────────────────────
  //   console.log('\n[SALE DEBUG] ── Step 4: BEGIN PRISMA TRANSACTION ──');
  //   console.log('[SALE DEBUG] Transaction data to create:');
  //   console.log(JSON.stringify({
  //     saleCode,
  //     locationId,
  //     patientId: dto.patientId ?? null,
  //     prescriptionId: dto.prescriptionId ?? null,
  //     saleType: dto.saleType,
  //     notes: dto.notes ?? null,
  //     servedBy: dto.servedBy ?? null,
  //     subtotal,
  //     total: subtotal,
  //     amountPaid,
  //     balance,
  //     status: saleStatus,
  //     items: dto.items.map((i) => ({
  //       drugId: i.drugId,
  //       quantity: i.quantity,
  //       unitPrice: i.unitPrice,
  //       discount: i.discount ?? 0,
  //       total: i.quantity * i.unitPrice - (i.discount ?? 0),
  //     })),
  //     payments: paymentsToRecord,
  //   }, null, 2));

  //   const sale = await this.prisma.$transaction(async (tx) => {
  //     console.log('[SALE DEBUG] Inside transaction, creating pharmacySale...');

  //     const created = await tx.pharmacySale.create({
  //       data: {
  //         saleCode,
  //         locationId,
  //         patientId: dto.patientId ?? null,
  //         prescriptionId: dto.prescriptionId ?? null,
  //         saleType: dto.saleType,
  //         notes: dto.notes ?? null,
  //         servedBy: dto.servedBy ?? null,
  //         subtotal,
  //         total: subtotal,
  //         amountPaid,
  //         balance,
  //         status: saleStatus,
  //         items: {
  //           create: dto.items.map((i) => ({
  //             drugId: i.drugId,
  //             quantity: i.quantity,
  //             unitPrice: i.unitPrice,       // ← from DTO, always a plain number
  //             discount: i.discount ?? 0,
  //             total: i.quantity * i.unitPrice - (i.discount ?? 0),
  //           })),
  //         },
  //         ...(paymentsToRecord.length && {
  //           payments: { create: paymentsToRecord.map((p) => ({ ...p })) },
  //         }),
  //       },
  //       include: {
  //         items: {
  //           include: {
  //             drug: {
  //               select: { id: true, name: true }, // ← only fetch what we need
  //             },
  //           },
  //         },
  //         payments: true,
  //         location: { select: { id: true, name: true } },
  //         patient: { select: { firstName: true, lastName: true, patientCode: true } },
  //       },
  //     });

  //     console.log('[SALE DEBUG] ✅ pharmacySale CREATED with id:', created.id);
  //     console.log('[SALE DEBUG] created sale:', JSON.stringify(created, null, 2));

  //     // ── Stock deduction ──────────────────────────────────────────────────
  //     console.log('\n[SALE DEBUG] ── Step 4b: Stock deduction ──');
  //     for (const [index, item] of dto.items.entries()) {
  //       console.log(`[SALE DEBUG] Deducting stock for item #${index}: drugId=${item.drugId}, qty=${item.quantity}`);
  //       await this.deductDrugStock(
  //         tx, item.drugId, locationId, item.quantity,
  //         created.id, saleCode, dto.servedBy, staffId,
  //       );
  //       console.log(`[SALE DEBUG] ✅ Stock deducted for item #${index}`);
  //     }

  //     // ── Prescription update ──────────────────────────────────────────────
  //     if (dto.prescriptionId) {
  //       console.log('\n[SALE DEBUG] ── Step 4c: Update prescription status ──');
  //       console.log('[SALE DEBUG] Updating prescription', dto.prescriptionId, 'to DISPENSED');
  //       const updatedRx = await tx.prescription.update({
  //         where: { id: dto.prescriptionId },
  //         data: {
  //           status: 'DISPENSED',
  //           dispensedAt: new Date(),
  //           dispensedBy: dto.servedBy ?? null,
  //         },
  //       });
  //       console.log('[SALE DEBUG] ✅ Prescription updated:', JSON.stringify(updatedRx, null, 2));
  //     }

  //     console.log('[SALE DEBUG] Transaction complete, returning created sale');
  //     return created;
  //   });

  //   console.log('\n[SALE DEBUG] ✅ TRANSACTION COMMITTED');
  //   console.log('[SALE DEBUG] sale.id:', sale.id);
  //   console.log('[SALE DEBUG] sale.items:', JSON.stringify(sale.items, null, 2));

  //   // ── Step 2: ledger entries + invoice ─────────────────────────────────────
  //   console.log('\n═══════════════════════════════════════════════════════');
  //   console.log('[SALE DEBUG] ── Step 5: Ledger entries + Invoice generation ──');
  //   console.log('[SALE DEBUG] shouldGenerateInvoice:', shouldGenerateInvoice);
  //   console.log('═══════════════════════════════════════════════════════\n');

  //   let invoice: Awaited<ReturnType<InvoicesService['createFromLedger']>> | null = null;

  //   if (shouldGenerateInvoice) {
  //     console.log('[SALE DEBUG] Invoice generation branch: ENTERED');
  //     try {
  //       // ── FIX: build items from DTO prices (plain numbers), not Prisma result ──
  //       console.log('\n[SALE DEBUG] ── Building saleForLedger ──');
  //       console.log('[SALE DEBUG] dto.items:', JSON.stringify(dto.items, null, 2));
  //       console.log('[SALE DEBUG] sale.items from DB:', JSON.stringify(sale.items, null, 2));

  //       const saleForLedger = {
  //         id: sale.id,
  //         saleCode: sale.saleCode,
  //         patientId: sale.patientId!,
  //         visitId: null as string | null,
  //         items: dto.items.map((dtoItem) => {
  //           // Find the drug name from the sale include
  //           const saleItem = sale.items.find((si) => si.drugId === dtoItem.drugId);
  //           const mappedItem = {
  //             drugId: dtoItem.drugId,
  //             quantity: dtoItem.quantity,
  //             unitPrice: Number(dtoItem.unitPrice),   // ← always from DTO, guaranteed number
  //             discount: Number(dtoItem.discount ?? 0),
  //             total: dtoItem.quantity * Number(dtoItem.unitPrice) - Number(dtoItem.discount ?? 0),
  //             drug: saleItem?.drug ? { name: saleItem.drug.name } : null,
  //           };
  //           console.log(`[SALE DEBUG] Mapped item for drugId=${dtoItem.drugId}:`, JSON.stringify(mappedItem));
  //           return mappedItem;
  //         }),
  //       };

  //       console.log('\n[SALE DEBUG] saleForLedger object:');
  //       console.log(JSON.stringify(saleForLedger, null, 2));

  //       console.log('\n[SALE DEBUG] ── Calling createLedgerEntriesForSale() ──');
  //       const ledgerEntryIds = await this.createLedgerEntriesForSale(saleForLedger);
  //       console.log('\n[SALE DEBUG] Returned from createLedgerEntriesForSale()');
  //       console.log('[SALE DEBUG] ledgerEntryIds:', ledgerEntryIds);

  //       // ── FIX: single call, guarded by length check ────────────────────────
  //       if (ledgerEntryIds.length > 0) {
  //         console.log('\n[SALE DEBUG] ✅ ledgerEntryIds.length > 0, proceeding to create invoice');
  //         console.log('[SALE DEBUG] Calling invoices.createFromLedger() with:');
  //         console.log(JSON.stringify({
  //           patientId: sale.patientId!,
  //           visitId: undefined,
  //           ledgerEntryIds,
  //           invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
  //           notes: `Pharmacy sale: ${saleCode}`,
  //         }, null, 2));

  //         invoice = await this.invoices.createFromLedger({
  //           patientId: sale.patientId!,
  //           visitId: undefined,
  //           ledgerEntryIds,
  //           invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
  //           notes: `Pharmacy sale: ${saleCode}`,
  //         });

  //         console.log('[SALE DEBUG] ✅ Invoice created:', JSON.stringify(invoice, null, 2));

  //         // ── FIX: write invoiceId back (was missing in createSale) ────────
  //         console.log('\n[SALE DEBUG] ── Writing invoiceId back to pharmacySale ──');
  //         const updatedSale = await this.prisma.pharmacySale.update({
  //           where: { id: sale.id },
  //           data: { invoiceId: invoice.id },
  //         });
  //         console.log('[SALE DEBUG] ✅ pharmacySale updated with invoiceId:', updatedSale.invoiceId);
  //       } else {
  //         console.warn('[SALE DEBUG] ⚠️ ledgerEntryIds is EMPTY, skipping invoice creation');
  //       }
  //     } catch (err) {
  //       console.error('\n[SALE DEBUG] ❌ FAILED to generate invoice:');
  //       console.error('[SALE DEBUG] Error name:', err.name);
  //       console.error('[SALE DEBUG] Error message:', err.message);
  //       console.error('[SALE DEBUG] Error stack:', err.stack);
  //       console.error('[SALE DEBUG] Full error:', err);
  //     }
  //   } else {
  //     console.log('[SALE DEBUG] ⏭️ Invoice generation SKIPPED (shouldGenerateInvoice=false)');
  //     console.log('  Reason: generateInvoice is false OR no patientId');
  //     console.log('  dto.generateInvoice:', dto.generateInvoice);
  //     console.log('  dto.patientId:', dto.patientId);
  //   }

  //   console.log('\n═══════════════════════════════════════════════════════');
  //   console.log('[SALE DEBUG] createSale() RETURNING');
  //   console.log('[SALE DEBUG] sale.id:', sale.id);
  //   console.log('[SALE DEBUG] invoice:', invoice ? 'PRESENT (id=' + invoice.id + ')' : 'NULL');
  //   console.log('═══════════════════════════════════════════════════════\n');

  //   return { ...sale, invoice };
  // }

  // private async createLedgerEntriesForSale(
  //   sale: {
  //     id: string;
  //     saleCode: string;
  //     patientId: string | null;
  //     visitId?: string | null;
  //     items: Array<{
  //       drugId: string;
  //       quantity: number;
  //       unitPrice: number;
  //       discount: number;
  //       total: number;
  //       drug?: { name: string } | null;
  //     }>;
  //   },
  // ): Promise<string[]> {
  //   if (!sale.patientId) return [];

  //   const ledgerEntryIds: string[] = [];

  //   for (const item of sale.items) {
  //     // ── FIX: explicit Number() casts — guards against Prisma Decimal objects ──
  //     const unitPrice = Number(item.unitPrice);
  //     const quantity = Number(item.quantity);
  //     const discountAmount = Number(item.discount ?? 0);
  //     const subtotal = quantity * unitPrice;
  //     const totalPrice = subtotal - discountAmount;

  //     // Guard: if prices are still 0 after cast, log a warning
  //     if (unitPrice === 0) {
  //       console.warn(
  //         `[LedgerEntry] unitPrice is 0 for drugId=${item.drugId} in sale=${sale.id}. ` +
  //         `Check that DTO prices are being passed through correctly.`,
  //       );
  //     }

  //     const description = item.drug?.name
  //       ? `${item.drug.name} × ${quantity}`
  //       : `Drug sale × ${quantity}`;

  //     const entry = await this.prisma.ledgerEntry.create({
  //       data: {
  //         entryCode: genEntryCode(),
  //         patientId: sale.patientId,
  //         visitId: sale.visitId ?? null,
  //         type: LedgerEntryType.DRUG,
  //         description,
  //         sourceType: 'PHARMACY_SALE',
  //         sourceId: sale.id,
  //         quantity,
  //         pricePerUnit: unitPrice,
  //         subtotalPrice: subtotal,
  //         discountAmount,
  //         taxAmount: 0,
  //         totalPrice,
  //         currency: 'UGX',
  //         exchangeRate: 1,
  //         baseCurrency: 'UGX',
  //         baseAmount: totalPrice,
  //         status: LedgerEntryStatus.PENDING,
  //       },
  //     });

  //     ledgerEntryIds.push(entry.id);
  //   }

  //   return ledgerEntryIds;
  // }

  // async createSale(dto: CreatePharmacySaleDto, userId?: string, staffId?: string) {
  //   const locationId = await this.resolveLocationId(dto.locationId);
  //   const shouldGenerateInvoice = dto.generateInvoice !== false && !!dto.patientId;

  //   // Stock validation
  //   for (const item of dto.items) {
  //     const drug = await this.getDrugWithInventory(item.drugId, locationId);
  //     if (drug.inventoryItem) {
  //       const available = this.getAvailableStock(drug, locationId);
  //       if (available < item.quantity) {
  //         throw new BadRequestException(
  //           `Insufficient stock for "${drug.name}". Available: ${available}, Requested: ${item.quantity}`,
  //         );
  //       }
  //     }
  //   }

  //   if (dto.prescriptionId) {
  //     const rx = await this.prisma.prescription.findUnique({
  //       where: { id: dto.prescriptionId },
  //     });
  //     if (!rx) throw new NotFoundException('Prescription not found');
  //     if (rx.status !== 'ACTIVE')
  //       throw new BadRequestException(
  //         `Prescription is not active (status: ${rx.status})`,
  //       );
  //   }

  //   const subtotal = dto.items.reduce(
  //     (sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0),
  //     0,
  //   );
  //   const paymentsToRecord = shouldGenerateInvoice ? [] : (dto.payments ?? []);
  //   const amountPaid = paymentsToRecord.reduce((sum, p) => sum + p.amount, 0);
  //   const balance = subtotal - amountPaid;
  //   const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  //   // ── Step 1: sale + stock deduction ──────────────────────────────────────
  //   const sale = await this.prisma.$transaction(async (tx) => {
  //     const created = await tx.pharmacySale.create({
  //       data: {
  //         saleCode,
  //         locationId,
  //         patientId: dto.patientId ?? null,
  //         prescriptionId: dto.prescriptionId ?? null,
  //         saleType: dto.saleType,
  //         notes: dto.notes ?? null,
  //         servedBy: dto.servedBy ?? null,
  //         subtotal,
  //         total: subtotal,
  //         amountPaid,
  //         balance,
  //         status: shouldGenerateInvoice
  //           ? PharmacySaleStatus.PENDING
  //           : balance <= 0
  //             ? PharmacySaleStatus.COMPLETED
  //             : PharmacySaleStatus.PENDING,
  //         items: {
  //           create: dto.items.map((i) => ({
  //             drugId: i.drugId,
  //             quantity: i.quantity,
  //             unitPrice: i.unitPrice,       // ← from DTO, always a plain number
  //             discount: i.discount ?? 0,
  //             total: i.quantity * i.unitPrice - (i.discount ?? 0),
  //           })),
  //         },
  //         ...(paymentsToRecord.length && {
  //           payments: { create: paymentsToRecord.map((p) => ({ ...p })) },
  //         }),
  //       },
  //       include: {
  //         items: {
  //           include: {
  //             drug: {
  //               select: { id: true, name: true }, // ← only fetch what we need
  //             },
  //           },
  //         },
  //         payments: true,
  //         location: { select: { id: true, name: true } },
  //         patient: { select: { firstName: true, lastName: true, patientCode: true } },
  //       },
  //     });

  //     for (const item of dto.items) {
  //       await this.deductDrugStock(
  //         tx, item.drugId, locationId, item.quantity,
  //         created.id, saleCode, dto.servedBy, staffId,
  //       );
  //     }

  //     if (dto.prescriptionId) {
  //       await tx.prescription.update({
  //         where: { id: dto.prescriptionId },
  //         data: {
  //           status: 'DISPENSED',
  //           dispensedAt: new Date(),
  //           dispensedBy: dto.servedBy ?? null,
  //         },
  //       });
  //     }

  //     return created;
  //   });

  //   // ── Step 2: ledger entries + invoice ─────────────────────────────────────
  //   let invoice: Awaited<ReturnType<InvoicesService['createFromLedger']>> | null = null;

  //   if (shouldGenerateInvoice) {
  //     try {
  //       // ── FIX: build items from DTO prices (plain numbers), not Prisma result ──
  //       const saleForLedger = {
  //         id: sale.id,
  //         saleCode: sale.saleCode,
  //         patientId: sale.patientId!,
  //         visitId: null as string | null,
  //         items: dto.items.map((dtoItem) => {
  //           // Find the drug name from the sale include
  //           const saleItem = sale.items.find((si) => si.drugId === dtoItem.drugId);
  //           return {
  //             drugId: dtoItem.drugId,
  //             quantity: dtoItem.quantity,
  //             unitPrice: Number(dtoItem.unitPrice),   // ← always from DTO, guaranteed number
  //             discount: Number(dtoItem.discount ?? 0),
  //             total: dtoItem.quantity * Number(dtoItem.unitPrice) - Number(dtoItem.discount ?? 0),
  //             drug: saleItem?.drug ? { name: saleItem.drug.name } : null,
  //           };
  //         }),
  //       };

  //       const ledgerEntryIds = await this.createLedgerEntriesForSale(saleForLedger);

  //       // ── FIX: single call, guarded by length check ────────────────────────
  //       if (ledgerEntryIds.length > 0) {
  //         invoice = await this.invoices.createFromLedger({
  //           patientId: sale.patientId!,
  //           visitId: undefined,
  //           ledgerEntryIds,
  //           invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
  //           notes: `Pharmacy sale: ${saleCode}`,
  //         });

  //         // ── FIX: write invoiceId back (was missing in createSale) ────────
  //         await this.prisma.pharmacySale.update({
  //           where: { id: sale.id },
  //           data: { invoiceId: invoice.id },
  //         });
  //       }
  //     } catch (err) {
  //       console.error('[PharmacySale] Failed to generate invoice:', err);
  //     }
  //   }

  //   return { ...sale, invoice };
  // }

  // private async createLedgerEntriesForSale(
  //   sale: {
  //     id: string;
  //     saleCode: string;
  //     patientId: string | null;
  //     visitId?: string | null;
  //     items: Array<{
  //       drugId: string;
  //       quantity: number;
  //       unitPrice: number;
  //       discount: number;
  //       total: number;
  //       drug?: { name: string } | null;
  //     }>;
  //   },
  // ): Promise<string[]> {
  //   if (!sale.patientId) return []; // Can't create ledger entries without a patient

  //   const ledgerEntryIds: string[] = [];

  //   for (const item of sale.items) {
  //     const description = item.drug?.name
  //       ? `${item.drug.name} × ${item.quantity}`
  //       : `Drug sale × ${item.quantity}`;

  //     const subtotal = item.quantity * item.unitPrice;
  //     const discountAmount = item.discount ?? 0;
  //     const totalPrice = subtotal - discountAmount;

  //     const entry = await this.prisma.ledgerEntry.create({
  //       data: {
  //         entryCode: genEntryCode(),
  //         patientId: sale.patientId,
  //         visitId: sale.visitId ?? null,
  //         type: LedgerEntryType.DRUG,
  //         description,
  //         sourceType: 'PHARMACY_SALE',
  //         sourceId: sale.id,
  //         quantity: item.quantity,
  //         pricePerUnit: item.unitPrice,
  //         subtotalPrice: subtotal,
  //         discountAmount,
  //         taxAmount: 0,
  //         totalPrice,
  //         currency: 'UGX',
  //         exchangeRate: 1,
  //         baseCurrency: 'UGX',
  //         baseAmount: totalPrice,
  //         status: LedgerEntryStatus.PENDING,
  //       },
  //     });

  //     ledgerEntryIds.push(entry.id);
  //   }

  //   return ledgerEntryIds;
  // }
  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE SALE
  // ═══════════════════════════════════════════════════════════════════════════

  // async createSale(dto: CreatePharmacySaleDto, userId?: string, staffId?: string) {
  //   const locationId = await this.resolveLocationId(dto.locationId);
  //   const shouldGenerateInvoice = dto.generateInvoice !== false && !!dto.patientId;

  //   // ── Your existing pre-validation (stock check, prescription check) ──────
  //   for (const item of dto.items) {
  //     const drug = await this.getDrugWithInventory(item.drugId, locationId);
  //     if (drug.inventoryItem) {
  //       const available = this.getAvailableStock(drug, locationId);
  //       if (available < item.quantity) {
  //         throw new BadRequestException(
  //           `Insufficient stock for "${drug.name}". Available: ${available}, Requested: ${item.quantity}`,
  //         );
  //       }
  //     }
  //   }

  //   if (dto.prescriptionId) {
  //     const rx = await this.prisma.prescription.findUnique({ where: { id: dto.prescriptionId } });
  //     if (!rx) throw new NotFoundException('Prescription not found');
  //     if (rx.status !== 'ACTIVE')
  //       throw new BadRequestException(`Prescription is not active (status: ${rx.status})`);
  //   }

  //   // ── Compute sale totals ──────────────────────────────────────────────────
  //   const subtotal = dto.items.reduce(
  //     (sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0), 0,
  //   );

  //   // When we're generating an invoice, don't take upfront payments on the sale itself.
  //   // Payment will happen through the invoice flow instead.
  //   const paymentsToRecord = shouldGenerateInvoice ? [] : (dto.payments ?? []);
  //   const amountPaid = paymentsToRecord.reduce((sum, p) => sum + p.amount, 0);
  //   const balance = subtotal - amountPaid;
  //   const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  //   // ── Step 1: Create the pharmacy sale + deduct stock ──────────────────────
  //   const sale = await this.prisma.$transaction(async (tx) => {
  //     const created = await tx.pharmacySale.create({
  //       data: {
  //         saleCode,
  //         locationId,
  //         patientId: dto.patientId ?? null,
  //         prescriptionId: dto.prescriptionId ?? null,
  //         saleType: dto.saleType,
  //         notes: dto.notes ?? null,
  //         servedBy: dto.servedBy ?? null,
  //         subtotal,
  //         total: subtotal,
  //         amountPaid,
  //         balance,
  //         // Keep PENDING — will be COMPLETED when invoice is paid
  //         status: shouldGenerateInvoice
  //           ? PharmacySaleStatus.PENDING
  //           : balance <= 0
  //             ? PharmacySaleStatus.COMPLETED
  //             : PharmacySaleStatus.PENDING,
  //         items: {
  //           create: dto.items.map((i) => ({
  //             drugId: i.drugId,
  //             quantity: i.quantity,
  //             unitPrice: i.unitPrice,
  //             discount: i.discount ?? 0,
  //             total: i.quantity * i.unitPrice - (i.discount ?? 0),
  //           })),
  //         },
  //         ...(paymentsToRecord.length && {
  //           payments: { create: paymentsToRecord.map((p) => ({ ...p })) },
  //         }),
  //       },
  //       include: {
  //         items: {
  //           include: {
  //             drug: {
  //               include: {
  //                 category: { select: { id: true, name: true, color: true, icon: true } },
  //               },
  //             },
  //           },
  //         },
  //         payments: true,
  //         location: { select: { id: true, name: true } },
  //         patient: { select: { firstName: true, lastName: true, patientCode: true } },
  //       },
  //     });

  //     // Deduct inventory + write ledger entries
  //     for (const item of dto.items) {
  //       await this.deductDrugStock(
  //         tx, item.drugId, locationId, item.quantity,
  //         created.id, saleCode, dto.servedBy, staffId,
  //       );
  //     }

  //     // Mark prescription as dispensed
  //     if (dto.prescriptionId) {
  //       await tx.prescription.update({
  //         where: { id: dto.prescriptionId },
  //         data: { status: 'DISPENSED', dispensedAt: new Date(), dispensedBy: dto.servedBy ?? null },
  //       });
  //     }

  //     return created;
  //   });

  //   // ── Step 2: Create LedgerEntries + Invoice (outside main tx, non-blocking) ──
  //   let invoice: Awaited<ReturnType<InvoicesService['createFromLedger']>> | null = null;
  //   // let invoice = null;
  //   if (shouldGenerateInvoice) {
  //     try {
  //       // Map items with drug names from the sale we just created
  //       const saleWithDrugs = {
  //         ...sale,
  //         items: sale.items.map((i) => ({
  //           ...i,
  //           drug: i.drug ?? null,
  //         })),
  //       };


  //       const ledgerEntryIds = await this.createLedgerEntriesForSale(saleWithDrugs);
  //       invoice = await this.invoices.createFromLedger({
  //         patientId: sale.patientId!,
  //         visitId: undefined, // ← FIX: was `null`
  //         ledgerEntryIds,
  //         invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
  //         notes: `Pharmacy sale: ${saleCode}`,
  //       });

  //       if (ledgerEntryIds.length > 0) {
  //         invoice = await this.invoices.createFromLedger({
  //           patientId: sale.patientId!,
  //           visitId: undefined,
  //           ledgerEntryIds,
  //           invoiceCurrency: dto.invoiceCurrency ?? 'BASE',
  //           notes: `Pharmacy sale: ${saleCode}`,
  //         });
  //       }
  //     } catch (err) {
  //       // Invoice creation failure should NOT roll back the sale
  //       console.error('[PharmacySale] Failed to generate invoice:', err);
  //     }
  //   }

  //   return { ...sale, invoice };
  // }

  // async createSale(
  //   dto: CreatePharmacySaleDto,
  //   userId?: string,
  //   staffId?: string,
  // ) {
  //   const locationId = await this.resolveLocationId(dto.locationId);

  //   // Pre-validate stock
  //   for (const item of dto.items) {
  //     const drug = await this.getDrugWithInventory(item.drugId, locationId);
  //     if (drug.inventoryItem) {
  //       // ✅ Pass locationId
  //       const available = this.getAvailableStock(drug, locationId);
  //       if (available < item.quantity) {
  //         throw new BadRequestException(
  //           `Insufficient stock for "${drug.name}". ` +
  //             `Available: ${available}, Requested: ${item.quantity}`,
  //         );
  //       }
  //     }
  //   }
  //   // for (const item of dto.items) {
  //   //   const drug = await this.getDrugWithInventory(item.drugId, locationId);
  //   //   if (drug.inventoryItem) {
  //   //     const available = this.getAvailableStock(drug);
  //   //     if (available < item.quantity) {
  //   //       throw new BadRequestException(
  //   //         `Insufficient stock for "${drug.name}". ` +
  //   //           `Available: ${available}, Requested: ${item.quantity}`,
  //   //       );
  //   //     }
  //   //   }
  //   // }

  //   // Validate prescription
  //   if (dto.prescriptionId) {
  //     const rx = await this.prisma.prescription.findUnique({
  //       where: { id: dto.prescriptionId },
  //     });
  //     if (!rx) throw new NotFoundException('Prescription not found');
  //     if (rx.status !== 'ACTIVE')
  //       throw new BadRequestException(
  //         `Prescription is not active (status: ${rx.status})`,
  //       );
  //   }

  //   // Compute totals
  //   const subtotal = dto.items.reduce(
  //     (sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0),
  //     0,
  //   );
  //   const amountPaid = dto.payments?.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  //   const balance = subtotal - amountPaid;
  //   const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  //   return this.prisma.$transaction(async (tx) => {
  //     // Create sale record
  //     const sale = await tx.pharmacySale.create({
  //       data: {
  //         saleCode,
  //         locationId,
  //         patientId: dto.patientId ?? null,
  //         prescriptionId: dto.prescriptionId ?? null,
  //         saleType: dto.saleType,
  //         notes: dto.notes ?? null,
  //         servedBy: dto.servedBy ?? null,
  //         subtotal,
  //         total: subtotal,
  //         amountPaid,
  //         balance,
  //         status:
  //           balance <= 0
  //             ? PharmacySaleStatus.COMPLETED
  //             : PharmacySaleStatus.PENDING,
  //         items: {
  //           create: dto.items.map((i) => ({
  //             drugId: i.drugId,
  //             quantity: i.quantity,
  //             unitPrice: i.unitPrice,
  //             discount: i.discount ?? 0,
  //             total: i.quantity * i.unitPrice - (i.discount ?? 0),
  //           })),
  //         },
  //         ...(dto.payments?.length && {
  //           payments: { create: dto.payments.map((p) => ({ ...p })) },
  //         }),
  //       },
  //       include: {
  //         items: {
  //           include: {
  //             drug: {
  //               include: {
  //                 category: {
  //                   select: { id: true, name: true, color: true, icon: true },
  //                 },
  //               },
  //             },
  //           },
  //         },
  //         payments: true,
  //         location: { select: { id: true, name: true } },
  //         patient: {
  //           select: { firstName: true, lastName: true, patientCode: true },
  //         },
  //       },
  //     });

  //     // Deduct inventory + write ledger entries
  //     for (const item of dto.items) {
  //       await this.deductDrugStock(
  //         tx,
  //         item.drugId,
  //         locationId,
  //         item.quantity,
  //         sale.id, // ✅ FK to sale for referenceId
  //         saleCode,
  //         dto.servedBy,
  //         staffId, // ✅ Optional: track which staff performed the deduction
  //       );
  //     }

  //     // Mark prescription as dispensed
  //     if (dto.prescriptionId) {
  //       await tx.prescription.update({
  //         where: { id: dto.prescriptionId },
  //         data: {
  //           status: 'DISPENSED',
  //           dispensedAt: new Date(),
  //           dispensedBy: dto.servedBy ?? null,
  //         },
  //       });
  //     }

  //     return sale;
  //   });
  // }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPENSE MULTIPLE
  // ═══════════════════════════════════════════════════════════════════════════

  async dispenseMultiple(dto: DispenseMultipleDto, userId?: string, staffId?: string) {
    const locationId = await this.resolveLocationId(dto.locationId);
    const shouldGenerateInvoice = true; // dispenseMultiple always has a patientId


    if (!dto.prescriptionIds?.length && !dto.walkInItems?.length) {
      throw new BadRequestException(
        'Provide at least one prescriptionId or walkInItem.',
      );
    }

    // Fetch & validate prescriptions
    const prescriptions = dto.prescriptionIds?.length
      ? await this.prisma.prescription.findMany({
        where: { id: { in: dto.prescriptionIds } },
        include: {
          items: {
            include: {
              drug: {
                select: {
                  id: true,
                  name: true,
                  sellPrice: true,
                  unitPrice: true,
                  unit: true,
                },
              },
            },
          },
        },
      })
      : [];

    for (const rx of prescriptions) {
      if (rx.patientId !== dto.patientId) {
        throw new BadRequestException(
          `Prescription "${rx.prescriptionCode}" does not belong to this patient.`,
        );
      }
      if (rx.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Prescription "${rx.prescriptionCode}" is not active (status: ${rx.status}).`,
        );
      }
    }

    // Build consolidated items
    const rxLineItems = prescriptions.flatMap((rx) =>
      rx.items.map((item) => ({
        drugId: item.drugId,
        quantity: item.quantity,
        unitPrice: Number(item.drug?.sellPrice ?? item.drug?.unitPrice ?? 0),
        discount: 0,
        prescriptionId: rx.id,
      })),
    );

    const walkInLineItems = (dto.walkInItems ?? []).map((i) => ({
      ...i,
      discount: i.discount ?? 0,
      prescriptionId: null as string | null,
    }));

    const allItems = [...rxLineItems, ...walkInLineItems];

    // Aggregate quantities for stock validation
    const qtyByDrug = allItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.drugId] = (acc[item.drugId] ?? 0) + item.quantity;
      return acc;
    }, {});

    for (const [drugId, needed] of Object.entries(qtyByDrug)) {
      const drug = await this.getDrugWithInventory(drugId, locationId);
      if (drug.inventoryItem) {
        // ✅ Pass locationId
        const available = this.getAvailableStock(drug, locationId);
        if (available < needed) {
          throw new BadRequestException(
            `Insufficient stock for "${drug.name}". ` +
            `Need: ${needed}, Available: ${available}`,
          );
        }
      }
    }

    // Compute totals
    const subtotal = allItems.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice - i.discount, 0,
    );
    // No upfront payments when invoice will be generated
    const amountPaid = 0;
    const balance = subtotal;
    const saleCode = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.pharmacySale.create({
        data: {
          saleCode,
          locationId,
          patientId: dto.patientId,
          saleType: 'PRESCRIPTION' as SaleType,
          notes: /* your existing notes logic */ null,
          servedBy: dto.servedBy ?? null,
          subtotal,
          total: subtotal,
          amountPaid,
          balance,
          status: PharmacySaleStatus.PENDING, // will complete via invoice payment
          items: {
            create: allItems.map((i) => ({
              drugId: i.drugId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
              total: i.quantity * i.unitPrice - i.discount,
            })),
          },
        },
        include: {
          items: {
            include: {
              drug: {
                include: {
                  category: { select: { id: true, name: true, color: true, icon: true } },
                },
              },
            },
          },
          payments: true,
          location: { select: { id: true, name: true } },
          patient: { select: { firstName: true, lastName: true, patientCode: true } },
        },
      });

      for (const [drugId, qty] of Object.entries(qtyByDrug)) {
        await this.deductDrugStock(tx, drugId, locationId, qty, created.id, saleCode, dto.servedBy, staffId, 'Multi-dispense sale');
      }

      if (dto.prescriptionIds?.length) {
        await tx.prescription.updateMany({
          where: { id: { in: dto.prescriptionIds } },
          data: { status: 'DISPENSED', dispensedAt: new Date(), dispensedBy: dto.servedBy ?? null },
        });
      }

      return created;
    });

    // Generate ledger entries + invoice
    // let invoice = null;
    let invoice: Awaited<ReturnType<InvoicesService['createFromLedger']>> | null = null;

    // After the main transaction completes...

    // let invoice = null;
    if (shouldGenerateInvoice) {
      try {
        const saleForLedger = {
          id: sale.id,
          saleCode: sale.saleCode,
          patientId: sale.patientId!,
          visitId: null,
          items: sale.items.map((i) => ({
            drugId: i.drugId,
            quantity: i.quantity,
            unitPrice: toNum(i.unitPrice),
            discount: toNum(i.discount),
            total: toNum(i.total),
            drug: i.drug ?? null,
          })),
        };

        const ledgerEntryIds = await this.createLedgerEntriesForSale(saleForLedger);

        if (ledgerEntryIds.length > 0) {
          invoice = await this.invoices.createFromLedger({
            patientId: sale.patientId!,
            visitId: undefined,
            ledgerEntryIds,
            invoiceCurrency: 'UGX', // dto.invoiceCurrency ?? 'BASE',
            notes: `Pharmacy sale: ${sale.saleCode}`,
          });

          // ── KEY: write invoiceId back to PharmacySale ──────────────────
          await this.prisma.pharmacySale.update({
            where: { id: sale.id },
            data: { invoiceId: invoice.id },
          });
        }
      } catch (err) {
        console.error('[PharmacySale] Failed to generate invoice:', err);
        // Sale is NOT rolled back — invoice can be created manually later
      }
    }

    return { ...sale, invoice };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SALES
  // ═══════════════════════════════════════════════════════════════════════════

  async getSales(filters: {
    locationId?: string;
    patientId?: string;
    saleType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.PharmacySaleWhereInput = {
      ...(filters.locationId && { locationId: filters.locationId }),
      ...(filters.patientId && { patientId: filters.patientId }),
      ...(filters.saleType && { saleType: filters.saleType as SaleType }),
      ...(filters.status && { status: filters.status as PharmacySaleStatus }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
    };

    const [total, records] = await Promise.all([
      this.prisma.pharmacySale.count({ where }),
      this.prisma.pharmacySale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              drug: {
                include: {
                  category: {
                    select: { id: true, name: true, color: true, icon: true },
                  },
                },
              },
            },
          },
          payments: true,
          location: { select: { id: true, name: true } },
          patient: {
            select: { firstName: true, lastName: true, patientCode: true },
          },
        },
      }),
    ]);

    return { data: records, meta: { total, page, limit } };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SINGLE SALE + LEDGER ENTRIES
  // ═══════════════════════════════════════════════════════════════════════════

  async getSale(id: string) {
    const sale = await this.prisma.pharmacySale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            drug: {
              include: {
                category: {
                  select: { id: true, name: true, color: true, icon: true },
                },
                inventoryItem: {
                  select: {
                    id: true,
                    unitCost: true,
                    // Optionally include locationStocks if you need per-location detail
                    locationStocks: {
                      select: { locationId: true, quantity: true },
                    },
                  },
                },
              },
            },
          },
        },
        payments: true,
        location: true,
        patient: {
          select: { firstName: true, lastName: true, patientCode: true },
        },
        prescription: true,
        // ✅ Include related ledger entries for audit trail
        // ledgerEntries: {
        //   where: { referenceType: { in: ['PHARMACY_SALE', 'PHARMACY_SALE_REFUND'] } },
        //   include: {
        //     item: { select: { id: true, name: true, itemCode: true } },
        //     location: { select: { id: true, name: true } },
        //     batch: { select: { id: true, batchNumber: true, expiryDate: true } },
        //     performedBy: { select: { id: true, email: true } },
        //     performedByStaff: { select: { id: true, firstName: true, lastName: true } },
        //   },
        //   orderBy: { createdAt: 'desc' },
        // },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD PAYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async addPayment(saleId: string, dto: AddSalePaymentDto) {
    const sale = await this.prisma.pharmacySale.findUnique({
      where: { id: saleId },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status === PharmacySaleStatus.COMPLETED)
      throw new BadRequestException('Sale is already fully paid');
    if (sale.status === PharmacySaleStatus.REFUNDED)
      throw new BadRequestException('Sale has been refunded');

    const newPaid = toNum(sale.amountPaid) + dto.amount;
    const newBalance = toNum(sale.total) - newPaid;
    if (newPaid > toNum(sale.total) + 0.01)
      throw new BadRequestException(
        `Payment (${dto.amount}) exceeds remaining balance (${sale.balance})`,
      );

    return this.prisma.$transaction([
      this.prisma.pharmacySalePayment.create({
        data: { saleId, ...dto },
      }),
      this.prisma.pharmacySale.update({
        where: { id: saleId },
        data: {
          amountPaid: newPaid,
          balance: Math.max(0, newBalance),
          status:
            newBalance <= 0.01
              ? PharmacySaleStatus.COMPLETED
              : PharmacySaleStatus.PENDING,
        },
      }),
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFUND — Restores stock + writes RETURN_IN ledger entry
  // ═══════════════════════════════════════════════════════════════════════════

  async refundSale(
    saleId: string,
    reason?: string,
    performedByStaffId?: string,
  ) {
    const sale = await this.prisma.pharmacySale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: { drug: { include: { inventoryItem: true } } },
        },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status === PharmacySaleStatus.REFUNDED)
      throw new BadRequestException('Sale is already refunded');

    return this.prisma.$transaction(async (tx) => {
      // Restore stock + write ledger for each item
      for (const item of sale.items) {
        await this.restoreDrugStock(
          tx,
          item.drugId,
          sale.locationId,
          item.quantity,
          sale.id,
          sale.saleCode,
          reason ?? 'No reason provided',
          performedByStaffId,
        );
      }

      return tx.pharmacySale.update({
        where: { id: saleId },
        data: {
          status: PharmacySaleStatus.REFUNDED,
          notes: [sale.notes, `REFUNDED: ${reason ?? ''}`]
            .filter(Boolean)
            .join('\n'),
        },
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES STATS
  // ═══════════════════════════════════════════════════════════════════════════

  async getSalesStats(locationId?: string, dateFrom?: string, dateTo?: string) {
    const where: Prisma.PharmacySaleWhereInput = {
      status: { not: PharmacySaleStatus.CANCELLED },
      ...(locationId && { locationId }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [sales, payments] = await Promise.all([
      this.prisma.pharmacySale.findMany({
        where,
        select: { total: true, amountPaid: true, balance: true, status: true },
      }),
      this.prisma.pharmacySalePayment.findMany({
        where: { sale: where },
        select: { amount: true, method: true },
      }),
    ]);

    const totalRevenue = sales.reduce((s, x) => s + toNum(x.total), 0);
    const totalCollected = sales.reduce((s, x) => s + toNum(x.amountPaid), 0);
    const totalOutstanding = sales.reduce((s, x) => s + toNum(x.balance), 0);
    const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
      acc[p.method] = (acc[p.method] ?? 0) + toNum(p.amount);
      return acc;
    }, {});

    return {
      totalSales: sales.length,
      totalRevenue,
      totalCollected,
      totalOutstanding,
      byPaymentMethod: byMethod,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BONUS: Query ledger entries for a specific sale (for audit UI)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSaleLedgerEntries(saleId: string) {
    return this.prisma.inventoryLedger.findMany({
      where: {
        referenceType: { in: ['PHARMACY_SALE', 'PHARMACY_SALE_REFUND'] },
        referenceId: saleId,
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
        batch: {
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            receivedAt: true,
          },
        },
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
