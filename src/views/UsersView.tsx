import React, { useState, useEffect } from 'react';
import { User, UserRole, UserStatus } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  refreshTrigger: number;
  onRefreshAll: () => void;
}

export const UsersView: React.FC<Props> = ({ refreshTrigger, onRefreshAll }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err?.message || 'Impossible de charger les utilisateurs.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [refreshTrigger]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setError(null);
      setUpdatingId(userId);
      await api.updateUserRole(userId, newRole);
      await fetchUsers();
      onRefreshAll();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du changement de rôle');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: UserStatus) => {
    try {
      setError(null);
      setUpdatingId(userId);
      await api.updateUserStatus(userId, newStatus);
      await fetchUsers();
      onRefreshAll();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du changement de statut');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchUsers}
            className="px-2.5 py-1 bg-rose-600 text-white rounded-md font-semibold shrink-0 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Users Table & Mobile Cards */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden shadow-xs transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-[#241a38] flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
            Utilisateurs Discord (<span className="font-mono tabular-nums">{users.length}</span>)
          </h2>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-[#241a38]/80">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-[#9d93b8]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-violet-500" />
              Chargement des utilisateurs...
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
              Aucun compte utilisateur enregistré.
            </div>
          ) : (
            users.map(u => (
              <div key={u.id} className="p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt={u.displayName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {u.displayName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate">{u.displayName}</div>
                      <div className="text-[11px] text-slate-400 dark:text-[#7c7296] truncate">@{u.username}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 dark:text-[#7c7296] shrink-0">{u.id}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={u.status}
                    disabled={updatingId === u.id}
                    aria-label={`Statut de ${u.displayName}`}
                    onChange={e => handleStatusChange(u.id, e.target.value as UserStatus)}
                    className="min-h-[38px] text-xs px-2 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] font-medium"
                  >
                    <option value="ACTIVE">Actif</option>
                    <option value="SUSPENDED">Suspendu</option>
                    <option value="PENDING_APPROVAL">En attente</option>
                  </select>

                  <select
                    value={u.role}
                    disabled={updatingId === u.id}
                    aria-label={`Rôle de ${u.displayName}`}
                    onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                    className="min-h-[38px] text-xs px-2 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] font-medium"
                  >
                    <option value="PARRAIN">PARRAIN</option>
                    <option value="RESPONSABLE">RESPONSABLE</option>
                    <option value="ADMINISTRATEUR">ADMINISTRATEUR</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                <th className="py-3 px-4 font-semibold">Utilisateur Discord</th>
                <th className="py-3 px-4 font-semibold">Discord User ID</th>
                <th className="py-3 px-4 font-semibold">Statut</th>
                <th className="py-3 px-4 font-semibold">Inscription</th>
                <th className="py-3 px-4 font-semibold">Dernière connexion</th>
                <th className="py-3 px-4 font-semibold text-right">Rôle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#241a38]/80 text-slate-700 dark:text-[#d8d0eb]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 dark:text-[#9d93b8]">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-violet-500" />
                    Chargement des utilisateurs...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
                    Aucun compte utilisateur enregistré.
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-[#171026] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {u.avatar ? (
                          <img
                            src={u.avatar}
                            alt={u.displayName}
                            referrerPolicy="no-referrer"
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#2e2249] shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {u.displayName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-[#f4f1fa]">{u.displayName}</div>
                          <div className="text-[11px] text-slate-400 dark:text-[#7c7296]">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-[#9d93b8]">
                      {u.id}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.status}
                        disabled={updatingId === u.id}
                        aria-label={`Statut de ${u.displayName}`}
                        onChange={e => handleStatusChange(u.id, e.target.value as UserStatus)}
                        className="text-xs p-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] font-medium focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        <option value="ACTIVE">Actif</option>
                        <option value="SUSPENDED">Suspendu</option>
                        <option value="PENDING_APPROVAL">En attente</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-[#9d93b8] font-mono text-[11px]">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-[#9d93b8] font-mono text-[11px]">
                      {formatDate(u.lastLoginAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        aria-label={`Rôle de ${u.displayName}`}
                        onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="text-xs p-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] font-medium focus:outline-none focus:ring-1 focus:ring-violet-500"
                      >
                        <option value="PARRAIN">PARRAIN</option>
                        <option value="RESPONSABLE">RESPONSABLE</option>
                        <option value="ADMINISTRATEUR">ADMINISTRATEUR</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
