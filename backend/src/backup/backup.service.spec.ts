import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackupService } from './backup.service';
import { BackupRunResult } from './backup.types';
import { PrismaService } from '../prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { UpdateBackupSettingsDto } from './backup.dto';

const at = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi);

const ok = (trigger: BackupRunResult['trigger']): BackupRunResult[] => [
  {
    kind: 'full',
    status: 'success',
    trigger,
    durationMs: 1,
    finishedAt: new Date().toISOString(),
  },
];
const failed = (trigger: BackupRunResult['trigger']): BackupRunResult[] => [
  {
    kind: 'full',
    status: 'failed',
    trigger,
    durationMs: 1,
    finishedAt: new Date().toISOString(),
    error: 'boom',
  },
];

describe('BackupService scheduler', () => {
  let dir: string;
  let svc: BackupService;
  let run: jest.SpyInstance;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-spec-'));
    process.env.BACKUP_STATE_DIR = path.join(dir, 'state');
    process.env.BACKUP_DIR = path.join(dir, 'backups');
    svc = new BackupService({} as PrismaService);
    await svc.onModuleInit();
    // Skip the post-boot delay.
    (svc as unknown as { bootAt: number }).bootAt = 0;
    await svc.updateSettings({
      schedule: {
        enabled: true,
        frequency: 'daily',
        time: '02:00',
        catchUp: true,
      },
    });
    run = jest.spyOn(svc, 'runBackup');
  });

  afterEach(async () => {
    delete process.env.BACKUP_STATE_DIR;
    delete process.env.BACKUP_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  });

  const state = () =>
    (
      svc as unknown as {
        state: { lastHandledSlot?: string; retry?: { attempts: number } };
      }
    ).state;

  it('runs on time as "scheduled"', async () => {
    state().lastHandledSlot = at(8, 2).toISOString();
    run.mockResolvedValue(ok('scheduled'));
    await svc.checkSchedule(at(9, 2, 1));
    expect(run).toHaveBeenCalledWith({ trigger: 'scheduled' });
  });

  it('catches up once on a missed backup (computer was off)', async () => {
    state().lastHandledSlot = at(6, 2).toISOString();
    run.mockResolvedValue(ok('catch-up'));
    await svc.checkSchedule(at(9, 8, 30));
    await svc.checkSchedule(at(9, 8, 31));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ trigger: 'catch-up' });
    expect(state().lastHandledSlot).toBe(at(9, 2).toISOString());
  });

  it('skips a missed backup when catch-up is off', async () => {
    await svc.updateSettings({ schedule: { catchUp: false } });
    state().lastHandledSlot = at(8, 2).toISOString();
    await svc.checkSchedule(at(9, 8, 30));
    expect(run).not.toHaveBeenCalled();
    expect(svc.getStatus().recent[0]).toMatchObject({ status: 'skipped' });
  });

  it('retries a failed scheduled backup, at most 3 tries', async () => {
    state().lastHandledSlot = at(8, 2).toISOString();
    run.mockResolvedValue(failed('scheduled'));
    await svc.checkSchedule(at(9, 2, 1));
    expect(state().retry?.attempts).toBe(1);

    const later = new Date(Date.now() + 16 * 60_000);
    jest.spyOn(Date, 'now').mockReturnValue(later.getTime());
    await svc.checkSchedule(later);
    expect(run).toHaveBeenLastCalledWith({ trigger: 'retry' });
    expect(state().retry?.attempts).toBe(2);

    const later2 = new Date(later.getTime() + 16 * 60_000);
    jest.spyOn(Date, 'now').mockReturnValue(later2.getTime());
    await svc.checkSchedule(later2);
    expect(state().retry).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(3);
    jest.restoreAllMocks();
  });

  it('does not fire immediately when the schedule time changes', async () => {
    run.mockResolvedValue(ok('scheduled'));
    const handledBefore = state().lastHandledSlot;
    await svc.updateSettings({ schedule: { time: '00:00' } });
    expect(Date.parse(state().lastHandledSlot!)).toBeGreaterThanOrEqual(
      Date.parse(handledBefore ?? '1970-01-01'),
    );
    await svc.checkSchedule(new Date());
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps other schedule fields on a partial update from the API', async () => {
    const dto = plainToInstance(UpdateBackupSettingsDto, {
      schedule: { frequency: 'every6h' },
    });
    await svc.updateSettings(dto);
    expect(svc.settings.schedule).toMatchObject({
      enabled: true,
      frequency: 'every6h',
      time: '02:00',
      catchUp: true,
      weekday: 0,
    });
  });

  it('waits after startup before running', async () => {
    (svc as unknown as { bootAt: number }).bootAt = Date.now();
    state().lastHandledSlot = undefined;
    await svc.checkSchedule(new Date());
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a backup folder inside the uploads folder', async () => {
    const uploads = path.join(dir, 'uploads');
    await fs.mkdir(uploads, { recursive: true });
    await expect(
      svc.updateSettings({
        uploadsSource: uploads,
        location: path.join(uploads, 'backups'),
      }),
    ).rejects.toThrow(/inside the uploads folder/);
    expect(existsSync(path.join(uploads, 'backups'))).toBe(false);
  });
});
