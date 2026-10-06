// src/visit/visit-guard.ts
// ─────────────────────────────────────────────────────────────────────────────
// One rule for "may this caller write clinical data against this visit?".
//
// Every clinical write that names a visit (session execution, procedures,
// diagnoses, chart entries, progress reports) used to decide this on its own —
// and most did not decide it at all, so a write could land on a COMPLETED or
// CANCELLED visit, or on a visit that belongs to a different patient. The
// rules here are the ones VisitsService already applied to SOAP notes and
// vitals:
//
//   ARRIVED / IN_PROGRESS → anyone the route's @Roles admitted.
//   COMPLETED             → an amendment: treating dentist or an administrator,
//                           with a stated reason (the caller audits it).
//   CANCELLED             → never; record a new visit instead.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, VisitStatus } from '@prisma/client';
import { isVisitOpen } from './visit-status';

/** The authenticated caller, as assembled by JwtStrategy.validate. */
export interface VisitWriteActor {
  id?: string;
  role?: UserRole | string;
  /** Staff row of the caller, when they are clinical staff. */
  staffId?: string | null;
}

export interface GuardedVisit {
  id: string;
  patientId: string;
  dentistId: string;
  status: VisitStatus;
}

/**
 * Pure decision for a visit already loaded. Throws when the write is not
 * allowed; returns whether it is an amendment of a closed record.
 */
export function checkClinicalWrite(
  visit: { status: VisitStatus; dentistId: string },
  actor: VisitWriteActor | undefined,
  amendmentReason: string | undefined,
  what: string,
): { isAmendment: boolean } {
  if (isVisitOpen(visit.status)) return { isAmendment: false };

  if (visit.status === VisitStatus.CANCELLED) {
    throw new BadRequestException(
      `Cannot change ${what} on a cancelled visit. Record a new visit instead.`,
    );
  }

  // COMPLETED from here on.
  const isAdmin =
    actor?.role === UserRole.SUPER_ADMIN || actor?.role === UserRole.ADMIN;
  const isTreatingDentist =
    !!actor?.staffId && actor.staffId === visit.dentistId;

  if (!isAdmin && !isTreatingDentist) {
    throw new ForbiddenException(
      `This visit is completed. Only the treating dentist or an administrator may amend ${what}.`,
    );
  }
  if (!amendmentReason?.trim()) {
    throw new BadRequestException(
      `This visit is completed. Provide amendmentReason to amend ${what} — ` +
        'the original values and the reason are kept in the audit trail.',
    );
  }
  return { isAmendment: true };
}

/**
 * Load the visit and apply {@link checkClinicalWrite}. When `patientId` is
 * given the visit must belong to that patient, so a record can never be
 * attributed to someone else's encounter.
 */
export async function assertVisitWritableTx(
  db: Prisma.TransactionClient,
  args: {
    visitId: string;
    patientId?: string | null;
    actor?: VisitWriteActor;
    /**
     * Services that only carry the user id: the role and staff row are
     * looked up — and only when the visit is closed and they matter.
     */
    actorUserId?: string | null;
    amendmentReason?: string;
    what: string;
  },
): Promise<{ visit: GuardedVisit; isAmendment: boolean }> {
  const visit = await db.visit.findUnique({
    where: { id: args.visitId },
    select: { id: true, patientId: true, dentistId: true, status: true },
  });
  if (!visit) throw new NotFoundException('Visit not found');

  if (args.patientId && visit.patientId !== args.patientId) {
    throw new BadRequestException('This visit belongs to a different patient.');
  }

  let actor = args.actor;
  if (!actor && args.actorUserId && !isVisitOpen(visit.status)) {
    actor = await actorFromUserId(db, args.actorUserId);
  }

  const { isAmendment } = checkClinicalWrite(
    visit,
    actor,
    args.amendmentReason,
    args.what,
  );
  return { visit, isAmendment };
}

/** Role + staff row for a user id (undefined when unknown). */
export async function actorFromUserId(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<VisitWriteActor | undefined> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, staff: { select: { id: true } } },
  });
  if (!user) return undefined;
  return { id: user.id, role: user.role, staffId: user.staff?.id ?? null };
}
