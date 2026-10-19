import React, { useEffect, useMemo, useState } from 'react';
import { Clearance, Company, Employee, SalaryRecord } from '../../types';
import { splitArabicName, roundHalfUp, calculatePayroll } from '../../utils/calculator';
import emblemUrl from '../../assets/jordan-emblem.jpg';

/**
 * ISTD form QP 177-F3: certificate of total salaries & wages and the tax withheld,
 * issued under Article 12(و) of Income Tax Law No. 34 of 2014 as amended.
 * Layout follows the official form cell by cell.
 */

interface TaxCertificateQP177Props {
  company: Company;
  employee: Employee;
  records: SalaryRecord[];
  clearances?: Clearance[];
  fromMonth: number;
  toMonth: number;
  year: number;
  /** Show inputs so amounts can be corrected before printing */
  editable?: boolean;
  id?: string;
}

type AmountKey =
  | 'salaries'
  | 'nonMonthly'
  | 'board'
  | 'eosPre2010'
  | 'eos2010_2014'
  | 'eos2015'
  | 'other'
  | 'total';
type TaxKey = AmountKey | 'national';

const INCOME_ROWS: { key: AmountKey; label: React.ReactNode }[] = [
  { key: 'salaries', label: 'الرواتب والاجور' },
  { key: 'nonMonthly', label: 'الرواتب والاجور غير الشهرية' },
  { key: 'board', label: 'مكافآت اعضاء مجلس الادارة' },
  {
    key: 'eosPre2010',
    label: (
      <>
        مكافأة نهاية الخدمة عن الخدمات
        <br />
        ما قبل ٢٠١٠/١/١
      </>
    ),
  },
  {
    key: 'eos2010_2014',
    label: (
      <>
        مكافأة نهاية الخدمة عن الخدمات
        <br />
        ٢٠١٠/١/١ حتى ٢٠١٤/١٢/٣١
      </>
    ),
  },
  {
    key: 'eos2015',
    label: (
      <>
        مكافأة نهاية الخدمة عن الخدمات
        <br />
        من ٢٠١٥/١/١ حتى نهاية العمل
      </>
    ),
  },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const toUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const DAY = 86400000;

/** Splits an end-of-service amount across the three legal service periods by days served. */
function splitEndOfService(amount: number, hireDate: string, lastDay: string) {
  if (!amount || !hireDate || !lastDay) return { pre2010: 0, mid: 0, post2015: amount || 0 };
  const start = toUTC(hireDate);
  const end = toUTC(lastDay) + DAY;
  const overlap = (a: number, b: number) => Math.max(0, Math.min(end, b) - Math.max(start, a));
  const d1 = overlap(-Infinity, toUTC('2010-01-01'));
  const d2 = overlap(toUTC('2010-01-01'), toUTC('2015-01-01'));
  const d3 = overlap(toUTC('2015-01-01'), Infinity);
  const totalDays = d1 + d2 + d3;
  if (totalDays <= 0) return { pre2010: 0, mid: 0, post2015: amount };
  const pre2010 = roundHalfUp((amount * d1) / totalDays, 3);
  const mid = roundHalfUp((amount * d2) / totalDays, 3);
  return { pre2010, mid, post2015: roundHalfUp(amount - pre2010 - mid, 3) };
}

/** Months and days worked inside the tax period, e.g. "12 شهر" or "4 شهر و 10 يوم". */
function workDuration(emp: Employee, periodStart: string, periodEnd: string): string {
  const start = emp.hireDate && emp.hireDate > periodStart ? emp.hireDate : periodStart;
  const end = emp.endDate && emp.endDate < periodEnd ? emp.endDate : periodEnd;
  if (end < start) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let months = (ey - sy) * 12 + (em - sm);
  let days = ed - sd + 1;
  const daysInEndMonth = new Date(ey, em, 0).getDate();
  if (days >= daysInEndMonth || (sd === 1 && ed === daysInEndMonth)) {
    months += 1;
    days = 0;
  } else if (days < 0) {
    months -= 1;
    days += new Date(ey, em - 1, 0).getDate();
  }
  const parts: string[] = [];
  if (months > 0) parts.push(`${months} شهر`);
  if (days > 0) parts.push(`${days} يوم`);
  return parts.join(' و ');
}

export const TaxCertificateQP177: React.FC<TaxCertificateQP177Props> = ({
  company,
  employee,
  records,
  clearances = [],
  fromMonth,
  toMonth,
  year,
  editable = false,
  id = 'tax-cert-print-content',
}) => {
  const periodStart = `${year}-${pad2(fromMonth)}-01`;
  const periodEnd = `${year}-${pad2(toMonth)}-${pad2(new Date(year, toMonth, 0).getDate())}`;

  // ---- Amounts calculated from salary records and completed clearances -------------------
  const calculated = useMemo(() => {
    const income: Record<AmountKey, number> = {
      salaries: 0,
      nonMonthly: 0,
      board: 0,
      eosPre2010: 0,
      eos2010_2014: 0,
      eos2015: 0,
      other: 0,
      total: 0,
    };
    const tax: Record<TaxKey, number> = { ...income, national: 0 };

    const recs = records.filter(
      (r) => r.empId === employee.empId && r.year === year && r.month >= fromMonth && r.month <= toMonth
    );
    for (const r of recs) {
      income.salaries +=
        (r.amounts.basic || 0) +
        (r.amounts.housing || 0) +
        (r.amounts.transport || 0) +
        (r.amounts.other_allow || 0) +
        (r.amounts.overtime || 0) +
        (r.earnings || []).reduce((s, e) => s + (e.amount || 0), 0) -
        (r.amounts.unpaid_leave || 0);
      income.nonMonthly += (r.amounts.bonus || 0) + (r.amounts.other_earn || 0);

      const recordTax = r.amounts.income_tax || 0;
      // The 1% national contribution is part of the withheld tax; show it on its own line.
      const nc = Math.min(
        recordTax,
        calculatePayroll(employee, r.year, r.month, r.amounts, r.earnings || [], r.deductions || [], r.claimsFamily, r.extraExemption)
          .nationalContribution
      );
      tax.national += nc;
      tax.salaries += recordTax - nc;
    }

    const done = clearances.filter(
      (c) =>
        c.empId === employee.empId &&
        c.companyId === employee.companyId &&
        c.status === 'completed' &&
        c.lastDay >= periodStart &&
        c.lastDay <= periodEnd
    );
    for (const c of done) {
      income.salaries += c.dues.salary_due || 0;
      income.other += (c.dues.leave_pay || 0) + (c.dues.notice_pay || 0) + (c.dues.other_dues || 0);
      const eos = splitEndOfService(c.dues.indemnity || 0, c.hireDate, c.lastDay);
      income.eosPre2010 += eos.pre2010;
      income.eos2010_2014 += eos.mid;
      income.eos2015 += eos.post2015;
      tax.other += c.deductions.income_tax || 0;
    }
    return { income, tax };
  }, [records, clearances, employee, year, fromMonth, toMonth, periodStart, periodEnd]);

  // ---- Manual corrections (kept per employee and period) ----------------------------------
  const overrideKey = `${employee.companyId}_${employee.empId}_${year}_${fromMonth}_${toMonth}`;
  const [overrides, setOverrides] = useState<{ income: Partial<Record<AmountKey, number>>; tax: Partial<Record<TaxKey, number>> }>({
    income: {},
    tax: {},
  });
  useEffect(() => setOverrides({ income: {}, tax: {} }), [overrideKey]);

  const incomeValue = (k: AmountKey) => overrides.income[k] ?? roundHalfUp(calculated.income[k], 3);
  const taxValue = (k: TaxKey) => overrides.tax[k] ?? roundHalfUp(calculated.tax[k], 3);

  const incomeKeys: AmountKey[] = ['salaries', 'nonMonthly', 'board', 'eosPre2010', 'eos2010_2014', 'eos2015', 'other'];
  const taxKeys: TaxKey[] = [...incomeKeys, 'national'];
  const incomeTotal = roundHalfUp(incomeKeys.reduce((s, k) => s + incomeValue(k), 0), 3);
  const taxTotal = roundHalfUp(taxKeys.reduce((s, k) => s + taxValue(k), 0), 3);

  const name = splitArabicName(employee.nameAr || employee.name);
  const today = new Date();

  // ---- Cell renderers ---------------------------------------------------------------------
  const cell = 'border border-black px-1.5 py-1 align-middle';
  const head = `${cell} font-bold text-center`;

  const split = (amount: number, showZero: boolean) => {
    if (!amount && !showZero) return { dinar: '', fils: '' };
    const [d, f] = roundHalfUp(amount, 3).toFixed(3).split('.');
    return { dinar: Number(d).toLocaleString('en-US'), fils: f };
  };

  // Plain function (not a component) so inputs keep focus while typing.
  const amountCells = (
    value: number,
    opts: { onChange?: (v: number | undefined) => void; isTotal?: boolean; rowSpan?: number } = {}
  ) => {
    const { onChange, isTotal, rowSpan } = opts;
    const v = split(value, !!isTotal);
    if (editable && onChange) {
      return (
        <td colSpan={2} rowSpan={rowSpan} className={`${cell} p-0.5`}>
          <input
            type="number"
            step="0.001"
            dir="ltr"
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)}
            className="w-full px-1 py-0.5 text-center font-mono text-[11px] bg-amber-50 border border-amber-300 rounded"
          />
        </td>
      );
    }
    return (
      <>
        <td rowSpan={rowSpan} className={`${cell} text-center font-mono tabular-nums ${isTotal ? 'font-bold' : ''}`} dir="ltr">
          {v.fils}
        </td>
        <td rowSpan={rowSpan} className={`${cell} text-center font-mono tabular-nums ${isTotal ? 'font-bold' : ''}`} dir="ltr">
          {v.dinar}
        </td>
      </>
    );
  };

  const setIncome = (k: AmountKey) => (v: number | undefined) =>
    setOverrides((o) => ({ ...o, income: { ...o.income, [k]: v } }));
  const setTax = (k: TaxKey) => (v: number | undefined) => setOverrides((o) => ({ ...o, tax: { ...o.tax, [k]: v } }));

  return (
    <div
      id={id}
      dir="rtl"
      className="bg-white text-black px-10 pt-6 pb-8 w-[800px] shrink-0 mx-auto shadow-sm print:shadow-none font-arabic text-[12px] leading-snug"
      style={{ minHeight: '1120px' }}
    >
      {/* Header: ministry (right) · emblem (centre) · form code (left) */}
      <div className="grid grid-cols-3 items-start">
        <div className="font-bold text-[15px] leading-relaxed pt-1">
          <div>وزارة الماليـــة</div>
          <div>دائرة ضريبة الدخل والمبيعات</div>
        </div>
        <div className="flex justify-center">
          <img src={emblemUrl} alt="شعار المملكة الأردنية الهاشمية" className="h-[78px] w-auto" />
        </div>
        <div className="text-left font-bold text-[13px] font-sans pt-1" dir="ltr">
          QP 177-F3
        </div>
      </div>

      <h1 className="text-center font-bold text-[18px] mt-3">شهادة مجموع الرواتب والاجور والضريبة المقتطعة</h1>
      <p className="text-center font-bold text-[11.5px] mt-3 mb-3">
        صادر بالاستناد لأحكام الفقرة ( و ) من المادة ( ١٢ ) من قانون ضريبة الدخل رقم ( ٣٤ ) لسنة ٢٠١٤ وتعديلاته.
      </p>

      {/* Employee information */}
      <table className="w-full border-collapse border-2 border-black table-fixed">
        <tbody>
          <tr>
            <td colSpan={4} className={head}>معلومات الموظف</td>
          </tr>
          <tr>
            <td colSpan={4} className={head}>اسم الموظف</td>
          </tr>
          <tr>
            <td className={head}>الاسم</td>
            <td className={head}>الاب</td>
            <td className={head}>الجد</td>
            <td className={head}>العائلة</td>
          </tr>
          <tr className="h-7">
            <td dir="auto" className={`${cell} text-center`}>{name.first}</td>
            <td dir="auto" className={`${cell} text-center`}>{name.father}</td>
            <td dir="auto" className={`${cell} text-center`}>{name.grandfather}</td>
            <td dir="auto" className={`${cell} text-center`}>{name.family}</td>
          </tr>
          <tr>
            <td className={head}>الرقم الضريبي</td>
            <td className={head}>الرقم الوطني/ جواز السفر</td>
            <td className={head}>صندوق البريد</td>
            <td className={head}>الرمز البريدي</td>
          </tr>
          <tr className="h-7">
            <td className={`${cell} text-center font-mono`}>{employee.taxNumber || ''}</td>
            <td className={`${cell} text-center font-mono`}>{employee.nationalId || ''}</td>
            <td className={`${cell} text-center font-mono`}>{employee.poBox || ''}</td>
            <td className={`${cell} text-center font-mono`}>{employee.postalCode || ''}</td>
          </tr>
          <tr>
            <td colSpan={3} className={head}>العـنـــــوان</td>
            <td className={head}>الهاتف</td>
          </tr>
          <tr className="h-7">
            <td colSpan={3} dir="auto" className={`${cell} text-center`}>{employee.address || ''}</td>
            <td className={`${cell} text-center font-mono`} dir="ltr">
              {employee.phone || ''}
            </td>
          </tr>
          <tr>
            <td className={head}>الفترة الضريبية</td>
            <td className={head}>مدة العمل اثناء الفترة الضريبية</td>
            <td className={head}>تاريخ مباشرة العمل (التعيين)</td>
            <td className={head}>تاريخ انتهاء العمل (انهاء الخدمة)</td>
          </tr>
          <tr className="h-7">
            <td className={`${cell} text-center font-mono text-[11px]`} dir="ltr">
              {fmtDate(periodStart)} - {fmtDate(periodEnd)}
            </td>
            <td className={`${cell} text-center`}>{workDuration(employee, periodStart, periodEnd)}</td>
            <td className={`${cell} text-center font-mono`}>{fmtDate(employee.hireDate)}</td>
            <td className={`${cell} text-center font-mono`}>{fmtDate(employee.endDate)}</td>
          </tr>
        </tbody>
      </table>

      {/* Salaries & wages (right) and tax withheld (left) */}
      <table className="w-full border-collapse border-2 border-black table-fixed mt-6">
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '12.5%' }} />
          <col style={{ width: '25.5%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12.5%' }} />
          <col style={{ width: '25.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} className={head}>القيمة</th>
            <th rowSpan={2} className={head}>اجمالي الرواتب والاجور</th>
            <th colSpan={2} className={head}>القيمة</th>
            <th rowSpan={2} className={head}>الضريبة المقتطعة من اجمالي</th>
          </tr>
          <tr>
            <th className={head}>فلس</th>
            <th className={head}>دينار</th>
            <th className={head}>فلس</th>
            <th className={head}>دينار</th>
          </tr>
        </thead>
        <tbody>
          {INCOME_ROWS.map((row) => (
            <tr key={row.key} className="h-8">
              {amountCells(incomeValue(row.key), { onChange: setIncome(row.key) })}
              <td className={`${cell} text-center`}>{row.label}</td>
              {amountCells(taxValue(row.key), { onChange: setTax(row.key) })}
              <td className={`${cell} text-center`}>{row.label}</td>
            </tr>
          ))}
          <tr className="h-8">
            {amountCells(incomeValue('other'), { onChange: setIncome('other'), rowSpan: 2 })}
            <td rowSpan={2} className={`${cell} text-center`}>اي مبالغ اخرى</td>
            {amountCells(taxValue('other'), { onChange: setTax('other') })}
            <td className={`${cell} text-center`}>اي مبالغ اخرى</td>
          </tr>
          <tr className="h-8">
            {amountCells(taxValue('national'), { onChange: setTax('national') })}
            <td className={`${cell} text-center`}>المساهمة الوطنية</td>
          </tr>
          <tr className="h-8">
            {amountCells(incomeTotal, { isTotal: true })}
            <td className={`${cell} text-center font-bold`}>المجموع</td>
            {amountCells(taxTotal, { isTotal: true })}
            <td className={`${cell} text-center font-bold`}>المجموع</td>
          </tr>
        </tbody>
      </table>

      {/* Employer declaration */}
      <p className="font-bold text-[12px] leading-loose mt-3">
        أشهد أن المعلومات المدرجة أعلاه صحيحة وحقيقية وكاملة وغير منقوصة وأنني قمت بدفع ضريبة الدخل المقتطعة والمبينة
        أعلاه الى دائرة ضريبة الدخل والمبيعات.
      </p>

      <table className="w-full border-collapse border-2 border-black table-fixed mt-2">
        <colgroup>
          <col style={{ width: '24.5%' }} />
          <col style={{ width: '38%' }} />
          <col style={{ width: '12.5%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <tbody>
          <tr className="h-8">
            <td className={`${cell} font-bold`}>اسم صاحب العمل</td>
            <td dir="auto" className={`${cell} text-center font-semibold`}>{company.name}</td>
            <td rowSpan={2} className={`${cell} text-center font-bold`}>
              ختم وتوقيع
              <br />
              صاحب العمل
            </td>
            <td rowSpan={2} className={cell}></td>
          </tr>
          <tr className="h-8">
            <td className={`${cell} font-bold`}>الرقم الضريبي</td>
            <td className={`${cell} text-center font-mono`}>{company.taxNumber || ''}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 font-bold">
        التاريخ:{' '}
        <span className="font-mono font-normal" dir="ltr">
          {pad2(today.getDate())} / {pad2(today.getMonth() + 1)} / {today.getFullYear()}
        </span>
      </div>
    </div>
  );
};
