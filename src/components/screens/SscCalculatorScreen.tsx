import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Company, Employee, MonthlyInput, SalaryRecord } from '../../types';
import { getMonthName, getRuleSetForPeriod, isEmployedInMonth } from '../../utils/calculator';
import { employeeCoverage, sscWageBase } from '../../utils/ssc';
import { leaveDaysByMonth, packageAmounts } from '../../utils/maternity';
import {
  NOTES,
  SscCalcRow,
  SscCalcSettings,
  WORKBOOK_DEFAULTS,
  WORKBOOK_SAMPLES,
  blankRow,
  calcRow,
  calcTotals,
  exportWorkbook,
  importWorkbook,
  settingsFromRules,
} from '../../utils/sscCalculator';
import { getAppState, setAppState } from '../../db/indexedDB';
import { downloadBlob } from '../../utils/pdf';
import { Calculator, Users, FileUp, FileDown, Plus, Trash2, RotateCcw, Settings2, AlertTriangle, Info } from 'lucide-react';

interface Props {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  monthlyInputs: MonthlyInput[];
  year: number;
  month: number;
}

const fmt = (n: number) =>
  n ? n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-';
const pad2 = (n: number) => String(n).padStart(2, '0');

const SETTING_FIELDS: { key: keyof SscCalcSettings; ar: string; en: string; percent?: boolean }[] = [
  { key: 'empOldAge', ar: 'الموظف – الشيخوخة', en: 'Employee – old age, disability & death', percent: true },
  { key: 'empUnemployment', ar: 'الموظف – التعطل', en: 'Employee – unemployment', percent: true },
  { key: 'erOldAge', ar: 'الشركة – الشيخوخة', en: 'Employer – old age, disability & death', percent: true },
  { key: 'erWorkInjury', ar: 'الشركة – إصابات العمل', en: 'Employer – work injury', percent: true },
  { key: 'erMaternity', ar: 'الشركة – الأمومة', en: 'Employer – maternity', percent: true },
  { key: 'erUnemployment', ar: 'الشركة – التعطل', en: 'Employer – unemployment', percent: true },
  { key: 'erHighRisk', ar: 'إضافية للمهن الخطرة', en: 'Employer – high-risk extra', percent: true },
  { key: 'ceiling', ar: 'سقف الأجر (0 = بدون)', en: 'Wage ceiling, JOD (0 = none)' },
  { key: 'dayBasis', ar: 'أيام أساس الشهر', en: 'Month day basis' },
  { key: 'maternityEntitlement', ar: 'مدة إجازة الأمومة', en: 'Maternity entitlement (days)' },
  { key: 'minContributions', ar: 'الحد الأدنى للاشتراكات', en: 'Min contributions for allowance' },
];

const TREATMENTS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: '1 — No contributions on maternity days (workbook default)' },
  { value: 2, label: '2 — Contributions on the full wage (company keeps paying salary)' },
  { value: 3, label: '3 — Employer pays old age + unemployment on leave days (SSC rule, used by payroll)' },
];

/** The Excel "Jordan SSC Calculator" as a live screen. */
export const SscCalculatorScreen: React.FC<Props> = ({ company, employees, records, monthlyInputs, year, month }) => {
  const storageKey = `sscCalculator_${company.id}`;
  const official = useMemo(() => settingsFromRules(getRuleSetForPeriod(year, month)), [year, month]);
  const [settings, setSettings] = useState<SscCalcSettings>(official);
  const [rows, setRows] = useState<SscCalcRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const loaded = useRef(false);

  // Restore the last calculation for this company (kept on this device)
  useEffect(() => {
    loaded.current = false;
    getAppState<{ rows: SscCalcRow[]; settings: SscCalcSettings } | null>(storageKey, null).then((saved) => {
      if (saved?.rows?.length) {
        setRows(saved.rows);
        setSettings({ ...WORKBOOK_DEFAULTS, ...saved.settings });
      } else {
        setRows(WORKBOOK_SAMPLES.map((r) => ({ ...blankRow(), ...r })));
        setSettings(official);
      }
      loaded.current = true;
    });
  }, [storageKey]);

  useEffect(() => {
    if (loaded.current) setAppState(storageKey, { rows, settings });
  }, [rows, settings, storageKey]);

  const results = useMemo(() => rows.map((r) => calcRow(r, settings)), [rows, settings]);
  const totals = useMemo(() => calcTotals(rows, results), [rows, results]);
  const warnings = results.filter((r) => r.check !== 'OK').length;

  const update = (id: string, patch: Partial<SscCalcRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // ---- Fill rows from this company's employees for the selected month ---------------------
  const loadEmployees = () => {
    const first = `${year}-${pad2(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const last = `${year}-${pad2(month)}-${pad2(lastDay)}`;
    const skipped: string[] = [];
    const differs: string[] = [];
    const next: SscCalcRow[] = [];
    for (const emp of employees) {
      if (!isEmployedInMonth(emp, year, month)) continue;
      const coverage = employeeCoverage(emp);
      if (coverage !== 'full') {
        skipped.push(`${emp.name} (${coverage === 'exempt' ? 'not subject to SSC' : 'work injury only'})`);
        continue;
      }
      // Rules payroll applies that the workbook has no column for
      if (emp.sscInsuredBefore2010) differs.push(`${emp.name} (insured before May 2010 — payroll uses the 5,000 ceiling)`);
      if (emp.sscYouthReduction && emp.sscYouthReduction !== 'none')
        differs.push(`${emp.name} (youth old-age reduction — payroll lowers the employer share)`);
      const { amounts, earnings, monthlyWage } = packageAmounts(emp);
      const wage = Math.round(sscWageBase(emp, amounts, earnings) * 1000) / 1000;
      // Days in service: joining or leaving during the month
      const start = emp.hireDate && emp.hireDate > first ? emp.hireDate : first;
      const end = emp.endDate && emp.endDate < last ? emp.endDate : last;
      const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
      const serviceDays = start === first && end === last ? settings.dayBasis : Math.min(settings.dayBasis, days);
      const maternityDays = Math.min(
        settings.dayBasis,
        (emp.maternityLeaves || []).reduce(
          (s, l) => s + (leaveDaysByMonth(l).find((p) => p.year === year && p.month === month)?.days || 0),
          0
        )
      );
      const unpaidAmount = monthlyInputs
        .filter((i) => i.empId === emp.empId && i.year === year && i.month === month && i.kind === 'salary' && i.item === 'unpaid_leave')
        .reduce((s, i) => s + i.amount, 0);
      const unpaidDays = unpaidAmount && monthlyWage ? Math.round(unpaidAmount / (monthlyWage / settings.dayBasis)) : 0;
      const ym = year * 12 + month;
      const priorContributions = records.filter(
        (r) => r.empId === emp.empId && r.year * 12 + r.month < ym && r.year * 12 + r.month >= ym - 12 && (r.amounts.social_sec || 0) > 0
      ).length;
      next.push({
        ...blankRow(),
        empId: emp.empId,
        name: `${emp.empId} · ${emp.name}`,
        gender: emp.gender === 'female' ? 'female' : 'male',
        wage,
        serviceDays,
        unpaidDays,
        maternityDays,
        unemployment: true,
        highRisk: false,
        priorContributions,
      });
    }
    setRows(next);
    setSettings(official);
    setMessage(
      `Loaded ${next.length} employees for ${getMonthName(month)} ${year} with this month's official rates.` +
        (skipped.length ? ` Skipped: ${skipped.join(', ')}.` : '') +
        (differs.length ? ` Will differ from payroll: ${differs.join(', ')}.` : '') +
        ' Prior contributions count the last 12 months of salary records.'
    );
  };

  const handleImport = async (file: File) => {
    try {
      const { rows: imported, settings: importedSettings } = importWorkbook(await file.arrayBuffer());
      setRows(imported.length ? imported : [blankRow()]);
      if (importedSettings) setSettings(importedSettings);
      setMessage(`Imported ${imported.length} rows${importedSettings ? ' and the Settings sheet' : ''} from ${file.name}.`);
    } catch (e: any) {
      setMessage(`Could not read ${file.name}: ${e?.message || e}`);
    }
  };

  const handleExport = () => {
    const bytes = exportWorkbook(rows, settings, `${company.name} — ${getMonthName(month)} ${year}`);
    downloadBlob(
      new Blob([bytes as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Jordan_SSC_Calculator_${company.name.replace(/\s+/g, '_')}_${year}_${pad2(month)}.xlsx`
    );
  };

  const numInput = (value: number, onChange: (v: number) => void, w = 'w-20') => (
    <input
      type="number"
      min={0}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={`${w} px-1.5 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded font-mono text-right text-[11px]`}
    />
  );

  const yn = (value: boolean, onChange: (v: boolean) => void) => (
    <select
      value={value ? 'Y' : 'N'}
      onChange={(e) => onChange(e.target.value === 'Y')}
      className="px-1 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded text-[11px]"
    >
      <option value="Y">Y</option>
      <option value="N">N</option>
    </select>
  );

  const head = (ar: string, en: string, tone = 'bg-slate-100 dark:bg-slate-800') => (
    <th className={`px-2 py-1.5 text-[10px] font-semibold text-center align-bottom leading-tight ${tone}`}>
      <div className="font-arabic">{ar}</div>
      <div className="text-slate-500 font-normal">{en}</div>
    </th>
  );
  const out = (v: number, bold = false) => (
    <td className={`px-2 py-1 text-right font-mono tabular-nums text-[11px] ${bold ? 'font-bold' : ''}`}>{fmt(v)}</td>
  );

  return (
    <div className="space-y-4 text-xs">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-500" />
            <span>
              SSC Calculator <span className="font-arabic text-slate-500">· حاسبة اشتراكات الضمان الاجتماعي</span>
            </span>
          </h2>
          <p className="text-slate-500">
            Monthly contributions per employee — the "Jordan SSC Calculator" workbook as a live screen. Yellow cells are
            inputs. Rates come from {getMonthName(month)} {year}'s rules unless you change them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadEmployees} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md font-medium">
            <Users className="w-3.5 h-3.5" /> Load employees ({getMonthName(month)})
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium cursor-pointer">
            <FileUp className="w-3.5 h-3.5" /> Import workbook
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleImport(f);
              }}
            />
          </label>
          <button type="button" onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md font-medium">
            <FileDown className="w-3.5 h-3.5" /> Export to Excel (with formulas)
          </button>
          <button
            type="button"
            onClick={() => {
              setRows(WORKBOOK_SAMPLES.map((r) => ({ ...blankRow(), ...r })));
              setMessage('Loaded the 9 sample cases from the workbook.');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Sample cases
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300 flex items-start justify-between gap-2">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-slate-400">
            ✕
          </button>
        </div>
      )}

      {/* Summary (workbook "Summary" sheet) */}
      <div className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-8 gap-3">
        {[
          ['Employees', 'عدد الموظفين', String(rows.filter((r) => r.name.trim()).length)],
          ['Contribution base', 'الأجور الخاضعة', fmt(totals.base)],
          ['Employee deductions', 'خصم الموظفين', fmt(totals.empTotal)],
          ['Employer share', 'حصة الشركة', fmt(totals.erTotal)],
          ['Total payable to SSC', 'المستحق للضمان', fmt(totals.totalDue)],
          ['Maternity benefits (SSC)', 'بدل الأمومة', fmt(totals.maternityBenefit)],
          ['Maternity cases', 'حالات الأمومة', String(rows.filter((r) => r.maternityDays > 0).length)],
          ['Warnings', 'تنبيهات', String(warnings)],
        ].map(([en, ar, v], i) => (
          <div
            key={en}
            className={`p-3 rounded-lg border ${
              i === 4
                ? 'bg-slate-900 text-white border-slate-900'
                : i === 7 && warnings
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className={`text-[10px] ${i === 4 ? 'text-slate-300' : 'text-slate-500'}`}>
              {en} <span className="font-arabic">· {ar}</span>
            </div>
            <div className="mt-1 text-sm font-bold font-mono tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {/* Settings (workbook "Settings" sheet) */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="w-full p-3 flex flex-wrap items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
            <Settings2 className="w-4 h-4 text-slate-500" /> Settings & rates
            <span className="font-normal text-slate-500 font-mono">
              Employee {((settings.empOldAge + settings.empUnemployment) * 100).toFixed(2)}% · Employer{' '}
              {((settings.erOldAge + settings.erWorkInjury + settings.erMaternity + settings.erUnemployment) * 100).toFixed(2)}% ·
              Ceiling {settings.ceiling ? settings.ceiling.toLocaleString() : 'none'} · Maternity treatment {settings.maternityTreatment}
            </span>
          </span>
          <span className="text-blue-600 dark:text-blue-400">{showSettings ? 'Hide' : 'Edit'}</span>
        </button>
        {showSettings && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSettings(official)} className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded font-medium">
                Use {getMonthName(month)} {year} official rules
              </button>
              <button type="button" onClick={() => setSettings({ ...WORKBOOK_DEFAULTS })} className="px-2.5 py-1 border border-slate-300 dark:border-slate-700 rounded font-medium">
                Use workbook defaults
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SETTING_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-slate-600 dark:text-slate-400">
                    {f.en} <span className="font-arabic text-slate-400">· {f.ar}</span>
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      type="number"
                      step={f.percent ? 0.05 : 1}
                      min={0}
                      value={f.percent ? Math.round((settings[f.key] as number) * 100000) / 1000 : (settings[f.key] as number)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setSettings({ ...settings, [f.key]: f.percent ? v / 100 : v });
                      }}
                      className="w-full px-2 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded font-mono"
                    />
                    {f.percent && <span className="text-slate-500">%</span>}
                  </div>
                </label>
              ))}
              <label className="block sm:col-span-2 lg:col-span-4">
                <span className="block text-slate-600 dark:text-slate-400">
                  Maternity-day contribution treatment <span className="font-arabic text-slate-400">· معالجة الاشتراكات أثناء إجازة الأمومة</span>
                </span>
                <select
                  value={settings.maternityTreatment}
                  onChange={(e) => setSettings({ ...settings, maternityTreatment: Number(e.target.value) as 1 | 2 | 3 })}
                  className="mt-0.5 w-full px-2 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded"
                >
                  {TREATMENTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Calculator grid (workbook "Calculator" sheet) */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-max w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {head('#', '#')}
              {head('اسم الموظف', 'Employee name')}
              {head('الجنس', 'Gender')}
              {head('الأجر الشهري الخاضع', 'Insurable wage')}
              {head('أيام الخدمة', 'Service days')}
              {head('إجازة بدون راتب', 'Unpaid days')}
              {head('أيام الأمومة', 'Maternity days')}
              {head('البطالة؟', 'Unemployment')}
              {head('مهنة خطرة؟', 'High-risk')}
              {head('الاشتراكات السابقة', 'Prior contrib.')}
              {head('الأيام المدفوعة', 'Paid days', 'bg-blue-50 dark:bg-blue-950/30')}
              {head('أجر الأيام المدفوعة', 'Wage – paid days', 'bg-blue-50 dark:bg-blue-950/30')}
              {head('أجر أيام الأمومة', 'Wage – maternity', 'bg-blue-50 dark:bg-blue-950/30')}
              {head('الأجر الخاضع للاشتراك', 'Contribution base', 'bg-blue-50 dark:bg-blue-950/30')}
              {head('الموظف: شيخوخة', 'Emp: old age', 'bg-orange-50 dark:bg-orange-950/30')}
              {head('الموظف: تعطل', 'Emp: unemployment', 'bg-orange-50 dark:bg-orange-950/30')}
              {head('إجمالي خصم الموظف', 'Employee total', 'bg-orange-50 dark:bg-orange-950/30')}
              {head('الشركة: شيخوخة', 'Er: old age', 'bg-green-50 dark:bg-green-950/30')}
              {head('الشركة: إصابات عمل', 'Er: work injury', 'bg-green-50 dark:bg-green-950/30')}
              {head('الشركة: أمومة', 'Er: maternity', 'bg-green-50 dark:bg-green-950/30')}
              {head('الشركة: تعطل', 'Er: unemployment', 'bg-green-50 dark:bg-green-950/30')}
              {head('الشركة: مهن خطرة', 'Er: high-risk', 'bg-green-50 dark:bg-green-950/30')}
              {head('إجمالي حصة الشركة', 'Employer total', 'bg-green-50 dark:bg-green-950/30')}
              {head('المستحق للضمان', 'Total due to SSC', 'bg-blue-100 dark:bg-blue-900/40')}
              {head('بدل الأمومة (تقديري)', 'Maternity benefit', 'bg-pink-50 dark:bg-pink-950/30')}
              {head('صافي بعد الضمان', 'Net after SSC')}
              {head('تحقق', 'Check')}
              <th className="bg-slate-100 dark:bg-slate-800" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => {
              const res = results[i];
              return (
                <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="px-2 py-1 text-center text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-1 py-1">
                    <input
                      dir="auto"
                      value={r.name}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      className="w-52 px-1.5 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded text-[11px]"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={r.gender}
                      onChange={(e) => update(r.id, { gender: e.target.value as SscCalcRow['gender'] })}
                      className="px-1 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded text-[11px] font-arabic"
                    >
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">{numInput(r.wage, (v) => update(r.id, { wage: v }), 'w-24')}</td>
                  <td className="px-1 py-1">{numInput(r.serviceDays, (v) => update(r.id, { serviceDays: v }), 'w-14')}</td>
                  <td className="px-1 py-1">{numInput(r.unpaidDays, (v) => update(r.id, { unpaidDays: v }), 'w-14')}</td>
                  <td className="px-1 py-1">{numInput(r.maternityDays, (v) => update(r.id, { maternityDays: v }), 'w-14')}</td>
                  <td className="px-1 py-1 text-center">{yn(r.unemployment, (v) => update(r.id, { unemployment: v }))}</td>
                  <td className="px-1 py-1 text-center">{yn(r.highRisk, (v) => update(r.id, { highRisk: v }))}</td>
                  <td className="px-1 py-1">{numInput(r.priorContributions, (v) => update(r.id, { priorContributions: v }), 'w-14')}</td>
                  <td className="px-2 py-1 text-right font-mono text-[11px]">{res.paidDays}</td>
                  {out(res.wagePaid)}
                  {out(res.wageMaternity)}
                  {out(res.base, true)}
                  {out(res.empOldAge)}
                  {out(res.empUnemployment)}
                  {out(res.empTotal, true)}
                  {out(res.erOldAge)}
                  {out(res.erWorkInjury)}
                  {out(res.erMaternity)}
                  {out(res.erUnemployment)}
                  {out(res.erHighRisk)}
                  {out(res.erTotal, true)}
                  {out(res.totalDue, true)}
                  {out(res.maternityBenefit)}
                  {out(res.netPay)}
                  <td className={`px-2 py-1 text-[11px] whitespace-nowrap ${res.check === 'OK' ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-400 font-semibold'}`}>
                    {res.check}
                  </td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} className="p-1 text-slate-400 hover:text-rose-600" title="Remove row">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 font-bold">
              <td />
              <td className="px-2 py-1.5" colSpan={2}>
                الإجمالي | Total
              </td>
              {out(totals.wage, true)}
              <td colSpan={6} />
              <td className="px-2 py-1 text-right font-mono text-[11px]">{totals.paidDays}</td>
              {out(totals.wagePaid, true)}
              {out(totals.wageMaternity, true)}
              {out(totals.base, true)}
              {out(totals.empOldAge, true)}
              {out(totals.empUnemployment, true)}
              {out(totals.empTotal, true)}
              {out(totals.erOldAge, true)}
              {out(totals.erWorkInjury, true)}
              {out(totals.erMaternity, true)}
              {out(totals.erUnemployment, true)}
              {out(totals.erHighRisk, true)}
              {out(totals.erTotal, true)}
              {out(totals.totalDue, true)}
              {out(totals.maternityBenefit, true)}
              {out(totals.netPay, true)}
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
        <div className="p-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <button type="button" onClick={() => setRows([...rows, blankRow()])} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => confirm('Clear all rows?') && setRows([])}
              className="flex items-center gap-1 text-slate-500 hover:text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {settings.maternityTreatment !== 3 && rows.some((r) => r.maternityDays > 0) && (
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Payroll in this system uses treatment 3 (SSC: the employer keeps paying old age + unemployment on maternity days).
            With treatment {settings.maternityTreatment} the employer share here will differ from payroll.
          </span>
        </div>
      )}

      {/* Notes (workbook "Notes" sheet) */}
      <details className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" /> Assumptions & notes
        </summary>
        <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-400">
          {NOTES.slice(2).map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>
            This is a what-if calculator. Payroll itself also applies the youth reduction, work-injury-only coverage and the
            5,000 ceiling for people insured before May 2010.
          </li>
        </ul>
      </details>
    </div>
  );
};
