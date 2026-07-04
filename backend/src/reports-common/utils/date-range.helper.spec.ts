import {
  resolveDateRange,
  ReportPeriod,
  dateRangeWhere,
  activityField,
  ActivityAxis,
} from './date-range.helper';
import { toZonedTime } from 'date-fns-tz';

describe('resolveDateRange', () => {
  // Pin "now" to a specific instant so tests are deterministic
  const NOW = new Date('2026-06-22T10:00:00.000Z');
  const TZ = 'Africa/Kampala'; // UTC+3

  describe('TODAY', () => {
    it('returns 00:00:00 local to 23:59:59.999 local for today', () => {
      const range = resolveDateRange(ReportPeriod.TODAY, {
        now: NOW,
        timezone: TZ,
      });
      // 2026-06-22 in EAT = 2026-06-22T00:00:00+03:00 = 2026-06-21T21:00:00Z
      expect(range.startDate.toISOString()).toBe('2026-06-21T21:00:00.000Z');
      // 2026-06-22 23:59:59.999 EAT = 2026-06-22T20:59:59.999Z
      expect(range.endDate.toISOString()).toBe('2026-06-22T20:59:59.999Z');
    });
  });

  describe('YESTERDAY', () => {
    it('returns the previous calendar day in the clinic TZ', () => {
      const range = resolveDateRange(ReportPeriod.YESTERDAY, {
        now: NOW,
        timezone: TZ,
      });
      // 2026-06-21 EAT
      expect(range.startDate.toISOString()).toBe('2026-06-20T21:00:00.000Z');
      expect(range.endDate.toISOString()).toBe('2026-06-21T20:59:59.999Z');
    });
  });

  describe('THIS_WEEK', () => {
    it('starts on Monday of the current week', () => {
      const range = resolveDateRange(ReportPeriod.THIS_WEEK, {
        now: NOW,
        timezone: TZ,
      });
      // 2026-06-22 was a Monday in EAT, so the week starts on that day
      expect(range.startDate.toISOString()).toBe('2026-06-21T21:00:00.000Z');
    });
  });

  describe('THIS_MONTH', () => {
    it('returns the full calendar month', () => {
      const range = resolveDateRange(ReportPeriod.THIS_MONTH, {
        now: NOW,
        timezone: TZ,
      });
      // 2026-06-01 00:00 EAT = 2026-05-31T21:00:00Z
      expect(range.startDate.toISOString()).toBe('2026-05-31T21:00:00.000Z');
      // 2026-06-30 23:59:59.999 EAT = 2026-06-30T20:59:59.999Z
      expect(range.endDate.toISOString()).toBe('2026-06-30T20:59:59.999Z');
    });
  });

  describe('LAST_3_MONTHS', () => {
    it('covers the previous 3 calendar months', () => {
      const range = resolveDateRange(ReportPeriod.LAST_3_MONTHS, {
        now: NOW,
        timezone: TZ,
      });
      // Starts at April 1 (3 months back from June), ends at end of June.
      // 2026-04-01 00:00 EAT = 2026-03-31T21:00:00Z, so the stored UTC date
      // is March 31. We assert via toZonedTime to verify the clinic-local day.
      const localStart = toZonedTime(range.startDate, TZ);
      expect(localStart.getMonth()).toBe(3); // April (0-indexed)
      expect(localStart.getDate()).toBe(1);
    });
  });

  describe('CUSTOM', () => {
    it('requires customStart and customEnd', () => {
      expect(() =>
        resolveDateRange(ReportPeriod.CUSTOM, {
          now: NOW,
          timezone: TZ,
        }),
      ).toThrow();
    });

    it('parses custom dates in the clinic TZ', () => {
      const range = resolveDateRange(ReportPeriod.CUSTOM, {
        customStart: '2026-01-15',
        customEnd: '2026-01-20',
        now: NOW,
        timezone: TZ,
      });
      // 2026-01-15 00:00 EAT = 2026-01-14T21:00:00Z
      expect(range.startDate.toISOString()).toBe('2026-01-14T21:00:00.000Z');
      // 2026-01-20 23:59:59.999 EAT = 2026-01-20T20:59:59.999Z
      expect(range.endDate.toISOString()).toBe('2026-01-20T20:59:59.999Z');
    });
  });

  describe('labels', () => {
    it('produces a human-readable label', () => {
      const range = resolveDateRange(ReportPeriod.THIS_MONTH, {
        now: NOW,
        timezone: TZ,
      });
      expect(range.label).toContain('Jun 2026');
    });
  });

  describe('default timezone', () => {
    it('uses REPORT_TIMEZONE env or falls back to Africa/Kampala', () => {
      const range = resolveDateRange(ReportPeriod.TODAY, { now: NOW });
      expect(range.timezone).toBeTruthy();
    });
  });
});

describe('dateRangeWhere', () => {
  it('builds a Prisma where clause with gte/lte', () => {
    const range = {
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: new Date('2026-06-30T23:59:59Z'),
      timezone: 'UTC',
      label: '',
    };
    const where = dateRangeWhere('createdAt', range);
    expect(where).toEqual({
      createdAt: { gte: range.startDate, lte: range.endDate },
    });
  });
});

describe('activityField', () => {
  it('returns completedAt for visits by default', () => {
    expect(activityField('visit', ActivityAxis.COMPLETED)).toBe('completedAt');
  });
  it('returns performedDate for sessions by default', () => {
    expect(activityField('session', ActivityAxis.COMPLETED)).toBe('performedDate');
  });
  it('returns completedAt for plans by default', () => {
    expect(activityField('plan', ActivityAxis.COMPLETED)).toBe('completedAt');
  });
  it('returns createdAt when axis is CREATED', () => {
    expect(activityField('visit', ActivityAxis.CREATED)).toBe('createdAt');
    expect(activityField('session', ActivityAxis.CREATED)).toBe('createdAt');
    expect(activityField('plan', ActivityAxis.CREATED)).toBe('createdAt');
  });
  it('returns scheduledAt for visits when axis is SCHEDULED', () => {
    expect(activityField('visit', ActivityAxis.SCHEDULED)).toBe('scheduledAt');
  });
});