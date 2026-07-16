// src/modules/conditions/conditions.service.ts
import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertFdiTooth,
  assertSurfaces,
} from '../common/dental/dental-validation';
import {
  assertToothPresence,
  findAbsentTeeth,
} from '../common/dental/tooth-presence';

import { CreateConditionDto } from './dto/create-condition.dto';
import { UpdateConditionDto } from './dto/update-condition.dto';
import { ConditionQueryDto } from './dto/condition-query.dto';
import { CreatePatientConditionDto } from './dto/create-patient-condition.dto';
import { UpdatePatientConditionDto } from './dto/update-patient-condition.dto';
import { ConditionsReportQueryDto, PatientConditionStatusEnum, ConditionCategoryEnum, ConditionSeverityEnum } from './dto/conditions-report-query.dto';

import { ConditionCategory, ConditionSeverity, ToothSurface, Prisma, PatientConditionStatus, TreatmentStatus, ChartEntryType, ChartEntryStatus } from '@prisma/client';


@Injectable()
export class ConditionsService {
    constructor(private readonly prisma: PrismaService) { }

    // ─────────────────────────────────────────────────────────────────────
    // AUDIT HELPER — same shape & defensive resolution as the treatment-plan
    // services, so every condition write lands a row in the generic
    // audit_logs table with entityType="PatientCondition" or "Condition".
    //
    // AUDIT-FORENSIC (Fix #4): now also captures ipAddress + userAgent so a
    // subpoena-grade audit row can trace which terminal / session made the
    // change. Controllers extract these from the HTTP request and pass them
    // through; the helper accepts undefined and writes NULL otherwise.
    // ─────────────────────────────────────────────────────────────────────
    private async writeAuditTx(
        tx: Prisma.TransactionClient,
        args: {
            action:
                | 'CREATE'
                | 'UPDATE'
                | 'DELETE'
                | 'RESTORE'
                | 'RESOLVE'
                | 'VOID';
            entityType: string;
            entityId: string;
            oldData?: any;
            newData?: any;
            reason?: string | null;
            userId?: string | null;
            ipAddress?: string | null;
            userAgent?: string | null;
        },
    ) {
        let safeUserId: string | null = null;
        let userName: string | null = null;
        if (args.userId) {
            const user = await tx.user.findUnique({
                where: { id: args.userId },
                select: { id: true, staff: { select: { firstName: true, lastName: true } } },
            });
            if (user) {
                safeUserId = user.id;
                if (user.staff) {
                    userName = `${user.staff.firstName} ${user.staff.lastName}`.trim();
                }
            } else {
                userName = `unresolved:${args.userId}`;
            }
        }
        return tx.auditLog.create({
            data: {
                action: args.action,
                module: 'CONDITIONS',
                entityType: args.entityType,
                recordId: args.entityId,
                oldData: (args.oldData ?? null) as Prisma.InputJsonValue,
                newData: (args.newData ?? null) as Prisma.InputJsonValue,
                reason: args.reason ?? null,
                userId: safeUserId,
                userName,
                ipAddress: args.ipAddress ?? null,
                userAgent: args.userAgent ?? null,
            },
        });
    }

    // ==================== Condition Catalog Methods ====================

    async findAll(query: {
        isActive?: boolean;
        isFavourite?: boolean;
        category?: string;
        search?: string;
    }) {
        const { isActive, isFavourite, category, search } = query;

        const where: Prisma.ConditionWhereInput = {};

        if (isActive !== undefined) {
            where.isActive = isActive;
        }

        if (isFavourite !== undefined) {
            where.isFavourite = isFavourite;
        }

        if (category) {
            where.category = category as ConditionCategory;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { snodentCode: { contains: search, mode: 'insensitive' } },
                { snomedCtCode: { contains: search, mode: 'insensitive' } },
                { icd10Code: { contains: search, mode: 'insensitive' } },
                { icd10Term: { contains: search, mode: 'insensitive' } },
            ];
        }

        return this.prisma.condition.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
    }

    async findOne(id: string) {
        const condition = await this.prisma.condition.findUnique({
            where: { id },
        });

        if (!condition) {
            throw new NotFoundException(`Condition with ID ${id} not found`);
        }

        return condition;
    }

    async create(
        dto: CreateConditionDto,
        isSystem: boolean,
        actorUserId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        // Check for duplicate name (fast-path 400 before we open a tx).
        const existing = await this.prisma.condition.findFirst({
            where: { name: dto.name },
        });

        if (existing) {
            throw new BadRequestException(`Condition with name "${dto.name}" already exists`);
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                const created = await tx.condition.create({
                    data: {
                        name: dto.name,
                        description: dto.description,
                        snodentCode: dto.snodentCode,
                        snomedCtCode: dto.snomedCtCode,
                        icd10Code: dto.icd10Code,
                        icd10Term: dto.icd10Term,
                        codingSystem: dto.codingSystem,
                        category: dto.category,
                        affectedArea: dto.affectedArea,
                        isToothSpecific: dto.isToothSpecific ?? true,
                        requiresSurface: dto.requiresSurface ?? false,
                        defaultSeverity: dto.defaultSeverity,
                        isFavourite: dto.isFavourite ?? false,
                        isSystem,
                        isActive: true,
                    },
                });

                await this.writeAuditTx(tx, {
                    action: 'CREATE',
                    entityType: 'Condition',
                    entityId: created.id,
                    userId: actorUserId ?? null,
                    ipAddress: ipAddress ?? null,
                    userAgent: userAgent ?? null,
                    newData: {
                        name: created.name,
                        category: created.category,
                        affectedArea: created.affectedArea,
                        isToothSpecific: created.isToothSpecific,
                        requiresSurface: created.requiresSurface,
                        icd10Code: created.icd10Code,
                        icd10Term: created.icd10Term,
                        snodentCode: created.snodentCode,
                        snomedCtCode: created.snomedCtCode,
                        codingSystem: created.codingSystem,
                        isSystem: created.isSystem,
                        isFavourite: created.isFavourite,
                    },
                });

                return created;
            });
        } catch (err: any) {
            // UN-1: race-fallback. Two concurrent inserts with the same name
            // both pass the findFirst, but the DB-level @unique constraint
            // rejects the second. Translate Prisma P2002 → clean 400 so the
            // client sees the same friendly message as the fast-path.
            if (err?.code === 'P2002') {
                throw new BadRequestException(
                    `Condition with name "${dto.name}" already exists`,
                );
            }
            throw err;
        }
    }

    async update(
        id: string,
        dto: UpdateConditionDto,
        actorUserId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        const existing = await this.findOne(id);

        // Check for duplicate name if name is being changed
        if (dto.name) {
            const dup = await this.prisma.condition.findFirst({
                where: {
                    name: dto.name,
                    id: { not: id },
                },
            });

            if (dup) {
                throw new BadRequestException(`Condition with name "${dto.name}" already exists`);
            }
        }

        try {
            return await this.prisma.$transaction(async (tx) => {
                const updated = await tx.condition.update({
                    where: { id },
                    data: {
                        name: dto.name,
                        description: dto.description,
                        snodentCode: dto.snodentCode,
                        snomedCtCode: dto.snomedCtCode,
                        icd10Code: dto.icd10Code,
                        icd10Term: dto.icd10Term,
                        codingSystem: dto.codingSystem,
                        category: dto.category,
                        affectedArea: dto.affectedArea,
                        isToothSpecific: dto.isToothSpecific,
                        requiresSurface: dto.requiresSurface,
                        defaultSeverity: dto.defaultSeverity,
                        isFavourite: dto.isFavourite,
                    },
                });

                await this.writeAuditTx(tx, {
                    action: 'UPDATE',
                    entityType: 'Condition',
                    entityId: id,
                    userId: actorUserId ?? null,
                    ipAddress: ipAddress ?? null,
                    userAgent: userAgent ?? null,
                    oldData: {
                        name: existing.name,
                        description: existing.description,
                        snodentCode: existing.snodentCode,
                        snomedCtCode: existing.snomedCtCode,
                        icd10Code: existing.icd10Code,
                        icd10Term: existing.icd10Term,
                        codingSystem: existing.codingSystem,
                        category: existing.category,
                        affectedArea: existing.affectedArea,
                        isToothSpecific: existing.isToothSpecific,
                        requiresSurface: existing.requiresSurface,
                        defaultSeverity: existing.defaultSeverity,
                        isFavourite: existing.isFavourite,
                    },
                    newData: {
                        name: updated.name,
                        description: updated.description,
                        snodentCode: updated.snodentCode,
                        snomedCtCode: updated.snomedCtCode,
                        icd10Code: updated.icd10Code,
                        icd10Term: updated.icd10Term,
                        codingSystem: updated.codingSystem,
                        category: updated.category,
                        affectedArea: updated.affectedArea,
                        isToothSpecific: updated.isToothSpecific,
                        requiresSurface: updated.requiresSurface,
                        defaultSeverity: updated.defaultSeverity,
                        isFavourite: updated.isFavourite,
                    },
                });

                return updated;
            });
        } catch (err: any) {
            // UN-1: same race-fallback as create() — two concurrent updates
            // rename to the same target name, both pass the findFirst, but
            // the DB rejects the second with P2002. Translate to a clean 400.
            if (err?.code === 'P2002') {
                throw new BadRequestException(
                    `Condition with name "${dto.name}" already exists`,
                );
            }
            throw err;
        }
    }

    async remove(
        id: string,
        actorUserId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        const condition = await this.findOne(id);

        // System conditions cannot be deleted
        if (condition.isSystem) {
            throw new ForbiddenException('System conditions cannot be deleted');
        }

        // Check if condition is in use
        const usageCount = await this.prisma.patientCondition.count({
            where: { conditionId: id },
        });

        if (usageCount > 0) {
            throw new BadRequestException(
                `Cannot delete condition that is used in ${usageCount} patient record(s). Consider deactivating it instead.`,
            );
        }

        return this.prisma.$transaction(async (tx) => {
            const deleted = await tx.condition.delete({ where: { id } });
            await this.writeAuditTx(tx, {
                action: 'DELETE',
                entityType: 'Condition',
                entityId: id,
                userId: actorUserId ?? null,
                ipAddress: ipAddress ?? null,
                userAgent: userAgent ?? null,
                oldData: {
                    name: condition.name,
                    category: condition.category,
                    icd10Code: condition.icd10Code,
                    snodentCode: condition.snodentCode,
                    usageCountAtDelete: usageCount,
                },
            });
            return deleted;
        });
    }

    async toggleFavourite(
        id: string,
        actorUserId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        const condition = await this.findOne(id);

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.condition.update({
                where: { id },
                data: { isFavourite: !condition.isFavourite },
            });
            await this.writeAuditTx(tx, {
                action: 'UPDATE',
                entityType: 'Condition',
                entityId: id,
                userId: actorUserId ?? null,
                ipAddress: ipAddress ?? null,
                userAgent: userAgent ?? null,
                reason: 'toggleFavourite',
                oldData: { isFavourite: condition.isFavourite },
                newData: { isFavourite: updated.isFavourite },
            });
            return updated;
        });
    }

    // ==================== Patient Condition Methods ====================

    // src/conditions/conditions.service.ts (relevant sections only)
    // Update the findPatientConditions method (around line 192)

    // src/conditions/conditions.service.ts
    // Update the findPatientConditions method (around line 192)

    // async findPatientConditions(patientId: string, visitId?: string) {
    //     const where: Prisma.PatientConditionWhereInput = {
    //         patientId,
    //     };

    //     if (visitId) {
    //         where.visitId = visitId;
    //     }

    //     return this.prisma.patientCondition.findMany({
    //         where,
    //         include: {
    //             condition: true,
    //             visit: {
    //                 select: {
    //                     id: true,
    //                     visitCode: true,  // Changed from visitNumber to visitCode
    //                     createdAt: true,   // You can use createdAt as the date
    //                     // If you want a specific visit date field, you can add it to the schema
    //                 },
    //             },
    //         },
    //         orderBy: [{ diagnosedAt: 'desc' }, { createdAt: 'desc' }],
    //     });
    // }

    // async findOnePatientCondition(id: string) {
    //     const patientCondition = await this.prisma.patientCondition.findUnique({
    //         where: { id },
    //         include: { condition: true },
    //     });

    //     if (!patientCondition) {
    //         throw new NotFoundException(`Patient condition with ID ${id} not found`);
    //     }

    //     return patientCondition;
    // }


    // async createPatientCondition(dto: CreatePatientConditionDto) {
    //     // Verify patient exists
    //     const patient = await this.prisma.patient.findUnique({
    //         where: { id: dto.patientId },
    //     });

    //     if (!patient) {
    //         throw new NotFoundException(`Patient with ID ${dto.patientId} not found`);
    //     }

    //     // Verify condition exists
    //     const condition = await this.findOne(dto.conditionId);

    //     // If condition requires surfaces, ensure surfaces are provided
    //     if (condition.requiresSurface && (!dto.surfaces || dto.surfaces.length === 0)) {
    //         throw new BadRequestException(
    //             `Condition "${condition.name}" requires surface selection`,
    //         );
    //     }

    //     // If condition is tooth-specific, ensure tooth number is provided
    //     if (condition.isToothSpecific && !dto.toothNumber) {
    //         throw new BadRequestException(
    //             `Condition "${condition.name}" requires a tooth number`,
    //         );
    //     }

    //     // If visitId is provided, verify visit exists and belongs to patient
    //     if (dto.visitId) {
    //         const visit = await this.prisma.visit.findFirst({
    //             where: {
    //                 id: dto.visitId,
    //                 patientId: dto.patientId,
    //             },
    //         });

    //         if (!visit) {
    //             throw new NotFoundException(`Visit with ID ${dto.visitId} not found for this patient`);
    //         }
    //     }

    //     // Convert string surfaces to ToothSurface enum
    //     const surfaces = dto.surfaces?.map(surface => surface as ToothSurface) || [];

    //     return this.prisma.patientCondition.create({
    //         data: {
    //             patientId: dto.patientId,
    //             visitId: dto.visitId,
    //             conditionId: dto.conditionId,
    //             toothNumber: dto.toothNumber,
    //             surfaces: surfaces,
    //             severity: dto.severity,
    //             status: 'ACTIVE',
    //             notes: dto.notes,
    //             diagnosedAt: dto.diagnosedAt || new Date(),
    //             diagnosedBy: dto.diagnosedBy,
    //         },
    //         include: {
    //             condition: true,
    //         },
    //     });
    // }

    // async updatePatientCondition(id: string, dto: UpdatePatientConditionDto) {
    //     const existing = await this.findOnePatientCondition(id);

    //     // If condition is being changed, validate new condition requirements
    //     if (dto.conditionId && dto.conditionId !== existing.conditionId) {
    //         const newCondition = await this.findOne(dto.conditionId);

    //         if (newCondition.requiresSurface && (!dto.surfaces || dto.surfaces.length === 0)) {
    //             throw new BadRequestException(
    //                 `Condition "${newCondition.name}" requires surface selection`,
    //             );
    //         }

    //         if (newCondition.isToothSpecific && !dto.toothNumber && !existing.toothNumber) {
    //             throw new BadRequestException(
    //                 `Condition "${newCondition.name}" requires a tooth number`,
    //             );
    //         }
    //     }

    //     // If visitId is being changed, verify the new visit exists and belongs to patient
    //     if (dto.visitId && dto.visitId !== existing.visitId) {
    //         const visit = await this.prisma.visit.findFirst({
    //             where: {
    //                 id: dto.visitId,
    //                 patientId: existing.patientId,
    //             },
    //         });

    //         if (!visit) {
    //             throw new NotFoundException(`Visit with ID ${dto.visitId} not found for this patient`);
    //         }
    //     }

    //     const updateData: any = {
    //         conditionId: dto.conditionId,
    //         toothNumber: dto.toothNumber,
    //         severity: dto.severity,
    //         status: dto.status,
    //         notes: dto.notes,
    //         diagnosedBy: dto.diagnosedBy,
    //         visitId: dto.visitId,
    //     };

    //     if (dto.diagnosedAt) {
    //         updateData.diagnosedAt = new Date(dto.diagnosedAt);
    //     }

    //     // Convert surfaces if provided
    //     if (dto.surfaces) {
    //         updateData.surfaces = dto.surfaces.map(surface => surface as ToothSurface);
    //     }

    //     return this.prisma.patientCondition.update({
    //         where: { id },
    //         data: updateData,
    //         include: {
    //             condition: true,
    //         },
    //     });
    // }


    // src/conditions/conditions.service.ts  (changed sections only)

async createPatientCondition(
  dto: CreatePatientConditionDto,
  actorUserId?: string,
  idempotencyKey?: string,
  ipAddress?: string | null,
  userAgent?: string | null,
) {
  // I1: idempotency replay check. If the client supplied an Idempotency-Key
  // header on a previous request that already succeeded, return the original
  // 201 response instead of creating a duplicate PatientCondition + chart row.
  // The persisted response is wrapped with a `_idempotent: true` flag so the
  // caller can log/trace a replay distinctly from a fresh write.
  if (idempotencyKey) {
    const prior = await this.prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (prior?.response) {
      const replay = prior.response as any;
      return { ...replay, _idempotent: true };
    }
  }

  const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
  if (!patient) throw new NotFoundException(`Patient ${dto.patientId} not found`);

  const condition = await this.findOne(dto.conditionId);

  if (condition.requiresSurface && (!dto.surfaces || dto.surfaces.length === 0))
    throw new BadRequestException(`Condition "${condition.name}" requires surface selection`);

  // Canonical FDI + surface validation (these were previously skipped on this
  // single-create path — an invalid tooth / surface could persist).
  if (dto.toothNumber != null) assertFdiTooth(dto.toothNumber);
  const validatedSurfaces = assertSurfaces(dto.surfaces, dto.toothNumber ?? null);

  // Guard: block a surface-level condition on a tooth charted as absent.
  await assertToothPresence(this.prisma, {
    patientId: dto.patientId,
    toothNumbers: [dto.toothNumber],
    surfaces: validatedSurfaces,
  });

  if (condition.isToothSpecific && !dto.toothNumber)
    throw new BadRequestException(`Condition "${condition.name}" requires a tooth number`);

  if (dto.visitId) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: dto.visitId, patientId: dto.patientId },
    });
    if (!visit) throw new NotFoundException(`Visit ${dto.visitId} not found for this patient`);
  }

  // Validate providerId if supplied
  if (dto.providerId) {
    const staff = await this.prisma.staff.findUnique({ where: { id: dto.providerId } });
    if (!staff) throw new NotFoundException(`Staff member ${dto.providerId} not found`);
  }

  const surfaces = validatedSurfaces as unknown as ToothSurface[];

  return this.prisma.$transaction(async (tx) => {
    const created = await tx.patientCondition.create({
      data: {
        patientId:   dto.patientId,
        visitId:     dto.visitId,
        conditionId: dto.conditionId,
        toothNumber: dto.toothNumber,
        surfaces,
        severity:    dto.severity,
        status:      dto.status ?? 'ACTIVE',
        notes:       dto.notes,
        diagnosedAt: dto.diagnosedAt || new Date(),
        diagnosedBy: dto.diagnosedBy,
        providerId:  dto.providerId,
        // Audit actors — see schema notes.
        createdById: actorUserId ?? null,
        updatedById: actorUserId ?? null,
      },
      include: {
        condition: true,
        provider:  true,
      },
    });

    // Paired ChartEntry — mirrors what createPatientConditionsBatch does so
    // the diagnosis paints on the odontogram immediately. Always created,
    // even for non-tooth-specific conditions (Bruxism, Chronic Periodontitis);
    // they appear as a tooth-less row in the ledger and do not paint the chart.
    const entry = await tx.chartEntry.create({
      data: {
        patientId:        created.patientId,
        visitId:          created.visitId,
        toothNumber:      created.toothNumber,
        surfaces:         created.surfaces,
        type:             'CONDITION',
        status:           'ACTIVE',
        conditionStatus:  created.status,
        label:            condition.name,
        conditionCode:    condition.icd10Code ?? null,
        conditionId:      created.conditionId,
        patientConditionId: created.id,
        notes:            created.notes,
        providerId:       created.providerId ?? null,
        diagnosedAt:      created.diagnosedAt,
      },
    });

    await this.writeAuditTx(tx, {
      action: 'CREATE',
      entityType: 'PatientCondition',
      entityId: created.id,
      userId: actorUserId ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      newData: {
        patientId:   created.patientId,
        visitId:     created.visitId,
        conditionId: created.conditionId,
        conditionName: condition.name,
        toothNumber: created.toothNumber,
        surfaces:    created.surfaces,
        severity:    created.severity,
        status:      created.status,
        providerId:  created.providerId,
        diagnosedAt: created.diagnosedAt,
        chartEntryId: entry.id,
      },
    });

    // I1: persist the response INSIDE the transaction. A racing duplicate
    // request hits the PK on `key` and rolls its whole transaction back —
    // it can never create a second PatientCondition + chart row.
    if (idempotencyKey) {
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          scope: 'CONDITIONS_CREATE_PATIENT',
          response: created as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return created;
  });
}

async updatePatientCondition(
  id: string,
  dto: UpdatePatientConditionDto,
  actorUserId?: string,
  idempotencyKey?: string,
  ipAddress?: string | null,
  userAgent?: string | null,
) {
  // I1: idempotency replay check (see createPatientCondition).
  if (idempotencyKey) {
    const prior = await this.prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (prior?.response) {
      const replay = prior.response as any;
      return { ...replay, _idempotent: true };
    }
  }

  const existing = await this.findOnePatientCondition(id);

  if (dto.conditionId && dto.conditionId !== existing.conditionId) {
    const newCondition = await this.findOne(dto.conditionId);
    if (newCondition.requiresSurface && (!dto.surfaces || dto.surfaces.length === 0))
      throw new BadRequestException(`Condition "${newCondition.name}" requires surface selection`);
    if (newCondition.isToothSpecific && !dto.toothNumber && !existing.toothNumber)
      throw new BadRequestException(`Condition "${newCondition.name}" requires a tooth number`);
  }

  if (dto.visitId && dto.visitId !== existing.visitId) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: dto.visitId, patientId: existing.patientId },
    });
    if (!visit) throw new NotFoundException(`Visit ${dto.visitId} not found for this patient`);
  }

  // Validate tooth/surface on edit, and block surface work on an absent tooth.
  // Uses the EFFECTIVE tooth (incoming, else the existing value) so a surface
  // change on an unchanged tooth is still guarded.
  const effectiveTooth = dto.toothNumber ?? existing.toothNumber ?? null;
  if (dto.toothNumber != null) assertFdiTooth(dto.toothNumber);
  if (dto.surfaces !== undefined) {
    const validated = assertSurfaces(dto.surfaces, effectiveTooth);
    await assertToothPresence(this.prisma, {
      patientId: existing.patientId,
      toothNumbers: [effectiveTooth],
      surfaces: validated,
    });
  }

  // Validate new providerId if supplied
  if (dto.providerId) {
    const staff = await this.prisma.staff.findUnique({ where: { id: dto.providerId } });
    if (!staff) throw new NotFoundException(`Staff member ${dto.providerId} not found`);
  }

  // Substantive clinical edits get a required reason for the audit trail.
  // (Pure status flips like RESOLVED/RULED_OUT can flow through without one.)
  const substantiveChange =
    dto.conditionId !== undefined ||
    dto.toothNumber !== undefined ||
    dto.surfaces !== undefined ||
    dto.severity !== undefined ||
    dto.providerId !== undefined ||
    dto.diagnosedAt !== undefined ||
    dto.notes !== undefined;

  const updateData: any = {
    conditionId: dto.conditionId,
    toothNumber: dto.toothNumber,
    severity:    dto.severity,
    status:      dto.status,
    notes:       dto.notes,
    diagnosedBy: dto.diagnosedBy,
    visitId:     dto.visitId,
    providerId:  dto.providerId,
    updatedById: actorUserId ?? null,
  };
  if (substantiveChange && (dto as any).editReason) {
    updateData.lastEditReason = (dto as any).editReason;
  }

  if (dto.diagnosedAt) updateData.diagnosedAt = new Date(dto.diagnosedAt as string);
  if (dto.surfaces)    updateData.surfaces = dto.surfaces.map(s => s as ToothSurface);

  // OL-1: optimistic-lock token. Bumped on every successful mutation.
  // If the client supplied expectedVersion, gate on it; a stale token raises
  // 409 with the current version so the client can re-fetch and re-merge.
  const expectedVersion = (dto as any).expectedVersion as number | undefined;

  return this.prisma.$transaction(async (tx) => {
    // 1. Version guard. Atomic updateMany with `where: { id, version }` so a
    //    racing concurrent edit that already bumped version cannot also pass.
    //    Even when no expectedVersion is supplied, bump unconditionally so the
    //    counter advances and any subsequent optimistic-lock caller sees a
    //    fresh token.
    if (expectedVersion !== undefined && expectedVersion !== null) {
      const ev = Number(expectedVersion);
      if (!Number.isInteger(ev) || ev < 0) {
        throw new BadRequestException(
          'expectedVersion must be a non-negative integer',
        );
      }
      const bump = await tx.patientCondition.updateMany({
        where: { id, version: ev, deletedAt: null },
        data: { version: { increment: 1 } },
      });
      if (bump.count === 0) {
        const cur = await tx.patientCondition.findUnique({
          where: { id },
          select: { id: true, version: true, deletedAt: true },
        });
        if (!cur || cur.deletedAt) {
          throw new NotFoundException(`Patient condition ${id} not found`);
        }
        throw new ConflictException({
          message:
            'Condition was modified by another user. Re-fetch and re-submit.',
          currentVersion: cur.version,
          expectedVersion: ev,
        });
      }
    } else {
      // Legacy path: no version supplied — bump unconditionally so the
      // counter stays current. Behaviour matches the pre-OL-1 last-write-wins.
      await tx.patientCondition.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    }

    const updated = await tx.patientCondition.update({
      where: { id },
      data: updateData,
      include: {
        condition: true,
        provider:  true,
      },
    });

    // ── Sync chart entries so the odontogram reflects this edit ──
    // Supersede every ACTIVE chart entry that points at this PatientCondition
    // so the old surfaces/status stop painting the tooth. Then recreate one
    // ACTIVE chart entry that mirrors the updated PatientCondition row. This
    // mirrors the batch update endpoint's behaviour so single-row and batch
    // edits stay visually consistent on the chart.
    await tx.chartEntry.updateMany({
      where: { patientConditionId: id, status: 'ACTIVE' },
      data: { status: 'SUPERSEDED' },
    });

    const recreated = await tx.chartEntry.create({
      data: {
        patientId:         updated.patientId,
        visitId:           updated.visitId,
        toothNumber:       updated.toothNumber,
        surfaces:          updated.surfaces,
        type:              'CONDITION',
        status:            'ACTIVE',
        conditionStatus:   updated.status,
        label:             updated.condition?.name ?? 'Condition',
        conditionCode:     updated.condition?.icd10Code ?? null,
        conditionId:       updated.conditionId,
        patientConditionId: updated.id,
        notes:             updated.notes,
        providerId:        updated.providerId ?? null,
        diagnosedAt:       updated.diagnosedAt,
      },
    });

    await this.writeAuditTx(tx, {
      action: 'UPDATE',
      entityType: 'PatientCondition',
      entityId: id,
      userId: actorUserId ?? null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      reason: (dto as any).editReason ?? null,
      oldData: {
        conditionId: existing.conditionId,
        toothNumber: existing.toothNumber,
        surfaces:    existing.surfaces,
        severity:    existing.severity,
        status:      existing.status,
        notes:       existing.notes,
        providerId:  existing.providerId,
        visitId:     existing.visitId,
        diagnosedAt: existing.diagnosedAt,
      },
      newData: {
        conditionId: updated.conditionId,
        toothNumber: updated.toothNumber,
        surfaces:    updated.surfaces,
        severity:    updated.severity,
        status:      updated.status,
        notes:       updated.notes,
        providerId:  updated.providerId,
        visitId:     updated.visitId,
        diagnosedAt: updated.diagnosedAt,
        chartEntryId: recreated.id,
      },
    });

    // I1: persist the response INSIDE the transaction. A racing duplicate
    // request hits the PK on `key` and rolls back — it can never re-apply
    // the same edit twice (no duplicate ChartEntry row, no second audit log).
    if (idempotencyKey) {
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          scope: 'CONDITIONS_UPDATE_PATIENT',
          response: updated as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return updated;
  });
}

// Reads — soft-deleted rows are filtered out by default. Pass
// `includeDeleted: true` for an admin/restore view.
async findPatientConditions(
  patientId: string,
  visitId?: string,
  opts: { includeDeleted?: boolean } = {},
) {
  // Defensive existence check: returning [] for an unknown patientId used to
  // be a silent information leak (an attacker could probe patientId existence
  // by response timing and content). 404 closes that gap and matches the
  // behaviour of findOnePatientCondition.
  const patient = await this.prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) throw new NotFoundException(`Patient ${patientId} not found`);

  return this.prisma.patientCondition.findMany({
    where: {
      patientId,
      ...(visitId ? { visitId } : {}),
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
    },
    include: {
      condition: true,
      provider:  { select: { id: true, firstName: true, lastName: true, specialization: true } },
      visit:     { select: { id: true, visitCode: true, createdAt: true } },
    },
    orderBy: [{ diagnosedAt: 'desc' }, { createdAt: 'desc' }],
  });
}

async getPatientConditionsReport(query: ConditionsReportQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const skip = (page - 1) * limit;

  const startDate = query.startDate ? new Date(query.startDate) : new Date(0);
  const endDate = query.endDate ? new Date(query.endDate) : new Date('2100-01-01');

  const where: any = {
    deletedAt: null,
    diagnosedAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.dentistId) where.providerId = query.dentistId;
  if (query.category) where.condition = { category: query.category };
  if (query.search) {
    where.OR = [
      { patient: { firstName: { contains: query.search, mode: 'insensitive' } } },
      { patient: { lastName: { contains: query.search, mode: 'insensitive' } } },
      { condition: { name: { contains: query.search, mode: 'insensitive' } } },
    ];
  }

  const [rows, total] = await Promise.all([
    this.prisma.patientCondition.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        condition: { select: { id: true, name: true, icd10Code: true, category: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        visit: { select: { id: true, visitCode: true } },
      },
      orderBy: [{ diagnosedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    this.prisma.patientCondition.count({ where }),
  ]);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    const cat = row.condition.category;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  const data = rows.map((r) => ({
    id: r.id,
    patientId: r.patient.id,
    patientCode: r.patient.patientCode,
    patientName: `${r.patient.firstName} ${r.patient.lastName}`,
    patientPhone: r.patient.phone ?? undefined,
    conditionId: r.condition.id,
    conditionName: r.condition.name,
    icd10Code: r.condition.icd10Code ?? undefined,
    conditionCategory: r.condition.category,
    toothNumber: r.toothNumber ?? undefined,
    surfaces: r.surfaces as string[] ?? [],
    severity: r.severity ?? undefined,
    status: r.status,
    diagnosedAt: r.diagnosedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? undefined,
    providerId: r.provider?.id ?? undefined,
    providerName: r.provider ? `${r.provider.firstName} ${r.provider.lastName}` : undefined,
    visitCode: r.visit?.visitCode ?? undefined,
    notes: r.notes ?? undefined,
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    summary: { total, byStatus, byCategory },
  };
}

async findOnePatientCondition(id: string, opts: { includeDeleted?: boolean } = {}) {
  const pc = await this.prisma.patientCondition.findFirst({
    where: {
      id,
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
    },
    include: {
      condition: true,
      provider:  { select: { id: true, firstName: true, lastName: true, specialization: true } },
    },
  });
  if (!pc) throw new NotFoundException(`Patient condition ${id} not found`);
  return pc;
}

    // SOFT delete. Clinical history is never erased — we stamp deletedAt
    // and capture deletedReason + deletedById. Reads filter on deletedAt
    // so the row vanishes from normal views, but the AuditLog row + the
    // soft-deleted record remain queryable for forensics or restore.
    async removePatientCondition(
        id: string,
        actorUserId?: string,
        reason?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        if (!reason || !reason.trim()) {
            throw new BadRequestException(
                'A reason is required to delete a patient condition (clinical audit trail).',
            );
        }
        const existing = await this.findOnePatientCondition(id);

        return this.prisma.$transaction(async (tx) => {
            const deleted = await tx.patientCondition.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                    deletedById: actorUserId ?? null,
                    deletedReason: reason,
                },
            });

            // Cascade: void any ACTIVE chart entries that reference this
            // condition row — they should disappear from the chart too,
            // but stay queryable in their own audit history.
            await tx.chartEntry.updateMany({
                where: {
                    patientConditionId: id,
                    status: 'ACTIVE',
                },
                data: {
                    status: 'VOIDED',
                    notes: `[CONDITION DELETED ${new Date().toISOString().slice(0, 10)}] ${reason}`,
                },
            });

            await this.writeAuditTx(tx, {
                action: 'DELETE',
                entityType: 'PatientCondition',
                entityId: id,
                userId: actorUserId ?? null,
                ipAddress: ipAddress ?? null,
                userAgent: userAgent ?? null,
                reason,
                oldData: {
                    conditionId: existing.conditionId,
                    toothNumber: existing.toothNumber,
                    surfaces: existing.surfaces,
                    severity: existing.severity,
                    status: existing.status,
                    providerId: existing.providerId,
                    diagnosedAt: existing.diagnosedAt,
                },
            });

            return deleted;
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // BATCH CREATE — atomic multi-tooth condition write
    // ─────────────────────────────────────────────────────────────────────
    // All PatientCondition rows + their paired ChartEntry rows land inside
    // a single $transaction. Either everything commits or nothing does, so
    // the "user clicked Save twice after a network blip" case no longer
    // produces partial-tooth duplication.
    async createPatientConditionsBatch(
      entries: CreatePatientConditionDto[],
      chartEntries: Array<{
        toothNumber: number;
        surfaces: string[];
        label: string;
        conditionCode?: string;
        conditionId?: string;
        notes?: string;
        providerId?: string;
        patientId: string;
        visitId?: string;
      }>,
      actorUserId?: string,
      idempotencyKey?: string,
      ipAddress?: string | null,
      userAgent?: string | null,
    ) {
      // I1: idempotency replay check (see createPatientCondition).
      if (idempotencyKey) {
        const prior = await this.prisma.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (prior?.response) {
          const replay = prior.response as any;
          return { ...replay, _idempotent: true };
        }
      }

      if (!entries.length) {
        throw new BadRequestException('At least one entry is required');
      }
      // Validate upstream once so the transaction doesn't open if the
      // request is obviously malformed. The inline `@Body() body: {...}`
      // type in the controller bypasses class-validator on the nested
      // entries, so we re-do the essential checks here.
      const conditionIds = [
        ...new Set(
          entries
            .map((e) => e.conditionId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      if (conditionIds.length === 0) {
        throw new BadRequestException(
          'Every entry must include a conditionId (catalog row).',
        );
      }
      const conditions = await this.prisma.condition.findMany({
        where: { id: { in: conditionIds } },
      });
      const condById = new Map(conditions.map((c) => [c.id, c]));
      for (const e of entries) {
        if (!e.patientId) {
          throw new BadRequestException('Every entry must include patientId.');
        }
        if (!e.conditionId) {
          throw new BadRequestException('Every entry must include conditionId.');
        }
        const cond = condById.get(e.conditionId);
        if (!cond) {
          throw new NotFoundException(`Condition ${e.conditionId} not found`);
        }
        if (cond.requiresSurface && (!e.surfaces || e.surfaces.length === 0)) {
          throw new BadRequestException(
            `Condition "${cond.name}" requires surface selection (tooth ${e.toothNumber})`,
          );
        }
        if (cond.isToothSpecific && !e.toothNumber) {
          throw new BadRequestException(
            `Condition "${cond.name}" requires a tooth number`,
          );
        }
        // H-3: canonical FDI + surface validation server-side. The controller's
        // inline @Body() type bypasses class-validator on these nested fields,
        // so an invalid tooth number or surface could otherwise persist.
        if (e.toothNumber != null) assertFdiTooth(e.toothNumber);
        e.surfaces = assertSurfaces(e.surfaces, e.toothNumber ?? null) as any;
      }

      // Same guards for the paired ChartEntry rows (these carry the toothNumber
      // that actually lands on the chart).
      for (const ce of chartEntries) {
        if (ce.toothNumber != null) assertFdiTooth(ce.toothNumber);
        ce.surfaces = assertSurfaces(ce.surfaces, ce.toothNumber ?? null) as any;
      }

      // Guard: block surface-level conditions on teeth already charted absent.
      // Batched per patient (one absence query each) rather than N per-entry
      // calls. Surfaces were canonicalised above, so filter(Boolean) is exact.
      const surfaceTeethByPatient = new Map<string, number[]>();
      for (const e of entries) {
        const hasSurfaces = ((e.surfaces as any[])?.filter(Boolean).length ?? 0) > 0;
        if (e.toothNumber != null && hasSurfaces) {
          const list = surfaceTeethByPatient.get(e.patientId) ?? [];
          list.push(e.toothNumber);
          surfaceTeethByPatient.set(e.patientId, list);
        }
      }
      for (const [pid, teeth] of surfaceTeethByPatient) {
        const absent = await findAbsentTeeth(this.prisma, pid, teeth);
        const blocked = teeth.find((t) => absent.has(t));
        if (blocked != null) {
          throw new BadRequestException(
            `Tooth ${blocked} is recorded as absent — surface-level work cannot be ` +
              `recorded on a missing tooth. Restore the site first (implant / bridge / ` +
              `denture), or resolve the absence if it was recorded in error.`,
          );
        }
      }

      // Validate providers up front so a stray empty-string providerId
      // doesn't crash the transaction halfway through.
      const providerIds = [
        ...new Set(
          entries
            .map((e) => e.providerId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      if (providerIds.length) {
        const staffRows = await this.prisma.staff.findMany({
          where: { id: { in: providerIds } },
          select: { id: true },
        });
        const okStaff = new Set(staffRows.map((s) => s.id));
        for (const pid of providerIds) {
          if (!okStaff.has(pid)) {
            throw new NotFoundException(`Staff member ${pid} not found`);
          }
        }
      }

      // Empty strings on FK columns would crash Prisma; coerce to undefined
      // so the column stays NULL when the caller intended "no value".
      const blank = (s: any) =>
        typeof s === 'string' && s.length === 0 ? undefined : s;

      return this.prisma.$transaction(async (tx) => {
        const createdPatientConditions: any[] = [];
        const createdChartEntries: any[] = [];

        // Group chart entries by tooth so each created PatientCondition can
        // be linked to the right ChartEntry without an N×M scan.
        const ceByTooth = new Map<number, typeof chartEntries[number]>();
        for (const ce of chartEntries) ceByTooth.set(ce.toothNumber, ce);

        for (const dto of entries) {
          const surfaces = (dto.surfaces ?? []) as ToothSurface[];
          // `diagnosedAt` arrives as an ISO string when the inline body
          // type bypasses class-transformer; Prisma DateTime accepts both
          // Date and ISO strings, but normalise to Date for consistency.
          const diagnosedAt = dto.diagnosedAt
            ? typeof dto.diagnosedAt === 'string'
              ? new Date(dto.diagnosedAt)
              : dto.diagnosedAt
            : new Date();
          const pc = await tx.patientCondition.create({
            data: {
              patientId: dto.patientId,
              visitId: blank(dto.visitId),
              conditionId: dto.conditionId,
              toothNumber: dto.toothNumber,
              surfaces,
              severity: blank(dto.severity),
              status: dto.status ?? 'ACTIVE',
              notes: blank(dto.notes),
              diagnosedAt,
              diagnosedBy: blank(dto.diagnosedBy),
              providerId: blank(dto.providerId),
              createdById: actorUserId ?? null,
              updatedById: actorUserId ?? null,
            },
          });
          createdPatientConditions.push(pc);

          await this.writeAuditTx(tx, {
            action: 'CREATE',
            entityType: 'PatientCondition',
            entityId: pc.id,
            userId: actorUserId ?? null,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            newData: {
              patientId: pc.patientId,
              visitId: pc.visitId,
              conditionId: pc.conditionId,
              toothNumber: pc.toothNumber,
              surfaces: pc.surfaces,
              severity: pc.severity,
              status: pc.status,
              providerId: pc.providerId,
              diagnosedAt: pc.diagnosedAt,
              batch: true,
            },
          });

          // Pair the PatientCondition row with its matching chart entry
          // (if the caller supplied one for this tooth).
          const ce = dto.toothNumber !== undefined && dto.toothNumber !== null
            ? ceByTooth.get(dto.toothNumber)
            : undefined;
          if (ce) {
            const entry = await tx.chartEntry.create({
              data: {
                patientId: ce.patientId,
                visitId: blank(ce.visitId),
                toothNumber: ce.toothNumber,
                surfaces: (ce.surfaces ?? []) as ToothSurface[],
                type: 'CONDITION',
                conditionStatus: pc.status,
                label: ce.label,
                conditionCode: blank(ce.conditionCode),
                conditionId: blank(ce.conditionId),
                patientConditionId: pc.id,
                notes: blank(ce.notes),
                providerId: blank(ce.providerId),
                diagnosedAt,
              },
            });
            createdChartEntries.push(entry);
          }
        }

        const result = {
          patientConditions: createdPatientConditions,
          chartEntries: createdChartEntries,
        };

        // I1: persist the batch response INSIDE the transaction. A racing
        // duplicate request hits the PK on `key` and rolls back — it can
        // never re-insert the same N PatientCondition + N ChartEntry rows.
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              scope: 'CONDITIONS_BATCH_CREATE',
              response: result as any,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        return result;
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // BATCH UPDATE WITH CHART REWRITE
    // ─────────────────────────────────────────────────────────────────────
    // Edits the PatientCondition, supersedes every ACTIVE ChartEntry that
    // references it (closes the previous multi-tooth fan-out), then writes
    // a fresh ChartEntry per tooth — all in one $transaction.
    // Fixes the "edit a 6-tooth condition → 5 stale ACTIVE entries + 6 new
    // ones" duplication and removes the need for the frontend to loop.
    async updatePatientConditionWithChartEntries(
      patientConditionId: string,
      update: UpdatePatientConditionDto,
      chartEntries: Array<{
        toothNumber: number;
        surfaces: string[];
        label: string;
        conditionCode?: string;
        conditionId?: string;
        notes?: string;
        providerId?: string;
        patientId: string;
        visitId?: string;
      }>,
      actorUserId?: string,
      idempotencyKey?: string,
      ipAddress?: string | null,
      userAgent?: string | null,
    ) {
      // I1: idempotency replay check (see createPatientCondition).
      if (idempotencyKey) {
        const prior = await this.prisma.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (prior?.response) {
          const replay = prior.response as any;
          return { ...replay, _idempotent: true };
        }
      }

      const existing = await this.findOnePatientCondition(patientConditionId);

      if (update.conditionId && update.conditionId !== existing.conditionId) {
        const newCondition = await this.findOne(update.conditionId);
        if (
          newCondition.requiresSurface &&
          (!update.surfaces || update.surfaces.length === 0)
        )
          throw new BadRequestException(
            `Condition "${newCondition.name}" requires surface selection`,
          );
        if (
          newCondition.isToothSpecific &&
          !update.toothNumber &&
          !existing.toothNumber
        )
          throw new BadRequestException(
            `Condition "${newCondition.name}" requires a tooth number`,
          );
      }

      if (update.providerId) {
        const staff = await this.prisma.staff.findUnique({
          where: { id: update.providerId },
        });
        if (!staff)
          throw new NotFoundException(
            `Staff member ${update.providerId} not found`,
          );
      }

      // Substantive edits require a reason (same rule as the single-row update)
      const substantiveChange =
        update.conditionId !== undefined ||
        update.toothNumber !== undefined ||
        update.surfaces !== undefined ||
        update.severity !== undefined ||
        update.providerId !== undefined ||
        update.diagnosedAt !== undefined ||
        update.notes !== undefined;

      // OL-1: optimistic-lock token. Mirrors single-row update so a stale
      // token raises 409 with the current version, preventing silent lost
      // updates when two clinicians edit the same PatientCondition.
      const expectedVersion = (update as any).expectedVersion as number | undefined;

      return this.prisma.$transaction(async (tx) => {
        // 1. Version guard — same atomic updateMany pattern as single-row.
        if (expectedVersion !== undefined && expectedVersion !== null) {
          const ev = Number(expectedVersion);
          if (!Number.isInteger(ev) || ev < 0) {
            throw new BadRequestException(
              'expectedVersion must be a non-negative integer',
            );
          }
          const bump = await tx.patientCondition.updateMany({
            where: { id: patientConditionId, version: ev, deletedAt: null },
            data: { version: { increment: 1 } },
          });
          if (bump.count === 0) {
            const cur = await tx.patientCondition.findUnique({
              where: { id: patientConditionId },
              select: { id: true, version: true, deletedAt: true },
            });
            if (!cur || cur.deletedAt) {
              throw new NotFoundException(
                `Patient condition ${patientConditionId} not found`,
              );
            }
            throw new ConflictException({
              message:
                'Condition was modified by another user. Re-fetch and re-submit.',
              currentVersion: cur.version,
              expectedVersion: ev,
            });
          }
        } else {
          // Legacy: no version supplied — bump unconditionally so the
          // counter advances and any subsequent optimistic-lock caller sees
          // a fresh token. Behaviour matches the pre-OL-1 last-write-wins.
          await tx.patientCondition.update({
            where: { id: patientConditionId },
            data: { version: { increment: 1 } },
          });
        }

        // 2. Apply clinical update
        const updateData: any = {
          conditionId: update.conditionId,
          toothNumber: update.toothNumber,
          severity: update.severity,
          status: update.status,
          notes: update.notes,
          diagnosedBy: update.diagnosedBy,
          visitId: update.visitId,
          providerId: update.providerId,
          updatedById: actorUserId ?? null,
        };
        if (update.diagnosedAt)
          updateData.diagnosedAt = new Date(update.diagnosedAt as string);
        if (update.surfaces)
          updateData.surfaces = update.surfaces as ToothSurface[];
        if (substantiveChange && (update as any).editReason)
          updateData.lastEditReason = (update as any).editReason;

        const updated = await tx.patientCondition.update({
          where: { id: patientConditionId },
          data: updateData,
          include: { condition: true, provider: true },
        });

        // 2. Supersede every ACTIVE ChartEntry pointing at this
        //    PatientCondition — that's what catches the multi-tooth fan-out
        //    the frontend used to leak.
        const supersededResult = await tx.chartEntry.updateMany({
          where: {
            patientConditionId: patientConditionId,
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED' },
        });

        // 3. Recreate the chart entries the caller wants to keep ACTIVE.
        const createdChartEntries: any[] = [];
        const editDiagnosedAt = update.diagnosedAt
          ? new Date(update.diagnosedAt as string)
          : undefined;
        const effectiveStatus = update.status ?? existing.status;
        for (const ce of chartEntries) {
          const entry = await tx.chartEntry.create({
            data: {
              patientId: ce.patientId,
              visitId: ce.visitId,
              toothNumber: ce.toothNumber,
              surfaces: (ce.surfaces ?? []) as ToothSurface[],
              type: 'CONDITION',
              conditionStatus: effectiveStatus,
              label: ce.label,
              conditionCode: ce.conditionCode,
              conditionId: ce.conditionId,
              patientConditionId: patientConditionId,
              notes: ce.notes,
              providerId: ce.providerId ?? null,
              diagnosedAt: editDiagnosedAt ?? null,
            },
          });
          createdChartEntries.push(entry);
        }

        // 4. Audit
        await this.writeAuditTx(tx, {
          action: 'UPDATE',
          entityType: 'PatientCondition',
          entityId: patientConditionId,
          userId: actorUserId ?? null,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          reason: (update as any).editReason ?? null,
          oldData: {
            conditionId: existing.conditionId,
            toothNumber: existing.toothNumber,
            surfaces: existing.surfaces,
            severity: existing.severity,
            status: existing.status,
            notes: existing.notes,
            providerId: existing.providerId,
            visitId: existing.visitId,
            diagnosedAt: existing.diagnosedAt,
          },
          newData: {
            conditionId: updated.conditionId,
            toothNumber: updated.toothNumber,
            surfaces: updated.surfaces,
            severity: updated.severity,
            status: updated.status,
            notes: updated.notes,
            providerId: updated.providerId,
            visitId: updated.visitId,
            diagnosedAt: updated.diagnosedAt,
            chartEntriesSuperseded: supersededResult.count,
            chartEntriesRecreated: createdChartEntries.length,
            batch: true,
          },
        });

        const result = {
          patientCondition: updated,
          chartEntriesSuperseded: supersededResult.count,
          chartEntries: createdChartEntries,
        };

        // I1: persist the batch-update response INSIDE the transaction. A
        // racing duplicate request hits the PK on `key` and rolls back —
        // it can never re-apply the same edit (no second supersede pass, no
        // duplicate ChartEntry rows, no second audit log entry).
        if (idempotencyKey) {
          await tx.idempotencyKey.create({
            data: {
              key: idempotencyKey,
              scope: 'CONDITIONS_BATCH_UPDATE',
              response: result as any,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        return result;
      });
    }

    // Optional admin tool — bring a soft-deleted condition back.
    async restorePatientCondition(
        id: string,
        actorUserId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        const existing = await this.prisma.patientCondition.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException(`Patient condition ${id} not found`);
        if (!existing.deletedAt) {
            throw new BadRequestException('Condition is not deleted.');
        }
        return this.prisma.$transaction(async (tx) => {
            const restored = await tx.patientCondition.update({
                where: { id },
                data: {
                    deletedAt: null,
                    deletedById: null,
                    deletedReason: null,
                    updatedById: actorUserId ?? null,
                },
            });

            // Reverse the void-only chart entries that removePatientCondition
            // produced. Constrained on the [CONDITION DELETED …] marker so we
            // never resurrect a chart entry voided for a different reason
            // (e.g. a manual voidEntry call or a superseded row).
            const reversed = await tx.chartEntry.updateMany({
                where: {
                    patientConditionId: id,
                    status: 'VOIDED',
                    notes: { startsWith: '[CONDITION DELETED ' },
                },
                data: {
                    status: 'ACTIVE',
                    notes: null,
                },
            });

            await this.writeAuditTx(tx, {
                action: 'RESTORE',
                entityType: 'PatientCondition',
                entityId: id,
                userId: actorUserId ?? null,
                ipAddress: ipAddress ?? null,
                userAgent: userAgent ?? null,
                newData: { chartEntriesRestored: reversed.count },
            });
            return restored;
        });
    }

    /**
     * Evaluate what the condition status SHOULD be based on its linked procedures.
     *
     * Rules:
     *   - No linked procedures, or none executed      → ACTIVE
     *   - Some procedures executed, not all completed → IN_TREATMENT
     *   - EVERY linked procedure COMPLETED            → RESOLVED
     *
     * A finding is only cleared once the WHOLE treatment that addresses it is
     * finished. A condition linked to several procedures (e.g. deep caries →
     * root canal therapy + crown placement) stays IN_TREATMENT until the last
     * procedure completes; that final completion is what flips it to RESOLVED and
     * is stamped as resolvedByProcedureId (see applyConditionLifecycleTx, driven
     * from executeSession). CANCELLED links are ignored so a cancelled procedure
     * can never block resolution forever.
     *
     * Never-auto-resolve conditions (presence-affecting, long-term monitoring)
     * are left in their current status.
     *
     * Returns { status, resolvedByProcedureId, resolvedAt } — the resolved
     * fields are populated only when status is RESOLVED, taken from the LAST
     * procedure to complete (by completedAt).
     */
    async evaluateConditionStatus(
        tx: Prisma.TransactionClient,
        patientConditionId: string,
        actorUserId?: string,
    ): Promise<{
        status: PatientConditionStatus;
        resolvedByProcedureId?: string;
        resolvedAt?: Date;
    }> {
        const pc = await tx.patientCondition.findUnique({
            where: { id: patientConditionId },
            include: { condition: true },
        });
        if (!pc || pc.deletedAt) {
            return { status: pc?.status ?? PatientConditionStatus.ACTIVE };
        }

        // ── NEVER AUTO-RESOLVE: presence-affecting conditions ──────────────
        if (pc.condition.chartPresenceEffect !== 'NONE') {
            return { status: pc.status };
        }

        // ── NEVER AUTO-RESOLVE: long-term monitoring conditions ────────────
        // Driven by the catalog `autoResolves` flag (default true) so renaming
        // a condition in the catalog cannot accidentally change its lifecycle
        // behaviour. Presence-affecting effects are still guarded above.
        if (pc.condition.autoResolves === false) {
            return { status: pc.status };
        }

        // ── Evaluate linked procedures ─────────────────────────────────────
        const links = await tx.conditionProcedureLink.findMany({
            where: {
                patientConditionId,
                deletedAt: null,
            },
            include: {
                treatmentProcedure: {
                    select: { id: true, status: true, completedAt: true, updatedAt: true },
                },
            },
        });

        if (links.length === 0) {
            // No live linked procedures. If the condition was mid-treatment
            // (its backing procedures were all cancelled/removed), revert to
            // ACTIVE rather than lingering as IN_TREATMENT forever. Manual
            // statuses (MONITORED / RULED_OUT / RESOLVED) are left untouched.
            if (pc.status === PatientConditionStatus.IN_TREATMENT) {
                return { status: PatientConditionStatus.ACTIVE };
            }
            return { status: pc.status };
        }

        const completedLinks = links.filter(
            (l) => l.treatmentProcedure.status === TreatmentStatus.COMPLETED,
        );
        const allCompleted = completedLinks.length === links.length;
        const anyExecuted = links.some(
            (l) =>
                l.treatmentProcedure.status === TreatmentStatus.COMPLETED ||
                l.treatmentProcedure.status === TreatmentStatus.IN_PROGRESS,
        );

        // Resolve only when ALL linked procedures are COMPLETED
        if (allCompleted && completedLinks.length > 0) {
            // Find the last completed procedure (by completedAt, fallback updatedAt)
            const lastCompleted = completedLinks.reduce((latest, link) => {
                const proc = link.treatmentProcedure;
                const latestTime = latest.treatmentProcedure.completedAt
                    ? latest.treatmentProcedure.completedAt.getTime()
                    : latest.treatmentProcedure.updatedAt.getTime();
                const currentTime = proc.completedAt
                    ? proc.completedAt.getTime()
                    : proc.updatedAt.getTime();
                return currentTime > latestTime ? link : latest;
            });
            return {
                status: PatientConditionStatus.RESOLVED,
                resolvedByProcedureId: lastCompleted.treatmentProcedure.id,
                resolvedAt: lastCompleted.treatmentProcedure.completedAt ?? lastCompleted.treatmentProcedure.updatedAt,
            };
        }
        if (anyExecuted) {
            return { status: PatientConditionStatus.IN_TREATMENT };
        }
        return { status: PatientConditionStatus.ACTIVE };
    }

    /**
     * Transactional method that evaluates the condition and applies the new
     * status with all side-effects (resolvedAt, resolvedByProcedureId, chart
     * entry supersede/restore). Safe to call from within any $transaction.
     * Resolution uses the LAST completed procedure's timestamp/ID.
     */
    async applyConditionLifecycleTx(
        tx: Prisma.TransactionClient,
        patientConditionId: string,
        actorUserId?: string,
    ): Promise<void> {
        const pc = await tx.patientCondition.findUnique({
            where: { id: patientConditionId },
            select: { status: true, deletedAt: true, conditionId: true, patientId: true },
        });
        if (!pc || pc.deletedAt) return;

        const evaluation = await this.evaluateConditionStatus(
            tx, patientConditionId, actorUserId,
        );
        const newStatus = evaluation.status;

        if (newStatus === pc.status) return;

        const updateData: any = {
            status: newStatus,
            updatedById: actorUserId ?? null,
        };

        if (newStatus === PatientConditionStatus.RESOLVED) {
            updateData.resolvedAt = evaluation.resolvedAt ?? new Date();
            updateData.resolvedByProcedureId = evaluation.resolvedByProcedureId ?? null;
        } else {
            updateData.resolvedAt = null;
            updateData.resolvedByProcedureId = null;
        }

        await tx.patientCondition.update({
            where: { id: patientConditionId },
            data: updateData,
        });

        // ── Sync chart entry status & conditionStatus ─────────────────────
        // When the condition is RESOLVED, the chart entry is marked RESOLVED
        // so the chart reflects that the condition is no longer active.
        // When the condition reverts (reversal), chart entries go back to ACTIVE.
        // Match by patientConditionId (primary) OR conditionId (legacy entries).
        const conditionId = pc.conditionId;
        const where: any = {
            type: ChartEntryType.CONDITION,
            // L1: ONLY touch live/resolved rows. Without this filter the
            // updateMany also flipped SUPERSEDED (edit history) and VOIDED
            // (deleted-condition) rows to ACTIVE/RESOLVED, resurrecting dead
            // rows into the chart and the SplitLedger (getPatientEntries
            // returns ACTIVE + RESOLVED). Superseded/voided history stays put.
            status: { in: [ChartEntryStatus.ACTIVE, ChartEntryStatus.RESOLVED] },
            OR: [
                { patientConditionId },
                // Legacy entries (pre-patientConditionId) match on catalog
                // conditionId — MUST be scoped to this patient, otherwise we
                // flip every other patient's same-diagnosis chart entries.
                ...(conditionId ? [{ conditionId, patientId: pc.patientId }] : []),
            ],
        };
        await tx.chartEntry.updateMany({
            where,
            data: {
                conditionStatus: newStatus,
                status:
                    newStatus === PatientConditionStatus.RESOLVED
                        ? ChartEntryStatus.RESOLVED
                        : ChartEntryStatus.ACTIVE,
            },
        });
    }

    async resolvePatientCondition(
        id: string,
        actorUserId?: string,
        procedureId?: string,
        ipAddress?: string | null,
        userAgent?: string | null,
    ) {
        const existing = await this.findOnePatientCondition(id);
        return this.prisma.$transaction(async (tx) => {
            const updateData: any = {
                status: PatientConditionStatus.RESOLVED,
                resolvedAt: new Date(),
                updatedById: actorUserId ?? null,
            };
            if (procedureId) {
                updateData.resolvedByProcedureId = procedureId;
            }
            const updated = await tx.patientCondition.update({
                where: { id },
                data: updateData,
            });
            // Set conditionStatus & status to RESOLVED on chart entries
            // Match by patientConditionId (primary) OR conditionId (legacy entries).
            const pc = await tx.patientCondition.findUnique({
                where: { id },
                select: { conditionId: true },
            });
            const conditionId = pc?.conditionId;
            const where: any = {
                type: ChartEntryType.CONDITION,
                // L1: never flip SUPERSEDED/VOIDED history rows — only live or
                // already-resolved rows. Otherwise an old edit-superseded or
                // delete-voided row would re-surface as RESOLVED in the ledger.
                status: { in: [ChartEntryStatus.ACTIVE, ChartEntryStatus.RESOLVED] },
                OR: [
                    { patientConditionId: id },
                    // Legacy entries: scope catalog-id match to this patient so
                    // resolving one patient never touches another patient's
                    // identical diagnosis.
                    ...(conditionId ? [{ conditionId, patientId: existing.patientId }] : []),
                ],
            };
            await tx.chartEntry.updateMany({
                where,
                data: {
                    conditionStatus: PatientConditionStatus.RESOLVED,
                    status: ChartEntryStatus.RESOLVED,
                },
            });
await this.writeAuditTx(tx, {
            action: 'RESOLVE',
            entityType: 'PatientCondition',
            entityId: id,
            userId: actorUserId ?? null,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            oldData: { status: existing.status, resolvedAt: existing.resolvedAt, resolvedByProcedureId: (existing as any).resolvedByProcedureId },
            newData: { status: PatientConditionStatus.RESOLVED, resolvedAt: updateData.resolvedAt, resolvedByProcedureId: updateData.resolvedByProcedureId },
        });
            return updated;
        });
    }

    // Generic audit log lookup, scoped to conditions for convenience.
    async getPatientConditionAuditLog(id: string) {
        return this.prisma.auditLog.findMany({
            where: { entityType: 'PatientCondition', recordId: id },
            orderBy: { createdAt: 'desc' },
        });
    }
}