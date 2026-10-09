import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  BackupKind,
  BackupRunResult,
  BackupSchedule,
  BackupSettings,
  BackupState,
  BackupTrigger,
  LocationInfo,
  RunningJob,
} from './backup.types';
import {
  lastSlotAtOrBefore,
  nextSlotAfter,
  timingChanged,
} from './backup-schedule';
import {
  inspectLocation,
  normalizeLocation,
  samePath,
} from './backup-locations';

const execFileAsync = promisify(execFile);

/** Give the database and the rest of the app time to come up after boot. */
const STARTUP_DELAY_MS = 90_000;
/** A slot run later than this counts as a missed ("catch-up") run. */
const GRACE_MS = 15 * 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const MAX_ATTEMPTS = 3;
const MIN_DUMPS_KEPT = 3;
const RECENT_LOCATIONS_MAX = 5;
const HISTORY_MAX = 500;
const PITR_INTERVAL_MS = 7 * 24 * 60 * 60_000;

export interface BackupSettingsPatch {
  location?: string;
  schedule?: Partial<BackupSchedule>;
  keepDays?: number;
  includeUploads?: boolean;
  uploadsSource?: string;
  pointInTimeEnabled?: boolean;
}

function appRoot(): string {
  let dir = __dirname;
  while (!existsSync(path.join(dir, 'package.json'))) {
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
  return dir;
}

/** Drop undefined keys — validated DTO instances carry them for unset fields. */
function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  private readonly bootAt = Date.now();
  private readonly root = appRoot();
  private state!: BackupState;
  private history: BackupRunResult[] = [];
  private running: RunningJob | null = null;
  private databaseDir: string | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  private get pgBin(): string {
    return process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
  }
  private get stateDir(): string {
    return (
      process.env.BACKUP_STATE_DIR || path.join(this.root, 'data', 'backup')
    );
  }
  private get baseBackupsToKeep(): number {
    return Number(process.env.BACKUP_BASE_KEEP ?? 4);
  }
  get settings(): BackupSettings {
    return this.state.settings;
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    const saved = await this.readJson<BackupState>('state.json');
    const defaults = this.defaults();
    this.state = {
      ...saved,
      settings: {
        ...defaults,
        ...saved?.settings,
        schedule: { ...defaults.schedule, ...saved?.settings?.schedule },
      },
    };
    await this.loadHistory();
    if (!saved) {
      // First start on this version: treat the newest successful dump as the
      // last handled slot, so a missed run since then is caught up.
      const last = this.history.find(
        (r) => r.kind === 'full' && r.status === 'success',
      );
      if (last) {
        this.state.lastHandledSlot = lastSlotAtOrBefore(
          this.settings.schedule,
          new Date(last.finishedAt),
        ).toISOString();
      }
      await this.saveState();
    }
    try {
      await this.ensureLayout(this.settings.location);
    } catch (err) {
      this.logger.warn(
        `Backup folder ${this.settings.location} unavailable: ${this.errText(err)}`,
      );
    }
  }

  private defaults(): BackupSettings {
    const envKeep = Number(process.env.BACKUP_FULL_RETENTION_DAYS ?? 14);
    return {
      location:
        process.env.BACKUP_DIR ||
        (process.platform === 'win32'
          ? 'C:\\ClinicBackups'
          : path.join(os.homedir(), 'ClinicBackups')),
      schedule: {
        enabled:
          (process.env.BACKUP_CRON_ENABLED ?? 'true').toLowerCase() !== 'false',
        frequency: 'daily',
        time: '02:00',
        weekday: 0,
        catchUp: true,
      },
      keepDays: Number.isFinite(envKeep) ? envKeep : 14,
      includeUploads: true,
      uploadsSource:
        process.env.BACKUP_UPLOADS_SRC || path.join(this.root, 'uploads'),
      pointInTimeEnabled: false,
      recentLocations: [],
    };
  }

  // ── Scheduler ───────────────────────────────────────────────────────────

  @Interval('backup-scheduler', 30_000)
  async tick(): Promise<void> {
    try {
      await this.checkSchedule(new Date());
    } catch (err) {
      this.logger.error(`Backup scheduler error: ${this.errText(err)}`);
    }
  }

  /**
   * Runs the scheduled backup when its slot is due. A slot missed while the
   * computer was off or asleep runs as soon as possible (when catch-up is on),
   * once — not once per missed slot. Failures retry every 15 min, 3 tries.
   */
  async checkSchedule(now: Date): Promise<void> {
    if (!this.state || this.running) return;
    const { schedule } = this.settings;
    if (!schedule.enabled) return;
    if (now.getTime() - this.bootAt < STARTUP_DELAY_MS) return;

    const slot = lastSlotAtOrBefore(schedule, now);
    const handled = this.state.lastHandledSlot
      ? Date.parse(this.state.lastHandledSlot)
      : 0;

    if (slot.getTime() > handled) {
      const late = now.getTime() - slot.getTime() > GRACE_MS;
      this.state.lastHandledSlot = slot.toISOString();
      this.state.retry = undefined;
      await this.saveState();
      if (late && !schedule.catchUp) {
        await this.record({
          kind: 'full',
          status: 'skipped',
          trigger: 'scheduled',
          location: this.settings.location,
          durationMs: 0,
          finishedAt: now.toISOString(),
          error: `Missed the ${slot.toLocaleString()} backup (computer off or app not running). Catch-up is turned off.`,
        });
        return;
      }
      const ok = await this.runScheduled(late ? 'catch-up' : 'scheduled');
      if (!ok) {
        this.state.retry = {
          slot: slot.toISOString(),
          attempts: 1,
          nextAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
        };
        await this.saveState();
      }
      return;
    }

    const retry = this.state.retry;
    if (retry && now.getTime() >= Date.parse(retry.nextAt)) {
      const ok = await this.runScheduled('retry');
      this.state.retry =
        ok || retry.attempts + 1 >= MAX_ATTEMPTS
          ? undefined
          : {
              ...retry,
              attempts: retry.attempts + 1,
              nextAt: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
            };
      await this.saveState();
    }
  }

  private async runScheduled(trigger: BackupTrigger): Promise<boolean> {
    const results = await this.runBackup({ trigger });
    const ok = results.some((r) => r.kind === 'full' && r.status === 'success');
    if (ok && this.settings.pointInTimeEnabled) {
      const lastBase = this.history.find(
        (r) => r.kind === 'base' && r.status === 'success',
      );
      if (
        !lastBase ||
        Date.now() - Date.parse(lastBase.finishedAt) >= PITR_INTERVAL_MS
      ) {
        await this.runBaseBackup(trigger);
      }
    }
    return ok;
  }

  nextRunAt(now = new Date()): string | null {
    const { schedule } = this.settings;
    if (!schedule.enabled) return null;
    if (this.state.retry) return this.state.retry.nextAt;
    const slot = lastSlotAtOrBefore(schedule, now);
    const handled = this.state.lastHandledSlot
      ? Date.parse(this.state.lastHandledSlot)
      : 0;
    if (slot.getTime() > handled && schedule.catchUp) {
      // Missed slot pending — it runs on the next scheduler tick.
      return new Date(
        Math.max(now.getTime(), this.bootAt + STARTUP_DELAY_MS),
      ).toISOString();
    }
    return nextSlotAfter(schedule, now).toISOString();
  }

  // ── Running backups ─────────────────────────────────────────────────────

  /** Start a backup in the background (HTTP "Back up now"). */
  async startBackup(opts: {
    location?: string;
    includeUploads?: boolean;
  }): Promise<RunningJob> {
    if (this.running)
      throw new ConflictException('A backup is already running.');
    const custom = opts.location ? normalizeLocation(opts.location) : null;
    const location = custom ?? this.settings.location;
    const info = await inspectLocation(location, { create: true });
    if (info.error) throw new BadRequestException(info.error);
    if (this.running)
      throw new ConflictException('A backup is already running.');

    const job = this.beginJob(['full'], 'manual', location);
    const includeUploads = opts.includeUploads ?? this.settings.includeUploads;
    if (includeUploads) job.kinds.push('files');
    void this.executeJob(job, includeUploads).catch((err) =>
      this.logger.error(`Backup job failed: ${this.errText(err)}`),
    );
    if (custom && !samePath(custom, this.settings.location)) {
      this.settings.recentLocations = [
        custom,
        ...this.settings.recentLocations.filter((p) => !samePath(p, custom)),
      ].slice(0, RECENT_LOCATIONS_MAX);
      await this.saveState();
    }
    return job;
  }

  /** Start a point-in-time base backup in the background. */
  startBaseBackup(): RunningJob {
    if (this.running)
      throw new ConflictException('A backup is already running.');
    const job = this.beginJob(['base'], 'manual', this.settings.location);
    void this.executeBase(job).catch((err) =>
      this.logger.error(`Base backup failed: ${this.errText(err)}`),
    );
    return job;
  }

  /** Run a backup and wait for it (scheduler, CLI script). */
  async runBackup(opts: {
    trigger: BackupTrigger;
    location?: string;
    includeUploads?: boolean;
  }): Promise<BackupRunResult[]> {
    const location = opts.location
      ? normalizeLocation(opts.location)
      : this.settings.location;
    if (this.running)
      return [
        this.skipped('full', 'another backup is already running', opts.trigger),
      ];
    const includeUploads = opts.includeUploads ?? this.settings.includeUploads;
    const job = this.beginJob(
      includeUploads ? ['full', 'files'] : ['full'],
      opts.trigger,
      location,
    );
    return this.executeJob(job, includeUploads);
  }

  async runBaseBackup(
    trigger: BackupTrigger = 'manual',
  ): Promise<BackupRunResult> {
    if (this.running)
      return this.skipped('base', 'another backup is already running', trigger);
    return this.executeBase(
      this.beginJob(['base'], trigger, this.settings.location),
    );
  }

  private beginJob(
    kinds: BackupKind[],
    trigger: BackupTrigger,
    location: string,
  ): RunningJob {
    this.running = {
      id: randomBytes(6).toString('hex'),
      kinds,
      trigger,
      location,
      startedAt: new Date().toISOString(),
    };
    return this.running;
  }

  private async executeJob(
    job: RunningJob,
    includeUploads: boolean,
  ): Promise<BackupRunResult[]> {
    const results: BackupRunResult[] = [];
    try {
      try {
        await this.ensureLayout(job.location);
      } catch (err) {
        results.push(
          await this.record({
            kind: 'full',
            status: 'failed',
            trigger: job.trigger,
            location: job.location,
            durationMs: 0,
            finishedAt: new Date().toISOString(),
            error: this.errText(err),
          }),
        );
        return results;
      }
      const dump = await this.dumpDatabase(job);
      results.push(dump);
      if (includeUploads) results.push(await this.syncUploads(job));
      if (
        dump.status === 'success' &&
        samePath(job.location, this.settings.location)
      ) {
        try {
          await this.prune();
        } catch (err) {
          this.logger.error(`Prune failed: ${this.errText(err)}`);
        }
      }
      return results;
    } finally {
      this.running = null;
    }
  }

  private async executeBase(job: RunningJob): Promise<BackupRunResult> {
    try {
      await this.ensureLayout(job.location);
      return await this.baseBackup(job);
    } catch (err) {
      return this.record({
        kind: 'base',
        status: 'failed',
        trigger: job.trigger,
        location: job.location,
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        error: this.errText(err),
      });
    } finally {
      this.running = null;
    }
  }

  private async dumpDatabase(job: RunningJob): Promise<BackupRunResult> {
    const started = Date.now();
    const file = path.join(job.location, 'full', `full_${this.stamp()}.dump`);
    const base = {
      kind: 'full' as const,
      trigger: job.trigger,
      location: job.location,
      target: file,
    };
    try {
      await this.execPg('pg_dump', [
        '--format=custom',
        '--compress=6',
        '--no-owner',
        '--no-password',
        `--file=${file}`,
      ]);
      // Prove the archive is readable before calling it a success.
      await this.execPg('pg_restore', ['--list', file]);
      const { size } = await fs.stat(file);
      return await this.record({
        ...base,
        status: 'success',
        sizeBytes: size,
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await fs.rm(file, { force: true });
      return await this.record({
        ...base,
        status: 'failed',
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
        error: this.errText(err),
      });
    }
  }

  private async baseBackup(job: RunningJob): Promise<BackupRunResult> {
    const started = Date.now();
    const dest = path.join(job.location, 'base', `base_${this.stamp()}`);
    const base = {
      kind: 'base' as const,
      trigger: job.trigger,
      location: job.location,
      target: dest,
    };
    try {
      await fs.mkdir(dest, { recursive: true });
      await this.execPg('pg_basebackup', [
        `--pgdata=${dest}`,
        '--format=tar',
        '--gzip',
        '--wal-method=stream',
        '--checkpoint=fast',
        '--no-password',
      ]);
      return await this.record({
        ...base,
        status: 'success',
        sizeBytes: await this.dirSize(dest),
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      await fs.rm(dest, { recursive: true, force: true });
      return await this.record({
        ...base,
        status: 'failed',
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
        error: this.errText(err),
      });
    }
  }

  /** Copy x-rays & documents. Adds/updates files, never deletes from the backup. */
  private async syncUploads(job: RunningJob): Promise<BackupRunResult> {
    const src = this.settings.uploadsSource;
    const dest = path.join(job.location, 'files');
    const started = Date.now();
    const base = {
      kind: 'files' as const,
      trigger: job.trigger,
      location: job.location,
      target: dest,
    };
    if (!src || !existsSync(src)) {
      return this.record({
        ...base,
        status: 'skipped',
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        error: `Uploads folder not found: ${src || '(not set)'}`,
      });
    }
    const done = (status: 'success' | 'failed', error?: string) =>
      this.record({
        ...base,
        status,
        durationMs: Date.now() - started,
        finishedAt: new Date().toISOString(),
        error,
      });
    if (process.platform !== 'win32') {
      try {
        await fs.cp(src, dest, { recursive: true, force: true });
        return await done('success');
      } catch (err) {
        return await done('failed', this.errText(err));
      }
    }
    const log = path.join(job.location, 'logs', 'robocopy.log');
    try {
      await execFileAsync(
        'robocopy',
        [
          src,
          dest,
          '/E',
          '/Z',
          '/R:2',
          '/W:5',
          '/NP',
          '/NDL',
          '/NFL',
          `/LOG+:${log}`,
        ],
        { windowsHide: true },
      );
      return await done('success');
    } catch (err: unknown) {
      // robocopy exit codes below 8 mean success (files copied / nothing to do).
      const code = (err as { code?: number }).code;
      if (typeof code === 'number' && code < 8) return await done('success');
      return await done('failed', this.errText(err));
    }
  }

  async prune(): Promise<void> {
    const dir = this.settings.location;
    const keepDays = this.settings.keepDays;
    if (keepDays > 0) {
      const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
      const dumps = await this.listByMtime(path.join(dir, 'full'));
      for (const [i, f] of dumps.entries()) {
        if (i >= MIN_DUMPS_KEPT && f.mtime < cutoff)
          await fs.rm(f.path, { force: true });
      }
    }
    const bases = await this.listByMtime(path.join(dir, 'base'));
    const kept = bases.slice(0, this.baseBackupsToKeep);
    for (const b of bases.slice(this.baseBackupsToKeep)) {
      await fs.rm(b.path, { recursive: true, force: true });
    }
    if (kept.length > 0) {
      const oldestKept = kept[kept.length - 1].mtime - 6 * 60 * 60 * 1000;
      for (const w of await this.listByMtime(path.join(dir, 'wal'))) {
        if (w.mtime < oldestKept) await fs.rm(w.path, { force: true });
      }
    }
  }

  // ── Settings & status ───────────────────────────────────────────────────

  async updateSettings(patch: BackupSettingsPatch): Promise<void> {
    const current = this.settings;
    const next: BackupSettings = {
      ...current,
      schedule: { ...current.schedule, ...definedOnly(patch.schedule) },
    };
    if (patch.keepDays !== undefined) next.keepDays = patch.keepDays;
    if (patch.includeUploads !== undefined)
      next.includeUploads = patch.includeUploads;
    if (patch.pointInTimeEnabled !== undefined)
      next.pointInTimeEnabled = patch.pointInTimeEnabled;

    if (patch.location !== undefined) {
      next.location = normalizeLocation(patch.location);
      next.recentLocations = current.recentLocations.filter(
        (p) => !samePath(p, next.location),
      );
    }
    if (patch.uploadsSource !== undefined) {
      const src = patch.uploadsSource.trim();
      if (!path.isAbsolute(src))
        throw new BadRequestException('Uploads folder must be a full path.');
      if (!existsSync(src))
        throw new BadRequestException(`Uploads folder not found: ${src}`);
      next.uploadsSource = path.resolve(src);
    }
    if (next.includeUploads) {
      if (isInside(next.location, next.uploadsSource)) {
        throw new BadRequestException(
          'The backup folder cannot be inside the uploads folder.',
        );
      }
      if (isInside(next.uploadsSource, next.location)) {
        throw new BadRequestException(
          'The uploads folder cannot be inside the backup folder.',
        );
      }
    }
    if (patch.location !== undefined) {
      // Only create the folder once every other check has passed.
      const info = await inspectLocation(next.location, { create: true });
      if (info.error) throw new BadRequestException(info.error);
      await this.ensureLayout(next.location);
    }

    if (timingChanged(current.schedule, next.schedule)) {
      // Changing *when* backups run never fires one immediately: the new
      // schedule starts counting from now.
      const baseline = lastSlotAtOrBefore(next.schedule, new Date()).getTime();
      const handled = this.state.lastHandledSlot
        ? Date.parse(this.state.lastHandledSlot)
        : 0;
      this.state.lastHandledSlot = new Date(
        Math.max(baseline, handled),
      ).toISOString();
      this.state.retry = undefined;
    }
    this.state.settings = next;
    await this.saveState();
  }

  async checkLocation(input: string): Promise<LocationInfo> {
    const p = normalizeLocation(input);
    return inspectLocation(p, {
      create: false,
      databaseDir: await this.getDatabaseDir(),
    });
  }

  async getSettings() {
    const location = await inspectLocation(this.settings.location, {
      create: false,
      databaseDir: await this.getDatabaseDir(),
    });
    const dumps = await this.listByMtime(
      path.join(this.settings.location, 'full'),
    );
    let totalBytes = 0;
    for (const d of dumps)
      totalBytes += (await fs.stat(d.path).catch(() => ({ size: 0 }))).size;
    return {
      settings: this.settings,
      nextRunAt: this.nextRunAt(),
      location,
      stored: {
        count: dumps.length,
        totalBytes,
        newest: dumps[0] ? new Date(dumps[0].mtime).toISOString() : null,
        oldest: dumps.length
          ? new Date(dumps[dumps.length - 1].mtime).toISOString()
          : null,
      },
    };
  }

  getStatus() {
    const lastByKind: Partial<Record<BackupKind, BackupRunResult>> = {};
    for (const r of this.history) {
      if (r.status === 'skipped') continue;
      if (!lastByKind[r.kind]) lastByKind[r.kind] = r;
    }
    const { schedule } = this.settings;
    const lastSuccess = this.history.find(
      (r) => r.kind === 'full' && r.status === 'success',
    );
    const dueSlot = lastSlotAtOrBefore(schedule, new Date()).getTime();
    const overdue =
      schedule.enabled &&
      !this.running &&
      Date.now() - dueSlot > GRACE_MS &&
      (!lastSuccess || Date.parse(lastSuccess.finishedAt) < dueSlot);
    return {
      lastByKind,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      recent: this.history.slice(0, 30),
      running: this.running,
      scheduleEnabled: schedule.enabled,
      nextRunAt: this.nextRunAt(),
      overdue,
      location: this.settings.location,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** PostgreSQL data directory, when the database runs on this machine. */
  private async getDatabaseDir(): Promise<string | null> {
    if (this.databaseDir !== undefined) return this.databaseDir;
    const host = (process.env.PGHOST ?? 'localhost').toLowerCase();
    if (!['localhost', '127.0.0.1', '::1', ''].includes(host))
      return (this.databaseDir = null);
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        { data_directory: string }[]
      >('SHOW data_directory');
      this.databaseDir = rows[0]?.data_directory ?? null;
    } catch {
      this.databaseDir = null;
    }
    return this.databaseDir;
  }

  private async ensureLayout(location: string): Promise<void> {
    const regular = samePath(location, this.settings.location);
    const subs = regular
      ? ['full', 'base', 'wal', 'files', 'logs']
      : ['full', 'files', 'logs'];
    for (const sub of subs) {
      await fs.mkdir(path.join(location, sub), { recursive: true });
    }
  }

  private async record(result: BackupRunResult): Promise<BackupRunResult> {
    this.history.unshift(result);
    this.history = this.history.slice(0, HISTORY_MAX);
    if (result.status === 'failed') {
      this.logger.error(
        `${result.kind} backup FAILED (${result.location}): ${result.error}`,
      );
      this.onFailure(result);
    } else {
      this.logger.log(
        `${result.kind} backup ${result.status} [${result.trigger ?? 'manual'}]: ${result.target ?? result.error ?? ''} (${Math.round(result.durationMs / 1000)}s)`,
      );
    }
    try {
      await fs.appendFile(
        path.join(this.stateDir, 'history.jsonl'),
        JSON.stringify(result) + '\n',
        'utf8',
      );
    } catch {
      /* best-effort */
    }
    return result;
  }

  private onFailure(result: BackupRunResult): void {
    void result;
    // TODO: wire to email / WhatsApp / healthchecks.io
  }

  private skipped(
    kind: BackupKind,
    reason: string,
    trigger?: BackupTrigger,
  ): BackupRunResult {
    this.logger.warn(`${kind} backup skipped: ${reason}`);
    return {
      kind,
      status: 'skipped',
      trigger,
      durationMs: 0,
      finishedAt: new Date().toISOString(),
      error: reason,
    };
  }

  private execPg(tool: string, args: string[]) {
    const exe = path.join(
      this.pgBin,
      process.platform === 'win32' ? `${tool}.exe` : tool,
    );
    return execFileAsync(exe, args, {
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      env: process.env,
    });
  }

  private async loadHistory(): Promise<void> {
    const file = path.join(this.stateDir, 'history.jsonl');
    let raw = await fs.readFile(file, 'utf8').catch(() => null);
    if (raw === null) {
      // Older versions kept history inside the backup folder.
      const legacy = path.join(
        this.settings.location,
        'logs',
        'backup-history.jsonl',
      );
      raw = await fs.readFile(legacy, 'utf8').catch(() => '');
      if (raw) await fs.writeFile(file, raw, 'utf8').catch(() => undefined);
    }
    const lines = raw.trim() ? raw.trim().split('\n') : [];
    if (lines.length > HISTORY_MAX * 2) {
      await fs
        .writeFile(file, lines.slice(-HISTORY_MAX).join('\n') + '\n', 'utf8')
        .catch(() => undefined);
    }
    this.history = lines
      .slice(-HISTORY_MAX)
      .reverse()
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as BackupRunResult];
        } catch {
          return [];
        }
      });
  }

  private async readJson<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.stateDir, name), 'utf8'),
      ) as T;
    } catch {
      return null;
    }
  }

  private async saveState(): Promise<void> {
    const file = path.join(this.stateDir, 'state.json');
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    await fs.rename(tmp, file);
  }

  private async listByMtime(
    dir: string,
  ): Promise<{ path: string; mtime: number }[]> {
    try {
      const names = await fs.readdir(dir);
      const items = await Promise.all(
        names.map(async (n) => {
          const p = path.join(dir, n);
          const st = await fs.stat(p);
          return { path: p, mtime: st.mtimeMs };
        }),
      );
      return items.sort((a, b) => b.mtime - a.mtime);
    } catch {
      return [];
    }
  }

  private async dirSize(dir: string): Promise<number> {
    let total = 0;
    for (const item of await this.listByMtime(dir)) {
      const st = await fs.stat(item.path);
      total += st.isDirectory() ? await this.dirSize(item.path) : st.size;
    }
    return total;
  }

  private stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  private errText(err: unknown): string {
    const e = err as { stderr?: string | Buffer; message?: string };
    const stderr = e?.stderr?.toString().trim();
    return stderr || e?.message || String(err);
  }
}
