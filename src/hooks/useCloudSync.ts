import { useCallback, useEffect, useRef, useState } from 'react';
import { clearStore, hasUsers, putManyInStore } from '../db/indexedDB';
import {
  CloudStatus,
  DatabaseSnapshot,
  getLocalVersion,
  isDirty,
  pullSnapshot,
  pushSnapshot,
  setDirty,
  setLocalVersion,
  setSyncKey,
} from '../utils/cloudSync';

type SnapshotData = Omit<DatabaseSnapshot, 'savedAt'>;

const AUTOSAVE_DELAY_MS = 1500;

/** Replaces the local IndexedDB contents with a cloud snapshot. */
async function applySnapshotToDB(s: DatabaseSnapshot) {
  const stores: [string, any[] | undefined][] = [
    ['companies', s.companies],
    ['employees', s.employees],
    ['salary_records', s.records],
    ['loans', s.loans],
    ['monthly_inputs', s.inputs],
    ['clearances', s.clearances],
    ['users', s.users],
    ['rule_sets', s.ruleSets],
  ];
  for (const [store, items] of stores) {
    if (!items) continue;
    await clearStore(store);
    await putManyInStore(store, items);
  }
}

function localHasData(data: SnapshotData) {
  return data.users.length > 0 || data.companies.length > 0;
}

/**
 * Keeps IndexedDB mirrored to /api/db.
 * - `initialPull()` runs before the app reads IndexedDB, so a new device starts from cloud data.
 * - Every change to `data` is uploaded after a short debounce.
 * - If another device saved in the meantime, status becomes 'conflict' and nothing is overwritten.
 */
export function useCloudSync(options: {
  ready: boolean;
  data: SnapshotData;
  onRemoteApplied: () => Promise<void>;
}) {
  const { ready, data, onRemoteApplied } = options;
  const [status, setStatus] = useState<CloudStatus>('idle');
  const [message, setMessage] = useState<string>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastSyncedJson = useRef<string | null>(null);
  const pushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = (s: CloudStatus, msg?: string) => {
    setStatus(s);
    setMessage(
      msg ||
        (s === 'offline'
          ? 'Cloud unreachable. Changes are kept on this device and will upload when back online.'
          : s === 'needs_key'
          ? 'Enter the sync key to save to the cloud.'
          : s === 'conflict'
          ? 'Another device saved newer data to the cloud.'
          : s === 'not_configured'
          ? 'Cloud storage is not set up on the server.'
          : 'Cloud sync failed.')
    );
  };

  const push = useCallback(async (force = false): Promise<void> => {
    if (pushing.current) return;
    pushing.current = true;
    setStatus('syncing');
    const snapshot = dataRef.current;
    const json = JSON.stringify(snapshot);
    try {
      const res = await pushSnapshot(snapshot, getLocalVersion(), force);
      if (res.status !== 'ok') {
        fail(res.status, 'message' in res ? res.message : undefined);
        return;
      }
      setLocalVersion(res.version);
      lastSyncedJson.current = json;
      setLastSyncedAt(new Date());
      setMessage('');
      if (JSON.stringify(dataRef.current) === json) {
        setDirty(false);
        setStatus('synced');
      } else {
        // More edits arrived while uploading.
        setStatus('idle');
        timer.current = setTimeout(() => push(), AUTOSAVE_DELAY_MS);
      }
    } catch (e: any) {
      fail('error', e?.message);
    } finally {
      pushing.current = false;
    }
  }, []);

  /**
   * Compares the cloud with this device and applies or uploads as needed.
   * Returns true when cloud data was written into IndexedDB.
   */
  const reconcile = useCallback(async (): Promise<boolean> => {
    setStatus('syncing');
    const localVersion = getLocalVersion();
    const res = await pullSnapshot(localVersion);
    if (res.status !== 'ok') {
      fail(res.status, res.message);
      return false;
    }
    if (res.snapshot && res.version) {
      // Never silently replace local work: unsynced edits, or a device used before it ever synced.
      if (isDirty() || (localVersion === '' && (await hasUsers()))) {
        fail('conflict');
        return false;
      }
      await applySnapshotToDB(res.snapshot);
      setLocalVersion(res.version);
      setDirty(false);
      lastSyncedJson.current = null; // re-baseline once the app reloads state
      setLastSyncedAt(new Date());
      setStatus('synced');
      setMessage('');
      return true;
    }
    // Cloud matches this device, or is empty.
    if (res.version === null) setLocalVersion('');
    setStatus('synced');
    setMessage('');
    setLastSyncedAt(new Date());
    return false;
  }, []);

  const initialPull = useCallback(async () => {
    await reconcile();
  }, [reconcile]);

  // Autosave on every data change.
  useEffect(() => {
    if (!ready) return;
    const json = JSON.stringify(data);
    if (lastSyncedJson.current === null) {
      // First render after loading: this is the baseline. Upload only if there are unsynced edits
      // or the cloud is still empty.
      lastSyncedJson.current = json;
      const cloudEmpty = getLocalVersion() === '' && localHasData(data);
      if (!isDirty() && !cloudEmpty) return;
      setDirty(true);
    } else if (json === lastSyncedJson.current) {
      return;
    } else {
      setDirty(true);
    }
    const s = statusRef.current;
    if (s === 'needs_key' || s === 'not_configured' || s === 'conflict') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(), AUTOSAVE_DELAY_MS);
  }, [ready, data, push]);

  // Pick up changes from other devices when coming back to the tab, and retry when back online.
  useEffect(() => {
    if (!ready) return;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || pushing.current) return;
      const s = statusRef.current;
      if (s === 'needs_key' || s === 'not_configured' || s === 'conflict') return;
      if (isDirty()) {
        push();
        return;
      }
      if (await reconcile()) await onRemoteApplied();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [ready, push, reconcile, onRemoteApplied]);

  const connect = useCallback(
    async (key: string) => {
      setSyncKey(key);
      if (await reconcile()) await onRemoteApplied();
      else if (isDirty() || (getLocalVersion() === '' && localHasData(dataRef.current))) await push();
    },
    [reconcile, onRemoteApplied, push]
  );

  const syncNow = useCallback(async () => {
    if (isDirty()) return push();
    if (await reconcile()) await onRemoteApplied();
  }, [push, reconcile, onRemoteApplied]);

  /** Discards this device's unsynced changes and loads the cloud copy. */
  const loadFromCloud = useCallback(async () => {
    setStatus('syncing');
    const res = await pullSnapshot();
    if (res.status !== 'ok') return fail(res.status, res.message);
    if (!res.snapshot || !res.version) {
      setStatus('synced');
      setMessage('The cloud is empty — nothing to load.');
      return;
    }
    await applySnapshotToDB(res.snapshot);
    setLocalVersion(res.version);
    setDirty(false);
    lastSyncedJson.current = null;
    setLastSyncedAt(new Date());
    setStatus('synced');
    setMessage('');
    await onRemoteApplied();
  }, [onRemoteApplied]);

  /** Replaces the cloud copy with this device's data. */
  const overwriteCloud = useCallback(() => push(true), [push]);

  return { status, message, lastSyncedAt, initialPull, connect, syncNow, loadFromCloud, overwriteCloud };
}
