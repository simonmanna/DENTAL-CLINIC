// src/audit-log/audit-log.service.ts
// Read-only, paginated access to the generic `audit_logs` table.
// Append-only: no create/update/delete endpoints here (writes happen inside
// the modules that own the audited entity). Exposes:
//   • list(filters)         — paginated rows for the table page
//   • facets()              — distinct modules/actions/entityTypes for the
//                             filter dropdowns (cheap, indexed lookups)
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditLogFilters {
  module?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  recordId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'module' | 'action' | 'entityType' | 'userName';
  sortDir?: 'asc' | 'desc';
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 25;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  // ── list ───────────────────────────────────────────────────────────────────
  async list(filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.module) where.module = filters.module;
    if (filters.action) where.action = filters.action;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.userId) where.userId = filters.userId;
    if (filters.recordId) where.recordId = filters.recordId;

    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      let hasAny = false;
      if (filters.dateFrom) {
        const d = new Date(filters.dateFrom);
        if (!isNaN(d.getTime())) {
          dateFilter.gte = d;
          hasAny = true;
        }
      }
      if (filters.dateTo) {
        const d = new Date(filters.dateTo);
        if (!isNaN(d.getTime())) {
          dateFilter.lte = d;
          hasAny = true;
        }
      }
      // Only attach the createdAt filter when at least one bound parsed
      // successfully — avoids a no-op `{ createdAt: {} }` clause that could
      // confuse future readers.
      if (hasAny) where.createdAt = dateFilter;
    }

    if (filters.search) {
      const s = filters.search.trim();
      if (s.length > 0) {
        // Free-text search across the denormalised fields the table view shows.
        // `oldData`/`newData` are excluded (would need raw JSONB ops) — use the
        // recordId filter for JSON-keyed lookups instead.
        where.OR = [
          { userName: { contains: s, mode: 'insensitive' } },
          { recordId: { contains: s, mode: 'insensitive' } },
          { reason: { contains: s, mode: 'insensitive' } },
          { module: { contains: s, mode: 'insensitive' } },
          { entityType: { contains: s, mode: 'insensitive' } },
          { action: { contains: s, mode: 'insensitive' } },
        ];
      }
    }

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, filters.limit ?? DEFAULT_LIMIT),
    );
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortDir = filters.sortDir ?? 'desc';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          userName: true,
          action: true,
          module: true,
          entityType: true,
          recordId: true,
          reason: true,
          ipAddress: true,
          userAgent: true,
          oldData: true,
          newData: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // ── facets ─────────────────────────────────────────────────────────────────
  // Distinct values across the indexed columns. Capped to 200 each so a
  // junk `module='x'` typo can't return the whole table as options.
  async facets() {
    const [modules, actions, entityTypes, users] = await Promise.all([
      this.prisma.auditLog.findMany({
        distinct: ['module'],
        select: { module: true },
        orderBy: { module: 'asc' },
        take: 200,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
        take: 200,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
        take: 200,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['userId'],
        select: { userId: true, userName: true },
        where: { userId: { not: null } },
        take: 200,
      }),
    ]);

    return {
      modules: modules.map((m) => m.module).filter(Boolean),
      actions: actions.map((a) => a.action).filter(Boolean),
      entityTypes: entityTypes
        .map((e) => e.entityType)
        .filter((x): x is string => !!x),
      users: users
        .filter((u) => u.userId)
        .map((u) => ({ id: u.userId as string, name: u.userName ?? u.userId })),
    };
  }

  // ── one ────────────────────────────────────────────────────────────────────
  async getOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        userName: true,
        action: true,
        module: true,
        entityType: true,
        recordId: true,
        reason: true,
        ipAddress: true,
        userAgent: true,
        oldData: true,
        newData: true,
        createdAt: true,
      },
    });
  }
}
