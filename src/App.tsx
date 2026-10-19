/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Company,
  Employee,
  SalaryRecord,
  Loan,
  MonthlyInput,
  Clearance,
  User,
  ActivityLog,
  PayrollRuleSet,
  TeamComment,
} from './types';
import {
  getDB,
  getAllFromStore,
  getFromStore,
  putInStore,
  putManyInStore,
  deleteFromStore,
  clearStore,
  getAppState,
  setAppState,
  logActivity,
  initRules,
  hasUsers,
  createAdminUser,
  deleteCompanyCascade,
  seedSampleCompanies,
} from './db/indexedDB';
import { verifyPassword } from './utils/crypto';
import { seedFullTestCompany, FULL_TEST_COMPANY_ID } from './db/seedFullTest';
import { setActiveRuleSets } from './utils/calculator';
import { TopBar } from './components/common/TopBar';
import { Sidebar, ScreenId } from './components/common/Sidebar';
import { InitialAdminSetup, SignInScreen, ChangePasswordModal } from './components/auth/AuthViews';

// Screens
import { DashboardScreen } from './components/screens/DashboardScreen';
import { EmployeesScreen } from './components/screens/EmployeesScreen';
import { LoansScreen } from './components/screens/LoansScreen';
import { SalaryEntryScreen } from './components/screens/SalaryEntryScreen';
import { PayrollRunScreen } from './components/screens/PayrollRunScreen';
import { MonthlyInputsScreen } from './components/screens/MonthlyInputsScreen';
import { SalaryHistoryScreen } from './components/screens/SalaryHistoryScreen';
import { PayslipsScreen } from './components/screens/PayslipsScreen';
import { ClearancesScreen } from './components/screens/ClearancesScreen';
import { MaternityLeaveScreen } from './components/screens/MaternityLeaveScreen';
import { TeamNotesScreen } from './components/screens/TeamNotesScreen';
import { CommentsContext } from './components/common/Comments';
import { ReportsScreen } from './components/screens/ReportsScreen';
import { CompanySettingsScreen } from './components/screens/CompanySettingsScreen';
import { UsersActivityScreen } from './components/screens/UsersActivityScreen';
import {
  ExcelImportExportModal,
  ScreenImportExportType,
} from './components/common/ExcelImportExportModal';
import { CloudSyncButton } from './components/common/CloudSyncPanel';
import { useCloudSync } from './hooks/useCloudSync';
import { FileSpreadsheet, MessagesSquare } from 'lucide-react';

// Which Excel import/export each screen offers.
const SCREEN_EXCEL: Record<ScreenId, { type: ScreenImportExportType; label: string }> = {
  dashboard: { type: 'salaries', label: 'Salaries' },
  employees: { type: 'employees', label: 'Employees' },
  loans: { type: 'loans', label: 'Loans' },
  salary_entry: { type: 'salaries', label: 'Salaries' },
  payroll_run: { type: 'salaries', label: 'Salaries' },
  monthly_inputs: { type: 'monthly_inputs', label: 'Monthly Inputs' },
  salary_history: { type: 'salary_history', label: 'Salary History' },
  payslips: { type: 'salaries', label: 'Salaries' },
  clearances: { type: 'clearances', label: 'Clearances' },
  maternity: { type: 'salaries', label: 'Salaries' },
  team_notes: { type: 'salaries', label: 'Salaries' },
  reports: { type: 'salary_history', label: 'Salary History' },
  company_settings: { type: 'full_backup', label: 'Full Workbook' },
  users: { type: 'users', label: 'Users' },
  activity_log: { type: 'activity_logs', label: 'Activity Log' },
};

function mergeById<T>(prev: T[], incoming: T[], key: (item: T) => string): T[] {
  const map = new Map(incoming.map((i) => [key(i), i]));
  return [...prev.filter((p) => !map.has(key(p))), ...incoming];
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Core Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [monthlyInputs, setMonthlyInputs] = useState<MonthlyInput[]>([]);
  const [clearances, setClearances] = useState<Clearance[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [ruleSets, setRuleSets] = useState<PayrollRuleSet[]>([]);
  const [comments, setComments] = useState<TeamComment[]>([]);
  const [notesSeenAt, setNotesSeenAt] = useState<string>('');

  // Navigation & Selection State
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('dashboard');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [year, setYear] = useState<number>(2026);
  const [month, setMonth] = useState<number>(10);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // UI state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [excelType, setExcelType] = useState<ScreenImportExportType | null>(null);
  // Which Company Settings tab to open (e.g. "types" from Salary Entry)
  const [settingsTab, setSettingsTab] = useState<'profile' | 'types' | 'data' | 'rules'>('profile');

  // Initial Load from IndexedDB
  const refreshAllData = useCallback(async () => {
    try {
      const dbUsersExist = await hasUsers();
      setHasAdmin(dbUsersExist);

      if (!dbUsersExist) {
        setIsLoading(false);
        return;
      }

      const [
        fetchedCompanies,
        fetchedEmployees,
        fetchedRecords,
        fetchedLoans,
        fetchedInputs,
        fetchedClearances,
        fetchedUsers,
        fetchedLogs,
        fetchedRules,
        fetchedComments,
      ] = await Promise.all([
        getAllFromStore<Company>('companies'),
        getAllFromStore<Employee>('employees'),
        getAllFromStore<SalaryRecord>('salary_records'),
        getAllFromStore<Loan>('loans'),
        getAllFromStore<MonthlyInput>('monthly_inputs'),
        getAllFromStore<Clearance>('clearances'),
        getAllFromStore<User>('users'),
        getAllFromStore<ActivityLog>('activity_logs'),
        initRules(),
        getAllFromStore<TeamComment>('comments'),
      ]);

      setCompanies(fetchedCompanies);
      setEmployees(fetchedEmployees);
      setRecords(fetchedRecords);
      setLoans(fetchedLoans);
      setMonthlyInputs(fetchedInputs);
      setClearances(fetchedClearances);
      setUsers(fetchedUsers);
      setLogs(fetchedLogs.sort((a, b) => b.when.localeCompare(a.when)));
      setRuleSets(fetchedRules);
      setComments(fetchedComments);

      // Check current session
      const savedUser = await getAppState<string | null>('currentUser', null);
      if (savedUser) {
        const found = fetchedUsers.find((u) => u.username === savedUser && u.active);
        setCurrentUser(found || null);
      }

      // Check last period and screen
      const savedPeriod = await getAppState<{ year: number; month: number } | null>(
        'lastPeriod',
        null
      );
      if (savedPeriod) {
        setYear(savedPeriod.year);
        setMonth(savedPeriod.month);
      }

      const savedScreen = await getAppState<ScreenId>('lastScreen', 'dashboard');
      setCurrentScreen(savedScreen);

      // Check last company
      const lastCompId = await getAppState<string>('lastCompanyId', '');
      if (lastCompId && fetchedCompanies.some((c) => c.id === lastCompId)) {
        setSelectedCompanyId(lastCompId);
      } else if (fetchedCompanies.length > 0) {
        setSelectedCompanyId(fetchedCompanies[0].id);
      }
    } catch (e) {
      console.error('Database load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Everything that is mirrored to the cloud.
  const syncData = useMemo(
    () => ({
      companies,
      employees,
      records,
      loans,
      inputs: monthlyInputs,
      clearances,
      users,
      ruleSets,
      comments,
    }),
    [companies, employees, records, loans, monthlyInputs, clearances, users, ruleSets, comments]
  );

  const cloud = useCloudSync({
    ready: !isLoading && hasAdmin === true,
    data: syncData,
    onRemoteApplied: refreshAllData,
  });

  // Pull the cloud copy first so a fresh device or browser opens with the saved data.
  useEffect(() => {
    (async () => {
      try {
        await cloud.initialPull();
      } catch (e) {
        console.warn('Cloud pull failed:', e);
      }
      await refreshAllData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cloudButtonProps = {
    status: cloud.status,
    message: cloud.message,
    lastSyncedAt: cloud.lastSyncedAt,
    onConnect: cloud.connect,
    onSyncNow: cloud.syncNow,
    onLoadFromCloud: cloud.loadFromCloud,
    onOverwriteCloud: cloud.overwriteCloud,
  };

  // Handle Initial Admin Setup
  const handleCreateAdmin = async (
    username: string,
    fullName: string,
    passwordPlain: string
  ) => {
    const admin = await createAdminUser(username, fullName, passwordPlain);
    setUsers([admin]);
    setCurrentUser(admin);
    setHasAdmin(true);
    await setAppState('currentUser', admin.username);

    // If no companies exist, automatically seed sample companies
    const existingComps = await getAllFromStore<Company>('companies');
    if (existingComps.length === 0) {
      await seedSampleCompanies();
      await refreshAllData();
    }
  };

  // Handle Sign In
  const handleSignIn = async (
    username: string,
    passwordPlain: string,
    keepSignedIn: boolean
  ): Promise<string | null> => {
    const user = users.find((u) => u.username === username.toLowerCase().trim());
    if (!user) {
      return 'Invalid username or password.';
    }
    if (!user.active) {
      return 'Account has been deactivated. Please contact an administrator.';
    }

    const isValid = await verifyPassword(passwordPlain, user.passwordHash);
    if (!isValid) {
      return 'Invalid username or password.';
    }

    // Check company permissions for non-admin
    if (user.role !== 'admin' && user.companyIds.length === 0) {
      return 'No company has been given to your account yet.';
    }

    setCurrentUser(user);
    if (keepSignedIn) {
      await setAppState('currentUser', user.username);
    }
    await logActivity(user.username, 'Sign In', `${user.fullName} signed in`);

    // Ensure selected company is accessible
    if (user.role !== 'admin' && !user.companyIds.includes(selectedCompanyId)) {
      if (user.companyIds.length > 0) {
        setSelectedCompanyId(user.companyIds[0]);
      }
    }

    return null;
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    if (currentUser) {
      await logActivity(currentUser.username, 'Sign Out', `${currentUser.fullName} signed out`);
    }
    setCurrentUser(null);
    await setAppState('currentUser', null);
  };

  // Change Password for Current User
  const handleSaveCurrentPassword = async (newHash: string) => {
    if (!currentUser) return;
    const updated = { ...currentUser, passwordHash: newHash };
    await putInStore('users', updated);
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => (u.username === updated.username ? updated : u)));
    await logActivity(currentUser.username, 'Password Changed', 'User changed their own password');
  };

  // Screen Navigation with State Persistence
  const handleNavigate = (screen: ScreenId) => {
    setCurrentScreen(screen);
    setAppState('lastScreen', screen);
  };

  // Period Change
  const handleChangePeriod = (newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
    setAppState('lastPeriod', { year: newYear, month: newMonth });
  };

  // Company Selection
  const handleSelectCompany = (compId: string) => {
    setSelectedCompanyId(compId);
    setAppState('lastCompanyId', compId);
    // Reset selected employee for this company
    const firstEmp = employees.find((e) => e.companyId === compId);
    setSelectedEmpId(firstEmp?.empId || '');
  };

  // Accessible Companies for Current User
  const accessibleCompanies = companies.filter((c) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.companyIds.includes(c.id);
  });

  const currentCompany =
    companies.find((c) => c.id === selectedCompanyId) || accessibleCompanies[0] || companies[0];

  const currentCompanyEmployees = employees.filter((e) => e.companyId === currentCompany?.id);
  const currentCompanyRecords = records.filter((r) => r.companyId === currentCompany?.id);
  const currentCompanyLoans = loans.filter((l) => l.companyId === currentCompany?.id);
  const currentCompanyInputs = monthlyInputs.filter((i) => i.companyId === currentCompany?.id);
  const currentCompanyClearances = clearances.filter((c) => c.companyId === currentCompany?.id);

  // DATA HANDLERS

  // Save / Update Employee
  const handleSaveEmployee = async (emp: Employee) => {
    await putInStore('employees', emp);
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === emp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = emp;
        return next;
      }
      return [...prev, emp];
    });
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Save Employee',
        `Saved employee ${emp.name} (${emp.empId})`,
        emp.companyId
      );
    }
  };

  // Delete Employee
  const handleDeleteEmployee = async (targetEmpId: string) => {
    const emp = currentCompanyEmployees.find((e) => e.empId === targetEmpId);
    if (!emp) return;
    await deleteFromStore('employees', emp.id);
    setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Delete Employee',
        `Deleted employee ${emp.name} (${emp.empId})`,
        emp.companyId
      );
    }
  };

  // Save / Update Salary Record
  const handleSaveRecord = async (record: SalaryRecord) => {
    await putInStore('salary_records', record);
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = record;
        return next;
      }
      return [...prev, record];
    });
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Save Salary Record',
        `Saved salary for ${record.name} (${record.month}/${record.year}) - Net: ${record.net}`,
        record.companyId
      );
    }
  };

  // Delete Salary Record
  const handleDeleteRecord = async (recordId: string) => {
    await deleteFromStore('salary_records', recordId);
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Delete Salary Record',
        `Deleted record ${recordId}`,
        currentCompany?.id
      );
    }
  };

  // Save / Update Loan
  const handleSaveLoan = async (loan: Loan) => {
    await putInStore('loans', loan);
    setLoans((prev) => {
      const idx = prev.findIndex((l) => l.id === loan.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = loan;
        return next;
      }
      return [...prev, loan];
    });
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Save Staff Loan',
        `Loan for ${loan.empId}: ${loan.total} JOD (${loan.installment}/mo)`,
        loan.companyId
      );
    }
  };

  // Delete Loan
  const handleDeleteLoan = async (loanId: string) => {
    await deleteFromStore('loans', loanId);
    setLoans((prev) => prev.filter((l) => l.id !== loanId));
    if (currentUser) {
      await logActivity(currentUser.username, 'Delete Loan', `Deleted loan ${loanId}`, currentCompany?.id);
    }
  };

  // Save Monthly Input
  const handleSaveInput = async (input: MonthlyInput) => {
    await putInStore('monthly_inputs', input);
    setMonthlyInputs((prev) => {
      const idx = prev.findIndex((i) => i.id === input.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = input;
        return next;
      }
      return [...prev, input];
    });
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Save Monthly Input',
        `Input for ${input.empId}: ${input.item} = ${input.amount}`,
        input.companyId
      );
    }
  };

  // Team comments
  const handleSaveComment = async (comment: TeamComment) => {
    const isNew = !comments.some((c) => c.id === comment.id);
    await putInStore('comments', comment);
    setComments((prev) => mergeById(prev, [comment], (c) => c.id));
    if (currentUser && isNew) {
      await logActivity(
        currentUser.username,
        comment.parentId ? 'Reply' : 'Comment',
        `${comment.entityLabel}: ${comment.text.slice(0, 80)}`,
        comment.companyId
      );
    }
  };

  const handleRemoveComments = async (ids: string[]) => {
    for (const id of ids) await deleteFromStore('comments', id);
    setComments((prev) => prev.filter((c) => !ids.includes(c.id)));
  };

  // Open the screen a comment belongs to
  const handleOpenCommentEntity = (c: TeamComment) => {
    if (c.year && c.month) handleChangePeriod(c.year, c.month);
    if (c.empId) setSelectedEmpId(c.empId);
    const screen: Record<TeamComment['entityType'], ScreenId> = {
      general: 'team_notes',
      employee: 'employees',
      salary: 'salary_entry',
      payroll_month: 'payroll_run',
      clearance: 'clearances',
      maternity: 'maternity',
    };
    handleNavigate(screen[c.entityType]);
  };

  // Save many monthly inputs at once (Smart Import)
  const handleSaveInputs = async (inputs: MonthlyInput[]) => {
    await putManyInStore('monthly_inputs', inputs);
    setMonthlyInputs((prev) => mergeById(prev, inputs, (i) => i.id));
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Smart Import',
        `Imported ${inputs.length} monthly inputs for ${inputs[0]?.month}/${inputs[0]?.year}`,
        inputs[0]?.companyId
      );
    }
  };

  // Delete Monthly Input
  const handleDeleteInput = async (inputId: string) => {
    await deleteFromStore('monthly_inputs', inputId);
    setMonthlyInputs((prev) => prev.filter((i) => i.id !== inputId));
  };

  // Execute Bulk Payroll Run
  const handleExecutePayrollRun = async (newRecords: SalaryRecord[]) => {
    let created = 0;
    let replaced = 0;

    for (const rec of newRecords) {
      const existing = records.find((r) => r.id === rec.id);
      if (existing) replaced++;
      else created++;
      await putInStore('salary_records', rec);
    }

    setRecords((prev) => {
      const newMap = new Map(newRecords.map((r) => [r.id, r]));
      const updated = prev.filter((r) => !newMap.has(r.id));
      return [...updated, ...newRecords];
    });

    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Bulk Payroll Run',
        `Executed bulk run: ${created} created, ${replaced} replaced`,
        currentCompany?.id
      );
    }

    return { created, replaced, skipped: 0 };
  };

  // Save Clearance Draft
  const handleSaveClearance = async (clearance: Clearance) => {
    await putInStore('clearances', clearance);
    setClearances((prev) => {
      const idx = prev.findIndex((c) => c.id === clearance.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = clearance;
        return next;
      }
      return [...prev, clearance];
    });
    // Editing a completed clearance keeps the employee's last working day in sync.
    if (clearance.status === 'completed') {
      const emp = employees.find(
        (e) => e.companyId === clearance.companyId && e.empId === clearance.empId
      );
      if (emp && emp.endDate !== clearance.lastDay) {
        const updatedEmp: Employee = { ...emp, status: 'resigned', endDate: clearance.lastDay };
        await putInStore('employees', updatedEmp);
        setEmployees((prev) => prev.map((e) => (e.id === emp.id ? updatedEmp : e)));
      }
    }
    if (currentUser) {
      await logActivity(
        currentUser.username,
        clearance.status === 'completed' ? 'Edit Clearance' : 'Save Clearance Draft',
        `Clearance draft for ${clearance.empId}`,
        clearance.companyId
      );
    }
  };

  // Complete Clearance (Sets employee Resigned + settles loans)
  const handleCompleteClearance = async (clearance: Clearance) => {
    const updatedClearance: Clearance = {
      ...clearance,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    await putInStore('clearances', updatedClearance);
    setClearances((prev) =>
      prev.map((c) => (c.id === updatedClearance.id ? updatedClearance : c))
    );

    // Turn employee status to resigned with endDate = lastDay
    const emp = employees.find(
      (e) => e.companyId === clearance.companyId && e.empId === clearance.empId
    );
    if (emp) {
      const updatedEmp: Employee = {
        ...emp,
        status: 'resigned',
        endDate: clearance.lastDay,
      };
      await putInStore('employees', updatedEmp);
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? updatedEmp : e)));
    }

    // Settle outstanding loans if deductLoans is true
    if (clearance.deductLoans) {
      const empLoans = loans.filter(
        (l) => l.companyId === clearance.companyId && l.empId === clearance.empId && !l.settled
      );
      for (const l of empLoans) {
        const settledLoan: Loan = {
          ...l,
          settled: true,
          settledByClearanceId: clearance.id,
        };
        await putInStore('loans', settledLoan);
      }
      setLoans((prev) =>
        prev.map((l) =>
          l.companyId === clearance.companyId && l.empId === clearance.empId
            ? { ...l, settled: true, settledByClearanceId: clearance.id }
            : l
        )
      );
    }

    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Complete Clearance',
        `Completed final settlement for ${clearance.empId} (Net: ${clearance.net})`,
        clearance.companyId
      );
    }
  };

  // Reopen Clearance to Draft
  const handleReopenClearance = async (clearanceId: string) => {
    const clearance = clearances.find((c) => c.id === clearanceId);
    if (!clearance) return;

    const draftClearance: Clearance = {
      ...clearance,
      status: 'draft',
      completedAt: undefined,
    };
    await putInStore('clearances', draftClearance);
    setClearances((prev) => prev.map((c) => (c.id === clearanceId ? draftClearance : c)));

    // Reopen employee
    const emp = employees.find(
      (e) => e.companyId === clearance.companyId && e.empId === clearance.empId
    );
    if (emp) {
      const restoredEmp: Employee = {
        ...emp,
        status: 'active',
      };
      await putInStore('employees', restoredEmp);
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? restoredEmp : e)));
    }

    // Un-settle loans
    const settledLoans = loans.filter((l) => l.settledByClearanceId === clearanceId);
    for (const l of settledLoans) {
      const openLoan: Loan = {
        ...l,
        settled: false,
        settledByClearanceId: undefined,
      };
      await putInStore('loans', openLoan);
    }
    setLoans((prev) =>
      prev.map((l) =>
        l.settledByClearanceId === clearanceId
          ? { ...l, settled: false, settledByClearanceId: undefined }
          : l
      )
    );

    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Reopen Clearance',
        `Reopened clearance for ${clearance.empId}`,
        clearance.companyId
      );
    }
  };

  // Delete Clearance (a completed one is first reverted: employee active again, loans reopened)
  const handleDeleteClearance = async (clearanceId: string) => {
    const clearance = clearances.find((c) => c.id === clearanceId);
    if (clearance?.status === 'completed') {
      await handleReopenClearance(clearanceId);
      const emp = employees.find(
        (e) => e.companyId === clearance.companyId && e.empId === clearance.empId
      );
      if (emp && emp.endDate === clearance.lastDay) {
        const restored: Employee = { ...emp, status: 'active', endDate: undefined };
        await putInStore('employees', restored);
        setEmployees((prev) => prev.map((e) => (e.id === emp.id ? restored : e)));
      }
    }
    await deleteFromStore('clearances', clearanceId);
    setClearances((prev) => prev.filter((c) => c.id !== clearanceId));
    if (currentUser && clearance) {
      await logActivity(
        currentUser.username,
        'Delete Clearance',
        `Deleted ${clearance.status} clearance for ${clearance.empId}`,
        clearance.companyId
      );
    }
  };

  // Create New Company
  const handleCreateCompany = async (
    name: string,
    address: string,
    taxNumber: string,
    currency: string
  ) => {
    const newComp: Company = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      address,
      taxNumber,
      currency: currency || 'JOD',
      allowanceTypes: [
        { name: 'Mobile Allowance', method: 'fixed', value: 30, taxable: true, ssc: true },
        { name: 'Fuel Allowance', method: 'fixed', value: 50, taxable: false, ssc: false },
      ],
      deductionTypes: [
        { name: 'Health Insurance', method: 'fixed', value: 25, preTax: true },
      ],
    };

    await putInStore('companies', newComp);
    setCompanies((prev) => [...prev, newComp]);
    setSelectedCompanyId(newComp.id);

    if (currentUser) {
      await logActivity(currentUser.username, 'Create Company', `Created company ${newComp.name}`);
    }
  };

  // Update Company
  const handleUpdateCompany = async (comp: Company) => {
    await putInStore('companies', comp);
    setCompanies((prev) => prev.map((c) => (c.id === comp.id ? comp : c)));
  };

  // Delete Company
  const handleDeleteCompany = async (compId: string) => {
    await deleteCompanyCascade(compId);
    const updatedComps = companies.filter((c) => c.id !== compId);
    setCompanies(updatedComps);
    if (updatedComps.length > 0) {
      setSelectedCompanyId(updatedComps[0].id);
    }
    await refreshAllData();
  };

  // Save / Update User
  const handleSaveUser = async (u: User) => {
    await putInStore('users', u);
    setUsers((prev) => {
      const idx = prev.findIndex((user) => user.username === u.username);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = u;
        return next;
      }
      return [...prev, u];
    });
    if (currentUser) {
      await logActivity(currentUser.username, 'Save User', `Updated user account ${u.username}`);
    }
  };

  // Delete User
  const handleDeleteUser = async (username: string) => {
    await deleteFromStore('users', username);
    setUsers((prev) => prev.filter((u) => u.username !== username));
    if (currentUser) {
      await logActivity(currentUser.username, 'Delete User', `Deleted user account ${username}`);
    }
  };

  // Restore Excel Backup
  const handleRestoreBackup = async (parsed: any, overwrite: boolean) => {
    await putManyInStore('companies', parsed.companies);
    await putManyInStore('employees', parsed.employees);
    await putManyInStore('loans', parsed.loans);

    if (overwrite) {
      await putManyInStore('salary_records', parsed.records);
    } else {
      // Skip existing
      const existingIds = new Set(records.map((r) => r.id));
      const newOnly = parsed.records.filter((r: any) => !existingIds.has(r.id));
      await putManyInStore('salary_records', newOnly);
    }

    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Excel Backup Restore',
        `Restored workbook backup: ${parsed.summary.recordsCount} records`
      );
    }

    await refreshAllData();
  };

  // Full JSON Database Restore
  const handleFullJSONRestore = async (json: any) => {
    if (json.companies) await putManyInStore('companies', json.companies);
    if (json.employees) await putManyInStore('employees', json.employees);
    if (json.records) await putManyInStore('salary_records', json.records);
    if (json.loans) await putManyInStore('loans', json.loans);
    if (json.inputs) await putManyInStore('monthly_inputs', json.inputs);
    if (json.clearances) await putManyInStore('clearances', json.clearances);
    if (json.users) await putManyInStore('users', json.users);
    await refreshAllData();
  };

  // Mock / Hook Email Payslip
  const handleEmailPayslip = async (record: SalaryRecord): Promise<boolean> => {
    const updated = {
      ...record,
      emailedAt: new Date().toISOString(),
    };
    await putInStore('salary_records', updated);
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (currentUser) {
      await logActivity(
        currentUser.username,
        'Email Payslip',
        `Emailed payslip to ${record.name} (${record.empId}) for ${record.month}/${record.year}`,
        record.companyId
      );
    }
    return true;
  };

  // Helper to fetch complete database object for export
  const getFullDataForBackup = async () => {
    return {
      companies,
      employees,
      records,
      loans,
      inputs: monthlyInputs,
      clearances,
      users,
    };
  };

  const fullScopeExcel = excelType === 'full_backup' && currentUser?.role === 'admin';

  // Team notes: comments for this company, and how many new ones concern the current user
  const companyComments = comments.filter((c) => c.companyId === currentCompany?.id);
  const myThreadIds = new Set(
    companyComments.filter((c) => c.author === currentUser?.username).map((c) => c.parentId || c.id)
  );
  const unreadNotes = companyComments.filter(
    (c) =>
      c.author !== currentUser?.username &&
      c.createdAt > notesSeenAt &&
      (c.mentions.includes(currentUser?.username || '') ||
        myThreadIds.has(c.parentId || c.id) ||
        c.entityType === 'general')
  ).length;

  useEffect(() => {
    if (!currentUser) return;
    try {
      setNotesSeenAt(localStorage.getItem(`jordan_payroll_notes_seen_${currentUser.username}`) || '');
    } catch {
      setNotesSeenAt('');
    }
  }, [currentUser?.username]);

  useEffect(() => {
    if (currentScreen !== 'team_notes' || !currentUser) return;
    const now = new Date().toISOString();
    setNotesSeenAt(now);
    try {
      localStorage.setItem(`jordan_payroll_notes_seen_${currentUser.username}`, now);
    } catch {
      /* per-device convenience only */
    }
  }, [currentScreen, currentUser?.username, comments.length]);

  // Excel import from any screen
  const handleExcelImport = async (data: any, type: ScreenImportExportType) => {
    if (!currentCompany) return;
    let summary = '';

    if (type === 'employees') {
      const items = data as Employee[];
      await putManyInStore('employees', items);
      setEmployees((prev) => mergeById(prev, items, (e) => e.id));
      summary = `${items.length} employees`;
    } else if (type === 'loans') {
      const items = data as Loan[];
      await putManyInStore('loans', items);
      setLoans((prev) => mergeById(prev, items, (l) => l.id));
      summary = `${items.length} loans`;
    } else if (type === 'salaries' || type === 'salary_history') {
      const items = data as SalaryRecord[];
      await putManyInStore('salary_records', items);
      setRecords((prev) => mergeById(prev, items, (r) => r.id));
      summary = `${items.length} salary records`;
    } else if (type === 'monthly_inputs') {
      // Same rules as the upload on the Monthly Inputs screen.
      const rows = data as { empId: string; item: string; kind: string; amount: number; apply: string; notes?: string }[];
      const newInputs: MonthlyInput[] = [];
      const changedEmployees = new Map<string, Employee>();
      for (const row of rows) {
        const emp = currentCompanyEmployees.find((e) => e.empId.toLowerCase() === row.empId.toLowerCase());
        if (!emp) continue;
        const apply = row.apply.toLowerCase();
        if (apply.startsWith('from') || apply.startsWith('من')) {
          const updated = (changedEmployees.get(emp.id) ||
            (JSON.parse(JSON.stringify(emp)) as Employee));
          const lower = row.item.toLowerCase();
          if (lower.includes('basic')) updated.package.basic = row.amount;
          else if (lower.includes('housing')) updated.package.housing = row.amount;
          else if (lower.includes('transport')) updated.package.transport = row.amount;
          else if (lower.includes('other')) updated.package.other_allow = row.amount;
          changedEmployees.set(emp.id, updated);
        } else {
          const lowerKind = row.kind.toLowerCase();
          const kind: MonthlyInput['kind'] = lowerKind.includes('allowance')
            ? 'allowance'
            : lowerKind.includes('deduction')
            ? 'deduction'
            : 'salary';
          newInputs.push({
            id: `inp_${currentCompany.id}_${emp.empId}_${year}_${month}_${row.item.replace(/\s+/g, '_')}`,
            companyId: currentCompany.id,
            empId: emp.empId,
            year,
            month,
            kind,
            item: row.item,
            amount: row.amount,
            notes: row.notes,
          });
        }
      }
      const updatedEmps = [...changedEmployees.values()];
      await putManyInStore('monthly_inputs', newInputs);
      await putManyInStore('employees', updatedEmps);
      setMonthlyInputs((prev) => mergeById(prev, newInputs, (i) => i.id));
      setEmployees((prev) => mergeById(prev, updatedEmps, (e) => e.id));
      summary = `${newInputs.length} monthly inputs, ${updatedEmps.length} package changes`;
    } else if (type === 'full_backup') {
      await handleRestoreBackup(data, true);
      summary = `workbook (${data.summary.employeesCount} employees, ${data.summary.recordsCount} records)`;
    }

    if (currentUser) {
      await logActivity(currentUser.username, 'Excel Import', `Imported ${summary}`, currentCompany.id);
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-xs">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading Jordan Payroll System...</span>
        </div>
      </div>
    );
  }

  // Initial Admin Setup View
  if (hasAdmin === false) {
    return (
      <>
        <InitialAdminSetup onCreateAdmin={handleCreateAdmin} />
        <CloudSyncButton floating {...cloudButtonProps} />
      </>
    );
  }

  // Sign In Screen
  if (!currentUser) {
    return (
      <>
        <SignInScreen onSignIn={handleSignIn} />
        <CloudSyncButton floating {...cloudButtonProps} />
      </>
    );
  }

  // Handle No Companies Assigned for Non-Admin
  if (accessibleCompanies.length === 0 && currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl p-8 text-center space-y-4 shadow-xl">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Access Restricted
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No company has been given to your account yet. Please contact your system administrator to assign company access.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 bg-slate-900 text-white rounded font-medium text-xs hover:bg-slate-800"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 flex flex-col md:flex-row font-sans text-slate-900 dark:text-slate-100">
      {/* Sidebar Navigation */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={(screen) => {
          if (screen === 'company_settings') setSettingsTab('profile');
          handleNavigate(screen);
        }}
        userRole={currentUser.role}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Bar Navigation */}
        <TopBar
          companies={accessibleCompanies}
          selectedCompanyId={currentCompany?.id || ''}
          onSelectCompany={handleSelectCompany}
          onNewCompany={() => setCurrentScreen('company_settings')}
          year={year}
          month={month}
          onChangePeriod={handleChangePeriod}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onChangePassword={() => setIsChangePasswordOpen(true)}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        {/* Scrollable Screen Content */}
        <CommentsContext.Provider
          value={
            currentCompany
              ? {
                  comments: companyComments,
                  users,
                  currentUser,
                  companyId: currentCompany.id,
                  save: handleSaveComment,
                  remove: handleRemoveComments,
                }
              : null
          }
        >
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Per-screen Excel import/export + cloud save status */}
            <div className="flex flex-wrap items-center justify-end gap-2 -mb-3">
              <CloudSyncButton {...cloudButtonProps} />
              <button
                type="button"
                onClick={() => handleNavigate('team_notes')}
                className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                title="Team notes and comments"
              >
                <MessagesSquare className="w-3.5 h-3.5" />
                <span>Team notes</span>
                {unreadNotes > 0 && (
                  <span className="px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{unreadNotes}</span>
                )}
              </button>
              {currentCompany && (
                <button
                  type="button"
                  onClick={() => setExcelType(SCREEN_EXCEL[currentScreen].type)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel: {SCREEN_EXCEL[currentScreen].label}</span>
                </button>
              )}
            </div>

            {/* Screen Routing */}
            {currentScreen === 'dashboard' && currentCompany && (
              <DashboardScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                loans={currentCompanyLoans}
                clearances={currentCompanyClearances}
                recentLogs={logs.filter((l) => !l.companyId || l.companyId === currentCompany.id)}
                year={year}
                month={month}
                userRole={currentUser.role}
                onNavigateToSalaryEntry={(empId) => {
                  setSelectedEmpId(empId);
                  handleNavigate('salary_entry');
                }}
                onNavigateToPayrollRun={() => handleNavigate('payroll_run')}
                onDeleteRecord={handleDeleteRecord}
              />
            )}

            {currentScreen === 'employees' && currentCompany && (
              <EmployeesScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                loans={currentCompanyLoans}
                year={year}
                month={month}
                userRole={currentUser.role}
                onSaveEmployee={handleSaveEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onNavigateToSalaryEntry={(empId) => {
                  setSelectedEmpId(empId);
                  handleNavigate('salary_entry');
                }}
                onNavigateToAddLoan={(empId) => {
                  setSelectedEmpId(empId);
                  handleNavigate('loans');
                }}
                onExportEmployees={() => setExcelType('employees')}
              />
            )}

            {currentScreen === 'loans' && currentCompany && (
              <LoansScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                loans={currentCompanyLoans}
                records={currentCompanyRecords}
                userRole={currentUser.role}
                onSaveLoan={handleSaveLoan}
                onDeleteLoan={handleDeleteLoan}
              />
            )}

            {currentScreen === 'salary_entry' && currentCompany && (
              <SalaryEntryScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                loans={currentCompanyLoans}
                monthlyInputs={currentCompanyInputs}
                selectedEmpId={selectedEmpId}
                onSelectEmployee={setSelectedEmpId}
                year={year}
                month={month}
                userRole={currentUser.role}
                onSaveRecord={handleSaveRecord}
                onDeleteRecord={handleDeleteRecord}
                onEmailPayslip={handleEmailPayslip}
                onUpdateCompany={handleUpdateCompany}
                onManageTypes={() => {
                  setSettingsTab('types');
                  handleNavigate('company_settings');
                }}
              />
            )}

            {currentScreen === 'payroll_run' && currentCompany && (
              <PayrollRunScreen
                company={currentCompany}
                allAccessibleCompanies={accessibleCompanies}
                employees={employees}
                records={records}
                loans={loans}
                monthlyInputs={monthlyInputs}
                initialYear={year}
                initialMonth={month}
                userRole={currentUser.role}
                onExecutePayrollRun={handleExecutePayrollRun}
                onSaveInputs={handleSaveInputs}
              />
            )}

            {currentScreen === 'monthly_inputs' && currentCompany && (
              <MonthlyInputsScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                monthlyInputs={currentCompanyInputs}
                year={year}
                month={month}
                userRole={currentUser.role}
                onSaveInput={handleSaveInput}
                onDeleteInput={handleDeleteInput}
                onUpdateEmployeePackage={handleSaveEmployee}
                onNavigateToPayrollRun={() => handleNavigate('payroll_run')}
                onSaveInputs={handleSaveInputs}
              />
            )}

            {currentScreen === 'salary_history' && currentCompany && (
              <SalaryHistoryScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                onOpenSalaryEntry={(empId, recYear, recMonth) => {
                  setSelectedEmpId(empId);
                  setYear(recYear);
                  setMonth(recMonth);
                  handleNavigate('salary_entry');
                }}
              />
            )}

            {currentScreen === 'payslips' && currentCompany && (
              <PayslipsScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                year={year}
                month={month}
                userRole={currentUser.role}
                onSendEmailPayslip={handleEmailPayslip}
              />
            )}

            {currentScreen === 'clearances' && currentCompany && (
              <ClearancesScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                clearances={currentCompanyClearances}
                loans={currentCompanyLoans}
                records={currentCompanyRecords}
                userRole={currentUser.role}
                onSaveClearance={handleSaveClearance}
                onCompleteClearance={handleCompleteClearance}
                onReopenClearance={handleReopenClearance}
                onDeleteClearance={handleDeleteClearance}
              />
            )}

            {currentScreen === 'maternity' && currentCompany && (
              <MaternityLeaveScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                userRole={currentUser.role}
                onSaveEmployee={handleSaveEmployee}
              />
            )}

            {currentScreen === 'team_notes' && currentCompany && (
              <TeamNotesScreen onOpenEntity={handleOpenCommentEntity} />
            )}

            {currentScreen === 'reports' && currentCompany && (
              <ReportsScreen
                company={currentCompany}
                employees={currentCompanyEmployees}
                records={currentCompanyRecords}
                clearances={currentCompanyClearances}
                year={year}
                month={month}
              />
            )}

            {currentScreen === 'company_settings' && currentCompany && (
              <CompanySettingsScreen
                key={settingsTab}
                initialTab={settingsTab}
                currentCompany={currentCompany}
                allCompanies={accessibleCompanies}
                ruleSets={ruleSets}
                userRole={currentUser.role}
                onUpdateCompany={handleUpdateCompany}
                onNewCompany={handleCreateCompany}
                onDeleteCompany={handleDeleteCompany}
                onRestoreBackup={handleRestoreBackup}
                onFullJSONRestore={handleFullJSONRestore}
                onSeedSampleCompanies={async () => {
                  await seedSampleCompanies();
                  await refreshAllData();
                }}
                onSeedFullTest={async () => {
                  await seedFullTestCompany(currentUser.username);
                  await refreshAllData();
                  setSelectedCompanyId(FULL_TEST_COMPANY_ID);
                  handleChangePeriod(2026, 10);
                  if (currentUser) {
                    await logActivity(currentUser.username, 'Load Test Company', 'Loaded Full System Test Co.');
                  }
                }}
                getFullDataForBackup={getFullDataForBackup}
                onUpdateRuleSets={(rules) => {
                  setRuleSets(rules);
                  setActiveRuleSets(rules);
                  for (const r of rules) {
                    putInStore('rule_sets', r);
                  }
                }}
              />
            )}

            {currentScreen === 'users' && currentUser.role === 'admin' && (
              <UsersActivityScreen
                users={users}
                companies={companies}
                logs={logs}
                currentUser={currentUser}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}

            {currentScreen === 'activity_log' && currentUser.role === 'admin' && (
              <UsersActivityScreen
                users={users}
                companies={companies}
                logs={logs}
                currentUser={currentUser}
                onSaveUser={handleSaveUser}
                onDeleteUser={handleDeleteUser}
              />
            )}
          </div>
        </main>
        </CommentsContext.Provider>
      </div>

      {/* Excel Import / Export (the full workbook covers every company only for admins) */}
      {excelType && currentCompany && (
        <ExcelImportExportModal
          key={excelType}
          type={excelType}
          company={currentCompany}
          allCompanies={fullScopeExcel ? companies : accessibleCompanies}
          employees={fullScopeExcel ? employees : currentCompanyEmployees}
          records={fullScopeExcel ? records : currentCompanyRecords}
          loans={fullScopeExcel ? loans : currentCompanyLoans}
          clearances={currentCompanyClearances}
          monthlyInputs={currentCompanyInputs}
          users={users}
          logs={logs}
          ruleSets={ruleSets}
          year={year}
          month={month}
          canImport={currentUser.role !== 'viewer'}
          onClose={() => setExcelType(null)}
          onImportComplete={handleExcelImport}
        />
      )}

      {/* Change Password Modal */}
      {isChangePasswordOpen && currentUser && (
        <ChangePasswordModal
          user={currentUser}
          onClose={() => setIsChangePasswordOpen(false)}
          onSavePassword={handleSaveCurrentPassword}
        />
      )}
    </div>
  );
}
