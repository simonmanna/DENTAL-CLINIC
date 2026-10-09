import { BadRequestException } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DriveEntry, FolderListing, LocationInfo } from './backup.types';

const execFileAsync = promisify(execFile);

/** Folder created inside a drive root so backups never litter `E:\`. */
export const ROOT_SUBFOLDER = 'ClinicBackups';
const LOW_SPACE_BYTES = 1024 * 1024 * 1024;
const HIDDEN = new Set([
  'system volume information',
  'recovery',
  'config.msi',
  'perflogs',
]);
const INVALID_NAME = /[<>:"/\\|?*]/;
const hasControlChar = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32);

/**
 * Turn user input into an absolute folder path. A bare drive or share root
 * (`E:\`, `\\nas\share`) gets a `ClinicBackups` subfolder appended.
 */
export function normalizeLocation(input: string): string {
  const raw = (input ?? '').trim().replace(/^"(.*)"$/, '$1');
  if (!raw) throw new BadRequestException('Choose a backup folder.');
  if (/^[a-zA-Z]:$/.test(raw)) return path.join(`${raw}\\`, ROOT_SUBFOLDER);
  if (!path.isAbsolute(raw)) {
    throw new BadRequestException(
      `"${raw}" is not a full folder path (e.g. D:\\ClinicBackups).`,
    );
  }
  const resolved = path.resolve(raw);
  return isRoot(resolved) ? path.join(resolved, ROOT_SUBFOLDER) : resolved;
}

export function isRoot(p: string): boolean {
  const resolved = path.resolve(p);
  return (
    path.parse(resolved).root.replace(/[\\/]+$/, '') ===
    resolved.replace(/[\\/]+$/, '')
  );
}

export function driveOf(p: string): string {
  return path
    .parse(path.resolve(p))
    .root.replace(/[\\/]+$/, '')
    .toLowerCase();
}

export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const r = path.resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

export function friendlyFsError(err: unknown, p: string): string {
  const code = (err as { code?: string })?.code;
  const drive = path.parse(p).root.replace(/[\\/]+$/, '');
  switch (code) {
    case 'ENOENT':
      return `${p} was not found. If it is on ${drive || 'an external drive'}, check the drive is connected.`;
    case 'EACCES':
    case 'EPERM':
      return `Access denied to ${p}. The clinic server is not allowed to write there.`;
    case 'EROFS':
      return `${drive || p} is read-only.`;
    case 'ENOSPC':
      return `Not enough free space on ${drive || p}.`;
    case 'EBUSY':
      return `${p} is busy or locked by another program.`;
    case 'ENOTDIR':
      return `${p} is a file, not a folder.`;
    default:
      return (err as Error)?.message ?? String(err);
  }
}

export async function diskSpace(
  p: string,
): Promise<{ freeBytes?: number; totalBytes?: number }> {
  try {
    const s = await fs.statfs(p);
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return {};
  }
}

/**
 * Check a folder can hold backups. With `create`, a missing folder is made.
 * Never throws — problems come back in `error` / `warnings`.
 */
export async function inspectLocation(
  p: string,
  opts: { create: boolean; databaseDir?: string | null },
): Promise<LocationInfo> {
  const info: LocationInfo = {
    path: p,
    exists: false,
    writable: false,
    warnings: [],
  };
  try {
    const st = await fs.stat(p);
    if (!st.isDirectory())
      throw Object.assign(new Error('not a folder'), { code: 'ENOTDIR' });
    info.exists = true;
  } catch (err) {
    // A missing folder is fine — it is created on first backup.
    if ((err as { code?: string }).code !== 'ENOENT')
      info.error = friendlyFsError(err, p);
  }
  if (!info.exists && !info.error) {
    const root = path.parse(path.resolve(p)).root;
    try {
      await fs.access(root);
    } catch {
      info.error = `${root.replace(/[\\/]+$/, '')} is not available. If it is a USB or network drive, check it is connected.`;
    }
  }
  if (!info.exists && opts.create && !info.error) {
    try {
      await fs.mkdir(p, { recursive: true });
      info.exists = true;
    } catch (err) {
      info.error = friendlyFsError(err, p);
    }
  }
  if (info.exists) {
    const probe = path.join(p, `.write-test-${randomBytes(4).toString('hex')}`);
    try {
      await fs.writeFile(probe, 'ok');
      await fs.rm(probe, { force: true });
      info.writable = true;
    } catch (err) {
      info.error = friendlyFsError(err, p);
    }
    Object.assign(info, await diskSpace(p));
  }
  if (opts.databaseDir) {
    info.sameDriveAsDatabase = driveOf(p) === driveOf(opts.databaseDir);
    if (info.sameDriveAsDatabase) {
      info.warnings.push(
        `This is the same drive (${path.parse(path.resolve(p)).root}) as the database. If that drive fails, the backups are lost too — prefer a second drive, USB disk or network share.`,
      );
    }
  }
  if (info.freeBytes != null && info.freeBytes < LOW_SPACE_BYTES) {
    info.warnings.push('Less than 1 GB free on this drive.');
  }
  return info;
}

export async function listDrives(): Promise<DriveEntry[]> {
  if (process.platform !== 'win32') {
    const home = os.homedir();
    return [
      { path: '/', label: 'File system (/)', type: 'fixed' },
      { path: home, label: `Home (${home})`, type: 'fixed' },
    ];
  }
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,VolumeName,FreeSpace,Size | ConvertTo-Json -Compress',
      ],
      { windowsHide: true, timeout: 8000 },
    );
    const parsed = JSON.parse(stdout.trim() || '[]') as unknown;
    const rows = (Array.isArray(parsed) ? parsed : [parsed]) as {
      DeviceID: string;
      DriveType: number;
      VolumeName?: string | null;
      FreeSpace?: number | null;
      Size?: number | null;
    }[];
    const typeOf = (t: number): DriveEntry['type'] =>
      t === 2
        ? 'removable'
        : t === 3
          ? 'fixed'
          : t === 4
            ? 'network'
            : t === 5
              ? 'cd'
              : 'other';
    const fallbackName: Record<DriveEntry['type'], string> = {
      fixed: 'Local Disk',
      removable: 'USB Drive',
      network: 'Network Drive',
      cd: 'CD Drive',
      other: 'Drive',
    };
    return rows
      .map((r) => {
        const type = typeOf(r.DriveType);
        return {
          path: `${r.DeviceID}\\`,
          label: `${r.VolumeName || fallbackName[type]} (${r.DeviceID})`,
          type,
          freeBytes: r.FreeSpace ?? undefined,
          totalBytes: r.Size ?? undefined,
        };
      })
      .filter((d) => d.type !== 'cd' && d.totalBytes);
  } catch {
    // PowerShell unavailable — probe drive letters instead.
    const found: DriveEntry[] = [];
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const root = `${letter}:\\`;
      try {
        await fs.access(root);
        found.push({
          path: root,
          label: `Drive (${letter}:)`,
          type: 'other',
          ...(await diskSpace(root)),
        });
      } catch {
        /* not present */
      }
    }
    return found;
  }
}

export async function listFolders(input?: string): Promise<FolderListing> {
  const drives = await listDrives();
  if (!input?.trim()) return { path: null, parent: null, folders: [], drives };
  const raw = input.trim().replace(/^"(.*)"$/, '$1');
  const target = /^[a-zA-Z]:$/.test(raw) ? `${raw}\\` : raw;
  if (!path.isAbsolute(target)) {
    throw new BadRequestException(`"${raw}" is not a full folder path.`);
  }
  const p = path.resolve(target);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch (err) {
    throw new BadRequestException(friendlyFsError(err, p));
  }
  const folders = entries
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('$') &&
        !e.name.startsWith('.') &&
        !HIDDEN.has(e.name.toLowerCase()),
    )
    .map((e) => ({ name: e.name, path: path.join(p, e.name) }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
    .slice(0, 500);
  const parent = path.dirname(p);
  return { path: p, parent: parent === p ? null : parent, folders, drives };
}

export async function createFolder(
  parent: string,
  name: string,
): Promise<string> {
  const clean = (name ?? '').trim();
  if (
    !clean ||
    clean === '.' ||
    clean === '..' ||
    INVALID_NAME.test(clean) ||
    hasControlChar(clean) ||
    /[. ]$/.test(clean)
  ) {
    throw new BadRequestException(
      'Folder names cannot be empty, end with a dot or space, or contain < > : " / \\ | ? *',
    );
  }
  if (clean.length > 100)
    throw new BadRequestException('Folder name is too long.');
  if (!parent || !path.isAbsolute(parent))
    throw new BadRequestException('Open a folder first.');
  const target = path.join(path.resolve(parent), clean);
  try {
    await fs.mkdir(target);
  } catch (err) {
    if ((err as { code?: string }).code === 'EEXIST') {
      throw new BadRequestException(
        `A folder named "${clean}" already exists here.`,
      );
    }
    throw new BadRequestException(friendlyFsError(err, target));
  }
  return target;
}
