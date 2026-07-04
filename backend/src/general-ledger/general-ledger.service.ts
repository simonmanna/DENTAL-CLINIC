// src/general-ledger/general-ledger.service.ts
//
// The double-entry posting engine. Every financial event becomes a balanced
// JournalEntry (Σdebit == Σcredit, in base currency). Entries are immutable:
// a "void" posts a separate, linked reversing entry rather than mutating rows.
//
// Designed to be called either standalone or INSIDE another module's Prisma
// transaction (pass `tx`), so accounting posts atomically with the business
// event that triggered it — an invoice can never activate without its journal
// entry, and vice-versa.

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  JournalStatus,
  LedgerAccountType,
  NormalBalance,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberService } from '../common/document-number/document-number.service';
import { M, Money } from '../common/money/money';
import {
  CANONICAL_ACCOUNTS,
  canonicalByKey,
  canonicalByCode,
  defaultNormalBalance,
  GL,
} from './gl-accounts';
import {
  CreateLedgerAccountDto,
  UpdateLedgerAccountDto,
} from './dto/account.dto';

type Db = PrismaService | Prisma.TransactionClient;

/** One leg of a journal entry, supplied by callers in base currency. */
export interface PostLine {
  /**
   * Reference the target account by ONE of: its raw `accountId` (used when a
   * caller already holds the LedgerAccount id, e.g. an expense category's linked
   * account); its stable `systemKey` (preferred for internal/automatic postings —
   * survives code renames); or its user-facing `code` (manual journal entries
   * where the user picked an account). Exactly one should be set.
   */
  accountId?: string; // a LedgerAccount.id
  key?: string; // e.g. GL.ACCOUNTS_RECEIVABLE
  code?: string; // e.g. "1100"
  debit?: Money | number | string;
  credit?: Money | number | string;
  /** Original transaction-currency snapshot (audit only). */
  currency?: string;
  fxAmount?: Money | number | string;
  fxRate?: Money | number | string;
  patientId?: string | null;
  memo?: string | null;
}

export interface PostArgs {
  memo: string;
  lines: PostLine[];
  date?: Date;
  sourceType?: string;
  sourceId?: string;
  patientId?: string | null;
  postedById?: string | null;
  /** Skip posting entirely when every line nets to zero (no-op events). */
  skipIfZero?: boolean;
}

@Injectable()
export class GeneralLedgerService implements OnModuleInit {
  private readonly logger = new Logger(GeneralLedgerService.name);

  // code → LedgerAccount.id, populated once core accounts are ensured.
  private readonly accountIdCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly docNum: DocumentNumberService,
  ) {}

  async onModuleInit() {
    // Self-heal: make sure the canonical chart of accounts exists so posting
    // can never fail because the seed wasn't run. Idempotent.
    try {
      await this.ensureCoreAccounts();
    } catch (e) {
      // Don't crash app boot on a transient DB hiccup; posting will re-ensure.
      this.logger.warn(
        `Could not ensure core ledger accounts at startup: ${(e as Error).message}`,
      );
    }
  }

  // ── Chart of accounts ──────────────────────────────────────────────────────

  /**
   * Ensure every canonical account exists, keyed by its stable `systemKey`.
   * Safe to run repeatedly and self-heals legacy rows that pre-date systemKey
   * (matches them by their original seed code and backfills the key) WITHOUT
   * touching any code/name an accountant may have since edited.
   */
  async ensureCoreAccounts() {
    for (const a of CANONICAL_ACCOUNTS) {
      // 1. Already migrated → found by systemKey.
      let row = await this.prisma.ledgerAccount.findUnique({
        where: { systemKey: a.key },
        select: { id: true, systemKey: true },
      });

      // 2. Legacy row seeded before systemKey existed → match by original code,
      //    backfill the key (keep whatever code/name it now has).
      if (!row) {
        const legacy = await this.prisma.ledgerAccount.findUnique({
          where: { code: a.code },
          select: { id: true, systemKey: true },
        });
        if (legacy) {
          row = await this.prisma.ledgerAccount.update({
            where: { id: legacy.id },
            data: { systemKey: a.key, isSystem: true },
            select: { id: true, systemKey: true },
          });
        }
      }

      // 3. Brand-new install → create it.
      if (!row) {
        row = await this.prisma.ledgerAccount.create({
          data: {
            systemKey: a.key,
            code: a.code,
            name: a.name,
            type: a.type,
            normalBalance: a.normalBalance,
            description: a.description ?? null,
            isSystem: true,
          },
          select: { id: true, systemKey: true },
        });
      }

      this.accountIdCache.set(`key:${a.key}`, row.id);
    }
  }

  async listAccounts() {
    const accounts = await this.prisma.ledgerAccount.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { lines: true } } },
    });
    // Surface a flat `lineCount` so the UI can decide which fields are editable.
    return accounts.map(({ _count, ...a }) => ({
      ...a,
      lineCount: _count.lines,
      hasPostings: _count.lines > 0,
    }));
  }

  /** Create a user-defined ledger account. */
  async createAccount(dto: CreateLedgerAccountDto) {
    const existing = await this.prisma.ledgerAccount.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Account code "${dto.code}" already exists`);
    }
    if (dto.parentId) await this.assertParentExists(dto.parentId);

    const account = await this.prisma.ledgerAccount.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        normalBalance: dto.normalBalance ?? defaultNormalBalance(dto.type),
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        isSystem: false,
      },
    });
    this.accountIdCache.clear(); // codes may have shifted; stay safe
    return account;
  }

  /**
   * Edit an account. Deliberately permissive — the only hard protection is on
   * the one operation that corrupts historical statements: changing TYPE once
   * the account has transactions.
   *
   *   • Code / Name / Description / Parent / Active  → always editable
   *     (Code is safe to rename: journal lines reference the account by id, and
   *      the posting engine resolves system accounts by `systemKey`, not code.)
   *   • Type / Normal Balance  → locked once the account has postings, and
   *     always locked for system accounts (their type is structural).
   *
   * Code / type changes are written to the audit log.
   */
  async updateAccount(
    id: string,
    dto: UpdateLedgerAccountDto,
    actor?: { id?: string | null; email?: string | null; role?: string | null },
  ) {
    const acc = await this.prisma.ledgerAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Ledger account not found');

    const hasPostings =
      (await this.prisma.journalLine.count({ where: { accountId: id } })) > 0;

    const data: Prisma.LedgerAccountUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('An account cannot be its own parent');
      }
      if (dto.parentId) await this.assertParentExists(dto.parentId);
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }

    // ── Type change — THE protected operation ────────────────────────────────
    if (dto.type !== undefined && dto.type !== acc.type) {
      if (acc.isSystem) {
        throw new BadRequestException(
          'The type of a system account cannot be changed.',
        );
      }
      if (hasPostings) {
        throw new BadRequestException(
          'Cannot change an account type once it has transactions — it would ' +
            'corrupt historical financial statements. Create a new account instead.',
        );
      }
      data.type = dto.type;
      data.normalBalance = defaultNormalBalance(dto.type);
    }

    // ── Code change — always allowed, just keep it unique ─────────────────────
    if (dto.code !== undefined && dto.code !== acc.code) {
      const clash = await this.prisma.ledgerAccount.findFirst({
        where: { code: dto.code, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        throw new BadRequestException(`Account code "${dto.code}" already exists`);
      }
      data.code = dto.code;
    }

    const updated = await this.prisma.ledgerAccount.update({
      where: { id },
      data,
    });
    this.accountIdCache.clear(); // a renamed code invalidates the code→id cache

    await this.auditAccountChange(acc, updated, actor);
    return updated;
  }

  /** Best-effort audit row for a chart-of-accounts edit (never blocks the edit). */
  private async auditAccountChange(
    before: { code: string; name: string; type: string; description: string | null; isActive: boolean },
    after: { code: string; name: string; type: string; description: string | null; isActive: boolean },
    actor?: { id?: string | null; email?: string | null },
  ) {
    const fields = ['code', 'name', 'type', 'description', 'isActive'] as const;
    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = {};
    for (const f of fields) {
      if (before[f] !== after[f]) {
        oldData[f] = before[f];
        newData[f] = after[f];
      }
    }
    if (Object.keys(newData).length === 0) return;

    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor?.id ?? null,
          userName: actor?.email ?? null,
          action: 'UPDATE',
          module: 'GENERAL_LEDGER',
          entityType: 'LedgerAccount',
          recordId: after.code,
          oldData: oldData as Prisma.InputJsonValue,
          newData: newData as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      this.logger.warn(`Account audit log failed: ${(e as Error).message}`);
    }
  }

  /** Delete a user account that has never been posted to. */
  async deleteAccount(id: string) {
    const acc = await this.prisma.ledgerAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Ledger account not found');
    if (acc.isSystem) {
      throw new BadRequestException(
        'System accounts cannot be deleted. Deactivate it instead.',
      );
    }
    const postings = await this.prisma.journalLine.count({
      where: { accountId: id },
    });
    if (postings > 0) {
      throw new BadRequestException(
        'This account has journal postings and cannot be deleted. Deactivate it instead.',
      );
    }
    const children = await this.prisma.ledgerAccount.count({
      where: { parentId: id },
    });
    if (children > 0) {
      throw new BadRequestException(
        'Reassign or remove the sub-accounts before deleting this account.',
      );
    }
    await this.prisma.ledgerAccount.delete({ where: { id } });
    this.accountIdCache.clear();
    return { ok: true };
  }

  private async assertParentExists(parentId: string) {
    const parent = await this.prisma.ledgerAccount.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException('Parent account not found');
  }

  // ── Posting ────────────────────────────────────────────────────────────────

  /**
   * Post a balanced journal entry. Throws if debits ≠ credits.
   * Returns the created entry id, or null when `skipIfZero` and the entry is empty.
   */
  async post(args: PostArgs, tx?: Db): Promise<{ id: string; entryNumber: string } | null> {
    const db = tx ?? this.prisma;

    // ── 1. Normalise + validate the lines ────────────────────────────────────
    let totalDebit = M.zero();
    let totalCredit = M.zero();

    const normalised = args.lines.map((l) => {
      const debit = M.money(l.debit ?? 0);
      const credit = M.money(l.credit ?? 0);

      const ref = l.key ?? l.code ?? '?';
      if (M.isNegative(debit) || M.isNegative(credit)) {
        throw new BadRequestException(
          `Journal line for account ${ref} has a negative amount`,
        );
      }
      // NOTE: strict gt(0) — decimal.js treats positive-signed zero as "positive",
      // so isPositive(0) is true; M.gt(x, 0) is the correct "non-zero" test.
      if (M.gt(debit, 0) && M.gt(credit, 0)) {
        throw new BadRequestException(
          `Journal line for account ${ref} cannot be both a debit and a credit`,
        );
      }

      totalDebit = M.add(totalDebit, debit);
      totalCredit = M.add(totalCredit, credit);
      return { ...l, debit, credit };
    });

    totalDebit = M.money(totalDebit);
    totalCredit = M.money(totalCredit);

    // No-op entry (everything zero).
    if (M.isZero(totalDebit) && M.isZero(totalCredit)) {
      if (args.skipIfZero) return null;
      throw new BadRequestException('Cannot post a journal entry with no amounts');
    }

    // THE invariant that makes this double-entry.
    if (!M.eq(totalDebit, totalCredit)) {
      throw new BadRequestException(
        `Unbalanced journal entry: debits ${M.str(totalDebit)} ≠ credits ${M.str(
          totalCredit,
        )} (${args.memo})`,
      );
    }

    // ── 2. Resolve account ids ───────────────────────────────────────────────
    const linesWithAccounts = await Promise.all(
      normalised.map(async (l) => ({
        accountId: await this.resolveLineAccountId(db, l),
        debit: M.str(l.debit),
        credit: M.str(l.credit),
        currency: l.currency ?? null,
        fxAmount: l.fxAmount != null ? M.str(M.money(l.fxAmount)) : null,
        fxRate: l.fxRate != null ? M.of(l.fxRate).toString() : null,
        patientId: l.patientId ?? null,
        memo: l.memo ?? null,
      })),
    );

    // ── 3. Create the entry + lines ──────────────────────────────────────────
    const entryNumber = await this.docNum.next('JE', tx);
    const entry = await db.journalEntry.create({
      data: {
        entryNumber,
        date: args.date ?? new Date(),
        memo: args.memo,
        sourceType: args.sourceType ?? null,
        sourceId: args.sourceId ?? null,
        patientId: args.patientId ?? null,
        postedById: args.postedById ?? null,
        status: JournalStatus.POSTED,
        lines: { create: linesWithAccounts },
      },
      select: { id: true, entryNumber: true },
    });

    return entry;
  }

  // ── Optional auto-posting (Odoo-style: on by default, never mandatory) ───────
  //
  // Accounting is enabled by default and posts "behind the scenes", but a clinic
  // that doesn't want to run its books can switch it off (ClinicSettings key
  // `glAutoPostingEnabled` = "false"/"0"/"off") and every clinical & billing
  // operation keeps working with zero journal entries. Every AUTOMATIC hook
  // should call `safePost()` instead of `post()`:
  //   • when posting is disabled  → it no-ops (returns null), so accounting is
  //     genuinely optional and the default chart of accounts is simply ignored;
  //   • when a posting would throw → it logs and swallows, so a book-keeping
  //     problem can never block the underlying clinical/billing action.
  // Manual journal entries from the GL UI still use `post()` and surface errors.
  private static readonly AUTO_POST_KEY = 'glAutoPostingEnabled';
  private static readonly AUTO_POST_TTL_MS = 30_000;
  private autoPostCache: { value: boolean; at: number } | null = null;

  /** Whether automatic GL posting is enabled. Default ON; cached briefly. */
  async isAutoPostingEnabled(): Promise<boolean> {
    const now = Date.now();
    if (
      this.autoPostCache &&
      now - this.autoPostCache.at < GeneralLedgerService.AUTO_POST_TTL_MS
    ) {
      return this.autoPostCache.value;
    }
    let enabled = true; // default ON — works out of the box, no setup needed
    try {
      const row = await this.prisma.clinicSettings.findUnique({
        where: { key: GeneralLedgerService.AUTO_POST_KEY },
        select: { value: true },
      });
      if (row) {
        const v = row.value.trim().toLowerCase();
        enabled = !(v === 'false' || v === '0' || v === 'off' || v === 'no');
      }
    } catch {
      // settings table unreachable → keep the default (ON)
    }
    this.autoPostCache = { value: enabled, at: now };
    return enabled;
  }

  /** Clear the cached auto-posting flag (call after toggling the setting). */
  invalidateAutoPostingCache() {
    this.autoPostCache = null;
  }

  /**
   * Turn automatic double-entry posting on/off. Persists the `glAutoPostingEnabled`
   * ClinicSettings flag and invalidates the cache so the change takes effect
   * immediately (no 30s stale window). Existing journal entries are untouched —
   * this only governs whether FUTURE business events post to the ledger.
   */
  async setAutoPostingEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    await this.prisma.clinicSettings.upsert({
      where: { key: GeneralLedgerService.AUTO_POST_KEY },
      create: {
        key: GeneralLedgerService.AUTO_POST_KEY,
        value: enabled ? 'true' : 'false',
        description: 'Automatic double-entry GL posting (on by default)',
      },
      update: { value: enabled ? 'true' : 'false' },
    });
    this.invalidateAutoPostingCache();
    this.autoPostCache = { value: enabled, at: Date.now() };
    return { enabled };
  }

  /**
   * Best-effort, optional version of {@link post}. No-ops when auto-posting is
   * disabled and never throws — use it for every automatic hook so accounting
   * is optional and can never break the business operation that triggered it.
   */
  async safePost(
    args: PostArgs,
    tx?: Db,
  ): Promise<{ id: string; entryNumber: string } | null> {
    if (!(await this.isAutoPostingEnabled())) return null;
    try {
      return await this.post(args, tx);
    } catch (e) {
      this.logger.error(
        `Auto GL posting skipped (non-blocking) for "${args.memo}": ${
          (e as Error).message
        }`,
      );
      return null;
    }
  }

  /** Best-effort reversal — optional + non-blocking, mirrors safePost. */
  async safeReverseBySource(
    sourceType: string,
    sourceId: string,
    reason: string,
    reversedById?: string | null,
    tx?: Db,
  ) {
    if (!(await this.isAutoPostingEnabled())) return [];
    try {
      return await this.reverseBySource(
        sourceType,
        sourceId,
        reason,
        reversedById,
        tx,
      );
    } catch (e) {
      this.logger.error(
        `Auto GL reversal skipped (non-blocking) for ${sourceType}/${sourceId}: ${
          (e as Error).message
        }`,
      );
      return [];
    }
  }

  // ── Reversal (void = post the opposite, never delete) ───────────────────────

  /**
   * Reverse a single posted entry: creates a new entry with debit/credit swapped,
   * links the two, and flips the original to VOID. Idempotent-ish: throws if the
   * entry is already voided or already reversed.
   */
  async reverseEntry(
    entryId: string,
    reason: string,
    reversedById?: string | null,
    tx?: Db,
  ): Promise<{ id: string; entryNumber: string }> {
    const db = tx ?? this.prisma;

    const original = await db.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true, reversedBy: { select: { id: true } } },
    });
    if (!original) throw new NotFoundException('Journal entry not found');
    if (original.status === JournalStatus.VOID) {
      throw new BadRequestException('Journal entry is already voided');
    }
    if (original.reversedBy) {
      throw new BadRequestException('Journal entry has already been reversed');
    }

    const entryNumber = await this.docNum.next('JE', tx);
    const reversal = await db.journalEntry.create({
      data: {
        entryNumber,
        date: new Date(),
        memo: `Reversal of ${original.entryNumber}: ${reason}`,
        sourceType: 'REVERSAL',
        sourceId: original.sourceId ?? original.id,
        patientId: original.patientId,
        postedById: reversedById ?? null,
        status: JournalStatus.POSTED,
        reversesId: original.id,
        lines: {
          // Swap sides — a debit becomes a credit and vice-versa.
          create: original.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
            currency: l.currency,
            fxAmount: l.fxAmount,
            fxRate: l.fxRate,
            patientId: l.patientId,
            memo: l.memo,
          })),
        },
      },
      select: { id: true, entryNumber: true },
    });

    await db.journalEntry.update({
      where: { id: original.id },
      data: { status: JournalStatus.VOID, voidReason: reason },
    });

    return reversal;
  }

  /**
   * Reverse every POSTED entry tied to a source document (e.g. all entries for an
   * invoice when it is voided). Returns the reversing entries created.
   */
  async reverseBySource(
    sourceType: string,
    sourceId: string,
    reason: string,
    reversedById?: string | null,
    tx?: Db,
  ) {
    const db = tx ?? this.prisma;
    const entries = await db.journalEntry.findMany({
      where: { sourceType, sourceId, status: JournalStatus.POSTED },
      select: { id: true },
    });

    const reversals: Array<{ id: string; entryNumber: string }> = [];
    for (const e of entries) {
      reversals.push(await this.reverseEntry(e.id, reason, reversedById, tx));
    }
    return reversals;
  }

  // ── Reads ───────────────────────────────────────────────────────────────────

  async getJournal(params: {
    page?: number;
    limit?: number;
    sourceType?: string;
    sourceId?: string;
    patientId?: string;
    status?: JournalStatus;
    from?: Date;
    to?: Date;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));

    const where: Prisma.JournalEntryWhereInput = {};
    if (params.sourceType) where.sourceType = params.sourceType;
    if (params.sourceId) where.sourceId = params.sourceId;
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.date = {};
      if (params.from) where.date.gte = params.from;
      if (params.to) where.date.lte = params.to;
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          lines: { include: { account: { select: { code: true, name: true } } } },
        },
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getEntry(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: { include: { account: { select: { code: true, name: true, type: true } } } },
        reverses: { select: { id: true, entryNumber: true } },
        reversedBy: { select: { id: true, entryNumber: true } },
      },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  /**
   * Trial balance: per-account net debit/credit over POSTED entries.
   * The grand totals MUST be equal — that's the integrity proof of the books.
   */
  async trialBalance(asOf?: Date) {
    const lines = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: JournalStatus.POSTED,
          ...(asOf ? { date: { lte: asOf } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await this.prisma.ledgerAccount.findMany({
      orderBy: { code: 'asc' },
    });
    const sumByAccount = new Map(lines.map((l) => [l.accountId, l._sum]));

    let totalDebit = M.zero();
    let totalCredit = M.zero();

    const rows = accounts.map((acc) => {
      const s = sumByAccount.get(acc.id);
      const debit = M.money(s?.debit ?? 0);
      const credit = M.money(s?.credit ?? 0);
      // Net balance on the account's normal side.
      const net = M.sub(debit, credit);
      const onDebitSide = acc.normalBalance === 'DEBIT';
      const balance = onDebitSide ? net : M.neg(net);

      totalDebit = M.add(totalDebit, debit);
      totalCredit = M.add(totalCredit, credit);

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        normalBalance: acc.normalBalance,
        debit: M.str(debit),
        credit: M.str(credit),
        balance: M.str(balance),
      };
    });

    return {
      asOf: asOf ?? new Date(),
      rows,
      totals: {
        debit: M.str(M.money(totalDebit)),
        credit: M.str(M.money(totalCredit)),
        balanced: M.eq(M.money(totalDebit), M.money(totalCredit)),
      },
    };
  }

  /**
   * Account ledger ("T-account"): every posting to one account in date order
   * with a running balance, plus opening (before `from`) and closing totals.
   */
  async accountLedger(params: {
    code: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const account = await this.prisma.ledgerAccount.findUnique({
      where: { code: params.code },
    });
    if (!account) throw new NotFoundException('Ledger account not found');

    const onDebitSide = account.normalBalance === NormalBalance.DEBIT;
    const signed = (debit: Money, credit: Money) =>
      onDebitSide ? M.sub(debit, credit) : M.sub(credit, debit);

    // Opening balance = net of everything strictly before `from`.
    let opening = M.zero();
    if (params.from) {
      const prior = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: {
            status: JournalStatus.POSTED,
            date: { lt: params.from },
          },
        },
        _sum: { debit: true, credit: true },
      });
      opening = signed(M.money(prior._sum.debit ?? 0), M.money(prior._sum.credit ?? 0));
    }

    const dateWhere: Prisma.DateTimeFilter = {};
    if (params.from) dateWhere.gte = params.from;
    if (params.to) dateWhere.lte = params.to;

    const lineWhere: Prisma.JournalLineWhereInput = {
      accountId: account.id,
      journalEntry: {
        status: JournalStatus.POSTED,
        ...(params.from || params.to ? { date: dateWhere } : {}),
      },
    };

    // Fetch the whole period in order so the running balance is exact, then page
    // in memory. Capped to keep the response bounded.
    const all = await this.prisma.journalLine.findMany({
      where: lineWhere,
      take: 5000,
      orderBy: [{ journalEntry: { date: 'asc' } }, { createdAt: 'asc' }],
      include: {
        journalEntry: {
          select: { entryNumber: true, date: true, memo: true, sourceType: true, status: true },
        },
      },
    });

    let running = opening;
    const allRows = all.map((l) => {
      const debit = M.money(l.debit);
      const credit = M.money(l.credit);
      running = M.add(running, signed(debit, credit));
      return {
        id: l.id,
        date: l.journalEntry.date,
        entryNumber: l.journalEntry.entryNumber,
        memo: l.memo ?? l.journalEntry.memo,
        sourceType: l.journalEntry.sourceType,
        debit: M.str(debit),
        credit: M.str(credit),
        balance: M.str(M.money(running)),
      };
    });
    const closing = running;

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(500, Math.max(1, params.limit ?? 50));
    const start = (page - 1) * limit;
    const rows = allRows.slice(start, start + limit);

    return {
      account: {
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
      },
      opening: M.str(M.money(opening)),
      closing: M.str(M.money(closing)),
      rows,
      meta: {
        total: allRows.length,
        page,
        limit,
        totalPages: Math.ceil(allRows.length / limit) || 1,
      },
    };
  }

  /** Income Statement (P&L) for a period: revenue − expenses = net income. */
  async incomeStatement(from?: Date, to?: Date) {
    const balances = await this.balancesByType({ from, to });

    const income = balances.filter((b) => b.type === LedgerAccountType.INCOME);
    const expense = balances.filter((b) => b.type === LedgerAccountType.EXPENSE);

    const totalIncome = M.sum(income.map((b) => b.balance));
    const totalExpense = M.sum(expense.map((b) => b.balance));
    const netIncome = M.sub(totalIncome, totalExpense);

    return {
      period: { from: from ?? null, to: to ?? null },
      income: income.map(this.toReportRow),
      expense: expense.map(this.toReportRow),
      totals: {
        income: M.str(M.money(totalIncome)),
        expense: M.str(M.money(totalExpense)),
        netIncome: M.str(M.money(netIncome)),
      },
    };
  }

  /** Balance Sheet as of a date: Assets = Liabilities + Equity (+ net income). */
  async balanceSheet(asOf?: Date) {
    const balances = await this.balancesByType({ asOf });

    const assets = balances.filter((b) => b.type === LedgerAccountType.ASSET);
    const liabilities = balances.filter(
      (b) => b.type === LedgerAccountType.LIABILITY,
    );
    const equity = balances.filter((b) => b.type === LedgerAccountType.EQUITY);

    const totalAssets = M.sum(assets.map((b) => b.balance));
    const totalLiabilities = M.sum(liabilities.map((b) => b.balance));
    const baseEquity = M.sum(equity.map((b) => b.balance));

    // Income not yet closed to equity (retained earnings for the period).
    const income = M.sum(
      balances
        .filter((b) => b.type === LedgerAccountType.INCOME)
        .map((b) => b.balance),
    );
    const expense = M.sum(
      balances
        .filter((b) => b.type === LedgerAccountType.EXPENSE)
        .map((b) => b.balance),
    );
    const retainedEarnings = M.sub(income, expense);
    const totalEquity = M.add(baseEquity, retainedEarnings);

    return {
      asOf: asOf ?? new Date(),
      assets: assets.map(this.toReportRow),
      liabilities: liabilities.map(this.toReportRow),
      equity: equity.map(this.toReportRow),
      totals: {
        assets: M.str(M.money(totalAssets)),
        liabilities: M.str(M.money(totalLiabilities)),
        equity: M.str(M.money(baseEquity)),
        retainedEarnings: M.str(M.money(retainedEarnings)),
        totalEquityAndRetained: M.str(M.money(totalEquity)),
        liabilitiesPlusEquity: M.str(M.money(M.add(totalLiabilities, totalEquity))),
        balanced: M.eq(
          M.money(totalAssets),
          M.money(M.add(totalLiabilities, totalEquity)),
        ),
      },
    };
  }

  private toReportRow = (b: {
    code: string;
    name: string;
    type: LedgerAccountType;
    balance: Money;
  }) => ({
    code: b.code,
    name: b.name,
    type: b.type,
    balance: M.str(M.money(b.balance)),
  });

  /**
   * Net balance per account on its normal side, optionally constrained to a
   * period (`from`/`to`) or a point in time (`asOf`). Used by the statements.
   */
  private async balancesByType(opts: { from?: Date; to?: Date; asOf?: Date }) {
    const date: Prisma.DateTimeFilter = {};
    if (opts.from) date.gte = opts.from;
    if (opts.to) date.lte = opts.to;
    if (opts.asOf) date.lte = opts.asOf;
    const hasDate = Object.keys(date).length > 0;

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: JournalStatus.POSTED,
          ...(hasDate ? { date } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const sumByAccount = new Map(grouped.map((g) => [g.accountId, g._sum]));

    const accounts = await this.prisma.ledgerAccount.findMany({
      orderBy: { code: 'asc' },
    });

    return accounts.map((acc) => {
      const s = sumByAccount.get(acc.id);
      const debit = M.money(s?.debit ?? 0);
      const credit = M.money(s?.credit ?? 0);
      const net = M.sub(debit, credit);
      const balance =
        acc.normalBalance === NormalBalance.DEBIT ? net : M.neg(net);
      return { code: acc.code, name: acc.name, type: acc.type, balance };
    });
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Resolve a PostLine to an accountId: by raw id, systemKey, or code. */
  private resolveLineAccountId(db: Db, line: PostLine): Promise<string> {
    if (line.accountId) return this.resolveAccountIdById(db, line.accountId);
    if (line.key) return this.resolveSystemAccountId(db, line.key);
    if (line.code) return this.resolveAccountIdByCode(db, line.code);
    throw new BadRequestException('Journal line has no account id, key or code');
  }

  /** Resolve (and validate) a raw LedgerAccount id supplied by a caller. */
  private async resolveAccountIdById(db: Db, id: string): Promise<string> {
    const acc = await db.ledgerAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!acc) throw new BadRequestException(`Unknown ledger account id "${id}"`);
    return acc.id;
  }

  /**
   * Whether at least one POSTED journal entry exists for a source document.
   * Used by settlement hooks to decide whether to post a matching reversal-side
   * entry (e.g. only clear A/P if the accrual was actually posted).
   */
  async hasPostedEntry(sourceType: string, sourceId: string, tx?: Db): Promise<boolean> {
    const db = tx ?? this.prisma;
    const count = await db.journalEntry.count({
      where: { sourceType, sourceId, status: JournalStatus.POSTED },
    });
    return count > 0;
  }

  /**
   * Resolve a canonical (system) account by its stable key. Self-heals: if a
   * legacy row exists under the default code, backfill its key; otherwise create
   * it. Because we key off systemKey (not code), an edited code never breaks this.
   */
  private async resolveSystemAccountId(db: Db, key: string): Promise<string> {
    const cacheKey = `key:${key}`;
    const cached = this.accountIdCache.get(cacheKey);
    if (cached) return cached;

    const def = canonicalByKey(key);
    if (!def) {
      throw new BadRequestException(`Unknown ledger account key "${key}"`);
    }

    let acc = await db.ledgerAccount.findUnique({
      where: { systemKey: key },
      select: { id: true },
    });

    // Legacy row (seeded before systemKey) — match by default code, backfill key.
    if (!acc) {
      const legacy = await db.ledgerAccount.findUnique({
        where: { code: def.code },
        select: { id: true },
      });
      acc = legacy
        ? await db.ledgerAccount.update({
            where: { id: legacy.id },
            data: { systemKey: key, isSystem: true },
            select: { id: true },
          })
        : await db.ledgerAccount.create({
            data: {
              systemKey: key,
              code: def.code,
              name: def.name,
              type: def.type,
              normalBalance: def.normalBalance,
              description: def.description ?? null,
              isSystem: true,
            },
            select: { id: true },
          });
    }

    this.accountIdCache.set(cacheKey, acc.id);
    return acc.id;
  }

  /** Resolve an account by its (user-editable) code — for manual journal entries. */
  private async resolveAccountIdByCode(db: Db, code: string): Promise<string> {
    const acc = await db.ledgerAccount.findUnique({
      where: { code },
      select: { id: true },
    });
    if (acc) return acc.id;

    // A fresh DB might reference a canonical code before it's seeded — create it.
    const def = canonicalByCode(code);
    if (!def) {
      throw new BadRequestException(`Unknown ledger account code "${code}"`);
    }
    const created = await db.ledgerAccount.create({
      data: {
        systemKey: def.key,
        code: def.code,
        name: def.name,
        type: def.type,
        normalBalance: def.normalBalance,
        description: def.description ?? null,
        isSystem: true,
      },
      select: { id: true },
    });
    return created.id;
  }
}

// Re-export the codes so hook sites can import everything from one place.
export { GL } from './gl-accounts';
