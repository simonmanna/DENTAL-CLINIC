import PDFDocument = require('pdfkit');
import { Response } from 'express';
import { Readable } from 'stream';

/**
 * Column spec for PDF export. PDFs render tabular data with fixed column
 * widths; columns beyond the page width are truncated. Keep reports ≤ 8 columns
 * or use landscape orientation.
 */
export interface PdfColumn<T> {
  header: string;
  width: number; // points
  get: (row: T) => string | number | boolean | null | undefined | Date;
}

/**
 * Render rows as a PDF document and stream it to the HTTP response.
 * Document structure:
 *   Header: clinic name + report title + period + generated-at
 *   Body: tabular data with header row + alternating row backgrounds
 *   Footer: page numbers
 *
 * Max rows is hard-capped at 1000 to prevent 100-page PDFs from a runaway
 * query. Callers should paginate before invoking.
 */
export function streamPdf<T>(
  res: Response,
  rows: T[],
  columns: PdfColumn<T>[],
  options: {
    filename: string;
    title: string;
    periodLabel?: string;
    clinicName?: string;
    orientation?: 'portrait' | 'landscape';
  },
): void {
  const clinicName = options.clinicName ?? 'Dental Hospital';
  const orientation = options.orientation ?? 'portrait';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(options.filename)}"`,
  );

  const doc = new PDFDocument({
    size: 'A4',
    layout: orientation,
    margin: 36,
    info: {
      Title: options.title,
      Author: clinicName,
      CreationDate: new Date(),
    },
  });

  doc.pipe(res);

  // ── Header ────────────────────────────────────────────────────────────────
  doc
    .fontSize(16)
    .fillColor('#333')
    .text(clinicName, { align: 'left' })
    .fontSize(13)
    .text(options.title, { align: 'left' })
    .fontSize(9)
    .fillColor('#666')
    .text(`Period: ${options.periodLabel ?? 'N/A'}`, { align: 'left' })
    .text(`Generated: ${new Date().toISOString()}`, { align: 'left' })
    .moveDown(0.7);

  // ── Table ─────────────────────────────────────────────────────────────────
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalRequestedWidth = columns.reduce((s, c) => s + c.width, 0);
  const scale = pageWidth / totalRequestedWidth;
  const scaledCols = columns.map((c) => ({ ...c, width: c.width * scale }));

  // Header row
  let y = doc.y;
  const headerHeight = 18;
  const rowHeight = 14;
  let x = doc.page.margins.left;

  doc.fontSize(8).fillColor('#000');
  doc.rect(doc.page.margins.left, y, pageWidth, headerHeight).fill('#e7e6e6');
  doc.fillColor('#000');
  x = doc.page.margins.left;
  for (const col of scaledCols) {
    doc.text(col.header, x + 4, y + 4, {
      width: col.width - 8,
      height: headerHeight - 4,
      ellipsis: true,
    });
    x += col.width;
  }
  y += headerHeight;

  // Data rows
  const MAX_ROWS = 1000;
  const dataRows = rows.slice(0, MAX_ROWS);
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    if (i % 2 === 1) {
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#fafafa');
      doc.fillColor('#000');
    }
    x = doc.page.margins.left;
    for (const col of scaledCols) {
      doc.fontSize(7);
      doc.text(formatCell(col.get(row)), x + 4, y + 3, {
        width: col.width - 8,
        height: rowHeight - 3,
        ellipsis: true,
      });
      x += col.width;
    }
    y += rowHeight;
  }

  if (rows.length > MAX_ROWS) {
    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .fillColor('#900')
      .text(
        `[Truncated] Showing first ${MAX_ROWS} of ${rows.length} rows. Narrow your filters for the full export.`,
      );
  }

  // ── Footer (page numbers) ────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor('#666')
      .text(
        `Page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 12,
        { width: pageWidth, align: 'center' },
      );
  }

  doc.end();
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
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