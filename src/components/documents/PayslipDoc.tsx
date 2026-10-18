import React from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { formatCurrency, getMonthName } from '../../utils/calculator';

interface PayslipDocProps {
  company: Company;
  employee: Employee;
  record: SalaryRecord;
  id?: string;
}

export const PayslipDoc: React.FC<PayslipDocProps> = ({
  company,
  employee,
  record,
  id = 'payslip-print-content',
}) => {
  const monthEn = getMonthName(record.month, 'en');
  const monthAr = getMonthName(record.month, 'ar');

  // Earnings items: basic always, non-zero package/amounts items, and additional allowances
  const earningsList: { labelEn: string; labelAr: string; amount: number }[] = [
    { labelEn: 'Basic salary', labelAr: 'الراتب الأساسي', amount: record.amounts.basic || 0 },
  ];
  if (record.amounts.housing) {
    earningsList.push({ labelEn: 'Housing allowance', labelAr: 'بدل السكن', amount: record.amounts.housing });
  }
  if (record.amounts.transport) {
    earningsList.push({ labelEn: 'Transportation allowance', labelAr: 'بدل المواصلات', amount: record.amounts.transport });
  }
  if (record.amounts.other_allow) {
    earningsList.push({ labelEn: 'Other allowances', labelAr: 'علاوات أخرى', amount: record.amounts.other_allow });
  }
  if (record.amounts.overtime) {
    earningsList.push({ labelEn: 'Overtime', labelAr: 'العمل الإضافي', amount: record.amounts.overtime });
  }
  if (record.amounts.bonus) {
    earningsList.push({ labelEn: 'Bonus', labelAr: 'مكافأة', amount: record.amounts.bonus });
  }
  if (record.amounts.other_earn) {
    earningsList.push({ labelEn: 'Other earnings', labelAr: 'إيرادات أخرى', amount: record.amounts.other_earn });
  }
  for (const earn of record.earnings || []) {
    earningsList.push({
      labelEn: earn.name,
      labelAr: earn.name,
      amount: earn.amount || 0,
    });
  }

  // Deductions items
  const deductionsList: { labelEn: string; labelAr: string; amount: number; isLoan?: boolean }[] = [];
  if (record.amounts.social_sec) {
    deductionsList.push({
      labelEn: 'Social Security',
      labelAr: 'الضمان الاجتماعي',
      amount: record.amounts.social_sec,
    });
  }
  if (record.amounts.income_tax) {
    deductionsList.push({
      labelEn: 'Income tax',
      labelAr: 'ضريبة الدخل',
      amount: record.amounts.income_tax,
    });
  }
  if (record.amounts.advance) {
    deductionsList.push({
      labelEn: 'Advance salary',
      labelAr: 'سلفة على الراتب',
      amount: record.amounts.advance,
    });
  }
  if (record.amounts.unpaid_leave) {
    deductionsList.push({
      labelEn: 'Unpaid leave',
      labelAr: 'إجازة بدون راتب',
      amount: record.amounts.unpaid_leave,
    });
  }
  if (record.amounts.other_ded) {
    deductionsList.push({
      labelEn: 'Other deductions',
      labelAr: 'اقتطاعات أخرى',
      amount: record.amounts.other_ded,
    });
  }
  for (const ded of record.deductions || []) {
    deductionsList.push({
      labelEn: ded.loanId ? `${ded.name} (loan installment)` : ded.name,
      labelAr: ded.loanId ? `${ded.name} (قسط قرض)` : ded.name,
      amount: ded.amount || 0,
      isLoan: !!ded.loanId,
    });
  }

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-8 max-w-[800px] mx-auto border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0 text-sm"
      style={{ minHeight: '1050px' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-6 border-b border-slate-200">
        <div className="space-y-1">
          {company.logo ? (
            <img src={company.logo} alt={company.name} className="h-12 w-auto object-contain mb-2" />
          ) : (
            <div className="text-xl font-bold tracking-tight text-slate-900">{company.name}</div>
          )}
          {company.address && <div className="text-xs text-slate-500">{company.address}</div>}
          {company.taxNumber && (
            <div className="text-xs text-slate-500">
              Tax No. / الرقم الضريبي: <span className="font-mono">{company.taxNumber}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-xl font-bold text-slate-900 tracking-tight">SALARY SLIP</div>
          <div className="text-base font-semibold text-slate-700 font-arabic">قسيمة راتب</div>
          <div className="text-xs text-slate-500 mt-1">
            {monthEn} {record.year} · <span className="font-arabic">{monthAr} {record.year}</span>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-4 my-4 bg-slate-50/70 p-4 rounded-lg border border-slate-100 text-xs">
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Employee ID / الرقم الوظيفي:</span>
          <span className="font-semibold text-slate-900 font-mono">{record.empId}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Payment Date / تاريخ الدفع:</span>
          <span className="font-medium text-slate-900 font-mono">{record.payDate}</span>
        </div>

        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Employee Name / الاسم:</span>
          <span className="font-semibold text-slate-900">{record.name}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Payment Method / طريقة الدفع:</span>
          <span className="font-medium text-slate-900">{record.payMethod}</span>
        </div>

        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500 font-arabic">الاسم بالعربية:</span>
          <span className="font-semibold text-slate-900 font-arabic">{record.nameAr || employee.nameAr}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">National ID / الرقم الوطني:</span>
          <span className="font-medium text-slate-900 font-mono">{employee.nationalId || '-'}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">Job Title / المسمى الوظيفي:</span>
          <span className="font-medium text-slate-900">{record.title || employee.title || '-'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Social Security / الضمان الاجتماعي:</span>
          <span className="font-medium text-slate-900 font-mono">{employee.sscNumber || '-'}</span>
        </div>
      </div>

      {/* Two tables side by side */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        {/* Earnings */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100/80 px-4 py-2 font-semibold flex justify-between items-center text-xs text-slate-800 border-b border-slate-200">
            <span>Earnings</span>
            <span className="font-arabic">الاستحقاقات</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {earningsList.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{item.labelEn}</div>
                    <div className="text-[11px] text-slate-500 font-arabic">{item.labelAr}</div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                    {formatCurrency(item.amount, '')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="px-4 py-2.5">
                  <div>Gross salary</div>
                  <div className="text-[11px] font-normal text-slate-500 font-arabic">إجمالي الراتب</div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900 tabular-nums">
                  {formatCurrency(record.gross, '')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100/80 px-4 py-2 font-semibold flex justify-between items-center text-xs text-slate-800 border-b border-slate-200">
            <span>Deductions</span>
            <span className="font-arabic">الاقتطاعات</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {deductionsList.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                    No deductions this month
                  </td>
                </tr>
              ) : (
                deductionsList.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-800">{item.labelEn}</div>
                      <div className="text-[11px] text-slate-500 font-arabic">{item.labelAr}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                      {formatCurrency(item.amount, '')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="px-4 py-2.5">
                  <div>Total deductions</div>
                  <div className="text-[11px] font-normal text-slate-500 font-arabic">مجموع الاقتطاعات</div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-slate-900 tabular-nums">
                  {formatCurrency(record.totalDed, '')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net Pay Box */}
      <div className="mt-6 p-4 rounded-lg bg-slate-900 text-white flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-300">NET PAY</div>
          <div className="text-sm font-semibold text-slate-200 font-arabic">صافي الراتب المستحق</div>
        </div>
        <div className="text-2xl font-bold font-mono tabular-nums tracking-tight">
          {formatCurrency(record.net, record.currency || 'JOD')}
        </div>
      </div>

      {/* Notes if any */}
      {record.notes && (
        <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Notes / ملاحظات:</span> {record.notes}
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-slate-200 text-xs">
        <div className="text-center space-y-8">
          <div className="text-slate-500">
            <div>Employee Signature</div>
            <div className="font-arabic text-slate-400">توقيع الموظف</div>
          </div>
          <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
        </div>

        <div className="text-center space-y-8">
          <div className="text-slate-500">
            <div>Authorised Signature</div>
            <div className="font-arabic text-slate-400">المفوض بالتوقيع</div>
          </div>
          <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-[10px] text-slate-400">
        Generated on {new Date().toLocaleDateString('en-GB')} · Jordan Salary Calculator
      </div>
    </div>
  );
};
