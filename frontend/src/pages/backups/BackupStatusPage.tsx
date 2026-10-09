import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  DatabaseBackup,
  FolderInput,
  FolderOpen,
  HardDrive,
  History,
  Image,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { Input } from "../../components/ui/input";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { notify } from "../../lib/notify";
import { cn } from "../../lib/utils";
import {
  backupsApi,
  type BackupFrequency,
  type BackupKind,
  type BackupSettingsPatch,
  type RunningBackup,
} from "../../lib/api/backups";
import { FolderPickerDialog } from "./FolderPickerDialog";
import {
  FREQUENCY_LABELS,
  RETENTION_OPTIONS,
  TRIGGER_LABEL,
  WEEKDAYS,
  apiError,
  formatDuration,
  formatSize,
  formatWhen,
} from "./backup-format";

const KIND_META: Record<BackupKind, { label: string; icon: typeof Database }> = {
  full: { label: "Database", icon: Database },
  files: { label: "X-rays & documents", icon: Image },
  base: { label: "Point-in-time base", icon: HardDrive },
};

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Database;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
        <Icon className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </Card>
  );
}

function SettingRow({
  title,
  description,
  htmlFor,
  disabled,
  children,
}: {
  title: string;
  description?: ReactNode;
  htmlFor?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {title}
        </label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export default function BackupStatusPage() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["backups", "status"],
    queryFn: backupsApi.getStatus,
    refetchInterval: (q) => (q.state.data?.running ? 2_000 : 30_000),
  });
  const settingsQuery = useQuery({
    queryKey: ["backups", "settings"],
    queryFn: backupsApi.getSettings,
  });

  const status = statusQuery.data;
  const cfg = settingsQuery.data;
  const settings = cfg?.settings;
  const running = status?.running ?? null;

  // ── Toast when a running backup finishes ────────────────────────────────
  const prevRunning = useRef<RunningBackup | null>(null);
  useEffect(() => {
    const prev = prevRunning.current;
    if (prev && (!running || running.id !== prev.id) && status) {
      const since = Date.parse(prev.startedAt) - 1000;
      const results = status.recent.filter(
        (r) => r.location === prev.location && Date.parse(r.finishedAt) >= since,
      );
      const failed = results.find((r) => r.status === "failed");
      if (failed) {
        notify.error("Backup failed", failed.error);
      } else if (results.length) {
        notify.success("Backup complete", `Saved to ${prev.location}`);
      }
      queryClient.invalidateQueries({ queryKey: ["backups", "settings"] });
    }
    prevRunning.current = running;
  }, [running, status, queryClient]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: (patch: BackupSettingsPatch) => backupsApi.updateSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(["backups", "settings"], data);
      queryClient.invalidateQueries({ queryKey: ["backups", "status"] });
    },
    onError: (e) => notify.error("Could not save backup settings", apiError(e, "Failed")),
  });

  const runNow = useMutation({
    mutationFn: backupsApi.runNow,
    onSuccess: (job) => {
      notify.info("Backup started", `Backing up to ${job.location}`);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => notify.error("Could not start backup", apiError(e, "Failed")),
  });

  const runBase = useMutation({
    mutationFn: backupsApi.runBase,
    onSuccess: () => {
      notify.info("Base backup started");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => notify.error("Could not start base backup", apiError(e, "Failed")),
  });

  // ── Dialog state ────────────────────────────────────────────────────────
  const [picker, setPicker] = useState<null | "regular" | "custom" | "uploads">(null);
  const [customTarget, setCustomTarget] = useState<string | null>(null);
  const [customUploads, setCustomUploads] = useState(true);
  const [customMakeRegular, setCustomMakeRegular] = useState(false);

  const [timeDraft, setTimeDraft] = useState("");
  const savedTime = settings?.schedule.time;
  useEffect(() => {
    if (savedTime) setTimeDraft(savedTime);
  }, [savedTime]);

  const saveSchedule = (patch: BackupSettingsPatch["schedule"]) => save.mutate({ schedule: patch });

  const commitTime = () => {
    if (!settings || timeDraft === settings.schedule.time) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeDraft)) {
      setTimeDraft(settings.schedule.time);
      return;
    }
    saveSchedule({ time: timeDraft });
  };

  const changeRegularLocation = (path: string) => {
    setPicker(null);
    if (!settings || path === settings.location) return;
    save.mutate(
      { location: path },
      {
        onSuccess: () =>
          notify.success(
            "Backup location changed",
            `New backups will be saved to ${path}. Earlier backups stay in ${settings.location}.`,
          ),
      },
    );
  };

  const startCustomBackup = async () => {
    const target = customTarget;
    if (!target) return;
    setCustomTarget(null);
    if (customMakeRegular) {
      try {
        await save.mutateAsync({ location: target });
      } catch {
        return;
      }
      runNow.mutate({ includeUploads: customUploads });
    } else {
      runNow.mutate({ location: target, includeUploads: customUploads });
    }
  };

  // ── Overall health ──────────────────────────────────────────────────────
  const lastFull = status?.lastByKind.full;
  const hero = (() => {
    if (running)
      return {
        tone: "running" as const,
        title: "Backing up…",
        detail: `Saving to ${running.location}`,
      };
    if (lastFull?.status === "failed")
      return {
        tone: "error" as const,
        title: "The last backup failed",
        detail: lastFull.error ?? "See recent activity below.",
      };
    if (!status?.lastSuccessAt)
      return {
        tone: "warn" as const,
        title: "No backups yet",
        detail: "Back up now to protect patient records.",
      };
    if (status.overdue)
      return {
        tone: "warn" as const,
        title: "A scheduled backup was missed",
        detail: settings?.schedule.catchUp
          ? "It will run shortly. You can also back up now."
          : "Turn on catch-up so missed backups run when the computer is back on.",
      };
    if (!status.scheduleEnabled)
      return {
        tone: "warn" as const,
        title: "Automatic backup is off",
        detail: "Backups only happen when someone clicks Back up now.",
      };
    return {
      tone: "ok" as const,
      title: "Your clinic data is backed up",
      detail: "Backups run automatically in the background.",
    };
  })();

  const HeroIcon =
    hero.tone === "running"
      ? Loader2
      : hero.tone === "ok"
        ? ShieldCheck
        : hero.tone === "error"
          ? XCircle
          : ShieldAlert;

  const loading = statusQuery.isLoading || settingsQuery.isLoading;
  const loc = cfg?.location;
  const usedPct =
    loc?.totalBytes && loc.freeBytes != null
      ? 100 - (loc.freeBytes / loc.totalBytes) * 100
      : null;
  const scheduleOff = !settings?.schedule.enabled;
  const recent = status?.recent ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Backups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where backups are saved, when they run, and what they include
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["backups"] })}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* ── Status ── */}
      <Card className="overflow-hidden">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
                hero.tone === "ok" && "bg-success-muted text-success",
                hero.tone === "warn" && "bg-warning-muted text-warning",
                hero.tone === "error" && "bg-danger-muted text-danger",
                hero.tone === "running" && "bg-info-muted text-info",
              )}
            >
              <HeroIcon
                className={cn("h-7 w-7", hero.tone === "running" && "animate-spin")}
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-foreground">{hero.title}</p>
              <p className="mt-0.5 break-words text-sm text-muted-foreground">
                {hero.detail}
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Last backup:</dt>
                  <dd className="font-medium text-foreground">
                    {formatWhen(status?.lastSuccessAt)}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted-foreground">Next backup:</dt>
                  <dd className="font-medium text-foreground">
                    {status?.nextRunAt ? formatWhen(status.nextRunAt) : "Not scheduled"}
                  </dd>
                </div>
              </dl>
              {running && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-info" />
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
              <Button
                onClick={() => runNow.mutate({})}
                disabled={!!running || runNow.isPending}
              >
                <Play className="mr-1 h-4 w-4" />
                Back up now
              </Button>
              <Button
                variant="outline"
                onClick={() => setPicker("custom")}
                disabled={!!running || runNow.isPending}
              >
                <FolderInput className="mr-1 h-4 w-4" />
                Back up to another location…
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Location ── */}
      <Section
        icon={FolderOpen}
        title="Regular backup location"
        description="Automatic backups are always saved here. Use a second drive, USB disk or network share — not the drive the database is on."
      >
        {loading || !settings ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <HardDrive className="h-8 w-8 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-medium text-foreground">
                    {settings.location}
                  </p>
                  {usedPct != null && (
                    <>
                      <div className="mt-1.5 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            usedPct > 90 ? "bg-danger" : "bg-primary",
                          )}
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatSize(loc?.freeBytes)} free of {formatSize(loc?.totalBytes)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPicker("regular")}
                disabled={save.isPending}
              >
                Change location…
              </Button>
            </div>
            {cfg && (
              <p className="text-xs text-muted-foreground">
                {cfg.stored.count === 0
                  ? "No database backups stored here yet."
                  : `${cfg.stored.count} database backup${cfg.stored.count === 1 ? "" : "s"} stored (${formatSize(cfg.stored.totalBytes)}) · oldest ${formatWhen(cfg.stored.oldest)} · newest ${formatWhen(cfg.stored.newest)}`}
              </p>
            )}
            {loc?.error && (
              <p className="flex items-start gap-1.5 rounded-md bg-danger-muted/60 px-3 py-2 text-xs text-danger">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {loc.error}
              </p>
            )}
            {loc?.warnings.map((w) => (
              <p
                key={w}
                className="flex items-start gap-1.5 rounded-md bg-warning-muted/60 px-3 py-2 text-xs text-warning"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}
      </Section>

      {/* ── Schedule ── */}
      <Section
        icon={CalendarClock}
        title="Automatic backup"
        description="Times are the clinic server's local time. The server must be on for backups to run."
      >
        {loading || !settings ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SettingRow
              title="Back up automatically"
              description="Runs in the background — no one needs to be logged in."
              htmlFor="backup-auto"
            >
              <Switch
                id="backup-auto"
                checked={settings.schedule.enabled}
                onCheckedChange={(enabled) => saveSchedule({ enabled })}
                disabled={save.isPending}
              />
            </SettingRow>
            <SettingRow title="How often" disabled={scheduleOff}>
              <Select
                value={settings.schedule.frequency}
                onValueChange={(v) => saveSchedule({ frequency: v as BackupFrequency })}
                disabled={scheduleOff || save.isPending}
              >
                <SelectTrigger className="w-44" aria-label="How often">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as BackupFrequency[]).map((f) => (
                    <SelectItem key={f} value={f}>
                      {FREQUENCY_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              title={
                settings.schedule.frequency === "weekly"
                  ? "Day and time"
                  : settings.schedule.frequency === "daily"
                    ? "Time"
                    : "Starting at"
              }
              description={
                ["daily", "weekly"].includes(settings.schedule.frequency)
                  ? undefined
                  : `Backups run ${FREQUENCY_LABELS[settings.schedule.frequency].toLowerCase()} counting from this time.`
              }
              htmlFor="backup-time"
              disabled={scheduleOff}
            >
              {settings.schedule.frequency === "weekly" && (
                <Select
                  value={String(settings.schedule.weekday)}
                  onValueChange={(v) => saveSchedule({ weekday: Number(v) })}
                  disabled={scheduleOff || save.isPending}
                >
                  <SelectTrigger className="w-36" aria-label="Day of week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                id="backup-time"
                type="time"
                value={timeDraft}
                onChange={(e) => setTimeDraft(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => e.key === "Enter" && commitTime()}
                disabled={scheduleOff || save.isPending}
                className="w-32"
              />
            </SettingRow>
            <SettingRow
              title="Catch up on missed backups"
              description="If the computer was off or asleep at backup time, back up as soon as it is back on."
              htmlFor="backup-catchup"
              disabled={scheduleOff}
            >
              <Switch
                id="backup-catchup"
                checked={settings.schedule.catchUp}
                onCheckedChange={(catchUp) => saveSchedule({ catchUp })}
                disabled={scheduleOff || save.isPending}
              />
            </SettingRow>
            <SettingRow
              title="Keep backups"
              description="Older database backups in the regular location are removed automatically. The 3 newest are always kept. Backups saved to other locations are never removed."
            >
              <Select
                value={String(settings.keepDays)}
                onValueChange={(v) => save.mutate({ keepDays: Number(v) })}
                disabled={save.isPending}
              >
                <SelectTrigger className="w-44" aria-label="Keep backups">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.some((o) => o.days === settings.keepDays) ? null : (
                    <SelectItem value={String(settings.keepDays)}>
                      {settings.keepDays} days
                    </SelectItem>
                  )}
                  {RETENTION_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </>
        )}
      </Section>

      {/* ── What's included ── */}
      <Section icon={DatabaseBackup} title="What's backed up">
        {loading || !settings ? (
          <div className="p-5">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            <SettingRow
              title="Database"
              description="Patients, appointments, charts, treatments, billing and stock. Every backup is checked to be readable."
            >
              <Badge variant="success">Always</Badge>
            </SettingRow>
            <SettingRow
              title="X-rays & documents"
              htmlFor="backup-uploads"
              description={
                <>
                  Copies new and changed files from{" "}
                  <span className="break-all font-mono">{settings.uploadsSource}</span>{" "}
                  <button
                    type="button"
                    onClick={() => setPicker("uploads")}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Change
                  </button>
                </>
              }
            >
              <Switch
                id="backup-uploads"
                checked={settings.includeUploads}
                onCheckedChange={(includeUploads) => save.mutate({ includeUploads })}
                disabled={save.isPending}
              />
            </SettingRow>
          </>
        )}
      </Section>

      {/* ── Advanced ── */}
      <Section
        icon={Settings2}
        title="Advanced"
        description="Point-in-time recovery needs PostgreSQL WAL archiving set up first (see docs/BACKUP_SETUP.md)."
      >
        {settings && (
          <SettingRow
            title="Weekly point-in-time base backup"
            description="Adds a weekly pg_basebackup to the regular location so the database can be restored to any minute."
            htmlFor="backup-pitr"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => runBase.mutate()}
              disabled={!!running || runBase.isPending}
            >
              Run now
            </Button>
            <Switch
              id="backup-pitr"
              checked={settings.pointInTimeEnabled}
              onCheckedChange={(pointInTimeEnabled) => save.mutate({ pointInTimeEnabled })}
              disabled={save.isPending}
            />
          </SettingRow>
        )}
      </Section>

      {/* ── History ── */}
      <Card>
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm italic text-muted-foreground">No backups have run yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">What</th>
                  <th className="px-4 py-2.5 font-medium">Started by</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 text-right font-medium">Size</th>
                  <th className="px-4 py-2.5 text-right font-medium">Time taken</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recent.map((r, i) => {
                  const meta = KIND_META[r.kind];
                  const Icon = meta.icon;
                  return (
                    <tr key={`${r.finishedAt}-${r.kind}-${i}`} className="align-top hover:bg-muted/50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {formatWhen(r.finishedAt)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.trigger ? TRIGGER_LABEL[r.trigger] : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            r.status === "success"
                              ? "success"
                              : r.status === "failed"
                                ? "danger"
                                : "neutral"
                          }
                          className="gap-1 text-xs"
                        >
                          {r.status === "success" && <CheckCircle2 className="h-3 w-3" />}
                          {r.status}
                        </Badge>
                        {r.error && r.status !== "success" && (
                          <p
                            className={cn(
                              "mt-1 max-w-xs text-xs",
                              r.status === "failed" ? "text-danger" : "text-muted-foreground",
                            )}
                          >
                            {r.error}
                          </p>
                        )}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground"
                        title={r.target ?? r.location}
                      >
                        {r.location ?? r.target ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">
                        {formatSize(r.sizeBytes)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">
                        {formatDuration(r.durationMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Dialogs ── */}
      <FolderPickerDialog
        open={picker === "regular"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Choose the regular backup location"
        description="Automatic backups will be saved in this folder on the clinic server."
        confirmLabel="Use this folder"
        initialPath={settings?.location}
        recent={settings?.recentLocations}
        onSelect={changeRegularLocation}
      />
      <FolderPickerDialog
        open={picker === "custom"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Back up to another location"
        description="Make a one-time backup to a USB drive, external disk or network folder. Your regular backup location does not change."
        confirmLabel="Back up here…"
        initialPath={settings?.recentLocations[0] ?? null}
        recent={settings?.recentLocations}
        onSelect={(path) => {
          setPicker(null);
          setCustomUploads(settings?.includeUploads ?? true);
          setCustomMakeRegular(false);
          setCustomTarget(path);
        }}
      />
      <FolderPickerDialog
        open={picker === "uploads"}
        onOpenChange={(o) => !o && setPicker(null)}
        title="Choose the uploads folder"
        description="The folder where the clinic stores x-rays and patient documents."
        confirmLabel="Use this folder"
        mode="source"
        initialPath={settings?.uploadsSource}
        onSelect={(uploadsSource) => {
          setPicker(null);
          save.mutate({ uploadsSource });
        }}
      />

      <Dialog open={!!customTarget} onOpenChange={(o) => !o && setCustomTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Back up now</DialogTitle>
            <DialogDescription>
              A full backup will be saved to{" "}
              <span className="break-all font-mono text-foreground">{customTarget}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={customUploads}
                onCheckedChange={(v) => setCustomUploads(v === true)}
                className="mt-0.5"
              />
              <span>
                Include x-rays & documents
                <span className="block text-xs text-muted-foreground">
                  Recommended for a complete copy. Takes longer the first time.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={customMakeRegular}
                onCheckedChange={(v) => setCustomMakeRegular(v === true)}
                className="mt-0.5"
              />
              <span>
                Also make this my regular backup location
                <span className="block text-xs text-muted-foreground">
                  Automatic backups will go here from now on. Leave unticked for a one-time
                  copy (e.g. a USB drive you take home).
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void startCustomBackup()}>
              <Play className="mr-1 h-4 w-4" />
              Start backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
