export type BackupKind = 'full' | 'base' | 'files';

/** What started a run. `catch-up` = a scheduled slot that was missed (PC off / app down). */
export type BackupTrigger = 'manual' | 'scheduled' | 'catch-up' | 'retry';

export type BackupFrequency =
  | 'hourly'
  | 'every3h'
  | 'every6h'
  | 'every12h'
  | 'daily'
  | 'weekly';

export const BACKUP_FREQUENCIES: BackupFrequency[] = [
  'hourly',
  'every3h',
  'every6h',
  'every12h',
  'daily',
  'weekly',
];

/** Allowed "keep backups for" values in days. 0 = forever. */
export const RETENTION_CHOICES = [0, 7, 14, 30, 90, 180, 365];

export interface BackupSchedule {
  enabled: boolean;
  frequency: BackupFrequency;
  /** Local time "HH:mm". Anchor for every-N-hours, run time for daily/weekly. */
  time: string;
  /** 0 = Sunday … 6 = Saturday. Only used for weekly. */
  weekday: number;
  /** Run as soon as possible when a scheduled time was missed. */
  catchUp: boolean;
}

export interface BackupSettings {
  /** Regular backup folder — where scheduled backups go. */
  location: string;
  schedule: BackupSchedule;
  /** Days to keep database backups at the regular location. 0 = forever. */
  keepDays: number;
  includeUploads: boolean;
  uploadsSource: string;
  /** Weekly pg_basebackup for point-in-time recovery (needs WAL archiving). */
  pointInTimeEnabled: boolean;
  /** Custom one-off locations used recently, newest first. */
  recentLocations: string[];
}

export interface BackupRunResult {
  kind: BackupKind;
  status: 'success' | 'failed' | 'skipped';
  trigger?: BackupTrigger;
  location?: string;
  target?: string;
  sizeBytes?: number;
  durationMs: number;
  finishedAt: string;
  error?: string;
}

export interface RunningJob {
  id: string;
  kinds: BackupKind[];
  trigger: BackupTrigger;
  location: string;
  startedAt: string;
}

export interface BackupState {
  settings: BackupSettings;
  /** Last scheduled slot (ISO) that was run, skipped or superseded. */
  lastHandledSlot?: string;
  retry?: { slot: string; attempts: number; nextAt: string };
}

export interface LocationInfo {
  path: string;
  exists: boolean;
  writable: boolean;
  freeBytes?: number;
  totalBytes?: number;
  sameDriveAsDatabase?: boolean;
  warnings: string[];
  error?: string;
}

export interface DriveEntry {
  path: string;
  label: string;
  type: 'fixed' | 'removable' | 'network' | 'cd' | 'other';
  freeBytes?: number;
  totalBytes?: number;
}

export interface FolderListing {
  path: string | null;
  parent: string | null;
  folders: { name: string; path: string }[];
  drives: DriveEntry[];
}
