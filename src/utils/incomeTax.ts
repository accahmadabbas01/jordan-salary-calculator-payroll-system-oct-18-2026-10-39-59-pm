/**
 * Jordan employment income tax (Income Tax Law 34/2014 as amended by 38/2018).
 *
 *  - Annual taxable income = annual regular pay − employee SSC (when deductible) − exemptions.
 *  - Exemptions (2020 on): personal 9,000; dependants 9,000; documented expenses (medical, education,
 *    rent, housing-loan interest) 1,000 taxpayer + 1,000 spouse + 1,000 per child (children max 3,000),
 *    so up to 5,000; all exemptions together max 23,000.
 *  - Progressive brackets per rule set, plus the 1% national contribution above 200,000 (2019 on).
 *  - Monthly withholding = annual tax on regular pay ÷ 12. One-off pay in a month (bonus, other
 *    earnings) is taxed on top: tax(annual + one-off) − tax(annual), all in that month — it is not
 *    multiplied by 12.
 */
import { PayrollRuleSet } from '../types';

export interface TaxBracketLine {
  from: number;
  to: number | null; // null = no upper limit
  rate: number;
  amount: number; // part of the taxable income falling in this bracket
  tax: number;
}

export interface IncomeTaxInput {
  ruleSet: PayrollRuleSet;
  /** Regular taxable pay per month (after unpaid leave and pre-tax deductions) */
  monthlyRegular: number;
  /** One-off taxable pay this month (bonus, other earnings) */
  oneOff?: number;
  /** Employee SSC for the month */
  monthlySsc: number;
  claimsFamily: boolean;
  /** Documented expenses claimed for the year (capped by the rule set) */
  documentedExpenses: number;
}

export interface IncomeTaxResult {
  manual: boolean;
  annualRegular: number;
  annualSscDeducted: number;
  sscDeductible: boolean;
  exemptions: { personal: number; family: number; documented: number; total: number; capped: boolean };
  annualTaxable: number;
  brackets: TaxBracketLine[];
  annualTax: number; // brackets only
  annualNationalContribution: number;
  /** Tax withheld for the regular pay of one month */
  monthlyRegularTax: number;
  /** Extra tax this month because of the one-off pay */
  oneOffTax: number;
  /** Total tax for this month */
  monthlyTax: number;
  monthlyNationalContribution: number;
  marginalRate: number;
  effectiveRate: number; // annual tax ÷ annual regular pay
  explanation: string;
}

const round2 = (n: number) => Math.floor(n * 100 + 0.5 + 1e-9) / 100;
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whether the employee's SSC reduces taxable income (rule-set setting, on unless switched off). */
export const sscIsDeductible = (rs: PayrollRuleSet) => rs.taxDeductEmployeeSsc !== false;

export function exemptionsFor(rs: PayrollRuleSet, claimsFamily: boolean, documentedExpenses: number) {
  const personal = rs.personalExemption || 0;
  const family = claimsFamily ? rs.familyExemption || 0 : 0;
  const documented = Math.min(Math.max(documentedExpenses || 0, 0), rs.documentedExpensesMax || 0);
  const sum = personal + family + documented;
  const cap = rs.totalExemptionsCeiling || sum;
  return { personal, family, documented, total: Math.min(sum, cap), capped: sum > cap };
}

/** Progressive brackets on an annual taxable amount (a null limit from JSON means no upper limit). */
export function bracketTax(rs: PayrollRuleSet, taxable: number): { lines: TaxBracketLine[]; tax: number; nc: number } {
  const lines: TaxBracketLine[] = [];
  let remaining = Math.max(taxable, 0);
  let tax = 0;
  for (let i = 0; i < rs.brackets.length; i++) {
    const from = i === 0 ? 0 : rs.brackets[i - 1].limit ?? Infinity;
    const limit = rs.brackets[i].limit ?? Infinity;
    const amount = Math.max(0, Math.min(remaining, limit - from));
    const t = amount * rs.brackets[i].rate;
    lines.push({ from, to: Number.isFinite(limit) ? limit : null, rate: rs.brackets[i].rate, amount, tax: t });
    tax += t;
    remaining -= amount;
  }
  const nc = rs.nationalContribution ? Math.max(taxable - rs.nationalContribution.threshold, 0) * rs.nationalContribution.rate : 0;
  return { lines, tax, nc };
}

export function computeIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const rs = input.ruleSet;
  const oneOff = Math.max(input.oneOff || 0, 0);
  const annualRegular = Math.max(input.monthlyRegular, 0) * 12;
  const sscDeductible = sscIsDeductible(rs);
  const annualSscDeducted = sscDeductible ? Math.max(input.monthlySsc, 0) * 12 : 0;
  const exemptions = exemptionsFor(rs, input.claimsFamily, input.documentedExpenses);
  const annualTaxable = Math.max(annualRegular - annualSscDeducted - exemptions.total, 0);

  if (rs.taxManual) {
    return {
      manual: true,
      annualRegular,
      annualSscDeducted,
      sscDeductible,
      exemptions,
      annualTaxable,
      brackets: [],
      annualTax: 0,
      annualNationalContribution: 0,
      monthlyRegularTax: 0,
      oneOffTax: 0,
      monthlyTax: 0,
      monthlyNationalContribution: 0,
      marginalRate: 0,
      effectiveRate: 0,
      explanation: 'Income tax for this period is not calculated automatically — enter it manually.',
    };
  }

  const regular = bracketTax(rs, annualTaxable);
  const withOneOff = oneOff > 0 ? bracketTax(rs, annualTaxable + oneOff) : regular;
  const regularAnnualTotal = regular.tax + regular.nc;
  const oneOffTax = withOneOff.tax + withOneOff.nc - regularAnnualTotal;
  const monthlyRegularTax = regularAnnualTotal / 12;
  const monthlyTax = round2(monthlyRegularTax + oneOffTax);
  const monthlyNationalContribution = round2(regular.nc / 12 + (withOneOff.nc - regular.nc));

  const top = [...regular.lines].reverse().find((l) => l.amount > 0);
  const marginalRate = (top?.rate || 0) + (rs.nationalContribution && annualTaxable > rs.nationalContribution.threshold ? rs.nationalContribution.rate : 0);

  const explanation =
    `Income tax: annual regular pay ${money(annualRegular)}` +
    (sscDeductible ? ` − SSC ${money(annualSscDeducted)}` : '') +
    ` − exemptions ${money(exemptions.total)} = taxable ${money(annualTaxable)} → annual tax ${money(regular.tax)}` +
    (regular.nc > 0 ? ` + national contribution ${money(regular.nc)}` : '') +
    ` ÷ 12 = ${money(monthlyRegularTax)}` +
    (oneOff > 0 ? ` + tax on one-off pay ${money(oneOff)} = ${money(oneOffTax)}` : '') +
    ` → ${money(monthlyTax)} this month.`;

  return {
    manual: false,
    annualRegular,
    annualSscDeducted,
    sscDeductible,
    exemptions,
    annualTaxable,
    brackets: regular.lines,
    annualTax: regular.tax,
    annualNationalContribution: regular.nc,
    monthlyRegularTax,
    oneOffTax,
    monthlyTax,
    monthlyNationalContribution,
    marginalRate,
    effectiveRate: annualRegular > 0 ? regularAnnualTotal / annualRegular : 0,
    explanation,
  };
}
