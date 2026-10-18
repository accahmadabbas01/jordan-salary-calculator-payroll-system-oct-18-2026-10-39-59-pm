import * as XLSX from 'xlsx';
import {
  Company,
  Employee,
  SalaryRecord,
  SalaryAmounts,
  Loan,
  MonthlyInput,
  AllowanceType,
  DeductionType,
  Clearance,
  ActivityLog,
  User,
  PayrollRuleSet,
  SalaryEarningItem,
  SalaryDeductionItem,
} from '../types';
import { formatFils, roundHalfUp, getMonthName, calculatePayroll } from './calculator';

/** Lower-cases and trims every header so lookups are case-insensitive. */
function normalizeRow(raw: Record<string, any>): Record<string, any> {
  const res: Record<string, any> = {};
  for (const k of Object.keys(raw)) res[k.trim().toLowerCase()] = raw[k];
  return res;
}

/**
 * Returns the first non-empty cell whose header equals, or starts with, one of the given names.
 * Lets "SSC Exempt" match "SSC Exempt (1=Yes, 0=No)".
 */
function pick(row: Record<string, any>, ...names: string[]): any {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => key.startsWith(n));
    if (k !== undefined) {
      const v = row[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return undefined;
}

/** Parses a number cell; empty cells give the fallback, but an explicit 0 stays 0. */
function num(v: any, fallback = 0): number {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function flag(v: any): boolean {
  if (v === undefined || v === null) return false;
  const t = String(v).trim().toLowerCase();
  return t === '1' || t === 'yes' || t === 'y' || t === 'true' || t === 'نعم';
}

/** Accepts Excel date serials, Date objects and text, returns YYYY-MM-DD. */
function toDateStr(v: any): string {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return String(v).trim().substring(0, 10);
}

function str(v: any): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

/**
 * Format recurring/additional allowances into string:
 * Name: amount/percent [flags]
 * e.g. Mobile Allowance: 25.00 [no SSC]; Shift Allowance: 10%
 */
export function serializeAllowances(
  items: { name: string; value?: number; amount?: number; method?: string; taxable?: boolean; ssc?: boolean }[]
): string {
  if (!items || items.length === 0) return '';
  return items
    .map((it) => {
      const val = it.method === 'percent' ? `${it.value}%` : (it.amount ?? it.value ?? 0).toFixed(2);
      const flags: string[] = [];
      if (it.taxable === false) flags.push('[tax-free]');
      if (it.ssc === false) flags.push('[no SSC]');
      const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
      return `${it.name}: ${val}${flagStr}`;
    })
    .join('; ');
}

export function parseAllowances(
  str: string,
  companyTypes: AllowanceType[] = []
): { name: string; method: 'fixed' | 'percent'; value: number; taxable: boolean; ssc: boolean }[] {
  if (!str || !str.trim()) return [];
  const parts = str.split(';').map((s) => s.trim()).filter(Boolean);
  return parts.map((part) => {
    // regex: Name: value [flags]
    const match = part.match(/^([^:]+):\s*([0-9.]+)(%?)(.*)$/);
    if (!match) {
      return {
        name: part,
        method: 'fixed',
        value: 0,
        taxable: true,
        ssc: true,
      };
    }
    const name = match[1].trim();
    const num = parseFloat(match[2]) || 0;
    const isPercent = match[3] === '%';
    const flagPart = match[4] || '';

    // match company default
    const compType = companyTypes.find((t) => t.name.toLowerCase() === name.toLowerCase());

    const isTaxFree = flagPart.toLowerCase().includes('[tax-free]');
    const isNoSSC = flagPart.toLowerCase().includes('[no ssc]');

    const taxable = isTaxFree ? false : compType ? compType.taxable : true;
    const ssc = isNoSSC ? false : compType ? compType.ssc : true;

    return {
      name,
      method: isPercent ? 'percent' : 'fixed',
      value: num,
      taxable,
      ssc,
    };
  });
}

export function serializeDeductions(
  items: { name: string; value?: number; amount?: number; method?: string; preTax?: boolean; loanId?: string }[]
): string {
  if (!items || items.length === 0) return '';
  return items
    .map((it) => {
      const val = it.method === 'percent' ? `${it.value}%` : (it.amount ?? it.value ?? 0).toFixed(2);
      const flags: string[] = [];
      if (it.preTax) flags.push('[before tax]');
      if (it.loanId) flags.push('[loan]');
      const flagStr = flags.length > 0 ? ` ${flags.join(' ')}` : '';
      return `${it.name}: ${val}${flagStr}`;
    })
    .join('; ');
}

export function parseDeductions(
  str: string,
  companyTypes: DeductionType[] = []
): { name: string; method: 'fixed' | 'percent'; value: number; preTax: boolean; isLoan?: boolean }[] {
  if (!str || !str.trim()) return [];
  const parts = str.split(';').map((s) => s.trim()).filter(Boolean);
  return parts.map((part) => {
    const match = part.match(/^([^:]+):\s*([0-9.]+)(%?)(.*)$/);
    if (!match) {
      return {
        name: part,
        method: 'fixed',
        value: 0,
        preTax: false,
      };
    }
    const name = match[1].trim();
    const num = parseFloat(match[2]) || 0;
    const isPercent = match[3] === '%';
    const flagPart = match[4] || '';

    const compType = companyTypes.find((t) => t.name.toLowerCase() === name.toLowerCase());
    const isPreTax = flagPart.toLowerCase().includes('[before tax]');
    const isLoan = flagPart.toLowerCase().includes('[loan]');

    const preTax = isPreTax ? true : compType ? compType.preTax : false;

    return {
      name,
      method: isPercent ? 'percent' : 'fixed',
      value: num,
      preTax,
      isLoan,
    };
  });
}

/**
 * Generate Full Backup Excel Workbook
 */
export function generateBackupWorkbook(
  companies: Company[],
  employees: Employee[],
  records: SalaryRecord[],
  loans: Loan[]
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. Read Me
  const readMeData = [
    ['Salary Calculator — Backup Workbook'],
    ['Created:', new Date().toISOString()],
    ['Instructions:'],
    ['- This workbook contains data for all companies, employees, salary records, item types, and loans.'],
    ['- You can edit this workbook and re-import it into the Salary Calculator app.'],
    ['- When importing, column order does not matter; headers are matched case-insensitively.'],
  ];
  const wsReadMe = XLSX.utils.aoa_to_sheet(readMeData);
  XLSX.utils.book_append_sheet(wb, wsReadMe, 'Read me');

  // 2. Companies
  const compRows = companies.map((c) => ({
    Company: c.name,
    Address: c.address || '',
    Currency: c.currency || 'JOD',
    'Tax Number': c.taxNumber || '',
  }));
  const wsCompanies = XLSX.utils.json_to_sheet(compRows);
  XLSX.utils.book_append_sheet(wb, wsCompanies, 'Companies');

  // 3. Employees
  const compMap = new Map(companies.map((c) => [c.id, c.name]));
  const empRows = employees.map((e) => ({
    Company: compMap.get(e.companyId) || '',
    'Employee ID': e.empId,
    'Full Name': e.name,
    'Full Name (Arabic)': e.nameAr || '',
    'Job Title': e.title || '',
    Department: e.department || '',
    'Dependants exemption (1=yes)': e.claimsFamily ? 1 : 0,
    'Documented expenses exemption': e.extraExemption || 0,
    'Package: Basic salary': e.package?.basic || 0,
    'Package: Housing allowance': e.package?.housing || 0,
    'Package: Transportation allowance': e.package?.transport || 0,
    'Package: Other allowances': e.package?.other_allow || 0,
    'Recurring Allowances (package)': serializeAllowances(e.allowances || []),
    'Recurring Deductions (package)': serializeDeductions(e.deductions || []),
    'National ID / Passport No.': e.nationalId || '',
    'ID Type (1=National ID, 2=Passport)': e.idType || '1',
    'Employee Tax Number': e.taxNumber || '',
    Address: e.address || '',
    Phone: e.phone || '',
    Email: e.email || '',
    'P.O. Box': e.poBox || '',
    'Postal Code': e.postalCode || '',
    'Status (Active / Resigned)': e.status === 'resigned' ? 'Resigned' : 'Active',
    'Work Start Date': e.hireDate || '',
    'Last Working Date': e.endDate || '',
    'Social Security Number': e.sscNumber || '',
    'Insured Wage (Social Security)': e.sscWage || '',
    'Not Subject to Social Security (1=yes)': e.sscExempt ? 1 : 0,
    Documents: (e.documents || []).map((d) => d.name).join('; '),
  }));
  const wsEmployees = XLSX.utils.json_to_sheet(empRows);
  XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employees');

  // 4. Salary Records
  const recordRows = records.map((r) => ({
    Company: compMap.get(r.companyId) || '',
    'Employee ID': r.empId,
    'Full Name': r.name,
    'Job Title': r.title || '',
    Department: r.dept || '',
    Year: r.year,
    Month: r.month,
    'Payment Date': r.payDate || '',
    'Payment Method': r.payMethod || 'Bank transfer',
    Currency: r.currency || 'JOD',
    'Basic salary': r.amounts.basic || 0,
    'Housing allowance': r.amounts.housing || 0,
    'Transportation allowance': r.amounts.transport || 0,
    'Other allowances': r.amounts.other_allow || 0,
    Overtime: r.amounts.overtime || 0,
    Bonus: r.amounts.bonus || 0,
    'Other earnings': r.amounts.other_earn || 0,
    'Social Security': r.amounts.social_sec || 0,
    'Income tax': r.amounts.income_tax || 0,
    'Other deductions': r.amounts.other_ded || 0,
    'Advance salary': r.amounts.advance || 0,
    'Unpaid leave': r.amounts.unpaid_leave || 0,
    'Gross Salary (calculated)': r.gross,
    'Total Deductions (calculated)': r.totalDed,
    'Net Salary (calculated)': r.net,
    Notes: r.notes || '',
    'Dependants exemption (1=yes)': r.claimsFamily ? 1 : 0,
    'Documented expenses exemption': r.extraExemption || 0,
    'Additional Allowances': serializeAllowances(r.earnings || []),
    'Additional Deductions': serializeDeductions(r.deductions || []),
  }));
  const wsRecords = XLSX.utils.json_to_sheet(recordRows);
  XLSX.utils.book_append_sheet(wb, wsRecords, 'Salary Records');

  // 5. Item Types
  const itemTypeRows: any[] = [];
  for (const c of companies) {
    for (const a of c.allowanceTypes || []) {
      itemTypeRows.push({
        Company: c.name,
        'Kind (Allowance / Deduction)': 'Allowance',
        Name: a.name,
        'Calculation (Fixed / Percent)': a.method === 'percent' ? 'Percent' : 'Fixed',
        'Default Value': a.value,
        'Taxable (1/0)': a.taxable ? 1 : 0,
        'Social Security (1/0)': a.ssc ? 1 : 0,
        'Before Tax (1/0)': 0,
      });
    }
    for (const d of c.deductionTypes || []) {
      itemTypeRows.push({
        Company: c.name,
        'Kind (Allowance / Deduction)': 'Deduction',
        Name: d.name,
        'Calculation (Fixed / Percent)': d.method === 'percent' ? 'Percent' : 'Fixed',
        'Default Value': d.value,
        'Taxable (1/0)': 0,
        'Social Security (1/0)': 0,
        'Before Tax (1/0)': d.preTax ? 1 : 0,
      });
    }
  }
  const wsItemTypes = XLSX.utils.json_to_sheet(itemTypeRows);
  XLSX.utils.book_append_sheet(wb, wsItemTypes, 'Item Types');

  // 6. Loans
  const empNameMap = new Map(employees.map((e) => [`${e.companyId}_${e.empId}`, e.name]));
  const loanRows = loans.map((l) => {
    // calculate paid back from records
    const paidBack = records
      .filter((r) => r.companyId === l.companyId && r.empId === l.empId)
      .reduce((sum, r) => {
        const item = r.deductions.find((d) => d.loanId === l.id);
        return sum + (item ? item.amount : 0);
      }, 0);
    const balance = Math.max(0, l.total - paidBack);

    return {
      Company: compMap.get(l.companyId) || '',
      'Employee ID': l.empId,
      'Full Name': empNameMap.get(`${l.companyId}_${l.empId}`) || '',
      Description: l.description,
      'Loan Amount': l.total,
      'Monthly Installment': l.installment,
      'First Month': l.startMonth,
      'First Year': l.startYear,
      Notes: l.notes || '',
      'Paid Back (calculated)': paidBack,
      'Balance (calculated)': balance,
    };
  });
  const wsLoans = XLSX.utils.json_to_sheet(loanRows);
  XLSX.utils.book_append_sheet(wb, wsLoans, 'Loans');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate Blank Excel Template
 */
export function generateBlankTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Read me
  const readMeData = [
    ['Salary Calculator — Blank Template'],
    ['Instructions:'],
    ['- Fill out the sheets below with your companies, employees, salary records, item types, and loans.'],
    ['- Save and import this file into the Salary Calculator app.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readMeData), 'Read me');

  // Headers
  const compHeaders = [['Company', 'Address', 'Currency', 'Tax Number']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compHeaders), 'Companies');

  const empHeaders = [[
    'Company', 'Employee ID', 'Full Name', 'Full Name (Arabic)', 'Job Title', 'Department',
    'Dependants exemption (1=yes)', 'Documented expenses exemption', 'Package: Basic salary',
    'Package: Housing allowance', 'Package: Transportation allowance', 'Package: Other allowances',
    'Recurring Allowances (package)', 'Recurring Deductions (package)', 'National ID / Passport No.',
    'ID Type (1=National ID, 2=Passport)', 'Employee Tax Number', 'Address', 'Phone', 'Email',
    'P.O. Box', 'Postal Code', 'Status (Active / Resigned)', 'Work Start Date', 'Last Working Date',
    'Social Security Number', 'Insured Wage (Social Security)', 'Not Subject to Social Security (1=yes)', 'Documents'
  ]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empHeaders), 'Employees');

  const recordHeaders = [[
    'Company', 'Employee ID', 'Full Name', 'Job Title', 'Department', 'Year', 'Month',
    'Payment Date', 'Payment Method', 'Currency', 'Basic salary', 'Housing allowance',
    'Transportation allowance', 'Other allowances', 'Overtime', 'Bonus', 'Other earnings',
    'Social Security', 'Income tax', 'Other deductions', 'Advance salary', 'Unpaid leave',
    'Gross Salary (calculated)', 'Total Deductions (calculated)', 'Net Salary (calculated)',
    'Notes', 'Dependants exemption (1=yes)', 'Documented expenses exemption',
    'Additional Allowances', 'Additional Deductions'
  ]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recordHeaders), 'Salary Records');

  const itemHeaders = [[
    'Company', 'Kind (Allowance / Deduction)', 'Name', 'Calculation (Fixed / Percent)',
    'Default Value', 'Taxable (1/0)', 'Social Security (1/0)', 'Before Tax (1/0)'
  ]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemHeaders), 'Item Types');

  const loanHeaders = [[
    'Company', 'Employee ID', 'Full Name', 'Description', 'Loan Amount',
    'Monthly Installment', 'First Month', 'First Year', 'Notes',
    'Paid Back (calculated)', 'Balance (calculated)'
  ]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(loanHeaders), 'Loans');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate Monthly Inputs Sheet (Section 12.2)
 */
export function generateMonthlyInputsSheet(
  company: Company,
  employees: Employee[],
  year: number,
  month: number,
  existingInputs: MonthlyInput[]
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Read me
  const readMeData = [
    [`Monthly Inputs Sheet — ${company.name}`],
    [`Period: ${month}/${year}`],
    ['Instructions:'],
    ['- Fill in "New Amount" for any item you want to change for this month.'],
    ['- "Apply" can be "This month only" (default) or "From this month on" (updates pay package).'],
    ['- Leave "New Amount" empty to keep the employee\'s usual amount.'],
    ['- Enter 0 in "New Amount" to leave an allowance/deduction out this month.'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readMeData), 'Read me');

  const rows: any[] = [];

  for (const emp of employees) {
    if (emp.status === 'resigned' && emp.endDate && emp.endDate < `${year}-${month < 10 ? '0' + month : month}-01`) {
      continue;
    }

    const items: { item: string; kind: string; usual: number }[] = [];
    // Basic
    items.push({ item: 'Basic salary', kind: 'Salary', usual: emp.package.basic || 0 });
    if (emp.package.housing) items.push({ item: 'Housing allowance', kind: 'Salary', usual: emp.package.housing });
    if (emp.package.transport) items.push({ item: 'Transportation allowance', kind: 'Salary', usual: emp.package.transport });
    if (emp.package.other_allow) items.push({ item: 'Other allowances', kind: 'Salary', usual: emp.package.other_allow });

    // Recurring allowances
    for (const a of emp.allowances || []) {
      const amt = a.method === 'percent' ? roundHalfUp((emp.package.basic * a.value) / 100, 2) : a.value;
      items.push({ item: a.name, kind: 'Allowance', usual: amt });
    }

    // Recurring deductions
    for (const d of emp.deductions || []) {
      const amt = d.method === 'percent' ? roundHalfUp((emp.package.basic * d.value) / 100, 2) : d.value;
      items.push({ item: d.name, kind: 'Deduction', usual: amt });
    }

    for (const it of items) {
      const existing = existingInputs.find(
        (inp) => inp.empId === emp.empId && inp.item.toLowerCase() === it.item.toLowerCase()
      );

      rows.push({
        'Employee ID': emp.empId,
        'Employee Name': emp.name,
        'Arabic Name': emp.nameAr || '',
        Item: it.item,
        Kind: it.kind,
        'Current Amount': it.usual,
        'New Amount': existing ? existing.amount : '',
        Apply: 'This month only',
        Notes: existing?.notes || '',
      });
    }

    // Extra one-off inputs already saved
    const extraInputs = existingInputs.filter(
      (inp) => inp.empId === emp.empId && !items.some((it) => it.item.toLowerCase() === inp.item.toLowerCase())
    );
    for (const extra of extraInputs) {
      rows.push({
        'Employee ID': emp.empId,
        'Employee Name': emp.name,
        'Arabic Name': emp.nameAr || '',
        Item: extra.item,
        Kind: extra.kind === 'salary' ? 'Salary' : extra.kind === 'allowance' ? 'Allowance' : 'Deduction',
        'Current Amount': 0,
        'New Amount': extra.amount,
        Apply: 'This month only',
        Notes: extra.notes || '',
      });
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Inputs');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate ISTD Salaries Sheet (Section 12.3)
 * Exact sheet name: Sheet1
 * Exact column names: ID | IDType | Name | Months | TotalSalary | SalaryDeduction | TotalBoardOfDirectors | BoardOfDirectorsDedcution | EndOfServiceIndemnity
 * Values formatted with 3 decimals (fils) as text
 */
export function generateISTDSheet(
  employees: Employee[],
  records: SalaryRecord[],
  fromMonth: number,
  toMonth: number,
  year: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const filteredRecords = records.filter(
    (r) => r.year === year && r.month >= fromMonth && r.month <= toMonth
  );

  // Group by empId
  const empRecordMap = new Map<string, SalaryRecord[]>();
  for (const r of filteredRecords) {
    const list = empRecordMap.get(r.empId) || [];
    list.push(r);
    empRecordMap.set(r.empId, list);
  }

  const rows: any[] = [];
  for (const emp of employees) {
    const recs = empRecordMap.get(emp.empId);
    if (!recs || recs.length === 0) continue;

    const monthsCount = recs.length;
    let totalSalary = 0;
    let totalDeduction = 0;

    for (const r of recs) {
      // Monthly + Non-monthly = basic + housing + transport + other_allow + overtime + earnings + bonus + other_earn
      const monthlySum =
        (r.amounts.basic || 0) +
        (r.amounts.housing || 0) +
        (r.amounts.transport || 0) +
        (r.amounts.other_allow || 0) +
        (r.amounts.overtime || 0) +
        (r.earnings || []).reduce((s, e) => s + (e.amount || 0), 0);
      const nonMonthly = (r.amounts.bonus || 0) + (r.amounts.other_earn || 0);
      totalSalary += monthlySum + nonMonthly;
      totalDeduction += r.amounts.income_tax || 0;
    }

    rows.push({
      ID: emp.nationalId || '',
      IDType: emp.idType || '1',
      Name: emp.name,
      Months: String(monthsCount),
      TotalSalary: formatFils(totalSalary),
      SalaryDeduction: formatFils(totalDeduction),
      TotalBoardOfDirectors: '0.000',
      BoardOfDirectorsDedcution: '0.000',
      EndOfServiceIndemnity: '0.000',
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate Annual Summary Report
 */
export function generateAnnualSummarySheet(
  company: Company,
  employees: Employee[],
  records: SalaryRecord[],
  year: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const rows = employees.map((emp) => {
    const recs = records.filter((r) => r.companyId === company.id && r.empId === emp.empId && r.year === year);
    const months = recs.length;
    const gross = recs.reduce((s, r) => s + r.gross, 0);
    const ssc = recs.reduce((s, r) => s + (r.amounts.social_sec || 0), 0);
    const tax = recs.reduce((s, r) => s + (r.amounts.income_tax || 0), 0);
    const net = recs.reduce((s, r) => s + r.net, 0);

    return {
      'Employee ID': emp.empId,
      Name: emp.name,
      'Arabic Name': emp.nameAr || '',
      Department: emp.department || '',
      Months: months,
      'Gross Salary': roundHalfUp(gross, 2),
      'Social Security': roundHalfUp(ssc, 2),
      'Income Tax': roundHalfUp(tax, 2),
      'Net Salary': roundHalfUp(net, 2),
    };
  });

  // Totals row
  const totalGross = rows.reduce((s, r) => s + r['Gross Salary'], 0);
  const totalSsc = rows.reduce((s, r) => s + r['Social Security'], 0);
  const totalTax = rows.reduce((s, r) => s + r['Income Tax'], 0);
  const totalNet = rows.reduce((s, r) => s + r['Net Salary'], 0);

  rows.push({
    'Employee ID': 'TOTAL',
    Name: '',
    'Arabic Name': '',
    Department: '',
    Months: rows.reduce((s, r) => s + (r.Months || 0), 0),
    'Gross Salary': roundHalfUp(totalGross, 2),
    'Social Security': roundHalfUp(totalSsc, 2),
    'Income Tax': roundHalfUp(totalTax, 2),
    'Net Salary': roundHalfUp(totalNet, 2),
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `Annual Summary ${year}`);

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate Social Security Monthly List
 */
export function generateSSCListSheet(
  company: Company,
  employees: Employee[],
  records: SalaryRecord[],
  year: number,
  month: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const monthRecords = records.filter(
    (r) => r.companyId === company.id && r.year === year && r.month === month
  );

  const rows = monthRecords.map((r) => {
    const emp = employees.find((e) => e.companyId === company.id && e.empId === r.empId);
    const insuredWage = emp?.sscWage && emp.sscWage > 0
      ? emp.sscWage
      : (r.amounts.basic || 0) + (r.amounts.housing || 0) + (r.amounts.transport || 0) + (r.amounts.other_allow || 0);

    return {
      'Employee ID': r.empId,
      Name: r.name,
      'Arabic Name': r.nameAr || '',
      'Social Security No.': emp?.sscNumber || '',
      'National ID': emp?.nationalId || '',
      'Insured Wage': roundHalfUp(insuredWage, 2),
      'Employee Share (7.5%)': roundHalfUp(r.amounts.social_sec || 0, 2),
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `SSC List ${year}-${month}`);

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generate Activity Log Export
 */
export function generateActivityLogSheet(logs: ActivityLog[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const rows = logs.map((l) => ({
    Timestamp: l.when,
    Username: l.username,
    Action: l.action,
    Details: l.details,
    'Company ID': l.companyId || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Activity Logs');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Parse Backup Excel File
 */
export interface BackupImportResult {
  companies: Company[];
  employees: Employee[];
  records: SalaryRecord[];
  loans: Loan[];
  errors: string[];
  summary: {
    companiesCount: number;
    employeesCount: number;
    recordsCount: number;
    loansCount: number;
  };
}

export function parseBackupWorkbook(
  data: ArrayBuffer,
  defaultCompanyId?: string,
  allExistingCompanies: Company[] = []
): BackupImportResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const errors: string[] = [];

  const companies: Company[] = [];
  const employees: Employee[] = [];
  const records: SalaryRecord[] = [];
  const loans: Loan[] = [];

  const compByName = new Map<string, Company>();
  for (const c of allExistingCompanies) {
    compByName.set(c.name.toLowerCase().trim(), c);
  }

  // Helper to normalize keys
  const normalizeKeys = (row: any) => {
    const res: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      res[key.trim().toLowerCase()] = row[key];
    }
    return res;
  };

  // 1. Companies Sheet
  const compSheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === 'companies');
  if (compSheetName) {
    const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[compSheetName]);
    for (let i = 0; i < rawRows.length; i++) {
      const r = normalizeKeys(rawRows[i]);
      const name = String(r['company'] || r['name'] || '').trim();
      if (!name) continue;

      let existing = compByName.get(name.toLowerCase());
      if (!existing) {
        existing = {
          id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name,
          address: String(r['address'] || ''),
          currency: String(r['currency'] || 'JOD'),
          taxNumber: String(r['tax number'] || r['taxnumber'] || ''),
          allowanceTypes: [],
          deductionTypes: [],
        };
        compByName.set(name.toLowerCase(), existing);
        companies.push(existing);
      }
    }
  }

  // 2. Item Types Sheet
  const itemSheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === 'item types');
  if (itemSheetName) {
    const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[itemSheetName]);
    for (const raw of rawRows) {
      const r = normalizeKeys(raw);
      const compName = String(r['company'] || '').trim();
      const comp = compByName.get(compName.toLowerCase());
      if (!comp) continue;

      const kind = String(r['kind (allowance / deduction)'] || r['kind'] || '').toLowerCase();
      const name = String(r['name'] || '').trim();
      if (!name) continue;

      const calc = String(r['calculation (fixed / percent)'] || r['calculation'] || '').toLowerCase();
      const method = calc.includes('percent') || calc === '%' ? 'percent' : 'fixed';
      const defaultValue = parseFloat(r['default value'] || r['value'] || 0) || 0;

      if (kind.includes('allowance')) {
        const taxable = r['taxable (1/0)'] !== undefined ? Boolean(Number(r['taxable (1/0)'])) : true;
        const ssc = r['social security (1/0)'] !== undefined ? Boolean(Number(r['social security (1/0)'])) : true;
        if (!comp.allowanceTypes.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
          comp.allowanceTypes.push({ name, method, value: defaultValue, taxable, ssc });
        }
      } else {
        const preTax = r['before tax (1/0)'] !== undefined ? Boolean(Number(r['before tax (1/0)'])) : false;
        if (!comp.deductionTypes.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
          comp.deductionTypes.push({ name, method, value: defaultValue, preTax });
        }
      }
    }
  }

  // 3. Employees Sheet
  const empSheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === 'employees');
  if (empSheetName) {
    const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[empSheetName]);
    for (let i = 0; i < rawRows.length; i++) {
      const r = normalizeKeys(rawRows[i]);
      const compName = String(r['company'] || '').trim();
      let comp = compByName.get(compName.toLowerCase());
      if (!comp && defaultCompanyId) {
        comp = allExistingCompanies.find((c) => c.id === defaultCompanyId);
      }
      if (!comp) {
        errors.push(`Employees row ${i + 2}: Company "${compName}" not found.`);
        continue;
      }

      const empId = String(r['employee id'] || r['empid'] || r['id'] || '').trim();
      const name = String(r['full name'] || r['name'] || '').trim();
      if (!empId || !name) {
        errors.push(`Employees row ${i + 2}: Missing Employee ID or Full Name.`);
        continue;
      }

      const rawAllowances = String(r['recurring allowances (package)'] || r['recurring allowances'] || '');
      const rawDeductions = String(r['recurring deductions (package)'] || r['recurring deductions'] || '');

      const allowances = parseAllowances(rawAllowances, comp.allowanceTypes);
      const parsedDeds = parseDeductions(rawDeductions, comp.deductionTypes);
      const deductions = parsedDeds.map((d) => ({
        name: d.name,
        method: d.method,
        value: d.value,
        preTax: d.preTax,
      }));

      const emp: Employee = {
        id: `${comp.id}_${empId}`,
        companyId: comp.id,
        empId,
        name,
        nameAr: String(r['full name (arabic)'] || r['arabic name'] || ''),
        title: String(r['job title'] || r['title'] || ''),
        department: String(r['department'] || ''),
        status: String(r['status (active / resigned)'] || r['status'] || '').toLowerCase().includes('resign') ? 'resigned' : 'active',
        hireDate: r['work start date'] ? String(r['work start date']).substring(0, 10) : '',
        endDate: r['last working date'] ? String(r['last working date']).substring(0, 10) : undefined,
        nationalId: String(r['national id / passport no.'] || r['national id'] || ''),
        idType: String(r['id type (1=national id, 2=passport)'] || '').includes('2') ? '2' : '1',
        taxNumber: String(r['employee tax number'] || ''),
        address: String(r['address'] || ''),
        phone: String(r['phone'] || ''),
        email: String(r['email'] || ''),
        poBox: String(r['p.o. box'] || ''),
        postalCode: String(r['postal code'] || ''),
        sscNumber: String(r['social security number'] || ''),
        sscWage: parseFloat(r['insured wage (social security)']) || undefined,
        sscExempt: Boolean(Number(r['not subject to social security (1=yes)'] || 0)),
        claimsFamily: Boolean(Number(r['dependants exemption (1=yes)'] || 0)),
        extraExemption: parseFloat(r['documented expenses exemption']) || 0,
        package: {
          basic: parseFloat(r['package: basic salary'] || r['basic salary'] || 0) || 0,
          housing: parseFloat(r['package: housing allowance'] || r['housing allowance'] || 0) || 0,
          transport: parseFloat(r['package: transportation allowance'] || r['transportation allowance'] || 0) || 0,
          other_allow: parseFloat(r['package: other allowances'] || r['other allowances'] || 0) || 0,
        },
        allowances,
        deductions,
        documents: [],
      };

      employees.push(emp);
    }
  }

  // 4. Loans Sheet
  const loanSheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === 'loans');
  if (loanSheetName) {
    const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[loanSheetName]);
    for (let i = 0; i < rawRows.length; i++) {
      const r = normalizeKeys(rawRows[i]);
      const compName = String(r['company'] || '').trim();
      let comp = compByName.get(compName.toLowerCase());
      if (!comp && defaultCompanyId) comp = allExistingCompanies.find((c) => c.id === defaultCompanyId);
      if (!comp) continue;

      const empId = String(r['employee id'] || '').trim();
      const total = parseFloat(r['loan amount'] || r['total'] || 0);
      const installment = parseFloat(r['monthly installment'] || r['installment'] || 0);
      if (!empId || total <= 0) continue;

      const loan: Loan = {
        id: `loan_${comp.id}_${empId}_${Date.now()}_${i}`,
        companyId: comp.id,
        empId,
        description: String(r['description'] || 'Staff loan'),
        total,
        installment: installment > 0 ? installment : total,
        startYear: parseInt(r['first year']) || new Date().getFullYear(),
        startMonth: parseInt(r['first month']) || 1,
        notes: String(r['notes'] || ''),
        settled: false,
      };
      loans.push(loan);
    }
  }

  // 5. Salary Records Sheet
  const recSheetName = wb.SheetNames.find((s) => s.toLowerCase().trim() === 'salary records');
  if (recSheetName) {
    const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[recSheetName]);
    for (let i = 0; i < rawRows.length; i++) {
      const r = normalizeKeys(rawRows[i]);
      const compName = String(r['company'] || '').trim();
      let comp = compByName.get(compName.toLowerCase());
      if (!comp && defaultCompanyId) comp = allExistingCompanies.find((c) => c.id === defaultCompanyId);
      if (!comp) continue;

      const empId = String(r['employee id'] || '').trim();
      const year = parseInt(r['year']) || new Date().getFullYear();
      let month = parseInt(r['month']);
      if (isNaN(month)) {
        // try month name
        const mStr = String(r['month'] || '').toLowerCase();
        const foundIdx = [
          'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ].findIndex((prefix) => mStr.includes(prefix));
        month = foundIdx >= 0 ? foundIdx + 1 : 1;
      }

      if (!empId) continue;

      const amounts = {
        basic: parseFloat(r['basic salary'] || 0) || 0,
        housing: parseFloat(r['housing allowance'] || 0) || 0,
        transport: parseFloat(r['transportation allowance'] || 0) || 0,
        other_allow: parseFloat(r['other allowances'] || 0) || 0,
        overtime: parseFloat(r['overtime'] || 0) || 0,
        bonus: parseFloat(r['bonus'] || 0) || 0,
        other_earn: parseFloat(r['other earnings'] || 0) || 0,
        social_sec: parseFloat(r['social security'] || 0) || 0,
        income_tax: parseFloat(r['income tax'] || 0) || 0,
        other_ded: parseFloat(r['other deductions'] || 0) || 0,
        advance: parseFloat(r['advance salary'] || 0) || 0,
        unpaid_leave: parseFloat(r['unpaid leave'] || 0) || 0,
      };

      const rawAddAllow = String(r['additional allowances'] || '');
      const rawAddDed = String(r['additional deductions'] || '');

      const parsedAllow = parseAllowances(rawAddAllow, comp.allowanceTypes);
      const parsedDed = parseDeductions(rawAddDed, comp.deductionTypes);

      const earnings = parsedAllow.map((a) => ({
        name: a.name,
        amount: a.value,
        taxable: a.taxable,
        ssc: a.ssc,
      }));

      const deductions = parsedDed.map((d) => ({
        name: d.name,
        amount: d.value,
        preTax: d.preTax,
      }));

      const gross =
        amounts.basic + amounts.housing + amounts.transport + amounts.other_allow +
        amounts.overtime + amounts.bonus + amounts.other_earn +
        earnings.reduce((s, e) => s + e.amount, 0);

      const totalDed =
        amounts.social_sec + amounts.income_tax + amounts.other_ded + amounts.advance + amounts.unpaid_leave +
        deductions.reduce((s, d) => s + d.amount, 0);

      const record: SalaryRecord = {
        id: `${comp.id}_${empId}_${year}_${month}`,
        companyId: comp.id,
        empId,
        name: String(r['full name'] || ''),
        nameAr: '',
        title: String(r['job title'] || ''),
        dept: String(r['department'] || ''),
        year,
        month,
        payDate: r['payment date'] ? String(r['payment date']).substring(0, 10) : `${year}-${month < 10 ? '0' + month : month}-28`,
        payMethod: (r['payment method'] as any) || 'Bank transfer',
        currency: String(r['currency'] || comp.currency || 'JOD'),
        amounts,
        earnings,
        deductions,
        gross: roundHalfUp(gross, 2),
        totalDed: roundHalfUp(totalDed, 2),
        net: roundHalfUp(gross - totalDed, 2),
        notes: String(r['notes'] || ''),
        claimsFamily: Boolean(Number(r['dependants exemption (1=yes)'] || 0)),
        extraExemption: parseFloat(r['documented expenses exemption']) || 0,
        autoCalc: false, // Imported records keep SSC/tax as written
      };

      records.push(record);
    }
  }

  return {
    companies,
    employees,
    records,
    loans,
    errors,
    summary: {
      companiesCount: companies.length,
      employeesCount: employees.length,
      recordsCount: records.length,
      loansCount: loans.length,
    },
  };
}

/**
 * Parse Uploaded Monthly Inputs Sheet
 */
export function parseMonthlyInputsSheet(data: ArrayBuffer): {
  inputs: { empId: string; item: string; kind: string; amount: number; apply: string; notes?: string }[];
  errors: string[];
} {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes('input')) || wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);

  const inputs: { empId: string; item: string; kind: string; amount: number; apply: string; notes?: string }[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const normalized: Record<string, any> = {};
    for (const k of Object.keys(raw)) {
      normalized[k.trim().toLowerCase()] = raw[k];
    }

    const empId = String(normalized['employee id'] || normalized['empid'] || '').trim();
    const item = String(normalized['item'] || normalized['name'] || '').trim();
    const newAmountRaw = normalized['new amount'];

    if (!empId || !item) continue;
    if (newAmountRaw === undefined || newAmountRaw === null || String(newAmountRaw).trim() === '') {
      continue; // keep usual amount
    }

    const amount = parseFloat(newAmountRaw);
    if (isNaN(amount) || amount < 0) {
      errors.push(`Row ${i + 2} (${empId} - ${item}): Invalid amount "${newAmountRaw}"`);
      continue;
    }

    const kind = String(normalized['kind'] || '').trim();
    const apply = String(normalized['apply'] || 'This month only').trim();
    const notes = String(normalized['notes'] || '').trim();

    inputs.push({
      empId,
      item,
      kind,
      amount,
      apply,
      notes,
    });
  }

  return { inputs, errors };
}

/**
 * Generate Company Statutory SSC & Income Tax Obligations Excel Workbook
 */
export function generateCompanyStatutorySheet(
  company: Company,
  employees: Employee[],
  records: SalaryRecord[],
  year: number,
  month: number
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const monthName = getMonthName(month, 'en');
  const monthRecords = records.filter((r) => r.companyId === company.id && r.year === year && r.month === month);

  // Sheet 1: Monthly Employee-by-Employee Breakdown
  const monthRows = monthRecords.map((r) => {
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
    const totalGovernmentRemittance = roundHalfUp(sscTotal + taxWithheld, 2);

    return {
      'Employee ID': r.empId,
      'Full Name (EN)': r.name,
      'Full Name (AR)': r.nameAr || emp?.nameAr || '',
      Department: r.dept || emp?.department || '',
      'National ID / Passport': emp?.nationalId || '',
      'SSC Number': emp?.sscNumber || '',
      'Basic Salary': basic,
      'Insured Wage': insuredWage,
      'SSC Employee (7.5%)': sscEmployee,
      'SSC Company (14.25%)': sscCompany,
      'Total SSC Due (21.75%)': sscTotal,
      'Income Tax Withheld (ISTD)': taxWithheld,
      'Total Gov Remittance': totalGovernmentRemittance,
    };
  });

  const wsMonth = XLSX.utils.json_to_sheet(monthRows);
  XLSX.utils.book_append_sheet(wb, wsMonth, `${monthName} ${year}`);

  // Sheet 2: 12-Month Annual Breakdown
  const annualRows = [];
  for (let m = 1; m <= 12; m++) {
    const mRecs = records.filter((r) => r.companyId === company.id && r.year === year && r.month === m);
    let totalInsured = 0;
    let totalSscEmp = 0;
    let totalSscComp = 0;
    let totalTax = 0;

    for (const r of mRecs) {
      const emp = employees.find((e) => e.empId === r.empId);
      const basic = r.amounts.basic || 0;
      const insuredWage =
        emp?.sscWage && emp.sscWage > 0
          ? emp.sscWage
          : basic + (r.amounts.housing || 0) + (r.amounts.transport || 0) + (r.amounts.other_allow || 0);

      const sscEmp = r.amounts.social_sec || 0;
      const sscComp = roundHalfUp(insuredWage * 0.1425, 2);
      const tax = r.amounts.income_tax || 0;

      totalInsured += insuredWage;
      totalSscEmp += sscEmp;
      totalSscComp += sscComp;
      totalTax += tax;
    }

    annualRows.push({
      Month: `${m} - ${getMonthName(m, 'en')}`,
      Headcount: mRecs.length,
      'Total Insured Wages': roundHalfUp(totalInsured, 2),
      'SSC Company (14.25%)': roundHalfUp(totalSscComp, 2),
      'SSC Employee (7.5%)': roundHalfUp(totalSscEmp, 2),
      'Total SSC Due (21.75%)': roundHalfUp(totalSscEmp + totalSscComp, 2),
      'Income Tax Due (ISTD)': roundHalfUp(totalTax, 2),
      'Total Statutory Remittance': roundHalfUp(totalSscEmp + totalSscComp + totalTax, 2),
    });
  }

  const wsAnnual = XLSX.utils.json_to_sheet(annualRows);
  XLSX.utils.book_append_sheet(wb, wsAnnual, `Annual Schedule ${year}`);

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

/**
 * -------------------------------------------------------------
 * SCREEN 1: EMPLOYEES IMPORT & EXPORT
 * -------------------------------------------------------------
 */

export function exportEmployeesSheet(company: Company, employees: Employee[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const rows = employees.map((e) => ({
    'Employee ID': e.empId,
    'Full Name (EN)': e.name,
    'Full Name (AR)': e.nameAr || '',
    'Job Title': e.title || '',
    Department: e.department || '',
    Status: e.status === 'resigned' ? 'Resigned' : 'Active',
    'Hire Date': e.hireDate || '',
    'End Date': e.endDate || '',
    'National ID / Passport': e.nationalId || '',
    'ID Type (1=National, 2=Passport)': e.idType || '1',
    'Tax Number': e.taxNumber || '',
    'SSC Number': e.sscNumber || '',
    'SSC Insured Wage': e.sscWage || '',
    'SSC Exempt (1=Yes, 0=No)': e.sscExempt ? 1 : 0,
    'Claims Family Exemption (1=Yes)': e.claimsFamily ? 1 : 0,
    'Extra Expenses Exemption': e.extraExemption || 0,
    'Basic Salary': e.package?.basic || 0,
    'Housing Allowance': e.package?.housing || 0,
    'Transport Allowance': e.package?.transport || 0,
    'Other Allowances': e.package?.other_allow || 0,
    'Custom Allowances': serializeAllowances(e.allowances || []),
    'Custom Deductions': serializeDeductions(e.deductions || []),
    Email: e.email || '',
    Phone: e.phone || '',
    Address: e.address || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function generateEmployeeImportTemplate(company: Company): Uint8Array {
  const wb = XLSX.utils.book_new();

  const instructions = [
    ['JORDAN PAYROLL SYSTEM — EMPLOYEE IMPORT TEMPLATE'],
    ['Company:', company.name],
    ['Currency:', company.currency || 'JOD'],
    [''],
    ['Instructions:'],
    ['1. Fill in employee details below in the "Employees" sheet.'],
    ['2. "Employee ID" and "Full Name (EN)" are mandatory fields.'],
    ['3. Basic Salary and allowances must be numeric amounts.'],
    ['4. Dates must be formatted as YYYY-MM-DD (e.g. 2026-01-15).'],
    ['5. ID Type: 1 for Jordanian National ID, 2 for Foreign Passport.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

  const sampleRows = [
    {
      'Employee ID': 'EMP001',
      'Full Name (EN)': 'Ahmad Mansour',
      'Full Name (AR)': 'أحمد منصور',
      'Job Title': 'Senior Accountant',
      Department: 'Finance',
      Status: 'Active',
      'Hire Date': '2024-01-15',
      'End Date': '',
      'National ID / Passport': '9901020304',
      'ID Type (1=National, 2=Passport)': '1',
      'Tax Number': '12345678',
      'SSC Number': '554433221',
      'SSC Insured Wage': 1200,
      'SSC Exempt (1=Yes, 0=No)': 0,
      'Claims Family Exemption (1=Yes)': 1,
      'Extra Expenses Exemption': 0,
      'Basic Salary': 900,
      'Housing Allowance': 200,
      'Transport Allowance': 100,
      'Other Allowances': 0,
      'Custom Allowances': 'Mobile Allowance: 30',
      'Custom Deductions': 'Health Insurance: 25',
      Email: 'ahmad@company.com',
      Phone: '0791234567',
      Address: 'Amman, Jordan',
    },
    {
      'Employee ID': 'EMP002',
      'Full Name (EN)': 'Sarah Khoury',
      'Full Name (AR)': 'سارة خوري',
      'Job Title': 'Operations Manager',
      Department: 'Operations',
      Status: 'Active',
      'Hire Date': '2023-05-01',
      'End Date': '',
      'National ID / Passport': '9922030405',
      'ID Type (1=National, 2=Passport)': '1',
      'Tax Number': '22334455',
      'SSC Number': '667788990',
      'SSC Insured Wage': 1600,
      'SSC Exempt (1=Yes, 0=No)': 0,
      'Claims Family Exemption (1=Yes)': 0,
      'Extra Expenses Exemption': 0,
      'Basic Salary': 1200,
      'Housing Allowance': 300,
      'Transport Allowance': 100,
      'Other Allowances': 0,
      'Custom Allowances': 'Fuel Allowance: 50',
      'Custom Deductions': '',
      Email: 'sarah@company.com',
      Phone: '0797654321',
      Address: 'Amman, Jordan',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function parseEmployeesImportSheet(
  data: ArrayBuffer,
  companyId: string,
  company?: Company,
  existingEmployees: Employee[] = []
): { employees: Employee[]; errors: string[] } {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((s) => s.toLowerCase().includes('employee')) || wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);

  const employees: Employee[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = normalizeRow(rawRows[i]);

    const empId = str(pick(r, 'employee id', 'empid', 'id'));
    const name = str(pick(r, 'full name (en)', 'full name', 'name'));

    if (!empId && !name) continue; // empty row

    if (!empId) {
      errors.push(`Row ${i + 2}: Missing Employee ID`);
      continue;
    }
    if (!name) {
      errors.push(`Row ${i + 2} (${empId}): Missing Employee Name`);
      continue;
    }

    // Updating an existing employee keeps fields the sheet does not carry (documents, etc.)
    const existing = existingEmployees.find((e) => e.companyId === companyId && e.empId === empId);
    const sscWage = num(pick(r, 'ssc insured wage', 'insured wage'), 0) || undefined;

    const allowances = parseAllowances(
      str(pick(r, 'custom allowances', 'recurring allowances')),
      company?.allowanceTypes || []
    );
    const deductions = parseDeductions(
      str(pick(r, 'custom deductions', 'recurring deductions')),
      company?.deductionTypes || []
    ).map((d) => ({ name: d.name, method: d.method, value: d.value, preTax: d.preTax }));

    const status = str(pick(r, 'status')).toLowerCase().includes('resign') ? 'resigned' : 'active';
    const endDate = toDateStr(pick(r, 'end date', 'last working date'));

    employees.push({
      ...(existing || {}),
      id: `${companyId}_${empId}`,
      companyId,
      empId,
      name,
      nameAr: str(pick(r, 'full name (ar)', 'full name (arabic)', 'arabic name', 'namear')),
      title: str(pick(r, 'job title', 'title')),
      department: str(pick(r, 'department', 'dept')),
      status,
      hireDate: toDateStr(pick(r, 'hire date', 'work start date')) || existing?.hireDate || '',
      endDate: endDate || undefined,
      nationalId: str(pick(r, 'national id / passport', 'national id')),
      idType: str(pick(r, 'id type')).includes('2') ? '2' : '1',
      taxNumber: str(pick(r, 'tax number', 'employee tax number')) || undefined,
      sscNumber: str(pick(r, 'ssc number', 'social security number')) || undefined,
      sscWage,
      sscExempt: flag(pick(r, 'ssc exempt', 'not subject to social security')),
      claimsFamily: flag(pick(r, 'claims family exemption', 'dependants exemption')),
      extraExemption: num(pick(r, 'extra expenses exemption', 'documented expenses exemption')),
      package: {
        basic: num(pick(r, 'basic salary', 'package: basic salary', 'basic')),
        housing: num(pick(r, 'housing allowance', 'package: housing allowance', 'housing')),
        transport: num(pick(r, 'transport allowance', 'transportation allowance', 'package: transportation allowance')),
        other_allow: num(pick(r, 'other allowances', 'package: other allowances')),
      },
      allowances,
      deductions,
      documents: existing?.documents || [],
      email: str(pick(r, 'email')) || undefined,
      phone: str(pick(r, 'phone')) || undefined,
      address: str(pick(r, 'address')) || undefined,
    } as Employee);
  }

  return { employees, errors };
}

/**
 * -------------------------------------------------------------
 * SCREEN 2: LOANS IMPORT & EXPORT
 * -------------------------------------------------------------
 */

export function exportLoansSheet(
  company: Company,
  loans: Loan[],
  employees: Employee[],
  records: SalaryRecord[]
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const rows = loans.map((l) => {
    const emp = employees.find((e) => e.empId === l.empId);

    // Calculate paid so far from records
    const paidSoFar = records
      .filter((r) => r.companyId === company.id && r.empId === l.empId)
      .reduce((sum, r) => {
        const item = r.deductions.find((d) => d.loanId === l.id);
        return sum + (item ? item.amount : 0);
      }, 0);

    const balance = Math.max(0, l.total - paidSoFar);

    return {
      'Loan ID': l.id,
      'Employee ID': l.empId,
      'Employee Name': emp?.name || '',
      Department: emp?.department || '',
      Description: l.description,
      'Total Loan Amount': l.total,
      'Monthly Installment': l.installment,
      'Start Year': l.startYear,
      'Start Month': l.startMonth,
      'Total Paid': paidSoFar,
      'Remaining Balance': l.settled ? 0 : balance,
      Status: l.settled ? 'Settled' : 'Active',
      Notes: l.notes || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Staff Loans');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function generateLoansImportTemplate(company: Company, employees: Employee[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  const sampleRows = employees.slice(0, 3).map((e, idx) => ({
    'Employee ID': e.empId,
    'Employee Name (Reference)': e.name,
    Description: idx === 0 ? 'Salary Advance Loan' : idx === 1 ? 'Personal Loan' : 'Emergency Assistance',
    'Total Loan Amount': (idx + 1) * 300,
    'Monthly Installment': 50,
    'Start Year': 2026,
    'Start Month': 1,
    Notes: 'Approved by management',
  }));

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Loans Template');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function parseLoansImportSheet(
  data: ArrayBuffer,
  companyId: string,
  employees: Employee[]
): { loans: Loan[]; errors: string[] } {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes('loan')) || wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);

  const loans: Loan[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const normalized: Record<string, any> = {};
    for (const k of Object.keys(raw)) {
      normalized[k.trim().toLowerCase()] = raw[k];
    }

    const empId = String(normalized['employee id'] || normalized['empid'] || '').trim();
    if (!empId) continue;
    // Re-importing an exported sheet updates the same loans instead of duplicating them.
    const existingLoanId = String(normalized['loan id'] || '').trim();

    const empExists = employees.some((e) => e.empId === empId);
    if (!empExists) {
      errors.push(`Row ${i + 2}: Employee ID "${empId}" not found in company employees.`);
      continue;
    }

    const total = parseFloat(normalized['total loan amount'] || normalized['total'] || 0) || 0;
    const installment = parseFloat(normalized['monthly installment'] || normalized['installment'] || 0) || 0;

    if (total <= 0 || installment <= 0) {
      errors.push(`Row ${i + 2} (${empId}): Total and installment must be greater than zero.`);
      continue;
    }

    const startYear = parseInt(normalized['start year'] || new Date().getFullYear(), 10);
    const startMonth = parseInt(normalized['start month'] || 1, 10);

    loans.push({
      id: existingLoanId || `loan_${companyId}_${empId}_${Date.now()}_${i}`,
      companyId,
      empId,
      description: String(normalized['description'] || 'Staff Loan').trim(),
      total,
      installment,
      startYear,
      startMonth,
      notes: normalized['notes'] ? String(normalized['notes']).trim() : undefined,
      settled: String(normalized['status'] || '').toLowerCase().includes('settled'),
    });
  }

  return { loans, errors };
}

/**
 * -------------------------------------------------------------
 * SCREEN 3: SALARY RECORDS IMPORT & EXPORT
 * -------------------------------------------------------------
 */

export function exportSalaryRecordsSheet(
  company: Company,
  records: SalaryRecord[],
  employees: Employee[],
  year?: number,
  month?: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  let filtered = records.filter((r) => r.companyId === company.id);
  if (year) filtered = filtered.filter((r) => r.year === year);
  if (month) filtered = filtered.filter((r) => r.month === month);

  const rows = filtered.map((r) => {
    const emp = employees.find((e) => e.empId === r.empId);
    return {
      Year: r.year,
      Month: r.month,
      'Employee ID': r.empId,
      'Full Name': r.name,
      'Full Name (AR)': r.nameAr || emp?.nameAr || '',
      Department: r.dept,
      'Payment Date': r.payDate,
      'Payment Method': r.payMethod,
      'Basic Salary': r.amounts.basic || 0,
      'Housing Allowance': r.amounts.housing || 0,
      'Transport Allowance': r.amounts.transport || 0,
      'Other Allowances': r.amounts.other_allow || 0,
      Overtime: r.amounts.overtime || 0,
      Bonus: r.amounts.bonus || 0,
      'Other Earnings': r.amounts.other_earn || 0,
      'Gross Salary': r.gross,
      'Social Security (Employee)': r.amounts.social_sec || 0,
      'Income Tax': r.amounts.income_tax || 0,
      'Advance Salary': r.amounts.advance || 0,
      'Unpaid Leave': r.amounts.unpaid_leave || 0,
      'Other Deductions': r.amounts.other_ded || 0,
      'Total Deductions': r.totalDed,
      'Net Salary': r.net,
      'Additional Allowances': serializeAllowances(r.earnings || []),
      'Additional Deductions': serializeDeductions(r.deductions || []),
      Notes: r.notes || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const sheetTitle = month ? `Salaries ${month}-${year}` : `Salaries ${year || 'All'}`;
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function generateSalaryImportTemplate(
  company: Company,
  employees: Employee[],
  year: number,
  month: number
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const rows = employees.map((e) => ({
    Year: year,
    Month: month,
    'Employee ID': e.empId,
    'Full Name': e.name,
    'Basic Salary': e.package?.basic || 0,
    'Housing Allowance': e.package?.housing || 0,
    'Transport Allowance': e.package?.transport || 0,
    'Other Allowances': e.package?.other_allow || 0,
    Overtime: 0,
    Bonus: 0,
    'Other Earnings': 0,
    'Advance Salary': 0,
    'Unpaid Leave': 0,
    'Other Deductions': 0,
    'Additional Allowances': serializeAllowances(
      (e.allowances || []).map((a) => ({
        ...a,
        amount: a.method === 'percent' ? roundHalfUp(((e.package?.basic || 0) * a.value) / 100, 2) : a.value,
        method: 'fixed',
      }))
    ),
    'Additional Deductions': serializeDeductions(
      (e.deductions || []).map((d) => ({
        ...d,
        amount: d.method === 'percent' ? roundHalfUp(((e.package?.basic || 0) * d.value) / 100, 2) : d.value,
        method: 'fixed',
      }))
    ),
    'Payment Method': 'Bank transfer',
    Notes: '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, `Salaries M${month}-${year}`);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function parseSalaryImportSheet(
  data: ArrayBuffer,
  companyId: string,
  employees: Employee[],
  year: number,
  month: number,
  company?: Company,
  ruleSets?: PayrollRuleSet[]
): { records: SalaryRecord[]; errors: string[] } {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName =
    wb.SheetNames.find((s) => s.toLowerCase().includes('salar') || s.toLowerCase().includes('payroll')) ||
    wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);

  const records: SalaryRecord[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = normalizeRow(rawRows[i]);

    const empId = str(pick(r, 'employee id', 'empid'));
    if (!empId) continue;

    const emp = employees.find((e) => e.empId === empId);
    if (!emp) {
      errors.push(`Row ${i + 2}: Employee ID "${empId}" does not exist in this company.`);
      continue;
    }

    const recYear = Math.round(num(pick(r, 'year'), year));
    const recMonth = Math.round(num(pick(r, 'month'), month));
    if (recMonth < 1 || recMonth > 12) {
      errors.push(`Row ${i + 2} (${empId}): Month must be 1-12.`);
      continue;
    }

    const amounts: SalaryAmounts = {
      basic: num(pick(r, 'basic salary', 'basic'), emp.package.basic || 0),
      housing: num(pick(r, 'housing allowance', 'housing'), emp.package.housing || 0),
      transport: num(pick(r, 'transport allowance', 'transportation allowance', 'transport'), emp.package.transport || 0),
      other_allow: num(pick(r, 'other allowances', 'other_allow'), emp.package.other_allow || 0),
      overtime: num(pick(r, 'overtime')),
      bonus: num(pick(r, 'bonus')),
      other_earn: num(pick(r, 'other earnings', 'other_earn')),
      social_sec: 0,
      income_tax: 0,
      other_ded: num(pick(r, 'other deductions', 'other_ded')),
      advance: num(pick(r, 'advance salary', 'advance')),
      unpaid_leave: num(pick(r, 'unpaid leave')),
    };

    // Additional items come from the sheet when the column exists, otherwise from the employee's package.
    const hasAllowCol = Object.keys(r).some((k) => k.startsWith('additional allowances'));
    const hasDedCol = Object.keys(r).some((k) => k.startsWith('additional deductions'));
    const basic = amounts.basic;

    const earnings: SalaryEarningItem[] = (
      hasAllowCol
        ? parseAllowances(str(pick(r, 'additional allowances')), company?.allowanceTypes || [])
        : emp.allowances || []
    ).map((a) => ({
      name: a.name,
      amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
      taxable: a.taxable,
      ssc: a.ssc,
    }));

    const deductions: SalaryDeductionItem[] = (
      hasDedCol
        ? parseDeductions(str(pick(r, 'additional deductions')), company?.deductionTypes || [])
        : emp.deductions || []
    ).map((d) => ({
      name: d.name,
      amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
      preTax: d.preTax,
    }));

    // Calculate Jordan payroll rules (SSC + income tax)
    const calc = calculatePayroll(
      emp,
      recYear,
      recMonth,
      amounts,
      earnings,
      deductions,
      emp.claimsFamily || false,
      emp.extraExemption || 0,
      ruleSets
    );

    amounts.social_sec = calc.ssc;
    amounts.income_tax = calc.incomeTax;

    const payMethod = str(pick(r, 'payment method'));
    records.push({
      id: `${companyId}_${empId}_${recYear}_${recMonth}`,
      companyId,
      empId,
      name: emp.name,
      nameAr: emp.nameAr || '',
      title: emp.title || '',
      dept: emp.department || '',
      year: recYear,
      month: recMonth,
      payDate: toDateStr(pick(r, 'payment date')) || `${recYear}-${recMonth < 10 ? '0' + recMonth : recMonth}-28`,
      payMethod: (payMethod || 'Bank transfer') as any,
      currency: company?.currency || 'JOD',
      amounts,
      earnings,
      deductions,
      gross: calc.gross,
      totalDed: calc.totalDed,
      net: calc.net,
      notes: str(pick(r, 'notes')) || undefined,
      claimsFamily: emp.claimsFamily || false,
      extraExemption: emp.extraExemption || 0,
      autoCalc: true,
    });
  }

  return { records, errors };
}

/**
 * -------------------------------------------------------------
 * SCREEN 4: CLEARANCES IMPORT & EXPORT
 * -------------------------------------------------------------
 */

export function exportClearancesSheet(
  company: Company,
  clearances: Clearance[],
  employees: Employee[]
): Uint8Array {
  const wb = XLSX.utils.book_new();

  const rows = clearances.map((c) => {
    const emp = employees.find((e) => e.empId === c.empId);
    return {
      'Clearance ID': c.id,
      'Employee ID': c.empId,
      'Full Name': emp?.name || '',
      Department: emp?.department || '',
      'Hire Date': c.hireDate,
      'Last Working Day': c.lastDay,
      Reason: c.reason,
      'Service Years': c.serviceLength?.years || 0,
      'Service Months': c.serviceLength?.months || 0,
      'Service Days': c.serviceLength?.days || 0,
      'Monthly Wage': c.monthlyWage,
      'Days Worked in Last Month': c.daysWorked,
      'Accrued Leave Days': c.leaveDays,
      'Salary Due': c.dues?.salary_due || 0,
      'Leave Pay': c.dues?.leave_pay || 0,
      'Indemnity (Severance)': c.dues?.indemnity || 0,
      'Notice Pay': c.dues?.notice_pay || 0,
      'Total Dues': c.totalDues,
      'Social Security Deducted': c.deductions?.ssc || 0,
      'Tax Deducted': c.deductions?.income_tax || 0,
      'Loans Settled': c.deductions?.loans || 0,
      'Total Deductions': c.totalDeductions,
      'Net Settlement Payout': c.net,
      Status: c.status,
      Notes: c.notes || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Clearances');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}


/**
 * -------------------------------------------------------------
 * USERS EXPORT (password hashes are never exported)
 * -------------------------------------------------------------
 */
export function exportUsersSheet(users: User[], companies: Company[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const compMap = new Map(companies.map((c) => [c.id, c.name]));
  const rows = users.map((u) => ({
    Username: u.username,
    'Full Name': u.fullName,
    Role: u.role,
    Active: u.active ? 'Yes' : 'No',
    Companies: u.role === 'admin' ? 'All' : u.companyIds.map((id) => compMap.get(id) || id).join('; '),
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Users');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
