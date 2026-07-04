import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConditionsService } from './conditions.service';
import { createPrismaMock, PrismaMock } from '../test-utils/prisma-mock';

describe('ConditionsService', () => {
  let service: ConditionsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ConditionsService(prisma as any);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  // ── Catalog ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('builds a where clause from filters and a search OR', async () => {
      prisma.condition.findMany.mockResolvedValue([]);
      await service.findAll({ isActive: true, category: 'CARIES', search: 'caries' });

      const arg = prisma.condition.findMany.mock.calls[0][0];
      expect(arg.where.isActive).toBe(true);
      expect(arg.where.category).toBe('CARIES');
      expect(Array.isArray(arg.where.OR)).toBe(true);
      expect(arg.where.OR.length).toBeGreaterThan(0);
    });
  });

  describe('findOne', () => {
    it('returns the condition when found', async () => {
      prisma.condition.findUnique.mockResolvedValue({ id: 'c1', name: 'Caries' });
      await expect(service.findOne('c1')).resolves.toEqual({ id: 'c1', name: 'Caries' });
    });
    it('throws NotFound when missing', async () => {
      prisma.condition.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects a duplicate name', async () => {
      prisma.condition.findFirst.mockResolvedValue({ id: 'c1', name: 'Caries' });
      await expect(
        service.create({ name: 'Caries', category: 'CARIES' } as any, false),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.condition.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
    it('creates the row and writes an audit log inside a transaction', async () => {
      prisma.condition.findFirst.mockResolvedValue(null);
      prisma.condition.create.mockResolvedValue({ id: 'c2', name: 'Abrasion', category: 'OTHER' });
      // writeAuditTx defensively resolves the user via tx.user.findUnique.
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', staff: null });
      const out = await service.create(
        { name: 'Abrasion', category: 'OTHER' } as any,
        false,
        'user-1',
      );
      expect(out).toMatchObject({ id: 'c2', name: 'Abrasion' });
      expect(prisma.condition.create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('CREATE');
      expect(auditArg.data.entityType).toBe('Condition');
      expect(auditArg.data.recordId).toBe('c2');
      expect(auditArg.data.userId).toBe('user-1');
      expect(auditArg.data.newData).toMatchObject({ name: 'Abrasion', category: 'OTHER' });
      expect(auditArg.data.oldData).toBeNull();
    });
  });

  describe('update', () => {
    it('writes UPDATE audit row with oldData and newData snapshots', async () => {
      prisma.condition.findUnique
        .mockResolvedValueOnce({
          id: 'c1', name: 'Old', category: 'OTHER',
          isFavourite: false, isToothSpecific: true,
        })
        .mockResolvedValueOnce({
          id: 'c1', name: 'New', category: 'OTHER',
          isFavourite: true, isToothSpecific: true,
        });
      prisma.condition.findFirst.mockResolvedValue(null); // no duplicate
      prisma.condition.update.mockResolvedValue({
        id: 'c1', name: 'New', category: 'OTHER',
        isFavourite: true, isToothSpecific: true,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', staff: null });

      await service.update('c1', { name: 'New', isFavourite: true } as any, 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.condition.update).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('UPDATE');
      expect(auditArg.data.entityType).toBe('Condition');
      expect(auditArg.data.userId).toBe('user-1');
      expect(auditArg.data.oldData.name).toBe('Old');
      expect(auditArg.data.newData.name).toBe('New');
    });
  });

  describe('remove', () => {
    it('forbids deleting a system condition', async () => {
      prisma.condition.findUnique.mockResolvedValue({ id: 'c1', isSystem: true });
      await expect(service.remove('c1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('blocks deleting a condition still in use', async () => {
      prisma.condition.findUnique.mockResolvedValue({ id: 'c1', isSystem: false });
      prisma.patientCondition.count.mockResolvedValue(3);
      await expect(service.remove('c1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.condition.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
    it('deletes an unused, non-system condition and writes a DELETE audit row', async () => {
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', isSystem: false, name: 'X', category: 'OTHER', icd10Code: 'K02.9',
      });
      prisma.patientCondition.count.mockResolvedValue(0);
      prisma.condition.delete.mockResolvedValue({ id: 'c1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', staff: null });

      const out = await service.remove('c1', 'user-1');
      expect(out).toEqual({ id: 'c1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('DELETE');
      expect(auditArg.data.entityType).toBe('Condition');
      expect(auditArg.data.recordId).toBe('c1');
      expect(auditArg.data.userId).toBe('user-1');
      expect(auditArg.data.oldData).toMatchObject({
        name: 'X',
        icd10Code: 'K02.9',
        usageCountAtDelete: 0,
      });
    });
  });

  describe('toggleFavourite', () => {
    it('flips the favourite flag and writes an UPDATE audit row', async () => {
      prisma.condition.findUnique.mockResolvedValue({ id: 'c1', isFavourite: false });
      prisma.condition.update.mockResolvedValue({ id: 'c1', isFavourite: true });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', staff: null });
      await service.toggleFavourite('c1', 'user-1');
      expect(prisma.condition.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { isFavourite: true },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('UPDATE');
      expect(auditArg.data.reason).toBe('toggleFavourite');
      expect(auditArg.data.oldData).toEqual({ isFavourite: false });
      expect(auditArg.data.newData).toEqual({ isFavourite: true });
    });
  });

  // ── Patient conditions ───────────────────────────────────────────────────────
  describe('createPatientCondition', () => {
    it('throws when the patient does not exist', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(
        service.createPatientCondition({ patientId: 'p1', conditionId: 'c1' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('requires surfaces when the condition requires them', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: true, isToothSpecific: true,
      });
      await expect(
        service.createPatientCondition({
          patientId: 'p1', conditionId: 'c1', toothNumber: 11, surfaces: [],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a tooth number for tooth-specific conditions', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: false, isToothSpecific: true,
      });
      await expect(
        service.createPatientCondition({ patientId: 'p1', conditionId: 'c1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates a supplied provider', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: false, isToothSpecific: false,
      });
      prisma.staff.findUnique.mockResolvedValue(null);
      await expect(
        service.createPatientCondition({
          patientId: 'p1', conditionId: 'c1', providerId: 'bad',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates the row, paired chart entry, and audit log inside a transaction', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', icd10Code: 'K02.9', requiresSurface: false, isToothSpecific: false,
      });
      prisma.patientCondition.create.mockResolvedValue({
        id: 'pc1', patientId: 'p1', conditionId: 'c1', surfaces: [], status: 'ACTIVE',
      });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1' });
      const out = await service.createPatientCondition(
        { patientId: 'p1', conditionId: 'c1' } as any,
        'user-1',
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.patientCondition.create).toHaveBeenCalledTimes(1);
      expect(prisma.chartEntry.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      // The audit row's newData must capture the new chartEntryId so the row
      // can be traced from the audit log back to the chart.
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.newData).toMatchObject({ chartEntryId: 'ce1' });
      expect(out).toMatchObject({ id: 'pc1' });
    });

    it('blocks a surface-bearing condition on a tooth charted as absent', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: true, isToothSpecific: true,
      });
      // Absence detection — tooth 16 is recorded absent.
      prisma.patientCondition.findMany.mockResolvedValue([{ toothNumber: 16 }]);
      await expect(
        service.createPatientCondition(
          { patientId: 'p1', conditionId: 'c1', toothNumber: 16, surfaces: ['OCCLUSAL'] } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.patientCondition.create).not.toHaveBeenCalled();
    });

    // ── I1: idempotency replay + storage ──────────────────────────────────
    it('I1: replays the original 201 when an Idempotency-Key already has a response', async () => {
      // The key already exists in the store with a prior response — no DB
      // writes should be performed; the stored response is returned with a
      // _idempotent flag so callers can trace replays distinctly.
      prisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'idem-1',
        response: { id: 'pc-existing', patientId: 'p1', conditionId: 'c1' },
      });
      const out = await service.createPatientCondition(
        { patientId: 'p1', conditionId: 'c1' } as any,
        'user-1',
        'idem-1',
      );
      expect(out).toMatchObject({ id: 'pc-existing', _idempotent: true });
      expect(prisma.patient.findUnique).not.toHaveBeenCalled();
      expect(prisma.patientCondition.create).not.toHaveBeenCalled();
      expect(prisma.chartEntry.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('I1: persists an Idempotency-Key record inside the transaction on a fresh write', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue(null);
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: false, isToothSpecific: false,
      });
      prisma.patientCondition.create.mockResolvedValue({
        id: 'pc1', patientId: 'p1', conditionId: 'c1', surfaces: [], status: 'ACTIVE',
      });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1' });
      await service.createPatientCondition(
        { patientId: 'p1', conditionId: 'c1' } as any,
        'user-1',
        'idem-fresh',
      );
      // The idempotency key must be written INSIDE the same transaction so a
      // racing duplicate hits the PK on `key` and rolls the whole body back.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.idempotencyKey.create).toHaveBeenCalledTimes(1);
      const arg = prisma.idempotencyKey.create.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        key: 'idem-fresh',
        scope: 'CONDITIONS_CREATE_PATIENT',
      });
      expect(arg.data.response).toMatchObject({ id: 'pc1' });
    });

    it('I1: skips idempotency persistence when no key is supplied', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.condition.findUnique.mockResolvedValue({
        id: 'c1', name: 'Caries', requiresSurface: false, isToothSpecific: false,
      });
      prisma.patientCondition.create.mockResolvedValue({
        id: 'pc1', patientId: 'p1', conditionId: 'c1', surfaces: [], status: 'ACTIVE',
      });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce1' });
      await service.createPatientCondition(
        { patientId: 'p1', conditionId: 'c1' } as any,
        'user-1',
      );
      expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
      expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
    });
  });

  describe('createPatientConditionsBatch', () => {
    it('blocks the batch when a surface-bearing entry targets an absent tooth', async () => {
      prisma.condition.findMany.mockResolvedValue([
        { id: 'c1', name: 'Caries', requiresSurface: true, isToothSpecific: true },
      ]);
      // Absence detection — tooth 16 is recorded absent.
      prisma.patientCondition.findMany.mockResolvedValue([{ toothNumber: 16 }]);
      await expect(
        service.createPatientConditionsBatch(
          [
            {
              patientId: 'p1', conditionId: 'c1', toothNumber: 16,
              surfaces: ['OCCLUSAL'],
            } as any,
          ],
          [
            {
              patientId: 'p1', toothNumber: 16, surfaces: ['OCCLUSAL'],
              label: 'Caries', conditionId: 'c1',
            },
          ],
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.patientCondition.create).not.toHaveBeenCalled();
    });
  });

  describe('removePatientCondition', () => {
    it('requires a reason', async () => {
      await expect(
        service.removePatientCondition('pc1', 'user-1', '  '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('soft-deletes, cascades chart-entry void, and audits', async () => {
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1', conditionId: 'c1', toothNumber: 11, surfaces: [], severity: null,
        status: 'ACTIVE', providerId: null, diagnosedAt: new Date(),
      });
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1', deletedAt: new Date() });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 2 });

      await service.removePatientCondition('pc1', 'user-1', 'charted in error');

      // Soft delete (not a hard delete)
      const updArg = prisma.patientCondition.update.mock.calls[0][0];
      expect(updArg.data.deletedAt).toBeInstanceOf(Date);
      expect(updArg.data.deletedReason).toBe('charted in error');
      expect(prisma.patientCondition.delete).not.toHaveBeenCalled();

      // Cascade only ACTIVE linked chart entries
      const ceArg = prisma.chartEntry.updateMany.mock.calls[0][0];
      expect(ceArg.where).toMatchObject({ patientConditionId: 'pc1', status: 'ACTIVE' });
      expect(ceArg.data.status).toBe('VOIDED');

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('restorePatientCondition', () => {
    it('flips voided chart entries (with the delete marker) back to ACTIVE', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1', deletedAt: new Date(),
      });
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1', deletedAt: null });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 3 });

      const out = await service.restorePatientCondition('pc1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // The chart-entry flip must be constrained on the [CONDITION DELETED
      // marker so a manually-voided entry is never resurrected.
      const ceArg = prisma.chartEntry.updateMany.mock.calls[0][0];
      expect(ceArg.where).toMatchObject({
        patientConditionId: 'pc1',
        status: 'VOIDED',
      });
      expect(ceArg.where.notes).toMatchObject({ startsWith: '[CONDITION DELETED ' });
      expect(ceArg.data).toEqual({ status: 'ACTIVE', notes: null });

      // Audit captures the count of chart entries restored.
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('RESTORE');
      expect(auditArg.data.newData).toEqual({ chartEntriesRestored: 3 });

      expect(out).toMatchObject({ id: 'pc1' });
    });

    it('refuses to restore a non-deleted condition', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1', deletedAt: null,
      });
      await expect(
        service.restorePatientCondition('pc1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.patientCondition.update).not.toHaveBeenCalled();
      expect(prisma.chartEntry.updateMany).not.toHaveBeenCalled();
    });

    it('restores cleanly when there are no chart entries to flip', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1', deletedAt: new Date(),
      });
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1', deletedAt: null });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });

      await service.restorePatientCondition('pc1', 'user-1');

      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.newData).toEqual({ chartEntriesRestored: 0 });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('updatePatientCondition', () => {
    it('supersedes prior ACTIVE chart entries and recreates one mirroring the updated PC', async () => {
      // findOnePatientCondition → returns the existing row.
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1', patientId: 'p1', conditionId: 'c1', toothNumber: 16,
        surfaces: ['OCCLUSAL'], severity: null, status: 'ACTIVE',
        notes: 'old', providerId: null, visitId: null, diagnosedAt: new Date(),
      });
      // update returns the updated row with the new surfaces.
      prisma.patientCondition.update.mockResolvedValue({
        id: 'pc1', patientId: 'p1', conditionId: 'c1', toothNumber: 16,
        surfaces: ['MESIAL', 'OCCLUSAL', 'DISTAL'], severity: null,
        status: 'ACTIVE', notes: 'new', providerId: null, visitId: null,
        diagnosedAt: new Date(),
        condition: { name: 'Caries', icd10Code: 'K02.9' },
      });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-new' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', staff: null });

      await service.updatePatientCondition(
        'pc1',
        { surfaces: ['MESIAL', 'OCCLUSAL', 'DISTAL'] } as any,
        'user-1',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // 1) Prior ACTIVE chart entries for this PC must be SUPERSEDED.
      const supersedeArg = prisma.chartEntry.updateMany.mock.calls[0][0];
      expect(supersedeArg.where).toMatchObject({
        patientConditionId: 'pc1',
        status: 'ACTIVE',
      });
      expect(supersedeArg.data.status).toBe('SUPERSEDED');

      // 2) A fresh ACTIVE chart entry mirroring the updated PC must be created.
      const createArg = prisma.chartEntry.create.mock.calls[0][0];
      expect(createArg.data).toMatchObject({
        patientId: 'p1',
        patientConditionId: 'pc1',
        type: 'CONDITION',
        status: 'ACTIVE',
        label: 'Caries',
        conditionCode: 'K02.9',
        conditionId: 'c1',
      });
      expect(createArg.data.surfaces).toEqual(['MESIAL', 'OCCLUSAL', 'DISTAL']);

      // 3) The audit row's newData must capture the new chartEntryId.
      const auditArg = prisma.auditLog.create.mock.calls[0][0];
      expect(auditArg.data.action).toBe('UPDATE');
      expect(auditArg.data.newData.chartEntryId).toBe('ce-new');
      expect(auditArg.data.userId).toBe('user-1');
    });
  });

  describe('findPatientConditions', () => {
    it('throws NotFound for an unknown patientId (closes an info-leak)', async () => {
      prisma.patient.findUnique.mockResolvedValue(null);
      await expect(
        service.findPatientConditions('ghost-patient'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.patientCondition.findMany).not.toHaveBeenCalled();
    });

    it('returns the conditions for a known patient', async () => {
      prisma.patient.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.patientCondition.findMany.mockResolvedValue([]);
      const out = await service.findPatientConditions('p1', undefined);
      expect(out).toEqual([]);
      expect(prisma.patientCondition.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('createPatientConditionsBatch', () => {
    it('rejects an empty batch', async () => {
      await expect(service.createPatientConditionsBatch([], [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects entries with no conditionId', async () => {
      await expect(
        service.createPatientConditionsBatch(
          [{ patientId: 'p1' } as any],
          [],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates each PatientCondition + paired ChartEntry atomically', async () => {
      prisma.condition.findMany.mockResolvedValue([
        { id: 'c1', name: 'Caries', requiresSurface: false, isToothSpecific: true },
      ]);
      prisma.patientCondition.create
        .mockResolvedValueOnce({ id: 'pc1', patientId: 'p1', conditionId: 'c1', toothNumber: 11, surfaces: [] })
        .mockResolvedValueOnce({ id: 'pc2', patientId: 'p1', conditionId: 'c1', toothNumber: 12, surfaces: [] });
      prisma.chartEntry.create
        .mockResolvedValueOnce({ id: 'ce1' })
        .mockResolvedValueOnce({ id: 'ce2' });

      const entries = [
        { patientId: 'p1', conditionId: 'c1', toothNumber: 11 },
        { patientId: 'p1', conditionId: 'c1', toothNumber: 12 },
      ] as any;
      const chartEntries = [
        { patientId: 'p1', toothNumber: 11, surfaces: [], label: 'Caries', conditionId: 'c1' },
        { patientId: 'p1', toothNumber: 12, surfaces: [], label: 'Caries', conditionId: 'c1' },
      ];

      const out = await service.createPatientConditionsBatch(entries, chartEntries, 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.patientCondition.create).toHaveBeenCalledTimes(2);
      expect(prisma.chartEntry.create).toHaveBeenCalledTimes(2);
      expect(out.patientConditions).toHaveLength(2);
      expect(out.chartEntries).toHaveLength(2);
    });
  });

  describe('resolvePatientCondition', () => {
    it('sets status RESOLVED and audits', async () => {
      prisma.patientCondition.findFirst.mockResolvedValue({ id: 'pc1', status: 'ACTIVE' });
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1', status: 'RESOLVED' });
      const out = await service.resolvePatientCondition('pc1', 'user-1');
      expect(out.status).toBe('RESOLVED');
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Auto-resolve on procedure completion ───────────────────────────────────
  // A condition resolves when ALL linked procedures that treat it are completed.
  // The resolvedAt and resolvedByProcedureId use the LAST completed procedure.
  describe('evaluateConditionStatus', () => {
    const condition = { chartPresenceEffect: 'NONE', name: 'Caries' };

    it('RESOLVED when ALL linked procedures are COMPLETED', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1',
        status: 'IN_TREATMENT',
        deletedAt: null,
        condition,
      });
      prisma.conditionProcedureLink.findMany.mockResolvedValue([
        {
          treatmentProcedure: {
            id: 'procA',
            status: 'COMPLETED',
            completedAt: new Date('2024-01-10'),
            updatedAt: new Date('2024-01-10'),
          },
        },
        {
          treatmentProcedure: {
            id: 'procB',
            status: 'COMPLETED',
            completedAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        },
      ]);

      const out = await (service as any).evaluateConditionStatus(prisma, 'pc1');
      expect(out.status).toBe('RESOLVED');
      expect(out.resolvedByProcedureId).toBe('procB'); // last completed
      expect(out.resolvedAt).toEqual(new Date('2024-01-15'));
    });

    it('IN_TREATMENT when some procedures completed but not all', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1',
        status: 'ACTIVE',
        deletedAt: null,
        condition,
      });
      prisma.conditionProcedureLink.findMany.mockResolvedValue([
        { treatmentProcedure: { id: 'procA', status: 'COMPLETED', completedAt: new Date('2024-01-10'), updatedAt: new Date('2024-01-10') } },
        { treatmentProcedure: { id: 'procB', status: 'PLANNED', completedAt: null, updatedAt: new Date('2024-01-01') } },
      ]);

      const out = await (service as any).evaluateConditionStatus(prisma, 'pc1');
      expect(out.status).toBe('IN_TREATMENT');
    });

    it('IN_TREATMENT when a procedure is started but none completed', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1',
        status: 'ACTIVE',
        deletedAt: null,
        condition,
      });
      prisma.conditionProcedureLink.findMany.mockResolvedValue([
        { treatmentProcedure: { id: 'procA', status: 'IN_PROGRESS', completedAt: null, updatedAt: new Date('2024-01-10') } },
        { treatmentProcedure: { id: 'procB', status: 'PLANNED', completedAt: null, updatedAt: new Date('2024-01-01') } },
      ]);

      const out = await (service as any).evaluateConditionStatus(prisma, 'pc1');
      expect(out.status).toBe('IN_TREATMENT');
    });

    it('left untouched for never-auto-resolve (presence-affecting) conditions', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1',
        status: 'ACTIVE',
        deletedAt: null,
        condition: { chartPresenceEffect: 'EXTRACTED', name: 'Tooth absent (acquired / extracted)' },
      });

      const out = await (service as any).evaluateConditionStatus(prisma, 'pc1');
      expect(out.status).toBe('ACTIVE');
      expect(prisma.conditionProcedureLink.findMany).not.toHaveBeenCalled();
    });
  });

  describe('applyConditionLifecycleTx', () => {
    it('stamps RESOLVED + resolvedAt + resolvedByProcedureId using last completed procedure', async () => {
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1',
        status: 'IN_TREATMENT',
        deletedAt: null,
        condition: { chartPresenceEffect: 'NONE', name: 'Caries' },
      });
      prisma.conditionProcedureLink.findMany.mockResolvedValue([
        {
          treatmentProcedure: {
            id: 'procA',
            status: 'COMPLETED',
            completedAt: new Date('2024-01-10'),
            updatedAt: new Date('2024-01-10'),
          },
        },
        {
          treatmentProcedure: {
            id: 'procB',
            status: 'COMPLETED',
            completedAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        },
      ]);
      prisma.patientCondition.update.mockResolvedValue({ id: 'pc1' });

      await (service as any).applyConditionLifecycleTx(prisma, 'pc1', 'user-1');

      const arg = prisma.patientCondition.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'pc1' });
      expect(arg.data.status).toBe('RESOLVED');
      expect(arg.data.resolvedAt).toEqual(new Date('2024-01-15'));
      expect(arg.data.resolvedByProcedureId).toBe('procB');
    });
  });

  // ── OL-1: optimistic-lock token on PatientCondition ──────────────────────
  describe('optimistic-lock (OL-1)', () => {
    // Minimal stand-in for the `$transaction` callback so we can capture the
    // txClient the service receives and verify the updateMany that backs the
    // version guard is invoked with the expected where-clause.
    let capturedTx: any;
    beforeEach(() => {
      capturedTx = null;
      // Override the prisma mock's $transaction so the test can drive the
      // service's tx callback directly. The mock's `tx` is just a re-export
      // of prisma itself in test-utils/prisma-mock, so any method called on
      // it within the tx routes through to the jest mock.
      (prisma.$transaction as any) = jest.fn(async (cb: any) => {
        capturedTx = prisma; // the test-utils mock reuses the same client as tx
        return cb(prisma);
      });
    });

    it('updatePatientCondition raises ConflictException when expectedVersion is stale', async () => {
      // Existing row read in findOnePatientCondition (latest version = 7).
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1',
        conditionId: 'c1',
        toothNumber: 26,
        surfaces: ['OCCLUSAL'],
        severity: 'MILD',
        status: 'ACTIVE',
        notes: 'old',
        providerId: 's1',
        visitId: null,
        diagnosedAt: new Date(),
        version: 7,
        deletedAt: null,
      });
      // Stale version supplied by caller.
      prisma.patientCondition.updateMany.mockResolvedValueOnce({ count: 0 });
      // Current row exists at version 7 → return it so the 409 carries it.
      prisma.patientCondition.findUnique.mockResolvedValue({
        id: 'pc1', version: 7, deletedAt: null,
      });

      await expect(
        service.updatePatientCondition(
          'pc1',
          { notes: 'new', expectedVersion: 6 } as any,
          'user-1',
        ),
      ).rejects.toMatchObject({
        // NestJS ConflictException is exported as a class; use property match.
        message: expect.stringContaining('modified by another user'),
      });

      // Guard: the stale updateMany was attempted with the supplied version.
      expect(prisma.patientCondition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pc1', version: 6, deletedAt: null } }),
      );
    });

    it('updatePatientCondition succeeds when expectedVersion matches', async () => {
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1', conditionId: 'c1', toothNumber: 26, surfaces: ['OCCLUSAL'],
        severity: 'MILD', status: 'ACTIVE', notes: 'old', providerId: 's1',
        visitId: null, diagnosedAt: new Date(), version: 7, deletedAt: null,
      });
      // Successful bump: version 7 → 8.
      prisma.patientCondition.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.patientCondition.update.mockResolvedValue({
        id: 'pc1', version: 8, conditionId: 'c1', toothNumber: 26, surfaces: ['OCCLUSAL'],
        severity: 'MILD', status: 'ACTIVE', notes: 'new', providerId: 's1',
        visitId: null, diagnosedAt: new Date(), condition: { id: 'c1' },
        provider: { id: 's1', firstName: 'A', lastName: 'B' },
      });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-new' });

      await expect(
        service.updatePatientCondition(
          'pc1',
          { notes: 'new', expectedVersion: 7 } as any,
          'user-1',
        ),
      ).resolves.toMatchObject({ id: 'pc1', version: 8 });

      // The version bump used the supplied version as the WHERE predicate.
      expect(prisma.patientCondition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pc1', version: 7, deletedAt: null } }),
      );
    });

    it('updatePatientCondition bumps version unconditionally when expectedVersion is omitted', async () => {
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1', conditionId: 'c1', toothNumber: 26, surfaces: ['OCCLUSAL'],
        severity: 'MILD', status: 'ACTIVE', notes: 'old', providerId: 's1',
        visitId: null, diagnosedAt: new Date(), version: 7, deletedAt: null,
      });
      // No expectedVersion → single bare update bumps version.
      prisma.patientCondition.update.mockResolvedValue({
        id: 'pc1', version: 8, conditionId: 'c1', toothNumber: 26, surfaces: ['OCCLUSAL'],
        severity: 'MILD', status: 'ACTIVE', notes: 'new', providerId: 's1',
        visitId: null, diagnosedAt: new Date(), condition: { id: 'c1' },
        provider: { id: 's1', firstName: 'A', lastName: 'B' },
      });
      prisma.chartEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.chartEntry.create.mockResolvedValue({ id: 'ce-new' });

      await service.updatePatientCondition(
        'pc1', { notes: 'new' } as any, 'user-1',
      );

      // First call was the unconditional version bump (legacy compat path).
      const firstUpdateArgs = prisma.patientCondition.update.mock.calls[0][0];
      expect(firstUpdateArgs.where).toEqual({ id: 'pc1' });
      expect(firstUpdateArgs.data.version).toEqual({ increment: 1 });
    });

    it('updatePatientCondition rejects a non-integer expectedVersion', async () => {
      prisma.patientCondition.findFirst.mockResolvedValue({
        id: 'pc1', conditionId: 'c1', toothNumber: 26, surfaces: ['OCCLUSAL'],
        severity: 'MILD', status: 'ACTIVE', notes: 'old', providerId: 's1',
        visitId: null, diagnosedAt: new Date(), version: 7, deletedAt: null,
      });

      await expect(
        service.updatePatientCondition(
          'pc1',
          { notes: 'new', expectedVersion: -1 } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── UN-1: Condition.name @unique race-fallback ───────────────────────────
  describe('unique Condition.name (UN-1)', () => {
    beforeEach(() => {
      (prisma.$transaction as any) = jest.fn(async (cb: any) => cb(prisma));
    });

    it('create() translates a Prisma P2002 unique-violation into a 400', async () => {
      // Fast-path findFirst returns null (no dup yet), but the create race
      // hits the DB unique constraint.
      prisma.condition.findFirst.mockResolvedValueOnce(null);
      prisma.condition.create.mockRejectedValueOnce({ code: 'P2002' });

      await expect(
        service.create(
          { name: 'Caries', category: 'CARIES' } as any,
          true,
          'user-1',
        ),
      ).rejects.toMatchObject({
        // BadRequestException instance + the same friendly message as the
        // fast-path duplicate check.
        message: expect.stringContaining('already exists'),
      });
    });
  });
});
