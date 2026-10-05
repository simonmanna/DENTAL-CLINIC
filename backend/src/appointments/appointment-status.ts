// src/appointments/appointment-status.ts
// ─────────────────────────────────────────────────────────────────────────────
// The appointment lifecycle, in one place.
//
// The dedicated endpoints (confirm / arrive / cancel / no-show / draft) each
// carried their own inline list of acceptable predecessors, and `PATCH
// /appointments/:id` carried none at all — so a COMPLETED appointment could be
// pushed back to SCHEDULED, and a completed one marked NO_SHOW, through the
// generic update. Both paths now resolve through this table.
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';

const S = AppointmentStatus;

/**
 * Status → the statuses it may move to. Absent/empty means terminal.
 *
 * NO_SHOW is not terminal: a patient who missed a slot is routinely rebooked
 * onto the same record rather than a new one, so RESCHEDULED/SCHEDULED stay
 * reachable from it. COMPLETED and CANCELLED are terminal — correcting one is
 * an administrative act on a new record, not a status flip on the old one.
 */
export const APPOINTMENT_TRANSITIONS: Readonly<
  Record<AppointmentStatus, readonly AppointmentStatus[]>
> = {
  [S.DRAFT]: [S.SCHEDULED, S.CONFIRMED, S.ARRIVED, S.CANCELLED],
  [S.SCHEDULED]: [
    S.DRAFT,
    S.CONFIRMED,
    S.ARRIVED,
    S.RESCHEDULED,
    S.CANCELLED,
    S.NO_SHOW,
  ],
  [S.CONFIRMED]: [S.DRAFT, S.ARRIVED, S.RESCHEDULED, S.CANCELLED, S.NO_SHOW],
  [S.RESCHEDULED]: [
    S.CONFIRMED,
    S.ARRIVED,
    S.RESCHEDULED,
    S.CANCELLED,
    S.NO_SHOW,
  ],
  [S.ARRIVED]: [S.IN_PROGRESS, S.CANCELLED, S.NO_SHOW],
  [S.IN_PROGRESS]: [S.COMPLETED, S.CANCELLED],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [],
  [S.NO_SHOW]: [S.RESCHEDULED, S.SCHEDULED],
};

export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  if (from === to) return true; // idempotent re-assert of the current status
  return (APPOINTMENT_TRANSITIONS[from] ?? []).includes(to);
}

/** Throws BadRequest with the legal moves listed, so the UI can explain itself. */
export function assertTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): void {
  if (canTransition(from, to)) return;
  const allowed = APPOINTMENT_TRANSITIONS[from] ?? [];
  throw new BadRequestException(
    allowed.length === 0
      ? `Appointment is ${from} — a terminal status. It cannot become ${to}.`
      : `Cannot move appointment from ${from} to ${to}. Allowed: ${allowed.join(', ')}.`,
  );
}
