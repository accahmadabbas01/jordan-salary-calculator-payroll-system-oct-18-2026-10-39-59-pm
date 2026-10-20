/**
 * Jordan payroll rules by period: Social Security (SSC) and income tax.
 *
 * Social Security (Law No. 1 of 2014 and earlier laws):
 *  - Branches: old age/disability/death, work injury (employer only), maternity (employer only,
 *    from 1 May 2010), unemployment (employee 1% + employer 0.5%, from 1 May 2010).
 *  - Old-age shares phased in from 2014: employer 9% -> 11% (+0.5%/yr), employee 5.5% -> 6.5% (+0.25%/yr),
 *    reaching 11% / 6.5% on 1 Jan 2017. Totals since 2017: employee 7.5%, employer 14.25%.
 *  - Monthly wage ceiling, indexed to inflation each year. People insured before 1 May 2010 keep a
 *    5,000 JOD ceiling.
 *  - High-risk occupations (from 2014): employer pays an extra 1% (employer 15.25%, employee 7.5%).
 *  - Regulation 45/2024: employer old-age share reduced 40% (small, <=25 staff) or 30% (medium, 26-50)
 *    for Jordanians under 30 insured for the first time.
 *
 * Income tax: Temporary Law 28/2009 (2010-2014), Law 34/2014 (2015-2018), Law 38/2018 (2019 on),
 * including the 1% national contribution on annual taxable income above 200,000 JOD.
 */
import { PayrollRuleSet, SscBranchRates, TaxBracket } from '../types';

const branches = (oldAge: number, workInjury: number, maternity: number, unemployment: number): SscBranchRates => ({
  oldAge,
  workInjury,
  maternity,
  unemployment,
});
const total = (b: SscBranchRates) => Math.round((b.oldAge + b.workInjury + b.maternity + b.unemployment) * 1e6) / 1e6;

// --- Social Security periods ---------------------------------------------------------------
const SSC_PRE_2010 = { employee: branches(0.055, 0, 0, 0), employer: branches(0.09, 0.02, 0, 0) };
const SSC_2010 = { employee: branches(0.055, 0, 0, 0.01), employer: branches(0.09, 0.02, 0.0075, 0.005) };
const SSC_2014 = { employee: branches(0.0575, 0, 0, 0.01), employer: branches(0.095, 0.02, 0.0075, 0.005) };
const SSC_2015 = { employee: branches(0.06, 0, 0, 0.01), employer: branches(0.1, 0.02, 0.0075, 0.005) };
const SSC_2016 = { employee: branches(0.0625, 0, 0, 0.01), employer: branches(0.105, 0.02, 0.0075, 0.005) };
const SSC_2017 = { employee: branches(0.065, 0, 0, 0.01), employer: branches(0.11, 0.02, 0.0075, 0.005) };

// --- Income tax periods --------------------------------------------------------------------
const BRACKETS_2010: TaxBracket[] = [
  { limit: 10000, rate: 0.07 },
  { limit: Infinity, rate: 0.14 },
];
const BRACKETS_2015: TaxBracket[] = [
  { limit: 10000, rate: 0.07 },
  { limit: 20000, rate: 0.14 },
  { limit: Infinity, rate: 0.2 },
];
const BRACKETS_2019: TaxBracket[] = [
  { limit: 5000, rate: 0.05 },
  { limit: 10000, rate: 0.1 },
  { limit: 15000, rate: 0.15 },
  { limit: 20000, rate: 0.2 },
  { limit: 1000000, rate: 0.25 },
  { limit: Infinity, rate: 0.3 },
];

const TAX_MANUAL = {
  taxManual: true,
  personalExemption: 0,
  familyExemption: 0,
  documentedExpensesMax: 0,
  totalExemptionsCeiling: 0,
  brackets: [] as TaxBracket[],
};
const TAX_2010 = {
  personalExemption: 12000,
  familyExemption: 12000,
  documentedExpensesMax: 4000,
  totalExemptionsCeiling: 28000,
  brackets: BRACKETS_2010,
};
const TAX_2015 = { ...TAX_2010, brackets: BRACKETS_2015 };
const NATIONAL_CONTRIBUTION = { threshold: 200000, rate: 0.01 };
const TAX_2019 = {
  personalExemption: 10000,
  familyExemption: 10000,
  documentedExpensesMax: 3000,
  totalExemptionsCeiling: 23000,
  brackets: BRACKETS_2019,
  nationalContribution: NATIONAL_CONTRIBUTION,
};
const TAX_2020 = {
  personalExemption: 9000,
  familyExemption: 9000,
  documentedExpensesMax: 5000,
  totalExemptionsCeiling: 23000,
  brackets: BRACKETS_2019,
  nationalContribution: NATIONAL_CONTRIBUTION,
};

const YOUTH_REDUCTION = { small: 0.4, medium: 0.3 };
/** High-risk occupations: employer pays 1% more old-age contribution (employer total 15.25%) */
const HIGH_RISK_EXTRA = 0.01;
const UNCONFIRMED_CEILING =
  'The SSC wage ceiling for this year could not be confirmed from an official source (3,084 JOD from 2015 is used). Edit it if you know the official figure.';

function rule(
  from: string,
  name: string,
  ssc: { employee: SscBranchRates; employer: SscBranchRates },
  sscCeiling: number,
  tax: Record<string, any>,
  extra: Partial<PayrollRuleSet> = {}
): PayrollRuleSet {
  return {
    from,
    name,
    sscRate: total(ssc.employee),
    sscEmployerRate: total(ssc.employer),
    sscCeiling,
    sscEmployee: ssc.employee,
    sscEmployer: ssc.employer,
    sscLegacyCeiling: from >= '2010-05-01' ? 5000 : undefined,
    sscHighRiskExtra: from >= '2014-01-01' ? HIGH_RISK_EXTRA : undefined,
    ...(tax as any),
    ...extra,
  };
}

/** Newest first. Periods after the last entry keep using the latest rules. */
export const DEFAULT_RULE_SETS: PayrollRuleSet[] = [
  rule('2026-01-01', 'Jordan payroll rules 2026', SSC_2017, 3733, TAX_2020, {
    minimumWage: 290,
    sscYouthReduction: YOUTH_REDUCTION,
  }),
  rule('2025-01-01', 'Jordan payroll rules 2025', SSC_2017, 3668, TAX_2020, {
    minimumWage: 290,
    sscYouthReduction: YOUTH_REDUCTION,
  }),
  rule('2024-01-01', 'Jordan payroll rules 2024', SSC_2017, 3612, TAX_2020, {
    minimumWage: 260,
    sscYouthReduction: YOUTH_REDUCTION,
  }),
  rule('2023-01-01', 'Jordan payroll rules 2023', SSC_2017, 3538, TAX_2020, { minimumWage: 260 }),
  rule('2022-01-01', 'Jordan payroll rules 2022', SSC_2017, 3394, TAX_2020, { minimumWage: 260 }),
  rule('2021-01-01', 'Jordan payroll rules 2021', SSC_2017, 3349, TAX_2020, { minimumWage: 260 }),
  rule('2020-01-01', 'Jordan payroll rules 2020', SSC_2017, 3338, TAX_2020),
  rule('2019-01-01', 'Jordan payroll rules 2019 (Income Tax Law 38/2018)', SSC_2017, 3084, TAX_2019, {
    unverified: UNCONFIRMED_CEILING,
  }),
  rule('2018-01-01', 'Jordan payroll rules 2018', SSC_2017, 3084, TAX_2015, { unverified: UNCONFIRMED_CEILING }),
  rule('2017-01-01', 'Jordan payroll rules 2017 (SSC old-age 11% / 6.5%)', SSC_2017, 3084, TAX_2015, {
    unverified: UNCONFIRMED_CEILING,
  }),
  rule('2016-01-01', 'Jordan payroll rules 2016 (SSC old-age 10.5% / 6.25%)', SSC_2016, 3084, TAX_2015, {
    unverified: UNCONFIRMED_CEILING,
  }),
  rule('2015-01-01', 'Jordan payroll rules 2015 (Income Tax Law 34/2014)', SSC_2015, 3084, TAX_2015),
  rule('2014-01-01', 'Jordan payroll rules 2014 (SSC Law 1/2014)', SSC_2014, 3000, TAX_2010),
  rule('2010-05-01', 'Jordan payroll rules May 2010 (SSC temporary law 7/2010)', SSC_2010, 3000, TAX_2010),
  rule('2010-01-01', 'Jordan payroll rules Jan–Apr 2010 (Income Tax temporary law 28/2009)', SSC_PRE_2010, 0, TAX_2010, {
    unverified: 'SSC rates before May 2010 (employee 5.5%, employer 9% + 2% work injury) are from secondary sources.',
  }),
  rule('2000-01-01', 'Jordan payroll rules 2000–2009', SSC_PRE_2010, 0, TAX_MANUAL, {
    unverified:
      'Income tax before 2010 is not modelled — enter it manually. SSC rates (employee 5.5%, employer 9% + 2% work injury) are from secondary sources.',
  }),
];

/**
 * Brings stored rule sets up to date: adds periods that are missing and fills in fields added
 * in newer versions, while keeping values the user changed (e.g. an edited ceiling).
 */
export function mergeRuleSets(stored: PayrollRuleSet[]): PayrollRuleSet[] {
  const byFrom = new Map(stored.map((r) => [r.from, r]));
  const merged: PayrollRuleSet[] = DEFAULT_RULE_SETS.map((def) => {
    const s = byFrom.get(def.from);
    if (!s) return def;
    const out: any = { ...def };
    for (const [k, v] of Object.entries(s)) {
      if (v !== undefined && v !== null) out[k] = v;
    }
    // JSON turns Infinity into null; restore open-ended brackets.
    out.brackets = (out.brackets || []).map((b: TaxBracket) => ({ ...b, limit: b.limit ?? Infinity }));
    return out as PayrollRuleSet;
  });
  // Keep any custom periods the user added.
  for (const s of stored) if (!DEFAULT_RULE_SETS.some((d) => d.from === s.from)) merged.push(s);
  return merged.sort((a, b) => b.from.localeCompare(a.from));
}
