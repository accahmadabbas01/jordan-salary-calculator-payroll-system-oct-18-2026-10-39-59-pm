import React, { useState } from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { formatCurrency, getMonthName, YEAR_OPTIONS } from '../../utils/calculator';
import { Search, Download, Filter, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SalaryHistoryScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  onOpenSalaryEntry: (empId: string, year: number, month: number) => void;
}

export const SalaryHistoryScreen: React.FC<SalaryHistoryScreenProps> = ({
  company,
  employees,
  records,
  onOpenSalaryEntry,
}) => {
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [search, setSearch] = useState('');

  const companyRecords = records.filter((r) => r.companyId === company.id);

  const filtered = companyRecords.filter((r) => {
    if (selectedYear !== 'all' && r.year !== parseInt(selectedYear, 10)) return false;
    if (selectedMonth !== 'all' && r.month !== parseInt(selectedMonth, 10)) return false;
    if (selectedEmpId !== 'all' && r.empId !== selectedEmpId) return false;
    if (search) {
      const q = search.toLowerCase().trim();
      return (
        r.empId.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.dept && r.dept.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate totals
  const totalGross = filtered.reduce((s, r) => s + r.gross, 0);
  const totalSsc = filtered.reduce((s, r) => s + (r.amounts.social_sec || 0), 0);
  const totalTax = filtered.reduce((s, r) => s + (r.amounts.income_tax || 0), 0);
  const totalDed = filtered.reduce((s, r) => s + r.totalDed, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net, 0);

  const handleExportExcel = () => {
    const rows = filtered.map((r) => ({
      Year: r.year,
      Month: r.month,
      'Employee ID': r.empId,
      'Full Name': r.name,
      Department: r.dept || '',
      'Payment Date': r.payDate,
      'Basic Salary': r.amounts.basic || 0,
      Gross: r.gross,
      'Social Security': r.amounts.social_sec || 0,
      'Income Tax': r.amounts.income_tax || 0,
      'Total Deductions': r.totalDed,
      'Net Salary': r.net,
      Notes: r.notes || '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Records');
    XLSX.writeFile(wb, `Salary_History_${company.name.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-56">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search records..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
            >
              <option value="all">All Years</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md"
            >
              <option value="all">All Months</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m} - {getMonthName(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Staff:</span>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md max-w-[180px] truncate"
            >
              <option value="all">All Employees ({employees.length})</option>
              {employees.map((e) => (
                <option key={e.empId} value={e.empId}>
                  {e.empId} - {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportExcel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export History</span>
        </button>
      </div>

      {/* Salary Records Table with Totals Row */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Period</th>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Full Name</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5 text-right">Gross Salary</th>
                <th className="px-3 py-2.5 text-right">Social Security</th>
                <th className="px-3 py-2.5 text-right">Income Tax</th>
                <th className="px-3 py-2.5 text-right">Total Ded.</th>
                <th className="px-3 py-2.5 text-right">Net Salary</th>
                <th className="px-3 py-2.5">Paid On</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    No salary records match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onOpenSalaryEntry(r.empId, r.year, r.month)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                      {r.month < 10 ? `0${r.month}` : r.month}/{r.year}
                    </td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {r.empId}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                      {r.name}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.dept || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.gross, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.amounts.social_sec || 0, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.amounts.income_tax || 0, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(r.totalDed, '')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatCurrency(r.net, '')}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{r.payDate || '-'}</td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onOpenSalaryEntry(r.empId, r.year, r.month)}
                        className="text-xs text-blue-600 hover:underline flex items-center justify-center mx-auto gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                  <td colSpan={4} className="px-3 py-2.5 text-slate-900 dark:text-slate-100">
                    TOTAL ({filtered.length} records)
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatCurrency(totalGross, '')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatCurrency(totalSsc, '')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatCurrency(totalTax, '')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {formatCurrency(totalDed, '')}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totalNet, '')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
