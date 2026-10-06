import { SessionStatus, TreatmentStatus } from '@prisma/client';
import { deriveProcedureStatus } from './procedure-status';

describe('deriveProcedureStatus', () => {
  const S = SessionStatus;

  it.each([
    ['no sessions', [], TreatmentStatus.PLANNED],
    ['only PENDING', [{ status: S.PENDING }], TreatmentStatus.PLANNED],
    ['only SKIPPED', [{ status: S.SKIPPED }], TreatmentStatus.PLANNED],
    [
      'voided / cancelled only',
      [{ status: S.VOIDED }, { status: S.CANCELLED }],
      TreatmentStatus.PLANNED,
    ],
    ['one COMPLETED, not final', [{ status: S.COMPLETED }], TreatmentStatus.IN_PROGRESS],
    ['IN_PROGRESS session', [{ status: S.IN_PROGRESS }], TreatmentStatus.IN_PROGRESS],
    [
      'COMPLETED + final',
      [{ status: S.COMPLETED }, { status: S.COMPLETED, isFinal: true }],
      TreatmentStatus.COMPLETED,
    ],
    [
      'final flag on a soft-deleted session is ignored',
      [
        { status: S.COMPLETED },
        { status: S.COMPLETED, isFinal: true, deletedAt: new Date() },
      ],
      TreatmentStatus.IN_PROGRESS,
    ],
    [
      'final flag on a PENDING session is ignored',
      [{ status: S.PENDING, isFinal: true }],
      TreatmentStatus.PLANNED,
    ],
  ])('%s', (_label, sessions, expected) => {
    expect(deriveProcedureStatus(sessions as any)).toBe(expected);
  });
});
