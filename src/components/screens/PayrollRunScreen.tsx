import React, { useState, useMemo } from 'react';
import {
  Company,
  Employee,
  SalaryRecord,
  SalaryDeductionItem,
  Loan,
  MonthlyInput,
  UserRole,
} from '../../types';
import {
  formatCurrency,
  calculatePayroll,
  isEmployedInMonth,
  roundHalfUp,
  getMonthName,
  getRuleSetForPeriod, YEAR_OPTIONS } from '../../utils/calculator';
import { PlayCircle, AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';

interface PayrollRunScreenProps {
  company: Company;
  allAccessibleCompanies: Company[];
  employees: Employee[];
  records: SalaryRecord[];
  loans: Loan[];
  monthlyInputs: MonthlyInput[];
  initialYear: number;
  initialMonth: number;
  userRole?: UserRole;
  onExecutePayrollRun: (newRecords: SalaryRecord[]) => Promise<{ created: number; replaced: number; skipped: number }>;
}

export const PayrollRunScreen: React.FC<PayrollRunScreenProps> = ({
  company,
  allAccessibleCompanies,
  employees,
  records,
  loans,
  monthlyInputs,
  initialYear,
  initialMonth,
  userRole = 'viewer',
  onExecutePayrollRun,
}) => {
  const [fromMonth, setFromMonth] = useState(initialMonth);
  const [fromYear, setFromYear] = useState(initialYear);
  const [toMonth, setToMonth] = useState(initialMonth);
  const [toYear, setToYear] = useState(initialYear);
  const [scope, setScope] = useState<'this_company' | 'all_companies'>('this_company');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runResult, setRunResult] = useState<{ created: number; replaced: number; skipped: number } | null>(null);

  // Generate sequence of months
  const monthSequence = useMemo(() => {
    const seq: { year: number; month: number }[] = [];
    let curY = fromYear;
    let curM = fromMonth;
    const endY = toYear;
    const endM = toMonth;

    let count = 0;
    while (count < 24) {
      if (curY > endY || (curY === endY && curM > endM)) break;
      seq.push({ year: curY, month: curM });
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
      count++;
    }
    return seq;
  }, [fromYear, fromMonth, toYear, toMonth]);

  const targetCompanies = scope === 'this_company' ? [company] : allAccessibleCompanies;

  // Build simulated preview records with progressive loan deduction tracking
  const previewData = useMemo(() => {
    const list: {
      companyName: string;
      year: number;
      month: number;
      empId: string;
      name: string;
      action: 'New' | 'Replace' | 'Kept';
      gross: number;
      ssc: number;
      tax: number;
      net: number;
      warning?: string;
      record: SalaryRecord;
    }[] = [];

    // Track running loans across chronological months in the run
    const loanPaidMap: Record<string, number> = {};

    // Seed loanPaidMap from historical records before the run range
    for (const l of loans) {
      const priorPaid = records
        .filter((r) => {
          if (r.companyId !== l.companyId || r.empId !== l.empId) return false;
          if (r.year < fromYear) return true;
          if (r.year === fromYear && r.month < fromMonth) return true;
          return false;
        })
        .reduce((sum, r) => {
          const it = r.deductions.find((d) => d.loanId === l.id);
          return sum + (it ? it.amount : 0);
        }, 0);
      loanPaidMap[l.id] = priorPaid;
    }

    for (const period of monthSequence) {
      const pRule = getRuleSetForPeriod(period.year, period.month);
      const lastDay = new Date(period.year, period.month, 0).getDate();
      const pMonthStr = period.month < 10 ? `0${period.month}` : `${period.month}`;
      const payDate = `${period.year}-${pMonthStr}-${lastDay}`;

      for (const comp of targetCompanies) {
        const compEmps = employees.filter((e) => e.companyId === comp.id);

        for (const emp of compEmps) {
          if (!isEmployedInMonth(emp, period.year, period.month)) {
            continue;
          }

          const existing = records.find(
            (r) =>
              r.companyId === comp.id &&
              r.empId === emp.empId &&
              r.year === period.year &&
              r.month === period.month
          );

          let action: 'New' | 'Replace' | 'Kept' = 'New';
          if (existing) {
            action = replaceExisting ? 'Replace' : 'Kept';
          }

          if (action === 'Kept' && existing) {
            // Keep loan deductions from existing record
            for (const d of existing.deductions) {
              if (d.loanId) {
                loanPaidMap[d.loanId] = (loanPaidMap[d.loanId] || 0) + d.amount;
              }
            }

            list.push({
              companyName: comp.name,
              year: period.year,
              month: period.month,
              empId: emp.empId,
              name: emp.name,
              action: 'Kept',
              gross: existing.gross,
              ssc: existing.amounts.social_sec || 0,
              tax: existing.amounts.income_tax || 0,
              net: existing.net,
              record: existing,
            });
            continue;
          }

          // Build record
          const basic = emp.package?.basic || 0;
          const amounts = {
            basic,
            housing: emp.package?.housing || 0,
            transport: emp.package?.transport || 0,
            other_allow: emp.package?.other_allow || 0,
            overtime: 0,
            bonus: 0,
            other_earn: 0,
            social_sec: 0,
            income_tax: 0,
            other_ded: 0,
            advance: 0,
            unpaid_leave: 0,
          };

          const earnings = (emp.allowances || []).map((a) => ({
            name: a.name,
            amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
            taxable: a.taxable,
            ssc: a.ssc,
          }));

          const deductions: SalaryDeductionItem[] = (emp.deductions || []).map((d) => ({
            name: d.name,
            amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
            preTax: d.preTax,
          }));

          // Process active loans with balance carry-forward
          const empLoans = loans.filter(
            (l) =>
              l.companyId === comp.id &&
              l.empId === emp.empId &&
              !l.settled &&
              (period.year > l.startYear || (period.year === l.startYear && period.month >= l.startMonth))
          );

          for (const l of empLoans) {
            const paid = loanPaidMap[l.id] || 0;
            const remaining = Math.max(0, l.total - paid);
            if (remaining > 0) {
              const installment = Math.min(l.installment, remaining);
              deductions.push({
                name: l.description,
                amount: installment,
                preTax: false,
                loanId: l.id,
              });
              loanPaidMap[l.id] = paid + installment;
            }
          }

          // Monthly inputs
          const empInputs = monthlyInputs.filter(
            (inp) =>
              inp.companyId === comp.id &&
              inp.empId === emp.empId &&
              inp.year === period.year &&
              inp.month === period.month
          );
          const inputNotes: string[] = [];
          for (const inp of empInputs) {
            if (inp.notes) inputNotes.push(inp.notes);
            if (inp.kind === 'salary' && inp.item in amounts) {
              (amounts as any)[inp.item] = inp.amount;
            } else if (inp.kind === 'allowance') {
              const idx = earnings.findIndex((e) => e.name.toLowerCase() === inp.item.toLowerCase());
              if (inp.amount === 0) {
                if (idx >= 0) earnings.splice(idx, 1);
              } else if (idx >= 0) {
                earnings[idx].amount = inp.amount;
              } else {
                earnings.push({
                  name: inp.item,
                  amount: inp.amount,
                  taxable: true,
                  ssc: true,
                });
              }
            } else if (inp.kind === 'deduction') {
              const idx = deductions.findIndex(
                (d) => d.name.toLowerCase() === inp.item.toLowerCase() && !d.loanId
              );
              if (inp.amount === 0) {
                if (idx >= 0) deductions.splice(idx, 1);
              } else if (idx >= 0) {
                deductions[idx].amount = inp.amount;
              } else {
                deductions.push({
                  name: inp.item,
                  amount: inp.amount,
                  preTax: false,
                });
              }
            }
          }

          const calc = calculatePayroll(
            emp,
            period.year,
            period.month,
            amounts,
            earnings,
            deductions,
            emp.claimsFamily,
            emp.extraExemption
          );

          amounts.social_sec = calc.ssc;
          amounts.income_tax = calc.incomeTax;

          const rec: SalaryRecord = {
            id: `${comp.id}_${emp.empId}_${period.year}_${period.month}`,
            companyId: comp.id,
            empId: emp.empId,
            name: emp.name,
            nameAr: emp.nameAr,
            title: emp.title,
            dept: emp.department,
            year: period.year,
            month: period.month,
            payDate,
            payMethod: 'Bank transfer',
            currency: comp.currency || 'JOD',
            amounts,
            earnings,
            deductions,
            gross: calc.gross,
            totalDed: calc.totalDed,
            net: calc.net,
            notes: inputNotes.join('; '),
            claimsFamily: !!emp.claimsFamily,
            extraExemption: emp.extraExemption || 0,
            autoCalc: true,
          };

          list.push({
            companyName: comp.name,
            year: period.year,
            month: period.month,
            empId: emp.empId,
            name: emp.name,
            action,
            gross: calc.gross,
            ssc: calc.ssc,
            tax: calc.incomeTax,
            net: calc.net,
            warning: !pRule ? `No payroll rules for year ${period.year}` : undefined,
            record: rec,
          });
        }
      }
    }

    return list;
  }, [
    monthSequence,
    targetCompanies,
    employees,
    records,
    loans,
    monthlyInputs,
    replaceExisting,
    fromYear,
    fromMonth,
  ]);

  const newCount = previewData.filter((p) => p.action === 'New').length;
  const replaceCount = previewData.filter((p) => p.action === 'Replace').length;
  const keptCount = previewData.filter((p) => p.action === 'Kept').length;

  const handleExecute = async () => {
    setIsExecuting(true);
    const recordsToExecute = previewData
      .filter((p) => p.action === 'New' || p.action === 'Replace')
      .map((p) => p.record);

    try {
      const res = await onExecutePayrollRun(recordsToExecute);
      setRunResult(res);
    } catch (e) {
      alert('Error running bulk payroll: ' + String(e));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Configuration Header Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-emerald-500" />
            <span>Bulk Payroll Run</span>
          </h2>
          <p className="text-xs text-slate-500">
            Generate and process payroll records for one month or across a chronological range of months.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* From Period */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
              From Period
            </label>
            <div className="flex gap-2">
              <select
                value={fromMonth}
                onChange={(e) => setFromMonth(parseInt(e.target.value, 10))}
                className="w-1/2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} - {getMonthName(m).substring(0, 3)}
                  </option>
                ))}
              </select>
              <select
                value={fromYear}
                onChange={(e) => setFromYear(parseInt(e.target.value, 10))}
                className="w-1/2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* To Period */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
              To Period
            </label>
            <div className="flex gap-2">
              <select
                value={toMonth}
                onChange={(e) => setToMonth(parseInt(e.target.value, 10))}
                className="w-1/2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} - {getMonthName(m).substring(0, 3)}
                  </option>
                ))}
              </select>
              <select
                value={toYear}
                onChange={(e) => setToYear(parseInt(e.target.value, 10))}
                className="w-1/2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
              Company Scope
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              <option value="this_company">This Company Only ({company.name})</option>
              <option value="all_companies">
                All My Companies ({allAccessibleCompanies.length})
              </option>
            </select>
          </div>

          {/* Options */}
          <div className="flex flex-col justify-end">
            <label className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/80 rounded border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 text-slate-900 rounded"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Replace records that already exist
              </span>
            </label>
          </div>
        </div>

        {/* Action Summary Pill Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">Preview Summary:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {newCount} New
            </span>
            <span>·</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {replaceCount} Replace
            </span>
            <span>·</span>
            <span className="font-semibold text-slate-500">{keptCount} Kept (Skipped)</span>
          </div>

          {userRole !== 'viewer' && (
            <button
              type="button"
              disabled={isExecuting || (newCount === 0 && replaceCount === 0)}
              onClick={handleExecute}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  <span>Execute Run ({newCount + replaceCount} Records)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Preview Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-800 dark:text-slate-200 flex justify-between">
          <span>Run Preview Table</span>
          <span className="font-normal text-slate-500">
            {previewData.length} total entries checked
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Period</th>
                {scope === 'all_companies' && <th className="px-3 py-2.5">Company</th>}
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5 text-center">Action</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">SSC</th>
                <th className="px-3 py-2.5 text-right">Tax</th>
                <th className="px-3 py-2.5 text-right">Net</th>
                <th className="px-3 py-2.5">Notes / Warnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {previewData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No active employees in the selected period.
                  </td>
                </tr>
              ) : (
                previewData.map((p, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                      p.action === 'Kept' ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                      {p.month}/{p.year}
                    </td>
                    {scope === 'all_companies' && (
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                        {p.companyName}
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {p.empId}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[150px]">
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.action === 'New'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : p.action === 'Replace'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {p.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(p.gross, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(p.ssc, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(p.tax, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(p.net, '')}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {p.warning ? (
                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {p.warning}
                        </span>
                      ) : p.record.notes ? (
                        <span className="truncate block max-w-[160px]">{p.record.notes}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Result Modal */}
      {runResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 text-xs space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bulk Payroll Run Completed
                </h3>
                <p className="text-slate-500">Records processed successfully</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Created New Records:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {runResult.created}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Replaced Existing Records:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {runResult.replaced}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Skipped (Existing Kept):</span>
                <span className="font-bold text-slate-500 font-mono">{runResult.skipped}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRunResult(null)}
                className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-medium rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
