import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CommentsButton } from '../common/Comments';
import {
  Company,
  Employee,
  Clearance,
  Loan,
  SalaryRecord,
  ClearanceReason,
  UserRole,
} from '../../types';
import {
  formatCurrency,
  calculateClearanceAmounts,
  parseArabicIndicNumber,
  roundHalfUp,
  calculateServiceLength,
} from '../../utils/calculator';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import { ClearanceDoc } from '../documents/ClearanceDoc';
import { exportHtmlToPdf, printHtmlElement } from '../../utils/pdf';
import {
  UserMinus,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  RotateCcw,
  Download,
  Printer,
  X,
  AlertTriangle,
  Info,
  Calendar,
} from 'lucide-react';

interface ClearancesScreenProps {
  company: Company;
  employees: Employee[];
  clearances: Clearance[];
  loans: Loan[];
  records: SalaryRecord[];
  userRole?: UserRole;
  onSaveClearance: (clearance: Clearance) => void;
  onCompleteClearance: (clearance: Clearance) => void;
  onReopenClearance: (clearanceId: string) => void;
  onDeleteClearance: (clearanceId: string) => void;
}

const DEFAULT_SIGN_OFFS = [
  { department: 'Direct Manager', departmentAr: 'المدير المباشر', cleared: false },
  { department: 'Human Resources', departmentAr: 'الموارد البشرية', cleared: false },
  { department: 'Finance', departmentAr: 'الدائرة المالية', cleared: false },
  { department: 'IT', departmentAr: 'تكنولوجيا المعلومات', cleared: false },
  { department: 'Administration', departmentAr: 'الشؤون الإدارية والعهدة', cleared: false },
];

export const ClearancesScreen: React.FC<ClearancesScreenProps> = ({
  company,
  employees,
  clearances,
  loans,
  records,
  userRole = 'viewer',
  onSaveClearance,
  onCompleteClearance,
  onReopenClearance,
  onDeleteClearance,
}) => {
  const companyClearances = clearances.filter((c) => c.companyId === company.id);

  const [activeClearanceId, setActiveClearanceId] = useState<string | null>(
    companyClearances[0]?.id || null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  // Clearance being edited in the wizard (null = creating a new one)
  const [editingClearance, setEditingClearance] = useState<Clearance | null>(null);
  // Set while loading a saved clearance so the employee-change reset does not wipe its values
  const skipNextResetRef = useRef(false);

  // Form State for New / Draft Clearance
  const [empId, setEmpId] = useState(employees[0]?.empId || '');
  const [hireDate, setHireDate] = useState('');
  const [lastDay, setLastDay] = useState(new Date().toISOString().substring(0, 10));
  const [reason, setReason] = useState<ClearanceReason>('Resignation');
  const [daysWorked, setDaysWorked] = useState(0);
  const [leaveDays, setLeaveDays] = useState(0);
  const [indemnityMonths, setIndemnityMonths] = useState(0);
  const [indemnityBasis, setIndemnityBasis] = useState<'wage' | 'basic'>('wage');
  const [noticeMonths, setNoticeMonths] = useState(0);
  const [deductLoans, setDeductLoans] = useState(true);
  const [notes, setNotes] = useState('');

  // Custom overridden amounts (if user manually types them)
  const [customDues, setCustomDues] = useState<any>({});
  const [customDeductions, setCustomDeductions] = useState<any>({});
  const [signOffs, setSignOffs] = useState<any[]>(DEFAULT_SIGN_OFFS);

  const currentEmployee = employees.find((e) => e.empId === empId) || employees[0];

  // Helper to initialize form when employee or lastDay changes
  useEffect(() => {
    if (!currentEmployee) return;
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }

    setHireDate(currentEmployee.hireDate || '');
    const lDay = currentEmployee.endDate || new Date().toISOString().substring(0, 10);
    setLastDay(lDay);

    // Days worked default
    const lDate = new Date(lDay);
    const lYear = lDate.getFullYear();
    const lMonth = lDate.getMonth() + 1;
    const hasRecord = records.some(
      (r) =>
        r.companyId === company.id &&
        r.empId === currentEmployee.empId &&
        r.year === lYear &&
        r.month === lMonth
    );
    setDaysWorked(hasRecord ? 0 : Math.min(lDate.getDate(), 30));

    // Indemnity default: 1 if not subject to SSC, else 0 (Labour Law art. 32)
    setIndemnityMonths(currentEmployee.sscExempt ? 1 : 0);
    setLeaveDays(0);
    setNoticeMonths(0);
    setCustomDues({});
    setCustomDeductions({});
    setSignOffs(DEFAULT_SIGN_OFFS);
  }, [empId, currentEmployee?.empId]);

  // Handle lastDay change -> recalculate daysWorked
  const handleLastDayChange = (newLastDay: string) => {
    setLastDay(newLastDay);
    const lDate = new Date(newLastDay);
    const lYear = lDate.getFullYear();
    const lMonth = lDate.getMonth() + 1;
    const hasRecord = records.some(
      (r) =>
        r.companyId === company.id &&
        r.empId === empId &&
        r.year === lYear &&
        r.month === lMonth
    );
    setDaysWorked(hasRecord ? 0 : Math.min(lDate.getDate() || 30, 30));
  };

  // Calculate unsettled loan balance for this employee
  const empUnsettledLoanBalance = useMemo(() => {
    return loans
      .filter((l) => l.companyId === company.id && l.empId === empId && !l.settled)
      .reduce((sum, l) => {
        const paid = records
          .filter((r) => r.companyId === company.id && r.empId === empId)
          .reduce((s, r) => {
            const item = r.deductions.find((d) => d.loanId === l.id);
            return s + (item ? item.amount : 0);
          }, 0);
        return sum + Math.max(0, l.total - paid);
      }, 0);
  }, [loans, records, company.id, empId]);

  // Live calculation of clearance amounts (Section 10)
  const calc = useMemo(() => {
    if (!currentEmployee) return null;
    return calculateClearanceAmounts({
      employee: currentEmployee,
      hireDate,
      lastDay,
      reason,
      daysWorked,
      leaveDays,
      indemnityMonths,
      indemnityBasis,
      noticeMonths,
      deductLoans,
      unsettledLoanBalance: empUnsettledLoanBalance,
      hasExistingMonthRecord: daysWorked === 0,
      customDues,
      customDeductions,
    });
  }, [
    currentEmployee,
    hireDate,
    lastDay,
    reason,
    daysWorked,
    leaveDays,
    indemnityMonths,
    indemnityBasis,
    noticeMonths,
    deductLoans,
    empUnsettledLoanBalance,
    customDues,
    customDeductions,
  ]);

  const activeClearance = companyClearances.find((c) => c.id === activeClearanceId);
  const activeClearanceEmp = employees.find((e) => e.empId === activeClearance?.empId);

  const handleOpenNew = () => {
    setEditingClearance(null);
    setEmpId(employees[0]?.empId || '');
    setNotes('');
    setIsModalOpen(true);
  };

  // Load a saved clearance into the wizard. Amounts that were typed over the calculated
  // values are restored as manual overrides; everything else recalculates live.
  const handleOpenEdit = (c: Clearance) => {
    const emp = employees.find((e) => e.empId === c.empId);
    if (!emp) {
      alert('The employee for this clearance no longer exists, so it cannot be edited.');
      return;
    }
    const auto = calculateClearanceAmounts({
      employee: emp,
      hireDate: c.hireDate,
      lastDay: c.lastDay,
      reason: c.reason,
      daysWorked: c.daysWorked,
      leaveDays: c.leaveDays,
      indemnityMonths: c.indemnityMonths,
      indemnityBasis: c.indemnityBasis,
      noticeMonths: c.noticeMonths,
      deductLoans: c.deductLoans,
      unsettledLoanBalance: c.deductions.loans,
      hasExistingMonthRecord: c.daysWorked === 0,
      customDues: {},
      customDeductions: { loans: c.deductions.loans },
    });
    const diff = (saved: Record<string, number>, calculated: Record<string, number>) => {
      const out: Record<string, number> = {};
      for (const k of Object.keys(saved)) {
        if (Math.abs((saved[k] || 0) - ((calculated as any)[k] || 0)) > 0.004) out[k] = saved[k];
      }
      return out;
    };

    if (c.empId !== empId) skipNextResetRef.current = true;
    setEditingClearance(c);
    setEmpId(c.empId);
    setHireDate(c.hireDate);
    setLastDay(c.lastDay);
    setReason(c.reason);
    setDaysWorked(c.daysWorked);
    setLeaveDays(c.leaveDays);
    setIndemnityMonths(c.indemnityMonths);
    setIndemnityBasis(c.indemnityBasis);
    setNoticeMonths(c.noticeMonths);
    setDeductLoans(c.deductLoans);
    setNotes(c.notes || '');
    setSignOffs(c.signOffs?.length ? c.signOffs : DEFAULT_SIGN_OFFS);
    setCustomDues(diff(c.dues as any, auto.dues as any));
    // A completed clearance already settled the loans, so keep its loan figure fixed.
    setCustomDeductions({
      ...diff(c.deductions as any, auto.deductions as any),
      ...(c.status === 'completed' ? { loans: c.deductions.loans } : {}),
    });
    setIsModalOpen(true);
  };

  const handleDelete = (c: Clearance) => {
    const msg =
      c.status === 'completed'
        ? `Delete the completed clearance for ${c.empId}?\n\nThe employee will be set back to Active and any loans this clearance settled will be reopened. This cannot be undone.`
        : `Delete the clearance draft for ${c.empId}?`;
    if (!confirm(msg)) return;
    onDeleteClearance(c.id);
    if (activeClearanceId === c.id) setActiveClearanceId(null);
  };

  const handleSaveDraft = () => {
    if (!calc || !currentEmployee) return;

    const newClearance: Clearance = {
      ...(editingClearance || {}),
      id: editingClearance?.id || `clearance_${company.id}_${empId}`,
      companyId: company.id,
      empId,
      hireDate,
      lastDay,
      reason,
      daysWorked,
      leaveDays,
      indemnityMonths,
      indemnityBasis,
      noticeMonths,
      monthlyWage: calc.monthlyWage,
      basic: calc.basic,
      deductLoans,
      dues: calc.dues,
      deductions: calc.deductions,
      totalDues: calc.totalDues,
      totalDeductions: calc.totalDeductions,
      net: calc.net,
      signOffs,
      status: editingClearance?.status || 'draft',
      notes,
      serviceLength: calc.service,
    };

    onSaveClearance(newClearance);
    setActiveClearanceId(newClearance.id);
    setEditingClearance(null);
    setIsModalOpen(false);
  };

  const handleComplete = (c: Clearance) => {
    const unSigned = c.signOffs.filter((s) => !s.cleared).map((s) => s.department);
    let msg = `Complete and finalize settlement for ${c.empId}?`;
    if (unSigned.length > 0) {
      msg += `\n\nNotice: The following departments have not yet cleared their sign-offs:\n- ${unSigned.join(
        '\n- '
      )}\n\nDo you want to proceed?`;
    }
    if (!confirm(msg)) return;

    onCompleteClearance(c);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <UserMinus className="w-4 h-4 text-emerald-500" />
            <span>Employee Clearance & Final Settlement (براءة ذمة ومخالصة)</span>
          </h2>
          <p className="text-slate-500">
            End of service calculations under Jordan Labor Law: leave pay, indemnity, loan settlement & department handovers
          </p>
        </div>

        {userRole !== 'viewer' && (
          <button
            type="button"
            onClick={handleOpenNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md font-medium hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            <span>New Clearance</span>
          </button>
        )}
      </div>

      {/* Main Split View: Left List & Right Active Clearance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Clearances List */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs max-h-[750px] flex flex-col text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
            Settlement Records ({companyClearances.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {companyClearances.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No clearances on file. Click "New Clearance" to settle a resigning employee.
              </div>
            ) : (
              companyClearances.map((c) => {
                const emp = employees.find((e) => e.empId === c.empId);
                const isActive = activeClearanceId === c.id;

                return (
                  <div
                    key={c.id}
                    onClick={() => setActiveClearanceId(c.id)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-slate-100 dark:bg-slate-800 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-slate-500 mr-1.5">{c.empId}</span>
                        {emp?.name || c.empId}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          c.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {c.status === 'completed' ? 'Completed' : 'Draft'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Last day: {c.lastDay}</span>
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                        Net: {formatCurrency(c.net, company.currency)}
                      </span>
                    </div>
                    {userRole !== 'viewer' && (
                      <div className="flex justify-end gap-1 mt-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveClearanceId(c.id);
                            handleOpenEdit(c);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Clearance Preview & Sign-off Actions */}
        <div className="lg:col-span-2 space-y-4">
          {activeClearance && activeClearanceEmp ? (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeClearanceEmp.name} — Final Clearance
                  </h3>
                  <div className="text-slate-500">
                    Status:{' '}
                    <span className="font-semibold uppercase font-mono">{activeClearance.status}</span>{' '}
                    · Last working day: {activeClearance.lastDay}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CommentsButton
                    entity={{
                      type: 'clearance',
                      id: activeClearance.id,
                      label: `Clearance — ${activeClearanceEmp.name} (last day ${activeClearance.lastDay})`,
                      empId: activeClearance.empId,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPreviewModalOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded font-medium hover:bg-slate-200"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>View / Print PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const el =
                        document.getElementById('clearance-doc-printable') ||
                        document.getElementById('hidden-clearance-download-render');
                      if (el && activeClearanceEmp) {
                        await exportHtmlToPdf(
                          el,
                          `Clearance_${activeClearanceEmp.name.replace(/\s+/g, '_')}.pdf`
                        );
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded font-medium hover:bg-slate-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>

                  {userRole !== 'viewer' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(activeClearance)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded font-medium hover:bg-slate-50"
                        title="Edit this clearance"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(activeClearance)}
                        className="flex items-center gap-1 px-3 py-1.5 text-rose-600 border border-rose-200 dark:border-rose-900 rounded font-medium hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        title="Delete this clearance"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                      {activeClearance.status === 'draft' ? (
                        <button
                          type="button"
                          onClick={() => handleComplete(activeClearance)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete Settlement</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                'Reopen this completed clearance? The employee will return to their prior active status and settled loans will be restored.'
                              )
                            ) {
                              onReopenClearance(activeClearance.id);
                            }
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded font-medium hover:bg-amber-700"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen to Draft</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Service Length & Monthly Wage info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                <div>
                  <span className="text-slate-400 block text-[11px]">Reason</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeClearance.reason}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Service Length</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {activeClearance.serviceLength.years}y {activeClearance.serviceLength.months}m {activeClearance.serviceLength.days}d
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Monthly Wage Basis</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {formatCurrency(activeClearance.monthlyWage, company.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Net Payout</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                    {formatCurrency(activeClearance.net, company.currency)}
                  </span>
                </div>
              </div>

              {/* Dues & Deductions Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-800 rounded p-3 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1 flex justify-between">
                    <span>Dues (المستحقات)</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(activeClearance.totalDues, '')}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Salary Due ({activeClearance.daysWorked} days):</span>
                    <span className="font-mono">{formatCurrency(activeClearance.dues.salary_due, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Leave Pay ({activeClearance.leaveDays} days):</span>
                    <span className="font-mono">{formatCurrency(activeClearance.dues.leave_pay, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>End of Service Indemnity:</span>
                    <span className="font-mono">{formatCurrency(activeClearance.dues.indemnity, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Notice Pay:</span>
                    <span className="font-mono">{formatCurrency(activeClearance.dues.notice_pay, '')}</span>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded p-3 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1 flex justify-between">
                    <span>Deductions (الاقتطاعات)</span>
                    <span className="font-mono text-rose-600 dark:text-rose-400">
                      {formatCurrency(activeClearance.totalDeductions, '')}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Social Security:</span>
                    <span className="font-mono">{formatCurrency(activeClearance.deductions.ssc, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Income Tax:</span>
                    <span className="font-mono">{formatCurrency(activeClearance.deductions.income_tax, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Loan Settlement:</span>
                    <span className="font-mono">{formatCurrency(activeClearance.deductions.loans, '')}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Notice / Other:</span>
                    <span className="font-mono">
                      {formatCurrency(
                        activeClearance.deductions.notice_deduction +
                          activeClearance.deductions.other_deductions,
                        ''
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Department Sign-Offs Checklist */}
              <div className="border border-slate-200 dark:border-slate-800 rounded p-3 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Department Clearances & Sign-Offs
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {activeClearance.signOffs.map((sign, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                    >
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {sign.department}
                        </div>
                        <div className="text-[10px] text-slate-400 font-arabic">{sign.departmentAr}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          sign.cleared
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {sign.cleared ? '✓ Cleared' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-lg border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-xs">
              Select a clearance record to view or start a new final settlement.
            </div>
          )}
        </div>
      </div>

      {/* New Clearance Wizard Modal */}
      {isModalOpen && currentEmployee && calc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {editingClearance
                    ? `Edit Clearance — ${editingClearance.empId}${editingClearance.status === 'completed' ? ' (completed)' : ''}`
                    : 'New Clearance & Final Settlement'}
                </h3>
                <p className="text-slate-500">Calculate severance, dues, and deductions</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingClearance(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Step 1: Employee & Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Employee *
                  </label>
                  <SearchableEmployeeSelect
                    employees={employees}
                    selectedEmpId={empId}
                    onSelect={setEmpId}
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Work Start Date (Hire Date)
                  </label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Last Working Day *
                  </label>
                  <input
                    type="date"
                    value={lastDay}
                    onChange={(e) => handleLastDayChange(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Reason for Departure
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  >
                    <option value="Resignation">Resignation (استقالة)</option>
                    <option value="Termination">Termination (إنهاء خدمات)</option>
                    <option value="End of contract">End of contract (انتهاء العقد)</option>
                    <option value="Retirement">Retirement (تقاعد)</option>
                    <option value="Death">Death (وفاة)</option>
                    <option value="Other">Other (أخرى)</option>
                  </select>
                </div>
              </div>

              {/* Service Length Calculation Banner */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block">Calculated Service Length (inclusive):</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                    {calc.service.years} Years, {calc.service.months} Months, {calc.service.days} Days ({calc.service.totalDays} Total Days)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Monthly Package Wage:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                    {formatCurrency(calc.monthlyWage, company.currency)}
                  </span>
                </div>
              </div>

              {/* Step 2: Input Parameters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Days Worked in Last Month
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={daysWorked}
                    onChange={(e) => setDaysWorked(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                  <span className="text-[10px] text-slate-400">0 if already paid</span>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Unused Annual Leave Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={leaveDays}
                    onChange={(e) => setLeaveDays(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Indemnity Months / Year
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={indemnityMonths}
                    onChange={(e) => setIndemnityMonths(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                  <span className="text-[10px] text-slate-400">1 if SSC exempt, 0 if SSC</span>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Notice Pay Months
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={noticeMonths}
                    onChange={(e) => setNoticeMonths(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                  />
                </div>
              </div>

              {/* Dues & Deductions Live Grid */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                {/* Dues */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex justify-between">
                    <span>Severance & Dues</span>
                    <span className="font-mono text-emerald-600">
                      {formatCurrency(calc.totalDues, '')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Salary Due:</span>
                    <span className="font-mono">{formatCurrency(calc.dues.salary_due, '')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Leave Pay ({leaveDays} d):</span>
                    <span className="font-mono">{formatCurrency(calc.dues.leave_pay, '')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Indemnity Pay:</span>
                    <span className="font-mono">{formatCurrency(calc.dues.indemnity, '')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Notice Pay:</span>
                    <span className="font-mono">{formatCurrency(calc.dues.notice_pay, '')}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-slate-100 flex justify-between">
                    <span>Settlement Deductions</span>
                    <span className="font-mono text-rose-600">
                      {formatCurrency(calc.totalDeductions, '')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Social Security:</span>
                    <span className="font-mono">{formatCurrency(calc.deductions.ssc, '')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Income Tax:</span>
                    <span className="font-mono">{formatCurrency(calc.deductions.income_tax, '')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">Loans Deducted:</span>
                    <span className="font-mono">{formatCurrency(calc.deductions.loans, '')}</span>
                  </div>
                  <div className="pt-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={deductLoans}
                        onChange={(e) => setDeductLoans(e.target.checked)}
                      />
                      <span>Deduct outstanding staff loans ({formatCurrency(empUnsettledLoanBalance, '')})</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Department Sign-Offs in Modal */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">
                  Department Clearance Checklist
                </span>
                <div className="space-y-1.5">
                  {signOffs.map((sign, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sign.cleared}
                          onChange={(e) => {
                            const updated = [...signOffs];
                            updated[idx].cleared = e.target.checked;
                            if (e.target.checked) {
                              updated[idx].date = new Date().toISOString().substring(0, 10);
                            }
                            setSignOffs(updated);
                          }}
                          className="w-4 h-4 text-slate-900 rounded"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {sign.department} ({sign.departmentAr})
                        </span>
                      </label>

                      {sign.cleared && (
                        <input
                          type="text"
                          placeholder="Signee Name"
                          value={sign.by || ''}
                          onChange={(e) => {
                            const updated = [...signOffs];
                            updated[idx].by = e.target.value;
                            setSignOffs(updated);
                          }}
                          className="w-32 px-2 py-0.5 bg-white dark:bg-slate-900 border rounded text-[11px]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Final Net Calculation Box */}
              <div className="p-4 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400">
                    {calc.net < 0 ? 'EMPLOYEE OWES' : 'NET SETTLEMENT PAYOUT'}
                  </div>
                  <div className="text-sm font-semibold font-arabic">
                    {calc.net < 0 ? 'المبلغ المترتب بذمة الموظف' : 'صافي المبلغ المستحق للموظف'}
                  </div>
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(Math.abs(calc.net), company.currency || 'JOD')}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingClearance(null);
                }}
                className="px-4 py-1.5 bg-white dark:bg-slate-800 border rounded font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-5 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold hover:bg-slate-800"
              >
                {editingClearance ? 'Save Changes' : 'Save Clearance Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clearance Document Printable Preview Modal */}
      {previewModalOpen && activeClearance && activeClearanceEmp && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Clearance Document: {activeClearanceEmp.name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printHtmlElement('clearance-doc-printable')}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded font-medium text-xs hover:bg-slate-200"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const el = document.getElementById('clearance-doc-printable');
                    if (el) {
                      await exportHtmlToPdf(
                        el,
                        `Clearance_${activeClearanceEmp.name.replace(/\s+/g, '_')}.pdf`
                      );
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium text-xs hover:bg-slate-800"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
              <ClearanceDoc
                id="clearance-doc-printable"
                company={company}
                employee={activeClearanceEmp}
                clearance={activeClearance}
              />
            </div>
          </div>
        </div>
      )}

      {/* Hidden container for direct PDF export */}
      {activeClearance && activeClearanceEmp && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '800px' }}>
          <ClearanceDoc
            id="hidden-clearance-download-render"
            company={company}
            employee={activeClearanceEmp}
            clearance={activeClearance}
          />
        </div>
      )}
    </div>
  );
};
