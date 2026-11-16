import React, { useEffect } from 'react';
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
  X,
  BookOpen,
} from 'lucide-react';

export type NavigationTab =
  | 'dashboard'
  | 'candidates'
  | 'referrers'
  | 'parrain_guides'
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
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItemDef {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  group: 'pilotage' | 'contenu' | 'infra';
  countLabel?: string;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  currentUser,
  servers,
  onLogout,
  onOpenDiscordLogin,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const role: UserRole = currentUser?.role || 'ADMINISTRATEUR';
  const isParrainOnly = role === 'PARRAIN';

  useEffect(() => {
    if (!isMobileOpen || !onCloseMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, onCloseMobile]);

  const navItems: NavItemDef[] = [
    {
      id: 'dashboard',
      label: 'Tableau de bord',
      icon: LayoutDashboard,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'pilotage',
    },
    {
      id: 'candidates',
      label: isParrainOnly ? 'Mes Filleuls' : 'Candidats',
      icon: Users,
      roles: ['PARRAIN', 'ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'pilotage',
    },
    {
      id: 'referrers',
      label: 'Parrains',
      icon: Award,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'pilotage',
    },
    {
      id: 'parrain_guides',
      label: 'Guides Parrains',
      icon: BookOpen,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'contenu',
    },
    {
      id: 'parrain_portal',
      label: 'Mon Espace Parrain',
      icon: UserCheck,
      roles: ['PARRAIN', 'ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'contenu',
    },
    {
      id: 'discord_sync',
      label: 'Serveurs Discord',
      icon: Server,
      roles: ['ADMINISTRATEUR', 'RESPONSABLE'],
      group: 'infra',
      countLabel: '4',
    },
    {
      id: 'users',
      label: 'Utilisateurs & Rôles',
      icon: Shield,
      roles: ['ADMINISTRATEUR'],
      group: 'infra',
    },
    {
      id: 'audit_logs',
      label: "Journal d'Audit",
      icon: FileText,
      roles: ['ADMINISTRATEUR'],
      group: 'infra',
    },
    {
      id: 'oauth_settings',
      label: 'Configuration',
      icon: Settings,
      roles: ['ADMINISTRATEUR'],
      group: 'infra',
    },
  ];

  const groups: { id: 'pilotage' | 'contenu' | 'infra'; label: string }[] = [
    { id: 'pilotage', label: 'Pilotage' },
    { id: 'contenu', label: 'Onboarding & Contenu' },
    { id: 'infra', label: 'Infrastructure' },
  ];

  const visibleItems = navItems.filter(item => item.roles.includes(role));
  const connectedCount = servers?.filter(s => s.botConnected).length || 0;

  const handleSelectTab = (tab: NavigationTab) => {
    onTabChange(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (isDrawer: boolean) => (
    <aside
      className={`w-72 lg:w-64 bg-white dark:bg-[#0c0c12] border-r border-slate-200 dark:border-white/10 flex flex-col shrink-0 h-full transition-colors ${
        isDrawer ? 'shadow-2xl' : 'min-h-screen'
      }`}
    >
      {/* Compact Brand Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PawakoLogo size="md" />
          <div className="min-w-0">
            <div className="font-extrabold text-slate-950 dark:text-white text-lg tracking-tight leading-none whitespace-nowrap">
              PAWAKO
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium truncate">
              Referral Manager
            </p>
          </div>
        </div>
        {isDrawer && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-[#9d93b8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#191129] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Grouped Navigation Links */}
      <nav className="flex-1 p-3.5 space-y-5 overflow-y-auto">
        {groups.map(group => {
          const groupItems = visibleItems.filter(item => item.group === group.id);
          if (groupItems.length === 0) return null;

          return (
            <div key={group.id} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-[#6e648c]">
                {group.label}
              </div>
              {groupItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full min-h-[42px] lg:min-h-[38px] flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all text-left cursor-pointer ${
                      isActive
                        ? 'bg-slate-950 text-white dark:bg-[#181826] dark:text-white border border-slate-950 dark:border-[#FA4616]/50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-[#FA4616] dark:text-orange-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate whitespace-nowrap">{item.label}</span>
                    </div>
                    {item.countLabel && (
                      <span
                        className={`text-[11px] font-mono tabular-nums shrink-0 ml-2 ${
                          isActive ? 'text-orange-300' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {item.countLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Discord Servers Summary (Admins & Responsables only) */}
      {!isParrainOnly && (
        <div className="p-3.5 mx-3.5 mb-3.5 bg-slate-50/90 dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl text-xs space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 dark:text-[#e9e5f5]">
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Serveurs Discord</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
              {connectedCount}/4
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] space-y-1.5 pt-1 border-t border-slate-200/70 dark:border-[#1e1530]">
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
      <div className="p-3.5 border-t border-slate-200 dark:border-[#1e1530] bg-slate-50/50 dark:bg-[#07040d]">
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
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#191129] rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenDiscordLogin}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors cursor-pointer"
          >
            Connexion Discord
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <div className="hidden lg:flex shrink-0">{sidebarContent(false)}</div>

      {/* Mobile Drawer Sidebar */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation principale"
        >
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full max-w-[85vw]">{sidebarContent(true)}</div>
        </div>
      )}
    </>
  );
};
