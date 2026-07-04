import { stringify } from 'csv-stringify/sync';
import { Readable } from 'stream';
import { Response } from 'express';

/**
 * Column spec for CSV export. Each column defines a header label and a
 * function to extract / format the value from each row. Use this instead of
 * `JSON.stringify` so that dates, decimals, and nulls render correctly.
 */
export interface CsvColumn<T> {
  /** Column header (first row). Must be unique within a column set. */
  header: string;
  /** Extract the cell value for a row. Return a primitive or a string. */
  get: (row: T) => string | number | boolean | null | undefined | Date;
}

/**
 * Render rows as a single CSV string (in-memory). Use for small exports
 * (≤ ~5k rows). For larger exports, prefer {@link streamCsv}.
 */
export function renderCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const records: string[][] = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => formatCell(c.get(row)))),
  ];
  return stringify(records, {
    quoted_string: true,
    bom: true, // Excel needs BOM to detect UTF-8 properly
  });
}

/**
 * Stream rows as CSV directly to the HTTP response. Use for large exports
 * (≤ {@link EXPORT_HARD_LIMIT} rows = 5000). The response is ended when the
 * stream finishes; backpressure is respected via Readable.
 */
export function streamCsv<T>(
  res: Response,
  rows: Iterable<T> | AsyncIterable<T>,
  columns: CsvColumn<T>[],
  options: { filename: string; bom?: boolean } = { filename: 'export.csv' },
): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(options.filename)}"`,
  );

  const iterable =
    (rows as any)[Symbol.asyncIterator] != null
      ? (rows as AsyncIterable<T>)
      : (async function* () {
          // Convert sync iterable to async, capped at MAX so we never blow memory
          const MAX = 5000;
          let count = 0;
          const arr = Array.from(rows as Iterable<T>);
          for (const r of arr) {
            if (count >= MAX) return;
            yield r;
            count++;
          }
        })();

  const bom = options.bom !== false ? '\uFEFF' : '';
  res.write(bom + columns.map((c) => c.header).join(',') + '\n');

  let rowCount = 0;
  const MAX = 5000;

  (async () => {
    try {
      for await (const row of iterable) {
        if (rowCount >= MAX) break;
        const line = columns.map((c) => formatCell(c.get(row))).join(',');
        res.write(line + '\n');
        rowCount++;
      }
      res.end();
    } catch (err) {
      // Cannot recover the response mid-stream; end with what we have
      res.end(`\n[STREAM ERROR] ${(err as Error).message}\n`);
    }
  })();
}

/**
 * Format a single cell value for CSV output. Dates become ISO dates, decimals
 * become plain numbers (no currency symbol), null/undefined become empty.
 */
function formatCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return v;
  // Object or array — JSON stringify as fallback
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Strip path-unsafe characters from a filename. Defense for `Content-Disposition`.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * Quick helper: build a filename from a report type + date range + format extension.
 */
export function defaultFilename(
  reportType: string,
  range: { startDate: Date; endDate: Date },
  ext: 'csv' | 'xlsx' | 'pdf',
): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${reportType}_${fmt(range.startDate)}_to_${fmt(range.endDate)}.${ext}`;
}
