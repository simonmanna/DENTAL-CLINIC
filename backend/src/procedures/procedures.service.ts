import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProcedureDto,
  UpdateProcedureDto,
  ProcedureQueryDto,
  AddVisitProcedureDto,
  UpdateVisitProcedureDto,
} from './dto/procedure.dto';
import { LedgerService } from '../billing/ledger.service';
import { StockLedgerType, Prisma, LedgerAccountType } from '@prisma/client';

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

@Injectable()
export class ProceduresService {
  constructor(
    private prisma: PrismaService,
    private ledgerService: LedgerService,
  ) {}

  // ─── HELPER: Aggregate quantity from location stocks ─────────────────────
  private aggregateLocationStock(
    locationStocks: { quantity: number; locationId?: string }[], 
    locationId?: string
  ): number {
    if (!locationStocks?.length) return 0;
    
    if (locationId) {
      const stock = locationStocks.find((s) => s.locationId === locationId);
      return stock?.quantity ?? 0;
    }
    
    return locationStocks.reduce((sum, s) => sum + s.quantity, 0);
  }

  // ─── HELPER: Enrich inventory item with aggregated stock info ────────────
  private enrichInventoryWithStock(inventoryItem: any, locationId?: string) {
    if (!inventoryItem) return inventoryItem;

    const totalQuantity = this.aggregateLocationStock(
      inventoryItem.locationStocks, 
      locationId
    );

    return {
      ...inventoryItem,
      totalQuantity, // ✅ Computed field for frontend convenience
    };
  }

  // ─── Procedure Catalog ────────────────────────────────────────────────────

  async findAllProcedures(query: ProcedureQueryDto) {
    const { search, category, isActive, page = '1', limit = '20' } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Prisma.ProcedureWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { category: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (category) {
      where.category = { name: category };
    }
    if (isActive !== undefined) {
      // where.isActive = isActive === 'true' || isActive === true;
      where.isActive = String(isActive).toLowerCase() === 'true';
    }

    const [data, total, categories] = await Promise.all([
      this.prisma.procedure.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
          inputs: {
            include: {
              inventoryItem: {
                select: {
                  id: true,
                  name: true,
                  unit: true,
                  category: true,
                  unitCost: true,
                  // ✅ FIXED: Use locationStocks instead of quantity
                  locationStocks: {
                    select: { 
                      quantity: true, 
                      locationId: true,
                      location: { select: { id: true, name: true } },
                    },
                  },
                },
              },
              location: {
                select: { id: true, name: true, type: true },
              },
            },
          },
          _count: {
            select: {
              visitProcedures: true,
              treatmentProcedures: true,
            },
          },
        },
      }),
      this.prisma.procedure.count({ where }),
      this.prisma.procedureCategory.findMany({
        where: {
          isActive: true,
          procedures: { some: { isActive: true } },
        },
        orderBy: { name: 'asc' },
        select: { name: true },
      }),
    ]);

    return {
      data: data.map((p) => this.formatProcedure(p)),
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        pages: Math.ceil(total / take),
      },
      categories: categories.map((c) => c.name),
    };
  }

  async findOneProcedure(id: string, locationId?: string) {
    const procedure = await this.prisma.procedure.findUnique({
      where: { id },
      include: {
        inputs: {
          include: {
            inventoryItem: {
              select: {
                id: true,
                name: true,
                unit: true,
                category: true,
                unitCost: true,
                minQuantity: true,
                // ✅ FIXED: Use locationStocks instead of quantity
                locationStocks: {
                  select: { 
                    quantity: true, 
                    locationId: true,
                    location: { select: { id: true, name: true } },
                  },
                },
              },
            },
            location: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        _count: {
          select: { visitProcedures: true, treatmentProcedures: true },
        },
      },
    });
    if (!procedure) throw new NotFoundException(`Procedure ${id} not found`);
    
    // ✅ Enrich inputs with aggregated stock info
    const enrichedInputs = procedure.inputs.map((input: any) => ({
      ...input,
      inventoryItem: this.enrichInventoryWithStock(input.inventoryItem, locationId),
    }));

    return this.formatProcedure({
      ...procedure,
      inputs: enrichedInputs,
    });
  }

  async createProcedure(dto: CreateProcedureDto) {
    let cat = await this.prisma.procedureCategory.findFirst({
      where: { name: dto.category },
    });

    if (!cat) {
      cat = await this.prisma.procedureCategory.create({
        data: { name: dto.category },  // ← FIXED: added `data:`
      });
    }

    const {
      category: _cat,
      inputs: inputsDto,
      basePrice,
      revenueAccountId: rawRevenueAccountId,
      ...rest
    } = dto as any;

    // Optional revenue-account mapping — must be an INCOME ledger account.
    const revenueAccountId =
      this.normalizeRevenueAccountId(rawRevenueAccountId) ?? null;
    if (revenueAccountId) await this.assertIncomeAccount(revenueAccountId);

    return this.prisma.procedure.create({
      data: {  // ← FIXED: added `data:`
        ...rest,
        basePrice: basePrice ?? dto.baseCost,
        categoryId: cat.id,
        revenueAccountId,
        inputs: inputsDto ? { create: inputsDto } : undefined,
      },
      include: {
        category: true,
        revenueAccount: true,
        inputs: { include: { inventoryItem: true } },
      },
    });
  }

  async updateProcedure(id: string, dto: Partial<CreateProcedureDto>) {
    const {
      category: categoryName,
      inputs,
      revenueAccountId: rawRevenueAccountId,
      ...rest
    } = dto as any;
    const updateData: Prisma.ProcedureUpdateInput = { ...rest };

    if (categoryName) {
      let cat = await this.prisma.procedureCategory.findFirst({
        where: { name: categoryName },
      });

      if (!cat) {
        cat = await this.prisma.procedureCategory.create({
          data: { name: categoryName },  // ← FIXED: added `data:`
        });
      }
      // updateData.categoryId = cat.id;
      updateData.category = { connect: { id: cat.id } };
    }

    // Revenue-account mapping. `undefined` = leave unchanged; null/"" = clear
    // (fall back to category/system default); a string = connect (validated).
    const normRevenueAccountId =
      this.normalizeRevenueAccountId(rawRevenueAccountId);
    if (normRevenueAccountId !== undefined) {
      if (normRevenueAccountId) await this.assertIncomeAccount(normRevenueAccountId);
      updateData.revenueAccount = normRevenueAccountId
        ? { connect: { id: normRevenueAccountId } }
        : { disconnect: true };
    }

    if (inputs !== undefined) {
      await this.prisma.procedureInventoryInput.deleteMany({
        where: { procedureId: id },
      });

      if (inputs.length > 0) {
        const cleanedInputs = inputs.map((input: any) => {
          let locationId = input.locationId;
          
          if (
            locationId === '__any__' ||
            locationId === '' ||
            locationId === 'null' ||
            locationId === undefined
          ) {
            locationId = null;
          }

          return {
            procedureId: id,
            inventoryItemId: input.inventoryItemId,
            locationId: locationId,
            quantityUsed: Number(input.quantityUsed) || 1,
            unitCost: Number(input.unitCost) || 0,
            notes: input.notes || null,
            isOptional: input.isOptional === true,
          };
        });

        const inventoryItemIds = cleanedInputs
          .map((i: any) => i.inventoryItemId)
          .filter((id: string) => id);
        
        if (inventoryItemIds.length > 0) {
          const existingItems = await this.prisma.inventoryItem.findMany({
            where: { id: { in: inventoryItemIds } },
            select: { id: true },
          });
          const validItemIds = new Set(existingItems.map(i => i.id));
          
          const validInputs = cleanedInputs.filter((input: any) => 
            validItemIds.has(input.inventoryItemId)
          );

          if (validInputs.length > 0) {
            await this.prisma.procedureInventoryInput.createMany({
              data: validInputs,  // ← FIXED: added `data:`
            });
          }
        } else {
          await this.prisma.procedureInventoryInput.createMany({
            data: cleanedInputs,  // ← FIXED: added `data:`
          });
        }
      }
    }

    return this.prisma.procedure.update({
      where: { id },
      data: updateData,  // ← FIXED: added `data:`
      include: {
        category: true,
        revenueAccount: true,
        inputs: {
          include: {
            inventoryItem: true,
            location: true
          }
        },
      },
    });
  }

  // ─── Revenue-account mapping helpers ──────────────────────────────────────
  /**
   * Normalise an incoming revenueAccountId:
   *   undefined → undefined  (leave the column unchanged on update)
   *   null / "" → null       (explicit clear → fall back to category/system)
   *   string    → trimmed id
   */
  private normalizeRevenueAccountId(v: unknown): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  }

  /** Assert the id references an existing INCOME (revenue) ledger account. */
  private async assertIncomeAccount(id: string): Promise<void> {
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!acc) {
      throw new BadRequestException(`Revenue account ${id} not found`);
    }
    if (acc.type !== LedgerAccountType.INCOME) {
      throw new BadRequestException(
        'revenueAccountId must reference an INCOME (revenue) ledger account',
      );
    }
  }

  async getCategories(): Promise<string[]> {
    const cats = await this.prisma.procedureCategory.findMany({
      where: { procedures: { some: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
    return cats.map((c) => c.name);
  }

  async deleteProcedure(id: string) {
    const proc = await this.prisma.procedure.findUnique({
      where: { id },
      include: { _count: { select: { visitProcedures: true } } },
    });
    if (!proc) throw new NotFoundException(`Procedure ${id} not found`);
    if (proc._count.visitProcedures > 0) {
      throw new BadRequestException(
        'Cannot delete a procedure that has been used in visits. Deactivate it instead.',
      );
    }
    await this.prisma.procedure.delete({ where: { id } });
    return { message: 'Procedure deleted successfully' };
  }

  async getProcedureCategories() {
    const categories = await this.prisma.procedureCategory.findMany({
      where: {
        procedures: { some: { isActive: true } },
      },
      orderBy: { name: 'asc' },
      select: { name: true },
    });

    return categories.map((c) => c.name);
  }

  async getProcedures(
    category?: string,
    search?: string,
    isActive = true,
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.ProcedureWhereInput = {
      isActive,
      ...(category && {
        category: { name: { contains: category, mode: 'insensitive' } },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.procedure.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        include: {
          category: true,
          inputs: { include: { inventoryItem: true } },
        },
      }),
      this.prisma.procedure.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Visit Procedures ─────────────────────────────────────────────────────

  private generateLedgerCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `ILG-${new Date().getFullYear()}-${timestamp}${random}`;
  }

  async addVisitProcedure(dto: AddVisitProcedureDto) {
    const { visitId, procedureId, inventoryUsages, cost, ...rest } = dto;

    const [visit, procedure] = await Promise.all([
      this.prisma.visit.findUnique({ where: { id: visitId } }),
      this.prisma.procedure.findUnique({
        where: { id: procedureId },
        include: { inputs: true },
      }),
    ]);

    if (!visit) throw new NotFoundException('Visit not found');
    if (!procedure) throw new NotFoundException('Procedure not found');

    const actualCost = cost ?? Number(procedure.baseCost);

    return this.prisma.$transaction(async (tx) => {
      const visitProcedure = await tx.visitProcedure.create({
        data: {  // ← FIXED: added `data:`
          visitId,
          procedureId,
          cost: actualCost,
          toothNumbers: rest.toothNumbers ?? [],
          surfaces: (rest.surfaces as any) ?? [],
          notes: rest.notes,
          inventoryUsages: inventoryUsages?.length
            ? {
                create: inventoryUsages.map((u) => ({
                  inventoryItemId: u.inventoryItemId,
                  locationId: u.locationId,
                  quantityUsed: u.quantityUsed,
                  unitCost: u.unitCost,
                  totalCost: u.quantityUsed * u.unitCost,
                  batchNumber: u.batchNumber,
                  notes: u.notes,
                })),
              }
            : undefined,
        },
        include: this.visitProcedureInclude(),
      });

      // ✅ Deduct inventory + write InventoryLedger entries
      if (inventoryUsages?.length) {
        for (const usage of inventoryUsages) {
          // 1. Get current location stock for ledger snapshot
          const locationStock = await tx.inventoryLocationStock.findFirst({
            where: {
              itemId: usage.inventoryItemId,
              locationId: usage.locationId,
            },
            select: { id: true, quantity: true },  // ✅ Select id for update
          });
          const qtyBefore = locationStock?.quantity ?? 0;
          const qtyChange = -usage.quantityUsed;
          const qtyAfter = qtyBefore + qtyChange;
          const unitCost = usage.unitCost ?? 0;

          // 2. Update location stock ONLY (no master quantity update)
          if (locationStock) {
            await tx.inventoryLocationStock.update({
              where: { id: locationStock.id },  // ✅ Use id for update
              data: { quantity: qtyAfter },  // ← FIXED: added `data:`
            });
          } else if (qtyAfter > 0) {
            await tx.inventoryLocationStock.create({
              data: {  // ← FIXED: added `data:`
                itemId: usage.inventoryItemId,
                locationId: usage.locationId,
                quantity: qtyAfter,
                minQuantity: 0,
              },
            });
          }

          // 3. Optional: Deduct from specific batch (FIFO)
          let batchId: string | null = null;
          if (usage.batchNumber) {
            const batch = await tx.inventoryBatch.findFirst({
              where: {
                itemId: usage.inventoryItemId,
                locationId: usage.locationId,
                batchNumber: usage.batchNumber,
                isActive: true,
                quantity: { gt: 0 },
              },
              orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
              select: { id: true, quantity: true },
            });
            if (batch) {
              const newBatchQty = batch.quantity - usage.quantityUsed;
              await tx.inventoryBatch.update({
                where: { id: batch.id },
                data: {  // ← FIXED: added `data:`
                  quantity: { decrement: usage.quantityUsed },
                  isActive: newBatchQty > 0,
                },
              });
              batchId = batch.id;
            }
          }

          // 4. Write InventoryLedger entry
          await tx.inventoryLedger.create({
            data: {  // ← FIXED: added `data:`
              ledgerCode: this.generateLedgerCode(),
              itemId: usage.inventoryItemId,
              locationId: usage.locationId,
              batchId,
              type: StockLedgerType.USAGE,
              quantityBefore: qtyBefore,
              quantityChange: qtyChange,
              quantityAfter: qtyAfter,
              unitCost,
              totalValue: Math.abs(qtyChange) * unitCost,
              referenceType: 'VISIT_PROCEDURE',
              referenceId: visitProcedure.id,
              notes: `Used in procedure: ${procedure.name}${usage.notes ? ` — ${usage.notes}` : ''}`,
              performedById: null,
            },
          });
        }
      }

      // 5. Recalculate visit total cost
      const allProcedures = await tx.visitProcedure.findMany({
        where: { visitId },
        select: { cost: true },
      });
      const totalCost = allProcedures.reduce((sum, p) => sum + toNum(p.cost), 0);
      await tx.visit.update({ 
        where: { id: visitId }, 
        data: { totalCost }  // ← FIXED: added `data:`
      });

      return visitProcedure;
    }).then(async (visitProcedure) => {
      try {
        await this.ledgerService.createFromProcedure(visitProcedure.id);
      } catch (error) {
        console.error('Failed to create ledger entry for procedure:', error);
      }
      return visitProcedure;
    });
  }

  async getVisitProcedures(visitId: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const procedures = await this.prisma.visitProcedure.findMany({
      where: { visitId },
      include: this.visitProcedureInclude(),
      orderBy: { performedAt: 'asc' },
    });

    const inventoryCost = procedures.reduce((sum, vp) => {
      const itemsCost =
        (vp as any).inventoryUsages?.reduce(
          (s: number, u: any) => s + u.totalCost,
          0,
        ) ?? 0;
      return sum + itemsCost;
    }, 0);

    const procedureCost = procedures.reduce((sum, vp) => sum + toNum(vp.cost), 0);

    return {
      procedures,
      summary: {
        procedureCount: procedures.length,
        procedureCost,
        inventoryCost,
        totalCost: procedureCost,
      },
    };
  }

  async removeVisitProcedure(id: string) {
    const vp = await this.prisma.visitProcedure.findUnique({
      where: { id },
      include: { inventoryUsages: true },
    });
    if (!vp) throw new NotFoundException('Visit procedure not found');

    return this.prisma
      .$transaction(async (tx) => {
        // Restore inventory
        for (const usage of (vp as any).inventoryUsages ?? []) {
          const locationStock = await tx.inventoryLocationStock.findFirst({
            where: {
              itemId: usage.inventoryItemId,
              locationId: usage.locationId,
            },
            select: { id: true, quantity: true },
          });

          if (locationStock) {
            await tx.inventoryLocationStock.update({
              where: { id: locationStock.id },
              data: { quantity: { increment: usage.quantityUsed } },  // ← FIXED: added `data:`
            });
          }
        }

        await tx.visitProcedure.delete({ where: { id } });

        const remaining = await tx.visitProcedure.findMany({
          where: { visitId: vp.visitId },
          select: { cost: true },
        });
        await tx.visit.update({
          where: { id: vp.visitId },
          data: { totalCost: remaining.reduce((s, p) => s + toNum(p.cost), 0) },  // ← FIXED: added `data:`
        });

        return { message: 'Procedure removed and inventory restored' };
      })
      .then(async (result) => {
        try {
          const ledgerEntry = await this.prisma.ledgerEntry.findFirst({
            where: {
              sourceType: 'VISIT_PROCEDURE',
              sourceId: id,
            },
          });
          if (ledgerEntry && ledgerEntry.status === 'PENDING') {
            await this.ledgerService.voidEntry(
              ledgerEntry.id,
              'Procedure removed from visit',
            );
          }
        } catch (error) {
          console.error('Failed to void ledger entry:', error);
        }
        return result;
      });
  }

  // ─── Procedure Cost Analysis ──────────────────────────────────────────────

  async getProcedureCostBreakdown(procedureId: string, locationId?: string) {
    const procedure = await this.prisma.procedure.findUnique({
      where: { id: procedureId },
      include: {
        category: true,
        inputs: {
          include: {
            inventoryItem: {
              select: { 
                id: true, 
                name: true, 
                unit: true, 
                unitCost: true,
                // ✅ Include locationStocks for stock-aware cost analysis
                locationStocks: {
                  select: { quantity: true, locationId: true },
                },
              },
            },
            location: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    if (!procedure) throw new NotFoundException('Procedure not found');

    const baseCost = Number(procedure.baseCost);
    
    // Calculate inputs cost with location-aware stock if locationId provided
    const inputsCost = procedure.inputs.reduce((sum, input) => {
      const itemStock = this.aggregateLocationStock(
        input.inventoryItem?.locationStocks ?? [], 
        locationId
      );
      // Only include cost if stock is available (optional business logic)
      return sum + input.quantityUsed * toNum(input.unitCost);
    }, 0);
    
    const margin = baseCost - inputsCost;
    const marginPercent = baseCost > 0 ? (margin / baseCost) * 100 : 0;

    return {
      procedure: {
        id: procedure.id,
        name: procedure.name,
        category: procedure.category?.name || '',
      },
      sellingPrice: baseCost,
      inputs: procedure.inputs.map((i) => ({
        item: {
          ...i.inventoryItem,
          totalQuantity: this.aggregateLocationStock(
            i.inventoryItem?.locationStocks ?? [], 
            locationId
          ),
        },
        location: i.location,
        quantityUsed: i.quantityUsed,
        unitCost: i.unitCost,
        lineCost: i.quantityUsed * toNum(i.unitCost),
        isOptional: i.isOptional,
        notes: i.notes,
      })),
      inputsCost,
      margin,
      marginPercent: Math.round(marginPercent * 100) / 100,
    };
  }

  private formatProcedure(procedure: any) {
    const inputsCost =
      procedure.inputs?.reduce(
        (sum: number, i: any) => sum + i.quantityUsed * i.unitCost,
        0,
      ) ?? 0;

    const baseCost = Number(procedure.baseCost ?? 0);
    const basePrice = Number(procedure.basePrice ?? baseCost);

    return {
      ...procedure,
      category: procedure.category?.name || '',
      categoryId: procedure.category?.id || '',
      baseCost,
      basePrice,
      priceRangeMin: procedure.priceRangeMin
        ? Number(procedure.priceRangeMin)
        : null,
      priceRangeMax: procedure.priceRangeMax
        ? Number(procedure.priceRangeMax)
        : null,
      inputsCost,
      margin: basePrice - inputsCost,
      marginPercent:
        basePrice > 0
          ? Math.round(((basePrice - inputsCost) / basePrice) * 100 * 100) / 100
          : 0,
    };
  }

  private visitProcedureInclude() {
    return {
      procedure: {
        select: {
          id: true,
          name: true,
          code: true,
          category: true,
          baseCost: true,
        },
      },
      inventoryUsages: {
        include: {
          inventoryItem: { 
            select: { 
              id: true, 
              name: true, 
              unit: true,
              // ✅ Include locationStocks for stock-aware responses
              locationStocks: {
                select: { quantity: true, locationId: true },
              },
            } 
          },
          location: { select: { id: true, name: true, type: true } },
        },
      },
    };
  }
}