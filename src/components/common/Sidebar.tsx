import React from 'react';
import { UserRole } from '../../types';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Calculator,
  PlayCircle,
  FileSpreadsheet,
  History,
  FileText,
  UserMinus,
  BarChart3,
  Settings,
  ShieldCheck,
  ScrollText,
  Baby,
  MessagesSquare,
} from 'lucide-react';

export type ScreenId =
  | 'dashboard'
  | 'employees'
  | 'loans'
  | 'salary_entry'
  | 'payroll_run'
  | 'monthly_inputs'
  | 'salary_history'
  | 'payslips'
  | 'clearances'
  | 'maternity'
  | 'team_notes'
  | 'reports'
  | 'company_settings'
  | 'users'
  | 'activity_log';

interface SidebarProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  userRole?: UserRole;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  userRole = 'viewer',
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems = [
    { id: 'dashboard', labelEn: 'Dashboard', labelAr: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'employees', labelEn: 'Employees', labelAr: 'الموظفون', icon: Users },
    { id: 'loans', labelEn: 'Loans', labelAr: 'القروض', icon: CreditCard },
    { id: 'salary_entry', labelEn: 'Salary Entry', labelAr: 'إدخال الراتب', icon: Calculator },
    { id: 'payroll_run', labelEn: 'Payroll Run', labelAr: 'تشغيل الرواتب', icon: PlayCircle },
    { id: 'monthly_inputs', labelEn: 'Monthly Inputs', labelAr: 'مدخلات الشهر', icon: FileSpreadsheet },
    { id: 'salary_history', labelEn: 'Salary History', labelAr: 'سجل الرواتب', icon: History },
    { id: 'payslips', labelEn: 'Payslips', labelAr: 'قسائم الرواتب', icon: FileText },
    { id: 'clearances', labelEn: 'Clearances', labelAr: 'براءة الذمة', icon: UserMinus },
    { id: 'maternity', labelEn: 'Maternity Leave', labelAr: 'إجازة الأمومة', icon: Baby },
    { id: 'reports', labelEn: 'Reports', labelAr: 'التقارير', icon: BarChart3 },
    { id: 'team_notes', labelEn: 'Team Notes', labelAr: 'ملاحظات الفريق', icon: MessagesSquare },
    { id: 'company_settings', labelEn: 'Company Settings', labelAr: 'إعدادات الشركة', icon: Settings },
  ];

  const adminItems = [
    { id: 'users', labelEn: 'Users & Access', labelAr: 'المستخدمون والصلاحيات', icon: ShieldCheck },
    { id: 'activity_log', labelEn: 'Activity Log', labelAr: 'سجل النشاطات', icon: ScrollText },
  ];

  const handleNav = (screen: ScreenId) => {
    onNavigate(screen);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-slate-900 text-slate-100 flex flex-col z-50 transform transition-transform duration-200 ease-in-out ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* App Title Header */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white shadow-xs">
            JD
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white">Salary Calculator</div>
            <div className="text-[11px] font-arabic text-slate-400">نظام احتساب الرواتب الأردني</div>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id as ScreenId)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <div className="truncate">
                  <div className="leading-tight">{item.labelEn}</div>
                  <div className="text-[10px] font-arabic text-slate-500 leading-tight">
                    {item.labelAr}
                  </div>
                </div>
              </button>
            );
          })}

          {userRole === 'admin' && (
            <div className="pt-4 mt-4 border-t border-slate-800 space-y-1">
              <div className="px-3 text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                Administration
              </div>
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id as ScreenId)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                      isActive
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    <div className="truncate">
                      <div className="leading-tight">{item.labelEn}</div>
                      <div className="text-[10px] font-arabic text-slate-500 leading-tight">
                        {item.labelAr}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500">
          <div>Social Security Law No. 1/2014</div>
          <div>Income Tax Law No. 34/2014</div>
        </div>
      </aside>
    </>
  );
};
