import React from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { formatCurrency, getMonthName, roundHalfUp } from '../../utils/calculator';

interface CompanyStatutoryDocProps {
  company: Company;
  employees: Employee[];
  records: SalaryRecord[];
  year: number;
  month: number;
  id?: string;
}

export const CompanyStatutoryDoc: React.FC<CompanyStatutoryDocProps> = ({
  company,
  employees,
  records,
  year,
  month,
  id = 'company-statutory-print-content',
}) => {
  const monthNameEn = getMonthName(month, 'en');
  const monthNameAr = getMonthName(month, 'ar');
  const currency = company.currency || 'JOD';

  const monthRecords = records.filter(
    (r) => r.companyId === company.id && r.year === year && r.month === month
  );

  let totalInsuredWages = 0;
  let totalSscEmployee = 0;
  let totalSscCompany = 0;
  let totalTaxWithheld = 0;

  const items = monthRecords.map((r) => {
    const emp = employees.find((e) => e.empId === r.empId);
    const basic = r.amounts.basic || 0;
    const insuredWage =
      emp?.sscWage && emp.sscWage > 0
        ? emp.sscWage
        : basic + (r.amounts.housing || 0) + (r.amounts.transport || 0) + (r.amounts.other_allow || 0);

    const sscEmployee = r.amounts.social_sec || 0;
    const sscCompany = roundHalfUp(insuredWage * 0.1425, 2);
    const sscTotal = roundHalfUp(sscEmployee + sscCompany, 2);
    const taxWithheld = r.amounts.income_tax || 0;
    const totalDue = roundHalfUp(sscTotal + taxWithheld, 2);

    totalInsuredWages += insuredWage;
    totalSscEmployee += sscEmployee;
    totalSscCompany += sscCompany;
    totalTaxWithheld += taxWithheld;

    return {
      empId: r.empId,
      name: r.name,
      nameAr: r.nameAr || emp?.nameAr || '',
      dept: r.dept || emp?.department || '',
      nationalId: emp?.nationalId || '',
      sscNumber: emp?.sscNumber || '',
      basic,
      insuredWage,
      sscEmployee,
      sscCompany,
      sscTotal,
      taxWithheld,
      totalDue,
    };
  });

  const grandTotalSsc = roundHalfUp(totalSscEmployee + totalSscCompany, 2);
  const grandTotalGovernmentRemittance = roundHalfUp(grandTotalSsc + totalTaxWithheld, 2);

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-8 max-w-[1000px] mx-auto border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0 text-xs"
    >
      {/* Official Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-5">
        <div>
          {company.logo ? (
            <img
              src={company.logo}
              alt={company.name}
              className="h-12 w-auto object-contain mb-2"
            />
          ) : (
            <div className="h-10 w-28 bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider uppercase mb-2">
              {company.name.substring(0, 8)}
            </div>
          )}
          <h1 className="text-base font-bold text-slate-900">{company.name}</h1>
          <p className="text-slate-500 text-[11px]">{company.address || 'Amman, Hashemite Kingdom of Jordan'}</p>
          {company.taxNumber && (
            <p className="text-slate-500 font-mono text-[11px]">
              Tax ID / الرقم الضريبي: {company.taxNumber}
            </p>
          )}
        </div>

        <div className="text-right">
          <div className="bg-slate-900 text-white px-3 py-1 font-bold text-xs uppercase tracking-wider inline-block rounded mb-1">
            STATUTORY REPORT / تقرير الالتزامات الحكومية
          </div>
          <h2 className="text-sm font-bold text-slate-800">
            Social Security & Income Tax Obligations
          </h2>
          <p className="font-arabic font-semibold text-slate-700 text-xs">
            مستحقات الضمان الاجتماعي وضريبة الدخل الواجبة على الشركة
          </p>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Period: <span className="font-bold text-slate-800">{monthNameEn} {year}</span> ({monthNameAr})
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            Company SSC Share (14.25%)
          </div>
          <div className="text-xs font-arabic text-slate-500">مساهمة المنشأة في الضمان</div>
          <div className="text-base font-bold font-mono text-indigo-700 mt-1">
            {formatCurrency(totalSscCompany, currency)}
          </div>
          <div className="text-[10px] text-slate-400">Direct company cost</div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            Employee SSC Deductions (7.5%)
          </div>
          <div className="text-xs font-arabic text-slate-500">اقتطاعات رواتب الموظفين للضمان</div>
          <div className="text-base font-bold font-mono text-slate-800 mt-1">
            {formatCurrency(totalSscEmployee, currency)}
          </div>
          <div className="text-[10px] text-slate-400">Withheld from wages</div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            Total Remittance to SSC (21.75%)
          </div>
          <div className="text-xs font-arabic text-slate-500">إجمالي مستحق الضمان الاجتماعي</div>
          <div className="text-base font-bold font-mono text-indigo-900 mt-1">
            {formatCurrency(grandTotalSsc, currency)}
          </div>
          <div className="text-[10px] text-slate-400">Payable to SSC by 15th</div>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded">
          <div className="text-[10px] uppercase font-semibold text-slate-500">
            Income Tax Withheld (ISTD)
          </div>
          <div className="text-xs font-arabic text-slate-500">ضريبة الدخل المقتطعة للتوريد</div>
          <div className="text-base font-bold font-mono text-amber-700 mt-1">
            {formatCurrency(totalTaxWithheld, currency)}
          </div>
          <div className="text-[10px] text-slate-400">Payable to Tax Dept</div>
        </div>
      </div>

      {/* Grand Total Box */}
      <div className="p-4 bg-slate-900 text-white rounded mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400">
            TOTAL GOVERNMENT STATUTORY REMITTANCES
          </div>
          <div className="text-xs font-arabic font-semibold">
            إجمالي المبالغ الواجب دفعها وتوريدها للجهات الحكومية (الضمان + ضريبة الدخل)
          </div>
        </div>
        <div className="text-2xl font-bold font-mono tabular-nums">
          {formatCurrency(grandTotalGovernmentRemittance, currency)}
        </div>
      </div>

      {/* Itemized Employee Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-left border-collapse border border-slate-200 text-[11px]">
          <thead className="bg-slate-100 uppercase text-[9px] tracking-wider text-slate-700 font-bold border-b border-slate-300">
            <tr>
              <th className="p-2 border-r border-slate-200">ID</th>
              <th className="p-2 border-r border-slate-200">Employee Name</th>
              <th className="p-2 border-r border-slate-200">National ID</th>
              <th className="p-2 border-r border-slate-200">SSC No</th>
              <th className="p-2 border-r border-slate-200 text-right">Insured Wage</th>
              <th className="p-2 border-r border-slate-200 text-right">SSC Emp (7.5%)</th>
              <th className="p-2 border-r border-slate-200 text-right">SSC Co (14.25%)</th>
              <th className="p-2 border-r border-slate-200 text-right">Total SSC (21.75%)</th>
              <th className="p-2 border-r border-slate-200 text-right">Tax (ISTD)</th>
              <th className="p-2 text-right">Total Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  No salary records found for {monthNameEn} {year}.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.empId} className="hover:bg-slate-50">
                  <td className="p-2 font-mono text-slate-600 border-r border-slate-200">{it.empId}</td>
                  <td className="p-2 border-r border-slate-200">
                    <div className="font-semibold text-slate-900">{it.name}</div>
                    {it.nameAr && <div className="text-[10px] font-arabic text-slate-500">{it.nameAr}</div>}
                  </td>
                  <td className="p-2 font-mono text-slate-500 border-r border-slate-200">{it.nationalId || '-'}</td>
                  <td className="p-2 font-mono text-slate-500 border-r border-slate-200">{it.sscNumber || '-'}</td>
                  <td className="p-2 text-right font-mono tabular-nums border-r border-slate-200">
                    {formatCurrency(it.insuredWage, '')}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums border-r border-slate-200">
                    {formatCurrency(it.sscEmployee, '')}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums font-semibold text-indigo-700 border-r border-slate-200">
                    {formatCurrency(it.sscCompany, '')}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums font-bold text-slate-800 border-r border-slate-200">
                    {formatCurrency(it.sscTotal, '')}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums font-semibold text-amber-700 border-r border-slate-200">
                    {formatCurrency(it.taxWithheld, '')}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums font-bold text-slate-900">
                    {formatCurrency(it.totalDue, '')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-400">
            <tr>
              <td colSpan={4} className="p-2.5 text-right uppercase border-r border-slate-200">
                Totals ({items.length} Employees):
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums border-r border-slate-200">
                {formatCurrency(totalInsuredWages, '')}
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums border-r border-slate-200">
                {formatCurrency(totalSscEmployee, '')}
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums text-indigo-700 border-r border-slate-200">
                {formatCurrency(totalSscCompany, '')}
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums text-slate-900 border-r border-slate-200">
                {formatCurrency(grandTotalSsc, '')}
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums text-amber-700 border-r border-slate-200">
                {formatCurrency(totalTaxWithheld, '')}
              </td>
              <td className="p-2.5 text-right font-mono tabular-nums text-slate-950 text-sm">
                {formatCurrency(grandTotalGovernmentRemittance, '')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Statutory Rules & Remittance Notes */}
      <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-6 space-y-2 text-[10px] text-slate-600">
        <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          Statutory Payment & Compliance Rules (Jordan)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <strong>Social Security Corporation (SSC):</strong>
            <ul className="list-disc list-inside mt-0.5 space-y-0.5">
              <li>Employer Contribution: 14.25% of insured wages (Old age 11%, Injury 2%, Unemployment 0.75%, Maternity 0.50%).</li>
              <li>Employee Deduction: 7.5% of insured wages withheld from salary.</li>
              <li>Total Remittance: 21.75% of insured wage must be remitted by the 15th of the following month.</li>
            </ul>
          </div>
          <div>
            <strong>Income & Sales Tax Department (ISTD):</strong>
            <ul className="list-disc list-inside mt-0.5 space-y-0.5">
              <li>Employee Withholding Tax: Calculated according to Jordan Income Tax Law No. 34 of 2014 & 2018 amendments.</li>
              <li>Tax must be withheld at source from employee salaries and remitted to ISTD monthly or quarterly.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Certification and Sign-Offs */}
      <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 text-center text-[11px]">
        <div>
          <div className="text-slate-500 font-medium mb-1">Prepared By (Payroll Accountant)</div>
          <div className="h-10 border-b border-dashed border-slate-300"></div>
          <div className="mt-1 font-semibold text-slate-700">Signature & Date</div>
        </div>
        <div>
          <div className="text-slate-500 font-medium mb-1">Reviewed By (Finance Manager)</div>
          <div className="h-10 border-b border-dashed border-slate-300"></div>
          <div className="mt-1 font-semibold text-slate-700">Signature & Date</div>
        </div>
        <div>
          <div className="text-slate-500 font-medium mb-1">Authorized By (General Manager)</div>
          <div className="h-10 border-b border-dashed border-slate-300"></div>
          <div className="mt-1 font-semibold text-slate-700">Official Company Stamp</div>
        </div>
      </div>
    </div>
  );
};
