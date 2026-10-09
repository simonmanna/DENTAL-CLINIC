import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderPlus,
  HardDrive,
  History,
  Loader2,
  Monitor,
  Network,
  AlertTriangle,
  Usb,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import { backupsApi, type DriveEntry } from "../../lib/api/backups";
import { apiError, formatSize } from "./backup-format";

const DRIVE_ICON: Record<DriveEntry["type"], typeof HardDrive> = {
  fixed: HardDrive,
  removable: Usb,
  network: Network,
  cd: HardDrive,
  other: HardDrive,
};

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Folder to open first; null opens "This PC". */
  initialPath?: string | null;
  recent?: string[];
  /** `source` picks an existing folder as-is (no backup-folder checks). */
  mode?: "destination" | "source";
  onSelect: (path: string) => void;
}

/**
 * Browses folders on the clinic server (where backups are written), not on
 * the computer running the browser.
 */
export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  initialPath = null,
  recent = [],
  mode = "destination",
  onSelect,
}: FolderPickerDialogProps) {
  const isSource = mode === "source";
  const [current, setCurrent] = useState<string | null>(initialPath);
  const [address, setAddress] = useState(initialPath ?? "");
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent(initialPath);
      setAddress(initialPath ?? "");
      setNewFolder(null);
      setCreateError(null);
    }
  }, [open, initialPath]);

  const listing = useQuery({
    queryKey: ["backups", "browse", current],
    queryFn: () => backupsApi.browse(current),
    enabled: open,
    retry: false,
  });

  const check = useQuery({
    queryKey: ["backups", "check-location", current],
    queryFn: () => backupsApi.checkLocation(current!),
    enabled: open && !isSource && !!current && !listing.isError,
    retry: false,
  });

  const go = (path: string | null) => {
    setCurrent(path);
    setAddress(path ?? "");
    setNewFolder(null);
    setCreateError(null);
  };

  const createFolder = async () => {
    if (!current || !newFolder?.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { path } = await backupsApi.createFolder(current, newFolder.trim());
      go(path);
    } catch (e) {
      setCreateError(apiError(e, "Could not create the folder"));
    } finally {
      setCreating(false);
    }
  };

  const data = listing.data;
  const drives = data?.drives ?? [];
  const info = check.data;
  const canSelect =
    !!current &&
    !listing.isError &&
    !listing.isLoading &&
    (isSource || (!!info && !info.error));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Address bar */}
        <form
          className="flex items-center gap-2 border-y border-border/60 bg-muted/30 px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            go(address.trim() || null);
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!current}
            onClick={() => go(data?.parent ?? null)}
            aria-label="Up one level"
            title="Up one level"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="This PC — or type a path, e.g. E:\ClinicBackups or \\server\share"
            className="h-8 font-mono text-xs"
            aria-label="Folder path"
            spellCheck={false}
          />
          <Button type="submit" size="sm" variant="outline" className="h-8">
            Go
          </Button>
        </form>

        <div className="grid min-h-[320px] grid-cols-1 sm:grid-cols-[210px_1fr]">
          {/* Places */}
          <nav
            aria-label="Places"
            className="hidden space-y-4 border-r border-border/60 bg-muted/20 p-3 sm:block"
          >
            <div>
              <button
                type="button"
                onClick={() => go(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                  !current && "bg-muted font-medium",
                )}
              >
                <Monitor className="h-4 w-4 text-muted-foreground" />
                This PC
              </button>
              {drives.map((d) => {
                const Icon = DRIVE_ICON[d.type];
                return (
                  <button
                    key={d.path}
                    type="button"
                    onClick={() => go(d.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      current?.toLowerCase() === d.path.toLowerCase() &&
                        "bg-muted font-medium",
                    )}
                    title={d.label}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.label}</span>
                  </button>
                );
              })}
            </div>
            {recent.length > 0 && (
              <div>
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent
                </p>
                {recent.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => go(p)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    title={p}
                  >
                    <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{p}</span>
                  </button>
                ))}
              </div>
            )}
          </nav>

          {/* Contents */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {current ? "Folders" : "Drives on the clinic server"}
              </span>
              {current && newFolder === null && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setNewFolder("New folder")}
                >
                  <FolderPlus className="mr-1 h-3.5 w-3.5" />
                  New folder
                </Button>
              )}
            </div>

            <div className="max-h-[300px] flex-1 overflow-y-auto px-2 pb-2">
              {newFolder !== null && (
                <form
                  className="mb-1 flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createFolder();
                  }}
                >
                  <Folder className="h-4 w-4 shrink-0 text-warning" />
                  <Input
                    autoFocus
                    value={newFolder}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setNewFolder(null)}
                    className="h-7 text-sm"
                    aria-label="New folder name"
                  />
                  <Button type="submit" size="sm" className="h-7" disabled={creating}>
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setNewFolder(null)}
                  >
                    Cancel
                  </Button>
                </form>
              )}
              {createError && (
                <p className="mb-1 px-2 text-xs text-danger">{createError}</p>
              )}

              {listing.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : listing.isError ? (
                <div className="flex items-start gap-2 rounded-md bg-danger-muted/60 px-3 py-3 text-sm text-danger">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {apiError(listing.error, "Cannot open this folder")}
                </div>
              ) : !current ? (
                <ul className="grid gap-1 sm:grid-cols-2">
                  {drives.map((d) => {
                    const Icon = DRIVE_ICON[d.type];
                    const used =
                      d.totalBytes && d.freeBytes != null
                        ? 100 - (d.freeBytes / d.totalBytes) * 100
                        : null;
                    return (
                      <li key={d.path}>
                        <button
                          type="button"
                          onClick={() => go(d.path)}
                          className="flex w-full items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-left hover:bg-muted"
                        >
                          <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {d.label}
                            </span>
                            {used != null && (
                              <>
                                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                                  <span
                                    className={cn(
                                      "block h-full rounded-full",
                                      used > 90 ? "bg-danger" : "bg-primary",
                                    )}
                                    style={{ width: `${used}%` }}
                                  />
                                </span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {formatSize(d.freeBytes)} free of {formatSize(d.totalBytes)}
                                </span>
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {drives.length === 0 && (
                    <li className="px-2 py-6 text-sm text-muted-foreground">
                      No drives found. Type a path above.
                    </li>
                  )}
                </ul>
              ) : data && data.folders.length === 0 && newFolder === null ? (
                <p className="px-2 py-6 text-sm italic text-muted-foreground">
                  This folder has no sub-folders. You can select it, or create a new folder.
                </p>
              ) : (
                <ul>
                  {data?.folders.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => go(f.path)}
                        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-warning" />
                        <span className="truncate">{f.name}</span>
                        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Selection summary */}
        <div className="space-y-1.5 border-t border-border/60 bg-muted/30 px-6 py-3 text-sm">
          {!current ? (
            <p className="text-muted-foreground">Open a drive or folder to choose it.</p>
          ) : isSource ? (
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-muted-foreground">Selected</span>
              <span className="break-all font-mono text-xs font-medium">{current}</span>
            </p>
          ) : check.isLoading ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking folder…
            </p>
          ) : info ? (
            <>
              <p className="flex flex-wrap items-center gap-x-2">
                <span className="text-muted-foreground">Backups will be saved in</span>
                <span className="break-all font-mono text-xs font-medium">{info.path}</span>
                {info.freeBytes != null && (
                  <span className="text-xs text-muted-foreground">
                    · {formatSize(info.freeBytes)} free
                  </span>
                )}
              </p>
              {info.error ? (
                <p className="flex items-start gap-1.5 text-xs text-danger">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {info.error}
                </p>
              ) : (
                info.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </p>
                ))
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSelect} onClick={() => {
              if (isSource && current) onSelect(current);
              else if (info) onSelect(info.path);
            }}>
            <Check className="mr-1 h-4 w-4" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
