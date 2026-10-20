/**
 * Monthly SSC contributions calculator — a port of "Jordan_SSC_Calculator.xlsx".
 *
 * Column letters in the comments refer to the workbook's Calculator sheet so results can be
 * checked cell by cell. Settings mirror its Settings sheet (C4–C15).
 *
 * Maternity-day treatment (Settings C14):
 *   1 = no contributions on maternity days (workbook default)
 *   2 = contributions on the full wage (company keeps paying the salary)
 *   3 = SSC rule used by this system's payroll: employer keeps paying its old-age + unemployment
 *       share on maternity days; the employee's share is deducted by SSC from the allowance
 */
import * as XLSX from 'xlsx';
import { PayrollRuleSet } from '../types';
import { ruleBranches } from './ssc';

export interface SscCalcSettings {
  empOldAge: number; // C4
  empUnemployment: number; // C5
  erOldAge: number; // C6
  erWorkInjury: number; // C7
  erMaternity: number; // C8
  erUnemployment: number; // C9
  erHighRisk: number; // C10
  ceiling: number; // C11, 0 = no cap
  dayBasis: number; // C12
  maternityEntitlement: number; // C13
  maternityTreatment: 1 | 2 | 3; // C14
  minContributions: number; // C15
}

export interface SscCalcRow {
  id: string;
  name: string; // B
  gender: 'male' | 'female'; // C
  wage: number; // D
  serviceDays: number; // E
  unpaidDays: number; // F
  maternityDays: number; // G
  unemployment: boolean; // H
  highRisk: boolean; // I
  priorContributions: number; // J
  empId?: string;
}

export interface SscCalcResult {
  paidDays: number; // K
  wagePaid: number; // L
  wageMaternity: number; // M
  base: number; // N
  empOldAge: number; // O
  empUnemployment: number; // P
  empTotal: number; // Q
  erOldAge: number; // R
  erWorkInjury: number; // S
  erMaternity: number; // T
  erUnemployment: number; // U
  erHighRisk: number; // V
  erTotal: number; // W
  totalDue: number; // X
  maternityBenefit: number; // Y
  netPay: number; // Z
  check: string; // AA ("OK" or a warning)
}

/** The workbook's own Settings sheet values. */
export const WORKBOOK_DEFAULTS: SscCalcSettings = {
  empOldAge: 0.07,
  empUnemployment: 0.005,
  erOldAge: 0.11,
  erWorkInjury: 0.02,
  erMaternity: 0.0075,
  erUnemployment: 0.005,
  erHighRisk: 0.01,
  ceiling: 0,
  dayBasis: 30,
  maternityEntitlement: 70,
  maternityTreatment: 1,
  minContributions: 6,
};

/** Settings taken from the system's official rules for a month. */
export function settingsFromRules(rs: PayrollRuleSet | null): SscCalcSettings {
  if (!rs) return { ...WORKBOOK_DEFAULTS };
  const b = ruleBranches(rs);
  return {
    ...WORKBOOK_DEFAULTS,
    empOldAge: b.employee.oldAge,
    empUnemployment: b.employee.unemployment,
    erOldAge: b.employer.oldAge,
    erWorkInjury: b.employer.workInjury,
    erMaternity: b.employer.maternity,
    erUnemployment: b.employer.unemployment,
    erHighRisk: rs.sscHighRiskExtra ?? WORKBOOK_DEFAULTS.erHighRisk,
    ceiling: rs.sscCeiling || 0,
    maternityTreatment: 3,
  };
}

/** The workbook's sample rows 6–14. */
export const WORKBOOK_SAMPLES: Omit<SscCalcRow, 'id'>[] = [
  { name: 'موظف عادي (مثال)', gender: 'male', wage: 800, serviceDays: 30, unpaidDays: 0, maternityDays: 0, unemployment: true, highRisk: false, priorContributions: 24 },
  { name: 'موظفة عادية (مثال)', gender: 'female', wage: 650, serviceDays: 30, unpaidDays: 0, maternityDays: 0, unemployment: true, highRisk: false, priorContributions: 24 },
  { name: 'موظف التحق منتصف الشهر (مثال)', gender: 'male', wage: 500, serviceDays: 15, unpaidDays: 0, maternityDays: 0, unemployment: true, highRisk: false, priorContributions: 0 },
  { name: 'موظف إجازة بدون راتب 5 أيام (مثال)', gender: 'male', wage: 700, serviceDays: 30, unpaidDays: 5, maternityDays: 0, unemployment: true, highRisk: false, priorContributions: 36 },
  { name: 'موظفة إجازة أمومة شهر كامل (مثال)', gender: 'female', wage: 900, serviceDays: 30, unpaidDays: 0, maternityDays: 30, unemployment: true, highRisk: false, priorContributions: 36 },
  { name: 'موظفة ولادة منتصف الشهر (مثال)', gender: 'female', wage: 1000, serviceDays: 30, unpaidDays: 0, maternityDays: 12, unemployment: true, highRisk: false, priorContributions: 48 },
  { name: 'موظف غير مشمول بالبطالة (مثال)', gender: 'male', wage: 1200, serviceDays: 30, unpaidDays: 0, maternityDays: 0, unemployment: false, highRisk: false, priorContributions: 60 },
  { name: 'موظف مهنة خطرة (مثال)', gender: 'male', wage: 600, serviceDays: 30, unpaidDays: 0, maternityDays: 0, unemployment: true, highRisk: true, priorContributions: 12 },
  { name: 'موظفة أمومة لا تستوفي الشرط (مثال)', gender: 'female', wage: 750, serviceDays: 30, unpaidDays: 0, maternityDays: 30, unemployment: true, highRisk: false, priorContributions: 3 },
];

export const CHECK_MESSAGES = {
  maternityNotFemale: '⚠ إجازة أمومة لغير أنثى · maternity leave for a non-female',
  daysExceed: '⚠ الأيام تتجاوز أيام الخدمة · days exceed service days',
  maternityTooLong: '⚠ تتجاوز مدة الإجازة المسموحة · exceeds maternity entitlement',
  notEligible: '⚠ لا تستوفي شرط الاشتراكات · contributions condition not met',
  noWage: '⚠ الأجر غير مدخل · wage missing',
};

export function calcRow(row: SscCalcRow, s: SscCalcSettings): SscCalcResult {
  const basis = s.dayBasis > 0 ? s.dayBasis : 30;
  const paidDays = Math.max(0, row.serviceDays - row.unpaidDays - row.maternityDays); // K
  const wagePaid = (row.wage / basis) * paidDays; // L
  const wageMaternity = (row.wage / basis) * row.maternityDays; // M
  const cap = s.ceiling > 0 ? s.ceiling : Infinity;
  const base = Math.min(s.maternityTreatment === 2 ? wagePaid + wageMaternity : wagePaid, cap); // N
  // Treatment 3: employer's old-age + unemployment shares continue on maternity days (within the cap)
  const leaveBase = s.maternityTreatment === 3 ? Math.min(wageMaternity, Math.max(0, cap - base)) : 0;

  const empOldAge = base * s.empOldAge; // O
  const empUnemployment = row.unemployment ? base * s.empUnemployment : 0; // P
  const empTotal = empOldAge + empUnemployment; // Q
  const erOldAge = (base + leaveBase) * s.erOldAge; // R
  const erWorkInjury = base * s.erWorkInjury; // S
  const erMaternity = base * s.erMaternity; // T
  const erUnemployment = row.unemployment ? (base + leaveBase) * s.erUnemployment : 0; // U
  const erHighRisk = row.highRisk ? base * s.erHighRisk : 0; // V
  const erTotal = erOldAge + erWorkInjury + erMaternity + erUnemployment + erHighRisk; // W
  const totalDue = empTotal + erTotal; // X
  const maternityBenefit =
    row.gender === 'female' && row.maternityDays > 0 && row.priorContributions >= s.minContributions ? wageMaternity : 0; // Y
  const netPay = wagePaid + (s.maternityTreatment === 2 ? wageMaternity : 0) - empTotal; // Z

  let check = 'OK'; // AA
  if (row.maternityDays > 0 && row.gender !== 'female') check = CHECK_MESSAGES.maternityNotFemale;
  else if (row.unpaidDays + row.maternityDays > row.serviceDays) check = CHECK_MESSAGES.daysExceed;
  else if (row.maternityDays > s.maternityEntitlement) check = CHECK_MESSAGES.maternityTooLong;
  else if (row.maternityDays > 0 && row.priorContributions < s.minContributions) check = CHECK_MESSAGES.notEligible;
  else if (row.name.trim() && row.wage === 0) check = CHECK_MESSAGES.noWage;

  return {
    paidDays,
    wagePaid,
    wageMaternity,
    base,
    empOldAge,
    empUnemployment,
    empTotal,
    erOldAge,
    erWorkInjury,
    erMaternity,
    erUnemployment,
    erHighRisk,
    erTotal,
    totalDue,
    maternityBenefit,
    netPay,
    check,
  };
}

export type SscCalcTotals = Omit<SscCalcResult, 'check'> & { wage: number };

export function calcTotals(rows: SscCalcRow[], results: SscCalcResult[]): SscCalcTotals {
  const keys = Object.keys(results[0] || calcRow(blankRow(), WORKBOOK_DEFAULTS)).filter((k) => k !== 'check') as (keyof SscCalcTotals)[];
  const t: any = { wage: rows.reduce((s, r) => s + (r.wage || 0), 0) };
  for (const k of keys) t[k] = results.reduce((s, r: any) => s + (r[k] || 0), 0);
  return t;
}

export function blankRow(): SscCalcRow {
  return {
    id: `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    gender: 'male',
    wage: 0,
    serviceDays: 30,
    unpaidDays: 0,
    maternityDays: 0,
    unemployment: true,
    highRisk: false,
    priorContributions: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Excel: import the workbook layout, export back to it with live formulas
// ---------------------------------------------------------------------------------------------

const FIRST_ROW = 6;
const LAST_ROW = 35;

const yes = (v: any) => !/^(n|no|لا|0|false)$/i.test(String(v ?? 'Y').trim());
const isFemale = (v: any) => /^(أنثى|انثى|female|f)$/i.test(String(v ?? '').trim());
const num = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

export function importWorkbook(data: ArrayBuffer): { rows: SscCalcRow[]; settings: SscCalcSettings | null } {
  const wb = XLSX.read(data, { type: 'array' });
  const calc = wb.Sheets['Calculator'] || wb.Sheets[wb.SheetNames[0]];
  const cell = (ws: XLSX.WorkSheet, a: string) => ws?.[a]?.v;
  const rows: SscCalcRow[] = [];
  for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
    const name = String(cell(calc, `B${r}`) ?? '').trim();
    const wage = num(cell(calc, `D${r}`));
    if (!name && !wage) continue;
    rows.push({
      ...blankRow(),
      name,
      gender: isFemale(cell(calc, `C${r}`)) ? 'female' : 'male',
      wage,
      serviceDays: cell(calc, `E${r}`) === undefined ? 30 : num(cell(calc, `E${r}`)),
      unpaidDays: num(cell(calc, `F${r}`)),
      maternityDays: num(cell(calc, `G${r}`)),
      unemployment: yes(cell(calc, `H${r}`)),
      highRisk: String(cell(calc, `I${r}`) ?? '').trim().toUpperCase() === 'Y',
      priorContributions: num(cell(calc, `J${r}`)),
    });
  }
  const st = wb.Sheets['Settings'];
  let settings: SscCalcSettings | null = null;
  if (st) {
    const t = Math.round(num(cell(st, 'C14')));
    settings = {
      empOldAge: num(cell(st, 'C4')),
      empUnemployment: num(cell(st, 'C5')),
      erOldAge: num(cell(st, 'C6')),
      erWorkInjury: num(cell(st, 'C7')),
      erMaternity: num(cell(st, 'C8')),
      erUnemployment: num(cell(st, 'C9')),
      erHighRisk: num(cell(st, 'C10')),
      ceiling: num(cell(st, 'C11')),
      dayBasis: num(cell(st, 'C12')) || 30,
      maternityEntitlement: num(cell(st, 'C13')) || 70,
      maternityTreatment: t === 2 ? 2 : t === 3 ? 3 : 1,
      minContributions: num(cell(st, 'C15')),
    };
  }
  return { rows, settings };
}

/** Writes the same 4-sheet workbook, with formulas (and their current values) in every calculated cell. */
export function exportWorkbook(rows: SscCalcRow[], s: SscCalcSettings, title: string): Uint8Array {
  const S = (c: string) => `Settings!$C$${c}`;
  const calc: XLSX.WorkSheet = {};
  const put = (ws: XLSX.WorkSheet, a: string, v: any, f?: string, z?: string) => {
    ws[a] = typeof v === 'number' ? { t: 'n', v, ...(f ? { f } : {}), ...(z ? { z } : {}) } : { t: 's', v: String(v ?? ''), ...(f ? { f } : {}) };
  };
  put(calc, 'A1', `حاسبة الاشتراكات الشهرية في الضمان الاجتماعي (الأردن) | Monthly SSC Contributions Calculator (Jordan) — ${title}`);
  put(calc, 'A3', 'Enter data in columns B–J. Amounts in JOD. Exported from the Jordan Payroll System.');
  const headers = [
    '#', 'اسم الموظف\nEmployee name', 'الجنس\nGender', 'الأجر الشهري الخاضع\nMonthly insurable wage', 'أيام الخدمة في الشهر\nDays in service this month',
    'أيام إجازة بدون راتب\nUnpaid leave days', 'أيام إجازة الأمومة\nMaternity leave days (in month)', 'شمول البطالة؟ (Y/N)\nUnemployment ins.? (Y/N)',
    'مهنة خطرة؟ (Y/N)\nHigh-risk? (Y/N)', 'عدد الاشتراكات السابقة\nPrior contributions (months)', 'الأيام المدفوعة\nPaid days', 'أجر الأيام المدفوعة\nWage – paid days',
    'أجر أيام الأمومة\nWage – maternity days', 'الأجر الخاضع للاشتراك\nContribution base', 'الموظف: شيخوخة\nEmployee: old-age', 'الموظف: تعطل\nEmployee: unemployment',
    'إجمالي خصم الموظف\nTotal employee deduction', 'الشركة: شيخوخة\nEmployer: old-age', 'الشركة: إصابات عمل\nEmployer: work injury', 'الشركة: أمومة\nEmployer: maternity',
    'الشركة: تعطل\nEmployer: unemployment', 'الشركة: مهن خطرة\nEmployer: high-risk extra', 'إجمالي حصة الشركة\nTotal employer share', 'إجمالي المستحق للضمان\nTotal due to SSC',
    'بدل الأمومة من الضمان (تقديري)\nSSC maternity benefit (est.)', 'صافي الراتب بعد الضمان (قبل الضريبة)\nNet pay after SSC (pre-tax)', 'تحقق\nCheck',
  ];
  headers.forEach((h, i) => put(calc, XLSX.utils.encode_cell({ r: 4, c: i }), h));
  const money = '#,##0.000;\\-#,##0.000;\\-';
  const last = Math.max(LAST_ROW, FIRST_ROW + rows.length - 1);
  for (let r = FIRST_ROW; r <= last; r++) {
    const row = rows[r - FIRST_ROW];
    const res = calcRow(row || { ...blankRow(), serviceDays: 0 }, s);
    put(calc, `A${r}`, r - FIRST_ROW + 1);
    if (row) {
      put(calc, `B${r}`, row.name);
      put(calc, `C${r}`, row.gender === 'female' ? 'أنثى' : 'ذكر');
      put(calc, `D${r}`, row.wage);
      put(calc, `E${r}`, row.serviceDays);
      put(calc, `F${r}`, row.unpaidDays);
      put(calc, `G${r}`, row.maternityDays);
      put(calc, `H${r}`, row.unemployment ? 'Y' : 'N');
      put(calc, `I${r}`, row.highRisk ? 'Y' : 'N');
      put(calc, `J${r}`, row.priorContributions);
    }
    const leave = `IF(${S('14')}=3,MIN(M${r},MAX(0,IF(${S('11')}>0,${S('11')},1E+99)-N${r})),0)`;
    put(calc, `K${r}`, res.paidDays, `MAX(0,E${r}-F${r}-G${r})`);
    put(calc, `L${r}`, res.wagePaid, `D${r}/${S('12')}*K${r}`, money);
    put(calc, `M${r}`, res.wageMaternity, `D${r}/${S('12')}*G${r}`, money);
    put(calc, `N${r}`, res.base, `MIN(IF(${S('14')}=2,L${r}+M${r},L${r}),IF(${S('11')}>0,${S('11')},1E+99))`, money);
    put(calc, `O${r}`, res.empOldAge, `N${r}*${S('4')}`, money);
    put(calc, `P${r}`, res.empUnemployment, `IF(H${r}<>"N",N${r}*${S('5')},0)`, money);
    put(calc, `Q${r}`, res.empTotal, `O${r}+P${r}`, money);
    put(calc, `R${r}`, res.erOldAge, `(N${r}+${leave})*${S('6')}`, money);
    put(calc, `S${r}`, res.erWorkInjury, `N${r}*${S('7')}`, money);
    put(calc, `T${r}`, res.erMaternity, `N${r}*${S('8')}`, money);
    put(calc, `U${r}`, res.erUnemployment, `IF(H${r}<>"N",(N${r}+${leave})*${S('9')},0)`, money);
    put(calc, `V${r}`, res.erHighRisk, `IF(I${r}="Y",N${r}*${S('10')},0)`, money);
    put(calc, `W${r}`, res.erTotal, `SUM(R${r}:V${r})`, money);
    put(calc, `X${r}`, res.totalDue, `Q${r}+W${r}`, money);
    put(calc, `Y${r}`, res.maternityBenefit, `IF(AND(C${r}="أنثى",G${r}>0,J${r}>=${S('15')}),M${r},0)`, money);
    put(calc, `Z${r}`, res.netPay, `L${r}+IF(${S('14')}=2,M${r},0)-Q${r}`, money);
    put(
      calc,
      `AA${r}`,
      row ? res.check.split(' · ')[0] : 'OK',
      `IF(AND(G${r}>0,C${r}<>"أنثى"),"⚠ إجازة أمومة لغير أنثى",IF(F${r}+G${r}>E${r},"⚠ الأيام تتجاوز أيام الخدمة",IF(G${r}>${S('13')},"⚠ تتجاوز مدة الإجازة المسموحة",IF(AND(G${r}>0,J${r}<${S('15')}),"⚠ لا تستوفي شرط الاشتراكات",IF(AND(B${r}<>"",D${r}=0),"⚠ الأجر غير مدخل","OK")))))`
    );
  }
  const tr = last + 1;
  const totals = calcTotals(rows, rows.map((r) => calcRow(r, s)));
  put(calc, `B${tr}`, 'الإجمالي | Total');
  const totalCols: [string, number][] = [
    ['D', totals.wage], ['K', totals.paidDays], ['L', totals.wagePaid], ['M', totals.wageMaternity], ['N', totals.base],
    ['O', totals.empOldAge], ['P', totals.empUnemployment], ['Q', totals.empTotal], ['R', totals.erOldAge], ['S', totals.erWorkInjury],
    ['T', totals.erMaternity], ['U', totals.erUnemployment], ['V', totals.erHighRisk], ['W', totals.erTotal], ['X', totals.totalDue],
    ['Y', totals.maternityBenefit], ['Z', totals.netPay],
  ];
  for (const [c, v] of totalCols) put(calc, `${c}${tr}`, v, `SUM(${c}${FIRST_ROW}:${c}${last})`, money);
  calc['!ref'] = `A1:AA${tr}`;
  calc['!cols'] = [{ wch: 5 }, { wch: 30 }, { wch: 9 }, ...Array(24).fill({ wch: 14 })];

  const st: XLSX.WorkSheet = {};
  const settingRows: [string, string, string, number, string][] = [
    ['4', 'حصة الموظف – الشيخوخة والعجز والوفاة', 'Employee – Old-age, disability & death', s.empOldAge, ''],
    ['5', 'حصة الموظف – التعطل عن العمل', 'Employee – Unemployment', s.empUnemployment, ''],
    ['6', 'حصة الشركة – الشيخوخة والعجز والوفاة', 'Employer – Old-age, disability & death', s.erOldAge, ''],
    ['7', 'حصة الشركة – إصابات العمل', 'Employer – Work injury', s.erWorkInjury, ''],
    ['8', 'حصة الشركة – الأمومة', 'Employer – Maternity insurance', s.erMaternity, ''],
    ['9', 'حصة الشركة – التعطل عن العمل', 'Employer – Unemployment', s.erUnemployment, ''],
    ['10', 'نسبة إضافية للمهن الخطرة (الشركة)', 'Extra employer rate – high-risk occupations', s.erHighRisk, ''],
    ['11', 'سقف الأجر الخاضع (0 = بدون سقف)', 'Max insurable wage (0 = no cap), JOD', s.ceiling, ''],
    ['12', 'عدد أيام أساس الشهر', 'Month day-basis (days)', s.dayBasis, ''],
    ['13', 'مدة إجازة الأمومة المسموحة (يوم)', 'Maternity leave entitlement (days)', s.maternityEntitlement, ''],
    ['14', 'معالجة الاشتراكات أثناء إجازة الأمومة (1/2/3)', 'Maternity-day contribution treatment (1, 2 or 3)', s.maternityTreatment, '1 = none on leave days · 2 = full wage · 3 = employer old-age + unemployment continue (SSC rule)'],
    ['15', 'الحد الأدنى لعدد الاشتراكات لاستحقاق بدل الأمومة', 'Min prior contributions for maternity benefit', s.minContributions, ''],
  ];
  put(st, 'A1', 'الإعدادات ونسب الضمان الاجتماعي | Settings & SSC Rates');
  put(st, 'A3', 'البند');
  put(st, 'B3', 'Item');
  put(st, 'C3', 'القيمة / Value');
  put(st, 'D3', 'ملاحظة / Note');
  for (const [r, ar, en, v, note] of settingRows) {
    put(st, `A${r}`, ar);
    put(st, `B${r}`, en);
    put(st, `C${r}`, v, undefined, Number(r) <= 10 ? '0.00%' : undefined);
    if (note) put(st, `D${r}`, note);
  }
  put(st, 'A17', 'إجمالي نسبة الشركة (قياسي)');
  put(st, 'B17', 'Employer total (standard)');
  put(st, 'C17', s.erOldAge + s.erWorkInjury + s.erMaternity + s.erUnemployment, 'SUM(C6:C9)', '0.00%');
  put(st, 'A18', 'إجمالي نسبة الموظف');
  put(st, 'B18', 'Employee total');
  put(st, 'C18', s.empOldAge + s.empUnemployment, 'C4+C5', '0.00%');
  st['!ref'] = 'A1:D18';
  st['!cols'] = [{ wch: 44 }, { wch: 44 }, { wch: 14 }, { wch: 60 }];

  const sm: XLSX.WorkSheet = {};
  put(sm, 'A1', 'ملخص الشهر | Monthly Summary');
  const results = rows.map((r) => calcRow(r, s));
  const summary: [string, string, number, string][] = [
    ['عدد الموظفين المدخلين', 'Employees entered', rows.filter((r) => r.name.trim()).length, `COUNTA(Calculator!B${FIRST_ROW}:B${last})`],
    ['إجمالي الأجور الخاضعة للاشتراك', 'Total contribution base', totals.base, `Calculator!N${tr}`],
    ['إجمالي خصم الموظفين', 'Total employee deductions', totals.empTotal, `Calculator!Q${tr}`],
    ['إجمالي حصة الشركة', 'Total employer share', totals.erTotal, `Calculator!W${tr}`],
    ['إجمالي المستحق للضمان (يُسدد للمؤسسة)', 'Total payable to SSC', totals.totalDue, `Calculator!X${tr}`],
    ['بدل الأمومة المتوقع من الضمان', 'Expected SSC maternity benefits', totals.maternityBenefit, `Calculator!Y${tr}`],
    ['عدد حالات الأمومة في الشهر', 'Maternity cases this month', rows.filter((r) => r.maternityDays > 0).length, `COUNTIF(Calculator!G${FIRST_ROW}:G${last},">0")`],
    ['عدد التنبيهات في عمود التحقق', 'Rows with warnings', results.filter((r) => r.check !== 'OK').length, `COUNTIF(Calculator!AA${FIRST_ROW}:AA${last},"⚠*")`],
  ];
  summary.forEach(([ar, en, v, f], i) => {
    put(sm, `A${i + 3}`, ar);
    put(sm, `B${i + 3}`, en);
    put(sm, `C${i + 3}`, v, f, i >= 1 && i <= 5 ? money : undefined);
  });
  sm['!ref'] = 'A1:C10';
  sm['!cols'] = [{ wch: 40 }, { wch: 34 }, { wch: 16 }];

  const notes = XLSX.utils.aoa_to_sheet(NOTES.map((n) => [n]));
  notes['!cols'] = [{ wch: 140 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, calc, 'Calculator');
  XLSX.utils.book_append_sheet(wb, st, 'Settings');
  XLSX.utils.book_append_sheet(wb, sm, 'Summary');
  XLSX.utils.book_append_sheet(wb, notes, 'Notes');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export const NOTES = [
  'الافتراضات والملاحظات | Assumptions & Notes',
  '',
  '1) Daily wage = monthly wage ÷ day basis (30). Contributions are on the wage for days actually paid (joining/leaving mid-month, unpaid leave).',
  '2) Maternity leave: the allowance (100% of the wage) is paid by SSC, not the company, funded by the employer maternity contribution (0.75%). Current entitlement 70 days.',
  '3) Maternity-day treatment: 1 = no contributions on leave days; 2 = contributions on the full wage; 3 = employer keeps paying its old-age + unemployment share on leave days and SSC deducts the employee share from the allowance (the rule used by this system\'s payroll).',
  '4) Employee split: SSC publishes old age 6.5% + unemployment 1% (total 7.5%); the original workbook used 7% + 0.5%. Both give 7.5% total. Verify with SSC.',
  '5) Assumptions to verify: minimum contributions for the maternity allowance (6 in the last 12 months), the wage ceiling, and the high-risk extra rate.',
  '6) This calculator does not compute income tax or end-of-service. Net pay = wage for paid days (+ maternity days under treatment 2) − employee SSC.',
];
