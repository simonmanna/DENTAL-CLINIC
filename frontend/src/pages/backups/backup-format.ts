import type { BackupFrequency, BackupTrigger } from "../../lib/api/backups";

export const FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  hourly: "Every hour",
  every3h: "Every 3 hours",
  every6h: "Every 6 hours",
  every12h: "Every 12 hours",
  daily: "Daily",
  weekly: "Weekly",
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const RETENTION_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 0, label: "Forever" },
];

export const TRIGGER_LABEL: Record<BackupTrigger, string> = {
  manual: "Manual",
  scheduled: "Scheduled",
  "catch-up": "Catch-up",
  retry: "Retry",
};

export function formatSize(bytes?: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/** "Today 02:00", "Yesterday 14:30", "Tomorrow 02:00", or "Mon 12 Oct, 02:00". */
export function formatWhen(iso?: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(new Date())) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  const date = d.toLocaleDateString("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
  return `${date}, ${time}`;
}

export function apiError(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string") return msg;
  return (e as Error)?.message || fallback;
}
