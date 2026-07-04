// Unit tests for the dual-source absent-tooth detection. The Prisma client is
// mocked so these run without a database. Covers the data layer behind test-plan
// cases B1, C6 (a resolved/ruled-out absence is excluded by the query filter)
// and the D2–D5 guards.

import { BadRequestException } from '@nestjs/common';
import { findAbsentTeeth, assertToothPresence } from './tooth-presence';

type Row = { toothNumber: number };

function mockDb(condRows: Row[] | undefined, chartRows: Row[] | undefined) {
  const patientCondition = { findMany: jest.fn().mockResolvedValue(condRows) };
  const chartEntry = { findMany: jest.fn().mockResolvedValue(chartRows) };
  return {
    db: { patientCondition, chartEntry } as any,
    patientCondition,
    chartEntry,
  };
}

describe('findAbsentTeeth', () => {
  it('issues no query and returns an empty set for empty input', async () => {
    const { db, patientCondition, chartEntry } = mockDb([], []);
    const result = await findAbsentTeeth(db, 'p1', []);
    expect(result.size).toBe(0);
    expect(patientCondition.findMany).not.toHaveBeenCalled();
    expect(chartEntry.findMany).not.toHaveBeenCalled();
  });

  it('detects absence recorded as a PatientCondition', async () => {
    const { db } = mockDb([{ toothNumber: 36 }], []);
    const result = await findAbsentTeeth(db, 'p1', [36, 37]);
    expect([...result]).toEqual([36]);
  });

  it('detects absence recorded only as a quick-action ChartEntry', async () => {
    const { db } = mockDb([], [{ toothNumber: 11 }]);
    const result = await findAbsentTeeth(db, 'p1', [11]);
    expect([...result]).toEqual([11]);
  });

  it('unions both sources and de-duplicates a tooth present in both', async () => {
    const { db } = mockDb([{ toothNumber: 36 }], [{ toothNumber: 36 }, { toothNumber: 21 }]);
    const result = await findAbsentTeeth(db, 'p1', [21, 36]);
    expect([...result].sort((a, b) => a - b)).toEqual([21, 36]);
  });

  it('tolerates an undefined query result (lenient mocks)', async () => {
    const { db } = mockDb(undefined, undefined);
    const result = await findAbsentTeeth(db, 'p1', [11]);
    expect(result.size).toBe(0);
  });

  it('only queries clinically-live absences (filter excludes resolved/ruled-out)', async () => {
    const { db, patientCondition } = mockDb([], []);
    await findAbsentTeeth(db, 'p1', [36]);
    const where = patientCondition.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['ACTIVE', 'MONITORED'] });
    expect(where.deletedAt).toBeNull();
  });
});

describe('assertToothPresence', () => {
  it('is a no-op when no surfaces are supplied (never queries)', async () => {
    const { db, patientCondition } = mockDb([{ toothNumber: 36 }], []);
    await expect(
      assertToothPresence(db, { patientId: 'p1', toothNumbers: [36], surfaces: [] }),
    ).resolves.toBeUndefined();
    expect(patientCondition.findMany).not.toHaveBeenCalled();
  });

  it('throws when surface work targets an absent tooth', async () => {
    const { db } = mockDb([{ toothNumber: 36 }], []);
    await expect(
      assertToothPresence(db, {
        patientId: 'p1',
        toothNumbers: [36],
        surfaces: ['MESIAL'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves when surface work targets a present tooth', async () => {
    const { db } = mockDb([], []);
    await expect(
      assertToothPresence(db, {
        patientId: 'p1',
        toothNumbers: [11],
        surfaces: ['MESIAL'],
      }),
    ).resolves.toBeUndefined();
  });
});
