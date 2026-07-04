import * as ExcelJS from 'exceljs';
import { Response } from 'express';

/**
 * Column spec for Excel export. Each column defines a header label, a width,
 * and a function to extract the cell value. Use this instead of letting Excel
 * auto-detect types so dates, decimals, and booleans render correctly.
 */
export interface ExcelColumn<T> {
  header: string;
  width?: number;
  get: (row: T) => string | number | boolean | null | undefined | Date;
}

/**
 * Render rows as an Excel workbook and stream it to the HTTP response.
 * Workbook structure:
 *   Sheet 1: "Data" — the rows
 *   Sheet 2: "Summary" — optional summary statistics
 *   Sheet 3: "Filters" — filters used to generate the report
 */
export async function streamExcel<T>(
  res: Response,
  rows: T[],
  columns: ExcelColumn<T>[],
  options: {
    filename: string;
    sheetName?: string;
    title?: string;
    periodLabel?: string;
    filters?: Record<string, unknown>;
    summary?: Array<{ label: string; value: string | number }>;
  },
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dental Hospital Reports';
  wb.created = new Date();

  // ── Sheet 1: Data ────────────────────────────────────────────────────────
  const dataSheet = wb.addWorksheet(options.sheetName ?? 'Data', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  dataSheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.width ?? Math.max(12, c.header.length + 2),
  }));

  // Header row styling
  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E6E6' },
  };
  headerRow.commit();

  // Data rows
  for (const row of rows) {
    const data: Record<string, unknown> = {};
    for (const col of columns) {
      data[col.header] = formatCell(col.get(row));
    }
    dataSheet.addRow(data);
  }

  // Auto-filter on header row
  if (rows.length > 0) {
    dataSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  // ── Sheet 2: Summary (optional) ──────────────────────────────────────────
  if (options.summary && options.summary.length > 0) {
    const summarySheet = wb.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'label', width: 32 },
      { header: 'Value', key: 'value', width: 32 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).commit();
    for (const s of options.summary) summarySheet.addRow(s);
  }

  // ── Sheet 3: Filters (optional) ─────────────────────────────────────────
  if (options.filters && Object.keys(options.filters).length > 0) {
    const filtersSheet = wb.addWorksheet('Filters');
    filtersSheet.columns = [
      { header: 'Filter', key: 'k', width: 24 },
      { header: 'Value', key: 'v', width: 48 },
    ];
    filtersSheet.getRow(1).font = { bold: true };
    filtersSheet.getRow(1).commit();
    for (const [k, v] of Object.entries(options.filters)) {
      filtersSheet.addRow({ k, v: String(v ?? '') });
    }
    // Add the report title + period as the first rows
    if (options.title) filtersSheet.spliceRows(1, 0, ['Report', options.title]);
    if (options.periodLabel)
      filtersSheet.spliceRows(1, 0, ['Period', options.periodLabel]);
  }

  // ── Stream to response ──────────────────────────────────────────────────
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(options.filename)}"`,
  );
  await wb.xlsx.write(res);
  res.end();
}

/**
 * Format a single cell value for Excel. ExcelJS auto-detects types but we
 * normalize here so dates are real Date objects (not strings) and decimals
 * stay numbers.
 */
function formatCell(v: unknown): string | number | boolean | Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}