import api from "./client";

export type BackupKind = "full" | "base" | "files";
export type BackupTrigger = "manual" | "scheduled" | "catch-up" | "retry";
export type BackupFrequency =
  | "hourly"
  | "every3h"
  | "every6h"
  | "every12h"
  | "daily"
  | "weekly";

export interface BackupSchedule {
  enabled: boolean;
  frequency: BackupFrequency;
  /** Local server time, "HH:mm". */
  time: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  catchUp: boolean;
}

export interface BackupSettings {
  location: string;
  schedule: BackupSchedule;
  keepDays: number;
  includeUploads: boolean;
  uploadsSource: string;
  pointInTimeEnabled: boolean;
  recentLocations: string[];
}

export interface BackupLocationInfo {
  path: string;
  exists: boolean;
  writable: boolean;
  freeBytes?: number;
  totalBytes?: number;
  sameDriveAsDatabase?: boolean;
  warnings: string[];
  error?: string;
}

export interface BackupRunResult {
  kind: BackupKind;
  status: "success" | "failed" | "skipped";
  trigger?: BackupTrigger;
  location?: string;
  target?: string;
  sizeBytes?: number;
  durationMs: number;
  finishedAt: string;
  error?: string;
}

export interface RunningBackup {
  id: string;
  kinds: BackupKind[];
  trigger: BackupTrigger;
  location: string;
  startedAt: string;
}

export interface BackupStatus {
  lastByKind: Partial<Record<BackupKind, BackupRunResult>>;
  lastSuccessAt: string | null;
  recent: BackupRunResult[];
  running: RunningBackup | null;
  scheduleEnabled: boolean;
  nextRunAt: string | null;
  overdue: boolean;
  location: string;
}

export interface BackupSettingsResponse {
  settings: BackupSettings;
  nextRunAt: string | null;
  location: BackupLocationInfo;
  stored: {
    count: number;
    totalBytes: number;
    newest: string | null;
    oldest: string | null;
  };
}

export interface BackupSettingsPatch {
  location?: string;
  schedule?: Partial<BackupSchedule>;
  keepDays?: number;
  includeUploads?: boolean;
  uploadsSource?: string;
  pointInTimeEnabled?: boolean;
}

export interface DriveEntry {
  path: string;
  label: string;
  type: "fixed" | "removable" | "network" | "cd" | "other";
  freeBytes?: number;
  totalBytes?: number;
}

export interface FolderListing {
  path: string | null;
  parent: string | null;
  folders: { name: string; path: string }[];
  drives: DriveEntry[];
}

export const backupsApi = {
  getStatus: () =>
    api.get<BackupStatus>("/admin/backups/status").then((r) => r.data),
  getSettings: () =>
    api
      .get<BackupSettingsResponse>("/admin/backups/settings")
      .then((r) => r.data),
  updateSettings: (patch: BackupSettingsPatch) =>
    api
      .put<BackupSettingsResponse>("/admin/backups/settings", patch)
      .then((r) => r.data),
  /** Back up now. Omit `location` for the regular backup location. */
  runNow: (body: { location?: string; includeUploads?: boolean } = {}) =>
    api.post<RunningBackup>("/admin/backups/run", body).then((r) => r.data),
  runBase: () =>
    api.post<RunningBackup>("/admin/backups/base").then((r) => r.data),
  checkLocation: (path: string) =>
    api
      .post<BackupLocationInfo>("/admin/backups/check-location", { path })
      .then((r) => r.data),
  browse: (path?: string | null) =>
    api
      .get<FolderListing>("/admin/backups/browse", {
        params: path ? { path } : {},
      })
      .then((r) => r.data),
  createFolder: (parent: string, name: string) =>
    api
      .post<{ path: string }>("/admin/backups/browse/folder", { parent, name })
      .then((r) => r.data),
};
