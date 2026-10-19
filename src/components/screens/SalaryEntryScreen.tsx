import React, { useState, useEffect, useMemo } from 'react';
import { CommentsButton } from '../common/Comments';
import { maternityDeductionFor } from '../../utils/maternity';
import {
  Company,
  Employee,
  SalaryRecord,
  SalaryAmounts,
  SalaryEarningItem,
  SalaryDeductionItem,
  Loan,
  MonthlyInput,
  UserRole,
} from '../../types';
import {
  formatCurrency,
  calculatePayroll,
  parseArabicIndicNumber,
  roundHalfUp,
  isEmployedInMonth,
  getMonthName, getRuleSetForPeriod } from '../../utils/calculator';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import { PayslipDoc } from '../documents/PayslipDoc';
import { exportHtmlToPdf } from '../../utils/pdf';
import { EmailPayslipModal } from '../common/EmailPayslipModal';
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  FileText,
  Mail,
  Trash2,
  Plus,
  AlertTriangle,
  Info,
  Download,
  Check,
  X,
} from 'lucide-react';

interface SalaryEntryScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  loans: Loan[];
  monthlyInputs: MonthlyInput[];
  selectedEmpId: string;
  onSelectEmployee: (empId: string) => void;
  year: number;
  month: number;
  userRole?: UserRole;
  onSaveRecord: (record: SalaryRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onEmailPayslip?: (record: SalaryRecord) => void;
}

export const SalaryEntryScreen: React.FC<SalaryEntryScreenProps> = ({
  company,
  employees,
  records,
  loans,
  monthlyInputs,
  selectedEmpId,
  onSelectEmployee,
  year,
  month,
  userRole = 'viewer',
  onSaveRecord,
  onDeleteRecord,
  onEmailPayslip,
}) => {
  const currentEmployee = employees.find((e) => e.empId === selectedEmpId) || employees[0];
  const empId = currentEmployee?.empId || '';

  // Check if employed in this month
  const isEmployed = currentEmployee ? isEmployedInMonth(currentEmployee, year, month) : false;

  // Existing record check
  const existingRecord = useMemo(() => {
    return records.find(
      (r) => r.companyId === company.id && r.empId === empId && r.year === year && r.month === month
    );
  }, [records, company.id, empId, year, month]);

  // Form State
  const [amounts, setAmounts] = useState<SalaryAmounts>({
    basic: 0,
    housing: 0,
    transport: 0,
    other_allow: 0,
    overtime: 0,
    bonus: 0,
    other_earn: 0,
    social_sec: 0,
    income_tax: 0,
    other_ded: 0,
    advance: 0,
    unpaid_leave: 0,
  });

  const [earnings, setEarnings] = useState<SalaryEarningItem[]>([]);
  const [deductions, setDeductions] = useState<SalaryDeductionItem[]>([]);
  const [autoCalc, setAutoCalc] = useState(true);
  const [claimsFamily, setClaimsFamily] = useState(false);
  const [extraExemption, setExtraExemption] = useState(0);
  const [payDate, setPayDate] = useState('');
  const [payMethod, setPayMethod] = useState<'Bank transfer' | 'Cash' | 'Cheque'>('Bank transfer');
  const [notes, setNotes] = useState('');
  const [isSavedBadge, setIsSavedBadge] = useState(false);

  // Payslip preview modal
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  /**
   * Helper to build clean defaults from Employee package + monthly inputs + loans
   */
  const buildFromPackage = (emp: Employee) => {
    const basic = emp.package?.basic || 0;
    const baseAmounts: SalaryAmounts = {
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

    let baseEarnings: SalaryEarningItem[] = (emp.allowances || []).map((a) => ({
      name: a.name,
      amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
      taxable: a.taxable,
      ssc: a.ssc,
    }));

    let baseDeductions: SalaryDeductionItem[] = (emp.deductions || []).map((d) => ({
      name: d.name,
      amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
      preTax: d.preTax,
    }));

    // Check active loan installments for this month
    const empLoans = loans.filter(
      (l) =>
        l.companyId === company.id &&
        l.empId === emp.empId &&
        !l.settled &&
        (year > l.startYear || (year === l.startYear && month >= l.startMonth))
    );

    for (const loan of empLoans) {
      // calculate paid prior to this month
      const paidSoFar = records
        .filter(
          (r) =>
            r.companyId === company.id &&
            r.empId === emp.empId &&
            (r.year < year || (r.year === year && r.month < month))
        )
        .reduce((sum, r) => {
          const item = r.deductions.find((d) => d.loanId === loan.id);
          return sum + (item ? item.amount : 0);
        }, 0);

      const balance = Math.max(0, loan.total - paidSoFar);
      if (balance > 0) {
        const installment = Math.min(loan.installment, balance);
        baseDeductions.push({
          name: loan.description,
          amount: installment,
          preTax: false,
          loanId: loan.id,
        });
      }
    }

    // Maternity leave days paid by SSC are not paid as salary
    const maternity = maternityDeductionFor(emp, year, month, records, getRuleSetForPeriod);
    if (maternity) baseDeductions.push(maternity);

    // Apply monthly inputs for this month (Section 7)
    const empInputs = monthlyInputs.filter(
      (inp) =>
        inp.companyId === company.id &&
        inp.empId === emp.empId &&
        inp.year === year &&
        inp.month === month
    );

    const inputNoteList: string[] = [];
    for (const inp of empInputs) {
      if (inp.notes) inputNoteList.push(inp.notes);

      if (inp.kind === 'salary' && inp.item in baseAmounts) {
        (baseAmounts as any)[inp.item] = inp.amount;
      } else if (inp.kind === 'allowance') {
        const existingIdx = baseEarnings.findIndex(
          (e) => e.name.toLowerCase() === inp.item.toLowerCase()
        );
        if (inp.amount === 0) {
          if (existingIdx >= 0) baseEarnings.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          baseEarnings[existingIdx].amount = inp.amount;
        } else {
          const compType = company.allowanceTypes.find(
            (t) => t.name.toLowerCase() === inp.item.toLowerCase()
          );
          baseEarnings.push({
            name: inp.item,
            amount: inp.amount,
            taxable: compType ? compType.taxable : true,
            ssc: compType ? compType.ssc : true,
          });
        }
      } else if (inp.kind === 'deduction') {
        const existingIdx = baseDeductions.findIndex(
          (d) => d.name.toLowerCase() === inp.item.toLowerCase() && !d.loanId
        );
        if (inp.amount === 0) {
          if (existingIdx >= 0) baseDeductions.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          baseDeductions[existingIdx].amount = inp.amount;
        } else {
          const compType = company.deductionTypes.find(
            (t) => t.name.toLowerCase() === inp.item.toLowerCase()
          );
          baseDeductions.push({
            name: inp.item,
            amount: inp.amount,
            preTax: compType ? compType.preTax : false,
          });
        }
      }
    }

    // Default payDate to last day of month
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const defaultDate = `${year}-${monthStr}-${lastDayOfMonth}`;

    return {
      amounts: baseAmounts,
      earnings: baseEarnings,
      deductions: baseDeductions,
      autoCalc: true,
      claimsFamily: !!emp.claimsFamily,
      extraExemption: emp.extraExemption || 0,
      payDate: defaultDate,
      payMethod: 'Bank transfer' as const,
      notes: inputNoteList.join('; '),
    };
  };

  /**
   * CRITICAL ANTI-BUG REQUIREMENT:
   * Reload all fields whenever empId or year or month changes!
   */
  useEffect(() => {
    if (!currentEmployee) return;

    if (existingRecord) {
      setAmounts({ ...existingRecord.amounts });
      setEarnings([...(existingRecord.earnings || [])]);
      setDeductions([...(existingRecord.deductions || [])]);
      setAutoCalc(existingRecord.autoCalc ?? false);
      setClaimsFamily(existingRecord.claimsFamily);
      setExtraExemption(existingRecord.extraExemption || 0);
      setPayDate(existingRecord.payDate);
      setPayMethod(existingRecord.payMethod || 'Bank transfer');
      setNotes(existingRecord.notes || '');
      setIsSavedBadge(true);
    } else {
      const initial = buildFromPackage(currentEmployee);
      setAmounts(initial.amounts);
      setEarnings(initial.earnings);
      setDeductions(initial.deductions);
      setAutoCalc(initial.autoCalc);
      setClaimsFamily(initial.claimsFamily);
      setExtraExemption(initial.extraExemption);
      setPayDate(initial.payDate);
      setPayMethod(initial.payMethod);
      setNotes(initial.notes);
      setIsSavedBadge(false);
    }
  }, [empId, year, month, existingRecord?.id]);

  // Live payroll calculation
  const calc = useMemo(() => {
    if (!currentEmployee) {
      return {
        ssc: 0,
        incomeTax: 0,
        gross: 0,
        totalDed: 0,
        net: 0,
        sscExplanation: '',
        taxExplanation: '',
      };
    }

    if (autoCalc) {
      const res = calculatePayroll(
        currentEmployee,
        year,
        month,
        amounts,
        earnings,
        deductions,
        claimsFamily,
        extraExemption
      );
      return res;
    } else {
      // Manual entry
      const baseEarnings =
        (amounts.basic || 0) +
        (amounts.housing || 0) +
        (amounts.transport || 0) +
        (amounts.other_allow || 0) +
        (amounts.overtime || 0) +
        (amounts.bonus || 0) +
        (amounts.other_earn || 0) +
        earnings.reduce((s, e) => s + (e.amount || 0), 0);
      const gross = roundHalfUp(baseEarnings, 2);

      const totalDed = roundHalfUp(
        (amounts.social_sec || 0) +
          (amounts.income_tax || 0) +
          (amounts.other_ded || 0) +
          (amounts.advance || 0) +
          (amounts.unpaid_leave || 0) +
          deductions.reduce((s, d) => s + (d.amount || 0), 0),
        2
      );
      const net = roundHalfUp(gross - totalDed, 2);

      return {
        ssc: amounts.social_sec || 0,
        incomeTax: amounts.income_tax || 0,
        gross,
        totalDed,
        net,
        sscExplanation: 'Manual Social Security entry active.',
        taxExplanation: 'Manual Income Tax entry active.',
      };
    }
  }, [currentEmployee, year, month, amounts, earnings, deductions, autoCalc, claimsFamily, extraExemption]);

  // Before 2010 income tax is not modelled, so it stays editable even with auto-calculation on.
  const taxIsManual = !!getRuleSetForPeriod(year, month)?.taxManual;

  // Keep amounts in sync with autoCalc
  useEffect(() => {
    if (autoCalc) {
      setAmounts((prev) => ({
        ...prev,
        social_sec: calc.ssc,
        income_tax: calc.incomeTax,
      }));
    }
  }, [autoCalc, calc.ssc, calc.incomeTax]);

  // Previous and Next Employee navigation
  const currentIndex = employees.findIndex((e) => e.empId === empId);
  const handlePrevEmployee = () => {
    if (currentIndex > 0) {
      onSelectEmployee(employees[currentIndex - 1].empId);
    }
  };
  const handleNextEmployee = () => {
    if (currentIndex < employees.length - 1) {
      onSelectEmployee(employees[currentIndex + 1].empId);
    }
  };

  // Add allowance
  const handleAddAllowance = () => {
    const firstType = company.allowanceTypes[0];
    setEarnings([
      ...earnings,
      {
        name: firstType?.name || 'Mobile Allowance',
        amount: firstType?.value || 30,
        taxable: firstType ? firstType.taxable : true,
        ssc: firstType ? firstType.ssc : true,
      },
    ]);
  };

  // Add deduction
  const handleAddDeduction = () => {
    const firstType = company.deductionTypes[0];
    setDeductions([
      ...deductions,
      {
        name: firstType?.name || 'Health Insurance',
        amount: firstType?.value || 25,
        preTax: firstType ? firstType.preTax : true,
      },
    ]);
  };

  // Handle Save
  const handleSave = () => {
    if (!currentEmployee) return;

    if (calc.net < 0) {
      alert('Total deductions exceed gross salary. Net salary cannot be negative.');
      return;
    }

    const recordToSave: SalaryRecord = {
      id: `${company.id}_${currentEmployee.empId}_${year}_${month}`,
      companyId: company.id,
      empId: currentEmployee.empId,
      name: currentEmployee.name,
      nameAr: currentEmployee.nameAr,
      title: currentEmployee.title,
      dept: currentEmployee.department,
      year,
      month,
      payDate: payDate || `${year}-${month < 10 ? '0' + month : month}-28`,
      payMethod,
      currency: company.currency || 'JOD',
      amounts: {
        ...amounts,
        social_sec: autoCalc ? calc.ssc : amounts.social_sec,
        income_tax: autoCalc ? calc.incomeTax : amounts.income_tax,
      },
      earnings,
      deductions,
      gross: calc.gross,
      totalDed: calc.totalDed,
      net: calc.net,
      notes,
      claimsFamily,
      extraExemption,
      autoCalc,
    };

    onSaveRecord(recordToSave);
    setIsSavedBadge(true);
  };

  // Record for Payslip
  const dummyCurrentRecord: SalaryRecord = useMemo(() => {
    return {
      id: `${company.id}_${empId}_${year}_${month}`,
      companyId: company.id,
      empId,
      name: currentEmployee?.name || '',
      nameAr: currentEmployee?.nameAr || '',
      title: currentEmployee?.title || '',
      dept: currentEmployee?.department || '',
      year,
      month,
      payDate: payDate || `${year}-${month < 10 ? '0' + month : month}-28`,
      payMethod,
      currency: company.currency || 'JOD',
      amounts: {
        ...amounts,
        social_sec: autoCalc ? calc.ssc : amounts.social_sec,
        income_tax: autoCalc ? calc.incomeTax : amounts.income_tax,
      },
      earnings,
      deductions,
      gross: calc.gross,
      totalDed: calc.totalDed,
      net: calc.net,
      notes,
      claimsFamily,
      extraExemption,
      autoCalc,
    };
  }, [company.id, empId, currentEmployee, year, month, payDate, payMethod, company.currency, amounts, autoCalc, calc, earnings, deductions, notes, claimsFamily, extraExemption]);

  return (
    <div className="space-y-4">
      {/* Top Employee Selector & Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <button
            type="button"
            disabled={currentIndex <= 0}
            onClick={handlePrevEmployee}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Previous Employee"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1">
            <SearchableEmployeeSelect
              employees={employees}
              selectedEmpId={empId}
              onSelect={onSelectEmployee}
            />
          </div>

          <button
            type="button"
            disabled={currentIndex >= employees.length - 1}
            onClick={handleNextEmployee}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Next Employee"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded text-xs font-semibold ${
              isSavedBadge
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {isSavedBadge ? 'Saved' : 'New, not saved yet'}
          </span>

          {currentEmployee && (
            <CommentsButton
              entity={{
                type: 'salary',
                id: `${company.id}_${currentEmployee.empId}_${year}_${month}`,
                label: `Salary — ${currentEmployee.name} — ${getMonthName(month)} ${year}`,
                empId: currentEmployee.empId,
                year,
                month,
              }}
            />
          )}

          <button
            type="button"
            onClick={() => setIsPayslipModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-xs font-medium transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Payslip PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-xs font-medium transition-colors"
          >
            <Mail className="w-3.5 h-3.5 text-blue-500" />
            <span>Email Draft</span>
          </button>

          {userRole !== 'viewer' && (
            <>
              {isSavedBadge && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete salary record for ${currentEmployee?.name} (${getMonthName(
                          month
                        )} ${year})?`
                      )
                    ) {
                      if (existingRecord) onDeleteRecord(existingRecord.id);
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                  title="Delete Record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800 dark:hover:bg-white text-xs transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Employed Warning Banner if not employed in this month */}
      {!isEmployed && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3 rounded-lg flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Employment status notice:</strong> According to records, {currentEmployee?.name} was not employed in {getMonthName(month)} {year}{' '}
            {currentEmployee?.hireDate && currentEmployee.hireDate > `${year}-${month < 10 ? '0' + month : month}-28`
              ? `(hire date is ${currentEmployee.hireDate})`
              : currentEmployee?.endDate
              ? `(resigned on ${currentEmployee.endDate})`
              : ''}
            .
          </span>
        </div>
      )}

      {/* Main Form: Earnings (7 fields) & Deductions (5 fields) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Earnings Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Earnings</span>
              <span className="font-arabic font-normal text-slate-500">الاستحقاقات</span>
            </h3>
            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              Gross: {formatCurrency(calc.gross, company.currency)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Basic Salary / الراتب الأساسي *
              </label>
              <input
                type="text"
                value={amounts.basic}
                onChange={(e) =>
                  setAmounts({ ...amounts, basic: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Housing / بدل السكن
              </label>
              <input
                type="text"
                value={amounts.housing}
                onChange={(e) =>
                  setAmounts({ ...amounts, housing: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Transport / بدل المواصلات
              </label>
              <input
                type="text"
                value={amounts.transport}
                onChange={(e) =>
                  setAmounts({ ...amounts, transport: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Other Allowances / علاوات أخرى
              </label>
              <input
                type="text"
                value={amounts.other_allow}
                onChange={(e) =>
                  setAmounts({ ...amounts, other_allow: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Overtime / العمل الإضافي
              </label>
              <input
                type="text"
                value={amounts.overtime}
                onChange={(e) =>
                  setAmounts({ ...amounts, overtime: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Bonus / مكافأة
              </label>
              <input
                type="text"
                value={amounts.bonus}
                onChange={(e) =>
                  setAmounts({ ...amounts, bonus: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Other Earnings / إيرادات أخرى
              </label>
              <input
                type="text"
                value={amounts.other_earn}
                onChange={(e) =>
                  setAmounts({ ...amounts, other_earn: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>
          </div>

          {/* Additional Allowances */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                Additional Allowances
              </span>
              <button
                type="button"
                onClick={handleAddAllowance}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {earnings.map((e, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-xs"
              >
                <input
                  type="text"
                  list="salary-entry-allowances-datalist"
                  placeholder="Allowance Name..."
                  value={e.name}
                  onChange={(ev) => {
                    const val = ev.target.value;
                    const chosen = company.allowanceTypes.find(
                      (t) => t.name.toLowerCase() === val.toLowerCase()
                    );
                    const updated = [...earnings];
                    updated[idx] = {
                      ...updated[idx],
                      name: val,
                      taxable: chosen ? chosen.taxable : updated[idx].taxable,
                      ssc: chosen ? chosen.ssc : updated[idx].ssc,
                    };
                    setEarnings(updated);
                  }}
                  className="w-2/5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium"
                />
                <datalist id="salary-entry-allowances-datalist">
                  {company.allowanceTypes.map((t) => (
                    <option key={t.name} value={t.name} />
                  ))}
                </datalist>

                <input
                  type="text"
                  value={e.amount}
                  onChange={(ev) => {
                    const updated = [...earnings];
                    updated[idx].amount = parseArabicIndicNumber(ev.target.value);
                    setEarnings(updated);
                  }}
                  className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                />

                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={e.taxable}
                    onChange={(ev) => {
                      const updated = [...earnings];
                      updated[idx].taxable = ev.target.checked;
                      setEarnings(updated);
                    }}
                  />
                  <span>Tax</span>
                </label>

                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={e.ssc}
                    onChange={(ev) => {
                      const updated = [...earnings];
                      updated[idx].ssc = ev.target.checked;
                      setEarnings(updated);
                    }}
                  />
                  <span>SSC</span>
                </label>

                <button
                  type="button"
                  onClick={() => setEarnings(earnings.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-rose-600 ml-auto p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Deductions Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Deductions</span>
              <span className="font-arabic font-normal text-slate-500">الاقتطاعات</span>
            </h3>
            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              Total Ded: {formatCurrency(calc.totalDed, company.currency)}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-indigo-50/70 dark:bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
            <input
              type="checkbox"
              id="chk-autoCalc"
              checked={autoCalc}
              onChange={(e) => setAutoCalc(e.target.checked)}
              className="w-4 h-4 text-slate-900 rounded border-slate-300"
            />
            <label htmlFor="chk-autoCalc" className="text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
              Auto-calculate Social Security & Income Tax (Jordan 2026 Rules)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Social Security / الضمان الاجتماعي
              </label>
              <input
                type="text"
                readOnly={autoCalc}
                value={amounts.social_sec}
                onChange={(e) =>
                  setAmounts({ ...amounts, social_sec: parseArabicIndicNumber(e.target.value) })
                }
                className={`w-full px-3 py-1.5 border rounded-md font-mono ${
                  autoCalc
                    ? 'bg-slate-100 dark:bg-slate-800/80 text-indigo-700 dark:text-indigo-300 font-semibold border-slate-200 dark:border-slate-700 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Income Tax / ضريبة الدخل
              </label>
              <input
                type="text"
                readOnly={autoCalc && !taxIsManual}
                value={amounts.income_tax}
                onChange={(e) =>
                  setAmounts({ ...amounts, income_tax: parseArabicIndicNumber(e.target.value) })
                }
                className={`w-full px-3 py-1.5 border rounded-md font-mono ${
                  autoCalc && !taxIsManual
                    ? 'bg-slate-100 dark:bg-slate-800/80 text-amber-700 dark:text-amber-300 font-semibold border-slate-200 dark:border-slate-700 cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Advance Salary / سلفة على الراتب
              </label>
              <input
                type="text"
                value={amounts.advance}
                onChange={(e) =>
                  setAmounts({ ...amounts, advance: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Unpaid Leave / إجازة بدون راتب
              </label>
              <input
                type="text"
                value={amounts.unpaid_leave}
                onChange={(e) =>
                  setAmounts({ ...amounts, unpaid_leave: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Other Deductions / اقتطاعات أخرى
              </label>
              <input
                type="text"
                value={amounts.other_ded}
                onChange={(e) =>
                  setAmounts({ ...amounts, other_ded: parseArabicIndicNumber(e.target.value) })
                }
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>
          </div>

          {/* Additional Deductions & Loan Installments */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                Additional Deductions & Loans
              </span>
              <button
                type="button"
                onClick={handleAddDeduction}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {deductions.map((d, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-xs"
              >
                {d.loanId ? (
                  <div className="w-2/5 flex items-center gap-1.5 truncate">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {d.name}
                    </span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-mono">
                      loan
                    </span>
                  </div>
                ) : (
                  <div className="w-2/5">
                    <input
                      type="text"
                      list="salary-entry-deductions-datalist"
                      placeholder="Deduction Name..."
                      value={d.name}
                      onChange={(ev) => {
                        const val = ev.target.value;
                        const chosen = company.deductionTypes.find(
                          (t) => t.name.toLowerCase() === val.toLowerCase()
                        );
                        const updated = [...deductions];
                        updated[idx] = {
                          ...updated[idx],
                          name: val,
                          preTax: chosen ? chosen.preTax : updated[idx].preTax,
                        };
                        setDeductions(updated);
                      }}
                      className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium"
                    />
                    <datalist id="salary-entry-deductions-datalist">
                      {company.deductionTypes.map((t) => (
                        <option key={t.name} value={t.name} />
                      ))}
                    </datalist>
                  </div>
                )}

                <input
                  type="text"
                  value={d.amount}
                  onChange={(ev) => {
                    const updated = [...deductions];
                    updated[idx].amount = parseArabicIndicNumber(ev.target.value);
                    setDeductions(updated);
                  }}
                  className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-xs"
                />

                <label className="flex items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={d.preTax}
                    disabled={!!d.loanId}
                    onChange={(ev) => {
                      const updated = [...deductions];
                      updated[idx].preTax = ev.target.checked;
                      setDeductions(updated);
                    }}
                  />
                  <span>Pre-tax</span>
                </label>

                <button
                  type="button"
                  onClick={() => setDeductions(deductions.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-rose-600 ml-auto p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Details & Exemptions bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
            Payment Date
          </label>
          <input
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
          />
        </div>

        <div>
          <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
            Payment Method
          </label>
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value as any)}
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          >
            <option value="Bank transfer">Bank transfer</option>
            <option value="Cash">Cash</option>
            <option value="Cheque">Cheque</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
            Notes / Remarks
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional salary notes shown on payslip"
            className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
          />
        </div>
      </div>

      {/* Summary Bar & Live Rule Explanations */}
      <div className="bg-slate-900 text-white p-5 rounded-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-slate-400">Gross Salary</div>
              <div className="text-lg font-bold font-mono tabular-nums">
                {formatCurrency(calc.gross, company.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Total Deductions</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-300">
                {formatCurrency(calc.totalDed, company.currency)}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
              NET TAKE-HOME PAY
            </div>
            <div className={`text-2xl font-bold font-mono tabular-nums ${calc.net < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatCurrency(calc.net, company.currency || 'JOD')}
            </div>
          </div>
        </div>

        {/* Dynamic rule explanation line (Section 5.4) */}
        <div className="text-xs text-slate-300 space-y-1">
          <div>
            <strong>Jordan Payroll Rules {year}.</strong> {calc.sscExplanation}
          </div>
          <div>{calc.taxExplanation}</div>
        </div>

        <div className="flex items-center justify-between pt-2 text-xs">
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Reset and rebuild salary amounts from ${currentEmployee?.name}'s standard pay package and monthly inputs?`
                )
              ) {
                if (currentEmployee) {
                  const initial = buildFromPackage(currentEmployee);
                  setAmounts(initial.amounts);
                  setEarnings(initial.earnings);
                  setDeductions(initial.deductions);
                  setAutoCalc(initial.autoCalc);
                  setClaimsFamily(initial.claimsFamily);
                  setExtraExemption(initial.extraExemption);
                  setNotes(initial.notes);
                }
              }
            }}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Rebuild from pay package</span>
          </button>

          {userRole !== 'viewer' && (
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Record for {getMonthName(month)} {year}</span>
            </button>
          )}
        </div>
      </div>

      {/* Payslip Modal Preview */}
      {isPayslipModalOpen && currentEmployee && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Payslip Preview: {currentEmployee.name} ({getMonthName(month)} {year})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const el = document.getElementById('salary-entry-payslip-doc');
                    if (el) {
                      await exportHtmlToPdf(
                        el,
                        `SalarySlip_${currentEmployee.name.replace(/\s+/g, '_')}_${year}_${month}.pdf`
                      );
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800"
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsPayslipModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
              <PayslipDoc
                id="salary-entry-payslip-doc"
                company={company}
                employee={currentEmployee}
                record={dummyCurrentRecord}
              />
            </div>
          </div>
        </div>
      )}

      {/* Email Payslip Modal */}
      {isEmailModalOpen && currentEmployee && (
        <EmailPayslipModal
          company={company}
          employee={currentEmployee}
          record={dummyCurrentRecord}
          onClose={() => setIsEmailModalOpen(false)}
          onMarkSent={async (rec) => {
            if (onEmailPayslip) {
              await onEmailPayslip(rec);
            }
            return true;
          }}
        />
      )}
    </div>
  );
};
