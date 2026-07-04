// src/audit-log/audit-log.service.spec.ts
//
// Unit tests for AuditLogService.list() and AuditLogService.facets().
//
// Covers:
//   • filter compilation (module/action/entityType/userId/recordId/search)
//   • date-range filter parsing (invalid dates are ignored, not thrown)
//   • search OR-clause compilation
//   • pagination defaults / clamping (MAX_LIMIT=200, DEFAULT_LIMIT=25)
//   • sortBy default and accepted values
//   • facets: filtering out null/empty modules, mapping distinct rows
//
// Uses a PrismaService mock with jest.fn() — no DB connection required so
// these tests run in CI without docker/postgres.
import { Test } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

type AnyMock = jest.Mock;

function makePrismaMock() {
  return {
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    auditLog: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

describe('AuditLogService', () => {
  let svc: AuditLogService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = moduleRef.get(AuditLogService);
  });

  describe('list — filter compilation', () => {
    it('compiles all equality filters into the where clause', async () => {
      await svc.list({
        module: 'PAYMENTS',
        action: 'CREATE',
        entityType: 'Payment',
        userId: 'u-1',
        recordId: 'p-1',
      });
      const where = prisma.auditLog.count.mock.calls[0][0].where;
      expect(where).toMatchObject({
        module: 'PAYMENTS',
        action: 'CREATE',
        entityType: 'Payment',
        userId: 'u-1',
        recordId: 'p-1',
      });
    });

    it('ignores invalid date strings instead of throwing', async () => {
      await svc.list({ dateFrom: 'not-a-date', dateTo: 'also-bad' });
      const where = prisma.auditLog.count.mock.calls[0][0].where;
      expect(where.createdAt).toBeUndefined();
    });

    it('compiles valid date strings into gte/lte filters', async () => {
      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-01-31T23:59:59.000Z';
      await svc.list({ dateFrom: from, dateTo: to });
      const where = prisma.auditLog.count.mock.calls[0][0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lte).toBeInstanceOf(Date);
      expect((where.createdAt.gte as Date).toISOString()).toBe(from);
      expect((where.createdAt.lte as Date).toISOString()).toBe(to);
    });

    it('compiles the free-text search OR clause', async () => {
      await svc.list({ search: '  void-receipt  ' });
      const where = prisma.auditLog.count.mock.calls[0][0].where;
      expect(where.OR).toHaveLength(6);
      // OR contains userName, recordId, reason, module, entityType, action.
      const keys = where.OR.map((c: any) => Object.keys(c)[0]);
      expect(keys).toEqual(
        expect.arrayContaining([
          'userName',
          'recordId',
          'reason',
          'module',
          'entityType',
          'action',
        ]),
      );
    });

    it('skips search when the trimmed string is empty', async () => {
      await svc.list({ search: '   ' });
      const where = prisma.auditLog.count.mock.calls[0][0].where;
      expect(where.OR).toBeUndefined();
    });
  });

  describe('list — pagination and sorting', () => {
    it('clamps limit to MAX_LIMIT (200) and floors at 1', async () => {
      await svc.list({ limit: 9999, page: -3 });
      const findArgs = prisma.auditLog.findMany.mock.calls[0][0];
      expect(findArgs.take).toBe(200);
      expect(findArgs.skip).toBe(0); // page floored to 1 → skip 0
    });

    it('uses DEFAULT_LIMIT (25) when limit is omitted', async () => {
      await svc.list({});
      expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(25);
    });

    it('defaults sortBy=createdAt and sortDir=desc', async () => {
      await svc.list({});
      expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('honours an explicit sortBy/sortDir pair', async () => {
      await svc.list({ sortBy: 'module', sortDir: 'asc' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].orderBy).toEqual({
        module: 'asc',
      });
    });

    it('computes skip from page × limit', async () => {
      await svc.list({ page: 4, limit: 50 });
      expect(prisma.auditLog.findMany.mock.calls[0][0].skip).toBe(150);
      expect(prisma.auditLog.findMany.mock.calls[0][0].take).toBe(50);
    });
  });

  describe('list — pagination metadata', () => {
    it('returns totalPages = ceil(total/limit), minimum 1', async () => {
      prisma.auditLog.count.mockResolvedValue(123);
      prisma.$transaction.mockResolvedValue([
        123,
        [],
      ]);
      const out = await svc.list({ page: 1, limit: 25 });
      expect(out.pagination).toEqual({
        page: 1,
        limit: 25,
        total: 123,
        totalPages: 5,
      });
    });

    it('returns totalPages = 1 even when total is 0', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      prisma.$transaction.mockResolvedValue([0, []]);
      const out = await svc.list({});
      expect(out.pagination.totalPages).toBe(1);
      expect(out.pagination.total).toBe(0);
      expect(out.data).toEqual([]);
    });
  });

  describe('facets', () => {
    it('returns mapped module/action/entityType lists and users list', async () => {
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          { module: 'PAYMENTS' },
          { module: 'BILLING' },
          { module: null },
        ]) // modules
        .mockResolvedValueOnce([
          { action: 'CREATE' },
          { action: 'VOID' },
        ]) // actions
        .mockResolvedValueOnce([
          { entityType: 'Payment' },
          { entityType: 'Receipt' },
          { entityType: null },
        ]) // entityTypes
        .mockResolvedValueOnce([
          { userId: 'u-1', userName: 'Alice' },
          { userId: 'u-2', userName: null },
          { userId: null, userName: null },
        ]); // users

      const out = await svc.facets();

      expect(out.modules).toEqual(['PAYMENTS', 'BILLING']);
      expect(out.actions).toEqual(['CREATE', 'VOID']);
      expect(out.entityTypes).toEqual(['Payment', 'Receipt']);
      expect(out.users).toEqual([
        { id: 'u-1', name: 'Alice' },
        { id: 'u-2', name: 'u-2' }, // falls back to id when name missing
      ]);
    });

    it('caps each distinct lookup at 200 rows', async () => {
      await svc.facets();
      expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(4);
      for (const call of prisma.auditLog.findMany.mock.calls) {
        expect(call[0].take).toBe(200);
      }
    });
  });

  describe('getOne', () => {
    it('selects the documented column list', async () => {
      prisma.auditLog.findUnique.mockResolvedValue({ id: 'a-1' });
      const row = await svc.getOne('a-1');
      expect(row).toEqual({ id: 'a-1' });
      const args = prisma.auditLog.findUnique.mock.calls[0][0];
      expect(Object.keys(args.select).sort()).toEqual(
        [
          'id',
          'userId',
          'userName',
          'action',
          'module',
          'entityType',
          'recordId',
          'reason',
          'ipAddress',
          'userAgent',
          'oldData',
          'newData',
          'createdAt',
        ].sort(),
      );
    });
  });
});
