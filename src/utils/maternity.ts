/**
 * Maternity leave under Jordan's Labour Law and Social Security Law No. 1 of 2014.
 *
 *  - Leave: 70 days (10 weeks).
 *  - Allowance paid by SSC maternity insurance = (insured wage at start of leave / 30) × 70, paid at once.
 *  - Eligible if the insured woman has at least 6 contributions (continuous or not) in the 12 months
 *    before the leave and is at work in the month of birth.
 *  - SSC deducts her share of old-age + unemployment contributions (7.5%) from the allowance; the employer
 *    keeps paying its share of those insurances for the leave days (the leave counts as service).
 *  - When eligible the employer does not pay salary for the leave days; otherwise the employer pays the
 *    full wage for the leave as required by the Labour Law.
 */
import { Employee, MaternityLeave, PayrollRuleSet, SalaryAmounts, SalaryDeductionItem, SalaryRecord } from '../types';
import { employeeCoverage, ruleBranches, sscWageBase } from './ssc';

export const MATERNITY_LEAVE_DAYS = 70;
export const MATERNITY_MIN_CONTRIBUTIONS = 6;

const round2 = (n: number) => Math.floor(n * 100 + 0.5 + 1e-9) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function leaveEndDate(leave: MaternityLeave): string {
  return addDays(leave.startDate, Math.max(1, leave.days) - 1);
}

/** Leave days falling in each calendar month (capped at 30, payroll uses a 30-day month). */
export function leaveDaysByMonth(leave: MaternityLeave): { year: number; month: number; days: number; from: string; to: string }[] {
  if (!leave.startDate || !leave.days) return [];
  const end = leaveEndDate(leave);
  const out: { year: number; month: number; days: number; from: string; to: string }[] = [];
  let [y, m] = leave.startDate.split('-').map(Number);
  for (let guard = 0; guard < 24; guard++) {
    const first = `${y}-${pad2(m)}-01`;
    const last = `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}`;
    const from = leave.startDate > first ? leave.startDate : first;
    const to = end < last ? end : last;
    if (from > end) break;
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    out.push({ year: y, month: m, days: Math.min(30, days), from, to });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** The employee's regular monthly pay from the package (basic + fixed allowances + recurring allowances). */
export function packageAmounts(emp: Employee): { amounts: SalaryAmounts; monthlyWage: number; earnings: { name: string; amount: number; taxable: boolean; ssc: boolean }[] } {
  const basic = emp.package?.basic || 0;
  const amounts: SalaryAmounts = {
    basic,
    housing: emp.package?.housing || 0,
    transport: emp.package?.transport || 0,
    other_allow: emp.package?.other_allow || 0,
    overtime: 0,
    bonus: 0,
    other_earn: 0,
    social_sec: 0,
    income_tax: 0,
    other_ded: 0,
    advance: 0,
    unpaid_leave: 0,
  };
  const earnings = (emp.allowances || []).map((a) => ({
    name: a.name,
    amount: a.method === 'percent' ? round2((basic * a.value) / 100) : a.value,
    taxable: a.taxable,
    ssc: a.ssc,
  }));
  const monthlyWage = round2(
    amounts.basic + amounts.housing + amounts.transport + amounts.other_allow + earnings.reduce((s, e) => s + e.amount, 0)
  );
  return { amounts, monthlyWage, earnings };
}

export interface MaternityEligibility {
  eligible: boolean;
  reason: string;
  contributions: number;
}

/** Checks the SSC conditions (or uses the manual decision saved on the leave). */
export function maternityEligibility(
  emp: Employee,
  leave: MaternityLeave,
  records: SalaryRecord[],
  rs: PayrollRuleSet | null
): MaternityEligibility {
  const [sy, sm] = leave.startDate.split('-').map(Number);
  // The 12 calendar months before the month the leave starts.
  const leaveMonth = sy * 12 + sm;
  const contributions = records.filter((r) => {
    if (r.empId !== emp.empId || r.companyId !== emp.companyId) return false;
    const idx = r.year * 12 + r.month;
    return idx >= leaveMonth - 12 && idx <= leaveMonth - 1 && (r.amounts.social_sec || 0) > 0;
  }).length;

  if (leave.eligibility === 'eligible') return { eligible: true, reason: 'Marked eligible manually.', contributions };
  if (leave.eligibility === 'not_eligible')
    return { eligible: false, reason: 'Marked not eligible manually — employer pays the full wage.', contributions };

  if (!rs || !(ruleBranches(rs).employer.maternity > 0)) {
    return { eligible: false, reason: 'SSC maternity insurance did not exist in this period (it started in May 2010).', contributions };
  }
  if (employeeCoverage(emp) !== 'full') {
    return { eligible: false, reason: 'Employee is not covered by all SSC insurances.', contributions };
  }
  if (emp.gender === 'male') {
    return { eligible: false, reason: 'Employee is recorded as male.', contributions };
  }
  if (contributions >= MATERNITY_MIN_CONTRIBUTIONS) {
    return { eligible: true, reason: `${contributions} SSC contributions in the 12 months before the leave (6 required).`, contributions };
  }
  // Salary history may not be in the system yet: fall back to the hire date.
  const sixMonthsBefore = addDays(leave.startDate, -183);
  if (emp.hireDate && emp.hireDate <= sixMonthsBefore) {
    return {
      eligible: true,
      reason: `Only ${contributions} salary record(s) found in the system, but she was hired on ${emp.hireDate} (6+ months before the leave). Confirm her contributions with SSC.`,
      contributions,
    };
  }
  return {
    eligible: false,
    reason: `Only ${contributions} SSC contribution(s) in the 12 months before the leave — 6 are required. Employer pays the full wage.`,
    contributions,
  };
}

export interface MaternityAllowance {
  insuredWage: number;
  dailyWage: number;
  days: number;
  gross: number; // paid by SSC before deductions
  employeeShare: number; // 7.5% deducted by SSC from the allowance
  net: number;
  employerShare: number; // employer's old-age + unemployment share for the leave days
  employeeRate: number;
  employerRate: number;
}

export function maternityAllowance(emp: Employee, leave: MaternityLeave, rs: PayrollRuleSet | null): MaternityAllowance {
  const { amounts, earnings } = packageAmounts(emp);
  let insuredWage = sscWageBase(emp, amounts, earnings);
  if (rs) {
    const ceiling = emp.sscInsuredBefore2010 && rs.sscLegacyCeiling ? rs.sscLegacyCeiling : rs.sscCeiling || 0;
    if (ceiling > 0) insuredWage = Math.min(insuredWage, ceiling);
  }
  const br = rs ? ruleBranches(rs) : null;
  const employeeRate = br ? br.employee.oldAge + br.employee.unemployment : 0.075;
  const employerRate = br ? br.employer.oldAge + br.employer.unemployment : 0.115;
  const dailyWage = insuredWage / 30;
  const gross = round2(dailyWage * leave.days);
  const employeeShare = round2(gross * employeeRate);
  return {
    insuredWage: round2(insuredWage),
    dailyWage: round2(dailyWage),
    days: leave.days,
    gross,
    employeeShare,
    net: round2(gross - employeeShare),
    employerShare: round2(gross * employerRate),
    employeeRate,
    employerRate,
  };
}

/**
 * Salary deduction for maternity leave days in a payroll month (only when SSC pays the allowance).
 * Marked with maternityDays so SSC and tax are calculated on the days actually worked.
 */
export function maternityDeductionFor(
  emp: Employee,
  year: number,
  month: number,
  records: SalaryRecord[],
  getRules: (y: number, m: number) => PayrollRuleSet | null
): SalaryDeductionItem | null {
  let days = 0;
  for (const leave of emp.maternityLeaves || []) {
    const inMonth = leaveDaysByMonth(leave).find((p) => p.year === year && p.month === month);
    if (!inMonth) continue;
    const [sy, sm] = leave.startDate.split('-').map(Number);
    if (!maternityEligibility(emp, leave, records, getRules(sy, sm)).eligible) continue;
    days += inMonth.days;
  }
  days = Math.min(30, days);
  if (days <= 0) return null;
  const { monthlyWage } = packageAmounts(emp);
  return {
    name: `Maternity leave — paid by SSC (${days} day${days === 1 ? '' : 's'})`,
    amount: round2((monthlyWage / 30) * days),
    preTax: true,
    maternityDays: days,
  };
}
