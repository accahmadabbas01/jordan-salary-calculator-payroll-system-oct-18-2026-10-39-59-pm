import React, { useEffect, useRef, useState } from 'react';
import { AllowanceType, DeductionType } from '../../types';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';

/** Select value meaning "not one of the company types" */
export const CUSTOM_TYPE = '__custom__';

type AnyType = AllowanceType | DeductionType;

const isAllowance = (t: AnyType): t is AllowanceType => 'taxable' in t;

/** Default amount of a type for a given basic salary. */
export function typeAmount(t: AnyType, basic: number): number {
  return t.method === 'percent' ? Math.round(basic * t.value) / 100 : t.value;
}

export function describeType(t: AnyType): string {
  const amount = t.method === 'percent' ? `${t.value}% of basic` : `${t.value.toFixed(2)} fixed`;
  if (isAllowance(t)) return `${amount} · ${t.taxable ? 'taxable' : 'tax-free'} · ${t.ssc ? 'subject to SSC' : 'no SSC'}`;
  return `${amount} · ${t.preTax ? 'before tax' : 'after tax'}`;
}

export function findType<T extends AnyType>(types: T[], name: string): T | undefined {
  const n = name.trim().toLowerCase();
  return types.find((t) => t.name.trim().toLowerCase() === n);
}

/** "+ Add …" button with a menu of the company's types and a custom option. */
export function AddFromTypesMenu<T extends AnyType>({
  label,
  types,
  basic,
  onPick,
  onCustom,
  onManageTypes,
}: {
  label: string;
  types: T[];
  basic: number;
  onPick: (type: T) => void;
  onCustom: () => void;
  onManageTypes?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden text-xs">
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Company types
          </div>
          <div className="max-h-64 overflow-y-auto">
            {types.length === 0 && <div className="px-3 py-2 text-slate-400">No types defined yet.</div>}
            {types.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => {
                  onPick(t);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900 dark:text-slate-100 truncate">{t.name}</span>
                  <span className="block text-[10px] text-slate-500">{describeType(t)}</span>
                </span>
                <span className="font-mono text-slate-700 dark:text-slate-300 shrink-0">
                  {typeAmount(t, basic).toFixed(2)}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                onCustom();
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
            >
              Custom item…
            </button>
            {onManageTypes && (
              <button
                type="button"
                onClick={() => {
                  onManageTypes();
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" /> Manage types in Company Settings
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Dropdown choosing a company type for an existing row (or "Custom"). */
export function TypeSelect<T extends AnyType>({
  types,
  name,
  onChange,
  className = '',
}: {
  types: T[];
  name: string;
  onChange: (type: T | null) => void;
  className?: string;
}) {
  const match = findType(types, name);
  return (
    <select
      value={match ? match.name : CUSTOM_TYPE}
      onChange={(e) => onChange(e.target.value === CUSTOM_TYPE ? null : findType(types, e.target.value) || null)}
      className={`px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium ${className}`}
    >
      {types.map((t) => (
        <option key={t.name} value={t.name}>
          {t.name}
        </option>
      ))}
      <option value={CUSTOM_TYPE}>Custom…</option>
    </select>
  );
}
