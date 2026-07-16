import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { backupsApi } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { toast } from "sonner";
import {
  Database,
  HardDrive,
  FolderOpen,
  RefreshCw,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";

const BACKUP_META: Record<
  string,
  { label: string; icon: typeof Database; desc: string; color: string }
> = {
  full: {
    label: "Full DB Dump",
    icon: Database,
    desc: "Nightly pg_dump — portable, restores anywhere",
    color: "from-blue-500 to-blue-600",
  },
  base: {
    label: "Base Backup",
    icon: HardDrive,
    desc: "Weekly pg_basebackup — anchor for point-in-time recovery",
    color: "from-emerald-500 to-emerald-600",
  },
  files: {
    label: "Uploads Sync",
    icon: FolderOpen,
    desc: "Robocopy sync of x-rays & documents",
    color: "from-amber-500 to-amber-600",
  },
};

function StatusIcon({ status }: { status: string }) {
  if (status === "success")
    return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  if (status === "failed")
    return <XCircle className="w-5 h-5 text-red-400" />;
  return <AlertCircle className="w-5 h-5 text-slate-400" />;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatSize(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso?: string) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString("en-UG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupStatusPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["backups", "status"],
    queryFn: () => backupsApi.getStatus(),
    refetchInterval: 30_000,
  });

  const triggerFull = useMutation({
    mutationFn: backupsApi.triggerFull,
    onSuccess: () => {
      toast.success("Full backup triggered");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const triggerBase = useMutation({
    mutationFn: backupsApi.triggerBase,
    onSuccess: () => {
      toast.success("Base backup triggered");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const triggerFiles = useMutation({
    mutationFn: backupsApi.triggerFiles,
    onSuccess: () => {
      toast.success("File sync triggered");
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const lastByKind = (data?.lastByKind ?? {}) as Record<string, any>;
  const recent = data?.recent ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Backups</h1>
          <p className="text-sm text-slate-500 mt-1">
            Database dumps, WAL archiving, and file sync status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["backups"] })
          }
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(BACKUP_META).map(([kind, meta]) => {
          const last = lastByKind[kind];
          const Icon = meta.icon;
          const triggerMap: Record<string, () => void> = {
            full: () => triggerFull.mutate(),
            base: () => triggerBase.mutate(),
            files: () => triggerFiles.mutate(),
          };
          const loadingMap: Record<string, boolean> = {
            full: triggerFull.isPending,
            base: triggerBase.isPending,
            files: triggerFiles.isPending,
          };

          return (
            <Card key={kind} className="overflow-hidden">
              <div className={`bg-gradient-to-r ${meta.color} px-4 py-3 text-white`}>
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  <span className="font-semibold text-sm">{meta.label}</span>
                </div>
                <p className="text-xs mt-1 opacity-80">{meta.desc}</p>
              </div>
              <div className="p-4 space-y-3">
                {isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : last ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={last.status} />
                      <span className="font-medium capitalize text-slate-800">
                        {last.status}
                      </span>
                      <span className="text-slate-400 text-xs ml-auto">
                        {formatDuration(last.durationMs)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(last.finishedAt)}
                      {last.sizeBytes != null && (
                        <>
                          <span className="text-slate-300">·</span>
                          {formatSize(last.sizeBytes)}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No runs yet</p>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  variant="outline"
                  onClick={triggerMap[kind]}
                  disabled={loadingMap[kind]}
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  {loadingMap[kind] ? "Running..." : "Run Now"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {recent.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 text-sm">
              Recent Activity
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Size</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                  <th className="px-4 py-2.5 font-medium">Finished At</th>
                  {recent.some((r: any) => r.error) && (
                    <th className="px-4 py-2.5 font-medium">Error</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recent.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 capitalize font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        {r.kind === "full" && <Database className="w-3.5 h-3.5 text-blue-500" />}
                        {r.kind === "base" && <HardDrive className="w-3.5 h-3.5 text-emerald-500" />}
                        {r.kind === "files" && <FolderOpen className="w-3.5 h-3.5 text-amber-500" />}
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={
                          r.status === "success"
                            ? "default"
                            : r.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatSize(r.sizeBytes)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {formatDuration(r.durationMs)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {formatTime(r.finishedAt)}
                    </td>
                    {r.error && (
                      <td className="px-4 py-2.5 text-red-500 text-xs max-w-[200px] truncate">
                        {r.error}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
