import React, { useMemo, useState } from 'react';
import { Company, Employee, MaternityLeave, SalaryRecord, UserRole } from '../../types';
import { formatCurrency, getMonthName, getRuleSetForPeriod } from '../../utils/calculator';
import {
  MATERNITY_LEAVE_DAYS,
  leaveDaysByMonth,
  leaveEndDate,
  maternityAllowance,
  maternityEligibility,
  packageAmounts,
} from '../../utils/maternity';
import { Baby, Plus, Pencil, Trash2, X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface MaternityLeaveScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  userRole?: UserRole;
  onSaveEmployee: (emp: Employee) => Promise<void> | void;
}

interface FormState {
  empId: string;
  leave: MaternityLeave;
}

const newLeave = (): MaternityLeave => ({
  id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  startDate: new Date().toISOString().substring(0, 10),
  days: MATERNITY_LEAVE_DAYS,
  eligibility: 'auto',
});

const rulesForStart = (leave: MaternityLeave) => {
  const [y, m] = leave.startDate.split('-').map(Number);
  return getRuleSetForPeriod(y, m);
};

export const MaternityLeaveScreen: React.FC<MaternityLeaveScreenProps> = ({
  company,
  employees,
  records,
  userRole = 'viewer',
  onSaveEmployee,
}) => {
  const cur = company.currency || 'JOD';
  const canEdit = userRole !== 'viewer';

  const leaves = useMemo(
    () =>
      employees
        .flatMap((emp) => (emp.maternityLeaves || []).map((leave) => ({ emp, leave })))
        .sort((a, b) => b.leave.startDate.localeCompare(a.leave.startDate)),
    [employees]
  );

  const [selectedId, setSelectedId] = useState<string | null>(leaves[0]?.leave.id || null);
  const [form, setForm] = useState<FormState | null>(null);

  const selected = leaves.find((l) => l.leave.id === selectedId) || leaves[0];
  const candidates = employees.filter((e) => e.gender !== 'male' && e.status !== 'resigned');

  const openNew = () => setForm({ empId: candidates[0]?.empId || '', leave: newLeave() });
  const openEdit = (emp: Employee, leave: MaternityLeave) => setForm({ empId: emp.empId, leave: { ...leave } });

  const saveForm = async () => {
    if (!form) return;
    const emp = employees.find((e) => e.empId === form.empId);
    if (!emp) return;
    // Remove from whoever had it before (the employee may have been changed in the form)
    const previousOwner = employees.find(
      (e) => e.empId !== emp.empId && (e.maternityLeaves || []).some((l) => l.id === form.leave.id)
    );
    if (previousOwner) {
      await onSaveEmployee({
        ...previousOwner,
        maternityLeaves: (previousOwner.maternityLeaves || []).filter((l) => l.id !== form.leave.id),
      });
    }
    const others = (emp.maternityLeaves || []).filter((l) => l.id !== form.leave.id);
    await onSaveEmployee({
      ...emp,
      gender: emp.gender || 'female',
      maternityLeaves: [...others, { ...form.leave, days: Math.max(1, Math.round(form.leave.days || 0)) }],
    });
    setSelectedId(form.leave.id);
    setForm(null);
  };

  const removeLeave = async (emp: Employee, leave: MaternityLeave) => {
    if (!confirm(`Delete the maternity leave of ${emp.name} starting ${leave.startDate}?`)) return;
    await onSaveEmployee({ ...emp, maternityLeaves: (emp.maternityLeaves || []).filter((l) => l.id !== leave.id) });
    if (selectedId === leave.id) setSelectedId(null);
  };

  // ---- Calculation for the selected leave --------------------------------------------------
  const detail = useMemo(() => {
    if (!selected) return null;
    const rs = rulesForStart(selected.leave);
    const eligibility = maternityEligibility(selected.emp, selected.leave, records, rs);
    const allowance = maternityAllowance(selected.emp, selected.leave, rs);
    const { monthlyWage } = packageAmounts(selected.emp);
    const months = leaveDaysByMonth(selected.leave).map((p) => {
      const mrs = getRuleSetForPeriod(p.year, p.month);
      const erRate = allowance.employerRate;
      return {
        ...p,
        salaryNotPaid: eligibility.eligible ? Math.round((monthlyWage / 30) * p.days * 100) / 100 : 0,
        employerSsc: Math.round((allowance.insuredWage / 30) * p.days * erRate * 100) / 100,
        hasRules: !!mrs,
      };
    });
    return { rs, eligibility, allowance, months, monthlyWage };
  }, [selected, records]);

  const input =
    'w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md';

  return (
    <div className="space-y-4 text-xs">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Baby className="w-4 h-4 text-pink-500" />
            <span>
              Maternity Leave <span className="font-arabic text-slate-500">· إجازة الأمومة</span>
            </span>
          </h2>
          <p className="text-slate-500">
            70 days paid by Social Security maternity insurance. Leave days are deducted from salary automatically in
            Salary Entry and Payroll Run.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={candidates.length === 0}
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Add Maternity Leave</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[720px]">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
            Leaves ({leaves.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {leaves.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No maternity leaves recorded.</div>
            ) : (
              leaves.map(({ emp, leave }) => {
                const elig = maternityEligibility(emp, leave, records, rulesForStart(leave));
                const isActive = selected?.leave.id === leave.id;
                return (
                  <div
                    key={leave.id}
                    onClick={() => setSelectedId(leave.id)}
                    className={`p-3 cursor-pointer ${
                      isActive ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-slate-500 mr-1.5">{emp.empId}</span>
                        {emp.name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          elig.eligible
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {elig.eligible ? 'SSC pays' : 'Employer pays'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      {leave.startDate} → {leaveEndDate(leave)} · {leave.days} days
                    </div>
                    {canEdit && (
                      <div className="flex justify-end gap-1 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(emp, leave);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLeave(emp, leave);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selected && detail ? (
            <>
              <div
                className={`p-3 rounded-lg border flex gap-2 ${
                  detail.eligibility.eligible
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'
                    : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'
                }`}
              >
                {detail.eligibility.eligible ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold">
                    {detail.eligibility.eligible
                      ? 'Eligible — SSC pays the maternity allowance; salary is not paid for the leave days.'
                      : 'Not eligible for the SSC allowance — the employer pays the full wage during the leave.'}
                  </div>
                  <div>{detail.eligibility.reason}</div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {selected.emp.name} — maternity allowance (SSC)
                </h3>
                <table className="w-full">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[
                      ['Insured wage at start of leave', detail.allowance.insuredWage, 'الأجر الخاضع للاقتطاع'],
                      ['Daily wage (÷ 30)', detail.allowance.dailyWage, 'الأجر اليومي'],
                      [`Allowance (× ${detail.allowance.days} days)`, detail.allowance.gross, 'بدل إجازة الأمومة'],
                      [
                        `Employee SSC share deducted by SSC (${(detail.allowance.employeeRate * 100).toFixed(2)}%)`,
                        -detail.allowance.employeeShare,
                        'حصة المؤمن عليها من الاشتراكات',
                      ],
                    ].map(([label, value, ar]) => (
                      <tr key={label as string}>
                        <td className="py-1.5 text-slate-600 dark:text-slate-400">
                          {label} <span className="font-arabic text-slate-400">· {ar}</span>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{formatCurrency(value as number, cur)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2 text-slate-900 dark:text-slate-100">
                        Net allowance paid to her by SSC <span className="font-arabic text-slate-400">· صافي البدل</span>
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(detail.eligibility.eligible ? detail.allowance.net : 0, cur)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-600 dark:text-slate-400">
                        Employer SSC share for the leave days ({(detail.allowance.employerRate * 100).toFixed(2)}% old age +
                        unemployment)
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">
                        {formatCurrency(detail.allowance.employerShare, cur)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Effect on payroll</h3>
                <table className="w-full">
                  <thead className="text-slate-500 text-[10px] uppercase tracking-wider">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-1.5 text-left">Month</th>
                      <th className="py-1.5 text-left">Leave days</th>
                      <th className="py-1.5 text-right">Salary not paid by employer</th>
                      <th className="py-1.5 text-right">Employer SSC on leave days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {detail.months.map((m) => (
                      <tr key={`${m.year}-${m.month}`}>
                        <td className="py-1.5 font-sans">
                          {getMonthName(m.month)} {m.year}
                        </td>
                        <td className="py-1.5">
                          {m.days} <span className="text-slate-400 text-[10px]">({m.from} → {m.to})</span>
                        </td>
                        <td className="py-1.5 text-right">{formatCurrency(m.salaryNotPaid, '')}</td>
                        <td className="py-1.5 text-right">{formatCurrency(m.employerSsc, '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-slate-500">
                  {detail.eligibility.eligible
                    ? 'Salary Entry and Payroll Run add a "Maternity leave — paid by SSC" deduction for these days. Her 7.5% is charged only on worked days; SSC takes it from the allowance for the leave days.'
                    : 'No salary deduction is made: the employer pays her normal wage during the leave.'}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-300 flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Leave: 70 days (10 weeks). Allowance = insured wage ÷ 30 × 70, paid by SSC in one payment once the child is registered.</li>
                  <li>Condition: 6 SSC contributions (continuous or not) in the 12 months before the leave, and at work in the month of birth.</li>
                  <li>Also paid if the child is stillborn after the 6th month of pregnancy or dies right after birth.</li>
                  <li>Working during the leave stops the allowance. SSC also offers a monthly childcare allowance for 6 months after the leave (applied for with SSC).</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-lg border border-slate-200 dark:border-slate-800 text-center text-slate-400">
              Select or add a maternity leave to see the SSC calculation.
            </div>
          )}
        </div>
      </div>

      {/* Add / edit modal */}
      {form && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {leaves.some((l) => l.leave.id === form.leave.id) ? 'Edit maternity leave' : 'Add maternity leave'}
              </h3>
              <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="block">
                <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Employee</span>
                <select value={form.empId} onChange={(e) => setForm({ ...form, empId: e.target.value })} className={input}>
                  {candidates.map((e) => (
                    <option key={e.empId} value={e.empId}>
                      {e.empId} — {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">First day of leave</span>
                  <input
                    type="date"
                    min="2000-01-01"
                    max="2100-12-31"
                    value={form.leave.startDate}
                    onChange={(e) => setForm({ ...form, leave: { ...form.leave, startDate: e.target.value } })}
                    className={`${input} font-mono`}
                  />
                </label>
                <label className="block">
                  <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Days</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={form.leave.days}
                    onChange={(e) => setForm({ ...form, leave: { ...form.leave, days: parseInt(e.target.value, 10) || 0 } })}
                    className={`${input} font-mono`}
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Child's date of birth (optional)</span>
                <input
                  type="date"
                  value={form.leave.childBirthDate || ''}
                  onChange={(e) =>
                    setForm({ ...form, leave: { ...form.leave, childBirthDate: e.target.value || undefined } })
                  }
                  className={`${input} font-mono`}
                />
              </label>
              <label className="block">
                <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">SSC allowance eligibility</span>
                <select
                  value={form.leave.eligibility}
                  onChange={(e) =>
                    setForm({ ...form, leave: { ...form.leave, eligibility: e.target.value as MaternityLeave['eligibility'] } })
                  }
                  className={input}
                >
                  <option value="auto">Check automatically (6 contributions in last 12 months)</option>
                  <option value="eligible">Eligible — SSC pays</option>
                  <option value="not_eligible">Not eligible — employer pays full wage</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Notes</span>
                <input
                  value={form.leave.notes || ''}
                  onChange={(e) => setForm({ ...form, leave: { ...form.leave, notes: e.target.value } })}
                  className={input}
                />
              </label>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-1.5 border rounded font-medium">
                Cancel
              </button>
              <button
                type="button"
                disabled={!form.empId || !form.leave.startDate || !(form.leave.days > 0)}
                onClick={saveForm}
                className="px-5 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
