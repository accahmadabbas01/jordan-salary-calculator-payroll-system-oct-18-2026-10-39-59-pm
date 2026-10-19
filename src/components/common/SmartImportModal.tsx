import React, { useMemo, useState } from 'react';
import { Company, Employee, MonthlyInput } from '../../types';
import { ARABIC_MONTHS, ENGLISH_MONTHS, YEAR_OPTIONS, formatCurrency } from '../../utils/calculator';
import {
  ImportRow,
  SALARY_ITEM_LABELS,
  SalaryKey,
  parseImportFile,
  parsePastedContent,
  rowsToMonthlyInputs,
} from '../../utils/smartImport';
import { Wand2, X, FileUp, ClipboardPaste, Loader2, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

interface SmartImportModalProps {
  company: Company;
  employees: Employee[];
  year: number;
  month: number;
  onApply: (inputs: MonthlyInput[]) => Promise<void>;
  onClose: () => void;
}

export const SmartImportModal: React.FC<SmartImportModalProps> = ({
  company,
  employees,
  year: initialYear,
  month: initialMonth,
  onApply,
  onClose,
}) => {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [pasteText, setPasteText] = useState('');
  const [pasteHtml, setPasteHtml] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const activeEmployees = employees.filter((e) => e.status !== 'resigned');

  const itemOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = (Object.keys(SALARY_ITEM_LABELS) as SalaryKey[]).map((k) => ({
      value: `salary:${k}`,
      label: SALARY_ITEM_LABELS[k],
    }));
    for (const a of company.allowanceTypes || []) opts.push({ value: `allowance:${a.name}`, label: `${a.name} (allowance)` });
    for (const d of company.deductionTypes || []) opts.push({ value: `deduction:${d.name}`, label: `${d.name} (deduction)` });
    return opts;
  }, [company]);

  const runParse = async (fn: () => Promise<{ rows: ImportRow[]; sourceSummary: string }>) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fn();
      setRows(res.rows);
      setSummary(res.sourceSummary);
      if (res.rows.length === 0) setError('Nothing recognised. Check that the text names employees and amounts.');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (file: File) => runParse(() => parseImportFile(file, company, employees));
  const handlePasteRead = () => runParse(async () => parsePastedContent(pasteText, pasteHtml, company, employees));

  const update = (id: string, patch: Partial<ImportRow>) =>
    setRows((prev) =>
      (prev || []).map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        const problems: string[] = [];
        if (!next.empId) problems.push('Choose the employee');
        if (!next.item) problems.push('Choose what this amount is');
        next.problem = problems.join('; ') || undefined;
        if (!next.problem && (patch.empId || patch.item || patch.amount !== undefined)) next.confidence = 'high';
        return next;
      })
    );

  const ready = (rows || []).filter((r) => r.include && r.empId && r.item && r.amount > 0);
  const needsReview = (rows || []).filter((r) => r.include && (r.problem || r.confidence === 'review'));

  const apply = async () => {
    const inputs = rowsToMonthlyInputs(rows || [], company, year, month);
    if (inputs.length === 0) return;
    setBusy(true);
    try {
      await onApply(inputs);
      setDone(
        `Added ${inputs.length} input${inputs.length === 1 ? '' : 's'} to ${ENGLISH_MONTHS[month - 1]} ${year}. Run payroll to include them.`
      );
      setRows(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const field =
    'px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-[11px]';

  return (
    <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 text-xs">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-600 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Smart Import — sheet or email</h3>
              <p className="text-[11px] text-slate-500">
                Reads overtime, bonuses, advances, absences, allowances and deductions in any layout (English or Arabic).
                Nothing is sent outside your browser.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Period */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Payroll month:</span>
            <select value={month} onChange={(e) => setMonth(+e.target.value)} className={field}>
              {ENGLISH_MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m} ({ARABIC_MONTHS[i]})
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(+e.target.value)} className={field}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {done && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{done}</span>
            </div>
          )}
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!rows && (
            <>
              <div className="flex border border-slate-200 dark:border-slate-700 rounded-md p-1 bg-slate-100/60 dark:bg-slate-800/40 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('file')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold ${
                    mode === 'file' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <FileUp className="w-3.5 h-3.5" /> Upload file
                </button>
                <button
                  type="button"
                  onClick={() => setMode('paste')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-semibold ${
                    mode === 'paste' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste email / text
                </button>
              </div>

              {mode === 'file' ? (
                <label
                  className="block p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center space-y-2 hover:border-violet-400 cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                >
                  <FileUp className="w-8 h-8 text-slate-400 mx-auto" />
                  <span className="block text-violet-600 dark:text-violet-400 font-semibold">
                    Choose or drop a file
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    Excel (.xlsx, .xls), CSV, saved email (.eml, .html) or text (.txt) — any column layout
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm,.xls,.csv,.ods,.eml,.html,.htm,.txt,.msg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              ) : (
                <div className="space-y-2">
                  <textarea
                    dir="auto"
                    rows={10}
                    value={pasteText}
                    onChange={(e) => {
                      setPasteText(e.target.value);
                      if (!e.target.value) setPasteHtml(null);
                    }}
                    onPaste={(e) => {
                      const html = e.clipboardData.getData('text/html');
                      setPasteHtml(html || null);
                    }}
                    placeholder={
                      'Paste the email or message here, e.g.\n\nAhmad Al-Sayed: overtime 10 hours, bonus 50\nEMP002 advance 100 JD\nسارة خوري غياب 2 يوم\nTables copied from Outlook or Excel work too.'
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono text-[12px]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {pasteHtml ? 'Formatted content detected — tables will be read.' : ''}
                    </span>
                    <button
                      type="button"
                      disabled={!pasteText.trim() || busy}
                      onClick={handlePasteRead}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 text-white rounded font-bold hover:bg-violet-700 disabled:opacity-50"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Read it
                    </button>
                  </div>
                </div>
              )}
              {busy && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading…
                </div>
              )}
            </>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300">
                  Found <strong>{rows.length}</strong> amount{rows.length === 1 ? '' : 's'} in {summary}.{' '}
                  {needsReview.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      {needsReview.length} need a check (highlighted).
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">All matched.</span>
                  )}
                </span>
                <button type="button" onClick={() => setRows(null)} className="text-blue-600 dark:text-blue-400 hover:underline">
                  ← Read something else
                </button>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2">Employee</th>
                      <th className="p-2">Item</th>
                      <th className="p-2 text-right">Amount ({company.currency || 'JOD'})</th>
                      <th className="p-2">Read from</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => {
                      const flagged = r.include && (r.problem || r.confidence === 'review');
                      const itemValue = r.item ? `${r.kind}:${r.item}` : '';
                      const hasOption = itemOptions.some((o) => o.value === itemValue);
                      return (
                        <tr key={r.id} className={`${flagged ? 'bg-amber-50 dark:bg-amber-950/20' : ''} ${r.include ? '' : 'opacity-40'}`}>
                          <td className="p-2 align-top">
                            <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} />
                          </td>
                          <td className="p-2 align-top">
                            <select value={r.empId} onChange={(e) => update(r.id, { empId: e.target.value })} className={`${field} max-w-[190px]`}>
                              <option value="">— choose —</option>
                              {activeEmployees.map((e) => (
                                <option key={e.empId} value={e.empId}>
                                  {e.empId} · {e.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 align-top">
                            <select
                              value={itemValue}
                              onChange={(e) => {
                                const [kind, ...rest] = e.target.value.split(':');
                                update(r.id, { kind: kind as MonthlyInput['kind'], item: rest.join(':') });
                              }}
                              className={`${field} max-w-[200px]`}
                            >
                              <option value="">— choose —</option>
                              {!hasOption && r.item && <option value={itemValue}>{r.item} ({r.kind})</option>}
                              {itemOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 align-top text-right">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={r.amount}
                              onChange={(e) => update(r.id, { amount: parseFloat(e.target.value) || 0, calcNote: undefined })}
                              className={`${field} w-24 text-right font-mono`}
                            />
                            {r.calcNote && <div className="text-[10px] text-slate-500 mt-0.5">{r.calcNote}</div>}
                          </td>
                          <td className="p-2 align-top text-slate-500 max-w-[280px]">
                            <div className="truncate" dir="auto" title={r.source}>
                              {r.source}
                            </div>
                            {r.include && r.problem && (
                              <div className="text-amber-700 dark:text-amber-400 font-semibold">{r.problem}</div>
                            )}
                            {r.include && !r.problem && r.confidence === 'review' && (
                              <div className="text-amber-700 dark:text-amber-400">Matched by first name only — please confirm</div>
                            )}
                          </td>
                          <td className="p-2 align-top">
                            <button
                              type="button"
                              onClick={() => setRows((prev) => (prev || []).filter((x) => x.id !== r.id))}
                              className="text-slate-400 hover:text-rose-600"
                              title="Remove row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500">
                Overtime given in hours uses basic ÷ 240 per hour × 125% (150% on holidays/rest days). Absence days use
                monthly wage ÷ 30. Repeated items for the same employee are added together. Existing inputs for the same
                item this month are replaced.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 bg-white dark:bg-slate-800 border rounded font-medium">
            Close
          </button>
          {rows && rows.length > 0 && (
            <button
              type="button"
              disabled={busy || ready.length === 0}
              onClick={apply}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Add {ready.length} to {ENGLISH_MONTHS[month - 1]} {year} ·{' '}
              {formatCurrency(ready.reduce((s, r) => s + r.amount, 0), '')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
