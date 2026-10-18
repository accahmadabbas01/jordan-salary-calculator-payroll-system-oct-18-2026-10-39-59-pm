export type PayMethod = 'Bank transfer' | 'Cash' | 'Cheque';
export type UserRole = 'admin' | 'payroll_officer' | 'viewer';
export type ClearanceReason = 'Resignation' | 'Termination' | 'End of contract' | 'Retirement' | 'Death' | 'Other';

export interface AllowanceType {
  name: string;
  method: 'fixed' | 'percent';
  value: number;
  taxable: boolean; // default true
  ssc: boolean;     // default true
}

export interface DeductionType {
  name: string;
  method: 'fixed' | 'percent';
  value: number;
  preTax: boolean;  // default false
}

export interface Company {
  id: string;
  name: string;
  address: string;
  currency: string; // default JOD
  taxNumber: string;
  logo?: string;
  isSample?: boolean;
  allowanceTypes: AllowanceType[];
  deductionTypes: DeductionType[];
}

export interface RecurringAllowance {
  name: string;
  method: 'fixed' | 'percent';
  value: number;
  taxable: boolean;
  ssc: boolean;
}

export interface RecurringDeduction {
  name: string;
  method: 'fixed' | 'percent';
  value: number;
  preTax: boolean;
}

export interface EmployeeDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadDate: string;
  dataUrl?: string; // stored base64 or blob URL
}

export interface Employee {
  id: string; // internal unique id
  companyId: string;
  empId: string; // unique per company
  name: string;
  nameAr: string;
  title: string;
  department: string;
  status: 'active' | 'resigned';
  hireDate: string; // yyyy-mm-dd
  endDate?: string; // yyyy-mm-dd
  nationalId: string;
  idType: '1' | '2'; // 1=national ID, 2=passport
  taxNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  poBox?: string;
  postalCode?: string;
  sscNumber?: string;
  sscWage?: number; // insured monthly wage registered at SSC (0/empty = use salary items)
  sscExempt?: boolean; // not subject to SSC
  claimsFamily?: boolean; // dependants exemption
  extraExemption?: number; // documented expenses exemption (yearly max 5,000)
  package: {
    basic: number;
    housing: number;
    transport: number;
    other_allow: number;
  };
  allowances: RecurringAllowance[];
  deductions: RecurringDeduction[];
  documents: EmployeeDocument[];
}

export interface SalaryAmounts {
  basic: number;
  housing: number;
  transport: number;
  other_allow: number;
  overtime: number;
  bonus: number;
  other_earn: number;
  social_sec: number;
  income_tax: number;
  other_ded: number;
  advance: number;
  unpaid_leave: number;
}

export interface SalaryEarningItem {
  name: string;
  amount: number;
  taxable: boolean;
  ssc: boolean;
}

export interface SalaryDeductionItem {
  name: string;
  amount: number;
  preTax: boolean;
  loanId?: string;
}

export interface SalaryRecord {
  id: string; // companyId_empId_year_month
  companyId: string;
  empId: string;
  name: string;
  nameAr: string;
  title: string;
  dept: string;
  year: number;
  month: number;
  payDate: string;
  payMethod: PayMethod;
  currency: string;
  amounts: SalaryAmounts;
  earnings: SalaryEarningItem[];
  deductions: SalaryDeductionItem[];
  gross: number;
  totalDed: number;
  net: number;
  notes?: string;
  claimsFamily: boolean;
  extraExemption: number;
  autoCalc: boolean;
  emailedAt?: string;
}

export interface Loan {
  id: string;
  companyId: string;
  empId: string;
  description: string;
  total: number;
  installment: number;
  startYear: number;
  startMonth: number;
  notes?: string;
  settled: boolean;
  settledByClearanceId?: string;
}

export interface MonthlyInput {
  id: string;
  companyId: string;
  empId: string;
  year: number;
  month: number;
  kind: 'salary' | 'allowance' | 'deduction';
  item: string;
  amount: number;
  notes?: string;
}

export interface DepartmentSignOff {
  department: string;
  departmentAr: string;
  cleared: boolean;
  by?: string;
  date?: string;
  notes?: string;
}

export interface Clearance {
  id: string;
  companyId: string;
  empId: string;
  hireDate: string;
  lastDay: string;
  reason: ClearanceReason;
  daysWorked: number;
  leaveDays: number;
  indemnityMonths: number;
  indemnityBasis: 'wage' | 'basic';
  noticeMonths: number;
  monthlyWage: number;
  basic: number;
  deductLoans: boolean;
  dues: {
    salary_due: number;
    leave_pay: number;
    indemnity: number;
    notice_pay: number;
    other_dues: number;
  };
  deductions: {
    ssc: number;
    income_tax: number;
    loans: number;
    notice_deduction: number;
    other_deductions: number;
  };
  totalDues: number;
  totalDeductions: number;
  net: number;
  signOffs: DepartmentSignOff[];
  status: 'draft' | 'completed';
  completedAt?: string;
  notes?: string;
  serviceLength: {
    years: number;
    months: number;
    days: number;
    totalDays: number;
  };
}

export interface User {
  username: string; // lowercase unique
  fullName: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  companyIds: string[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  when: string;
  username: string;
  companyId?: string;
  action: string;
  details: string;
}

export interface EmailSettings {
  companyId: string;
  provider: 'gmail' | 'outlook' | 'smtp';
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  fromEmail: string;
  subjectTemplate: string;
  bodyTemplate: string;
  lockPdfWithNationalId: boolean;
}

export interface TaxBracket {
  limit: number; // ceiling of this bracket
  rate: number;  // 0.05, 0.10, etc.
}

export interface PayrollRuleSet {
  from: string; // yyyy-mm-dd
  name: string;
  sscRate: number; // 0.075 (7.5% employee share)
  sscEmployerRate: number; // 0.1425 (14.25% employer share)
  sscCeiling: number; // 3668 for 2025, 3733 for 2026
  personalExemption: number; // 9000
  familyExemption: number;   // 9000
  documentedExpensesMax: number; // 5000
  totalExemptionsCeiling: number; // 23000
  brackets: TaxBracket[];
}
