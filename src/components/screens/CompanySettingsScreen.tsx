import React, { useState } from 'react';
import { ruleBranches, SSC_BRANCH_LABELS } from '../../utils/ssc';
import { Company, AllowanceType, DeductionType, PayrollRuleSet, UserRole } from '../../types';
import {
  generateBackupWorkbook,
  generateBlankTemplate,
  parseBackupWorkbook,
} from '../../utils/excel';
import { formatCurrency } from '../../utils/calculator';
import {
  Settings,
  Building2,
  Plus,
  Trash2,
  Download,
  Upload,
  Database,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
} from 'lucide-react';

interface CompanySettingsScreenProps {
  currentCompany: Company;
  allCompanies: Company[];
  ruleSets: PayrollRuleSet[];
  userRole?: UserRole;
  onUpdateCompany: (company: Company) => void;
  onNewCompany: (name: string, address: string, taxNumber: string, currency: string) => void;
  onDeleteCompany: (companyId: string) => void;
  onRestoreBackup: (importedData: any, overwriteRecords: boolean) => Promise<void>;
  onFullJSONRestore: (jsonData: any) => Promise<void>;
  onSeedSampleCompanies: () => Promise<void>;
  getFullDataForBackup: () => Promise<{
    companies: any[];
    employees: any[];
    records: any[];
    loans: any[];
    inputs: any[];
    clearances: any[];
    users: any[];
  }>;
  onUpdateRuleSets: (rules: PayrollRuleSet[]) => void;
}

export const CompanySettingsScreen: React.FC<CompanySettingsScreenProps> = ({
  currentCompany,
  allCompanies,
  ruleSets,
  userRole = 'viewer',
  onUpdateCompany,
  onNewCompany,
  onDeleteCompany,
  onRestoreBackup,
  onFullJSONRestore,
  onSeedSampleCompanies,
  getFullDataForBackup,
  onUpdateRuleSets,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'types' | 'data' | 'rules'>('profile');

  // Company Profile State
  const [name, setName] = useState(currentCompany.name);
  const [address, setAddress] = useState(currentCompany.address || '');
  const [taxNumber, setTaxNumber] = useState(currentCompany.taxNumber || '');
  const [currency, setCurrency] = useState(currentCompany.currency || 'JOD');
  const [logo, setLogo] = useState(currentCompany.logo || '');

  // Item Types State
  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([
    ...(currentCompany.allowanceTypes || []),
  ]);
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([
    ...(currentCompany.deductionTypes || []),
  ]);

  // Import State
  const [overwriteRecords, setOverwriteRecords] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // New Company Modal
  const [isNewCompModalOpen, setIsNewCompModalOpen] = useState(false);
  const [newCompName, setNewCompName] = useState('');
  const [newCompAddress, setNewCompAddress] = useState('');
  const [newCompTaxNo, setNewCompTaxNo] = useState('');

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogo(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const handleSaveProfile = () => {
    onUpdateCompany({
      ...currentCompany,
      name,
      address,
      taxNumber,
      currency,
      logo,
      allowanceTypes,
      deductionTypes,
    });
    setSaveNotice('Company profile and custom allowance/deduction types saved successfully.');
    setTimeout(() => setSaveNotice(null), 4000);
  };

  // Add Allowance Type
  const handleAddAllowanceType = () => {
    setAllowanceTypes([
      ...allowanceTypes,
      {
        name: 'New Allowance',
        method: 'fixed',
        value: 50,
        taxable: true,
        ssc: true,
      },
    ]);
  };

  // Add Deduction Type
  const handleAddDeductionType = () => {
    setDeductionTypes([
      ...deductionTypes,
      {
        name: 'New Deduction',
        method: 'fixed',
        value: 20,
        preTax: false,
      },
    ]);
  };

  // Export Excel Backup
  const handleExportBackup = async () => {
    const data = await getFullDataForBackup();
    const bytes = generateBackupWorkbook(
      data.companies,
      data.employees,
      data.records,
      data.loans
    );
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Backup_${new Date().toISOString().substring(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Blank Template
  const handleExportTemplate = () => {
    const bytes = generateBlankTemplate();
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Blank_Template.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export JSON Database
  const handleExportJSON = async () => {
    const data = await getFullDataForBackup();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Salary_Database_Backup_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Excel Backup
  const handleUploadExcelBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseBackupWorkbook(buffer, currentCompany.id, allCompanies);
      await onRestoreBackup(parsed, overwriteRecords);

      setImportSummary(
        `Backup restored: ${parsed.summary.companiesCount} companies, ${parsed.summary.employeesCount} employees, ${parsed.summary.recordsCount} records, ${parsed.summary.loansCount} loans.`
      );
    } catch (err) {
      alert('Error parsing Excel backup: ' + String(err));
    }
  };

  // Import JSON Backup
  const handleUploadJSONBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (
        confirm(
          'Warning: Restoring a JSON backup will replace all database records with the imported file. Proceed?'
        )
      ) {
        await onFullJSONRestore(data);
        alert('Database restored successfully.');
      }
    } catch (err) {
      alert('Error reading JSON backup file: ' + String(err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-500" />
              <span>Company Settings & Data Management ({currentCompany.name})</span>
            </h2>
            <p className="text-slate-500">
              Manage employer profile, allowance/deduction types, database backups, and tax parameters
            </p>
          </div>

          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => setIsNewCompModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Company</span>
            </button>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'profile'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Company Profile
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('types')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'types'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Allowance & Deduction Types
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'data'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Backup & Excel Data Transfer
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Jordan Payroll Rules (2025 / 2026)
          </button>
        </div>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">✓</span>
            <span>{saveNotice}</span>
          </div>
          <button type="button" onClick={() => setSaveNotice(null)} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: COMPANY PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Employer Information & Payslip Header
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Employer Tax Number (ISTD)
              </label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Official Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Currency
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Company Logo (Shown on Payslip & Clearance Headers)
              </label>
              <div className="flex items-center gap-4">
                {logo ? (
                  <img
                    src={logo}
                    alt="Logo"
                    className="h-12 w-auto object-contain border p-1 rounded bg-white"
                  />
                ) : (
                  <div className="h-12 w-24 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-400 text-[10px]">
                    No logo
                  </div>
                )}
                <label className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded font-medium cursor-pointer">
                  <span>Upload Logo Image</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo('')}
                    className="text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {userRole === 'admin' && allCompanies.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `Are you sure you want to permanently delete company "${currentCompany.name}" and ALL its employees, salary records, and loans?`
                    )
                  ) {
                    onDeleteCompany(currentCompany.id);
                  }
                }}
                className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Company</span>
              </button>
            )}

            {userRole !== 'viewer' && (
              <button
                type="button"
                onClick={handleSaveProfile}
                className="ml-auto px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
              >
                Save Company Profile
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ALLOWANCE & DEDUCTION TYPES */}
      {activeTab === 'types' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          {/* Allowance Types */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Company Custom Allowance Types
                </h3>
                <p className="text-slate-500 text-[11px]">Name and configure allowances for salary packages</p>
              </div>
              {userRole !== 'viewer' && (
                <button
                  type="button"
                  onClick={handleAddAllowanceType}
                  className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Custom Allowance</span>
                </button>
              )}
            </div>

            {/* Quick Presets for Allowances */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-500">Presets:</span>
              {[
                { name: 'Housing Allowance', val: 100, taxable: true, ssc: true },
                { name: 'Fuel Allowance', val: 50, taxable: false, ssc: false },
                { name: 'Mobile Stipend', val: 30, taxable: true, ssc: true },
                { name: 'Site Allowance', val: 75, taxable: true, ssc: true },
                { name: 'Sales Commission', val: 150, taxable: true, ssc: true },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    if (!allowanceTypes.some((a) => a.name.toLowerCase() === p.name.toLowerCase())) {
                      setAllowanceTypes([
                        ...allowanceTypes,
                        { name: p.name, method: 'fixed', value: p.val, taxable: p.taxable, ssc: p.ssc },
                      ]);
                    }
                  }}
                  className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-[10px] text-slate-700 dark:text-slate-300"
                >
                  + {p.name}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {allowanceTypes.map((a, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={a.name}
                      onChange={(e) => {
                        const updated = [...allowanceTypes];
                        updated[idx].name = e.target.value;
                        setAllowanceTypes(updated);
                      }}
                      className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded"
                    />

                    <select
                      value={a.method}
                      onChange={(e) => {
                        const updated = [...allowanceTypes];
                        updated[idx].method = e.target.value as any;
                        setAllowanceTypes(updated);
                      }}
                      className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border rounded"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percent">% of basic</option>
                    </select>

                    <input
                      type="number"
                      value={a.value}
                      onChange={(e) => {
                        const updated = [...allowanceTypes];
                        updated[idx].value = parseFloat(e.target.value) || 0;
                        setAllowanceTypes(updated);
                      }}
                      className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border rounded font-mono"
                    />

                    {userRole !== 'viewer' && (
                      <button
                        type="button"
                        onClick={() =>
                          setAllowanceTypes(allowanceTypes.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={a.taxable}
                        onChange={(e) => {
                          const updated = [...allowanceTypes];
                          updated[idx].taxable = e.target.checked;
                          setAllowanceTypes(updated);
                        }}
                      />
                      <span>Subject to Income Tax</span>
                    </label>

                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={a.ssc}
                        onChange={(e) => {
                          const updated = [...allowanceTypes];
                          updated[idx].ssc = e.target.checked;
                          setAllowanceTypes(updated);
                        }}
                      />
                      <span>Subject to Social Security</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deduction Types */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Company Deduction Types
                </h3>
                <p className="text-slate-500 text-[11px]">Custom recurring deductions</p>
              </div>
              {userRole !== 'viewer' && (
                <button
                  type="button"
                  onClick={handleAddDeductionType}
                  className="flex items-center gap-1 text-blue-600 hover:underline font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Custom Deduction</span>
                </button>
              )}
            </div>

            {/* Quick Presets for Deductions */}
            <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-700/60">
              <span className="text-[10px] font-semibold text-slate-500">Presets:</span>
              {[
                { name: 'Health Insurance', val: 35, preTax: true },
                { name: 'Disciplinary Penalty', val: 20, preTax: false },
                { name: 'Uniform & Gear', val: 15, preTax: false },
                { name: 'Syndicate / Union Fee', val: 10, preTax: true },
                { name: 'Equipment Damages', val: 25, preTax: false },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    if (!deductionTypes.some((d) => d.name.toLowerCase() === p.name.toLowerCase())) {
                      setDeductionTypes([
                        ...deductionTypes,
                        { name: p.name, method: 'fixed', value: p.val, preTax: p.preTax },
                      ]);
                    }
                  }}
                  className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-[10px] text-slate-700 dark:text-slate-300"
                >
                  + {p.name}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {deductionTypes.map((d, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => {
                        const updated = [...deductionTypes];
                        updated[idx].name = e.target.value;
                        setDeductionTypes(updated);
                      }}
                      className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border rounded"
                    />

                    <select
                      value={d.method}
                      onChange={(e) => {
                        const updated = [...deductionTypes];
                        updated[idx].method = e.target.value as any;
                        setDeductionTypes(updated);
                      }}
                      className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border rounded"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percent">% of basic</option>
                    </select>

                    <input
                      type="number"
                      value={d.value}
                      onChange={(e) => {
                        const updated = [...deductionTypes];
                        updated[idx].value = parseFloat(e.target.value) || 0;
                        setDeductionTypes(updated);
                      }}
                      className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border rounded font-mono"
                    />

                    {userRole !== 'viewer' && (
                      <button
                        type="button"
                        onClick={() =>
                          setDeductionTypes(deductionTypes.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={d.preTax}
                        onChange={(e) => {
                          const updated = [...deductionTypes];
                          updated[idx].preTax = e.target.checked;
                          setDeductionTypes(updated);
                        }}
                      />
                      <span>Before Tax (Deducted from taxable base)</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {userRole !== 'viewer' && (
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="w-full py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
                >
                  Save Types
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DATA & BACKUP */}
      {activeTab === 'data' && (
        <div className="space-y-6 text-xs">
          {importSummary && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
              <span>{importSummary}</span>
              <button type="button" onClick={() => setImportSummary(null)}>
                ✕
              </button>
            </div>
          )}

          {/* Sample Dataset Loader */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" />
              <span>Sample Companies Dataset</span>
            </h3>
            <p className="text-slate-500">
              Load the 3 realistic Jordanian test companies (Al-Noor Trading Co., Petra Engineering Ltd., Amman Medical Center) with January–September 2026 payroll history, loans, and October monthly inputs.
            </p>
            <button
              type="button"
              onClick={async () => {
                if (
                  confirm(
                    'Load the 3 sample companies? This will add realistic Jordanian test data to your database.'
                  )
                ) {
                  await onSeedSampleCompanies();
                  alert('Sample companies loaded successfully!');
                }
              }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100 font-semibold rounded"
            >
              Load Sample Companies
            </button>
          </div>

          {/* Excel Backup & Restore */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Excel Workbook Backup (Multi-sheet Compatible)</span>
            </h3>
            <p className="text-slate-500">
              Export and import complete system workbooks (Companies, Employees, Salary Records, Item Types, Loans).
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
              >
                <Download className="w-4 h-4" />
                <span>Download Excel Backup (All Companies)</span>
              </button>

              <button
                type="button"
                onClick={handleExportTemplate}
                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border rounded font-medium hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                <span>Download Blank Excel Template</span>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                Restore from Excel Backup
              </span>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={overwriteRecords}
                    onChange={(e) => setOverwriteRecords(e.target.checked)}
                  />
                  <span>Overwrite existing salary records (otherwise skips existing records)</span>
                </label>
              </div>

              <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Upload Excel Backup</span>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleUploadExcelBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Full JSON Database Backup & Restore */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" />
              <span>Full IndexedDB Database Snapshot (JSON)</span>
            </h3>
            <p className="text-slate-500">
              Includes all user credentials, activity logs, documents, clearances, and custom configurations.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border rounded font-medium hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                <span>Export Full JSON Database</span>
              </button>

              <label className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border rounded font-medium hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Restore from JSON Database</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleUploadJSONBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PAYROLL RULES */}
      {activeTab === 'rules' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Jordan Payroll Rule Sets (Social Security & Income Tax)
              </h3>
              <p className="text-slate-500">
                Configured rates, ceilings, exemptions, and progressive income tax brackets
              </p>
            </div>
          </div>

          <p className="text-slate-500">
            {ruleSets.length} periods from 2000 onward. The latest period keeps applying to later years until you
            add a new one. Ceilings and minimum wages can be edited; changes apply to new calculations.
          </p>

          <div className="space-y-3">
            {[...ruleSets]
              .sort((a, b) => b.from.localeCompare(a.from))
              .map((rs) => {
                const br = ruleBranches(rs);
                const updateRule = (patch: Partial<PayrollRuleSet>) => {
                  if (userRole !== 'admin') return;
                  onUpdateRuleSets(ruleSets.map((r) => (r.from === rs.from ? { ...r, ...patch } : r)));
                };
                return (
                  <details
                    key={rs.from}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <summary className="p-3 cursor-pointer flex flex-wrap items-center justify-between gap-2 font-bold text-slate-900 dark:text-slate-100">
                      <span className="text-sm">{rs.name}</span>
                      <span className="flex items-center gap-3 font-mono text-[11px] text-slate-500 font-normal">
                        {rs.unverified && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-sans font-semibold">
                            Unconfirmed figures
                          </span>
                        )}
                        <span>
                          SSC {(rs.sscRate * 100).toFixed(2)}% + {(rs.sscEmployerRate * 100).toFixed(2)}%
                        </span>
                        <span>From {rs.from}</span>
                      </span>
                    </summary>

                    <div className="px-4 pb-4 space-y-3">
                      {rs.unverified && (
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300">
                          {rs.unverified}
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="block">
                          <span className="text-slate-400 block">SSC monthly ceiling (0 = none)</span>
                          <input
                            type="number"
                            min={0}
                            disabled={userRole !== 'admin'}
                            value={rs.sscCeiling || 0}
                            onChange={(e) => updateRule({ sscCeiling: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-full mt-0.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-semibold"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-400 block">Ceiling, insured before May 2010</span>
                          <input
                            type="number"
                            min={0}
                            disabled={userRole !== 'admin' || !rs.sscLegacyCeiling}
                            value={rs.sscLegacyCeiling || 0}
                            onChange={(e) => updateRule({ sscLegacyCeiling: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-full mt-0.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-semibold disabled:opacity-60"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-400 block">Minimum wage (0 = no check)</span>
                          <input
                            type="number"
                            min={0}
                            disabled={userRole !== 'admin'}
                            value={rs.minimumWage || 0}
                            onChange={(e) =>
                              updateRule({ minimumWage: Math.max(0, parseFloat(e.target.value) || 0) || undefined })
                            }
                            className="w-full mt-0.5 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-semibold"
                          />
                        </label>
                        <div>
                          <span className="text-slate-400 block">Youth reduction (Reg. 45/2024)</span>
                          <span className="font-mono font-semibold">
                            {rs.sscYouthReduction
                              ? `Small -${rs.sscYouthReduction.small * 100}% / Medium -${rs.sscYouthReduction.medium * 100}%`
                              : 'Not in force'}
                          </span>
                        </div>
                      </div>

                      <table className="w-full text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded">
                        <thead className="text-slate-500">
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="p-1.5 text-left">SSC insurance branch</th>
                            <th className="p-1.5 text-right">Employee</th>
                            <th className="p-1.5 text-right">Employer</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {(Object.keys(SSC_BRANCH_LABELS) as (keyof typeof SSC_BRANCH_LABELS)[]).map((k) => (
                            <tr key={k} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="p-1.5 font-sans">
                                {SSC_BRANCH_LABELS[k].en}{' '}
                                <span className="font-arabic text-slate-400">· {SSC_BRANCH_LABELS[k].ar}</span>
                              </td>
                              <td className="p-1.5 text-right">{(br.employee[k] * 100).toFixed(2)}%</td>
                              <td className="p-1.5 text-right">{(br.employer[k] * 100).toFixed(2)}%</td>
                            </tr>
                          ))}
                          <tr className="font-bold">
                            <td className="p-1.5 font-sans">Total</td>
                            <td className="p-1.5 text-right">{(rs.sscRate * 100).toFixed(2)}%</td>
                            <td className="p-1.5 text-right">{(rs.sscEmployerRate * 100).toFixed(2)}%</td>
                          </tr>
                        </tbody>
                      </table>

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Income tax</span>
                        {rs.taxManual ? (
                          <span className="text-slate-500">
                            Not calculated for this period — enter income tax manually.
                          </span>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                              <div>
                                <span className="text-slate-400 block">Personal exemption</span>
                                <span className="font-mono font-semibold">
                                  {formatCurrency(rs.personalExemption, 'JOD/yr')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Dependants exemption</span>
                                <span className="font-mono font-semibold">
                                  {formatCurrency(rs.familyExemption, 'JOD/yr')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Additional exemptions max</span>
                                <span className="font-mono font-semibold">
                                  {formatCurrency(rs.documentedExpensesMax, 'JOD/yr')}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">National contribution</span>
                                <span className="font-mono font-semibold">
                                  {rs.nationalContribution
                                    ? `${rs.nationalContribution.rate * 100}% above ${rs.nationalContribution.threshold.toLocaleString()}`
                                    : 'None'}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px] font-mono">
                              {rs.brackets.map((b, bIdx) => {
                                const prev = bIdx === 0 ? 0 : rs.brackets[bIdx - 1].limit;
                                const open = b.limit == null || b.limit === Infinity;
                                return (
                                  <div key={bIdx} className="p-1.5 bg-white dark:bg-slate-900 border rounded text-center">
                                    <div className="text-slate-400">
                                      {open ? `> ${Number(prev).toLocaleString()}` : `≤ ${b.limit.toLocaleString()}`}
                                    </div>
                                    <div className="font-bold text-slate-800 dark:text-slate-200">
                                      {(b.rate * 100).toFixed(0)}%
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
          </div>
        </div>
      )}

      {/* New Company Modal */}
      {isNewCompModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full space-y-4 text-xs shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Create New Company</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewCompModalOpen(false)}
                className="text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCompName}
                  onChange={(e) => setNewCompName(e.target.value)}
                  placeholder="e.g. Petra Logistics LLC"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Employer Tax Number
                </label>
                <input
                  type="text"
                  value={newCompTaxNo}
                  onChange={(e) => setNewCompTaxNo(e.target.value)}
                  placeholder="e.g. 100987654"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={newCompAddress}
                  onChange={(e) => setNewCompAddress(e.target.value)}
                  placeholder="Amman, Jordan"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsNewCompModalOpen(false)}
                className="px-4 py-1.5 border rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newCompName.trim()) {
                    alert('Please enter a company name.');
                    return;
                  }
                  onNewCompany(newCompName.trim(), newCompAddress, newCompTaxNo, 'JOD');
                  setIsNewCompModalOpen(false);
                  setNewCompName('');
                  setNewCompAddress('');
                  setNewCompTaxNo('');
                }}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium"
              >
                Create Company
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
