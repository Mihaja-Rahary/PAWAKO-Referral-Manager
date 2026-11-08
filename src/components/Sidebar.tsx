import React from 'react';
import { User, UserRole, DiscordServerInfo } from '../types';
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
  ExternalLink,
  ChevronRight,
  Radio
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
  isOAuthConfigured,
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
      badge: isParrainOnly ? undefined : 'Personnel',
    },
    {
      id: 'candidates' as NavigationTab,
      label: isParrainOnly ? 'Mes Filleuls' : 'Candidats & Recrutement',
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
      label: 'Gestion des Parrains',
      icon: Award,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
    },
    {
      id: 'discord_sync' as NavigationTab,
      label: 'Serveurs Discord & Bot',
      icon: Server,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      badge: '4 Serveurs',
    },
    {
      id: 'users' as NavigationTab,
      label: 'Permissions & Rôles',
      icon: Shield,
      roles: ['ADMINISTRATEUR'],
    },
    {
      id: 'audit_logs' as NavigationTab,
      label: 'Journal d\'Audit',
      icon: FileText,
      roles: ['ADMINISTRATEUR'],
    },
    {
      id: 'oauth_settings' as NavigationTab,
      label: 'Discord OAuth & Bot API',
      icon: Settings,
      roles: ['ADMINISTRATEUR'],
    },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs tracking-wider">
              PW
            </span>
            <h1 className="font-bold text-slate-900 text-base tracking-tight">
              PAWAKO
            </h1>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">
            Referral & Recruitment Manager
          </p>
        </div>
        <div className="flex items-center gap-1.5" title="Passerelle Bot JARVIS active">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-slate-500 font-mono">BOT</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Navigation Principale
        </div>
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                    isActive ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Discord Ecosystem Status Widget (Admins & Responsables only) */}
      {!isParrainOnly && (
        <div className="p-3 mx-3 mb-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-emerald-600" />
              Écosystème Discord
            </span>
            <span className="text-[10px] text-slate-500 font-normal">4 Serveurs</span>
          </div>
          <div className="text-[11px] text-slate-500 space-y-0.5">
            <div className="flex justify-between">
              <span>Recrutement</span>
              <span className="font-mono text-slate-700">
                {servers?.find(s => s.id === 'RECRUTEMENT')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Formation (Chatting)</span>
              <span className="font-mono text-slate-700">
                {servers?.find(s => s.id === 'FORMATION')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Prod Chatting</span>
              <span className="font-mono text-slate-700">
                {servers?.find(s => s.id === 'PRODUCTION_CHATTING')?.memberCount || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Prod Instagram</span>
              <span className="font-mono text-slate-700">
                {servers?.find(s => s.id === 'PRODUCTION_INSTAGRAM')?.memberCount || 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User Card & Logout */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/50">
        {currentUser ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.displayName}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {currentUser.displayName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <span className="uppercase font-medium text-slate-600 tracking-wider">
                    {currentUser.role}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Se déconnecter"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDiscordLogin}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-white bg-[#5865F2] hover:bg-[#4752C4] rounded-lg transition-colors shadow-xs"
          >
            Connexion Discord
          </button>
        )}
      </div>
    </aside>
  );
};
