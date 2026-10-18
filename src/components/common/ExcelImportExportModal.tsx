import React, { useState } from 'react';
import {
  Company,
  Employee,
  Loan,
  SalaryRecord,
  Clearance,
  MonthlyInput,
  User,
  ActivityLog,
  PayrollRuleSet,
} from '../../types';
import {
  exportEmployeesSheet,
  generateEmployeeImportTemplate,
  parseEmployeesImportSheet,
  exportLoansSheet,
  generateLoansImportTemplate,
  parseLoansImportSheet,
  exportSalaryRecordsSheet,
  generateSalaryImportTemplate,
  parseSalaryImportSheet,
  exportClearancesSheet,
  generateMonthlyInputsSheet,
  parseMonthlyInputsSheet,
  generateBackupWorkbook,
  generateBlankTemplate,
  parseBackupWorkbook,
  generateActivityLogSheet,
  exportUsersSheet,
} from '../../utils/excel';
import {
  FileSpreadsheet,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  FileDown,
  FileUp,
  Info,
  Loader2,
} from 'lucide-react';

export type ScreenImportExportType =
  | 'employees'
  | 'loans'
  | 'salaries'
  | 'salary_history'
  | 'monthly_inputs'
  | 'clearances'
  | 'full_backup'
  | 'activity_logs'
  | 'users';

interface ExcelImportExportModalProps {
  type: ScreenImportExportType;
  company: Company;
  allCompanies?: Company[];
  employees: Employee[];
  records?: SalaryRecord[];
  loans?: Loan[];
  clearances?: Clearance[];
  monthlyInputs?: MonthlyInput[];
  users?: User[];
  logs?: ActivityLog[];
  ruleSets?: PayrollRuleSet[];
  year?: number;
  month?: number;
  canImport?: boolean;
  onClose: () => void;
  onImportComplete: (importedData: any, type: ScreenImportExportType) => Promise<void>;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as any], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}

export const ExcelImportExportModal: React.FC<ExcelImportExportModalProps> = ({
  type,
  company,
  allCompanies = [],
  employees,
  records = [],
  loans = [],
  clearances = [],
  monthlyInputs = [],
  users = [],
  logs = [],
  ruleSets,
  year = 2026,
  month = 10,
  canImport = true,
  onClose,
  onImportComplete,
}) => {
  const companySlug = company.name.replace(/\s+/g, '_');
  const monthInputs = monthlyInputs.filter((i) => i.year === year && i.month === month);

  const config = (() => {
    switch (type) {
      case 'employees':
        return {
          title: 'Employees Excel',
          titleAr: 'استيراد وتصدير بيانات الموظفين',
          itemLabel: 'employees',
          importable: true,
          importNote:
            'Rows are matched by Employee ID. Existing employees are updated; new IDs are added.',
        };
      case 'loans':
        return {
          title: 'Staff Loans Excel',
          titleAr: 'استيراد وتصدير سلف الموظفين',
          itemLabel: 'loans',
          importable: true,
          importNote:
            'Rows with a "Loan ID" (from an export) update that loan; rows without one create new loans.',
        };
      case 'salaries':
        return {
          title: `Salaries Excel — ${month}/${year}`,
          titleAr: 'استيراد وتصدير كشف الرواتب الشهري',
          itemLabel: 'salary records',
          importable: true,
          importNote:
            'Social Security and income tax are recalculated on import. A row replaces any existing record for the same employee and month. Loan installments are not added automatically — use Payroll Run for that.',
        };
      case 'salary_history':
        return {
          title: 'Salary History Excel (all months)',
          titleAr: 'استيراد وتصدير سجل الرواتب',
          itemLabel: 'salary records',
          importable: true,
          importNote:
            'Each row needs Year and Month. Social Security and income tax are recalculated. A row replaces any existing record for the same employee and month.',
        };
      case 'monthly_inputs':
        return {
          title: `Monthly Inputs Excel — ${month}/${year}`,
          titleAr: 'استيراد وتصدير المدخلات والمتغيرات الشهرية',
          itemLabel: 'monthly inputs',
          importable: true,
          importNote:
            'Fill "New Amount" for anything that changes this month. Apply = "From this month on" updates the employee package permanently.',
        };
      case 'clearances':
        return {
          title: 'Clearances Excel',
          titleAr: 'تصدير مخالصات نهاية الخدمة',
          itemLabel: 'clearances',
          importable: false,
          importNote: '',
        };
      case 'full_backup':
        return {
          title: 'Full Workbook (all companies)',
          titleAr: 'نسخة احتياطية كاملة بصيغة إكسل',
          itemLabel: 'items',
          importable: true,
          importNote:
            'Imports the Companies, Item Types, Employees, Loans and Salary Records sheets. Existing items with the same IDs are overwritten.',
        };
      case 'activity_logs':
        return {
          title: 'Activity Log Excel',
          titleAr: 'تصدير سجل النشاط',
          itemLabel: 'log entries',
          importable: false,
          importNote: '',
        };
      case 'users':
        return {
          title: 'Users Excel',
          titleAr: 'تصدير المستخدمين',
          itemLabel: 'users',
          importable: false,
          importNote: '',
        };
    }
  })();

  const importEnabled = config.importable && canImport;

  const [activeTab, setActiveTab] = useState<'import' | 'export'>(importEnabled ? 'import' : 'export');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [importCount, setImportCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    switch (type) {
      case 'employees':
        return downloadBytes(generateEmployeeImportTemplate(company), `Employees_Template_${companySlug}.xlsx`);
      case 'loans':
        return downloadBytes(generateLoansImportTemplate(company, employees), `Loans_Template_${companySlug}.xlsx`);
      case 'salaries':
      case 'salary_history':
        return downloadBytes(
          generateSalaryImportTemplate(company, employees.filter((e) => e.status !== 'resigned'), year, month),
          `Salaries_Template_${companySlug}_${year}_${month}.xlsx`
        );
      case 'monthly_inputs':
        return downloadBytes(
          generateMonthlyInputsSheet(company, employees, year, month, monthInputs),
          `Monthly_Inputs_${companySlug}_${year}_${month}.xlsx`
        );
      case 'full_backup':
        return downloadBytes(generateBlankTemplate(), 'Payroll_Blank_Template.xlsx');
    }
  };

  const handleExportData = () => {
    let count = 0;
    switch (type) {
      case 'employees':
        downloadBytes(exportEmployeesSheet(company, employees), `Employees_${companySlug}.xlsx`);
        count = employees.length;
        break;
      case 'loans':
        downloadBytes(exportLoansSheet(company, loans, employees, records), `Loans_${companySlug}.xlsx`);
        count = loans.length;
        break;
      case 'salaries':
        downloadBytes(
          exportSalaryRecordsSheet(company, records, employees, year, month),
          `Salaries_${companySlug}_${year}_${month}.xlsx`
        );
        count = records.filter((r) => r.year === year && r.month === month).length;
        break;
      case 'salary_history':
        downloadBytes(exportSalaryRecordsSheet(company, records, employees), `Salary_History_${companySlug}.xlsx`);
        count = records.length;
        break;
      case 'monthly_inputs':
        downloadBytes(
          generateMonthlyInputsSheet(company, employees, year, month, monthInputs),
          `Monthly_Inputs_${companySlug}_${year}_${month}.xlsx`
        );
        count = monthInputs.length;
        break;
      case 'clearances':
        downloadBytes(exportClearancesSheet(company, clearances, employees), `Clearances_${companySlug}.xlsx`);
        count = clearances.length;
        break;
      case 'full_backup':
        downloadBytes(
          generateBackupWorkbook(allCompanies.length ? allCompanies : [company], employees, records, loans),
          `Payroll_Backup_${new Date().toISOString().substring(0, 10)}.xlsx`
        );
        count = employees.length + records.length + loans.length;
        break;
      case 'activity_logs':
        downloadBytes(generateActivityLogSheet(logs), `Activity_Logs_${new Date().toISOString().substring(0, 10)}.xlsx`);
        count = logs.length;
        break;
      case 'users':
        downloadBytes(exportUsersSheet(users, allCompanies), 'Users.xlsx');
        count = users.length;
        break;
    }
    setSuccessMessage(`Exported ${count} ${config.itemLabel} to Excel.`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = '';
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsLoading(true);
    setErrors([]);
    setParsed(null);
    setPreviewRows([]);
    setImportCount(0);
    setSuccessMessage(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      if (type === 'employees') {
        const res = parseEmployeesImportSheet(buffer, company.id, company, employees);
        setParsed(res.employees);
        setPreviewRows(res.employees);
        setImportCount(res.employees.length);
        setErrors(res.errors);
      } else if (type === 'loans') {
        const res = parseLoansImportSheet(buffer, company.id, employees);
        setParsed(res.loans);
        setPreviewRows(res.loans);
        setImportCount(res.loans.length);
        setErrors(res.errors);
      } else if (type === 'salaries' || type === 'salary_history') {
        const res = parseSalaryImportSheet(buffer, company.id, employees, year, month, company, ruleSets);
        setParsed(res.records);
        setPreviewRows(res.records);
        setImportCount(res.records.length);
        setErrors(res.errors);
      } else if (type === 'monthly_inputs') {
        const res = parseMonthlyInputsSheet(buffer);
        setParsed(res.inputs);
        setPreviewRows(res.inputs);
        setImportCount(res.inputs.length);
        setErrors(res.errors);
      } else if (type === 'full_backup') {
        const res = parseBackupWorkbook(buffer, company.id, allCompanies);
        setParsed(res);
        setPreviewRows([
          { id: 'Companies (new)', name: String(res.summary.companiesCount) },
          { id: 'Employees', name: String(res.summary.employeesCount) },
          { id: 'Loans', name: String(res.summary.loansCount) },
          { id: 'Salary records', name: String(res.summary.recordsCount) },
        ]);
        setImportCount(
          res.summary.companiesCount + res.summary.employeesCount + res.summary.loansCount + res.summary.recordsCount
        );
        setErrors(res.errors);
      }
    } catch (err: any) {
      setErrors([`Failed to read spreadsheet: ${err.message || String(err)}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed || importCount === 0) return;
    setIsLoading(true);
    try {
      await onImportComplete(parsed, type);
      setIsSuccess(true);
      setSuccessMessage(`Imported ${importCount} ${config.itemLabel} and saved.`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setErrors([`Import failed: ${err.message || String(err)}`]);
    } finally {
      setIsLoading(false);
    }
  };

  const describeRow = (row: any) => {
    if (row.gross !== undefined) return `${row.month}/${row.year} · Net ${row.net}`;
    if (row.total !== undefined) return `Loan ${row.total} · ${row.installment}/mo`;
    if (row.amount !== undefined) return `${row.amount} · ${row.apply || ''}`;
    if (row.package) return `Basic ${row.package.basic}`;
    return '';
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 text-xs">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{config.title}</h3>
              <p className="text-[11px] text-slate-500 font-arabic">{config.titleAr}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 p-1">
          {importEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-1.5 font-semibold text-center rounded-md transition-colors ${
                activeTab === 'import'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Import from Excel
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-1.5 font-semibold text-center rounded-md transition-colors ${
              activeTab === 'export'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Export to Excel
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errors.length > 0 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Rows skipped ({errors.length}):</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] max-h-32 overflow-y-auto">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'import' && importEnabled && (
            <div className="space-y-4">
              {config.importNote && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg text-blue-900 dark:text-blue-300 flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{config.importNote}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Step 1: Download the template
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Has the exact columns the importer reads. You can also re-import an exported sheet.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded font-medium hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-500" />
                  <span>Template</span>
                </button>
              </div>

              <label className="block p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center space-y-2 hover:border-slate-400 cursor-pointer">
                <FileUp className="w-8 h-8 text-slate-400 mx-auto" />
                <span className="text-blue-600 dark:text-blue-400 font-semibold hover:underline block">
                  Step 2: Choose the filled Excel file
                </span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                <p className="text-[11px] text-slate-500">
                  {isLoading && !parsed ? 'Reading…' : file ? `Selected: ${file.name}` : '.xlsx, .xls or .csv'}
                </p>
              </label>

              {parsed && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between font-medium">
                    <span>Ready to import: {importCount} {config.itemLabel}</span>
                    {importCount === 0 && <span className="text-amber-600">Nothing to import</span>}
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2 text-[11px]">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {previewRows.slice(0, 15).map((row, i) => (
                          <tr key={i}>
                            <td className="py-1 font-mono text-slate-600 dark:text-slate-400">
                              {row.empId || row.id || `Row ${i + 1}`}
                            </td>
                            <td className="py-1 font-medium">{row.name || row.item || row.description}</td>
                            <td className="py-1 text-right font-mono text-slate-500">{describeRow(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewRows.length > 15 && (
                      <p className="text-center text-slate-400 py-1 text-[10px]">
                        … and {previewRows.length - 15} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Export {config.itemLabel} to Excel
              </span>
              <p className="text-slate-600 dark:text-slate-400">
                Downloads an .xlsx with the current data
                {type === 'full_backup' || type === 'activity_logs' || type === 'users' ? '' : ` for ${company.name}`}.
                {importEnabled && ' You can edit it and import it back on this screen.'}
              </p>
              <button
                type="button"
                onClick={handleExportData}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel (.xlsx)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white dark:bg-slate-800 border rounded font-medium text-slate-700 dark:text-slate-300"
          >
            Close
          </button>

          {activeTab === 'import' && importEnabled && (
            <button
              type="button"
              disabled={!parsed || importCount === 0 || isLoading || isSuccess}
              onClick={handleConfirmImport}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              {isLoading && parsed ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing…</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import & Save ({importCount})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
