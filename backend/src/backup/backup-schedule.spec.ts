import { lastSlotAtOrBefore, nextSlotAfter } from './backup-schedule';
import { BackupSchedule } from './backup.types';

const at = (y: number, mo: number, d: number, h: number, mi = 0) =>
  new Date(y, mo - 1, d, h, mi);

const schedule = (s: Partial<BackupSchedule>): BackupSchedule => ({
  enabled: true,
  frequency: 'daily',
  time: '02:00',
  weekday: 0,
  catchUp: true,
  ...s,
});

describe('backup schedule', () => {
  it('daily: last slot is today once past the time, else yesterday', () => {
    const s = schedule({});
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 10))).toEqual(
      at(2026, 10, 9, 2),
    );
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 1))).toEqual(
      at(2026, 10, 8, 2),
    );
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 2))).toEqual(
      at(2026, 10, 9, 2),
    );
    expect(nextSlotAfter(s, at(2026, 10, 9, 2))).toEqual(at(2026, 10, 10, 2));
    expect(nextSlotAfter(s, at(2026, 10, 9, 1))).toEqual(at(2026, 10, 9, 2));
  });

  it('every 6 hours anchored on the chosen time', () => {
    const s = schedule({ frequency: 'every6h', time: '02:00' });
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 10))).toEqual(
      at(2026, 10, 9, 8),
    );
    expect(nextSlotAfter(s, at(2026, 10, 9, 10))).toEqual(at(2026, 10, 9, 14));
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 1))).toEqual(
      at(2026, 10, 8, 20),
    );
    expect(nextSlotAfter(s, at(2026, 10, 9, 21))).toEqual(at(2026, 10, 10, 2));
  });

  it('hourly keeps the minute', () => {
    const s = schedule({ frequency: 'hourly', time: '02:30' });
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 10, 15))).toEqual(
      at(2026, 10, 9, 9, 30),
    );
    expect(nextSlotAfter(s, at(2026, 10, 9, 10, 15))).toEqual(
      at(2026, 10, 9, 10, 30),
    );
  });

  it('weekly runs only on the chosen weekday', () => {
    // 2026-10-09 is a Friday; Sundays are the 4th and 11th.
    const s = schedule({ frequency: 'weekly', weekday: 0, time: '03:00' });
    expect(lastSlotAtOrBefore(s, at(2026, 10, 9, 12))).toEqual(
      at(2026, 10, 4, 3),
    );
    expect(nextSlotAfter(s, at(2026, 10, 9, 12))).toEqual(at(2026, 10, 11, 3));
    expect(lastSlotAtOrBefore(s, at(2026, 10, 11, 2))).toEqual(
      at(2026, 10, 4, 3),
    );
    expect(lastSlotAtOrBefore(s, at(2026, 10, 11, 3))).toEqual(
      at(2026, 10, 11, 3),
    );
  });
});
