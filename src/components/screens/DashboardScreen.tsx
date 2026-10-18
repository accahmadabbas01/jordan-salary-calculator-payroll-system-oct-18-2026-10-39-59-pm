import React, { useState } from 'react';
import { Company, Employee, SalaryRecord, Loan, Clearance, ActivityLog, UserRole } from '../../types';
import { formatCurrency, isEmployedInMonth, getMonthName } from '../../utils/calculator';
import {
  Users,
  CheckCircle2,
  DollarSign,
  Shield,
  FileCheck2,
  AlertCircle,
  PlayCircle,
  CreditCard,
  UserMinus,
  Search,
  Eye,
  Trash2,
} from 'lucide-react';

interface DashboardScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  loans: Loan[];
  clearances: Clearance[];
  recentLogs: ActivityLog[];
  year: number;
  month: number;
  userRole?: UserRole;
  onNavigateToSalaryEntry: (empId: string) => void;
  onNavigateToPayrollRun: () => void;
  onDeleteRecord: (recordId: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  company,
  employees,
  records,
  loans,
  clearances,
  recentLogs,
  year,
  month,
  userRole = 'viewer',
  onNavigateToSalaryEntry,
  onNavigateToPayrollRun,
  onDeleteRecord,
}) => {
  const [tableSearch, setTableSearch] = useState('');

  // 1. Employees employed in this month
  const employedThisMonth = employees.filter((e) => isEmployedInMonth(e, year, month));
  const activeCount = employees.filter((e) => e.status === 'active').length;

  // 2. Month records
  const monthRecords = records.filter(
    (r) => r.companyId === company.id && r.year === year && r.month === month
  );

  const totalGross = monthRecords.reduce((s, r) => s + r.gross, 0);
  const totalSsc = monthRecords.reduce((s, r) => s + (r.amounts.social_sec || 0), 0);
  const totalTax = monthRecords.reduce((s, r) => s + (r.amounts.income_tax || 0), 0);
  const totalNet = monthRecords.reduce((s, r) => s + r.net, 0);

  // 3. Unpaid employees
  const paidEmpIds = new Set(monthRecords.map((r) => r.empId));
  const unpaidEmployees = employedThisMonth.filter((e) => !paidEmpIds.has(e.empId));

  // 4. Open loans calculation (using all historical company records)
  const openLoans = loans
    .filter((l) => l.companyId === company.id && !l.settled)
    .map((l) => {
      const emp = employees.find((e) => e.empId === l.empId);
      const paid = records
        .filter((r) => r.companyId === company.id && r.empId === l.empId)
        .reduce((sum, r) => {
          const item = r.deductions.find((d) => d.loanId === l.id);
          return sum + (item ? item.amount : 0);
        }, 0);
      const balance = Math.max(0, l.total - paid);
      return {
        ...l,
        employeeName: emp?.name || l.empId,
        balance,
      };
    })
    .filter((l) => l.balance > 0);

  // 5. Clearances in progress
  const pendingClearances = clearances.filter(
    (c) => c.companyId === company.id && c.status === 'draft'
  );

  // 6. 12-month net trend data
  const monthsData = [];
  for (let i = 11; i >= 0; i--) {
    let dMonth = month - i;
    let dYear = year;
    while (dMonth <= 0) {
      dMonth += 12;
      dYear -= 1;
    }
    const recs = records.filter(
      (r) => r.companyId === company.id && r.year === dYear && r.month === dMonth
    );
    const mNet = recs.reduce((s, r) => s + r.net, 0);
    monthsData.push({
      year: dYear,
      month: dMonth,
      label: `${getMonthName(dMonth).substring(0, 3)} ${dYear}`,
      net: mNet,
      isCurrent: dYear === year && dMonth === month,
    });
  }

  const maxNet = Math.max(...monthsData.map((m) => m.net), 1000);

  // Filtered month table
  const filteredMonthRecords = monthRecords.filter((r) => {
    const q = tableSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      r.empId.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.nameAr && r.nameAr.toLowerCase().includes(q)) ||
      (r.dept && r.dept.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Sample Company Banner if applicable */}
      {company.isSample && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-lg flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>Sample company – made-up data.</strong> This company is pre-populated for testing payroll calculations, loans, and reports.
            </span>
          </div>
        </div>
      )}

      {/* KPI Tiles for Selected Month */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Active Staff</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {activeCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Total company employees</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Paid This Month</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {monthRecords.length} <span className="text-xs font-normal text-slate-400">/ {employedThisMonth.length}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Employed in period</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Gross Salaries</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(totalGross, '')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{company.currency || 'JOD'}</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Social Security</span>
            <Shield className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(totalSsc, '')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Employee share (7.5%)</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-medium">Income Tax</span>
            <FileCheck2 className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
            {formatCurrency(totalTax, '')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Withheld monthly</div>
        </div>

        <div className="bg-slate-900 text-white p-4 rounded-lg shadow-2xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-medium">Net Payout</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
              Net
            </span>
          </div>
          <div className="mt-2 text-lg font-bold font-mono tabular-nums">
            {formatCurrency(totalNet, '')}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{company.currency || 'JOD'}</div>
        </div>
      </div>

      {/* Trend Bar Chart & Unpaid Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 12-Month Bar Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                12-Month Net Pay Trend
              </h2>
              <p className="text-xs text-slate-500">Historical monthly net payroll totals</p>
            </div>
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
              Selected: {getMonthName(month)} {year}
            </span>
          </div>

          <div className="h-44 flex items-end gap-2 pt-6">
            {monthsData.map((m, idx) => {
              const heightPercent = Math.max(8, Math.round((m.net / maxNet) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] py-0.5 px-1.5 rounded whitespace-nowrap z-10 pointer-events-none font-mono">
                    {formatCurrency(m.net, company.currency)}
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t h-32 flex items-end overflow-hidden">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t transition-all ${
                        m.isCurrent
                          ? 'bg-emerald-500'
                          : 'bg-slate-400 dark:bg-slate-600 hover:bg-slate-500'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate w-full text-center">
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Not Paid Yet Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Unpaid This Month
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {unpaidEmployees.length}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Employees employed in {getMonthName(month)} without a saved salary record.
            </p>

            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {unpaidEmployees.length === 0 ? (
                <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>All employed staff have been paid for this month!</span>
                </div>
              ) : (
                unpaidEmployees.map((emp) => (
                  <div
                    key={emp.empId}
                    className="py-1.5 flex items-center justify-between text-xs"
                  >
                    <div className="truncate">
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        {emp.empId}
                      </span>{' '}
                      <span className="text-slate-900 dark:text-slate-100">{emp.name}</span>
                    </div>
                    {userRole !== 'viewer' && (
                      <button
                        type="button"
                        onClick={() => onNavigateToSalaryEntry(emp.empId)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium whitespace-nowrap ml-2"
                      >
                        Enter
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {unpaidEmployees.length > 0 && userRole !== 'viewer' && (
            <button
              type="button"
              onClick={onNavigateToPayrollRun}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-xs font-medium rounded-lg transition-colors"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Run payroll for {getMonthName(month)}</span>
            </button>
          )}
        </div>
      </div>

      {/* Open Loans & Clearances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Open Loans */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>Open Staff Loans</span>
            </h2>
            <span className="text-xs text-slate-400">{openLoans.length} active</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {openLoans.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No active loans</div>
            ) : (
              openLoans.map((l) => (
                <div key={l.id} className="py-2 text-xs flex justify-between items-center">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {l.employeeName}
                    </div>
                    <div className="text-[11px] text-slate-400">{l.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(l.balance, '')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      inst: {formatCurrency(l.installment, '')}/mo
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Clearances in Progress */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-slate-500" />
              <span>Clearances in Progress</span>
            </h2>
            <span className="text-xs text-slate-400">{pendingClearances.length} drafts</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {pendingClearances.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No pending clearances</div>
            ) : (
              pendingClearances.map((c) => {
                const emp = employees.find((e) => e.empId === c.empId);
                return (
                  <div key={c.id} className="py-2 text-xs flex justify-between items-center">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {emp?.name || c.empId}
                      </div>
                      <div className="text-[11px] text-slate-400">Last day: {c.lastDay}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium">
                        Draft
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Recent Activity
          </h2>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {recentLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No recent logs</div>
            ) : (
              recentLogs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 text-[11px] space-y-0.5"
                >
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {log.action}
                    </span>
                    <span className="font-mono text-[10px]">
                      {new Date(log.when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 truncate">{log.details}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Month Records Table */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Salary Records for {getMonthName(month)} {year}
            </h2>
            <p className="text-xs text-slate-500">
              {monthRecords.length} record(s) processed for this period
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              placeholder="Search month records..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Employee Name</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">SSC (7.5%)</th>
                <th className="px-3 py-2.5 text-right">Tax</th>
                <th className="px-3 py-2.5 text-right">Total Ded.</th>
                <th className="px-3 py-2.5 text-right">Net Pay</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMonthRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                    No records found for {getMonthName(month)} {year}.
                  </td>
                </tr>
              ) : (
                filteredMonthRecords.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-3 py-2.5 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {r.empId}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.name}</div>
                      {r.nameAr && (
                        <div className="text-[11px] text-slate-500 font-arabic">{r.nameAr}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{r.dept || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.gross, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.amounts.social_sec || 0, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.amounts.income_tax || 0, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.totalDed, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(r.net, '')}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onNavigateToSalaryEntry(r.empId)}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                          title="View / Edit Salary"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {userRole !== 'viewer' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete salary record for ${r.name} (${getMonthName(month)} ${year})?`)) {
                                onDeleteRecord(r.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
