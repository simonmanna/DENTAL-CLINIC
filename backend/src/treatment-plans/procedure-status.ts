// src/treatment-plans/procedure-status.ts
// ─────────────────────────────────────────────────────────────────────────────
// A treatment procedure's clinical status, derived from its sessions.
//
// executeSession, editSession and deleteSession each carried their own copy of
// this rule and they disagreed: two of them counted a PENDING (never executed)
// session as treatment in progress. Pure so it is unit-tested without a DB.
// ─────────────────────────────────────────────────────────────────────────────
import { SessionStatus, TreatmentStatus } from '@prisma/client';

export interface SessionLike {
  status: SessionStatus | string;
  isFinal?: boolean | null;
  deletedAt?: Date | null;
}

/**
 *   a COMPLETED session flagged final      → COMPLETED
 *   any COMPLETED or IN_PROGRESS session   → IN_PROGRESS
 *   otherwise (none, or only PENDING /
 *   SKIPPED / CANCELLED / VOIDED)          → PLANNED
 */
export function deriveProcedureStatus(
  sessions: readonly SessionLike[],
): TreatmentStatus {
  const live = sessions.filter(
    (s) =>
      !s.deletedAt &&
      s.status !== SessionStatus.VOIDED &&
      s.status !== SessionStatus.CANCELLED,
  );
  const completed = live.filter((s) => s.status === SessionStatus.COMPLETED);

  if (completed.some((s) => s.isFinal === true)) {
    return TreatmentStatus.COMPLETED;
  }
  if (
    completed.length > 0 ||
    live.some((s) => s.status === SessionStatus.IN_PROGRESS)
  ) {
    return TreatmentStatus.IN_PROGRESS;
  }
  return TreatmentStatus.PLANNED;
}
