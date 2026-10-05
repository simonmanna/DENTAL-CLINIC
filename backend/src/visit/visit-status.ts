// src/visit/visit-status.ts
// ─────────────────────────────────────────────────────────────────────────────
// The visit lifecycle.
//
// `VisitStatus` has four values and the service used to honour three of them:
// `createVisit` wrote IN_PROGRESS directly, which made ARRIVED unreachable and
// `startExamination` (which requires ARRIVED) permanently dead; CANCELLED had
// no endpoint at all. A visit now moves ARRIVED → IN_PROGRESS → COMPLETED,
// and can be CANCELLED from either open state.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';

const V = VisitStatus;

export const VISIT_TRANSITIONS: Readonly<
  Record<VisitStatus, readonly VisitStatus[]>
> = {
  [V.ARRIVED]: [V.IN_PROGRESS, V.CANCELLED],
  [V.IN_PROGRESS]: [V.COMPLETED, V.CANCELLED],
  [V.COMPLETED]: [],
  [V.CANCELLED]: [],
};

/** Statuses during which clinical data may still be entered normally. */
export const OPEN_VISIT_STATUSES: readonly VisitStatus[] = [
  V.ARRIVED,
  V.IN_PROGRESS,
];

export function isVisitOpen(status: VisitStatus): boolean {
  return OPEN_VISIT_STATUSES.includes(status);
}

export function assertVisitTransition(
  from: VisitStatus,
  to: VisitStatus,
): void {
  if (from === to) return;
  const allowed = VISIT_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return;
  throw new BadRequestException(
    allowed.length === 0
      ? `Visit is ${from} — a terminal status. It cannot become ${to}.`
      : `Cannot move visit from ${from} to ${to}. Allowed: ${allowed.join(', ')}.`,
  );
}
