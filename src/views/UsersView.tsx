import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import { Shield, ShieldAlert, UserCheck, RefreshCw, Check } from 'lucide-react';

interface Props {
  refreshTrigger: number;
  onRefreshAll: () => void;
}

export const UsersView: React.FC<Props> = ({ refreshTrigger, onRefreshAll }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [refreshTrigger]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setUpdatingId(userId);
      await api.updateUserRole(userId, newRole);
      await fetchUsers();
      onRefreshAll();
    } catch (err: any) {
      alert(err.message || 'Erreur lors du changement de rôle');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Gestion des Permissions & Rôles Utilisateurs
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Contrôle d'accès strict côté serveur. Tout nouveau compte Discord est initialisé par défaut avec le rôle Parrain sans privilèges administratifs.
        </p>
      </div>

      {/* Role Definitions Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <Shield className="w-4 h-4 text-slate-900" />
            <span>ADMINISTRATEUR</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Accès intégral : paramétrage Discord, gestion des utilisateurs et des rôles, réattribution des parrainages, consultation des motifs confidentiels de refus et journal d'audit.
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-bold text-blue-900">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>RESPONSABLE</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Pilotage du recrutement : consultation de tous les dossiers candidats, transitions de statut selon le parcours VA (formation, simulation, validation), et saisie des motifs de refus.
          </p>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>PARRAIN</span>
          </div>
          <p className="text-slate-500 leading-relaxed text-[11px]">
            Accès strictement limité à son propre espace personnel, à ses statistiques et à la progression publique de ses propres filleuls (motifs de refus confidentiels masqués).
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Comptes Utilisateurs Discord ({users.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Utilisateur Discord</th>
                <th className="py-3 px-4 font-semibold">Discord User ID</th>
                <th className="py-3 px-4 font-semibold">Statut Compte</th>
                <th className="py-3 px-4 font-semibold">Date d'inscription</th>
                <th className="py-3 px-4 font-semibold">Dernière Connexion</th>
                <th className="py-3 px-4 font-semibold text-right">Rôle Attribué</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-slate-300" />
                    Chargement des utilisateurs...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    Aucun compte utilisateur Discord enregistré pour le moment. Connectez-vous avec Discord OAuth2 pour initialiser le premier compte administrateur.
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {u.avatar ? (
                          <img
                            src={u.avatar}
                            alt={u.displayName}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {u.displayName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{u.displayName}</div>
                          <div className="text-[11px] text-slate-400">@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {u.id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Actif
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {formatDate(u.lastLoginAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        value={u.role}
                        disabled={updatingId === u.id}
                        onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="text-xs p-1.5 border border-slate-200 rounded-lg text-slate-800 bg-white font-medium focus:ring-1 focus:ring-slate-900"
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
