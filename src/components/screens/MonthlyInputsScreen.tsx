import React, { useState } from 'react';
import { Company, Employee, MonthlyInput, UserRole } from '../../types';
import {
  formatCurrency,
  parseArabicIndicNumber,
  roundHalfUp,
  getMonthName,
} from '../../utils/calculator';
import { SearchableEmployeeSelect } from '../common/SearchableEmployeeSelect';
import {
  generateMonthlyInputsSheet,
  parseMonthlyInputsSheet,
} from '../../utils/excel';
import {
  FileSpreadsheet,
  Plus,
  Download,
  Upload,
  PlayCircle,
  Trash2,
  Info,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';

interface MonthlyInputsScreenProps {
  company: Company;
  employees: Employee[];
  monthlyInputs: MonthlyInput[];
  year: number;
  month: number;
  userRole?: UserRole;
  onSaveInput: (input: MonthlyInput) => void;
  onDeleteInput: (inputId: string) => void;
  onUpdateEmployeePackage: (emp: Employee) => void;
  onNavigateToPayrollRun: () => void;
}

export const MonthlyInputsScreen: React.FC<MonthlyInputsScreenProps> = ({
  company,
  employees,
  monthlyInputs,
  year,
  month,
  userRole = 'viewer',
  onSaveInput,
  onDeleteInput,
  onUpdateEmployeePackage,
  onNavigateToPayrollRun,
}) => {
  const currentInputs = monthlyInputs.filter(
    (inp) => inp.companyId === company.id && inp.year === year && inp.month === month
  );

  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.empId || '');
  const [item, setItem] = useState('bonus');
  const [kind, setKind] = useState<'salary' | 'allowance' | 'deduction'>('salary');
  const [amount, setAmount] = useState<number | string>(100);
  const [applyMode, setApplyMode] = useState<'this_month' | 'permanent'>('this_month');
  const [notes, setNotes] = useState('');
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);

  const selectedEmp = employees.find((e) => e.empId === selectedEmpId);

  // Determine usual amount for the selected item
  const getUsualAmount = (targetItem: string, emp?: Employee): number => {
    if (!emp) return 0;
    const lower = targetItem.toLowerCase();
    if (lower === 'basic' || lower === 'basic salary') return emp.package.basic || 0;
    if (lower === 'housing' || lower === 'housing allowance') return emp.package.housing || 0;
    if (lower === 'transport' || lower === 'transportation allowance') return emp.package.transport || 0;
    if (lower === 'other_allow' || lower === 'other allowances') return emp.package.other_allow || 0;

    const allow = (emp.allowances || []).find((a) => a.name.toLowerCase() === lower);
    if (allow) {
      return allow.method === 'percent'
        ? roundHalfUp((emp.package.basic * allow.value) / 100, 2)
        : allow.value;
    }

    const ded = (emp.deductions || []).find((d) => d.name.toLowerCase() === lower);
    if (ded) {
      return ded.method === 'percent'
        ? roundHalfUp((emp.package.basic * ded.value) / 100, 2)
        : ded.value;
    }

    return 0;
  };

  const usualAmount = getUsualAmount(item, selectedEmp);

  // Available item suggestions
  const itemSuggestions = [
    { label: 'Bonus / مكافأة', value: 'bonus', defaultKind: 'salary' },
    { label: 'Overtime / العمل الإضافي', value: 'overtime', defaultKind: 'salary' },
    { label: 'Other Earnings / إيرادات أخرى', value: 'other_earn', defaultKind: 'salary' },
    { label: 'Advance Salary / سلفة على الراتب', value: 'advance', defaultKind: 'salary' },
    { label: 'Unpaid Leave / إجازة بدون راتب', value: 'unpaid_leave', defaultKind: 'salary' },
    { label: 'Basic Salary / الراتب الأساسي', value: 'basic', defaultKind: 'salary' },
    { label: 'Housing Allowance / بدل السكن', value: 'housing', defaultKind: 'salary' },
    { label: 'Transport Allowance / بدل المواصلات', value: 'transport', defaultKind: 'salary' },
    ...company.allowanceTypes.map((a) => ({
      label: `${a.name} (Company Allowance)`,
      value: a.name,
      defaultKind: 'allowance',
    })),
    ...company.deductionTypes.map((d) => ({
      label: `${d.name} (Company Deduction)`,
      value: d.name,
      defaultKind: 'deduction',
    })),
  ];

  const handleItemChange = (val: string) => {
    setItem(val);
    const found = itemSuggestions.find((s) => s.value.toLowerCase() === val.toLowerCase());
    if (found) {
      setKind(found.defaultKind as any);
    }
  };

  // Save Input Handler
  const handleAddInput = () => {
    if (!selectedEmp) return;
    const parsedAmount = parseArabicIndicNumber(amount);

    if (applyMode === 'permanent') {
      // "From this month on": Updates employee's package directly
      const lower = item.toLowerCase();
      const updatedEmp = JSON.parse(JSON.stringify(selectedEmp)) as Employee;

      if (lower === 'basic' || lower === 'basic salary') {
        updatedEmp.package.basic = parsedAmount;
      } else if (lower === 'housing' || lower === 'housing allowance') {
        updatedEmp.package.housing = parsedAmount;
      } else if (lower === 'transport' || lower === 'transportation allowance') {
        updatedEmp.package.transport = parsedAmount;
      } else if (lower === 'other_allow' || lower === 'other allowances') {
        updatedEmp.package.other_allow = parsedAmount;
      } else if (kind === 'allowance') {
        const existIdx = updatedEmp.allowances.findIndex((a) => a.name.toLowerCase() === lower);
        if (parsedAmount === 0 && existIdx >= 0) {
          updatedEmp.allowances.splice(existIdx, 1);
        } else if (existIdx >= 0) {
          updatedEmp.allowances[existIdx].value = parsedAmount;
          updatedEmp.allowances[existIdx].method = 'fixed';
        } else {
          const compType = company.allowanceTypes.find((t) => t.name.toLowerCase() === lower);
          updatedEmp.allowances.push({
            name: item,
            method: 'fixed',
            value: parsedAmount,
            taxable: compType ? compType.taxable : true,
            ssc: compType ? compType.ssc : true,
          });
        }
      } else if (kind === 'deduction') {
        const existIdx = updatedEmp.deductions.findIndex((d) => d.name.toLowerCase() === lower);
        if (parsedAmount === 0 && existIdx >= 0) {
          updatedEmp.deductions.splice(existIdx, 1);
        } else if (existIdx >= 0) {
          updatedEmp.deductions[existIdx].value = parsedAmount;
          updatedEmp.deductions[existIdx].method = 'fixed';
        } else {
          const compType = company.deductionTypes.find((t) => t.name.toLowerCase() === lower);
          updatedEmp.deductions.push({
            name: item,
            method: 'fixed',
            value: parsedAmount,
            preTax: compType ? compType.preTax : false,
          });
        }
      }

      onUpdateEmployeePackage(updatedEmp);
      alert(`Updated permanent package for ${selectedEmp.name} starting from this month.`);
      return;
    }

    // "This month only": Add/update monthly input
    const inputId = `inp_${company.id}_${selectedEmp.empId}_${year}_${month}_${item.replace(/\s+/g, '_')}`;
    const newInput: MonthlyInput = {
      id: inputId,
      companyId: company.id,
      empId: selectedEmp.empId,
      year,
      month,
      kind,
      item,
      amount: parsedAmount,
      notes,
    };
    onSaveInput(newInput);
    setNotes('');
  };

  // Download inputs sheet
  const handleDownloadSheet = () => {
    const bytes = generateMonthlyInputsSheet(company, employees, year, month, currentInputs);
    const blob = new Blob([bytes as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Monthly_Inputs_${company.name.replace(/\s+/g, '_')}_${year}_${month}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload inputs sheet
  const handleUploadSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const { inputs, errors } = parseMonthlyInputsSheet(buffer);

      let savedCount = 0;
      let packageChangedCount = 0;

      for (const row of inputs) {
        const emp = employees.find((e) => e.empId.toLowerCase() === row.empId.toLowerCase());
        if (!emp) continue;

        if (row.apply.toLowerCase().startsWith('from') || row.apply.toLowerCase().startsWith('من')) {
          // Update package
          const updatedEmp = JSON.parse(JSON.stringify(emp)) as Employee;
          const lower = row.item.toLowerCase();
          if (lower.includes('basic')) updatedEmp.package.basic = row.amount;
          else if (lower.includes('housing')) updatedEmp.package.housing = row.amount;
          else if (lower.includes('transport')) updatedEmp.package.transport = row.amount;
          else if (lower.includes('other')) updatedEmp.package.other_allow = row.amount;
          onUpdateEmployeePackage(updatedEmp);
          packageChangedCount++;
        } else {
          // This month only
          let kind: 'salary' | 'allowance' | 'deduction' = 'salary';
          const lowerKind = row.kind.toLowerCase();
          if (lowerKind.includes('allowance')) kind = 'allowance';
          else if (lowerKind.includes('deduction')) kind = 'deduction';

          const inputId = `inp_${company.id}_${emp.empId}_${year}_${month}_${row.item.replace(/\s+/g, '_')}`;
          onSaveInput({
            id: inputId,
            companyId: company.id,
            empId: emp.empId,
            year,
            month,
            kind,
            item: row.item,
            amount: row.amount,
            notes: row.notes,
          });
          savedCount++;
        }
      }

      setUploadSummary(
        `Imported: ${savedCount} inputs for this month, updated ${packageChangedCount} permanent packages.${
          errors.length > 0 ? ` (${errors.length} skipped rows)` : ''
        }`
      );
    } catch (err) {
      alert('Error parsing inputs file: ' + String(err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Monthly Inputs for {getMonthName(month)} {year}</span>
            </h2>
            <p className="text-xs text-slate-500">
              Record "what is different this month" (overtime, bonuses, unpaid leave, modified allowances)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Inputs Excel</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Inputs Excel</span>
              <input type="file" accept=".xlsx" onChange={handleUploadSheet} className="hidden" />
            </label>

            {userRole !== 'viewer' && (
              <button
                type="button"
                onClick={onNavigateToPayrollRun}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md text-xs font-medium hover:bg-slate-800"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Apply to {getMonthName(month)} Payroll</span>
              </button>
            )}
          </div>
        </div>

        {uploadSummary && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span>{uploadSummary}</span>
            <button type="button" onClick={() => setUploadSummary(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add Input Form */}
        {userRole !== 'viewer' && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Add New Monthly Change
            </span>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Employee
                </label>
                <SearchableEmployeeSelect
                  employees={employees}
                  selectedEmpId={selectedEmpId}
                  onSelect={setSelectedEmpId}
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Item
                </label>
                <select
                  value={item}
                  onChange={(e) => handleItemChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {itemSuggestions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Amount This Month (JOD)
                </label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                />
                <span className="text-[10px] text-slate-400">
                  Usual: {formatCurrency(usualAmount, '')}
                </span>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Apply Scope
                </label>
                <select
                  value={applyMode}
                  onChange={(e) => setApplyMode(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  <option value="this_month">This month only</option>
                  <option value="permanent">From this month on (Package)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Extra night shift"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleAddInput}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium text-xs hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Save Input</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Table of Monthly Inputs */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-800 dark:text-slate-200">
          Saved Monthly Inputs for {getMonthName(month)} {year} ({currentInputs.length})
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">Kind</th>
                <th className="px-3 py-2.5 text-right">Usual Amount</th>
                <th className="px-3 py-2.5 text-right">This Month Amount</th>
                <th className="px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {currentInputs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No monthly changes recorded for {getMonthName(month)} {year}. All employees will receive their regular salary package.
                  </td>
                </tr>
              ) : (
                currentInputs.map((inp) => {
                  const emp = employees.find((e) => e.empId === inp.empId);
                  const usual = getUsualAmount(inp.item, emp);
                  return (
                    <tr key={inp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2.5">
                        <span className="font-mono font-medium text-slate-500 mr-1.5">
                          {inp.empId}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {emp?.name || inp.empId}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {inp.item}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-slate-500">{inp.kind}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                        {formatCurrency(usual, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {formatCurrency(inp.amount, '')}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{inp.notes || '-'}</td>
                      <td className="px-3 py-2.5 text-center">
                        {userRole !== 'viewer' && (
                          <button
                            type="button"
                            onClick={() => onDeleteInput(inp.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Remove Input"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
