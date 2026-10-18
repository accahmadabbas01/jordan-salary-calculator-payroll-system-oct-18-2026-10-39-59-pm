import {
  Employee,
  PayrollRuleSet,
  SalaryAmounts,
  SalaryEarningItem,
  SalaryDeductionItem,
  ClearanceReason,
} from '../types';

export const DEFAULT_RULE_SETS: PayrollRuleSet[] = [
  {
    from: '2026-01-01',
    name: 'Jordan payroll rules 2026',
    sscRate: 0.075,
    sscEmployerRate: 0.1425,
    sscCeiling: 3733,
    personalExemption: 9000,
    familyExemption: 9000,
    documentedExpensesMax: 5000,
    totalExemptionsCeiling: 23000,
    brackets: [
      { limit: 5000, rate: 0.05 },
      { limit: 10000, rate: 0.10 },
      { limit: 15000, rate: 0.15 },
      { limit: 20000, rate: 0.20 },
      { limit: 1000000, rate: 0.25 },
      { limit: Infinity, rate: 0.30 },
    ],
  },
  {
    from: '2025-01-01',
    name: 'Jordan payroll rules 2025',
    sscRate: 0.075,
    sscEmployerRate: 0.1425,
    sscCeiling: 3668,
    personalExemption: 9000,
    familyExemption: 9000,
    documentedExpensesMax: 5000,
    totalExemptionsCeiling: 23000,
    brackets: [
      { limit: 5000, rate: 0.05 },
      { limit: 10000, rate: 0.10 },
      { limit: 15000, rate: 0.15 },
      { limit: 20000, rate: 0.20 },
      { limit: 1000000, rate: 0.25 },
      { limit: Infinity, rate: 0.30 },
    ],
  },
];

export const ARABIC_MONTHS = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

export const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getMonthName(month: number, lang: 'en' | 'ar' = 'en'): string {
  const index = Math.max(1, Math.min(12, month)) - 1;
  return lang === 'ar' ? ARABIC_MONTHS[index] : ENGLISH_MONTHS[index];
}

/**
 * Exact half-up rounding (0.005 -> 0.01)
 */
export function roundHalfUp(num: number, decimals: number = 2): number {
  if (isNaN(num) || !isFinite(num)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.floor(num * factor + 0.5 + 1e-12) / factor;
}

/**
 * Format currency with 2 decimal places and thousands separator
 */
export function formatCurrency(num: number, currency: string = 'JOD'): string {
  const rounded = roundHalfUp(num, 2);
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Format number with 3 decimal places (fils) for ISTD
 */
export function formatFils(num: number): string {
  const rounded = roundHalfUp(num, 3);
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/**
 * Parse input string handling Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩), comma, Arabic decimal comma
 */
export function parseArabicIndicNumber(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  
  let s = String(val).trim();
  // Map Arabic-Indic digits
  const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    s = s.split(arabicIndic[i]).join(String(i));
  }
  // Replace Arabic decimal separator ٫ (U+066B) with .
  s = s.replace(/٫/g, '.');
  // Remove Arabic thousands separator ٬ (U+066C) and Latin comma
  s = s.replace(/٬/g, '').replace(/,/g, '');
  // Remove currency signs or extra spaces
  s = s.replace(/[^\d.-]/g, '');

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Find the applicable rule set for a given month and year
 */
export function getRuleSetForPeriod(
  year: number,
  month: number,
  ruleSets: PayrollRuleSet[] = DEFAULT_RULE_SETS
): PayrollRuleSet | null {
  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const periodDate = `${year}-${monthStr}-01`;

  // Sort descending by 'from'
  const sorted = [...ruleSets].sort((a, b) => b.from.localeCompare(a.from));
  for (const set of sorted) {
    if (set.from <= periodDate) {
      return set;
    }
  }
  return null;
}

export interface CalculationResult {
  ssc: number;
  incomeTax: number;
  gross: number;
  totalDed: number;
  net: number;
  sscBase: number;
  sscInsured: number;
  sscEmployer: number;
  sscTotalRemittance: number;
  companyTotalStatutoryRemittance: number;
  companyTotalCost: number;
  sscExplanation: string;
  taxExplanation: string;
  ruleSetName: string;
  ruleAvailable: boolean;
}

/**
 * Calculate Social Security and Income Tax under Jordan Payroll Rules
 */
export function calculatePayroll(
  employee: Employee,
  year: number,
  month: number,
  amounts: SalaryAmounts,
  earnings: SalaryEarningItem[],
  deductions: SalaryDeductionItem[],
  claimsFamily?: boolean,
  extraExemption?: number,
  customRuleSets?: PayrollRuleSet[]
): CalculationResult {
  const ruleSet = getRuleSetForPeriod(year, month, customRuleSets);
  
  const hasClaimsFamily = claimsFamily !== undefined ? claimsFamily : !!employee.claimsFamily;
  const exemptionExtra = extraExemption !== undefined ? extraExemption : (employee.extraExemption || 0);

  // 1. Gross calculation
  const baseEarnings =
    (amounts.basic || 0) +
    (amounts.housing || 0) +
    (amounts.transport || 0) +
    (amounts.other_allow || 0) +
    (amounts.overtime || 0) +
    (amounts.bonus || 0) +
    (amounts.other_earn || 0);
  
  const additionalEarningsTotal = earnings.reduce((acc, item) => acc + (item.amount || 0), 0);
  const gross = roundHalfUp(baseEarnings + additionalEarningsTotal, 2);

  if (!ruleSet) {
    // No rules for this period
    const totalDedWithoutAuto =
      (amounts.social_sec || 0) +
      (amounts.income_tax || 0) +
      (amounts.other_ded || 0) +
      (amounts.advance || 0) +
      (amounts.unpaid_leave || 0) +
      deductions.reduce((acc, item) => acc + (item.amount || 0), 0);
    const net = roundHalfUp(gross - totalDedWithoutAuto, 2);
    const ssc = amounts.social_sec || 0;
    const incomeTax = amounts.income_tax || 0;
    const sscEmployer = roundHalfUp(ssc * (0.1425 / 0.075), 2);
    const sscTotalRemittance = roundHalfUp(ssc + sscEmployer, 2);
    const companyTotalStatutoryRemittance = roundHalfUp(sscTotalRemittance + incomeTax, 2);
    const companyTotalCost = roundHalfUp(gross + sscEmployer, 2);

    return {
      ssc,
      incomeTax,
      gross,
      totalDed: roundHalfUp(totalDedWithoutAuto, 2),
      net,
      sscBase: 0,
      sscInsured: 0,
      sscEmployer,
      sscTotalRemittance,
      companyTotalStatutoryRemittance,
      companyTotalCost,
      sscExplanation: `No payroll rules configured for ${year}-${month}. Manual entry required.`,
      taxExplanation: `No payroll rules configured for ${year}-${month}. Manual entry required.`,
      ruleSetName: 'None',
      ruleAvailable: false,
    };
  }

  // 2. Social Security calculation (employee share + employer share)
  let sscBase = 0;
  let sscInsured = 0;
  let ssc = 0;
  let sscEmployer = 0;
  let sscExplanation = '';

  const employerRate = ruleSet.sscEmployerRate || 0.1425;

  if (employee.sscExempt) {
    ssc = 0;
    sscEmployer = 0;
    sscExplanation = 'Employee is exempt from Social Security (0.00).';
  } else if (employee.sscWage && employee.sscWage > 0) {
    sscBase = employee.sscWage;
    sscInsured = Math.min(Math.max(sscBase, 0), ruleSet.sscCeiling);
    ssc = roundHalfUp(sscInsured * ruleSet.sscRate, 2);
    sscEmployer = roundHalfUp(sscInsured * employerRate, 2);
    sscExplanation = `Social Security: insured wage ${formatCurrency(sscInsured, '')} × 7.5% (employee) = ${formatCurrency(ssc, '')} | Company share: 14.25% = ${formatCurrency(sscEmployer, '')} (Total SSC: ${formatCurrency(ssc + sscEmployer, '')}).`;
  } else {
    const sscAdditionalAllowances = earnings
      .filter((e) => e.ssc)
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    
    sscBase =
      (amounts.basic || 0) +
      (amounts.housing || 0) +
      (amounts.transport || 0) +
      (amounts.other_allow || 0) +
      sscAdditionalAllowances -
      (amounts.unpaid_leave || 0);

    sscBase = Math.max(sscBase, 0);
    sscInsured = Math.min(sscBase, ruleSet.sscCeiling);
    ssc = roundHalfUp(sscInsured * ruleSet.sscRate, 2);
    sscEmployer = roundHalfUp(sscInsured * employerRate, 2);
    
    const ceilingNote = sscBase > ruleSet.sscCeiling ? ` (capped at ceiling ${formatCurrency(ruleSet.sscCeiling, '')})` : '';
    sscExplanation = `Social Security: wage base ${formatCurrency(sscBase, '')}${ceilingNote} × 7.5% (employee) = ${formatCurrency(ssc, '')} | Company share: 14.25% = ${formatCurrency(sscEmployer, '')} (Total SSC: ${formatCurrency(ssc + sscEmployer, '')}).`;
  }

  // 3. Income Tax calculation
  const taxableEarningsAdditional = earnings
    .filter((e) => e.taxable)
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  
  const preTaxDeductions = deductions
    .filter((d) => d.preTax)
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const monthlyTaxableBase =
    baseEarnings +
    taxableEarningsAdditional -
    (amounts.unpaid_leave || 0) -
    preTaxDeductions;

  const annualIncome = Math.max(monthlyTaxableBase, 0) * 12;
  const exemptions = Math.min(
    ruleSet.personalExemption +
      (hasClaimsFamily ? ruleSet.familyExemption : 0) +
      Math.min(exemptionExtra, ruleSet.documentedExpensesMax),
    ruleSet.totalExemptionsCeiling
  );

  const annualTaxableIncome = Math.max(annualIncome - ssc * 12 - exemptions, 0);

  // Progressive bracket calculation
  let remainingTaxable = annualTaxableIncome;
  let annualTax = 0;
  for (let i = 0; i < ruleSet.brackets.length; i++) {
    const bracket = ruleSet.brackets[i];
    const prevLimit = i === 0 ? 0 : ruleSet.brackets[i - 1].limit;
    const bracketWidth = bracket.limit - prevLimit;
    if (remainingTaxable <= 0) break;
    const taxableInBracket = Math.min(remainingTaxable, bracketWidth);
    annualTax += taxableInBracket * bracket.rate;
    remainingTaxable -= taxableInBracket;
  }

  const incomeTax = roundHalfUp(annualTax / 12, 2);
  const taxExplanation = `Income tax: annual taxable income ${formatCurrency(annualTaxableIncome, '')} (annual gross ${formatCurrency(annualIncome, '')} - SSC ${formatCurrency(ssc * 12, '')} - exemptions ${formatCurrency(exemptions, '')}) → annual tax ${formatCurrency(annualTax, '')} / 12 = ${formatCurrency(incomeTax, '')}.`;

  // 4. Total deductions & Net
  const otherDeductionsTotal =
    (amounts.other_ded || 0) +
    (amounts.advance || 0) +
    (amounts.unpaid_leave || 0) +
    deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

  const totalDed = roundHalfUp(ssc + incomeTax + otherDeductionsTotal, 2);
  const net = roundHalfUp(gross - totalDed, 2);

  // 5. Statutory Company Remittance & True Cost
  const sscTotalRemittance = roundHalfUp(ssc + sscEmployer, 2);
  const companyTotalStatutoryRemittance = roundHalfUp(sscTotalRemittance + incomeTax, 2);
  const companyTotalCost = roundHalfUp(gross + sscEmployer, 2);

  return {
    ssc,
    incomeTax,
    gross,
    totalDed,
    net,
    sscBase,
    sscInsured,
    sscEmployer,
    sscTotalRemittance,
    companyTotalStatutoryRemittance,
    companyTotalCost,
    sscExplanation,
    taxExplanation,
    ruleSetName: ruleSet.name,
    ruleAvailable: true,
  };
}

/**
 * Check if employee is employed in a given month (Section 6.5)
 */
export function isEmployedInMonth(employee: Employee, year: number, month: number): boolean {
  if (employee.status === 'resigned' && !employee.endDate) {
    return false;
  }

  const monthStr = month < 10 ? `0${month}` : `${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = `${year}-${monthStr}-01`;
  const lastDayOfMonth = `${year}-${monthStr}-${daysInMonth < 10 ? `0${daysInMonth}` : daysInMonth}`;

  // hireDate <= last day of M
  if (employee.hireDate && employee.hireDate > lastDayOfMonth) {
    return false;
  }

  // endDate >= first day of M
  if (employee.endDate && employee.endDate < firstDayOfMonth) {
    return false;
  }

  return true;
}

/**
 * Service length calculation from hireDate to lastDay inclusive (Section 10 & 13)
 * Example 1: 2020-03-01 -> 2026-10-15 = 6 years, 7 months, 15 days (2,420 days)
 * Example 2: 2026-01-31 -> 2026-03-01 = 0 y, 1 m, 2 d (30 days)
 */
export function calculateServiceLength(
  hireDateStr: string,
  lastDayStr: string
): { years: number; months: number; days: number; totalDays: number } {
  if (!hireDateStr || !lastDayStr) {
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }

  const [hY, hM, hD] = hireDateStr.split('-').map(Number);
  const [lY, lM, lD] = lastDayStr.split('-').map(Number);

  // Inclusive: end date is lastDay + 1 day
  const endTarget = new Date(Date.UTC(lY, lM - 1, lD + 1));
  const start = new Date(Date.UTC(hY, hM - 1, hD));

  const totalDays = Math.max(
    0,
    Math.round((endTarget.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );

  let curY = hY;
  let curM = hM;
  let curD = hD;

  let years = 0;
  // Step whole years
  while (true) {
    const nextY = curY + 1;
    // clamp day if leap year / month length differs
    const maxDays = new Date(Date.UTC(nextY, curM, 0)).getUTCDate();
    const targetDay = Math.min(curD, maxDays);
    const nextDate = new Date(Date.UTC(nextY, curM - 1, targetDay));
    if (nextDate.getTime() <= endTarget.getTime()) {
      curY = nextY;
      years++;
    } else {
      break;
    }
  }

  let months = 0;
  // Step whole months
  while (true) {
    let nextY = curY;
    let nextM = curM + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    const maxDays = new Date(Date.UTC(nextY, nextM, 0)).getUTCDate();
    const targetDay = Math.min(hD, maxDays);
    const nextDate = new Date(Date.UTC(nextY, nextM - 1, targetDay));
    if (nextDate.getTime() <= endTarget.getTime()) {
      curY = nextY;
      curM = nextM;
      months++;
    } else {
      break;
    }
  }

  // Remaining days
  const maxDays = new Date(Date.UTC(curY, curM, 0)).getUTCDate();
  const clampedDay = Math.min(hD, maxDays);
  const curDate = new Date(Date.UTC(curY, curM - 1, clampedDay));
  const remainingDays = Math.max(
    0,
    Math.round((endTarget.getTime() - curDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    years,
    months,
    days: remainingDays,
    totalDays,
  };
}

/**
 * Split Arabic name for ISTD QP 177-F3
 * 1 word -> first
 * 2 words -> first + family
 * 3 words -> first, father, family
 * 4+ words -> first, father, middle words as grandfather, last as family
 */
export function splitArabicName(nameAr: string): {
  first: string;
  father: string;
  grandfather: string;
  family: string;
} {
  const parts = (nameAr || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: '', father: '', grandfather: '', family: '' };
  }
  if (parts.length === 1) {
    return { first: parts[0], father: '', grandfather: '', family: '' };
  }
  if (parts.length === 2) {
    return { first: parts[0], father: '', grandfather: '', family: parts[1] };
  }
  if (parts.length === 3) {
    return { first: parts[0], father: parts[1], grandfather: '', family: parts[2] };
  }
  const first = parts[0];
  const father = parts[1];
  const family = parts[parts.length - 1];
  const grandfather = parts.slice(2, parts.length - 1).join(' ');
  return { first, father, grandfather, family };
}

/**
 * Calculate Clearance (Final Settlement) - Section 10
 */
export interface ClearanceCalculationInput {
  employee: Employee;
  hireDate: string;
  lastDay: string;
  reason: ClearanceReason;
  daysWorked: number;
  leaveDays: number;
  indemnityMonths: number;
  indemnityBasis: 'wage' | 'basic';
  noticeMonths: number;
  deductLoans: boolean;
  unsettledLoanBalance: number;
  hasExistingMonthRecord: boolean;
  customDues?: {
    salary_due?: number;
    leave_pay?: number;
    indemnity?: number;
    notice_pay?: number;
    other_dues?: number;
  };
  customDeductions?: {
    ssc?: number;
    income_tax?: number;
    loans?: number;
    notice_deduction?: number;
    other_deductions?: number;
  };
  customRuleSets?: PayrollRuleSet[];
}

export function calculateClearanceAmounts(input: ClearanceCalculationInput) {
  const {
    employee,
    hireDate,
    lastDay,
    daysWorked,
    leaveDays,
    indemnityMonths,
    indemnityBasis,
    noticeMonths,
    deductLoans,
    unsettledLoanBalance,
    customDues,
    customDeductions,
    customRuleSets,
  } = input;

  const service = calculateServiceLength(hireDate, lastDay);

  // Resolved monthly package wage
  const basic = employee.package?.basic || 0;
  const housing = employee.package?.housing || 0;
  const transport = employee.package?.transport || 0;
  const other_allow = employee.package?.other_allow || 0;

  const recurringAllowancesTotal = (employee.allowances || []).reduce((sum, a) => {
    const amt = a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value;
    return sum + (amt > 0 ? amt : 0);
  }, 0);

  const monthlyWage = roundHalfUp(basic + housing + transport + other_allow + recurringAllowancesTotal, 2);
  const daily = roundHalfUp(monthlyWage / 30, 2);

  // 1. Dues
  const autoSalaryDue = roundHalfUp(daysWorked >= 30 ? monthlyWage : (monthlyWage * daysWorked) / 30, 2);
  const salary_due = customDues?.salary_due !== undefined ? customDues.salary_due : autoSalaryDue;

  const autoLeavePay = roundHalfUp(daily * leaveDays, 2);
  const leave_pay = customDues?.leave_pay !== undefined ? customDues.leave_pay : autoLeavePay;

  const basisAmount = indemnityBasis === 'basic' ? basic : monthlyWage;
  const serviceFraction = service.years + service.months / 12 + service.days / 365;
  const autoIndemnity = roundHalfUp(serviceFraction * indemnityMonths * basisAmount, 2);
  const indemnity = customDues?.indemnity !== undefined ? customDues.indemnity : autoIndemnity;

  const autoNoticePay = roundHalfUp(noticeMonths * monthlyWage, 2);
  const notice_pay = customDues?.notice_pay !== undefined ? customDues.notice_pay : autoNoticePay;

  const other_dues = customDues?.other_dues || 0;

  // 2. Deductions
  const lastDayDate = new Date(lastDay);
  const lYear = lastDayDate.getFullYear() || new Date().getFullYear();
  const lMonth = (lastDayDate.getMonth() + 1) || (new Date().getMonth() + 1);

  // Base month SSC & tax
  const dummyAmounts: SalaryAmounts = {
    basic,
    housing,
    transport,
    other_allow,
    overtime: 0,
    bonus: 0,
    other_earn: 0,
    social_sec: 0,
    income_tax: 0,
    other_ded: 0,
    advance: 0,
    unpaid_leave: 0,
  };
  const dummyEarnings: SalaryEarningItem[] = (employee.allowances || []).map((a) => ({
    name: a.name,
    amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
    taxable: a.taxable,
    ssc: a.ssc,
  }));
  const dummyDeductions: SalaryDeductionItem[] = (employee.deductions || []).map((d) => ({
    name: d.name,
    amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
    preTax: d.preTax,
  }));

  const baseMonthPayroll = calculatePayroll(
    employee,
    lYear,
    lMonth,
    dummyAmounts,
    dummyEarnings,
    dummyDeductions,
    undefined,
    undefined,
    customRuleSets
  );

  const part = daysWorked >= 30 ? 1 : daysWorked / 30;
  const autoSsc = roundHalfUp(baseMonthPayroll.ssc * part, 2);
  const ssc = customDeductions?.ssc !== undefined ? customDeductions.ssc : autoSsc;

  // Income tax calculation for clearance:
  // income_tax = monthTax(0) * part + (lump > 0 ? (monthTax(lump) - monthTax(0)) * 12 : 0)
  // lump = leave_pay + notice_pay; monthTax(x) = tax of package with other_earn += x/12
  const lump = roundHalfUp(leave_pay + notice_pay, 2);
  let autoTax = 0;
  if (lump > 0) {
    const taxWithLump = calculatePayroll(
      employee,
      lYear,
      lMonth,
      { ...dummyAmounts, other_earn: roundHalfUp(lump / 12, 2) },
      dummyEarnings,
      dummyDeductions,
      undefined,
      undefined,
      customRuleSets
    );
    const taxDiff = Math.max(taxWithLump.incomeTax - baseMonthPayroll.incomeTax, 0);
    autoTax = roundHalfUp(baseMonthPayroll.incomeTax * part + taxDiff * 12, 2);
  } else {
    autoTax = roundHalfUp(baseMonthPayroll.incomeTax * part, 2);
  }
  const income_tax = customDeductions?.income_tax !== undefined ? customDeductions.income_tax : autoTax;

  const autoLoans = deductLoans ? unsettledLoanBalance : 0;
  const loans = customDeductions?.loans !== undefined ? customDeductions.loans : autoLoans;

  const notice_deduction = customDeductions?.notice_deduction || 0;
  const other_deductions = customDeductions?.other_deductions || 0;

  const totalDues = roundHalfUp(salary_due + leave_pay + indemnity + notice_pay + other_dues, 2);
  const totalDeductions = roundHalfUp(ssc + income_tax + loans + notice_deduction + other_deductions, 2);
  const net = roundHalfUp(totalDues - totalDeductions, 2);

  return {
    monthlyWage,
    basic,
    service,
    dues: {
      salary_due,
      leave_pay,
      indemnity,
      notice_pay,
      other_dues,
    },
    deductions: {
      ssc,
      income_tax,
      loans,
      notice_deduction,
      other_deductions,
    },
    totalDues,
    totalDeductions,
    net,
    autoValues: {
      salary_due: autoSalaryDue,
      leave_pay: autoLeavePay,
      indemnity: autoIndemnity,
      notice_pay: autoNoticePay,
      ssc: autoSsc,
      income_tax: autoTax,
      loans: autoLoans,
    },
  };
}
