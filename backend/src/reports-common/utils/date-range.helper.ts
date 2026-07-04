import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subDays,
} from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Default clinic timezone. Override per-deployment via REPORT_TIMEZONE env var.
 * Africa/Kampala (EAT, UTC+3) is the deployment target for dental-hospital.
 */
export const DEFAULT_REPORT_TIMEZONE =
  process.env.REPORT_TIMEZONE || 'Africa/Kampala';

/**
 * A resolved, timezone-safe date range with inclusive start and inclusive end.
 * Boundaries are computed in the clinic's local timezone, then converted back
 * to UTC instants for the database query. This guarantees that a "today" range
 * in the clinic is exactly the clinic's calendar day, not the server's.
 */
export interface ResolvedDateRange {
  startDate: Date;
  endDate: Date;
  timezone: string;
  /** Human-readable label like "Today (2026-06-22 EAT)" */
  label: string;
}

/**
 * Standard period presets supported by every report. Reports may also accept
 * a `customStart` + `customEnd` pair for arbitrary windows.
 */
export enum ReportPeriod {
  TODAY = 'TODAY',
  YESTERDAY = 'YESTERDAY',
  THIS_WEEK = 'THIS_WEEK',
  LAST_WEEK = 'LAST_WEEK',
  THIS_MONTH = 'THIS_MONTH',
  LAST_MONTH = 'LAST_MONTH',
  LAST_3_MONTHS = 'LAST_3_MONTHS',
  LAST_6_MONTHS = 'LAST_6_MONTHS',
  THIS_YEAR = 'THIS_YEAR',
  CUSTOM = 'CUSTOM',
}

/**
 * Resolve a {@link ReportPeriod} to inclusive start/end instants in the clinic's
 * timezone. The returned `startDate` is 00:00:00.000 local time on the first day,
 * and `endDate` is 23:59:59.999 local time on the last day. Both are converted
 * back to UTC `Date` objects so Prisma compares them correctly against
 * `timestamp with time zone` columns.
 */
export function resolveDateRange(
  period: ReportPeriod,
  options: {
    customStart?: string;
    customEnd?: string;
    timezone?: string;
    now?: Date;
  } = {},
): ResolvedDateRange {
  const tz = options.timezone || DEFAULT_REPORT_TIMEZONE;
  const now = options.now || new Date();
  const zonedNow = toZonedTime(now, tz);

  let startZoned: Date;
  let endZoned: Date;
  let label: string;

  switch (period) {
    case ReportPeriod.TODAY: {
      startZoned = startOfDay(zonedNow);
      endZoned = endOfDay(zonedNow);
      label = `Today (${formatInTimeZone(now, tz, 'yyyy-MM-dd')} ${tz.split('/').pop()})`;
      break;
    }
    case ReportPeriod.YESTERDAY: {
      const y = subDays(zonedNow, 1);
      startZoned = startOfDay(y);
      endZoned = endOfDay(y);
      label = `Yesterday (${format(startZoned, 'yyyy-MM-dd')})`;
      break;
    }
    case ReportPeriod.THIS_WEEK: {
      startZoned = startOfWeek(zonedNow, { weekStartsOn: 1 });
      endZoned = endOfWeek(zonedNow, { weekStartsOn: 1 });
      label = `This week (${format(startZoned, 'MMM d')} – ${format(endZoned, 'MMM d')})`;
      break;
    }
    case ReportPeriod.LAST_WEEK: {
      const lastWeekStart = startOfWeek(subDays(zonedNow, 7), { weekStartsOn: 1 });
      startZoned = lastWeekStart;
      endZoned = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
      label = `Last week (${format(startZoned, 'MMM d')} – ${format(endZoned, 'MMM d')})`;
      break;
    }
    case ReportPeriod.THIS_MONTH: {
      startZoned = startOfMonth(zonedNow);
      endZoned = endOfMonth(zonedNow);
      label = `This month (${format(startZoned, 'MMM yyyy')})`;
      break;
    }
    case ReportPeriod.LAST_MONTH: {
      const lm = subMonths(zonedNow, 1);
      startZoned = startOfMonth(lm);
      endZoned = endOfMonth(lm);
      label = `Last month (${format(startZoned, 'MMM yyyy')})`;
      break;
    }
    case ReportPeriod.LAST_3_MONTHS: {
      startZoned = subMonths(startOfMonth(zonedNow), 2);
      endZoned = endOfMonth(zonedNow);
      label = `Last 3 months (${format(startZoned, 'MMM yyyy')} – ${format(endZoned, 'MMM yyyy')})`;
      break;
    }
    case ReportPeriod.LAST_6_MONTHS: {
      startZoned = subMonths(startOfMonth(zonedNow), 5);
      endZoned = endOfMonth(zonedNow);
      label = `Last 6 months (${format(startZoned, 'MMM yyyy')} – ${format(endZoned, 'MMM yyyy')})`;
      break;
    }
    case ReportPeriod.THIS_YEAR: {
      startZoned = startOfYear(zonedNow);
      endZoned = endOfYear(zonedNow);
      label = `This year (${format(startZoned, 'yyyy')})`;
      break;
    }
    case ReportPeriod.CUSTOM: {
      if (!options.customStart || !options.customEnd) {
        throw new Error('CUSTOM period requires customStart and customEnd');
      }
      const customStartLocal = toZonedTime(new Date(options.customStart), tz);
      const customEndLocal = toZonedTime(new Date(options.customEnd), tz);
      startZoned = startOfDay(customStartLocal);
      endZoned = endOfDay(customEndLocal);
      label = `${format(startZoned, 'yyyy-MM-dd')} → ${format(endZoned, 'yyyy-MM-dd')}`;
      break;
    }
    default: {
      startZoned = startOfMonth(zonedNow);
      endZoned = endOfMonth(zonedNow);
      label = `This month (${format(startZoned, 'MMM yyyy')})`;
    }
  }

  const startDate = fromZonedTime(startZoned, tz);
  const endDate = fromZonedTime(endZoned, tz);

  return { startDate, endDate, timezone: tz, label };
}

/**
 * Build a Prisma `where.<field>` filter from a resolved range.
 * Use this everywhere instead of constructing `{ gte, lte }` manually.
 */
export function dateRangeWhere(
  field: string,
  range: ResolvedDateRange,
): Record<string, { gte: Date; lte: Date }> {
  return { [field]: { gte: range.startDate, lte: range.endDate } };
}

/**
 * Activity-axis override for productivity reports. Most KPIs should report
 * on the *work completion* timestamp (when the work was actually done), not
 * the *creation* timestamp (when the row was inserted). Reports that produce
 * productivity KPIs MUST default to COMPLETED and accept CREATED as an
 * explicit override for auditing.
 */
export enum ActivityAxis {
  COMPLETED = 'COMPLETED',
  CREATED = 'CREATED',
  SCHEDULED = 'SCHEDULED',
}

/**
 * Choose which timestamp field to filter on for a given entity + axis.
 * Returns the Prisma field name (camelCase).
 */
export function activityField(entity: 'visit' | 'session' | 'plan', axis: ActivityAxis): string {
  switch (entity) {
    case 'visit':
      return axis === ActivityAxis.CREATED
        ? 'createdAt'
        : axis === ActivityAxis.SCHEDULED
          ? 'scheduledAt'
          : 'completedAt';
    case 'session':
      return axis === ActivityAxis.CREATED
        ? 'createdAt'
        : axis === ActivityAxis.SCHEDULED
          ? 'scheduledDate'
          : 'performedDate';
    case 'plan':
      return axis === ActivityAxis.CREATED ? 'createdAt' : 'completedAt';
  }
}
