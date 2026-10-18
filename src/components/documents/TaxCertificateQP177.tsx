import React from 'react';
import { Company, Employee, SalaryRecord } from '../../types';
import { splitArabicName, roundHalfUp } from '../../utils/calculator';

interface TaxCertificateQP177Props {
  company: Company;
  employee: Employee;
  records: SalaryRecord[];
  fromMonth: number;
  toMonth: number;
  year: number;
  id?: string;
}

export const TaxCertificateQP177: React.FC<TaxCertificateQP177Props> = ({
  company,
  employee,
  records,
  fromMonth,
  toMonth,
  year,
  id = 'tax-cert-print-content',
}) => {
  const filteredRecords = records.filter(
    (r) => r.empId === employee.empId && r.year === year && r.month >= fromMonth && r.month <= toMonth
  );

  const monthsCount = filteredRecords.length;

  let totalMonthlySalaries = 0;
  let totalNonMonthly = 0;
  let totalTaxWithheld = 0;

  for (const r of filteredRecords) {
    const monthly =
      (r.amounts.basic || 0) +
      (r.amounts.housing || 0) +
      (r.amounts.transport || 0) +
      (r.amounts.other_allow || 0) +
      (r.amounts.overtime || 0) +
      (r.earnings || []).reduce((s, e) => s + (e.amount || 0), 0);
    const nonMonthly = (r.amounts.bonus || 0) + (r.amounts.other_earn || 0);

    totalMonthlySalaries += monthly;
    totalNonMonthly += nonMonthly;
    totalTaxWithheld += r.amounts.income_tax || 0;
  }

  const grandTotalGross = totalMonthlySalaries + totalNonMonthly;

  const splitFils = (amount: number) => {
    const rounded = roundHalfUp(amount, 3);
    const parts = rounded.toFixed(3).split('.');
    return {
      dinar: parseInt(parts[0], 10).toLocaleString('en-US'),
      fils: parts[1],
    };
  };

  const nameParts = splitArabicName(employee.nameAr || employee.name);

  const fromMonthStr = fromMonth < 10 ? `0${fromMonth}` : `${fromMonth}`;
  const toMonthStr = toMonth < 10 ? `0${toMonth}` : `${toMonth}`;
  const lastDayOfToMonth = new Date(year, toMonth, 0).getDate();
  const taxPeriodStr = `01/${fromMonthStr}/${year} - ${lastDayOfToMonth}/${toMonthStr}/${year}`;

  const serviceDurationStr = monthsCount === 1 ? 'شهر واحد' : `${monthsCount} أشهر`;

  const rows = [
    {
      title: 'الرواتب والاجور',
      gross: splitFils(totalMonthlySalaries),
      tax: splitFils(totalTaxWithheld),
    },
    {
      title: 'الرواتب والاجور غير الشهرية (مكافآت، إيرادات أخرى)',
      gross: splitFils(totalNonMonthly),
      tax: splitFils(0),
    },
    {
      title: 'مكافآت اعضاء مجلس الادارة',
      gross: splitFils(0),
      tax: splitFils(0),
    },
    {
      title: 'مكافأة نهاية الخدمة - للفترة قبل 2010/1/1',
      gross: splitFils(0),
      tax: splitFils(0),
    },
    {
      title: 'مكافأة نهاية الخدمة - للفترة من 2010/1/1 ولغاية 2014/12/31',
      gross: splitFils(0),
      tax: splitFils(0),
    },
    {
      title: 'مكافأة نهاية الخدمة - للفترة من 2015/1/1 وما بعد',
      gross: splitFils(0),
      tax: splitFils(0),
    },
    {
      title: 'اي مبالغ اخرى',
      gross: splitFils(0),
      tax: splitFils(0),
    },
    {
      title: 'المساهمة الوطنية',
      gross: splitFils(0),
      tax: splitFils(0),
    },
  ];

  return (
    <div
      id={id}
      dir="rtl"
      className="bg-white text-slate-950 p-8 max-w-[850px] mx-auto border border-slate-300 shadow-sm print:shadow-none print:border-none print:p-0 font-arabic text-xs leading-relaxed"
      style={{ minHeight: '1100px' }}
    >
      {/* Top Header */}
      <div className="flex justify-between items-start border-b border-slate-900 pb-3">
        <div className="text-left font-mono text-sm font-bold tracking-wider">
          QP 177-F3
        </div>
        <div className="text-right space-y-0.5">
          <div className="font-bold text-sm">المملكة الأردنية الهاشمية</div>
          <div className="font-semibold text-xs">وزارة المالية / دائرة ضريبة الدخل والمبيعات</div>
        </div>
      </div>

      {/* Title */}
      <div className="text-center my-4 space-y-1">
        <h1 className="text-base font-bold tracking-tight text-slate-900">
          شهادة مجموع الرواتب والاجور والضريبة المقتطعة
        </h1>
        <p className="text-[11px] text-slate-700">
          صادر بالاستناد لأحكام الفقرة ( و ) من المادة ( ١٢ ) من قانون ضريبة الدخل رقم ( ٣٤ ) لسنة ٢٠١٤ وتعديلاته.
        </p>
      </div>

      {/* Employee Info Table */}
      <div className="border border-slate-900 rounded-none overflow-hidden my-3">
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            <tr className="border-b border-slate-900 bg-slate-50 font-semibold">
              <td className="p-1.5 border-l border-slate-900 w-1/4">الاسم الأول: {nameParts.first || '-'}</td>
              <td className="p-1.5 border-l border-slate-900 w-1/4">اسم الأب: {nameParts.father || '-'}</td>
              <td className="p-1.5 border-l border-slate-900 w-1/4">اسم الجد: {nameParts.grandfather || '-'}</td>
              <td className="p-1.5 w-1/4">اسم العائلة: {nameParts.family || '-'}</td>
            </tr>
            <tr className="border-b border-slate-900">
              <td colSpan={2} className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">الرقم الوطني / جواز السفر:</span>{' '}
                <span className="font-mono font-semibold">{employee.nationalId || '-'}</span>
              </td>
              <td colSpan={2} className="p-1.5">
                <span className="text-slate-600">الرقم الضريبي للمستخدم:</span>{' '}
                <span className="font-mono font-semibold">{employee.taxNumber || '-'}</span>
              </td>
            </tr>
            <tr className="border-b border-slate-900">
              <td colSpan={2} className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">العنوان:</span> {employee.address || '-'}
              </td>
              <td colSpan={2} className="p-1.5">
                <span className="text-slate-600">الهاتف:</span>{' '}
                <span className="font-mono">{employee.phone || '-'}</span>
              </td>
            </tr>
            <tr className="border-b border-slate-900">
              <td className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">صندوق البريد:</span>{' '}
                <span className="font-mono">{employee.poBox || '-'}</span>
              </td>
              <td className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">الرمز البريدي:</span>{' '}
                <span className="font-mono">{employee.postalCode || '-'}</span>
              </td>
              <td colSpan={2} className="p-1.5">
                <span className="text-slate-600">الفترة الضريبية:</span>{' '}
                <span className="font-mono font-semibold">{taxPeriodStr}</span>
              </td>
            </tr>
            <tr>
              <td className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">مدة العمل اثناء الفترة:</span>{' '}
                <span className="font-semibold">{serviceDurationStr}</span>
              </td>
              <td className="p-1.5 border-l border-slate-900">
                <span className="text-slate-600">تاريخ مباشرة العمل:</span>{' '}
                <span className="font-mono">{employee.hireDate || '-'}</span>
              </td>
              <td colSpan={2} className="p-1.5">
                <span className="text-slate-600">تاريخ انتهاء العمل:</span>{' '}
                <span className="font-mono">{employee.endDate || '-'}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amounts Table */}
      <div className="border border-slate-900 my-4">
        <table className="w-full text-center text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 font-bold">
              <th rowSpan={2} className="p-2 border-l border-slate-900 text-right w-2/5">
                البيـــــــــــــــــان
              </th>
              <th colSpan={2} className="p-1.5 border-l border-slate-900 w-[30%]">
                الضريبة المقتطعة
              </th>
              <th colSpan={2} className="p-1.5 w-[30%]">
                مجموع الرواتب والاجور والمكافآت
              </th>
            </tr>
            <tr className="border-b border-slate-900 bg-slate-50 font-semibold text-[10px]">
              <th className="p-1 border-l border-slate-900 w-1/2">دينار</th>
              <th className="p-1 border-l border-slate-900 w-1/2">فلس</th>
              <th className="p-1 border-l border-slate-900 w-1/2">دينار</th>
              <th className="p-1 w-1/2">فلس</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-300">
                <td className="p-1.5 border-l border-slate-900 text-right pr-2 font-medium">
                  {row.title}
                </td>
                <td className="p-1.5 border-l border-slate-900 font-mono tabular-nums">
                  {row.tax.dinar !== '0' ? row.tax.dinar : ''}
                </td>
                <td className="p-1.5 border-l border-slate-900 font-mono tabular-nums">
                  {row.tax.dinar !== '0' || row.tax.fils !== '000' ? row.tax.fils : ''}
                </td>
                <td className="p-1.5 border-l border-slate-900 font-mono tabular-nums">
                  {row.gross.dinar !== '0' ? row.gross.dinar : ''}
                </td>
                <td className="p-1.5 font-mono tabular-nums">
                  {row.gross.dinar !== '0' || row.gross.fils !== '000' ? row.gross.fils : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-900">
              <td className="p-2 border-l border-slate-900 text-right pr-2">المجمــــــــــــوع</td>
              <td className="p-2 border-l border-slate-900 font-mono tabular-nums">
                {splitFils(totalTaxWithheld).dinar}
              </td>
              <td className="p-2 border-l border-slate-900 font-mono tabular-nums">
                {splitFils(totalTaxWithheld).fils}
              </td>
              <td className="p-2 border-l border-slate-900 font-mono tabular-nums">
                {splitFils(grandTotalGross).dinar}
              </td>
              <td className="p-2 font-mono tabular-nums">{splitFils(grandTotalGross).fils}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Employer Declaration & Signatures */}
      <div className="mt-6 border border-slate-900 p-3 space-y-3">
        <p className="text-[11px] leading-relaxed text-slate-900 font-medium">
          أشهد أن المعلومات المدرجة أعلاه صحيحة وحقيقية وكاملة وغير منقوصة وأنني قمت بدفع ضريبة الدخل المقتطعة والمبينة أعلاه الى دائرة ضريبة الدخل والمبيعات.
        </p>

        <div className="grid grid-cols-2 gap-6 pt-2 text-xs">
          <div className="space-y-1">
            <div>
              <span className="text-slate-600">اسم صاحب العمل:</span>{' '}
              <span className="font-semibold text-slate-900">{company.name}</span>
            </div>
            <div>
              <span className="text-slate-600">الرقم الضريبي لصاحب العمل:</span>{' '}
              <span className="font-mono font-semibold text-slate-900">{company.taxNumber || '-'}</span>
            </div>
            <div>
              <span className="text-slate-600">تاريخ تحرير الشهادة:</span>{' '}
              <span className="font-mono">{new Date().toLocaleDateString('en-GB')}</span>
            </div>
          </div>

          <div className="border border-dashed border-slate-400 p-4 text-center flex flex-col justify-between h-24">
            <span className="text-slate-500 text-[10px]">خاتم وتوقيع صاحب العمل أو المفوض عنه</span>
            <div className="border-b border-slate-300 w-2/3 mx-auto"></div>
          </div>
        </div>
      </div>

      {/* Footnote */}
      <div className="flex justify-between items-center mt-4 text-[10px] text-slate-500">
        <div>حدث النموذج بتاريخ ٢٠١٩/٨/٤م</div>
        <div>نظام إدارة الرواتب الأردني · دائرة ضريبة الدخل والمبيعات</div>
      </div>
    </div>
  );
};
