import React, { useState, useRef, useEffect } from 'react';
import { Employee } from '../../types';
import { Search, ChevronDown, Check } from 'lucide-react';

interface SearchableEmployeeSelectProps {
  employees: Employee[];
  selectedEmpId: string;
  onSelect: (empId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const SearchableEmployeeSelect: React.FC<SearchableEmployeeSelectProps> = ({
  employees,
  selectedEmpId,
  onSelect,
  disabled = false,
  placeholder = 'Select an employee...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedEmployee = employees.find((e) => e.empId === selectedEmpId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      e.empId.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      (e.nameAr && e.nameAr.toLowerCase().includes(q)) ||
      (e.nationalId && e.nationalId.includes(q))
    );
  });

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xs hover:border-slate-400 dark:hover:border-slate-600 focus:outline-hidden focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-left"
      >
        <span className="truncate">
          {selectedEmployee ? (
            <span className="flex items-center gap-2">
              <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                {selectedEmployee.empId}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {selectedEmployee.name}
              </span>
              {selectedEmployee.nameAr && (
                <>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-400 font-arabic">
                    {selectedEmployee.nameAr}
                  </span>
                </>
              )}
              {selectedEmployee.status === 'resigned' && (
                <span className="text-xs text-amber-700 dark:text-amber-400 font-normal ml-1">
                  (resigned)
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, English or Arabic name..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-100 text-slate-900 dark:text-slate-100"
                autoFocus
              />
            </div>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-center text-slate-400">No employees found</div>
            ) : (
              filtered.map((emp) => {
                const isSelected = emp.empId === selectedEmpId;
                return (
                  <button
                    key={emp.empId}
                    type="button"
                    onClick={() => {
                      onSelect(emp.empId);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      isSelected ? 'bg-slate-50 dark:bg-slate-800/80 font-medium' : ''
                    } ${emp.status === 'resigned' ? 'opacity-70 bg-slate-50/40 dark:bg-slate-900/40' : ''}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {emp.empId}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-slate-900 dark:text-slate-100">{emp.name}</span>
                      {emp.nameAr && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-arabic text-slate-600 dark:text-slate-400">
                            {emp.nameAr}
                          </span>
                        </>
                      )}
                      {emp.status === 'resigned' && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                          (resigned)
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-slate-900 dark:text-slate-100 shrink-0 ml-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
