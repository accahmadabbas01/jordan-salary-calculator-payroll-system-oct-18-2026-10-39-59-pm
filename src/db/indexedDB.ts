import {
  Company,
  Employee,
  SalaryRecord,
  SalaryAmounts,
  Loan,
  MonthlyInput,
  Clearance,
  User,
  ActivityLog,
  EmailSettings,
  PayrollRuleSet,
} from '../types';
import { DEFAULT_RULE_SETS, calculatePayroll, setActiveRuleSets } from '../utils/calculator';
import { mergeRuleSets } from '../utils/jordanRules';
import { hashPassword } from '../utils/crypto';

const DB_NAME = 'JordanSalaryCalculatorDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains('companies')) {
        db.createObjectStore('companies', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('employees')) {
        const store = db.createObjectStore('employees', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('company_empId', ['companyId', 'empId'], { unique: true });
      }
      if (!db.objectStoreNames.contains('salary_records')) {
        const store = db.createObjectStore('salary_records', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('company_year_month', ['companyId', 'year', 'month'], { unique: false });
      }
      if (!db.objectStoreNames.contains('loans')) {
        const store = db.createObjectStore('loans', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('company_empId', ['companyId', 'empId'], { unique: false });
      }
      if (!db.objectStoreNames.contains('monthly_inputs')) {
        const store = db.createObjectStore('monthly_inputs', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('company_year_month', ['companyId', 'year', 'month'], { unique: false });
      }
      if (!db.objectStoreNames.contains('clearances')) {
        const store = db.createObjectStore('clearances', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('company_empId', ['companyId', 'empId'], { unique: false });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'username' });
      }
      if (!db.objectStoreNames.contains('activity_logs')) {
        const store = db.createObjectStore('activity_logs', { keyPath: 'id' });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('when', 'when', { unique: false });
      }
      if (!db.objectStoreNames.contains('email_settings')) {
        db.createObjectStore('email_settings', { keyPath: 'companyId' });
      }
      if (!db.objectStoreNames.contains('rule_sets')) {
        db.createObjectStore('rule_sets', { keyPath: 'from' });
      }
      if (!db.objectStoreNames.contains('app_state')) {
        db.createObjectStore('app_state', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Generic helpers
export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putInStore<T>(storeName: string, item: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function putManyInStore<T>(storeName: string, items: T[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const it of items) {
      store.put(it);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// App State Helpers
export async function getAppState<T>(key: string, defaultValue: T): Promise<T> {
  const record = await getFromStore<{ key: string; value: T }>('app_state', key);
  return record ? record.value : defaultValue;
}

export async function setAppState<T>(key: string, value: T): Promise<void> {
  await putInStore('app_state', { key, value });
}

// Activity Log Helper
export async function logActivity(
  username: string,
  action: string,
  details: string,
  companyId?: string
): Promise<void> {
  const log: ActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    when: new Date().toISOString(),
    username,
    companyId,
    action,
    details,
  };
  await putInStore('activity_logs', log);
}

// Initialize default rule sets if not present
export async function initRules(): Promise<PayrollRuleSet[]> {
  const existing = await getAllFromStore<PayrollRuleSet>('rule_sets');
  // Adds new periods/fields from app updates while keeping the user's edits.
  const merged = mergeRuleSets(existing);
  if (JSON.stringify(merged) !== JSON.stringify(existing)) {
    await putManyInStore('rule_sets', merged);
  }
  setActiveRuleSets(merged);
  return merged;
}

// Check if any admin exists
export async function hasUsers(): Promise<boolean> {
  const users = await getAllFromStore<User>('users');
  return users.length > 0;
}

// Create initial admin
export async function createAdminUser(
  username: string,
  fullName: string,
  passwordPlain: string
): Promise<User> {
  const passwordHash = await hashPassword(passwordPlain);
  const user: User = {
    username: username.toLowerCase().trim(),
    fullName: fullName.trim(),
    role: 'admin',
    active: true,
    passwordHash,
    companyIds: [],
    createdAt: new Date().toISOString(),
  };
  await putInStore('users', user);
  await logActivity(user.username, 'User Created', `Initial administrator account created for ${user.fullName}`);
  return user;
}

// Delete company and all cascaded data
export async function deleteCompanyCascade(companyId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    ['companies', 'employees', 'salary_records', 'loans', 'monthly_inputs', 'clearances', 'email_settings'],
    'readwrite'
  );

  tx.objectStore('companies').delete(companyId);

  // Helper to remove items by companyId
  const deleteByCompanyId = (storeName: string) => {
    const store = tx.objectStore(storeName);
    const index = store.index('companyId');
    const req = index.openKeyCursor(IDBKeyRange.only(companyId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  };

  deleteByCompanyId('employees');
  deleteByCompanyId('salary_records');
  deleteByCompanyId('loans');
  deleteByCompanyId('monthly_inputs');
  deleteByCompanyId('clearances');
  tx.objectStore('email_settings').delete(companyId);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Seed the 3 Sample Companies described in Section 14
export async function seedSampleCompanies(): Promise<void> {
  const ruleSets = await initRules();

  // 1. Al-Noor Trading Co.
  const alNoorId = 'comp_al_noor';
  const alNoor: Company = {
    id: alNoorId,
    name: 'Al-Noor Trading Co.',
    address: 'Wasfi Al-Tal St., Amman, Jordan',
    currency: 'JOD',
    taxNumber: '100482910',
    isSample: true,
    allowanceTypes: [
      { name: 'Mobile Allowance', method: 'fixed', value: 30, taxable: true, ssc: true },
      { name: 'Fuel Allowance', method: 'fixed', value: 60, taxable: false, ssc: false },
      { name: 'Sales Commission', method: 'fixed', value: 150, taxable: true, ssc: false },
      { name: 'Shift Allowance', method: 'percent', value: 10, taxable: true, ssc: true },
    ],
    deductionTypes: [
      { name: 'Health Insurance', method: 'fixed', value: 25, preTax: true },
      { name: 'Provident Fund', method: 'percent', value: 5, preTax: true },
      { name: 'Union Dues', method: 'fixed', value: 5, preTax: false },
      { name: 'Late Penalty', method: 'fixed', value: 15, preTax: false },
    ],
  };

  const alNoorEmployees: Employee[] = [
    {
      id: `${alNoorId}_EMP001`,
      companyId: alNoorId,
      empId: 'EMP001',
      name: 'Ahmad Al-Sayed',
      nameAr: 'أحمد محمود السيد',
      title: 'General Manager',
      department: 'Management',
      status: 'active',
      hireDate: '2020-03-01',
      nationalId: '9801023456',
      idType: '1',
      taxNumber: 'TAX980102',
      email: 'ahmad@example.com',
      phone: '+962 7 9123 4567',
      claimsFamily: true,
      extraExemption: 3000,
      package: { basic: 2400, housing: 400, transport: 200, other_allow: 0 },
      allowances: [{ name: 'Fuel Allowance', method: 'fixed', value: 60, taxable: false, ssc: false }],
      deductions: [{ name: 'Health Insurance', method: 'fixed', value: 25, preTax: true }],
      documents: [],
    },
    {
      id: `${alNoorId}_EMP002`,
      companyId: alNoorId,
      empId: 'EMP002',
      name: 'Rania Haddad',
      nameAr: 'رانيا جورج حداد',
      title: 'Finance Director',
      department: 'Finance',
      status: 'active',
      hireDate: '2021-06-15',
      nationalId: '9842019876',
      idType: '1',
      taxNumber: 'TAX984201',
      email: 'rania@example.com',
      phone: '+962 7 8123 7890',
      claimsFamily: false,
      extraExemption: 0,
      package: { basic: 1800, housing: 200, transport: 100, other_allow: 0 },
      allowances: [{ name: 'Mobile Allowance', method: 'fixed', value: 30, taxable: true, ssc: true }],
      deductions: [{ name: 'Provident Fund', method: 'percent', value: 5, preTax: true }],
      documents: [],
    },
    {
      id: `${alNoorId}_EMP003`,
      companyId: alNoorId,
      empId: 'EMP003',
      name: 'Omar Nabulsi',
      nameAr: 'عمر فؤاد النابلسي',
      title: 'Sales Representative',
      department: 'Sales',
      status: 'active',
      hireDate: '2022-01-10',
      nationalId: '9911045678',
      idType: '1',
      email: 'omar@example.com',
      phone: '+962 7 7123 0011',
      claimsFamily: true,
      extraExemption: 1000,
      package: { basic: 750, housing: 100, transport: 50, other_allow: 0 },
      allowances: [{ name: 'Sales Commission', method: 'fixed', value: 150, taxable: true, ssc: false }],
      deductions: [],
      documents: [],
    },
    {
      id: `${alNoorId}_EMP004`,
      companyId: alNoorId,
      empId: 'EMP004',
      name: 'Huda Al-Qasem',
      nameAr: 'هدى عبد الله القاسم',
      title: 'HR Specialist',
      department: 'Human Resources',
      status: 'active',
      hireDate: '2023-04-01',
      nationalId: '9932067890',
      idType: '1',
      email: 'huda@example.com',
      claimsFamily: false,
      package: { basic: 900, housing: 100, transport: 50, other_allow: 0 },
      allowances: [],
      deductions: [{ name: 'Union Dues', method: 'fixed', value: 5, preTax: false }],
      documents: [],
    },
    {
      id: `${alNoorId}_EMP005`,
      companyId: alNoorId,
      empId: 'EMP005',
      name: 'Tareq Mansour',
      nameAr: 'طارق زياد منصور',
      title: 'Warehouse Supervisor',
      department: 'Logistics',
      status: 'active',
      hireDate: '2022-08-01',
      nationalId: '9891078901',
      idType: '1',
      email: 'tareq@example.com',
      claimsFamily: true,
      package: { basic: 800, housing: 50, transport: 50, other_allow: 0 },
      allowances: [{ name: 'Shift Allowance', method: 'percent', value: 10, taxable: true, ssc: true }],
      deductions: [],
      documents: [],
    },
    {
      id: `${alNoorId}_EMP006`,
      companyId: alNoorId,
      empId: 'EMP006',
      name: 'Salma Kilani',
      nameAr: 'سلمى إبراهيم الكيلاني',
      title: 'Administrative Assistant',
      department: 'Administration',
      status: 'active',
      hireDate: '2024-01-15',
      nationalId: '9952089012',
      idType: '1',
      email: 'salma@example.com',
      claimsFamily: false,
      package: { basic: 550, housing: 50, transport: 50, other_allow: 0 },
      allowances: [],
      deductions: [],
      documents: [],
    },
  ];

  const alNoorLoans: Loan[] = [
    {
      id: 'loan_al_noor_1',
      companyId: alNoorId,
      empId: 'EMP003',
      description: 'Emergency Personal Loan',
      total: 600,
      installment: 100,
      startYear: 2026,
      startMonth: 2,
      settled: false,
    },
    {
      id: 'loan_al_noor_2',
      companyId: alNoorId,
      empId: 'EMP005',
      description: 'Home Appliances Loan',
      total: 500,
      installment: 100,
      startYear: 2026,
      startMonth: 5,
      settled: false,
    },
  ];

  // 2. Petra Engineering Ltd.
  const petraId = 'comp_petra_eng';
  const petra: Company = {
    id: petraId,
    name: 'Petra Engineering Ltd.',
    address: 'King Hussein Business Park, Building 4, Amman',
    currency: 'JOD',
    taxNumber: '100593847',
    isSample: true,
    allowanceTypes: [
      { name: 'Site Allowance', method: 'fixed', value: 200, taxable: true, ssc: true },
      { name: 'Hardship Allowance', method: 'fixed', value: 100, taxable: true, ssc: false },
      { name: 'Overtime Meal', method: 'fixed', value: 40, taxable: false, ssc: false },
    ],
    deductionTypes: [
      { name: 'Health Insurance', method: 'fixed', value: 35, preTax: true },
      { name: 'Life Insurance', method: 'fixed', value: 15, preTax: false },
      { name: 'Tools Damage', method: 'fixed', value: 20, preTax: false },
    ],
  };

  const petraEmployees: Employee[] = [
    {
      id: `${petraId}_PE01`,
      companyId: petraId,
      empId: 'PE01',
      name: 'Yousef Al-Khatib',
      nameAr: 'يوسف كمال الخطيب',
      title: 'Principal Project Manager',
      department: 'Engineering',
      status: 'active',
      hireDate: '2019-11-01',
      nationalId: '9781034567',
      idType: '1',
      claimsFamily: true,
      extraExemption: 2000,
      package: { basic: 3200, housing: 500, transport: 300, other_allow: 0 },
      allowances: [{ name: 'Site Allowance', method: 'fixed', value: 200, taxable: true, ssc: true }],
      deductions: [{ name: 'Health Insurance', method: 'fixed', value: 35, preTax: true }],
      documents: [],
    },
    {
      id: `${petraId}_PE02`,
      companyId: petraId,
      empId: 'PE02',
      name: 'Laila Al-Masri',
      nameAr: 'ليلى سمير المصري',
      title: 'Senior Structural Engineer',
      department: 'Design',
      status: 'active',
      hireDate: '2021-02-15',
      nationalId: '9872045678',
      idType: '1',
      claimsFamily: false,
      package: { basic: 1700, housing: 250, transport: 150, other_allow: 0 },
      allowances: [],
      deductions: [{ name: 'Health Insurance', method: 'fixed', value: 35, preTax: true }],
      documents: [],
    },
    {
      id: `${petraId}_PE03`,
      companyId: petraId,
      empId: 'PE03',
      name: 'Khaled Barakat',
      nameAr: 'خالد منير بركات',
      title: 'Site Mechanical Engineer',
      department: 'Site Operations',
      status: 'active',
      hireDate: '2022-09-01',
      nationalId: '9901056789',
      idType: '1',
      claimsFamily: true,
      package: { basic: 1200, housing: 150, transport: 100, other_allow: 0 },
      allowances: [
        { name: 'Site Allowance', method: 'fixed', value: 200, taxable: true, ssc: true },
        { name: 'Hardship Allowance', method: 'fixed', value: 100, taxable: true, ssc: false },
      ],
      deductions: [],
      documents: [],
    },
    {
      id: `${petraId}_PE04`,
      companyId: petraId,
      empId: 'PE04',
      name: 'Nour Obeidat',
      nameAr: 'نور أحمد عبيدات',
      title: 'Electrical Draftsman',
      department: 'Drafting',
      status: 'active',
      hireDate: '2023-07-01',
      nationalId: '9942067891',
      idType: '1',
      claimsFamily: false,
      package: { basic: 850, housing: 100, transport: 50, other_allow: 0 },
      allowances: [],
      deductions: [{ name: 'Life Insurance', method: 'fixed', value: 15, preTax: false }],
      documents: [],
    },
    {
      id: `${petraId}_PE05`,
      companyId: petraId,
      empId: 'PE05',
      name: 'Samer Hijazi',
      nameAr: 'سامر عدنان حجازي',
      title: 'Safety Inspector',
      department: 'Quality & Safety',
      status: 'active',
      hireDate: '2023-01-10',
      nationalId: '9881078902',
      idType: '1',
      claimsFamily: true,
      package: { basic: 950, housing: 100, transport: 50, other_allow: 0 },
      allowances: [{ name: 'Overtime Meal', method: 'fixed', value: 40, taxable: false, ssc: false }],
      deductions: [],
      documents: [],
    },
  ];

  const petraLoans: Loan[] = [
    {
      id: 'loan_petra_1',
      companyId: petraId,
      empId: 'PE03',
      description: 'Vehicle Repair Loan',
      total: 800,
      installment: 200,
      startYear: 2026,
      startMonth: 4,
      settled: false,
    },
  ];

  // 3. Amman Medical Center
  const ammanMedId = 'comp_amman_med';
  const ammanMed: Company = {
    id: ammanMedId,
    name: 'Amman Medical Center',
    address: 'Queen Rania St., Amman, Jordan',
    currency: 'JOD',
    taxNumber: '100674829',
    isSample: true,
    allowanceTypes: [
      { name: 'Night Shift', method: 'fixed', value: 80, taxable: true, ssc: true },
      { name: 'Meal Allowance', method: 'fixed', value: 35, taxable: false, ssc: false },
      { name: 'On-call Allowance', method: 'fixed', value: 120, taxable: true, ssc: false },
      { name: 'Specialty Allowance', method: 'fixed', value: 250, taxable: true, ssc: true },
    ],
    deductionTypes: [
      { name: 'Pension Fund', method: 'fixed', value: 40, preTax: true },
      { name: 'Uniform Deduction', method: 'fixed', value: 10, preTax: false },
      { name: 'Absence Penalty', method: 'fixed', value: 20, preTax: false },
    ],
  };

  const ammanMedEmployees: Employee[] = [
    {
      id: `${ammanMedId}_M01`,
      companyId: ammanMedId,
      empId: 'M01',
      name: 'Dr. Tariq Al-Bataineh',
      nameAr: 'د. طارق محمود البطاينة',
      title: 'Consultant Cardiologist',
      department: 'Cardiology',
      status: 'active',
      hireDate: '2018-05-01',
      nationalId: '9751012345',
      idType: '1',
      claimsFamily: true,
      extraExemption: 5000,
      package: { basic: 4500, housing: 800, transport: 300, other_allow: 0 },
      allowances: [{ name: 'Specialty Allowance', method: 'fixed', value: 250, taxable: true, ssc: true }],
      deductions: [{ name: 'Pension Fund', method: 'fixed', value: 40, preTax: true }],
      documents: [],
    },
    {
      id: `${ammanMedId}_M02`,
      companyId: ammanMedId,
      empId: 'M02',
      name: 'Dr. Mai Shaker',
      nameAr: 'د. مي حسام شاكر',
      title: 'Pediatric Specialist',
      department: 'Pediatrics',
      status: 'active',
      hireDate: '2020-09-01',
      nationalId: '9832023456',
      idType: '1',
      claimsFamily: false,
      extraExemption: 2000,
      package: { basic: 2600, housing: 300, transport: 150, other_allow: 0 },
      allowances: [{ name: 'On-call Allowance', method: 'fixed', value: 120, taxable: true, ssc: false }],
      deductions: [{ name: 'Pension Fund', method: 'fixed', value: 40, preTax: true }],
      documents: [],
    },
    {
      id: `${ammanMedId}_M03`,
      companyId: ammanMedId,
      empId: 'M03',
      name: 'Bilal Al-Zoubi',
      nameAr: 'بلال قاسم الزعبي',
      title: 'Head Nurse',
      department: 'Nursing',
      status: 'active',
      hireDate: '2021-04-15',
      nationalId: '9861034568',
      idType: '1',
      claimsFamily: true,
      package: { basic: 950, housing: 100, transport: 50, other_allow: 0 },
      allowances: [
        { name: 'Night Shift', method: 'fixed', value: 80, taxable: true, ssc: true },
        { name: 'Meal Allowance', method: 'fixed', value: 35, taxable: false, ssc: false },
      ],
      deductions: [],
      documents: [],
    },
    {
      id: `${ammanMedId}_M04`,
      companyId: ammanMedId,
      empId: 'M04',
      name: 'Fatima Al-Rimawi',
      nameAr: 'فاطمة خالد الريماوي',
      title: 'Staff Nurse',
      department: 'Nursing',
      status: 'active',
      hireDate: '2022-11-01',
      nationalId: '9922045679',
      idType: '1',
      claimsFamily: false,
      package: { basic: 700, housing: 80, transport: 40, other_allow: 0 },
      allowances: [{ name: 'Night Shift', method: 'fixed', value: 80, taxable: true, ssc: true }],
      deductions: [],
      documents: [],
    },
    {
      id: `${ammanMedId}_M05`,
      companyId: ammanMedId,
      empId: 'M05',
      name: 'Zaid Al-Abbadi',
      nameAr: 'زيد ناصر العبادي',
      title: 'Lab Technologist',
      department: 'Laboratory',
      status: 'active',
      hireDate: '2022-03-01',
      nationalId: '9901056780',
      idType: '1',
      claimsFamily: true,
      package: { basic: 850, housing: 100, transport: 50, other_allow: 0 },
      allowances: [{ name: 'Meal Allowance', method: 'fixed', value: 35, taxable: false, ssc: false }],
      deductions: [],
      documents: [],
    },
    {
      id: `${ammanMedId}_M06`,
      companyId: ammanMedId,
      empId: 'M06',
      name: 'Dina Majali',
      nameAr: 'دينا سفيان المجالي',
      title: 'Radiographer',
      department: 'Radiology',
      status: 'active',
      hireDate: '2023-05-15',
      nationalId: '9942067892',
      idType: '1',
      claimsFamily: false,
      package: { basic: 900, housing: 100, transport: 50, other_allow: 0 },
      allowances: [],
      deductions: [{ name: 'Uniform Deduction', method: 'fixed', value: 10, preTax: false }],
      documents: [],
    },
    {
      id: `${ammanMedId}_M07`,
      companyId: ammanMedId,
      empId: 'M07',
      name: 'Anas Al-Qadi',
      nameAr: 'أنس مروان القاضي',
      title: 'Receptionist & Patient Services',
      department: 'Administration',
      status: 'active',
      hireDate: '2024-02-01',
      nationalId: '9961078903',
      idType: '1',
      claimsFamily: false,
      package: { basic: 500, housing: 50, transport: 50, other_allow: 0 },
      allowances: [],
      deductions: [],
      documents: [],
    },
  ];

  const ammanMedLoans: Loan[] = [
    {
      id: 'loan_amman_1',
      companyId: ammanMedId,
      empId: 'M03',
      description: 'Family Support Loan',
      total: 900,
      installment: 150,
      startYear: 2026,
      startMonth: 3,
      settled: false,
    },
    {
      id: 'loan_amman_2',
      companyId: ammanMedId,
      empId: 'M05',
      description: 'Education Advance Loan',
      total: 600,
      installment: 100,
      startYear: 2026,
      startMonth: 6,
      settled: false,
    },
  ];

  // Helper to generate January to September 2026 salary records
  const generateRecords = (
    company: Company,
    employees: Employee[],
    loans: Loan[]
  ): SalaryRecord[] => {
    const records: SalaryRecord[] = [];

    // Track running paid loans
    const loanPaidMap: Record<string, number> = {};

    for (let month = 1; month <= 9; month++) {
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const lastDayOfMonth = new Date(2026, month, 0).getDate();
      const payDate = `2026-${monthStr}-${lastDayOfMonth}`;

      for (const emp of employees) {
        // Amounts
        const amounts: SalaryAmounts = {
          basic: emp.package.basic,
          housing: emp.package.housing,
          transport: emp.package.transport,
          other_allow: emp.package.other_allow,
          overtime: 0,
          bonus: 0,
          other_earn: 0,
          social_sec: 0,
          income_tax: 0,
          other_ded: 0,
          advance: 0,
          unpaid_leave: 0,
        };

        const earnings: SalaryRecord['earnings'] = emp.allowances.map((a) => {
          const amt = a.method === 'percent' ? (emp.package.basic * a.value) / 100 : a.value;
          return {
            name: a.name,
            amount: amt,
            taxable: a.taxable,
            ssc: a.ssc,
          };
        });

        const deductions: SalaryRecord['deductions'] = emp.deductions.map((d) => {
          const amt = d.method === 'percent' ? (emp.package.basic * d.value) / 100 : d.value;
          return {
            name: d.name,
            amount: amt,
            preTax: d.preTax,
          };
        });

        // Check active loans
        const empLoans = loans.filter(
          (l) =>
            l.empId === emp.empId &&
            !l.settled &&
            (2026 > l.startYear || (2026 === l.startYear && month >= l.startMonth))
        );

        for (const loan of empLoans) {
          const paidSoFar = loanPaidMap[loan.id] || 0;
          const remaining = Math.max(0, loan.total - paidSoFar);
          if (remaining > 0) {
            const installment = Math.min(loan.installment, remaining);
            deductions.push({
              name: loan.description,
              amount: installment,
              preTax: false,
              loanId: loan.id,
            });
            loanPaidMap[loan.id] = paidSoFar + installment;
          }
        }

        const calc = calculatePayroll(
          emp,
          2026,
          month,
          amounts,
          earnings,
          deductions,
          emp.claimsFamily,
          emp.extraExemption,
          ruleSets
        );

        amounts.social_sec = calc.ssc;
        amounts.income_tax = calc.incomeTax;

        records.push({
          id: `${company.id}_${emp.empId}_2026_${month}`,
          companyId: company.id,
          empId: emp.empId,
          name: emp.name,
          nameAr: emp.nameAr,
          title: emp.title,
          dept: emp.department,
          year: 2026,
          month,
          payDate,
          payMethod: 'Bank transfer',
          currency: company.currency,
          amounts,
          earnings,
          deductions,
          gross: calc.gross,
          totalDed: calc.totalDed,
          net: calc.net,
          claimsFamily: !!emp.claimsFamily,
          extraExemption: emp.extraExemption || 0,
          autoCalc: true,
        });
      }
    }

    return records;
  };

  const alNoorRecords = generateRecords(alNoor, alNoorEmployees, alNoorLoans);
  const petraRecords = generateRecords(petra, petraEmployees, petraLoans);
  const ammanMedRecords = generateRecords(ammanMed, ammanMedEmployees, ammanMedLoans);

  // Sample October 2026 inputs for Amman Medical Center (as referenced in Section 14)
  const ammanMedInputs: MonthlyInput[] = [
    {
      id: 'input_amman_1',
      companyId: ammanMedId,
      empId: 'M03',
      year: 2026,
      month: 10,
      kind: 'salary',
      item: 'overtime',
      amount: 75,
      notes: 'Extra emergency shift in ICU',
    },
    {
      id: 'input_amman_2',
      companyId: ammanMedId,
      empId: 'M04',
      year: 2026,
      month: 10,
      kind: 'allowance',
      item: 'Night Shift',
      amount: 120, // usual is 80
      notes: 'Additional 2 night shifts',
    },
    {
      id: 'input_amman_3',
      companyId: ammanMedId,
      empId: 'M05',
      year: 2026,
      month: 10,
      kind: 'salary',
      item: 'bonus',
      amount: 100,
      notes: 'Quarterly lab audit excellence reward',
    },
  ];

  // Save all to IndexedDB
  await putManyInStore('companies', [alNoor, petra, ammanMed]);
  await putManyInStore('employees', [...alNoorEmployees, ...petraEmployees, ...ammanMedEmployees]);
  await putManyInStore('loans', [...alNoorLoans, ...petraLoans, ...ammanMedLoans]);
  await putManyInStore('salary_records', [...alNoorRecords, ...petraRecords, ...ammanMedRecords]);
  await putManyInStore('monthly_inputs', ammanMedInputs);

  await setAppState('lastCompanyId', alNoorId);
  await setAppState('lastPeriod', { year: 2026, month: 10 });
}
