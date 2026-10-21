/**
 * Easy-to-fill Excel sheets for Employees and Salaries:
 *  - every company allowance / deduction type has its own column ("Allowance: Fuel Allowance"),
 *    so tax / SSC treatment comes from Company Settings — nothing to type in brackets;
 *  - "Other allowance / deduction" name + amount columns for anything that is not a company type;
 *  - dropdown lists (employee IDs, month, payment method, status, gender, SSC coverage, Yes/No…)
 *    and number-only amount cells.
 *
 * Written with ExcelJS (loaded only when a sheet is downloaded) because SheetJS cannot write
 * dropdown lists. Reading still uses SheetJS (see excel.ts), which also accepts the older
 * single-cell "Additional Allowances" format.
 */
import { Company, Employee, SalaryRecord } from '../types';
import { YEAR_OPTIONS } from './calculator';

export const ALLOWANCE_PREFIX = 'Allowance: ';
export const DEDUCTION_PREFIX = 'Deduction: ';
export const otherCol = (kind: 'Allowance' | 'Deduction', n: number, part: 'Name' | 'Amount') => `Other ${kind} ${n} – ${part}`;

interface Col {
  header: string;
  width?: number;
  /** Dropdown values */
  list?: string[];
  /** Allow values not in the list (custom names) */
  allowOther?: boolean;
  /** Number-only cell (>= 0) */
  numeric?: boolean;
  /** Header colour */
  tone?: 'allow' | 'ded' | 'calc' | 'key';
  note?: string;
}

interface SheetSpec {
  name: string;
  columns: Col[];
  rows: Record<string, any>[];
  /** Number of empty rows that still get the dropdowns */
  extraRows?: number;
}

const TONES = { allow: 'FFE2F0D9', ded: 'FFFBE2D5', calc: 'FFDDEBF7', key: 'FFFFF2CC' };

async function buildWorkbook(sheets: SheetSpec[], instructions: string[]): Promise<Uint8Array> {
  const ExcelJS: any = (await import('exceljs')).default ?? (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jordan Payroll System';

  // Lists live on a hidden sheet so long lists (employee IDs, type names) work in every Excel version
  const lists = wb.addWorksheet('Lists', { state: 'veryHidden' });
  let listCol = 1;
  const listRef = (values: string[]) => {
    const col = lists.getColumn(listCol);
    values.forEach((v, i) => (lists.getCell(i + 1, listCol).value = v));
    const letter = col.letter;
    listCol++;
    return `Lists!$${letter}$1:$${letter}$${Math.max(values.length, 1)}`;
  };

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.header, width: c.width ?? Math.max(12, Math.min(34, c.header.length + 2)) }));
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { wrapText: true, vertical: 'middle' };
    header.height = 32;
    spec.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      if (c.tone) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TONES[c.tone] } };
      if (c.note) cell.note = c.note;
    });
    for (const r of spec.rows) ws.addRow(spec.columns.map((c) => r[c.header] ?? null));

    const lastRow = spec.rows.length + 1 + (spec.extraRows ?? 200);
    spec.columns.forEach((c, i) => {
      const letter = ws.getColumn(i + 1).letter;
      const range = `${letter}2:${letter}${lastRow}`;
      if (c.list && c.list.length) {
        const ref = listRef(c.list);
        ws.dataValidations.add(range, {
          type: 'list',
          allowBlank: true,
          formulae: [ref],
          showErrorMessage: !c.allowOther,
          errorStyle: c.allowOther ? 'information' : 'stop',
          errorTitle: c.header,
          error: c.allowOther ? 'Not in the list — it will be added as a custom item.' : 'Choose a value from the list.',
        });
      } else if (c.numeric) {
        ws.dataValidations.add(range, {
          type: 'decimal',
          operator: 'greaterThanOrEqual',
          allowBlank: true,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: c.header,
          error: 'Enter a number (0 or more).',
        });
        ws.getColumn(i + 1).numFmt = '#,##0.00';
      }
    });
  }

  const info = wb.addWorksheet('Instructions');
  info.getColumn(1).width = 120;
  instructions.forEach((line, i) => {
    const cell = info.getCell(i + 1, 1);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 13 };
  });
  // Show the data sheet first
  wb.views = [{ activeTab: 1 }];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const YES_NO = ['Yes', 'No'];
const yesNo = (v: boolean | undefined) => (v ? 'Yes' : 'No');

/** Highest number of custom (non company-type) items any row needs, at least 1. */
function otherSlots(itemLists: { name: string }[][], typeNames: Set<string>): number {
  return Math.max(1, ...itemLists.map((l) => l.filter((x) => !typeNames.has(x.name.toLowerCase())).length));
}

// ---------------------------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------------------------

export async function employeesWorkbook(company: Company, employees: Employee[], mode: 'template' | 'export'): Promise<Uint8Array> {
  const aTypes = company.allowanceTypes || [];
  const dTypes = company.deductionTypes || [];
  const aNames = new Set(aTypes.map((t) => t.name.toLowerCase()));
  const dNames = new Set(dTypes.map((t) => t.name.toLowerCase()));
  const sample: Employee[] =
    mode === 'template' && employees.length === 0
      ? [
          {
            id: '', companyId: company.id, empId: 'EMP001', name: 'Ahmad Mansour', nameAr: 'أحمد منصور', title: 'Accountant',
            department: 'Finance', status: 'active', hireDate: '2024-01-15', nationalId: '9901020304', idType: '1', gender: 'male',
            package: { basic: 900, housing: 200, transport: 100, other_allow: 0 }, documents: [],
            allowances: aTypes.slice(0, 1).map((t) => ({ ...t })), deductions: dTypes.slice(0, 1).map((t) => ({ ...t })),
          } as Employee,
        ]
      : employees;
  const aSlots = otherSlots(sample.map((e) => e.allowances || []), aNames);
  const dSlots = otherSlots(sample.map((e) => e.deductions || []), dNames);

  const columns: Col[] = [
    { header: 'Employee ID', tone: 'key', width: 12 },
    { header: 'Full Name (EN)', tone: 'key', width: 24 },
    { header: 'Full Name (AR)', width: 24 },
    { header: 'Job Title', width: 20 },
    { header: 'Department', width: 16 },
    { header: 'Status', list: ['Active', 'Resigned'] },
    { header: 'Hire Date', note: 'YYYY-MM-DD' },
    { header: 'End Date', note: 'YYYY-MM-DD' },
    { header: 'Gender', list: ['Male', 'Female'] },
    { header: 'Date of Birth', note: 'YYYY-MM-DD' },
    { header: 'Nationality', list: ['Jordanian', 'Non-Jordanian'] },
    { header: 'National ID / Passport', width: 16 },
    { header: 'ID Type', list: ['1 - National ID', '2 - Passport'] },
    { header: 'Tax Number' },
    { header: 'SSC Number' },
    { header: 'SSC Insured Wage', numeric: true, note: 'Leave empty to use the salary items' },
    { header: 'SSC Coverage', list: ['Full', 'Work injury only', 'Exempt'] },
    { header: 'High-risk Occupation', list: YES_NO, note: 'Employer pays an extra 1%' },
    { header: 'Insured Before May 2010', list: YES_NO },
    { header: 'Youth Reduction', list: ['None', 'Small', 'Medium'] },
    { header: 'Claims Family Exemption', list: YES_NO },
    { header: 'Extra Expenses Exemption', numeric: true },
    { header: 'Basic Salary', numeric: true, tone: 'allow' },
    { header: 'Housing Allowance', numeric: true, tone: 'allow' },
    { header: 'Transport Allowance', numeric: true, tone: 'allow' },
    { header: 'Other Allowances', numeric: true, tone: 'allow' },
    ...aTypes.map<Col>((t) => ({
      header: ALLOWANCE_PREFIX + t.name,
      tone: 'allow',
      note: `${t.method === 'percent' ? `Default ${t.value}% of basic — type e.g. 10%` : `Default ${t.value}`} · ${t.taxable ? 'taxable' : 'tax-free'} · ${t.ssc ? 'SSC' : 'no SSC'}. Empty = not given.`,
    })),
    ...Array.from({ length: aSlots }, (_, i) => [
      { header: otherCol('Allowance', i + 1, 'Name'), list: aTypes.map((t) => t.name), allowOther: true, tone: 'allow' as const },
      { header: otherCol('Allowance', i + 1, 'Amount'), numeric: true, tone: 'allow' as const },
    ]).flat(),
    ...dTypes.map<Col>((t) => ({
      header: DEDUCTION_PREFIX + t.name,
      tone: 'ded',
      note: `${t.method === 'percent' ? `Default ${t.value}% of basic — type e.g. 5%` : `Default ${t.value}`} · ${t.preTax ? 'before tax' : 'after tax'}. Empty = not deducted.`,
    })),
    ...Array.from({ length: dSlots }, (_, i) => [
      { header: otherCol('Deduction', i + 1, 'Name'), list: dTypes.map((t) => t.name), allowOther: true, tone: 'ded' as const },
      { header: otherCol('Deduction', i + 1, 'Amount'), numeric: true, tone: 'ded' as const },
    ]).flat(),
    { header: 'Email', width: 24 },
    { header: 'Phone' },
    { header: 'Address', width: 24 },
  ];

  const rows = sample.map((e) => {
    const r: Record<string, any> = {
      'Employee ID': e.empId,
      'Full Name (EN)': e.name,
      'Full Name (AR)': e.nameAr || '',
      'Job Title': e.title || '',
      Department: e.department || '',
      Status: e.status === 'resigned' ? 'Resigned' : 'Active',
      'Hire Date': e.hireDate || '',
      'End Date': e.endDate || '',
      Gender: e.gender === 'female' ? 'Female' : e.gender === 'male' ? 'Male' : '',
      'Date of Birth': e.birthDate || '',
      Nationality: e.nationality === 'non_jordanian' ? 'Non-Jordanian' : 'Jordanian',
      'National ID / Passport': e.nationalId || '',
      'ID Type': e.idType === '2' ? '2 - Passport' : '1 - National ID',
      'Tax Number': e.taxNumber || '',
      'SSC Number': e.sscNumber || '',
      'SSC Insured Wage': e.sscWage || null,
      'SSC Coverage': e.sscExempt || e.sscCoverage === 'exempt' ? 'Exempt' : e.sscCoverage === 'injury_only' ? 'Work injury only' : 'Full',
      'High-risk Occupation': yesNo(e.sscHighRisk),
      'Insured Before May 2010': yesNo(e.sscInsuredBefore2010),
      'Youth Reduction': e.sscYouthReduction === 'small' ? 'Small' : e.sscYouthReduction === 'medium' ? 'Medium' : 'None',
      'Claims Family Exemption': yesNo(e.claimsFamily),
      'Extra Expenses Exemption': e.extraExemption || 0,
      'Basic Salary': e.package?.basic || 0,
      'Housing Allowance': e.package?.housing || 0,
      'Transport Allowance': e.package?.transport || 0,
      'Other Allowances': e.package?.other_allow || 0,
      Email: e.email || '',
      Phone: e.phone || '',
      Address: e.address || '',
    };
    const value = (x: { method: string; value: number }) => (x.method === 'percent' ? `${x.value}%` : x.value);
    let ai = 0;
    for (const a of e.allowances || []) {
      if (aNames.has(a.name.toLowerCase())) r[ALLOWANCE_PREFIX + aTypes.find((t) => t.name.toLowerCase() === a.name.toLowerCase())!.name] = value(a);
      else {
        ai++;
        r[otherCol('Allowance', ai, 'Name')] = a.name;
        r[otherCol('Allowance', ai, 'Amount')] = a.method === 'percent' ? null : a.value;
      }
    }
    let di = 0;
    for (const d of e.deductions || []) {
      if (dNames.has(d.name.toLowerCase())) r[DEDUCTION_PREFIX + dTypes.find((t) => t.name.toLowerCase() === d.name.toLowerCase())!.name] = value(d);
      else {
        di++;
        r[otherCol('Deduction', di, 'Name')] = d.name;
        r[otherCol('Deduction', di, 'Amount')] = d.method === 'percent' ? null : d.value;
      }
    }
    return r;
  });

  return buildWorkbook(
    [{ name: 'Employees', columns, rows }],
    [
      `Employees — ${company.name}`,
      'Yellow columns are required: Employee ID and Full Name (EN). Rows are matched by Employee ID (existing employees are updated).',
      'Green columns are earnings, orange columns are deductions. Each company allowance / deduction type has its own column:',
      '   • type an amount (e.g. 60) or a percentage of basic (e.g. 10%) — leave it empty if the employee does not get it;',
      '   • tax and Social Security treatment come from Company Settings → Allowance & Deduction Types.',
      'For anything else use "Other Allowance / Deduction – Name" (pick from the list or type a new name) and its Amount.',
      'Cells with a small arrow have a dropdown list. Dates: YYYY-MM-DD.',
    ]
  );
}

// ---------------------------------------------------------------------------------------------
// Salaries
// ---------------------------------------------------------------------------------------------

export async function salaryWorkbook(
  company: Company,
  employees: Employee[],
  records: SalaryRecord[] | null,
  year: number,
  month: number
): Promise<Uint8Array> {
  const aTypes = company.allowanceTypes || [];
  const dTypes = company.deductionTypes || [];
  const aNames = new Set(aTypes.map((t) => t.name.toLowerCase()));
  const dNames = new Set(dTypes.map((t) => t.name.toLowerCase()));
  const isExport = records !== null;
  const typeOf = <T extends { name: string }>(types: T[], name: string) => types.find((t) => t.name.toLowerCase() === name.toLowerCase());

  // Rows: saved records (export) or each active employee's usual package (template)
  type Row = {
    year: number; month: number; empId: string; name: string; amounts: Record<string, number>;
    earnings: { name: string; amount: number }[]; deductions: { name: string; amount: number }[];
    payMethod: string; notes: string; rec?: SalaryRecord;
  };
  const rows: Row[] = isExport
    ? records!.map((r) => ({
        year: r.year, month: r.month, empId: r.empId, name: r.name, amounts: r.amounts as any,
        earnings: r.earnings || [], deductions: r.deductions || [], payMethod: r.payMethod || 'Bank transfer', notes: r.notes || '', rec: r,
      }))
    : employees
        .filter((e) => e.status !== 'resigned')
        .map((e) => {
          const basic = e.package?.basic || 0;
          const amt = (x: { method: string; value: number }) => (x.method === 'percent' ? Math.round(basic * x.value) / 100 : x.value);
          return {
            year, month, empId: e.empId, name: e.name,
            amounts: { basic, housing: e.package?.housing || 0, transport: e.package?.transport || 0, other_allow: e.package?.other_allow || 0 },
            earnings: (e.allowances || []).map((a) => ({ name: a.name, amount: amt(a) })),
            deductions: (e.deductions || []).map((d) => ({ name: d.name, amount: amt(d) })),
            payMethod: 'Bank transfer', notes: '',
          };
        });
  const aSlots = otherSlots(rows.map((r) => r.earnings), aNames);
  const dSlots = otherSlots(rows.map((r) => r.deductions), dNames);

  const columns: Col[] = [
    { header: 'Year', list: YEAR_OPTIONS.map(String), width: 8 },
    { header: 'Month', list: Array.from({ length: 12 }, (_, i) => String(i + 1)), width: 8 },
    { header: 'Employee ID', tone: 'key', list: employees.map((e) => e.empId), width: 12 },
    { header: 'Full Name', tone: 'key', width: 24, note: 'For reference — the Employee ID is what is matched' },
    { header: 'Basic Salary', numeric: true, tone: 'allow' },
    { header: 'Housing Allowance', numeric: true, tone: 'allow' },
    { header: 'Transport Allowance', numeric: true, tone: 'allow' },
    { header: 'Other Allowances', numeric: true, tone: 'allow' },
    { header: 'Overtime', numeric: true, tone: 'allow' },
    { header: 'Bonus', numeric: true, tone: 'allow', note: 'One-off pay — taxed in this month only' },
    { header: 'Other Earnings', numeric: true, tone: 'allow' },
    ...aTypes.map<Col>((t) => ({
      header: ALLOWANCE_PREFIX + t.name,
      numeric: true,
      tone: 'allow',
      note: `${t.taxable ? 'Taxable' : 'Tax-free'} · ${t.ssc ? 'subject to SSC' : 'no SSC'} (from Company Settings). Empty = not paid this month.`,
    })),
    ...Array.from({ length: aSlots }, (_, i) => [
      { header: otherCol('Allowance', i + 1, 'Name'), list: aTypes.map((t) => t.name), allowOther: true, tone: 'allow' as const },
      { header: otherCol('Allowance', i + 1, 'Amount'), numeric: true, tone: 'allow' as const },
    ]).flat(),
    { header: 'Advance Salary', numeric: true, tone: 'ded' },
    { header: 'Unpaid Leave', numeric: true, tone: 'ded', note: 'Amount in JOD' },
    { header: 'Other Deductions', numeric: true, tone: 'ded' },
    ...dTypes.map<Col>((t) => ({
      header: DEDUCTION_PREFIX + t.name,
      numeric: true,
      tone: 'ded',
      note: `${t.preTax ? 'Deducted before tax' : 'Deducted after tax'} (from Company Settings). Empty = not deducted.`,
    })),
    ...Array.from({ length: dSlots }, (_, i) => [
      { header: otherCol('Deduction', i + 1, 'Name'), list: dTypes.map((t) => t.name), allowOther: true, tone: 'ded' as const },
      { header: otherCol('Deduction', i + 1, 'Amount'), numeric: true, tone: 'ded' as const },
    ]).flat(),
    { header: 'Payment Method', list: ['Bank transfer', 'Cash', 'Cheque'] },
    { header: 'Notes', width: 28 },
    ...(isExport
      ? (['Gross Salary', 'Social Security (Employee)', 'Income Tax', 'Total Deductions', 'Net Salary'].map((h) => ({
          header: `${h} (calculated)`,
          tone: 'calc' as const,
          note: 'Recalculated on import — editing it has no effect',
        })) as Col[])
      : []),
  ];

  const sheetRows = rows.map((r) => {
    const out: Record<string, any> = {
      Year: String(r.year),
      Month: String(r.month),
      'Employee ID': r.empId,
      'Full Name': r.name,
      'Basic Salary': r.amounts.basic || 0,
      'Housing Allowance': r.amounts.housing || 0,
      'Transport Allowance': r.amounts.transport || 0,
      'Other Allowances': r.amounts.other_allow || 0,
      Overtime: r.amounts.overtime || null,
      Bonus: r.amounts.bonus || null,
      'Other Earnings': r.amounts.other_earn || null,
      'Advance Salary': r.amounts.advance || null,
      'Unpaid Leave': r.amounts.unpaid_leave || null,
      'Other Deductions': r.amounts.other_ded || null,
      'Payment Method': r.payMethod,
      Notes: r.notes,
    };
    let ai = 0;
    for (const e of r.earnings) {
      const t = typeOf(aTypes, e.name);
      if (t) out[ALLOWANCE_PREFIX + t.name] = (out[ALLOWANCE_PREFIX + t.name] || 0) + e.amount;
      else {
        ai++;
        out[otherCol('Allowance', ai, 'Name')] = e.name;
        out[otherCol('Allowance', ai, 'Amount')] = e.amount;
      }
    }
    let di = 0;
    for (const d of r.deductions) {
      const t = typeOf(dTypes, d.name);
      if (t) out[DEDUCTION_PREFIX + t.name] = (out[DEDUCTION_PREFIX + t.name] || 0) + d.amount;
      else {
        di++;
        out[otherCol('Deduction', di, 'Name')] = d.name;
        out[otherCol('Deduction', di, 'Amount')] = d.amount;
      }
    }
    if (r.rec) {
      out['Gross Salary (calculated)'] = r.rec.gross;
      out['Social Security (Employee) (calculated)'] = r.rec.amounts.social_sec || 0;
      out['Income Tax (calculated)'] = r.rec.amounts.income_tax || 0;
      out['Total Deductions (calculated)'] = r.rec.totalDed;
      out['Net Salary (calculated)'] = r.rec.net;
    }
    return out;
  });

  return buildWorkbook(
    [{ name: isExport ? 'Salaries' : `Salaries ${month}-${year}`, columns, rows: sheetRows }],
    [
      `Salaries — ${company.name}${isExport ? '' : ` — ${month}/${year}`}`,
      'One row per employee and month. Pick the Employee ID from the list; Year and Month have lists too.',
      'Green columns are earnings, orange columns are deductions. Each company allowance / deduction type has its own column —',
      '   type the amount for this month, or leave it empty if it is not paid / not deducted.',
      '   Tax and Social Security treatment come from Company Settings → Allowance & Deduction Types (no need to type it).',
      'For anything else use "Other Allowance / Deduction – Name" (pick from the list or type a new name) and its Amount.',
      'Social Security and income tax are recalculated when you import. Loan installments are added by Payroll Run.',
      'A row replaces any saved salary for the same employee and month.',
    ]
  );
}
