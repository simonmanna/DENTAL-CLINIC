// src/common/time/clinic-day.ts
// ─────────────────────────────────────────────────────────────────────────────
// One definition of "a day at this clinic".
//
// Before this module, every query that filtered "today" picked its own answer:
// the appointments list built `${date}T00:00:00.000Z` (UTC midnight), while the
// calendar, today's stats, the active-visit board and the visit list all used
// `setHours(0,0,0,0)` (whatever the server's TZ happens to be). On a UTC+3
// deployment those disagree by three hours, so an 08:00 appointment shows on
// the calendar and vanishes from the list — or appears under yesterday.
//
// Everything that needs a day/week window now goes through `dayRange()` /
// `weekRange()`, which resolve the civil date in the clinic's timezone and
// return the matching UTC instants. The timezone is configuration, not the
// server's locale: `CLINIC_TIMEZONE`, defaulting to Africa/Kampala (the
// clinic bills in UGX).
// ─────────────────────────────────────────────────────────────────────────────
import { BadRequestException } from '@nestjs/common';

const DEFAULT_TZ = 'Africa/Kampala';

/** IANA zone the clinic's calendar day is measured in. */
export function clinicTimeZone(): string {
  return process.env.CLINIC_TIMEZONE?.trim() || DEFAULT_TZ;
}

export interface DayRange {
  /** First instant of the clinic-local day (inclusive). */
  start: Date;
  /** First instant of the following day (EXCLUSIVE — use `lt`, not `lte`). */
  end: Date;
}

interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Offset, in milliseconds, that must be ADDED to a UTC instant to get the
 * clinic-local wall clock. Derived from Intl rather than hardcoded so DST
 * zones stay correct.
 */
function offsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  // `hour: '2-digit'` with hour12:false renders midnight as 24 in some ICU
  // versions; normalise so the arithmetic below cannot drift by a day.
  const hour = get('hour') % 24;

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asIfUtc - instant.getTime();
}

/** The civil (wall-clock) date an instant falls on, in the clinic's zone. */
export function clinicCivilDate(
  instant: Date,
  tz = clinicTimeZone(),
): CivilDate {
  const local = new Date(instant.getTime() + offsetMs(instant, tz));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
  };
}

/**
 * The UTC instant of midnight starting the given civil date in `tz`.
 *
 * Resolved iteratively: guess with the offset at UTC midnight, then re-measure
 * at the guess. Two passes settle every real zone, including the hour around a
 * DST transition.
 */
function startOfCivilDay(d: CivilDate, tz: string): Date {
  const naive = Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0);
  let instant = new Date(naive - offsetMs(new Date(naive), tz));
  instant = new Date(naive - offsetMs(instant, tz));
  return instant;
}

/** Parse `YYYY-MM-DD` (or any ISO instant) into a clinic-local civil date. */
function parseCivil(date: string, tz: string): CivilDate {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (ymd) {
    const [, y, m, d] = ymd;
    const civil = { year: Number(y), month: Number(m), day: Number(d) };
    // Reject 2026-02-31 and friends rather than letting Date roll them over.
    const rolled = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
    if (
      rolled.getUTCFullYear() !== civil.year ||
      rolled.getUTCMonth() + 1 !== civil.month ||
      rolled.getUTCDate() !== civil.day
    ) {
      throw new BadRequestException(`Invalid date: ${date}`);
    }
    return civil;
  }

  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `Invalid date: ${date}. Expected YYYY-MM-DD or an ISO 8601 instant.`,
    );
  }
  return clinicCivilDate(parsed, tz);
}

/**
 * Half-open window covering one clinic-local day.
 *
 * `date` accepts `YYYY-MM-DD` (treated as a clinic-local calendar date) or a
 * full ISO instant (the clinic-local day it falls on). Omitted → today.
 */
export function dayRange(
  date?: string | null,
  tz = clinicTimeZone(),
): DayRange {
  const civil = date ? parseCivil(date, tz) : clinicCivilDate(new Date(), tz);
  const start = startOfCivilDay(civil, tz);
  const nextCivil = clinicCivilDate(
    new Date(start.getTime() + 36 * 60 * 60 * 1000),
    tz,
  );
  return { start, end: startOfCivilDay(nextCivil, tz) };
}

/**
 * Half-open window covering the Monday–Sunday week containing `date`.
 * Monday-start matches how the clinic's calendar view is laid out.
 */
export function weekRange(
  date?: string | null,
  tz = clinicTimeZone(),
): DayRange {
  const { start: dayStart } = dayRange(date, tz);
  // Day-of-week of the clinic-local date (0 = Sunday).
  const civil = clinicCivilDate(dayStart, tz);
  const dow = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day),
  ).getUTCDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;

  const mondayCivilMs = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day - backToMonday,
  );
  const monday = new Date(mondayCivilMs);
  const start = startOfCivilDay(
    {
      year: monday.getUTCFullYear(),
      month: monday.getUTCMonth() + 1,
      day: monday.getUTCDate(),
    },
    tz,
  );

  const sunday = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const { end } = dayRange(sunday.toISOString(), tz);
  return { start, end };
}

/** Clinic-local day of week (0 = Sunday) for a date string or instant. */
export function clinicDayOfWeek(
  date?: string | null,
  tz = clinicTimeZone(),
): number {
  const { start } = dayRange(date, tz);
  const civil = clinicCivilDate(start, tz);
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay();
}

/**
 * The UTC instant of a `HH:mm` wall-clock time on a clinic-local date.
 * Used to turn a staff member's schedule ("09:00"–"17:00") into real instants.
 */
export function clinicLocalTimeToInstant(
  date: string,
  hour: number,
  minute: number,
  tz = clinicTimeZone(),
): Date {
  const { start } = dayRange(date, tz);
  // Adding wall-clock minutes to local midnight is correct except across a DST
  // jump inside the same day; clinics do not schedule through that hour and the
  // half-hour slot grid would be ambiguous there regardless.
  return new Date(start.getTime() + (hour * 60 + minute) * 60 * 1000);
}
