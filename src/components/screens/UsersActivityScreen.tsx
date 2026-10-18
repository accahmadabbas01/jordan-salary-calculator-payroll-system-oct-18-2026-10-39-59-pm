import React, { useState } from 'react';
import { User, Company, ActivityLog, UserRole } from '../../types';
import { hashPassword } from '../../utils/crypto';
import { generateActivityLogSheet } from '../../utils/excel';
import {
  ShieldCheck,
  ScrollText,
  UserPlus,
  Trash2,
  KeyRound,
  Download,
  Search,
  CheckSquare,
  Square,
  Lock,
  X,
} from 'lucide-react';

interface UsersActivityScreenProps {
  users: User[];
  companies: Company[];
  logs: ActivityLog[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  onDeleteUser: (username: string) => void;
}

export const UsersActivityScreen: React.FC<UsersActivityScreenProps> = ({
  users,
  companies,
  logs,
  currentUser,
  onSaveUser,
  onDeleteUser,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');

  // New / Edit User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('payroll_officer');
  const [formPassword, setFormPassword] = useState('');
  const [formCompanyIds, setFormCompanyIds] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  // Activity Log Search & Filters
  const [logSearch, setLogSearch] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');

  const filteredLogs = logs.filter((l) => {
    if (selectedUserFilter !== 'all' && l.username !== selectedUserFilter) return false;
    if (logSearch) {
      const q = logSearch.toLowerCase().trim();
      return (
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.username.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleOpenNewUser = () => {
    setEditingUsername(null);
    setFormUsername('');
    setFormFullName('');
    setFormRole('payroll_officer');
    setFormPassword('');
    setFormCompanyIds(companies.map((c) => c.id));
    setFormActive(true);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUsername(u.username);
    setFormUsername(u.username);
    setFormFullName(u.fullName);
    setFormRole(u.role);
    setFormPassword('');
    setFormCompanyIds([...u.companyIds]);
    setFormActive(u.active);
    setIsUserModalOpen(true);
  };

  const handleSaveUserForm = async () => {
    if (!formUsername.trim() || !formFullName.trim()) {
      alert('Username and full name are required.');
      return;
    }

    // Check last active admin rule
    if (editingUsername) {
      const existing = users.find((u) => u.username === editingUsername);
      if (existing?.role === 'admin' && formRole !== 'admin') {
        const adminCount = users.filter((u) => u.role === 'admin' && u.active).length;
        if (adminCount <= 1) {
          alert('Cannot demote the last active administrator.');
          return;
        }
      }
    }

    let passwordHash = '';
    if (editingUsername) {
      const existing = users.find((u) => u.username === editingUsername);
      if (formPassword.trim()) {
        if (formPassword.length < 6) {
          alert('Password must be at least 6 characters.');
          return;
        }
        passwordHash = await hashPassword(formPassword.trim());
      } else {
        passwordHash = existing?.passwordHash || '';
      }
    } else {
      if (!formPassword.trim() || formPassword.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
      }
      passwordHash = await hashPassword(formPassword.trim());
    }

    const savedUser: User = {
      username: formUsername.toLowerCase().trim(),
      fullName: formFullName.trim(),
      role: formRole,
      active: formActive,
      passwordHash,
      companyIds: formRole === 'admin' ? companies.map((c) => c.id) : formCompanyIds,
      createdAt: editingUsername
        ? users.find((u) => u.username === editingUsername)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };

    onSaveUser(savedUser);
    setIsUserModalOpen(false);
  };

  const handleExportLogs = () => {
    const bytes = generateActivityLogSheet(filteredLogs);
    const blob = new Blob([bytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Activity_Logs_${new Date().toISOString().substring(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Users & System Activity Log</span>
          </h2>
          <p className="text-slate-500">
            RBAC permissions, assigned company restrictions, and audit trail of all changes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'users'
                  ? 'bg-white dark:bg-slate-700 font-semibold text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Users ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === 'logs'
                  ? 'bg-white dark:bg-slate-700 font-semibold text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Audit Trail ({logs.length})
            </button>
          </div>

          {activeTab === 'users' && (
            <button
              type="button"
              onClick={handleOpenNewUser}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium hover:bg-slate-800"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          )}

          {activeTab === 'logs' && (
            <button
              type="button"
              onClick={handleExportLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border rounded font-medium hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Logs (Excel)</span>
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">Full Name</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Assigned Companies</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => {
                const isCurrent = u.username === currentUser.username;
                const assignedCount = u.role === 'admin' ? companies.length : u.companyIds.length;

                return (
                  <tr key={u.username} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2.5 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {u.username}
                      {isCurrent && (
                        <span className="ml-1.5 text-[10px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-500 font-sans">
                          (You)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      {u.fullName}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-slate-700 dark:text-slate-300 font-medium">
                      {u.role.replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {u.role === 'admin'
                        ? 'All companies (Unrestricted)'
                        : `${assignedCount} company (${u.companyIds
                            .map((id) => companies.find((c) => c.id === id)?.name || id)
                            .join(', ')})`}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                          u.active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditUser(u)}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete account for user "${u.username}"?`)) {
                                onDeleteUser(u.username);
                              }
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs text-xs space-y-2 p-4">
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search audit trail..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">User:</span>
              <select
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
              >
                <option value="all">All Users</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/80 uppercase text-[10px] tracking-wider font-semibold text-slate-600 dark:text-slate-300 border-b">
                <tr>
                  <th className="px-3 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">User</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-500 text-[11px]">
                      {new Date(log.when).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">
                      {log.username}
                    </td>
                    <td className="px-3 py-2 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {log.action}
                    </td>
                    <td className="px-3 py-2 font-sans text-slate-600 dark:text-slate-400">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Create / Edit Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-lg w-full space-y-4 text-xs shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>{editingUsername ? `Edit Account: ${editingUsername}` : 'Create New Account'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  disabled={!!editingUsername}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="e.g. payroll_officer"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-mono disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="e.g. Ahmad Abbas"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded"
                >
                  <option value="admin">Administrator (Full Access)</option>
                  <option value="payroll_officer">Payroll Officer (Operations)</option>
                  <option value="viewer">Viewer (Read-Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  {editingUsername ? 'Reset Password (Leave blank to keep unchanged)' : 'Password (min 6 characters) *'}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded font-mono"
                />
              </div>

              {formRole !== 'admin' && (
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                    Allowed Companies (Tick accessible companies)
                  </label>
                  <div className="space-y-1 p-2 bg-slate-50 dark:bg-slate-800 rounded border max-h-36 overflow-y-auto">
                    {companies.map((c) => {
                      const isChecked = formCompanyIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormCompanyIds([...formCompanyIds, c.id]);
                              } else {
                                setFormCompanyIds(formCompanyIds.filter((id) => id !== c.id));
                              }
                            }}
                          />
                          <span>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-user-active"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                <label htmlFor="chk-user-active" className="text-slate-700 dark:text-slate-300 font-medium">
                  Account is active (can sign in)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="px-4 py-1.5 border rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUserForm}
                className="px-4 py-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded font-medium"
              >
                Save Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
