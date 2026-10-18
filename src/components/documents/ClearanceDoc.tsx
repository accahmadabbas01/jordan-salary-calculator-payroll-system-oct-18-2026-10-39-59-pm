import React from 'react';
import { Company, Employee, Clearance } from '../../types';
import { formatCurrency } from '../../utils/calculator';

interface ClearanceDocProps {
  company: Company;
  employee: Employee;
  clearance: Clearance;
  id?: string;
}

export const ClearanceDoc: React.FC<ClearanceDocProps> = ({
  company,
  employee,
  clearance,
  id = 'clearance-print-content',
}) => {
  const isOwed = clearance.net < 0;

  return (
    <div
      id={id}
      className="bg-white text-slate-900 p-8 max-w-[850px] mx-auto border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0 text-sm"
      style={{ minHeight: '1100px' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-slate-200">
        <div>
          {company.logo ? (
            <img src={company.logo} alt={company.name} className="h-10 w-auto object-contain mb-1" />
          ) : (
            <div className="text-lg font-bold text-slate-900">{company.name}</div>
          )}
          <div className="text-xs text-slate-500">{company.address}</div>
        </div>

        <div className="text-right">
          <div className="text-lg font-bold tracking-tight text-slate-900">
            CLEARANCE & FINAL SETTLEMENT
          </div>
          <div className="text-base font-semibold text-slate-800 font-arabic">
            براءة ذمة ومخالصة نهائية
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Status / الحالة:{' '}
            <span
              className={`font-semibold ${
                clearance.status === 'completed' ? 'text-emerald-700' : 'text-amber-600'
              }`}
            >
              {clearance.status === 'completed' ? 'COMPLETED / مكتملة' : 'DRAFT / مسودة'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-3 my-4 bg-slate-50 p-4 rounded-lg border border-slate-100 text-xs">
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Employee ID / الرقم الوظيفي:</span>
          <span className="font-semibold text-slate-900 font-mono">{clearance.empId}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Reason / سبب انتهاء الخدمة:</span>
          <span className="font-medium text-slate-900">{clearance.reason}</span>
        </div>

        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Name / الاسم:</span>
          <span className="font-semibold text-slate-900">{employee.name}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Hire Date / تاريخ المباشرة:</span>
          <span className="font-medium text-slate-900 font-mono">{clearance.hireDate}</span>
        </div>

        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500 font-arabic">الاسم بالعربية:</span>
          <span className="font-semibold text-slate-900 font-arabic">{employee.nameAr}</span>
        </div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1">
          <span className="text-slate-500">Last Working Day / آخر يوم عمل:</span>
          <span className="font-medium text-slate-900 font-mono">{clearance.lastDay}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">Monthly Wage / الأجر الشهري:</span>
          <span className="font-semibold text-slate-900 font-mono tabular-nums">
            {formatCurrency(clearance.monthlyWage, company.currency || 'JOD')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Service Length / مدة الخدمة:</span>
          <span className="font-medium text-slate-900 font-mono">
            {clearance.serviceLength.years}y {clearance.serviceLength.months}m {clearance.serviceLength.days}d ({clearance.serviceLength.totalDays} days)
          </span>
        </div>
      </div>

      {/* Dues & Deductions Tables */}
      <div className="grid grid-cols-2 gap-6 mt-4">
        {/* Dues */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100/90 px-4 py-2 font-semibold flex justify-between items-center text-xs text-slate-800 border-b border-slate-200">
            <span>Dues</span>
            <span className="font-arabic">المستحقات</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Last month salary ({clearance.daysWorked} days)</div>
                  <div className="text-[11px] text-slate-500 font-arabic">راتب أيام العمل في الشهر الأخير</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.dues.salary_due, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Unused annual leave ({clearance.leaveDays} days)</div>
                  <div className="text-[11px] text-slate-500 font-arabic">بدل الإجازات غير المستغلة</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.dues.leave_pay, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">End of service indemnity</div>
                  <div className="text-[11px] text-slate-500 font-arabic">مكافأة نهاية الخدمة</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.dues.indemnity, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Notice period pay ({clearance.noticeMonths} mo)</div>
                  <div className="text-[11px] text-slate-500 font-arabic">بدل فترة الإشعار</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.dues.notice_pay, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Other dues</div>
                  <div className="text-[11px] text-slate-500 font-arabic">مستحقات أخرى</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.dues.other_dues, '')}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="px-3 py-2">
                  <div>Total dues</div>
                  <div className="text-[11px] font-normal text-slate-500 font-arabic">مجموع المستحقات</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-900 tabular-nums">
                  {formatCurrency(clearance.totalDues, '')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100/90 px-4 py-2 font-semibold flex justify-between items-center text-xs text-slate-800 border-b border-slate-200">
            <span>Deductions</span>
            <span className="font-arabic">الاقتطاعات</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Social Security</div>
                  <div className="text-[11px] text-slate-500 font-arabic">اقتطاع الضمان الاجتماعي</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.deductions.ssc, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Income tax</div>
                  <div className="text-[11px] text-slate-500 font-arabic">ضريبة الدخل</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.deductions.income_tax, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Staff loan balance</div>
                  <div className="text-[11px] text-slate-500 font-arabic">رصيد القروض المتبقي</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.deductions.loans, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Unfulfilled notice deduction</div>
                  <div className="text-[11px] text-slate-500 font-arabic">بدل إشعار غير منفذ</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.deductions.notice_deduction, '')}
                </td>
              </tr>

              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">Other deductions</div>
                  <div className="text-[11px] text-slate-500 font-arabic">اقتطاعات أخرى</div>
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                  {formatCurrency(clearance.deductions.other_deductions, '')}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold border-t border-slate-200">
                <td className="px-3 py-2">
                  <div>Total deductions</div>
                  <div className="text-[11px] font-normal text-slate-500 font-arabic">مجموع الاقتطاعات</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-900 tabular-nums">
                  {formatCurrency(clearance.totalDeductions, '')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net Settlement Box */}
      <div
        className={`mt-6 p-4 rounded-lg flex items-center justify-between text-white ${
          isOwed ? 'bg-rose-900' : 'bg-slate-900'
        }`}
      >
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-300">
            {isOwed ? 'EMPLOYEE OWES' : 'NET SETTLEMENT DUE'}
          </div>
          <div className="text-sm font-semibold text-slate-200 font-arabic">
            {isOwed ? 'المبلغ المترتب بذمة الموظف' : 'صافي المبلغ المستحق للموظف'}
          </div>
        </div>
        <div className="text-2xl font-bold font-mono tabular-nums tracking-tight">
          {formatCurrency(Math.abs(clearance.net), company.currency || 'JOD')}
        </div>
      </div>

      {/* Department Sign-Off Table */}
      <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden text-xs">
        <div className="bg-slate-100 px-4 py-2 font-semibold text-slate-800 flex justify-between">
          <span>Department Sign-Off / براءة الذمة من الدوائر المعنية</span>
          <span className="font-arabic font-normal text-slate-600">تسليم العهد والأجهزة والصلاحيات</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
              <th className="px-3 py-1.5 text-left font-medium">Department / الدائرة</th>
              <th className="px-3 py-1.5 text-center font-medium">Cleared / تم الإخلاء</th>
              <th className="px-3 py-1.5 text-left font-medium">Signed By / الموقّع</th>
              <th className="px-3 py-1.5 text-left font-medium">Date / التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {(clearance.signOffs || []).map((sign, idx) => (
              <tr key={idx} className="border-b border-slate-100">
                <td className="px-3 py-1.5">
                  <span className="font-medium text-slate-800">{sign.department}</span>{' '}
                  <span className="text-slate-500 font-arabic">({sign.departmentAr})</span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                      sign.cleared
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {sign.cleared ? '✓ Cleared' : 'Pending'}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-medium text-slate-700">{sign.by || '-'}</td>
                <td className="px-3 py-1.5 text-slate-500 font-mono">{sign.date || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legal Declaration */}
      <div className="mt-6 p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700 space-y-1">
        <div className="italic">
          "I, the undersigned, confirm that I received all my dues as shown above and have no further claims against the company."
        </div>
        <div className="font-arabic font-medium text-slate-800 text-right dir-rtl" dir="rtl">
          "أقر أنا الموقع أدناه بأنني استلمت كامل مستحقاتي المبينة أعلاه وليس لي أي مطالبات أخرى تجاه الشركة."
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-6 mt-12 pt-6 border-t border-slate-200 text-xs">
        <div className="text-center space-y-6">
          <div className="text-slate-600">
            <div>Employee Signature</div>
            <div className="font-arabic text-slate-400">توقيع الموظف</div>
          </div>
          <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
        </div>

        <div className="text-center space-y-6">
          <div className="text-slate-600">
            <div>HR Manager</div>
            <div className="font-arabic text-slate-400">مدير الموارد البشرية</div>
          </div>
          <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
        </div>

        <div className="text-center space-y-6">
          <div className="text-slate-600">
            <div>General Manager</div>
            <div className="font-arabic text-slate-400">المدير العام</div>
          </div>
          <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto"></div>
        </div>
      </div>
    </div>
  );
};
