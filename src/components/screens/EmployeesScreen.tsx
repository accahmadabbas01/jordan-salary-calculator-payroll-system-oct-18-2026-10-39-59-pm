import React, { useState } from 'react';
import { Company, Employee, Loan, RecurringAllowance, RecurringDeduction, UserRole } from '../../types';
import {
  formatCurrency,
  calculatePayroll,
  parseArabicIndicNumber,
  roundHalfUp,
} from '../../utils/calculator';
import {
  Search,
  Plus,
  Download,
  Trash2,
  Edit2,
  FileText,
  Upload,
  AlertTriangle,
  CreditCard,
  DollarSign,
  X,
  Paperclip,
} from 'lucide-react';

interface EmployeesScreenProps {
  company: Company;
  employees: Employee[];
  loans: Loan[];
  year: number;
  month: number;
  userRole?: UserRole;
  onSaveEmployee: (emp: Employee) => void;
  onDeleteEmployee: (empId: string) => void;
  onNavigateToSalaryEntry: (empId: string) => void;
  onNavigateToAddLoan: (empId: string) => void;
  onExportEmployees: () => void;
}

export const EmployeesScreen: React.FC<EmployeesScreenProps> = ({
  company,
  employees,
  loans,
  year,
  month,
  userRole = 'viewer',
  onSaveEmployee,
  onDeleteEmployee,
  onNavigateToSalaryEntry,
  onNavigateToAddLoan,
  onExportEmployees,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resigned'>('all');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'package' | 'preview' | 'documents'>('details');

  const filtered = employees.filter((emp) => {
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      emp.empId.toLowerCase().includes(q) ||
      emp.name.toLowerCase().includes(q) ||
      (emp.nameAr && emp.nameAr.toLowerCase().includes(q)) ||
      (emp.title && emp.title.toLowerCase().includes(q)) ||
      (emp.nationalId && emp.nationalId.includes(q)) ||
      (emp.department && emp.department.toLowerCase().includes(q))
    );
  });

  const handleOpenNew = () => {
    // Generate next empId e.g. EMP007
    const existingNums = employees
      .map((e) => parseInt(e.empId.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    const nextId = `EMP${String(nextNum).padStart(3, '0')}`;

    const newEmp: Employee = {
      id: `${company.id}_${nextId}`,
      companyId: company.id,
      empId: nextId,
      name: '',
      nameAr: '',
      title: '',
      department: '',
      status: 'active',
      hireDate: new Date().toISOString().substring(0, 10),
      nationalId: '',
      idType: '1',
      package: { basic: 800, housing: 0, transport: 0, other_allow: 0 },
      allowances: [],
      deductions: [],
      documents: [],
    };
    setEditingEmployee(newEmp);
    setActiveTab('details');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(JSON.parse(JSON.stringify(emp)));
    setActiveTab('details');
    setIsModalOpen(true);
  };

  // Live preview calculation for the modal
  const getLivePreview = () => {
    if (!editingEmployee) return null;
    const basic = editingEmployee.package.basic || 0;
    const earnings = (editingEmployee.allowances || []).map((a) => ({
      name: a.name,
      amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
      taxable: a.taxable,
      ssc: a.ssc,
    }));
    const deductions = (editingEmployee.deductions || []).map((d) => ({
      name: d.name,
      amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
      preTax: d.preTax,
    }));

    return calculatePayroll(
      editingEmployee,
      year,
      month,
      {
        basic,
        housing: editingEmployee.package.housing || 0,
        transport: editingEmployee.package.transport || 0,
        other_allow: editingEmployee.package.other_allow || 0,
        overtime: 0,
        bonus: 0,
        other_earn: 0,
        social_sec: 0,
        income_tax: 0,
        other_ded: 0,
        advance: 0,
        unpaid_leave: 0,
      },
      earnings,
      deductions,
      editingEmployee.claimsFamily,
      editingEmployee.extraExemption
    );
  };

  const livePreview = editingEmployee ? getLivePreview() : null;

  // Add recurring allowance with company type defaults
  const handleAddAllowance = () => {
    if (!editingEmployee) return;
    const firstType = company.allowanceTypes[0];
    const newAllowance: RecurringAllowance = {
      name: firstType?.name || 'Mobile Allowance',
      method: firstType?.method || 'fixed',
      value: firstType?.value || 30,
      taxable: firstType ? firstType.taxable : true,
      ssc: firstType ? firstType.ssc : true,
    };
    setEditingEmployee({
      ...editingEmployee,
      allowances: [...(editingEmployee.allowances || []), newAllowance],
    });
  };

  // Add recurring deduction with company type defaults
  const handleAddDeduction = () => {
    if (!editingEmployee) return;
    const firstType = company.deductionTypes[0];
    const newDeduction: RecurringDeduction = {
      name: firstType?.name || 'Health Insurance',
      method: firstType?.method || 'fixed',
      value: firstType?.value || 25,
      preTax: firstType ? firstType.preTax : true,
    };
    setEditingEmployee({
      ...editingEmployee,
      deductions: [...(editingEmployee.deductions || []), newDeduction],
    });
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !editingEmployee) return;
    const files = Array.from(e.target.files);
    for (const f of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const newDoc = {
          id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: f.name,
          type: f.type,
          size: f.size,
          uploadDate: new Date().toISOString().substring(0, 10),
          dataUrl,
        };
        setEditingEmployee((prev) =>
          prev ? { ...prev, documents: [...(prev.documents || []), newDoc] } : null
        );
      };
      reader.readAsDataURL(f);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, name, national ID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100"
            />
          </div>

          {/* Status Filter Segmented Button */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All ({employees.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Active ({employees.filter((e) => e.status === 'active').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resigned')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'resigned'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Resigned ({employees.filter((e) => e.status === 'resigned').length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportEmployees}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to Excel</span>
          </button>

          {userRole !== 'viewer' && (
            <button
              type="button"
              onClick={handleOpenNew}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-md text-xs font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3">ID</th>
                <th className="px-3 py-3">Name / Arabic Name</th>
                <th className="px-3 py-3">Title & Dept</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3">Start Date</th>
                <th className="px-3 py-3 text-right">Basic Wage</th>
                <th className="px-3 py-3 text-right">Registered SSC Wage</th>
                <th className="px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                    No employees matching the search filters.
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => {
                  const isResigned = emp.status === 'resigned';
                  return (
                    <tr
                      key={emp.empId}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isResigned ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {emp.empId}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {emp.name}
                        </div>
                        {emp.nameAr && (
                          <div className="text-[11px] text-slate-500 font-arabic">{emp.nameAr}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-slate-800 dark:text-slate-200">{emp.title || '-'}</div>
                        <div className="text-[11px] text-slate-400">{emp.department || '-'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                            isResigned
                              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {isResigned ? 'Resigned' : 'Active'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-mono">
                        {emp.hireDate || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                        {formatCurrency(emp.package?.basic || 0, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {emp.sscExempt ? (
                          <span className="text-[11px] text-indigo-600 font-sans">Exempt</span>
                        ) : emp.sscWage && emp.sscWage > 0 ? (
                          formatCurrency(emp.sscWage, '')
                        ) : (
                          <span className="text-slate-400 font-sans">Auto (Salary base)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigateToSalaryEntry(emp.empId)}
                            className="p-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            title="Open Salary Entry"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                          {userRole !== 'viewer' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete employee ${emp.name} (${emp.empId})? Note: past salary history will be preserved.`
                                  )
                                ) {
                                  onDeleteEmployee(emp.empId);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
                              title="Delete Employee"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee Edit / Add Modal */}
      {isModalOpen && editingEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingEmployee.name ? `Edit: ${editingEmployee.name}` : 'New Employee'}
                </h3>
                <p className="text-slate-500">
                  Employee ID: <span className="font-mono">{editingEmployee.empId}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tab Navigation */}
            <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`py-2.5 border-b-2 transition-colors ${
                  activeTab === 'details'
                    ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                1. Personal & Official
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('package')}
                className={`py-2.5 border-b-2 transition-colors ${
                  activeTab === 'package'
                    ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                2. Salary Package & Allowances
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`py-2.5 border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                3. Live Payroll Preview
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('documents')}
                className={`py-2.5 border-b-2 transition-colors ${
                  activeTab === 'documents'
                    ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                4. Documents ({editingEmployee.documents?.length || 0})
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: DETAILS */}
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Personal Section */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Employee Identity
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Employee ID *
                        </label>
                        <input
                          type="text"
                          required
                          value={editingEmployee.empId}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, empId: e.target.value.trim() })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Full Name (English) *
                        </label>
                        <input
                          type="text"
                          required
                          value={editingEmployee.name}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, name: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1 font-arabic">
                          الاسم الكامل (بالعربية)
                        </label>
                        <input
                          type="text"
                          dir="rtl"
                          value={editingEmployee.nameAr}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, nameAr: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-arabic text-right"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Job Title
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.title}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, title: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Department
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.department}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, department: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Status
                        </label>
                        <select
                          value={editingEmployee.status}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              status: e.target.value as 'active' | 'resigned',
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        >
                          <option value="active">Active</option>
                          <option value="resigned">Resigned</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Work Start Date (Hire Date)
                        </label>
                        <input
                          type="date"
                          value={editingEmployee.hireDate}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, hireDate: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Last Working Date (if resigned)
                        </label>
                        <input
                          type="date"
                          value={editingEmployee.endDate || ''}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              endDate: e.target.value || undefined,
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Official & Contact Details */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Official IDs & Contact
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          ID Type
                        </label>
                        <select
                          value={editingEmployee.idType}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              idType: e.target.value as '1' | '2',
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        >
                          <option value="1">1 - National ID (رقم وطني)</option>
                          <option value="2">2 - Passport No. (جواز سفر)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          National ID / Passport Number
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.nationalId}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, nationalId: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Employee Tax Number (ISTD)
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.taxNumber || ''}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, taxNumber: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Email Address (for Payslips)
                        </label>
                        <input
                          type="email"
                          value={editingEmployee.email || ''}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, email: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Phone Number
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.phone || ''}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, phone: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Address
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.address || ''}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, address: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Social Security & Income Tax Rules Section */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Social Security & Income Tax Configuration
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Social Security Corporation No.
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.sscNumber || ''}
                          onChange={(e) =>
                            setEditingEmployee({ ...editingEmployee, sscNumber: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Insured Monthly Wage at SSC (JOD)
                        </label>
                        <input
                          type="text"
                          placeholder="Leave empty to use salary items"
                          value={editingEmployee.sscWage !== undefined ? editingEmployee.sscWage : ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseArabicIndicNumber(e.target.value) : undefined;
                            setEditingEmployee({ ...editingEmployee, sscWage: val });
                          }}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                        <span className="text-[10px] text-slate-400">
                          If set, overtime/bonuses/unpaid leave do not change SSC.
                        </span>
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Documented Expenses Exemption (Yearly)
                        </label>
                        <input
                          type="number"
                          max={5000}
                          min={0}
                          value={editingEmployee.extraExemption || 0}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              extraExemption: Math.min(5000, Math.max(0, parseFloat(e.target.value) || 0)),
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                        <span className="text-[10px] text-slate-400">Max 5,000 JOD/year</span>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="chk-claimsFamily"
                          checked={!!editingEmployee.claimsFamily}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              claimsFamily: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-slate-900 rounded border-slate-300"
                        />
                        <label htmlFor="chk-claimsFamily" className="text-slate-700 dark:text-slate-300 font-medium">
                          Dependants (family) exemption (9,000 JOD)
                        </label>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="checkbox"
                          id="chk-sscExempt"
                          checked={!!editingEmployee.sscExempt}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              sscExempt: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-slate-900 rounded border-slate-300"
                        />
                        <label htmlFor="chk-sscExempt" className="text-slate-700 dark:text-slate-300 font-medium">
                          Not subject to Social Security (SSC Exempt)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PACKAGE & ALLOWANCES */}
              {activeTab === 'package' && (
                <div className="space-y-6">
                  {/* Monthly Base Package */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Monthly Base Package
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Basic Salary (JOD) *
                        </label>
                        <input
                          type="text"
                          required
                          value={editingEmployee.package.basic || ''}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              package: {
                                ...editingEmployee.package,
                                basic: parseArabicIndicNumber(e.target.value),
                              },
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Housing Allowance
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.package.housing || ''}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              package: {
                                ...editingEmployee.package,
                                housing: parseArabicIndicNumber(e.target.value),
                              },
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Transport Allowance
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.package.transport || ''}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              package: {
                                ...editingEmployee.package,
                                transport: parseArabicIndicNumber(e.target.value),
                              },
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                          Other Allowances
                        </label>
                        <input
                          type="text"
                          value={editingEmployee.package.other_allow || ''}
                          onChange={(e) =>
                            setEditingEmployee({
                              ...editingEmployee,
                              package: {
                                ...editingEmployee.package,
                                other_allow: parseArabicIndicNumber(e.target.value),
                              },
                            })
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recurring Allowances Table */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Recurring Allowances
                      </h4>
                      <button
                        type="button"
                        onClick={handleAddAllowance}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Allowance</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(editingEmployee.allowances || []).map((allow, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700"
                        >
                          <input
                            type="text"
                            list="emp-allowance-types-suggestions"
                            placeholder="Allowance Name..."
                            value={allow.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              const chosen = company.allowanceTypes.find(
                                (t) => t.name.toLowerCase() === val.toLowerCase()
                              );
                              const updated = [...editingEmployee.allowances];
                              updated[idx] = {
                                ...updated[idx],
                                name: val,
                                method: chosen?.method || updated[idx].method,
                                value: chosen ? chosen.value : updated[idx].value,
                                taxable: chosen ? chosen.taxable : updated[idx].taxable,
                                ssc: chosen ? chosen.ssc : updated[idx].ssc,
                              };
                              setEditingEmployee({ ...editingEmployee, allowances: updated });
                            }}
                            className="w-1/3 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium"
                          />
                          <datalist id="emp-allowance-types-suggestions">
                            {company.allowanceTypes.map((t) => (
                              <option key={t.name} value={t.name} />
                            ))}
                          </datalist>

                          <select
                            value={allow.method}
                            onChange={(e) => {
                              const updated = [...editingEmployee.allowances];
                              updated[idx].method = e.target.value as 'fixed' | 'percent';
                              setEditingEmployee({ ...editingEmployee, allowances: updated });
                            }}
                            className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="percent">% of basic</option>
                          </select>

                          <input
                            type="text"
                            value={allow.value}
                            onChange={(e) => {
                              const updated = [...editingEmployee.allowances];
                              updated[idx].value = parseArabicIndicNumber(e.target.value);
                              setEditingEmployee({ ...editingEmployee, allowances: updated });
                            }}
                            className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono"
                          />

                          <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={allow.taxable}
                              onChange={(e) => {
                                const updated = [...editingEmployee.allowances];
                                updated[idx].taxable = e.target.checked;
                                setEditingEmployee({ ...editingEmployee, allowances: updated });
                              }}
                            />
                            <span>Taxable</span>
                          </label>

                          <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={allow.ssc}
                              onChange={(e) => {
                                const updated = [...editingEmployee.allowances];
                                updated[idx].ssc = e.target.checked;
                                setEditingEmployee({ ...editingEmployee, allowances: updated });
                              }}
                            />
                            <span>SSC</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingEmployee.allowances.filter((_, i) => i !== idx);
                              setEditingEmployee({ ...editingEmployee, allowances: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 ml-auto p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recurring Deductions Table */}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Recurring Deductions
                      </h4>
                      <button
                        type="button"
                        onClick={handleAddDeduction}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Deduction</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(editingEmployee.deductions || []).map((ded, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700"
                        >
                          <input
                            type="text"
                            list="emp-deduction-types-suggestions"
                            placeholder="Deduction Name..."
                            value={ded.name}
                            onChange={(e) => {
                              const val = e.target.value;
                              const chosen = company.deductionTypes.find(
                                (t) => t.name.toLowerCase() === val.toLowerCase()
                              );
                              const updated = [...editingEmployee.deductions];
                              updated[idx] = {
                                ...updated[idx],
                                name: val,
                                method: chosen?.method || updated[idx].method,
                                value: chosen ? chosen.value : updated[idx].value,
                                preTax: chosen ? chosen.preTax : updated[idx].preTax,
                              };
                              setEditingEmployee({ ...editingEmployee, deductions: updated });
                            }}
                            className="w-1/3 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-medium"
                          />
                          <datalist id="emp-deduction-types-suggestions">
                            {company.deductionTypes.map((t) => (
                              <option key={t.name} value={t.name} />
                            ))}
                          </datalist>

                          <select
                            value={ded.method}
                            onChange={(e) => {
                              const updated = [...editingEmployee.deductions];
                              updated[idx].method = e.target.value as 'fixed' | 'percent';
                              setEditingEmployee({ ...editingEmployee, deductions: updated });
                            }}
                            className="w-24 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="percent">% of basic</option>
                          </select>

                          <input
                            type="text"
                            value={ded.value}
                            onChange={(e) => {
                              const updated = [...editingEmployee.deductions];
                              updated[idx].value = parseArabicIndicNumber(e.target.value);
                              setEditingEmployee({ ...editingEmployee, deductions: updated });
                            }}
                            className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono"
                          />

                          <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={ded.preTax}
                              onChange={(e) => {
                                const updated = [...editingEmployee.deductions];
                                updated[idx].preTax = e.target.checked;
                                setEditingEmployee({ ...editingEmployee, deductions: updated });
                              }}
                            />
                            <span>Before Tax (Pre-tax)</span>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingEmployee.deductions.filter((_, i) => i !== idx);
                              setEditingEmployee({ ...editingEmployee, deductions: updated });
                            }}
                            className="text-slate-400 hover:text-rose-600 ml-auto p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LIVE PREVIEW */}
              {activeTab === 'preview' && livePreview && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                      Live Calculation for Period: {month}/{year}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-[11px] text-slate-500">Gross Salary</div>
                        <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                          {formatCurrency(livePreview.gross, company.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Social Security (7.5%)</div>
                        <div className="text-base font-bold font-mono text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(livePreview.ssc, company.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Income Tax</div>
                        <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
                          {formatCurrency(livePreview.incomeTax, company.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Net Take-Home</div>
                        <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(livePreview.net, company.currency)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1 text-slate-600 dark:text-slate-300 text-[11px]">
                      <div>{livePreview.sscExplanation}</div>
                      <div>{livePreview.taxExplanation}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DOCUMENTS */}
              {activeTab === 'documents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        Employee Documents
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Attach contracts, national ID copies, certificates, etc.
                      </p>
                    </div>

                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded cursor-pointer transition-colors font-medium text-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Files</span>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {(editingEmployee.documents || []).length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        No documents attached for this employee.
                      </div>
                    ) : (
                      editingEmployee.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        >
                          <div className="flex items-center gap-2">
                            <Paperclip className="w-4 h-4 text-slate-400" />
                            <div>
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {doc.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {(doc.size / 1024).toFixed(1)} KB · Uploaded {doc.uploadDate}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {doc.dataUrl && (
                              <a
                                href={doc.dataUrl}
                                download={doc.name}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Download
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmployee({
                                  ...editingEmployee,
                                  documents: editingEmployee.documents.filter((d) => d.id !== doc.id),
                                });
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editingEmployee.empId && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        onNavigateToAddLoan(editingEmployee.empId);
                      }}
                      className="px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      Add Staff Loan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                        onNavigateToSalaryEntry(editingEmployee.empId);
                      }}
                      className="px-3 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      Open Salary Entry
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
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
                      if (!editingEmployee.empId || !editingEmployee.name) {
                        alert('Employee ID and Full Name are required.');
                        return;
                      }
                      onSaveEmployee(editingEmployee);
                      setIsModalOpen(false);
                    }}
                    className="px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800 dark:hover:bg-white transition-colors"
                  >
                    Save Employee
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
