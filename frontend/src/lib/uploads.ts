import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

/**
 * Uploaded patient files are no longer served as static content — the API
 * streams them behind a short-lived signed token (see backend FilesModule).
 * A browser cannot put an Authorization header on an <img> request, so the
 * token travels in the query string instead. One token is fetched per session
 * and shared by every caller here, and refreshed shortly before it expires.
 */
const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

/** Refresh this far ahead of expiry so in-flight renders keep working. */
const REFRESH_MARGIN_MS = 60_000;

type FileToken = { token: string; expiresAt: number };

let cached: FileToken | null = null;
let inFlight: Promise<FileToken | null> | null = null;
const subscribers = new Set<(token: string | null) => void>();

function isFresh(t: FileToken | null): t is FileToken {
  return !!t && t.expiresAt - REFRESH_MARGIN_MS > Date.now();
}

async function fetchToken(): Promise<FileToken | null> {
  if (isFresh(cached)) return cached;
  if (inFlight) return inFlight;

  inFlight = api
    .get<FileToken>('/files/token')
    .then((res) => {
      cached = res.data;
      subscribers.forEach((notify) => notify(cached!.token));
      return cached;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drop the cached token — call on logout so the next user mints their own. */
export function clearFileToken(): void {
  cached = null;
  subscribers.forEach((notify) => notify(null));
}

/**
 * Primes the shared token and re-renders the calling component once it lands.
 * Call it in the component that owns an imaging view; children re-render with
 * their parent, so a single call per view is enough.
 */
export function useFileToken(): string | null {
  const [token, setToken] = useState<string | null>(
    isFresh(cached) ? cached.token : null,
  );

  useEffect(() => {
    subscribers.add(setToken);
    void fetchToken();

    // Refresh a little before expiry so long-lived views keep rendering images.
    const timer = window.setInterval(() => {
      if (!isFresh(cached)) void fetchToken();
    }, REFRESH_MARGIN_MS / 2);

    return () => {
      subscribers.delete(setToken);
      window.clearInterval(timer);
    };
  }, []);

  return token;
}

/**
 * Turn a stored file path (`/uploads/...`) into a URL the browser can load.
 * Returns an empty string while no token is cached yet — the component that
 * called useFileToken re-renders when one arrives.
 */
export function resolveUpload(url?: string | null): string {
  return resolveUploadUrl(url, isFresh(cached) ? cached.token : null);
}

/** The pure form, for callers that already hold a token. */
export function resolveUploadUrl(
  url: string | null | undefined,
  token: string | null,
): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  const normalized = url.startsWith('/') ? url : `/${url}`;
  if (!normalized.startsWith('/uploads/')) {
    // Not an uploaded file (e.g. a bundled asset) — leave it alone.
    return `${API_BASE}${normalized}`;
  }
  if (!token) return '';

  const relative = normalized.slice('/uploads/'.length);
  const encoded = relative.split('/').map(encodeURIComponent).join('/');
  return `${API_BASE}/api/files/uploads/${encoded}?t=${encodeURIComponent(token)}`;
}
