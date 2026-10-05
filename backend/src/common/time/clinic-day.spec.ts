import { dayRange, weekRange, clinicDayOfWeek } from './clinic-day';

// Africa/Kampala is UTC+3 all year — the clinic's own zone, and the one the
// old `setHours(0,0,0,0)` / `T00:00:00.000Z` split silently disagreed about.
const TZ = 'Africa/Kampala';

describe('clinic-day', () => {
  it('starts the clinic day at local midnight, not UTC midnight', () => {
    const { start, end } = dayRange('2026-03-15', TZ);
    // 2026-03-15 00:00 +03:00 === 2026-03-14 21:00Z
    expect(start.toISOString()).toBe('2026-03-14T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-15T21:00:00.000Z');
  });

  it('produces a half-open window exactly 24h wide', () => {
    const { start, end } = dayRange('2026-03-15', TZ);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps an 08:00 local appointment inside its own day', () => {
    // The bug this guards: with UTC bounds, 2026-03-15T08:00+03:00
    // (= 05:00Z) fell inside the window but 2026-03-15T01:00+03:00
    // (= 2026-03-14T22:00Z) fell into the previous day's.
    const { start, end } = dayRange('2026-03-15', TZ);
    const earlyMorning = new Date('2026-03-15T01:00:00+03:00');
    const lateEvening = new Date('2026-03-15T23:30:00+03:00');
    for (const t of [earlyMorning, lateEvening]) {
      expect(t >= start && t < end).toBe(true);
    }
  });

  it('resolves an ISO instant to the clinic-local day it falls on', () => {
    // 2026-03-14T22:30Z is already 2026-03-15 in Kampala.
    const { start } = dayRange('2026-03-14T22:30:00.000Z', TZ);
    expect(start.toISOString()).toBe('2026-03-14T21:00:00.000Z');
  });

  it('defaults to today when no date is given', () => {
    const { start, end } = dayRange(undefined, TZ);
    const now = new Date();
    expect(now >= start && now < end).toBe(true);
  });

  it('rejects an impossible calendar date', () => {
    expect(() => dayRange('2026-02-31', TZ)).toThrow(/Invalid date/);
    expect(() => dayRange('not-a-date', TZ)).toThrow(/Invalid date/);
  });

  it('weekRange runs Monday 00:00 to the following Monday 00:00 local', () => {
    // 2026-03-15 is a Sunday; its week starts Monday 2026-03-09.
    const { start, end } = weekRange('2026-03-15', TZ);
    expect(start.toISOString()).toBe('2026-03-08T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-15T21:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('weekRange from a Monday keeps that Monday as the start', () => {
    const { start } = weekRange('2026-03-09', TZ);
    expect(start.toISOString()).toBe('2026-03-08T21:00:00.000Z');
  });

  it('reports the clinic-local day of week', () => {
    expect(clinicDayOfWeek('2026-03-15', TZ)).toBe(0); // Sunday
    expect(clinicDayOfWeek('2026-03-09', TZ)).toBe(1); // Monday
    // Late-evening UTC that is already the next local day.
    expect(clinicDayOfWeek('2026-03-08T22:00:00.000Z', TZ)).toBe(1);
  });

  it('handles a DST zone across the spring transition', () => {
    // Europe/London: clocks go forward 2026-03-29 01:00 UTC.
    const before = dayRange('2026-03-28', 'Europe/London');
    const during = dayRange('2026-03-29', 'Europe/London');
    expect(before.start.toISOString()).toBe('2026-03-28T00:00:00.000Z');
    expect(during.start.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    // The transition day is 23 hours long — the window must still cover it
    // exactly, with no gap or overlap against the next day.
    expect(during.end.toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });
});
