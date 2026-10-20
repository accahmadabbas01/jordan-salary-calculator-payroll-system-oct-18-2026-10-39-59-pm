import React, { useMemo, useState } from 'react';
import { Company, Employee, PayrollRuleSet } from '../../types';
import { getMonthName, getRuleSetForPeriod, YEAR_OPTIONS } from '../../utils/calculator';
import { computeIncomeTax, sscIsDeductible } from '../../utils/incomeTax';
import { ruleBranches } from '../../utils/ssc';
import { packageAmounts } from '../../utils/maternity';
import { Receipt, Users, Info, Target } from 'lucide-react';

interface Props {
  company: Company;
  employees: Employee[];
  year: number;
  month: number;
}

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (r: number) => `${(Math.round(r * 10000) / 100).toString()}%`;

/** Employee SSC for a monthly wage under a rule set (rates and ceiling from the rules). */
function autoSsc(rs: PayrollRuleSet, wage: number): number {
  const b = ruleBranches(rs).employee;
  const rate = b.oldAge + b.workInjury + b.maternity + b.unemployment;
  const insured = rs.sscCeiling > 0 ? Math.min(wage, rs.sscCeiling) : wage;
  return Math.round(Math.max(insured, 0) * rate * 100) / 100;
}

/** Field label with Arabic caption (module level so inputs keep focus while typing). */
const Label: React.FC<{ en: string; ar: string; hint?: string; children: React.ReactNode }> = ({ en, ar, hint, children }) => (
  <label className="block">
    <span className="block text-slate-600 dark:text-slate-400 mb-0.5">
      {en} <span className="font-arabic text-slate-400">· {ar}</span>
    </span>
    {children}
    {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);


/** Income Tax Calculator: what-if calculations with the same engine payroll uses. */
export const IncomeTaxCalculatorScreen: React.FC<Props> = ({ company, employees, year: appYear, month }) => {
  const [year, setYear] = useState(appYear);
  const rs = useMemo(() => getRuleSetForPeriod(year, month), [year, month]);

  const [empId, setEmpId] = useState('');
  const [monthlyPay, setMonthlyPay] = useState(1500);
  const [preTax, setPreTax] = useState(0);
  const [oneOff, setOneOff] = useState(0);
  const [sscMode, setSscMode] = useState<'auto' | 'manual'>('auto');
  const [sscWage, setSscWage] = useState<number | null>(null); // insured wage when different from pay
  const [manualSsc, setManualSsc] = useState(0);
  const [sscDeductOverride, setSscDeductOverride] = useState<boolean | null>(null);
  const [claimsFamily, setClaimsFamily] = useState(false);
  const [docTaxpayer, setDocTaxpayer] = useState(0);
  const [docSpouse, setDocSpouse] = useState(0);
  const [docChildren, setDocChildren] = useState(0);
  const [targetNet, setTargetNet] = useState(1000);

  // The documented-expense lines and their legal caps (taxpayer 1,000; spouse 1,000; children 3,000)
  const documented = Math.min(docTaxpayer, 1000) + Math.min(docSpouse, 1000) + Math.min(docChildren, 3000);

  const effectiveRules = useMemo(
    () => (rs && sscDeductOverride !== null ? { ...rs, taxDeductEmployeeSsc: sscDeductOverride } : rs),
    [rs, sscDeductOverride]
  );

  const run = (pay: number, bonus = oneOff) => {
    if (!effectiveRules) return null;
    const ssc = sscMode === 'manual' ? manualSsc : autoSsc(effectiveRules, sscWage ?? pay);
    const tax = computeIncomeTax({
      ruleSet: effectiveRules,
      monthlyRegular: Math.max(pay - preTax, 0),
      oneOff: bonus,
      monthlySsc: ssc,
      claimsFamily,
      documentedExpenses: documented,
    });
    return { ssc, tax, net: pay + bonus - ssc - tax.monthlyTax - preTax };
  };

  const result = run(monthlyPay);

  // Net → gross: smallest monthly pay whose net (no one-off) reaches the target
  const grossForNet = useMemo(() => {
    if (!effectiveRules || targetNet <= 0) return null;
    let lo = 0;
    let hi = Math.max(targetNet * 3, 1000);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const r = run(mid, 0);
      if (!r) return null;
      if (r.net >= targetNet) hi = mid;
      else lo = mid;
    }
    return Math.ceil(hi * 100) / 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetNet, effectiveRules, preTax, sscMode, manualSsc, sscWage, claimsFamily, documented]);

  const loadEmployee = (id: string) => {
    setEmpId(id);
    const emp = employees.find((e) => e.empId === id);
    if (!emp) return;
    const { amounts, earnings } = packageAmounts(emp);
    const basic = amounts.basic;
    const taxablePay =
      amounts.basic + amounts.housing + amounts.transport + amounts.other_allow +
      earnings.filter((e) => e.taxable).reduce((s, e) => s + e.amount, 0);
    const pre = (emp.deductions || [])
      .filter((d) => d.preTax)
      .reduce((s, d) => s + (d.method === 'percent' ? Math.round(basic * d.value) / 100 : d.value), 0);
    const sscPay = amounts.basic + amounts.housing + amounts.transport + amounts.other_allow +
      earnings.filter((e) => e.ssc).reduce((s, e) => s + e.amount, 0);
    setMonthlyPay(Math.round(taxablePay * 100) / 100);
    setPreTax(Math.round(pre * 100) / 100);
    setSscWage(emp.sscWage && emp.sscWage > 0 ? emp.sscWage : Math.round(sscPay * 100) / 100);
    setSscMode(emp.sscExempt || emp.sscCoverage === 'exempt' || emp.sscCoverage === 'injury_only' ? 'manual' : 'auto');
    setManualSsc(0);
    setClaimsFamily(!!emp.claimsFamily);
    // The employee record keeps one documented-expenses total: show it on the taxpayer line
    const extra = emp.extraExemption || 0;
    setDocTaxpayer(Math.min(extra, 1000));
    setDocSpouse(Math.min(Math.max(extra - 1000, 0), 1000));
    setDocChildren(Math.min(Math.max(extra - 2000, 0), 3000));
    setOneOff(0);
  };

  const field = 'w-full px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded font-mono';
  const num = (v: number, set: (n: number) => void, max?: number) => (
    <input
      type="number"
      min={0}
      max={max}
      value={v}
      onChange={(e) => set(Math.max(0, parseFloat(e.target.value) || 0))}
      className={field}
    />
  );
  const referencePays = [500, 750, 1000, 1500, 2000, 3000, 5000, 10000];

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-500" />
            <span>
              Income Tax Calculator <span className="font-arabic text-slate-500">· حاسبة ضريبة الدخل</span>
            </span>
          </h2>
          <p className="text-slate-500">
            Same engine as payroll. Rules: <strong>{rs?.name || 'none'}</strong>. Yellow fields are inputs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500">Tax year</span>
          <select value={year} onChange={(e) => setYear(+e.target.value)} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800">
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <Users className="w-4 h-4 text-slate-400 ml-2" />
          <select value={empId} onChange={(e) => loadEmployee(e.target.value)} className="px-2 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 max-w-[240px]">
            <option value="">Load an employee…</option>
            {employees
              .filter((e) => e.status !== 'resigned')
              .map((e) => (
                <option key={e.empId} value={e.empId}>
                  {e.empId} · {e.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {!rs || !result ? (
        <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border text-center text-slate-500">No payroll rules for {year}.</div>
      ) : result.tax.manual ? (
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300">
          Income tax for {year} is not modelled (before 2010) — it is entered manually in Salary Entry.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Inputs */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="space-y-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Pay · الدخل</h3>
              <Label en="Regular taxable pay / month" ar="الراتب الشهري الخاضع" hint="Basic + taxable allowances (not tax-free ones)">
                {num(monthlyPay, setMonthlyPay)}
              </Label>
              <Label en="Pre-tax deductions / month" ar="اقتطاعات قبل الضريبة" hint="e.g. provident fund, health insurance marked before tax">
                {num(preTax, setPreTax)}
              </Label>
              <Label en="One-off pay this month" ar="مبالغ غير شهرية (مكافأة)" hint="Bonus or other earnings — taxed in this month only, not ×12">
                {num(oneOff, setOneOff)}
              </Label>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Social Security · الضمان</h3>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={sscMode === 'auto'} onChange={() => setSscMode('auto')} /> From {year} rules
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={sscMode === 'manual'} onChange={() => setSscMode('manual')} /> Enter amount
                </label>
              </div>
              {sscMode === 'auto' ? (
                <Label en="Insured wage" ar="الأجر الخاضع للضمان" hint={`Leave empty to use the pay. Ceiling ${rs.sscCeiling ? fmt(rs.sscCeiling) : 'none'}.`}>
                  <input
                    type="number"
                    min={0}
                    value={sscWage ?? ''}
                    placeholder={String(monthlyPay)}
                    onChange={(e) => setSscWage(e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0))}
                    className={field}
                  />
                </Label>
              ) : (
                <Label en="Employee SSC / month" ar="اشتراك الموظف الشهري">
                  {num(manualSsc, setManualSsc)}
                </Label>
              )}
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={sscDeductOverride ?? sscIsDeductible(rs)}
                  onChange={(e) => setSscDeductOverride(e.target.checked)}
                />
                <span>
                  Deduct employee SSC from taxable income
                  <span className="block text-[10px] text-slate-400">
                    Payroll setting: {sscIsDeductible(rs) ? 'deducted' : 'not deducted'} (Company Settings → Payroll Rules)
                  </span>
                </span>
              </label>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-slate-200">Exemptions · الإعفاءات</h3>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={claimsFamily} onChange={(e) => setClaimsFamily(e.target.checked)} />
                Dependants exemption ({fmt(rs.familyExemption, 0)}) <span className="font-arabic text-slate-400">· إعفاء المعالين</span>
              </label>
              <p className="text-[10px] text-slate-500">
                Documented expenses (medical, education, rent, housing-loan interest) — yearly, max{' '}
                {fmt(rs.documentedExpensesMax, 0)} in {year}:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Label en="Taxpayer" ar="المكلف" hint="max 1,000">
                  {num(docTaxpayer, setDocTaxpayer, 1000)}
                </Label>
                <Label en="Spouse" ar="الزوج/ة" hint="max 1,000">
                  {num(docSpouse, setDocSpouse, 1000)}
                </Label>
                <Label en="Children" ar="الأبناء" hint="1,000 each, max 3,000">
                  {num(docChildren, setDocChildren, 3000)}
                </Label>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="xl:col-span-2 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Tax this month', 'ضريبة هذا الشهر', fmt(result.tax.monthlyTax), true],
                ['Regular monthly tax', 'الضريبة الشهرية', fmt(result.tax.monthlyRegularTax), false],
                ['Tax on one-off pay', 'ضريبة المكافأة', fmt(result.tax.oneOffTax), false],
                ['Net pay this month', 'صافي الراتب', fmt(result.net), false],
                ['Annual taxable income', 'الدخل الخاضع السنوي', fmt(result.tax.annualTaxable), false],
                ['Annual tax', 'الضريبة السنوية', fmt(result.tax.annualTax + result.tax.annualNationalContribution), false],
                ['Effective rate', 'النسبة الفعلية', pct(result.tax.effectiveRate), false],
                ['Marginal rate', 'الشريحة الحدية', pct(result.tax.marginalRate), false],
              ].map(([en, ar, v, dark]) => (
                <div
                  key={en as string}
                  className={`p-3 rounded-lg border ${dark ? 'bg-slate-900 text-white border-slate-900' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}
                >
                  <div className={`text-[10px] ${dark ? 'text-slate-300' : 'text-slate-500'}`}>
                    {en} <span className="font-arabic">· {ar}</span>
                  </div>
                  <div className="mt-1 text-sm font-bold font-mono tabular-nums">{v as string}</div>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200">How it is calculated (annual)</h3>
              <table className="w-full">
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  <tr>
                    <td className="py-1.5 font-sans">Regular pay × 12 (after pre-tax deductions)</td>
                    <td className="py-1.5 text-right">{fmt(result.tax.annualRegular)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">− Employee SSC × 12 {result.tax.sscDeductible ? '' : '(not deducted)'}</td>
                    <td className="py-1.5 text-right">{fmt(-result.tax.annualSscDeducted)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">− Personal exemption</td>
                    <td className="py-1.5 text-right">{fmt(-result.tax.exemptions.personal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">− Dependants exemption</td>
                    <td className="py-1.5 text-right">{fmt(-result.tax.exemptions.family)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-sans">− Documented expenses</td>
                    <td className="py-1.5 text-right">{fmt(-result.tax.exemptions.documented)}</td>
                  </tr>
                  {result.tax.exemptions.capped && (
                    <tr>
                      <td className="py-1.5 font-sans text-amber-600" colSpan={2}>
                        Exemptions capped at {fmt(rs.totalExemptionsCeiling, 0)}
                      </td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td className="py-1.5 font-sans">= Taxable income</td>
                    <td className="py-1.5 text-right">{fmt(result.tax.annualTaxable)}</td>
                  </tr>
                </tbody>
              </table>

              <table className="w-full">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-1.5 text-left">Bracket · الشريحة</th>
                    <th className="py-1.5 text-right">Rate</th>
                    <th className="py-1.5 text-right">Amount in bracket</th>
                    <th className="py-1.5 text-right">Tax</th>
                    <th className="py-1.5 w-1/4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {result.tax.brackets.map((b, i) => {
                    const width = b.to === null ? b.amount : b.to - b.from;
                    const fill = width > 0 ? Math.min(100, (b.amount / width) * 100) : 0;
                    return (
                      <tr key={i} className={b.amount > 0 ? '' : 'text-slate-400'}>
                        <td className="py-1.5">
                          {fmt(b.from, 0)} – {b.to === null ? '∞' : fmt(b.to, 0)}
                        </td>
                        <td className="py-1.5 text-right">{pct(b.rate)}</td>
                        <td className="py-1.5 text-right">{fmt(b.amount)}</td>
                        <td className="py-1.5 text-right">{fmt(b.tax)}</td>
                        <td className="py-1.5 pl-3">
                          <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${b.to === null && b.amount > 0 ? 100 : fill}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {result.tax.annualNationalContribution > 0 && (
                    <tr>
                      <td className="py-1.5 font-sans" colSpan={3}>
                        National contribution ({pct(rs.nationalContribution!.rate)} above {fmt(rs.nationalContribution!.threshold, 0)})
                      </td>
                      <td className="py-1.5 text-right">{fmt(result.tax.annualNationalContribution)}</td>
                      <td />
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td className="py-1.5 font-sans" colSpan={3}>
                      Annual tax → ÷ 12 = {fmt(result.tax.monthlyRegularTax)} per month
                    </td>
                    <td className="py-1.5 text-right">{fmt(result.tax.annualTax + result.tax.annualNationalContribution)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p className="text-slate-500">{result.tax.explanation}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-500" /> Net → gross · من الصافي إلى الإجمالي
                </h3>
                <Label en="Wanted net pay / month" ar="الصافي المطلوب">
                  {num(targetNet, setTargetNet)}
                </Label>
                {grossForNet !== null && (
                  <p>
                    Regular pay needed: <strong className="font-mono">{fmt(grossForNet)}</strong>{' '}
                    <span className="text-slate-500">(same SSC, deductions and exemptions as on the left)</span>
                  </p>
                )}
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Quick reference — monthly tax by pay</h3>
                <table className="w-full font-mono">
                  <thead className="text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="text-left py-1">Pay</th>
                      <th className="text-right py-1">SSC</th>
                      <th className="text-right py-1">Tax</th>
                      <th className="text-right py-1">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {referencePays.map((p) => {
                      const r = run(p, 0);
                      return (
                        <tr key={p}>
                          <td className="py-1">{fmt(p, 0)}</td>
                          <td className="py-1 text-right">{fmt(r?.ssc || 0)}</td>
                          <td className="py-1 text-right">{fmt(r?.tax.monthlyTax || 0)}</td>
                          <td className="py-1 text-right">{fmt(r?.net || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[10px] text-slate-500 mt-1">Uses the exemptions and settings on the left, no one-off pay.</p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300 flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <ul className="list-disc list-inside space-y-0.5">
                <li>
                  {getMonthName(month)} {year}: personal exemption {fmt(rs.personalExemption, 0)}, dependants {fmt(rs.familyExemption, 0)},
                  documented expenses up to {fmt(rs.documentedExpensesMax, 0)}, all exemptions max {fmt(rs.totalExemptionsCeiling, 0)}.
                </li>
                <li>One-off pay (bonus) is taxed only in the month it is paid: tax with it minus tax without it.</li>
                <li>Tax-free allowances (marked "tax-free" in company types) should not be included in taxable pay.</li>
                <li>Whether the employee's SSC is deductible is disputed between published guides — the payroll setting is in Payroll Rules.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
