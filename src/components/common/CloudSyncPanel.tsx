import React, { useState } from 'react';
import { Cloud, CloudOff, CloudUpload, CloudDownload, AlertTriangle, Loader2, X, KeyRound, RefreshCw } from 'lucide-react';
import { CloudStatus, getSyncKey } from '../../utils/cloudSync';

interface CloudSyncProps {
  status: CloudStatus;
  message: string;
  lastSyncedAt: Date | null;
  onConnect: (key: string) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onLoadFromCloud: () => Promise<void>;
  onOverwriteCloud: () => Promise<void>;
}

const LABELS: Record<CloudStatus, string> = {
  idle: 'Saving soon…',
  syncing: 'Saving to cloud…',
  synced: 'Saved to cloud',
  offline: 'Offline — saved on device',
  needs_key: 'Cloud: enter sync key',
  not_configured: 'Cloud not set up',
  conflict: 'Cloud conflict',
  error: 'Cloud save failed',
};

function StatusIcon({ status, className }: { status: CloudStatus; className?: string }) {
  if (status === 'syncing' || status === 'idle') return <Loader2 className={`${className} animate-spin`} />;
  if (status === 'synced') return <Cloud className={className} />;
  if (status === 'conflict' || status === 'error') return <AlertTriangle className={className} />;
  return <CloudOff className={className} />;
}

const tone = (status: CloudStatus) =>
  status === 'synced'
    ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30'
    : status === 'conflict' || status === 'error'
    ? 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30'
    : status === 'syncing' || status === 'idle'
    ? 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
    : 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30';

/** Small status pill that opens the cloud sync panel. */
export const CloudSyncButton: React.FC<CloudSyncProps & { floating?: boolean }> = ({ floating, ...props }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${tone(props.status)} ${
          floating ? 'fixed bottom-4 right-4 z-40 shadow-lg' : ''
        }`}
        title={props.message || LABELS[props.status]}
      >
        <StatusIcon status={props.status} className="w-3.5 h-3.5" />
        <span>{LABELS[props.status]}</span>
      </button>
      {open && <CloudSyncPanel {...props} onClose={() => setOpen(false)} />}
    </>
  );
};

const CloudSyncPanel: React.FC<CloudSyncProps & { onClose: () => void }> = ({
  status,
  message,
  lastSyncedAt,
  onConnect,
  onSyncNow,
  onLoadFromCloud,
  onOverwriteCloud,
  onClose,
}) => {
  const [key, setKey] = useState(getSyncKey());
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-slate-100">
            <Cloud className="w-4 h-4 text-emerald-600" />
            <span>Cloud Save</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className={`p-3 rounded-lg border flex gap-2 ${tone(status)}`}>
            <StatusIcon status={status} className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">{LABELS[status]}</div>
              {message && <div className="mt-0.5">{message}</div>}
              {lastSyncedAt && (
                <div className="mt-0.5 opacity-75">Last synced {lastSyncedAt.toLocaleTimeString()}</div>
              )}
            </div>
          </div>

          <p className="text-slate-600 dark:text-slate-400">
            Every change is saved on this device and uploaded to the cloud automatically, so the data stays
            after redeploys on Vercel and opens on any device that has the sync key.
          </p>

          <div className="space-y-1.5">
            <label className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Sync key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="The SYNC_KEY value from Vercel"
                className="flex-1 px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
              />
              <button
                type="button"
                disabled={busy || !key.trim()}
                onClick={() => run(() => onConnect(key))}
                className="px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-semibold disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>

          {status === 'conflict' && (
            <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900 space-y-2">
              <p className="text-slate-700 dark:text-slate-300">
                The cloud has data saved from another device (or before this device was connected). Choose which
                copy to keep:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(onLoadFromCloud, 'Replace the data on this device with the cloud copy? Unsynced changes here will be lost.')
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded font-semibold disabled:opacity-50"
                >
                  <CloudDownload className="w-3.5 h-3.5" />
                  Use cloud copy
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(onOverwriteCloud, 'Replace the cloud copy with the data on this device? Changes saved from other devices will be lost.')
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-rose-300 text-rose-700 dark:text-rose-400 rounded font-semibold disabled:opacity-50"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  Keep this device's copy
                </button>
              </div>
            </div>
          )}

          {status !== 'conflict' && (
            <button
              type="button"
              disabled={busy || status === 'needs_key' || status === 'not_configured'}
              onClick={() => run(onSyncNow)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded font-semibold disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              Sync now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
