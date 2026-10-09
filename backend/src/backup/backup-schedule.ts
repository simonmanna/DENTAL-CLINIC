import { BackupFrequency, BackupSchedule } from './backup.types';

// All schedule math runs in the server's local time, like Windows Task
// Scheduler. "Slots" are the moments a backup is due.

const STEP_HOURS: Record<BackupFrequency, number> = {
  hourly: 1,
  every3h: 3,
  every6h: 6,
  every12h: 12,
  daily: 24,
  weekly: 24,
};

export function parseTime(time: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return { hour: 2, minute: 0 };
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Hours of the day (ascending) at which a slot falls, anchored on `time`. */
function slotHours(s: BackupSchedule): number[] {
  const { hour } = parseTime(s.time);
  const step = STEP_HOURS[s.frequency] ?? 24;
  const hours = new Set<number>();
  for (let h = hour; h < hour + 24; h += step) hours.add(h % 24);
  return [...hours].sort((a, b) => a - b);
}

function dayAllowed(s: BackupSchedule, day: Date): boolean {
  return s.frequency !== 'weekly' || day.getDay() === s.weekday;
}

/** Most recent slot at or before `now`. */
export function lastSlotAtOrBefore(s: BackupSchedule, now: Date): Date {
  const { minute } = parseTime(s.time);
  const hours = slotHours(s).reverse();
  for (let back = 0; back <= 8; back++) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - back,
    );
    if (!dayAllowed(s, day)) continue;
    for (const h of hours) {
      const slot = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        h,
        minute,
      );
      if (slot.getTime() <= now.getTime()) return slot;
    }
  }
  // Unreachable for valid schedules (weekly repeats within 8 days).
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/** First slot strictly after `now`. */
export function nextSlotAfter(s: BackupSchedule, now: Date): Date {
  const { minute } = parseTime(s.time);
  const hours = slotHours(s);
  for (let fwd = 0; fwd <= 8; fwd++) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + fwd,
    );
    if (!dayAllowed(s, day)) continue;
    for (const h of hours) {
      const slot = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        h,
        minute,
      );
      if (slot.getTime() > now.getTime()) return slot;
    }
  }
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/** True when the schedule fields that decide *when* backups run differ. */
export function timingChanged(a: BackupSchedule, b: BackupSchedule): boolean {
  return (
    a.enabled !== b.enabled ||
    a.frequency !== b.frequency ||
    a.time !== b.time ||
    a.weekday !== b.weekday
  );
}
