// Single source of truth for human-readable document numbers.
//
// Format:  PREFIX-YY-NNNN   e.g.  TP-26-0001, INV-26-0042, VIS-26-0125
//
// Backed by the PostgreSQL `generate_document_number(prefix)` function (see
// migration 20260530000000_document_numbering). That function does an atomic
// INSERT ... ON CONFLICT DO UPDATE ... RETURNING against `document_counters`,
// which row-locks the (prefix, year) row — so concurrent callers serialize and
// can never receive the same number. No COUNT(*), resets yearly, gap-tolerant
// (a rolled-back tx "wastes" a number, which is fine and expected).
//
// ALWAYS prefer passing the surrounding `tx` so the number is generated in the
// same transaction as the row it identifies; that way a rollback unwinds the
// counter increment too.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

export type DocPrefix =
  | 'PAT'   // Patient
  | 'APT'   // Appointment
  | 'VIS'   // Visit
  | 'TP'    // Treatment Plan
  | 'INV'   // Invoice
  | 'RCPT'  // Receipt
  | 'RX'    // Prescription
  | 'PAY'   // Payment
  | 'LE'    // Ledger Entry
  | 'SE'    // Session Edit
  | 'EXP'   // Expense
  | 'PO';   // Purchase Order

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next document number for `prefix`, e.g. next('TP') -> 'TP-26-0001'.
   * Pass `tx` when generating inside a transaction so the counter rolls back with it.
   */
  async next(prefix: DocPrefix | string, tx?: Db): Promise<string> {
    const db = tx ?? this.prisma;
    const rows = await db.$queryRaw<Array<{ code: string }>>`
      SELECT generate_document_number(${prefix}) AS code
    `;
    const code = rows?.[0]?.code;
    if (!code) {
      throw new Error(
        `DocumentNumberService: failed to generate a number for prefix "${prefix}"`,
      );
    }
    return code;
  }
}
