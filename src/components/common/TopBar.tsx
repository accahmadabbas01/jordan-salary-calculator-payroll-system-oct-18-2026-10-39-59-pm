import React, { useState } from 'react';
import { Company, User } from '../../types';
import { ENGLISH_MONTHS, ARABIC_MONTHS, YEAR_OPTIONS } from '../../utils/calculator';
import {
  Building2,
  Calendar,
  User as UserIcon,
  Plus,
  LogOut,
  KeyRound,
  Menu,
} from 'lucide-react';

interface TopBarProps {
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onNewCompany: () => void;
  year: number;
  month: number;
  onChangePeriod: (year: number, month: number) => void;
  currentUser: User | null;
  onSignOut: () => void;
  onChangePassword: () => void;
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onNewCompany,
  year,
  month,
  onChangePeriod,
  currentUser,
  onSignOut,
  onChangePassword,
  onToggleMobileMenu,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const currentCompany = companies.find((c) => c.id === selectedCompanyId);

  const availableYears = YEAR_OPTIONS;

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:px-6 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Left: Mobile Toggle & Company Selector */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Company Dropdown */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedCompanyId}
              onChange={(e) => onSelectCompany(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden cursor-pointer max-w-[180px] md:max-w-[260px] truncate"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id} className="dark:bg-slate-900">
                  {c.name} {c.isSample ? '(Sample)' : ''}
                </option>
              ))}
            </select>
          </div>

          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={onNewCompany}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Add New Company"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Center: Period Selector */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs md:text-sm">
        <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
        <select
          value={month}
          onChange={(e) => onChangePeriod(year, parseInt(e.target.value, 10))}
          className="bg-transparent font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden cursor-pointer"
        >
          {ENGLISH_MONTHS.map((name, i) => (
            <option key={i + 1} value={i + 1} className="dark:bg-slate-900">
              {name} ({ARABIC_MONTHS[i]})
            </option>
          ))}
        </select>
        <span className="text-slate-400">/</span>
        <select
          value={year}
          onChange={(e) => onChangePeriod(parseInt(e.target.value, 10), month)}
          className="bg-transparent font-medium text-slate-900 dark:text-slate-100 focus:outline-hidden cursor-pointer font-mono"
        >
          {availableYears.map((y) => (
            <option key={y} value={y} className="dark:bg-slate-900">
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Right: User Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-xs uppercase">
            {currentUser?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              {currentUser?.fullName}
            </div>
            <div className="text-[11px] text-slate-500 capitalize leading-tight">
              {currentUser?.role === 'payroll_officer'
                ? 'Payroll Officer'
                : currentUser?.role || 'Viewer'}
            </div>
          </div>
        </button>

        {userMenuOpen && (
          <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 text-xs">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 lg:hidden">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {currentUser?.fullName}
              </div>
              <div className="text-slate-500 capitalize">
                Role: {currentUser?.role}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                onChangePassword();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
            >
              <KeyRound className="w-4 h-4 text-slate-400" />
              <span>Change Password</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen(false);
                onSignOut();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left border-t border-slate-100 dark:border-slate-800"
            >
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
