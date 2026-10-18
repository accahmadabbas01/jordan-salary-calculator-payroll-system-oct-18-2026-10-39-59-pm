import React, { useState } from 'react';
import { Company, Employee, Loan, SalaryRecord, UserRole } from '../../types';
import { formatCurrency, parseArabicIndicNumber, getMonthName } from '../../utils/calculator';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react';

interface LoansScreenProps {
  company: Company;
  employees: Employee[];
  loans: Loan[];
  records: SalaryRecord[];
  userRole?: UserRole;
  onSaveLoan: (loan: Loan) => void;
  onDeleteLoan: (loanId: string) => void;
}

export const LoansScreen: React.FC<LoansScreenProps> = ({
  company,
  employees,
  loans,
  records,
  userRole = 'viewer',
  onSaveLoan,
  onDeleteLoan,
}) => {
  const [search, setSearch] = useState('');
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Calculate dynamic paidBack and balance for every loan from historical salary records
  const loansWithBalance = loans.map((loan) => {
    const paidBack = records
      .filter((r) => r.companyId === loan.companyId && r.empId === loan.empId)
      .reduce((sum, r) => {
        const item = r.deductions.find((d) => d.loanId === loan.id);
        return sum + (item ? item.amount : 0);
      }, 0);

    const balance = Math.max(0, loan.total - paidBack);
    const emp = employees.find((e) => e.empId === loan.empId);

    let status: 'Open' | 'Paid' | 'Settled' = 'Open';
    if (loan.settled) {
      status = 'Settled';
    } else if (balance <= 0) {
      status = 'Paid';
    }

    return {
      ...loan,
      paidBack,
      balance,
      employeeName: emp?.name || loan.empId,
      employeeNameAr: emp?.nameAr,
      status,
    };
  });

  const filtered = loansWithBalance.filter((l) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      l.empId.toLowerCase().includes(q) ||
      l.employeeName.toLowerCase().includes(q) ||
      (l.employeeNameAr && l.employeeNameAr.toLowerCase().includes(q)) ||
      l.description.toLowerCase().includes(q)
    );
  });

  const handleOpenNew = () => {
    const firstEmp = employees[0];
    const now = new Date();
    const newLoan: Loan = {
      id: `loan_${company.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      companyId: company.id,
      empId: firstEmp?.empId || '',
      description: 'Staff loan',
      total: 500,
      installment: 100,
      startYear: now.getFullYear(),
      startMonth: now.getMonth() + 1,
      notes: '',
      settled: false,
    };
    setEditingLoan(newLoan);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (l: typeof loansWithBalance[0]) => {
    setEditingLoan({
      id: l.id,
      companyId: l.companyId,
      empId: l.empId,
      description: l.description,
      total: l.total,
      installment: l.installment,
      startYear: l.startYear,
      startMonth: l.startMonth,
      notes: l.notes,
      settled: l.settled,
      settledByClearanceId: l.settledByClearanceId,
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loans by employee, description..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
          />
        </div>

        {userRole !== 'viewer' && (
          <button
            type="button"
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md text-xs font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Staff Loan</span>
          </button>
        )}
      </div>

      {/* Loans Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 text-right">Loan Amount</th>
                <th className="px-3 py-3 text-right">Monthly Installment</th>
                <th className="px-3 py-3">First Month</th>
                <th className="px-3 py-3 text-right">Paid Back</th>
                <th className="px-3 py-3 text-right">Remaining Balance</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                    No staff loans recorded.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr
                    key={l.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        <span className="font-mono text-slate-500 mr-1.5">{l.empId}</span>
                        {l.employeeName}
                      </div>
                      {l.employeeNameAr && (
                        <div className="text-[11px] text-slate-400 font-arabic">
                          {l.employeeNameAr}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">
                      <div>{l.description}</div>
                      {l.notes && <div className="text-[10px] text-slate-400">{l.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                      {formatCurrency(l.total, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {formatCurrency(l.installment, '')}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                      {getMonthName(l.startMonth).substring(0, 3)} {l.startYear}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {formatCurrency(l.paidBack, '')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(l.balance, '')}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          l.status === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : l.status === 'Settled'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {userRole !== 'viewer' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(l)}
                              className="text-xs text-blue-600 hover:underline px-1 py-0.5"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (l.paidBack > 0) {
                                  if (
                                    !confirm(
                                      `Warning: ${formatCurrency(
                                        l.paidBack,
                                        company.currency
                                      )} has already been deducted across past salary records for this loan. Are you sure you want to delete it?`
                                    )
                                  ) {
                                    return;
                                  }
                                } else {
                                  if (!confirm(`Delete loan "${l.description}"?`)) return;
                                }
                                onDeleteLoan(l.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600"
                              title="Delete Loan"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
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

      {/* Add / Edit Loan Modal */}
      {isModalOpen && editingLoan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                <span>{editingLoan.id ? 'Staff Loan Details' : 'Create Staff Loan'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Employee *
                </label>
                <SearchableEmployeeSelect
                  employees={employees}
                  selectedEmpId={editingLoan.empId}
                  onSelect={(empId) => setEditingLoan({ ...editingLoan, empId })}
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Loan Description *
                </label>
                <input
                  type="text"
                  required
                  value={editingLoan.description}
                  onChange={(e) => setEditingLoan({ ...editingLoan, description: e.target.value })}
                  placeholder="e.g. Staff Personal Loan, Emergency Advance"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Total Loan Amount (JOD) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingLoan.total}
                    onChange={(e) =>
                      setEditingLoan({
                        ...editingLoan,
                        total: parseArabicIndicNumber(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Monthly Installment (JOD) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingLoan.installment}
                    onChange={(e) =>
                      setEditingLoan({
                        ...editingLoan,
                        installment: parseArabicIndicNumber(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    First Deduction Month *
                  </label>
                  <select
                    value={editingLoan.startMonth}
                    onChange={(e) =>
                      setEditingLoan({
                        ...editingLoan,
                        startMonth: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>
                        {m} - {getMonthName(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    First Deduction Year *
                  </label>
                  <select
                    value={editingLoan.startYear}
                    onChange={(e) =>
                      setEditingLoan({
                        ...editingLoan,
                        startYear: parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editingLoan.notes || ''}
                  onChange={(e) => setEditingLoan({ ...editingLoan, notes: e.target.value })}
                  placeholder="Optional internal comments or loan approval reference"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chk-settled"
                  checked={editingLoan.settled}
                  onChange={(e) => setEditingLoan({ ...editingLoan, settled: e.target.checked })}
                  className="w-4 h-4 text-slate-900 rounded border-slate-300"
                />
                <label htmlFor="chk-settled" className="text-slate-700 dark:text-slate-300 font-medium">
                  Mark as settled (stops automatic monthly deductions)
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 font-medium"
              >
                Cancel
              </button>
              {userRole !== 'viewer' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!editingLoan.empId) {
                      alert('Please select an employee.');
                      return;
                    }
                    if (editingLoan.total <= 0 || editingLoan.installment <= 0) {
                      alert('Loan amount and monthly installment must be greater than zero.');
                      return;
                    }
                    if (editingLoan.installment > editingLoan.total) {
                      alert('Monthly installment cannot be greater than total loan amount.');
                      return;
                    }
                    onSaveLoan(editingLoan);
                    setIsModalOpen(false);
                  }}
                  className="px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors"
                >
                  Save Loan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
