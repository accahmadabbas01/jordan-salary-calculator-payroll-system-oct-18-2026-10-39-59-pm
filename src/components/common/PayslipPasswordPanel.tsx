import React, { useEffect, useState } from 'react';
import { Company, Employee, PayslipPasswordSettings } from '../../types';
import {
  PASSWORD_TOKENS,
  describePattern,
  getPayslipPassword,
  newPasswordSecret,
  payslipPasswordSettings,
} from '../../utils/payslipPassword';
import { Lock, Unlock, RefreshCw, AlertTriangle, Download } from 'lucide-react';

interface Props {
  company: Company;
  previewEmployee?: Employee;
  year: number;
  month: number;
  canEdit: boolean;
  onSave: (settings: PayslipPasswordSettings) => void;
  onDownloadList: () => void;
  selectedCount: number;
}

/** Settings for password-protected payslip PDFs, with a live preview for one employee. */
export const PayslipPasswordPanel: React.FC<Props> = ({
  company,
  previewEmployee,
  year,
  month,
  canEdit,
  onSave,
  onDownloadList,
  selectedCount,
}) => {
  const saved = payslipPasswordSettings(company);
  const [draft, setDraft] = useState<PayslipPasswordSettings>(saved);
  const [preview, setPreview] = useState<{ password: string; missing: string[] } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => setDraft(payslipPasswordSettings(company)), [company.id, company.payslipPassword]);

  useEffect(() => {
    let cancelled = false;
    const previewCompany = { ...company, payslipPassword: { ...draft, enabled: true, secret: draft.secret || 'preview' } };
    getPayslipPassword(previewCompany, previewEmployee, year, month)
      .then((r) => !cancelled && setPreview(r))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [draft, previewEmployee, year, month, company]);

  const set = (patch: Partial<PayslipPasswordSettings>) => {
    const next = { ...draft, ...patch };
    if (next.mode === 'generated' && !next.secret) next.secret = newPasswordSecret();
    setDraft(next);
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {saved.enabled ? <Lock className="w-4 h-4 text-emerald-600" /> : <Unlock className="w-4 h-4 text-slate-400" />}
          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">Payslip PDF password</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              saved.enabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {saved.enabled ? 'ON — every payslip PDF is protected' : 'OFF'}
          </span>
        </div>
        <label className="flex items-center gap-2 font-medium cursor-pointer">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={draft.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          Protect payslip PDFs with a password
        </label>
      </div>

      {draft.enabled && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className={`p-3 rounded-lg border cursor-pointer ${draft.mode === 'pattern' ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-center gap-2 font-semibold">
                <input type="radio" disabled={!canEdit} checked={draft.mode === 'pattern'} onChange={() => set({ mode: 'pattern' })} />
                Pattern the employee can work out
              </div>
              <p className="text-slate-500 mt-1">
                Built from their own details and the month, so nothing extra has to be sent. Different every month.
              </p>
            </label>
            <label className={`p-3 rounded-lg border cursor-pointer ${draft.mode === 'generated' ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex items-center gap-2 font-semibold">
                <input type="radio" disabled={!canEdit} checked={draft.mode === 'generated'} onChange={() => set({ mode: 'generated' })} />
                Generated password
              </div>
              <p className="text-slate-500 mt-1">
                Random-looking, unique per employee and month (always the same for the same slip). Send it with the
                password list.
              </p>
            </label>
          </div>

          {draft.mode === 'pattern' ? (
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Pattern</span>
              <input
                value={draft.pattern}
                disabled={!canEdit}
                onChange={(e) => set({ pattern: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono"
              />
              <div className="flex flex-wrap gap-1">
                {PASSWORD_TOKENS.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => set({ pattern: draft.pattern + t.token })}
                    title={t.label}
                    className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-mono text-[11px]"
                  >
                    {t.token}
                  </button>
                ))}
              </div>
              <p className="text-slate-500">Employees are told: “Password: {describePattern(draft.pattern)}.”</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  if (confirm('Create new passwords for every employee and month? Lists already sent will no longer match.')) {
                    set({ secret: newPasswordSecret() });
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded"
              >
                <RefreshCw className="w-3 h-3" /> Create new passwords
              </button>
              <span className="text-slate-500">The secret is stored with the company settings (and synced to the cloud).</span>
            </div>
          )}

          {previewEmployee && preview && (
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-slate-500">
                Preview — {previewEmployee.name}, {String(month).padStart(2, '0')}/{year}:
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{preview.password}</span>
              {preview.missing.length > 0 && (
                <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> No data for {preview.missing.join(', ')} — employee number used instead
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          Uses standard PDF password protection (40-bit), which every PDF reader opens. It stops casual opening — a wrong
          recipient or a shared computer — but is not strong against password-cracking tools.
        </p>
        <div className="flex items-center gap-2">
          {saved.enabled && (
            <button
              type="button"
              onClick={onDownloadList}
              disabled={selectedCount === 0}
              className="flex items-center gap-1 px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded font-medium disabled:opacity-50"
              title="Excel list of passwords for the selected employees — keep it private"
            >
              <Download className="w-3 h-3" /> Password list ({selectedCount})
            </button>
          )}
          {canEdit && dirty && (
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="px-3 py-1 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
