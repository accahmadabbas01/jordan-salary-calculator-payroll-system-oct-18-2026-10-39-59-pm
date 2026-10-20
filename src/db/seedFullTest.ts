/**
 * "Full System Test Co." — one sample company that exercises every feature:
 *
 *  T001 insured before May 2010, wage above the 3,733 ceiling (5,000 legacy ceiling), March bonus
 *  T002 maternity leave from 16 Aug 2026, eligible (SSC pays)
 *  T003 under 30, first job, youth old-age reduction (small establishment)
 *  T004 old-age pensioner over 60, work-injury insurance only
 *  T005 non-Jordanian on a passport, high-risk occupation (employer 15.25%), overtime, 2 absence days in October
 *  T006 not subject to Social Security (consultant)
 *  T007 resigned 30 Jun 2026, completed clearance spanning all three end-of-service periods
 *  T008 maternity leave from 10 Sep 2026, NOT eligible (too few contributions) — employer pays
 *  T009 wage below the minimum wage, staff loan, October advance
 *  T010 high earner — 1% national contribution
 *
 * Payroll history Oct 2025 – Sep 2026, October 2026 monthly inputs, and team comments.
 */
import { Clearance, Company, Employee, Loan, MonthlyInput, SalaryRecord, TeamComment } from '../types';
import {
  calculateClearanceAmounts,
  calculatePayroll,
  getRuleSetForPeriod,
  isEmployedInMonth,
  roundHalfUp,
} from '../utils/calculator';
import { maternityDeductionFor } from '../utils/maternity';
import { deleteCompanyCascade, initRules, putManyInStore, setAppState } from './indexedDB';

export const FULL_TEST_COMPANY_ID = 'comp_full_test';
const C = FULL_TEST_COMPANY_ID;

const emp = (e: Partial<Employee> & Pick<Employee, 'empId' | 'name' | 'nameAr'>): Employee => ({
  id: `${C}_${e.empId}`,
  companyId: C,
  title: '',
  department: '',
  status: 'active',
  hireDate: '2024-01-01',
  nationalId: '',
  idType: '1',
  nationality: 'jordanian',
  sscCoverage: 'full',
  claimsFamily: false,
  extraExemption: 0,
  package: { basic: 0, housing: 0, transport: 0, other_allow: 0 },
  allowances: [],
  deductions: [],
  documents: [],
  ...e,
});

const MOBILE = { name: 'Mobile Allowance', method: 'fixed' as const, value: 30, taxable: true, ssc: true };
const SHIFT = { name: 'Shift Allowance', method: 'percent' as const, value: 10, taxable: true, ssc: true };
const HEALTH = { name: 'Health Insurance', method: 'fixed' as const, value: 25, preTax: true };
const PROVIDENT = { name: 'Provident Fund', method: 'percent' as const, value: 5, preTax: true };

export function buildFullTestCompany(): { company: Company; employees: Employee[] } {
  const company: Company = {
    id: C,
    name: 'Full System Test Co.',
    address: 'King Abdullah II St., Amman, Jordan',
    currency: 'JOD',
    taxNumber: '200771234',
    isSample: true,
    allowanceTypes: [MOBILE, SHIFT, { name: 'Sales Commission', method: 'fixed', value: 100, taxable: true, ssc: false }],
    deductionTypes: [HEALTH, PROVIDENT, { name: 'Late Penalty', method: 'fixed', value: 10, preTax: false }],
  } as Company;

  const employees: Employee[] = [
    emp({
      empId: 'T001', name: 'Khaled Haddad', nameAr: 'خالد سمير يوسف حداد', title: 'General Manager', department: 'Management',
      gender: 'male', birthDate: '1975-02-10', hireDate: '2008-03-01', nationalId: '9751012345', taxNumber: 'TX751012',
      sscNumber: '1100223', sscInsuredBefore2010: true, claimsFamily: true, extraExemption: 3000,
      address: 'Abdoun, Amman', phone: '+962 79 111 0001', email: 'khaled@test.jo', poBox: '11183', postalCode: '11183',
      package: { basic: 4200, housing: 600, transport: 200, other_allow: 0 }, allowances: [MOBILE], deductions: [HEALTH],
    }),
    emp({
      empId: 'T002', name: 'Lina Odeh', nameAr: 'لينا خليل عودة', title: 'Accountant', department: 'Finance',
      gender: 'female', birthDate: '1993-07-21', hireDate: '2022-01-10', nationalId: '9932011111', taxNumber: 'TX932011',
      email: 'lina@test.jo', phone: '+962 79 111 0002', address: 'Jubeiha, Amman',
      package: { basic: 950, housing: 150, transport: 50, other_allow: 0 }, allowances: [MOBILE], deductions: [HEALTH],
      maternityLeaves: [{ id: 'mat_test_T002', startDate: '2026-08-16', days: 70, eligibility: 'auto', childBirthDate: '2026-08-16' }],
    }),
    emp({
      empId: 'T003', name: 'Yousef Nasser', nameAr: 'يوسف عادل ناصر', title: 'Junior Sales Rep', department: 'Sales',
      gender: 'male', birthDate: '2002-04-05', hireDate: '2026-02-01', nationalId: '2002040555', sscYouthReduction: 'small',
      email: 'yousef@test.jo', package: { basic: 520, housing: 0, transport: 30, other_allow: 0 },
    }),
    emp({
      empId: 'T004', name: 'Mahmoud Saleh', nameAr: 'محمود عيسى صالح', title: 'Security Supervisor', department: 'Operations',
      gender: 'male', birthDate: '1961-11-03', hireDate: '2023-05-01', nationalId: '9611103333', sscCoverage: 'injury_only',
      package: { basic: 700, housing: 0, transport: 40, other_allow: 0 }, allowances: [SHIFT],
    }),
    emp({
      empId: 'T005', name: 'Ravi Kumar', nameAr: 'رافي كومار', title: 'Technician', department: 'Operations',
      gender: 'male', birthDate: '1990-12-01', hireDate: '2024-03-15', nationalId: 'P8834521', idType: '2', nationality: 'non_jordanian', sscHighRisk: true,
      package: { basic: 420, housing: 80, transport: 0, other_allow: 0 }, allowances: [SHIFT],
    }),
    emp({
      empId: 'T006', name: 'Noor Abbas', nameAr: 'نور حسن عباس', title: 'Legal Consultant', department: 'Legal',
      gender: 'female', birthDate: '1988-03-14', hireDate: '2025-09-01', nationalId: '9883146666', sscCoverage: 'exempt', sscExempt: true,
      package: { basic: 800, housing: 0, transport: 0, other_allow: 0 },
    }),
    emp({
      empId: 'T007', name: 'Samer Khalil', nameAr: 'سامر يوسف خليل', title: 'Warehouse Manager', department: 'Operations',
      gender: 'male', birthDate: '1980-08-19', hireDate: '2009-06-01', status: 'resigned', endDate: '2026-06-30',
      nationalId: '9808197777', taxNumber: 'TX808197', sscInsuredBefore2010: true,
      package: { basic: 1300, housing: 200, transport: 100, other_allow: 0 }, deductions: [PROVIDENT],
    }),
    emp({
      empId: 'T008', name: 'Dana Masri', nameAr: 'دانا فريد المصري', title: 'Receptionist', department: 'Administration',
      gender: 'female', birthDate: '1996-01-25', hireDate: '2026-05-01', nationalId: '9960125888',
      package: { basic: 480, housing: 0, transport: 40, other_allow: 0 },
      maternityLeaves: [{ id: 'mat_test_T008', startDate: '2026-09-10', days: 70, eligibility: 'auto' }],
    }),
    emp({
      empId: 'T009', name: 'Omar Fayez', nameAr: 'عمر نبيل فايز', title: 'Office Assistant', department: 'Administration',
      gender: 'male', birthDate: '1998-06-30', hireDate: '2025-01-01', nationalId: '9980630999',
      package: { basic: 250, housing: 0, transport: 20, other_allow: 0 },
    }),
    emp({
      empId: 'T010', name: 'Huda Zaid', nameAr: 'هدى مروان زيد', title: 'Chief Technology Officer', department: 'Technology',
      gender: 'female', birthDate: '1985-05-05', hireDate: '2016-09-01', nationalId: '9850505010', taxNumber: 'TX850505',
      claimsFamily: true, package: { basic: 22000, housing: 2000, transport: 500, other_allow: 0 }, allowances: [MOBILE], deductions: [HEALTH, PROVIDENT],
    }),
  ];
  return { company, employees };
}

/** Seeds the company; `adminUsername` is mentioned in the sample comments. */
export async function seedFullTestCompany(adminUsername: string): Promise<void> {
  const ruleSets = await initRules();
  const { company, employees } = buildFullTestCompany();
  // Start clean: remove anything left from a previous test run of this company only.
  await deleteCompanyCascade(C);

  const loans: Loan[] = [
    {
      id: 'loan_test_T009',
      companyId: C,
      empId: 'T009',
      description: 'Staff loan',
      total: 600,
      installment: 100,
      startYear: 2026,
      startMonth: 3,
      notes: 'Approved by GM',
      settled: false,
    },
  ];

  // ---- Payroll history: Oct 2025 – Sep 2026 -------------------------------------------------
  const months: { y: number; m: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = 2025 * 12 + 9 + i; // Oct 2025 = month index 9
    months.push({ y: Math.floor(idx / 12), m: (idx % 12) + 1 });
  }
  const records: SalaryRecord[] = [];
  const loanPaid: Record<string, number> = {};

  for (const { y, m } of months) {
    for (const e of employees) {
      if (!isEmployedInMonth(e, y, m)) continue;
      const basic = e.package.basic;
      const amounts = {
        basic,
        housing: e.package.housing,
        transport: e.package.transport,
        other_allow: e.package.other_allow,
        overtime: 0,
        bonus: 0,
        other_earn: 0,
        social_sec: 0,
        income_tax: 0,
        other_ded: 0,
        advance: 0,
        unpaid_leave: 0,
      };
      if (e.empId === 'T001' && y === 2026 && m === 3) amounts.bonus = 2000; // annual bonus
      if (e.empId === 'T005' && m % 2 === 0) amounts.overtime = 45;
      if (e.empId === 'T003' && y === 2026 && m === 6) amounts.other_earn = 75; // sales commission paid as other earnings

      const earnings = e.allowances.map((a) => ({
        name: a.name,
        amount: a.method === 'percent' ? roundHalfUp((basic * a.value) / 100, 2) : a.value,
        taxable: a.taxable,
        ssc: a.ssc,
      }));
      const deductions: SalaryRecord['deductions'] = e.deductions.map((d) => ({
        name: d.name,
        amount: d.method === 'percent' ? roundHalfUp((basic * d.value) / 100, 2) : d.value,
        preTax: d.preTax,
      }));
      for (const l of loans) {
        if (l.empId !== e.empId || y * 12 + m < l.startYear * 12 + l.startMonth) continue;
        const paid = loanPaid[l.id] || 0;
        const inst = Math.min(l.installment, l.total - paid);
        if (inst > 0) {
          deductions.push({ name: l.description, amount: inst, preTax: false, loanId: l.id });
          loanPaid[l.id] = paid + inst;
        }
      }
      const maternity = maternityDeductionFor(e, y, m, records, getRuleSetForPeriod);
      if (maternity) deductions.push(maternity);

      const calc = calculatePayroll(e, y, m, amounts, earnings, deductions, e.claimsFamily, e.extraExemption, ruleSets);
      amounts.social_sec = calc.ssc;
      amounts.income_tax = calc.incomeTax;
      const last = new Date(y, m, 0).getDate();
      records.push({
        id: `${C}_${e.empId}_${y}_${m}`,
        companyId: C,
        empId: e.empId,
        name: e.name,
        nameAr: e.nameAr,
        title: e.title,
        dept: e.department,
        year: y,
        month: m,
        payDate: `${y}-${String(m).padStart(2, '0')}-${last}`,
        payMethod: e.empId === 'T005' ? 'Cash' : 'Bank transfer',
        currency: 'JOD',
        amounts,
        earnings,
        deductions,
        gross: calc.gross,
        totalDed: calc.totalDed,
        net: calc.net,
        claimsFamily: !!e.claimsFamily,
        extraExemption: e.extraExemption || 0,
        autoCalc: true,
      });
    }
  }

  // ---- October 2026 inputs (to be picked up by Payroll Run) ---------------------------------
  const inp = (empId: string, kind: MonthlyInput['kind'], item: string, amount: number, notes: string): MonthlyInput => ({
    id: `inp_${C}_${empId}_2026_10_${item.replace(/\s+/g, '_')}`,
    companyId: C,
    empId,
    year: 2026,
    month: 10,
    kind,
    item,
    amount,
    notes,
  });
  const inputs: MonthlyInput[] = [
    inp('T003', 'salary', 'overtime', 60, 'Weekend stock count'),
    inp('T005', 'salary', 'unpaid_leave', 33.33, '2 days absent without permission'),
    inp('T009', 'salary', 'advance', 50, 'Salary advance requested 12 Oct'),
    inp('T010', 'salary', 'bonus', 5000, 'Q3 performance bonus'),
    inp('T001', 'allowance', 'Sales Commission', 400, 'Q3 key accounts'),
  ];

  // ---- Completed clearance for T007 -------------------------------------------------------
  const samer = employees.find((e) => e.empId === 'T007')!;
  const calc = calculateClearanceAmounts({
    employee: samer,
    hireDate: samer.hireDate,
    lastDay: '2026-06-30',
    reason: 'Resignation',
    daysWorked: 0,
    leaveDays: 6,
    indemnityMonths: 1,
    indemnityBasis: 'wage',
    noticeMonths: 0,
    deductLoans: true,
    unsettledLoanBalance: 0,
    hasExistingMonthRecord: true,
    customRuleSets: ruleSets,
  });
  const signOff = (department: string, departmentAr: string) => ({
    department,
    departmentAr,
    cleared: true,
    by: 'sara.hr',
    date: '2026-07-01',
  });
  const clearance: Clearance = {
    id: `clearance_${C}_T007`,
    companyId: C,
    empId: 'T007',
    hireDate: samer.hireDate,
    lastDay: '2026-06-30',
    reason: 'Resignation',
    daysWorked: 0,
    leaveDays: 6,
    indemnityMonths: 1,
    indemnityBasis: 'wage',
    noticeMonths: 0,
    monthlyWage: calc.monthlyWage,
    basic: calc.basic,
    deductLoans: true,
    dues: calc.dues,
    deductions: calc.deductions,
    totalDues: calc.totalDues,
    totalDeductions: calc.totalDeductions,
    net: calc.net,
    signOffs: [
      signOff('Finance', 'المالية'),
      signOff('IT', 'تكنولوجيا المعلومات'),
      signOff('Warehouse', 'المستودعات'),
      signOff('HR', 'الموارد البشرية'),
    ],
    status: 'completed',
    completedAt: '2026-07-02T09:00:00.000Z',
    notes: 'Contractual end-of-service of one month per year of service.',
    serviceLength: calc.service,
  };

  // ---- Team comments -----------------------------------------------------------------------
  let n = 0;
  const comment = (
    c: Partial<TeamComment> & Pick<TeamComment, 'entityType' | 'entityId' | 'entityLabel' | 'text' | 'author' | 'authorName'>,
    minutesAgo: number
  ): TeamComment => {
    const at = new Date(Date.now() - minutesAgo * 60000).toISOString();
    return {
      id: `cmt_test_${++n}`,
      companyId: C,
      createdAt: at,
      updatedAt: at,
      resolved: false,
      mentions: Array.from(c.text.matchAll(/@([\w.\-]+)/g)).map((x) => x[1].toLowerCase()),
      ...c,
    } as TeamComment;
  };
  const me = adminUsername;
  const comments: TeamComment[] = [
    comment(
      {
        entityType: 'general',
        entityId: `general_${C}`,
        entityLabel: 'Team note',
        author: 'sara.hr',
        authorName: 'Sara (HR)',
        text: `Welcome to the test company. October cut-off is the 25th. @${me} please review the two maternity cases before running payroll.`,
      },
      600
    ),
    comment(
      {
        entityType: 'employee',
        entityId: `${C}_T009`,
        entityLabel: 'Employee T009 — Omar Fayez',
        empId: 'T009',
        author: 'omar.finance',
        authorName: 'Omar (Finance)',
        text: `Basic 250 JOD is below the 290 minimum wage — SSC will flag it. @${me} can we update his contract from November?`,
      },
      240
    ),
    comment(
      {
        entityType: 'maternity',
        entityId: 'mat_test_T008',
        entityLabel: 'Maternity leave — Dana Masri from 2026-09-10',
        empId: 'T008',
        author: 'sara.hr',
        authorName: 'Sara (HR)',
        text: 'Dana has only 4 contributions, so SSC will not pay the allowance. The company pays her full wage during the leave.',
      },
      180
    ),
    comment(
      {
        entityType: 'payroll_month',
        entityId: `${C}_2026_10`,
        entityLabel: 'Payroll run — October 2026',
        year: 2026,
        month: 10,
        author: 'omar.finance',
        authorName: 'Omar (Finance)',
        text: `Site managers sent this month's overtime by email. @${me} use Smart Import (Company Settings → Full system test → sample email) before running payroll.`,
      },
      90
    ),
    comment(
      {
        entityType: 'clearance',
        entityId: `clearance_${C}_T007`,
        entityLabel: 'Clearance — Samer Khalil (last day 2026-06-30)',
        empId: 'T007',
        author: 'sara.hr',
        authorName: 'Sara (HR)',
        text: 'Final settlement signed by Samer on 2 July. Bank transfer done.',
        resolved: true,
        resolvedBy: 'omar.finance',
        resolvedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      },
      2000
    ),
  ];
  comments.push(
    comment(
      {
        entityType: 'employee',
        entityId: `${C}_T009`,
        entityLabel: 'Employee T009 — Omar Fayez',
        empId: 'T009',
        parentId: comments[1].id,
        author: 'sara.hr',
        authorName: 'Sara (HR)',
        text: 'HR agrees — new contract at 300 JOD is drafted.',
      },
      120
    )
  );

  await putManyInStore('companies', [company]);
  await putManyInStore('employees', employees);
  await putManyInStore('loans', loans);
  await putManyInStore('salary_records', records);
  await putManyInStore('monthly_inputs', inputs);
  await putManyInStore('clearances', [clearance]);
  await putManyInStore('comments', comments);
  await setAppState('lastCompanyId', C);
  await setAppState('lastPeriod', { year: 2026, month: 10 });
}
