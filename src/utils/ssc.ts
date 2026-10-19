/**
 * Jordan Social Security (SSC) contribution rules.
 */
import {
  Employee,
  PayrollRuleSet,
  SalaryAmounts,
  SalaryEarningItem,
  SalaryRecord,
  SscBranchRates,
  SscCoverage,
} from '../types';

const round2 = (n: number) => Math.floor(n * 100 + 0.5 + 1e-9) / 100;

export const SSC_BRANCH_LABELS: Record<keyof SscBranchRates, { en: string; ar: string }> = {
  oldAge: { en: 'Old age, disability & death', ar: 'الشيخوخة والعجز والوفاة' },
  workInjury: { en: 'Work injury', ar: 'إصابات العمل' },
  maternity: { en: 'Maternity', ar: 'الأمومة' },
  unemployment: { en: 'Unemployment', ar: 'التعطل عن العمل' },
};

export const SSC_COVERAGE_LABELS: Record<SscCoverage, string> = {
  full: 'All insurances (standard)',
  injury_only: 'Work injury only (e.g. old-age pensioner past retirement age)',
  exempt: 'Not subject to Social Security',
};

/** Retirement age for old-age pension: 60 for men, 55 for women. */
export const RETIREMENT_AGE = { male: 60, female: 55 };
export const YOUTH_AGE_LIMIT = 30;

export function employeeCoverage(emp: Employee): SscCoverage {
  if (emp.sscExempt) return 'exempt';
  return emp.sscCoverage || 'full';
}

/** Age in whole years on the last day of the given month. */
export function ageAt(birthDate: string | undefined, year: number, month: number): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  if (!by || !bm) return null;
  const lastDay = new Date(year, month, 0).getDate();
  let age = year - by;
  if (month < bm || (month === bm && lastDay < (bd || 1))) age--;
  return age;
}

/** Branch rates for a rule set, deriving them for older stored rule sets that only have totals. */
export function ruleBranches(rs: PayrollRuleSet): { employee: SscBranchRates; employer: SscBranchRates } {
  if (rs.sscEmployee && rs.sscEmployer) return { employee: rs.sscEmployee, employer: rs.sscEmployer };
  const injury = Math.min(0.02, rs.sscEmployerRate || 0);
  return {
    employee: { oldAge: rs.sscRate || 0, workInjury: 0, maternity: 0, unemployment: 0 },
    employer: { oldAge: (rs.sscEmployerRate || 0) - injury, workInjury: injury, maternity: 0, unemployment: 0 },
  };
}

/** Wage subject to SSC before the ceiling: the registered insured wage, or the regular pay items. */
export function sscWageBase(emp: Employee, amounts: SalaryAmounts, earnings: SalaryEarningItem[]): number {
  if (emp.sscWage && emp.sscWage > 0) return emp.sscWage;
  const extra = earnings.filter((e) => e.ssc).reduce((s, e) => s + (e.amount || 0), 0);
  return Math.max(
    (amounts.basic || 0) +
      (amounts.housing || 0) +
      (amounts.transport || 0) +
      (amounts.other_allow || 0) +
      extra -
      (amounts.unpaid_leave || 0),
    0
  );
}

export interface SscResult {
  coverage: SscCoverage;
  base: number;
  ceiling: number; // 0 = none
  insured: number;
  employee: number;
  employer: number;
  employeeRates: SscBranchRates;
  employerRates: SscBranchRates;
  youthReductionApplied: number; // fraction of employer old-age share removed
  notes: string[];
  explanation: string;
}

const ZERO: SscBranchRates = { oldAge: 0, workInjury: 0, maternity: 0, unemployment: 0 };
const sum = (b: SscBranchRates) => b.oldAge + b.workInjury + b.maternity + b.unemployment;
const pct = (r: number) => `${(Math.round(r * 10000) / 100).toString()}%`;
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function computeSsc(
  emp: Employee,
  year: number,
  month: number,
  base: number,
  rs: PayrollRuleSet
): SscResult {
  const coverage = employeeCoverage(emp);
  const notes: string[] = [];
  const rates = ruleBranches(rs);
  const age = ageAt(emp.birthDate, year, month);

  const ceiling = emp.sscInsuredBefore2010 && rs.sscLegacyCeiling ? rs.sscLegacyCeiling : rs.sscCeiling || 0;
  const insured = coverage === 'exempt' ? 0 : ceiling > 0 ? Math.min(base, ceiling) : base;

  let employeeRates: SscBranchRates = ZERO;
  let employerRates: SscBranchRates = ZERO;
  let youthReductionApplied = 0;

  if (coverage === 'full') {
    employeeRates = { ...rates.employee };
    employerRates = { ...rates.employer };

    const youth = emp.sscYouthReduction && emp.sscYouthReduction !== 'none' ? emp.sscYouthReduction : null;
    if (youth) {
      if (!rs.sscYouthReduction) {
        notes.push('Youth old-age reduction (Regulation 45/2024) does not exist in this period — not applied.');
      } else if (emp.nationality === 'non_jordanian') {
        notes.push('Youth old-age reduction applies to Jordanians only — not applied.');
      } else if (age !== null && age >= YOUTH_AGE_LIMIT) {
        notes.push(`Employee is ${age}; the youth reduction stops at age ${YOUTH_AGE_LIMIT} — not applied.`);
      } else {
        youthReductionApplied = rs.sscYouthReduction[youth];
        employerRates.oldAge = employerRates.oldAge * (1 - youthReductionApplied);
        notes.push(
          `Youth reduction (${youth === 'small' ? 'small establishment' : 'medium establishment'}): employer old-age share cut by ${pct(
            youthReductionApplied
          )} to ${pct(employerRates.oldAge)}.`
        );
        if (age === null) notes.push('Add a date of birth so the reduction stops automatically at age 30.');
      }
    }

    if (age !== null && emp.gender) {
      const retire = RETIREMENT_AGE[emp.gender];
      if (age >= retire) {
        notes.push(
          `Employee is ${age} (retirement age ${retire}). If they are entitled to an old-age pension, set SSC coverage to "Work injury only".`
        );
      }
    }
  } else if (coverage === 'injury_only') {
    employerRates = { ...ZERO, workInjury: rates.employer.workInjury };
  }

  const employee = round2(insured * sum(employeeRates));
  const employer = round2(insured * sum(employerRates));

  if (coverage !== 'exempt' && rs.minimumWage && insured > 0 && insured < rs.minimumWage) {
    notes.push(
      `Insured wage ${money(insured)} is below the minimum wage of ${money(rs.minimumWage)} JOD; SSC normally requires at least the minimum wage.`
    );
  }
  if (emp.sscInsuredBefore2010 && rs.sscLegacyCeiling) {
    notes.push(`Insured before 1 May 2010: ceiling ${money(rs.sscLegacyCeiling)} JOD applies.`);
  }

  let explanation: string;
  if (coverage === 'exempt') {
    explanation = 'Employee is not subject to Social Security (0.00).';
  } else {
    const capNote = ceiling > 0 && base > ceiling ? ` (capped at ceiling ${money(ceiling)})` : '';
    const prefix = coverage === 'injury_only' ? 'Social Security — work injury only: ' : 'Social Security: ';
    explanation =
      `${prefix}insured wage ${money(base)}${capNote} × ${pct(sum(employeeRates))} employee = ${money(employee)} | ` +
      `employer ${pct(sum(employerRates))} = ${money(employer)} (total ${money(employee + employer)}).`;
  }
  if (notes.length) explanation += ' ' + notes.join(' ');

  return {
    coverage,
    base,
    ceiling,
    insured,
    employee,
    employer,
    employeeRates,
    employerRates,
    youthReductionApplied,
    notes,
    explanation,
  };
}

/**
 * Employer SSC share for a saved salary record, using the rules for that record's month.
 * Used by statutory reports so they follow the same rules as payroll.
 */
export function recordSsc(
  emp: Employee | undefined,
  record: SalaryRecord,
  rs: PayrollRuleSet | null
): { insured: number; employee: number; employer: number } {
  const employeeShare = record.amounts.social_sec || 0;
  if (!rs || !emp) {
    const base =
      (record.amounts.basic || 0) +
      (record.amounts.housing || 0) +
      (record.amounts.transport || 0) +
      (record.amounts.other_allow || 0);
    return { insured: base, employee: employeeShare, employer: round2(base * 0.1425) };
  }
  const r = computeSsc(emp, record.year, record.month, sscWageBase(emp, record.amounts, record.earnings || []), rs);
  return { insured: r.insured, employee: employeeShare, employer: r.employer };
}
