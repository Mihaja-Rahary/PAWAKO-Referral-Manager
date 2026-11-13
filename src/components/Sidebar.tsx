import React from 'react';
import { User, UserRole, DiscordServerInfo } from '../types';
import { PawakoLogo } from './PawakoLogo';
import {
  LayoutDashboard,
  Users,
  Award,
  UserCheck,
  Server,
  Shield,
  FileText,
  Settings,
  LogOut,
  Radio,
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'candidates'
  | 'referrers'
  | 'parrain_portal'
  | 'discord_sync'
  | 'users'
  | 'audit_logs'
  | 'oauth_settings';

interface Props {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  currentUser: User | null;
  servers?: DiscordServerInfo[];
  onLogout: () => void;
  onOpenDiscordLogin: () => void;
  isOAuthConfigured: boolean;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  currentUser,
  servers,
  onLogout,
  onOpenDiscordLogin,
}) => {
  const role: UserRole = currentUser?.role || 'ADMINISTRATEUR';
  const isParrainOnly = role === 'PARRAIN';

  // Navigation items strictly segregated by role
  const navItems = [
    {
      id: 'parrain_portal' as NavigationTab,
      label: 'Mon Espace Parrain',
      icon: UserCheck,
      roles: ['PARRAIN', 'ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'candidates' as NavigationTab,
      label: isParrainOnly ? 'Mes Filleuls' : 'Candidats',
      icon: Users,
      roles: ['PARRAIN', 'ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'dashboard' as NavigationTab,
      label: 'Tableau de bord',
      icon: LayoutDashboard,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'referrers' as NavigationTab,
      label: 'Parrains',
      icon: Award,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'discord_sync' as NavigationTab,
      label: 'Serveurs Discord',
      icon: Server,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      countLabel: '4',
    },
    {
      id: 'users' as NavigationTab,
      label: 'Utilisateurs & Rôles',
      icon: Shield,
      roles: ['ADMINISTRATEUR'],
    },
    {
      id: 'audit_logs' as NavigationTab,
      label: "Journal d'Audit",
      icon: FileText,
      roles: ['ADMINISTRATEUR'],
    },
    {
      id: 'oauth_settings' as NavigationTab,
      label: 'Configuration',
      icon: Settings,
      roles: ['ADMINISTRATEUR'],
    },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(role));
  const connectedCount = servers?.filter(s => s.botConnected).length || 0;

  return (
    <aside className="w-64 bg-white dark:bg-[#090611] border-r border-slate-200 dark:border-[#1e1530] flex flex-col shrink-0 min-h-screen transition-colors">
      {/* Compact Brand Header */}
      <div className="p-5 border-b border-slate-100 dark:border-[#1c132e] flex items-center gap-3">
        <PawakoLogo size="md" />
        <div className="min-w-0">
          <div className="font-extrabold text-slate-900 dark:text-[#f4f1fa] text-base tracking-tight leading-none whitespace-nowrap">
            PAWAKO
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#9d93b8] mt-1 font-medium truncate">
            Referral Manager
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium rounded-lg transition-colors text-left cursor-pointer ${
                isActive
                  ? 'bg-violet-600 text-white dark:bg-violet-600/20 dark:text-violet-200 dark:border dark:border-violet-500/40'
                  : 'text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa] hover:bg-slate-50 dark:hover:bg-[#140e24] border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white dark:text-violet-400' : 'text-slate-400 dark:text-[#6e648c]'
                  }`}
                />
                <span className="truncate whitespace-nowrap">{item.label}</span>
              </div>
              {item.countLabel && (
                <span
                  className={`text-[11px] font-mono tabular-nums shrink-0 ml-2 ${
                    isActive ? 'text-violet-100 dark:text-violet-300' : 'text-slate-400 dark:text-[#6e648c]'
                  }`}
                >
                  {item.countLabel}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Discord Servers Summary (Admins & Responsables only) */}
      {!isParrainOnly && (
        <div className="p-3.5 mx-3 mb-3 bg-slate-50 dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-[#e9e5f5]">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Serveurs Discord</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
              {connectedCount}/4
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] space-y-1">
            <div className="flex justify-between">
              <span>Recrutement</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] font-medium">
                {servers?.find(s => s.id === 'RECRUTEMENT')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Formation</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] font-medium">
                {servers?.find(s => s.id === 'FORMATION')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Prod Chatting</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] font-medium">
                {servers?.find(s => s.id === 'PRODUCTION_CHATTING')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Prod Instagram</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] font-medium">
                {servers?.find(s => s.id === 'PRODUCTION_INSTAGRAM')?.memberCount || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User Card & Logout */}
      <div className="p-3 border-t border-slate-200 dark:border-[#1e1530] bg-slate-50/50 dark:bg-[#07040d]">
        {currentUser ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.displayName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.displayName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-[#f4f1fa] truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-[10px] font-medium text-slate-500 dark:text-violet-300/80 tracking-wide truncate">
                  {currentUser.role}
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#191129] rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDiscordLogin}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors cursor-pointer"
          >
            Connexion Discord
          </button>
        )}
      </div>
    </aside>
  );
};
