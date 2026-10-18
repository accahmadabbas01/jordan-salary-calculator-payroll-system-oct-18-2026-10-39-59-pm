/**
 * Cloud sync with the /api/db endpoint (see api/db.ts).
 *
 * The browser keeps working from IndexedDB; the whole database is mirrored to the cloud as one
 * versioned snapshot so it survives on Vercel and can be opened from other devices.
 * Snapshots are gzip-compressed and sent in chunks to stay under Vercel's 4.5 MB body limit.
 */

const SYNC_KEY_STORAGE = 'jordan_payroll_sync_key';
const VERSION_STORAGE = 'jordan_payroll_cloud_version';
const DIRTY_STORAGE = 'jordan_payroll_cloud_dirty';
const CHUNK_SIZE = 3_000_000; // characters of base64 per request

export interface DatabaseSnapshot {
  companies: any[];
  employees: any[];
  records: any[];
  loans: any[];
  inputs: any[];
  clearances: any[];
  users: any[];
  ruleSets?: any[];
  savedAt: string;
}

export type CloudStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'needs_key'
  | 'not_configured'
  | 'conflict'
  | 'error';

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): sync still works for this session
  }
}

export const getSyncKey = () => lsGet(SYNC_KEY_STORAGE) || '';
export const setSyncKey = (key: string) => lsSet(SYNC_KEY_STORAGE, key.trim() || null);
export const getLocalVersion = () => lsGet(VERSION_STORAGE) || '';
export const setLocalVersion = (v: string) => lsSet(VERSION_STORAGE, v || null);
export const isDirty = () => lsGet(DIRTY_STORAGE) === '1';
export const setDirty = (dirty: boolean) => lsSet(DIRTY_STORAGE, dirty ? '1' : null);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-sync-key': getSyncKey(), ...extra };
}

function statusFromResponse(res: Response): CloudStatus {
  if (res.status === 401) return 'needs_key';
  if (res.status === 503) return 'not_configured';
  if (res.status === 409) return 'conflict';
  return 'error';
}

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function base64ToGunzip(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export type PullResult =
  | { status: 'ok'; version: string | null; snapshot: DatabaseSnapshot | null }
  | { status: Exclude<CloudStatus, 'idle' | 'syncing' | 'synced' | 'conflict'>; message?: string };

/** Reads the cloud version; downloads the snapshot only when it differs from `knownVersion`. */
export async function pullSnapshot(knownVersion?: string): Promise<PullResult> {
  let res: Response;
  try {
    res = await fetch('/api/db?op=meta', { headers: headers(), cache: 'no-store' });
  } catch {
    return { status: 'offline' };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const status = statusFromResponse(res);
    return { status: status === 'conflict' ? 'error' : status, message: body.message } as PullResult;
  }
  const meta = await res.json().catch(() => null);
  // A static host without the API (e.g. `vite preview`) answers with HTML, not JSON.
  if (!meta || typeof meta !== 'object') return { status: 'not_configured' };
  if (!meta.version) return { status: 'ok', version: null, snapshot: null };
  if (knownVersion && meta.version === knownVersion) {
    return { status: 'ok', version: meta.version, snapshot: null };
  }

  let b64 = '';
  for (let i = 0; i < meta.chunks; i++) {
    const c = await fetch(`/api/db?op=chunk&i=${i}`, { headers: headers(), cache: 'no-store' });
    if (!c.ok) return { status: statusFromResponse(c) as any };
    b64 += await c.text();
  }
  const snapshot = JSON.parse(await base64ToGunzip(b64)) as DatabaseSnapshot;
  return { status: 'ok', version: meta.version, snapshot };
}

export type PushResult =
  | { status: 'ok'; version: string }
  | { status: 'conflict' | 'needs_key' | 'not_configured' | 'offline' | 'error'; message?: string };

/** Uploads a snapshot. Fails with 'conflict' if the cloud changed since `baseVersion`, unless forced. */
export async function pushSnapshot(
  data: Omit<DatabaseSnapshot, 'savedAt'>,
  baseVersion: string,
  force = false
): Promise<PushResult> {
  const snapshot: DatabaseSnapshot = { ...data, savedAt: new Date().toISOString() };
  const b64 = await gzipToBase64(JSON.stringify(snapshot));
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const chunks = Math.max(1, Math.ceil(b64.length / CHUNK_SIZE));

  try {
    for (let i = 0; i < chunks; i++) {
      const res = await fetch(`/api/db?op=chunk&upload=${uploadId}&i=${i}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'text/plain' }),
        body: b64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { status: statusFromResponse(res) as any, message: body.message };
      }
    }
    const res = await fetch(
      `/api/db?op=commit&upload=${uploadId}&chunks=${chunks}&base=${encodeURIComponent(baseVersion)}${
        force ? '&force=1' : ''
      }`,
      { method: 'POST', headers: headers() }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: statusFromResponse(res) as any, message: body.message };
    return { status: 'ok', version: body.version };
  } catch {
    return { status: 'offline' };
  }
}

/**
 * Download complete database JSON file for manual portable backup
 */
export function downloadDatabaseJsonFile(data: any, companyName?: string): void {
  const dateStr = new Date().toISOString().substring(0, 10);
  const cleanName = companyName ? companyName.replace(/\s+/g, '_') : 'Full_System';
  const filename = `JordanPayroll_${cleanName}_Backup_${dateStr}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

/**
 * Parse uploaded JSON backup file
 */
export async function parseDatabaseJsonFile(file: File): Promise<any> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON structure');
  }

  return parsed;
}
