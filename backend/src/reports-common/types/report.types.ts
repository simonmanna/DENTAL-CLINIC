/**
 * Filter shape accepted by every report service. Reports should build their
 * Prisma `where` clauses from this single shape so filters are consistent
 * across modules.
 *
 * All filter fields are optional. Reports should treat undefined as "no filter".
 */
export interface BaseReportFilter {
  /** Restrict to a single patient. */
  patientId?: string;

  /** Restrict to a single dentist / staff member. */
  dentistId?: string;

  /** Restrict to a single procedure. */
  procedureId?: string;

  /** Restrict to a single status value (enum-specific to the report). */
  status?: string;

  /** Free-text search across reportable fields. */
  search?: string;
}

/**
 * Pagination shape accepted by every list-style report. Reports should cap
 * `limit` at {@link MAX_REPORT_LIMIT} (typically 500) and require `page >= 1`.
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export const DEFAULT_REPORT_LIMIT = 50;
export const MAX_REPORT_LIMIT = 500;
export const EXPORT_HARD_LIMIT = 5000;

/**
 * Apply a `take` / `skip` translation from pagination params with safety caps.
 * Always returns valid non-negative numbers.
 */
export function resolvePagination(p: PaginationParams | undefined): {
  page: number;
  limit: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, Math.floor(p?.page ?? 1));
  const limit = Math.min(
    MAX_REPORT_LIMIT,
    Math.max(1, Math.floor(p?.limit ?? DEFAULT_REPORT_LIMIT)),
  );
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/**
 * Build a `{ data, pagination }` envelope from rows + total + pagination params.
 * Standardizes pagination metadata across every list report.
 */
export function paginatedEnvelope<T>(
  rows: T[],
  total: number,
  pagination: { page: number; limit: number },
): {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} {
  return {
    data: rows,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
    },
  };
}
