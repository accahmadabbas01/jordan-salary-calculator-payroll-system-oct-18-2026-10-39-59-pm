import React, { useState } from 'react';
import { recordSsc } from '../../utils/ssc';
import { getRuleSetForPeriod } from '../../utils/calculator';
import { Company, Employee, SalaryRecord, Clearance } from '../../types';
import { formatCurrency, getMonthName, roundHalfUp, YEAR_OPTIONS } from '../../utils/calculator';
import { TaxCertificateQP177 } from '../documents/TaxCertificateQP177';
import { CompanyStatutoryDoc } from '../documents/CompanyStatutoryDoc';
import {
  generateAnnualSummarySheet,
  generateISTDSheet,
  generateSSCListSheet,
  generateCompanyStatutorySheet,
} from '../../utils/excel';
import { exportHtmlToPdf, printHtmlElement } from '../../utils/pdf';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Shield,
  Download,
  Printer,
  Building2,
  Calendar,
  Filter,
} from 'lucide-react';

interface ReportsScreenProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  clearances?: Clearance[];
  year: number;
  month: number;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  company,
  employees,
  records,
  clearances = [],
  year,
  month,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<
    'company_statutory' | 'annual' | 'istd_excel' | 'tax_cert' | 'ssc_list' | 'payroll_register'
  >('company_statutory');

  // Report Period selections
  const [reportYear, setReportYear] = useState(year);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [statutoryViewMode, setStatutoryViewMode] = useState<'month' | 'annual'>('month');
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [isEditingCert, setIsEditingCert] = useState(false);
  const [selectedCertEmpId, setSelectedCertEmpId] = useState<string>(
    employees[0]?.empId || ''
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const companyRecords = records.filter((r) => r.companyId === company.id);

  // 1. Export Company Statutory (SSC & Tax)
  const handleExportCompanyStatutory = () => {
    const bytes = generateCompanyStatutorySheet(company, employees, companyRecords, reportYear, selectedMonth);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Company_SSC_Tax_Obligations_${company.name.replace(/\s+/g, '_')}_${reportYear}_M${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCompanyStatutoryPdf = async () => {
    const el = document.getElementById('company-statutory-doc-render');
    if (!el) return;
    setIsExportingPdf(true);
    try {
      await exportHtmlToPdf(
        el,
        `Company_SSC_Tax_Obligations_${company.name.replace(/\s+/g, '_')}_${reportYear}_M${selectedMonth}.pdf`,
        { orientation: 'l' }
      );
    } catch (e) {
      alert('Error exporting PDF: ' + String(e));
    } finally {
      setIsExportingPdf(false);
    }
  };

  // 2. Export Annual Summary
  const handleExportAnnual = () => {
    const bytes = generateAnnualSummarySheet(company, employees, companyRecords, reportYear);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Annual_Summary_${company.name.replace(/\s+/g, '_')}_${reportYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 3. Export ISTD Excel Sheet (Section 12.3)
  const handleExportISTD = () => {
    const bytes = generateISTDSheet(employees, companyRecords, fromMonth, toMonth, reportYear);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ISTD_Salaries_${company.name.replace(/\s+/g, '_')}_${reportYear}_M${fromMonth}-M${toMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 4. Export SSC Monthly List
  const handleExportSSC = () => {
    const bytes = generateSSCListSheet(company, employees, companyRecords, reportYear, selectedMonth);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SSC_List_${company.name.replace(/\s+/g, '_')}_${reportYear}_${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 5. Export Payroll Register
  const handleExportRegister = () => {
    const monthRecs = companyRecords.filter((r) => r.year === reportYear && r.month === selectedMonth);
    const rows = monthRecs.map((r) => ({
      Year: r.year,
      Month: r.month,
      'Employee ID': r.empId,
      'Full Name': r.name,
      Department: r.dept,
      'Basic Salary': r.amounts.basic || 0,
      Housing: r.amounts.housing || 0,
      Transport: r.amounts.transport || 0,
      'Other Allowances': r.amounts.other_allow || 0,
      Overtime: r.amounts.overtime || 0,
      Bonus: r.amounts.bonus || 0,
      'Other Earnings': r.amounts.other_earn || 0,
      'Gross Salary': r.gross,
      'Social Security': r.amounts.social_sec || 0,
      'Income Tax': r.amounts.income_tax || 0,
      'Advance Salary': r.amounts.advance || 0,
      'Unpaid Leave': r.amounts.unpaid_leave || 0,
      'Other Deductions': r.amounts.other_ded || 0,
      'Total Deductions': r.totalDed,
      'Net Salary': r.net,
      'Payment Method': r.payMethod,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Payroll ${selectedMonth}-${reportYear}`);
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payroll_Register_${company.name.replace(/\s+/g, '_')}_${reportYear}_${selectedMonth}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCertEmp =
    employees.find((e) => e.empId === selectedCertEmpId) || employees[0];

  // Calculations for Company Statutory Obligations in selected month
  const activeMonthRecords = companyRecords.filter(
    (r) => r.year === reportYear && r.month === selectedMonth
  );

  let mInsured = 0;
  let mSscEmp = 0;
  let mSscComp = 0;
  let mTax = 0;

  activeMonthRecords.forEach((r) => {
    const emp = employees.find((e) => e.empId === r.empId);
    const basic = r.amounts.basic || 0;
    const rSsc = recordSsc(emp, r, getRuleSetForPeriod(r.year, r.month));
    const insuredWage = rSsc.insured;

    const sscEmp = r.amounts.social_sec || 0;
    const sscComp = rSsc.employer;
    const tax = r.amounts.income_tax || 0;

    mInsured += insuredWage;
    mSscEmp += sscEmp;
    mSscComp += sscComp;
    mTax += tax;
  });

  const mTotalSscDue = roundHalfUp(mSscEmp + mSscComp, 2);
  const mTotalGovRemittance = roundHalfUp(mTotalSscDue + mTax, 2);

  return (
    <div className="space-y-6">
      {/* Top Filter Card */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span>Payroll Reports & Government Filings</span>
          </h2>
          <p className="text-slate-500">
            Social Security (SSC), Income Tax (ISTD), Annual Summaries, and Official Tax Certificates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-600 dark:text-slate-400">Year:</span>
            <select
              value={reportYear}
              onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-mono font-medium"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-600 dark:text-slate-400">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-medium"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m} - {getMonthName(m, 'en')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs Header Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap gap-2 text-xs pb-2">
          <button
            type="button"
            onClick={() => setActiveReportTab('company_statutory')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold transition-all ${
              activeReportTab === 'company_statutory'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Company SSC & Tax Obligations</span>
            <span className="bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.2 rounded text-[10px]">
              New
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveReportTab('annual')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors ${
              activeReportTab === 'annual'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Annual Employee Summary
          </button>

          <button
            type="button"
            onClick={() => setActiveReportTab('istd_excel')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors ${
              activeReportTab === 'istd_excel'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            ISTD Salaries Sheet (Gov Format)
          </button>

          <button
            type="button"
            onClick={() => setActiveReportTab('tax_cert')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors ${
              activeReportTab === 'tax_cert'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Tax Certificate (QP 177-F3)
          </button>

          <button
            type="button"
            onClick={() => setActiveReportTab('ssc_list')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors ${
              activeReportTab === 'ssc_list'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Social Security Monthly List
          </button>

          <button
            type="button"
            onClick={() => setActiveReportTab('payroll_register')}
            className={`px-3 py-2 rounded-lg font-medium transition-colors ${
              activeReportTab === 'payroll_register'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Payroll Register
          </button>
        </div>
      </div>

      {/* REPORT CONTENT VIEWS */}

      {/* 0. COMPANY STATUTORY OBLIGATIONS (SSC 14.25% + TAX REPORT) */}
      {activeReportTab === 'company_statutory' && (
        <div className="space-y-5 text-xs">
          {/* Subheader and Action Buttons */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Company Statutory Obligations (SSC & Income Tax)</span>
                <span className="font-arabic font-normal text-slate-500">
                  مستحقات الضمان الاجتماعي وضريبة الدخل الواجب دفعها
                </span>
              </h3>
              <p className="text-slate-500">
                Shows exact amounts {company.name} must pay for Social Security (14.25% company + 7.5% employee) and Income Tax
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md flex items-center">
                <button
                  type="button"
                  onClick={() => setStatutoryViewMode('month')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    statutoryViewMode === 'month'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Monthly View
                </button>
                <button
                  type="button"
                  onClick={() => setStatutoryViewMode('annual')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    statutoryViewMode === 'annual'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  12-Month Schedule
                </button>
              </div>

              <button
                type="button"
                onClick={() => printHtmlElement('company-statutory-preview-render')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleDownloadCompanyStatutoryPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5 text-rose-500" />
                <span>{isExportingPdf ? 'Exporting...' : 'Download PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportCompanyStatutory}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-bold hover:bg-slate-800 shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 text-[11px] uppercase font-semibold block">
                Company SSC (14.25%)
              </span>
              <span className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400 block mt-1">
                {formatCurrency(mSscComp, company.currency)}
              </span>
              <span className="text-[10px] text-slate-400">Company direct cost</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 text-[11px] uppercase font-semibold block">
                Employee SSC (7.5%)
              </span>
              <span className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 block mt-1">
                {formatCurrency(mSscEmp, company.currency)}
              </span>
              <span className="text-[10px] text-slate-400">Withheld from salaries</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 text-[11px] uppercase font-semibold block">
                Total SSC Remittance
              </span>
              <span className="text-lg font-bold font-mono text-indigo-900 dark:text-indigo-300 block mt-1">
                {formatCurrency(mTotalSscDue, company.currency)}
              </span>
              <span className="text-[10px] text-slate-400">Total 21.75% due to SSC</span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 text-[11px] uppercase font-semibold block">
                Income Tax Due (ISTD)
              </span>
              <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 block mt-1">
                {formatCurrency(mTax, company.currency)}
              </span>
              <span className="text-[10px] text-slate-400">Withheld tax payable</span>
            </div>

            <div className="col-span-2 md:col-span-1 bg-slate-900 text-white p-4 rounded-lg shadow-sm">
              <span className="text-slate-300 text-[11px] uppercase font-semibold block">
                Total Gov Outflow
              </span>
              <span className="text-lg font-bold font-mono text-emerald-400 block mt-1">
                {formatCurrency(mTotalGovRemittance, company.currency)}
              </span>
              <span className="text-[10px] text-slate-400">Total payable by company</span>
            </div>
          </div>

          {/* Detailed Monthly Employee Table */}
          {statutoryViewMode === 'month' && (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  Itemized Employee Breakdown — {getMonthName(selectedMonth)} {reportYear}
                </span>
                <span className="font-mono text-slate-500">{activeMonthRecords.length} records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2.5">ID</th>
                      <th className="px-3 py-2.5">Name</th>
                      <th className="px-3 py-2.5">National ID</th>
                      <th className="px-3 py-2.5">SSC No</th>
                      <th className="px-3 py-2.5 text-right">Insured Wage</th>
                      <th className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        SSC Emp (7.5%)
                      </th>
                      <th className="px-3 py-2.5 text-right text-indigo-600 dark:text-indigo-400">
                        SSC Co (14.25%)
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold">Total SSC (21.75%)</th>
                      <th className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                        Tax (ISTD)
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold">Total Gov Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeMonthRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">
                          No salary records for {getMonthName(selectedMonth)} {reportYear}.
                        </td>
                      </tr>
                    ) : (
                      activeMonthRecords.map((r) => {
                        const emp = employees.find((e) => e.empId === r.empId);
                        const basic = r.amounts.basic || 0;
                        const rSsc = recordSsc(emp, r, getRuleSetForPeriod(r.year, r.month));
    const insuredWage = rSsc.insured;

                        const sscEmp = r.amounts.social_sec || 0;
                        const sscComp = rSsc.employer;
                        const sscTot = roundHalfUp(sscEmp + sscComp, 2);
                        const tax = r.amounts.income_tax || 0;
                        const totalDue = roundHalfUp(sscTot + tax, 2);

                        return (
                          <tr key={r.empId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-2 font-mono text-slate-500">{r.empId}</td>
                            <td className="px-3 py-2">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</span>
                              {r.nameAr && (
                                <span className="block text-[10px] text-slate-400 font-arabic">
                                  {r.nameAr}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-500">{emp?.nationalId || '-'}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{emp?.sscNumber || '-'}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatCurrency(insuredWage, '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                              {formatCurrency(sscEmp, '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">
                              {formatCurrency(sscComp, '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-800 dark:text-slate-200">
                              {formatCurrency(sscTot, '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                              {formatCurrency(tax, '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                              {formatCurrency(totalDue, '')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 uppercase text-slate-500">
                        Monthly Totals ({activeMonthRecords.length}):
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatCurrency(mInsured, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatCurrency(mSscEmp, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(mSscComp, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(mTotalSscDue, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(mTax, '')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-950 dark:text-white">
                        {formatCurrency(mTotalGovRemittance, '')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 12-Month Annual Schedule Table */}
          {statutoryViewMode === 'annual' && (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  12-Month Statutory Remittance Schedule — Year {reportYear}
                </span>
                <span className="text-slate-500 font-mono">Jordan Labor & Tax Calendar</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3 py-2.5">Month</th>
                      <th className="px-3 py-2.5 text-center">Headcount</th>
                      <th className="px-3 py-2.5 text-right">Insured Wages</th>
                      <th className="px-3 py-2.5 text-right text-indigo-600 dark:text-indigo-400">
                        SSC Co (14.25%)
                      </th>
                      <th className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                        SSC Emp (7.5%)
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold">Total SSC (21.75%)</th>
                      <th className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                        Tax (ISTD)
                      </th>
                      <th className="px-3 py-2.5 text-right font-bold">Total Gov Remittance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const mRecs = companyRecords.filter(
                        (r) => r.year === reportYear && r.month === m
                      );

                      let ins = 0;
                      let sEmp = 0;
                      let sCo = 0;
                      let tx = 0;

                      mRecs.forEach((r) => {
                        const emp = employees.find((e) => e.empId === r.empId);
                        const basic = r.amounts.basic || 0;
                        const rSsc = recordSsc(emp, r, getRuleSetForPeriod(r.year, r.month));
    const insuredWage = rSsc.insured;

                        const se = r.amounts.social_sec || 0;
                        const sc = rSsc.employer;
                        const t = r.amounts.income_tax || 0;

                        ins += insuredWage;
                        sEmp += se;
                        sCo += sc;
                        tx += t;
                      });

                      const totSsc = roundHalfUp(sEmp + sCo, 2);
                      const totGov = roundHalfUp(totSsc + tx, 2);

                      return (
                        <tr
                          key={m}
                          onClick={() => {
                            setSelectedMonth(m);
                            setStatutoryViewMode('month');
                          }}
                          className={`cursor-pointer transition-colors ${
                            selectedMonth === m
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="px-3 py-2 font-medium">
                            {m} - {getMonthName(m, 'en')}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-slate-500">
                            {mRecs.length}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatCurrency(ins, '')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                            {formatCurrency(sCo, '')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {formatCurrency(sEmp, '')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-bold">
                            {formatCurrency(totSsc, '')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                            {formatCurrency(tx, '')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                            {formatCurrency(totGov, '')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Hidden or Document Preview Container for PDF and Print */}
          <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-lg flex justify-center overflow-x-auto">
            <CompanyStatutoryDoc
              id="company-statutory-preview-render"
              company={company}
              employees={employees}
              records={companyRecords}
              year={reportYear}
              month={selectedMonth}
            />
          </div>
        </div>
      )}

      {/* 1. ANNUAL SUMMARY */}
      {activeReportTab === 'annual' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Annual Employee Payroll Summary — {reportYear}
              </h3>
              <p className="text-slate-500">Totals per employee for calendar year {reportYear}</p>
            </div>
            <button
              type="button"
              onClick={handleExportAnnual}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Dept</th>
                  <th className="px-3 py-2.5 text-center">Months</th>
                  <th className="px-3 py-2.5 text-right">Gross Salary</th>
                  <th className="px-3 py-2.5 text-right">SSC (7.5%)</th>
                  <th className="px-3 py-2.5 text-right">Income Tax</th>
                  <th className="px-3 py-2.5 text-right">Net Salary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employees.map((emp) => {
                  const empRecords = companyRecords.filter(
                    (r) => r.empId === emp.empId && r.year === reportYear
                  );
                  if (empRecords.length === 0) return null;

                  const totGross = empRecords.reduce((sum, r) => sum + r.gross, 0);
                  const totSsc = empRecords.reduce((sum, r) => sum + (r.amounts.social_sec || 0), 0);
                  const totTax = empRecords.reduce((sum, r) => sum + (r.amounts.income_tax || 0), 0);
                  const totNet = empRecords.reduce((sum, r) => sum + r.net, 0);

                  return (
                    <tr key={emp.empId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {emp.empId}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {emp.name}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{emp.department}</td>
                      <td className="px-3 py-2 text-center font-mono">{empRecords.length}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(totGross, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(totSsc, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(totTax, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(totNet, '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. ISTD EXCEL SHEET */}
      {activeReportTab === 'istd_excel' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Income and Sales Tax Department (ISTD) Salaries Sheet
              </h3>
              <p className="text-slate-500">
                Official Jordan Government ISTD e-filing workbook with split 4-part Arabic names
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600 dark:text-slate-400">From:</span>
              <select
                value={fromMonth}
                onChange={(e) => setFromMonth(parseInt(e.target.value, 10))}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <span className="font-medium text-slate-600 dark:text-slate-400">To:</span>
              <select
                value={toMonth}
                onChange={(e) => setToMonth(parseInt(e.target.value, 10))}
                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportISTD}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export ISTD Excel</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 space-y-2">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Columns strictly formatted per ISTD Specification:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
              <div>1. Serial No</div>
              <div>2. First Name</div>
              <div>3. Second Name</div>
              <div>4. Third Name</div>
              <div>5. Family Name</div>
              <div>6. National ID</div>
              <div>7. Tax File No</div>
              <div>8. Social Security No</div>
              <div>9. Monthly Salaries</div>
              <div>10. Allowances</div>
              <div>11. Overtime / Bonus</div>
              <div>12. Withheld Tax</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAX CERTIFICATE QP 177-F3 */}
      {activeReportTab === 'tax_cert' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-slate-700 dark:text-slate-300">Employee:</span>
              <select
                value={selectedCertEmpId}
                onChange={(e) => setSelectedCertEmpId(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-md font-medium text-slate-900 dark:text-slate-100"
              >
                {employees.map((e) => (
                  <option key={e.empId} value={e.empId}>
                    {e.empId} - {e.name} ({e.nameAr || ''})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingCert((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-medium ${
                  isEditingCert
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200'
                }`}
                title="Correct any amount on the certificate before printing"
              >
                <span>{isEditingCert ? 'Done editing' : 'Edit amounts'}</span>
              </button>

              <button
                type="button"
                disabled={isEditingCert}
                onClick={() => printHtmlElement('tax-cert-doc-view')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded font-medium hover:bg-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Certificate</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf || isEditingCert}
                onClick={async () => {
                  const el = document.getElementById('tax-cert-doc-view');
                  if (!el) return;
                  setIsExportingPdf(true);
                  try {
                    await exportHtmlToPdf(
                      el,
                      `Tax_Certificate_QP177_${selectedCertEmp.name.replace(/\s+/g, '_')}_${reportYear}.pdf`
                    );
                  } finally {
                    setIsExportingPdf(false);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'Exporting...' : 'Download PDF'}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-950 p-6 rounded-lg flex justify-center overflow-x-auto">
            <TaxCertificateQP177
              id="tax-cert-doc-view"
              company={company}
              employee={selectedCertEmp}
              records={companyRecords}
              clearances={clearances}
              fromMonth={fromMonth}
              toMonth={toMonth}
              year={reportYear}
              editable={isEditingCert}
            />
          </div>
        </div>
      )}

      {/* 4. SOCIAL SECURITY MONTHLY LIST */}
      {activeReportTab === 'ssc_list' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Social Security Monthly Declaration List — {getMonthName(selectedMonth)} {reportYear}
              </h3>
              <p className="text-slate-500">Insured wages and 7.5% employee deductions</p>
            </div>

            <button
              type="button"
              onClick={handleExportSSC}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">SSC Number</th>
                  <th className="px-3 py-2.5">National ID</th>
                  <th className="px-3 py-2.5 text-right">Insured Wage</th>
                  <th className="px-3 py-2.5 text-right">Employee Share (7.5%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {companyRecords
                  .filter((r) => r.year === reportYear && r.month === selectedMonth)
                  .map((r) => {
                    const emp = employees.find((e) => e.empId === r.empId);
                    const insuredWage =
                      emp?.sscWage && emp.sscWage > 0
                        ? emp.sscWage
                        : (r.amounts.basic || 0) +
                          (r.amounts.housing || 0) +
                          (r.amounts.transport || 0) +
                          (r.amounts.other_allow || 0);

                    return (
                      <tr key={r.empId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                          {r.empId}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                          {r.name}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-500">
                          {emp?.sscNumber || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-500">
                          {emp?.nationalId || '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {formatCurrency(insuredWage, '')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(r.amounts.social_sec || 0, '')}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PAYROLL REGISTER */}
      {activeReportTab === 'payroll_register' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Payroll Register — {getMonthName(selectedMonth)} {reportYear}
              </h3>
              <p className="text-slate-500">Complete itemized monthly payroll journal</p>
            </div>

            <button
              type="button"
              onClick={handleExportRegister}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Register (Excel)</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5 text-right">Basic</th>
                  <th className="px-3 py-2.5 text-right">Housing</th>
                  <th className="px-3 py-2.5 text-right">Transport</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-3 py-2.5 text-right">SSC</th>
                  <th className="px-3 py-2.5 text-right">Tax</th>
                  <th className="px-3 py-2.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {companyRecords
                  .filter((r) => r.year === reportYear && r.month === selectedMonth)
                  .map((r) => (
                    <tr key={r.empId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                        {r.empId}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                        {r.name}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.amounts.basic || 0, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.amounts.housing || 0, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.amounts.transport || 0, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                        {formatCurrency(r.gross, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.amounts.social_sec || 0, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatCurrency(r.amounts.income_tax || 0, '')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(r.net, '')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
