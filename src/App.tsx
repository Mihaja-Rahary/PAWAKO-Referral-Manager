import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import {
  Candidate,
  OverviewStatistics,
  Referrer,
  User,
  UserRole,
  CandidateStatus,
  AdminStatus,
  OperationalStatus,
  VAType,
} from './types';
import { Sidebar, NavigationTab } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardView } from './views/DashboardView';
import { CandidatesView } from './views/CandidatesView';
import { ReferrersView } from './views/ReferrersView';
import { ParrainGuidesAdminView } from './views/ParrainGuidesAdminView';
import { ParrainPortalView } from './views/ParrainPortalView';
import { DiscordSyncView } from './views/DiscordSyncView';
import { UsersView } from './views/UsersView';
import { AuditLogsView } from './views/AuditLogsView';
import { SettingsOAuthView } from './views/SettingsOAuthView';
import { LandingPortalView } from './views/LandingPortalView';
import { AdminLoginView } from './views/AdminLoginView';
import { ParrainLoginView } from './views/ParrainLoginView';
import { CandidateDrawer } from './components/CandidateDrawer';
import { StatusChangeModal } from './components/StatusChangeModal';
import { ReassignReferrerModal } from './components/ReassignReferrerModal';
import { NewCandidateModal } from './components/NewCandidateModal';
import { PawakoLogo } from './components/PawakoLogo';
import { ThemeToggle } from './components/ThemeToggle';
import { LogOut, Shield, AlertCircle, RefreshCw, Menu } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [isOAuthConfigured, setIsOAuthConfigured] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isParrainMobileMenuOpen, setIsParrainMobileMenuOpen] = useState(false);

  // URL Path router state
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/';
  });

  const navigate = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  }, []);

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global cached data (only loaded when authenticated to avoid exposing sensitive metrics)
  const [stats, setStats] = useState<OverviewStatistics | null>(null);
  const [referrers, setReferrers] = useState<Referrer[]>([]);

  // Modals & Drawers state
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [activeStatusCandidate, setActiveStatusCandidate] = useState<Candidate | null>(null);
  const [activeReassignCandidate, setActiveReassignCandidate] = useState<Candidate | null>(null);
  const [isNewCandidateModalOpen, setIsNewCandidateModalOpen] = useState(false);

  // Status and shortcut filters from dashboard & referrers
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<string | undefined>(undefined);
  const [candidateVaTypeFilter, setCandidateVaTypeFilter] = useState<string | undefined>(undefined);
  const [candidateAnomalyFilter, setCandidateAnomalyFilter] = useState<boolean | undefined>(undefined);
  const [candidateReferrerFilter, setCandidateReferrerFilter] = useState<string | undefined>(undefined);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(t => t + 1);
  }, []);

  const loadAuthAndGlobals = useCallback(async () => {
    try {
      setLoadError(null);
      const pathNow = typeof window !== 'undefined' ? window.location.pathname : '/';
      const preferAdminBootstrap = pathNow.startsWith('/admin') && pathNow !== '/admin/login';

      if (preferAdminBootstrap) {
        try {
          const boot = await api.getAdminBootstrap();
          setCurrentUser(boot.user);
          setIsOAuthConfigured(boot.isOAuthConfigured);
          setStats(boot.stats);
          setReferrers(boot.referrers || []);
          return;
        } catch (bootErr: any) {
          if (bootErr?.status !== 401 && bootErr?.status !== 403 && bootErr?.status !== 404) {
            setLoadError(bootErr?.message || 'Erreur lors du chargement des données.');
          }
          // Bascule sur /api/auth/me pour vérifier la session réelle
        }
      }

      const auth = await api.getAuthMe();
      setIsOAuthConfigured(auth.isOAuthConfigured);

      if (auth.authenticated && auth.user) {
        setCurrentUser(auth.user);

        if (auth.user.role === 'ADMINISTRATEUR' || auth.user.role === 'RESPONSABLE') {
          try {
            const boot = await api.getAdminBootstrap();
            setStats(boot.stats);
            setReferrers(boot.referrers || []);
          } catch (err: any) {
            setLoadError(err?.message || 'Impossible de charger les statistiques globales.');
          }
        }
      } else {
        setCurrentUser(null);
        setStats(null);
        setReferrers([]);
      }
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
      setLoadError(err?.message || 'Impossible de contacter le serveur PAWAKO.');
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthAndGlobals();
  }, [loadAuthAndGlobals, refreshTrigger]);

  const [oauthError, setOauthError] = useState<string | null>(null);

  // Listen for popup OAuth messages from Discord with strict origin validation
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // 1. Validation de la charge utile (objet non-null requis)
      if (!event.data || typeof event.data !== 'object') {
        return;
      }

      // 2. Construction de l'ensemble d'origines strictement autorisées
      const allowedOrigins = new Set<string>();

      // Origine du frontend courant (Cloudflare Pages ou domaine hôte)
      if (typeof window !== 'undefined' && window.location.origin) {
        allowedOrigins.add(window.location.origin);
      }

      // Origine exacte issue de VITE_API_BASE_URL (https://referral-manager.pawako-saas.workers.dev)
      const rawApiBase = import.meta.env.VITE_API_BASE_URL;
      if (rawApiBase && typeof rawApiBase === 'string') {
        try {
          const apiOrigin = new URL(rawApiBase).origin;
          allowedOrigins.add(apiOrigin);
        } catch {
          // Ignorer si URL invalide
        }
      }

      // Origines locales autorisées EXCLUSIVEMENT en développement
      if (import.meta.env.DEV) {
        allowedOrigins.add('http://localhost:3000');
        allowedOrigins.add('http://127.0.0.1:3000');
        allowedOrigins.add('http://localhost:5173');
        allowedOrigins.add('http://127.0.0.1:5173');
      }

      // 3. Contrôle strict de l'origine : refus catégorique de toute origine inconnue
      if (!allowedOrigins.has(event.origin)) {
        return;
      }

      // 4. Validation stricte du type d'événement
      const eventType = (event.data as { type?: string }).type;
      if (eventType !== 'OAUTH_AUTH_SUCCESS' && eventType !== 'OAUTH_AUTH_FAILED') {
        return;
      }

      if (eventType === 'OAUTH_AUTH_SUCCESS') {
        setOauthError(null);
        triggerRefresh();
        const portal = (event.data as { portal?: string }).portal;
        if (portal === 'parrain') {
          navigate('/parrain');
        } else {
          navigate('/admin');
        }
      } else if (eventType === 'OAUTH_AUTH_FAILED') {
        const payload = event.data as { error?: string; code?: string; diagnostic?: string };
        const baseMsg = payload.error || 'Authentification Discord échouée ou refusée.';
        const suffix = payload.diagnostic ? ` [Diagnostic : ${payload.diagnostic}]` : '';
        setOauthError(`${baseMsg}${suffix}`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadAuthAndGlobals, triggerRefresh, navigate]);

  const handleOpenDiscordLogin = async (portal: 'admin' | 'parrain' = 'admin') => {
    try {
      setOauthError(null);
      const info = await api.getOAuthUrl(portal);
      if (!info.isConfigured || !info.url) {
        setOauthError(
          'Les identifiants DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET ne sont pas encore configurés dans les variables d environnement.'
        );
        return;
      }

      const authWindow = window.open(
        info.url,
        `pawako_${portal}_oauth`,
        'width=600,height=750,menubar=no,toolbar=no,status=no'
      );

      if (!authWindow) {
        // Fallback propre sur mobile / navigateur bloquant les pop-ups
        window.location.href = info.url;
      }
    } catch (err: any) {
      setOauthError(err.message || 'Erreur lors du lancement de l authentification Discord');
    }
  };

  const handleLogout = async (redirectTarget?: string) => {
    await api.logout();
    setCurrentUser(null);
    setStats(null);
    setReferrers([]);
    setIsMobileMenuOpen(false);
    triggerRefresh();
    if (redirectTarget) {
      navigate(redirectTarget);
    } else {
      navigate('/');
    }
  };

  const handleStatusSubmit = async (payload: {
    newAdminStatus?: AdminStatus;
    newOperationalStatus?: OperationalStatus;
    newStatus?: CandidateStatus;
    refusalReason?: string;
    notes: string;
  }) => {
    if (!activeStatusCandidate) return;
    await api.updateCandidateStatus(activeStatusCandidate.id, payload);
    triggerRefresh();
  };

  const handleReassignSubmit = async (newReferrerId: string, reason: string) => {
    if (!activeReassignCandidate) return;
    await api.reassignReferrer(activeReassignCandidate.id, {
      newReferrerId,
      reason,
    });
    triggerRefresh();
  };

  const handleNewCandidateSubmit = async (payload: {
    discordUserId: string;
    username: string;
    displayName: string;
    vaType: VAType;
    inviteCodeUsed?: string;
  }) => {
    await api.createCandidate(payload);
    triggerRefresh();
  };

  // =========================================================================
  // ROUTING LOGIC & PROTECTED GATES
  // =========================================================================

  // 1. Route : /admin/login
  if (currentPath === '/admin/login') {
    if (currentUser && (currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE')) {
      navigate('/admin');
      return null;
    }
    return (
      <AdminLoginView
        onBackToPortal={() => {
          setOauthError(null);
          navigate('/');
        }}
        onNavigateToParrainLogin={() => {
          setOauthError(null);
          navigate('/parrain/login');
        }}
        isOAuthConfigured={isOAuthConfigured}
        externalError={oauthError}
      />
    );
  }

  // 2. Route : /parrain/login
  if (currentPath === '/parrain/login') {
    if (currentUser && (currentUser.role === 'PARRAIN' || currentUser.role === 'ADMINISTRATEUR')) {
      navigate('/parrain');
      return null;
    }
    return (
      <ParrainLoginView
        onBackToPortal={() => {
          setOauthError(null);
          navigate('/');
        }}
        onNavigateToAdminLogin={() => {
          setOauthError(null);
          navigate('/admin/login');
        }}
        isOAuthConfigured={isOAuthConfigured}
        externalError={oauthError}
      />
    );
  }

  // 3. Route : / (Page d'accueil avec choix des deux portes)
  if (currentPath === '/' || currentPath === '') {
    if (currentUser) {
      if (currentUser.role === 'PARRAIN') {
        navigate('/parrain');
        return null;
      }
      if (currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE') {
        navigate('/admin');
        return null;
      }
    }
    return (
      <LandingPortalView
        onNavigateToAdminLogin={() => navigate('/admin/login')}
        onNavigateToParrainLogin={() => navigate('/parrain/login')}
      />
    );
  }

  // 4. Route : /parrain (Espace Parrain Protégé)
  if (currentPath.startsWith('/parrain')) {
    if (isAuthLoading && !currentUser) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#06040a] flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-[#9d93b8]">
          <PawakoLogo size="sm" />
          <div className="text-xs font-medium animate-pulse">Chargement de votre espace...</div>
        </div>
      );
    }

    if (!currentUser) {
      navigate('/parrain/login');
      return null;
    }

    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-[#09090d] text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors">
        {/* Parrain Whop-inspired Top Bar */}
        <header className="border-b border-slate-200/90 dark:border-white/10 bg-white/90 dark:bg-[#0c0c12]/90 backdrop-blur-md sticky top-0 z-20 transition-colors">
          <div className="max-w-[1440px] mx-auto w-full px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsParrainMobileMenuOpen(true)}
                aria-label="Ouvrir la barre latérale parrain"
                className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <PawakoLogo size="sm" />
              <div className="flex items-center gap-2 text-sm tracking-tight min-w-0">
                <span className="font-extrabold text-slate-950 dark:text-white whitespace-nowrap">PAWAKO</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-50 text-[#d9380d] border border-orange-200 dark:bg-[#FA4616]/15 dark:text-orange-300 dark:border-[#FA4616]/30 whitespace-nowrap">
                  Hub Parrains
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {(currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE') && (
                <button
                  onClick={() => navigate('/admin')}
                  className="min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/35 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Administration</span>
                </button>
              )}

              <ThemeToggle compact />

              <div className="flex items-center gap-2 pl-0.5">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/15 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FA4616] to-rose-500 text-white flex items-center justify-center font-bold text-xs">
                    {currentUser.displayName.charAt(0)}
                  </div>
                )}
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                    {currentUser.displayName}
                  </div>
                  <div className="text-[10px] text-[#FA4616] dark:text-orange-400 font-semibold">Parrain</div>
                </div>
              </div>

              <button
                onClick={() => handleLogout('/parrain/login')}
                className="min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl border border-slate-200 dark:border-white/10 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </header>

        {/* Parrain 3-Column Social Hub */}
        <main className="flex-1 px-3 sm:px-6 py-5 max-w-[1440px] mx-auto w-full">
          <ParrainPortalView
            currentUserRole={currentUser.role}
            onSelectCandidate={id => setSelectedCandidateId(id)}
            refreshTrigger={refreshTrigger}
            onManualRefresh={triggerRefresh}
            isMobileSidebarOpen={isParrainMobileMenuOpen}
            onCloseMobileSidebar={() => setIsParrainMobileMenuOpen(false)}
          />
        </main>

        {/* Candidate Profile Drawer (read-only for parrains, sensitive logs hidden) */}
        <CandidateDrawer
          candidateId={selectedCandidateId}
          onClose={() => setSelectedCandidateId(null)}
          currentUserRole={currentUser.role}
          onOpenStatusModal={() => {}}
          onOpenReassignModal={() => {}}
          onCandidateUpdated={triggerRefresh}
          refreshTrigger={refreshTrigger}
        />
      </div>
    );
  }

  // 5. Route : /admin (Espace Administration Protégé)
  if (isAuthLoading && !currentUser) {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-[#09090d] flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <PawakoLogo size="sm" />
        <div className="text-xs font-medium animate-pulse">Chargement du tableau de bord...</div>
      </div>
    );
  }

  if (!currentUser) {
    navigate('/admin/login');
    return null;
  }

  if (currentUser.role === 'PARRAIN') {
    navigate('/parrain');
    return null;
  }

  // Authorized Admin / Responsable view
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Tableau de bord' };
      case 'candidates':
        return { title: 'Candidats & Recrutement' };
      case 'referrers':
        return { title: 'Gestion des Parrains' };
      case 'parrain_guides':
        return { title: 'Guides & Accueil Parrains' };
      case 'parrain_portal':
        return { title: 'Mon Espace Parrain' };
      case 'discord_sync':
        return { title: 'Serveurs Discord & Bot' };
      case 'users':
        return { title: 'Utilisateurs & Rôles' };
      case 'audit_logs':
        return { title: "Journal d'Audit" };
      case 'oauth_settings':
        return { title: 'Configuration' };
      default:
        return { title: 'PAWAKO Referral Manager' };
    }
  };

  const { title } = getHeaderInfo();

  return (
    <div className="flex h-screen bg-[#f8fafc] dark:bg-[#09090d] text-slate-900 dark:text-slate-100 overflow-hidden font-sans antialiased transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={tab => {
          setActiveTab(tab);
          setCandidateStatusFilter(undefined);
          setCandidateVaTypeFilter(undefined);
          setCandidateAnomalyFilter(undefined);
          setCandidateReferrerFilter(undefined);
        }}
        currentUser={currentUser}
        servers={stats?.servers}
        onLogout={() => handleLogout('/admin/login')}
        onOpenDiscordLogin={() => handleOpenDiscordLogin('admin')}
        isOAuthConfigured={isOAuthConfigured}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Body */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          title={title}
          currentUser={currentUser}
          onOpenDiscordLogin={() => handleOpenDiscordLogin('admin')}
          onLogout={() => handleLogout('/admin/login')}
          isOAuthConfigured={isOAuthConfigured}
          onRefresh={triggerRefresh}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        {/* View Content Area */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
            {loadError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{loadError}</span>
                </div>
                <button
                  onClick={triggerRefresh}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Réessayer</span>
                </button>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                onNavigateToCandidates={(filterStatus, extraParams) => {
                  setCandidateStatusFilter(filterStatus);
                  setCandidateVaTypeFilter(extraParams?.vaType);
                  setCandidateAnomalyFilter(extraParams?.hasAnomaly);
                  setCandidateReferrerFilter(undefined);
                  setActiveTab('candidates');
                }}
                onNavigateToReferrers={() => setActiveTab('referrers')}
              />
            )}

            {activeTab === 'candidates' && (
              <CandidatesView
                currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
                referrers={referrers}
                initialStatusFilter={candidateStatusFilter}
                initialVaTypeFilter={candidateVaTypeFilter}
                initialAnomalyFilter={candidateAnomalyFilter}
                initialReferrerIdFilter={candidateReferrerFilter}
                onClearReferrerFilter={() => setCandidateReferrerFilter(undefined)}
                onSelectCandidate={id => setSelectedCandidateId(id)}
                onOpenStatusModal={candidate => setActiveStatusCandidate(candidate)}
                onOpenReassignModal={candidate => setActiveReassignCandidate(candidate)}
                onOpenNewCandidateModal={() => setIsNewCandidateModalOpen(true)}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'referrers' && (
              <ReferrersView
                currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
                onSelectReferrerFilter={referrerId => {
                  setCandidateStatusFilter(undefined);
                  setCandidateVaTypeFilter(undefined);
                  setCandidateAnomalyFilter(undefined);
                  setCandidateReferrerFilter(referrerId);
                  setActiveTab('candidates');
                }}
                onSelectCandidate={id => setSelectedCandidateId(id)}
                refreshTrigger={refreshTrigger}
                onRefreshAll={triggerRefresh}
                initialReferrers={referrers}
              />
            )}

            {activeTab === 'parrain_guides' && (
              <ParrainGuidesAdminView currentUserRole={currentUser?.role || 'ADMINISTRATEUR'} />
            )}

            {activeTab === 'parrain_portal' && (
              <ParrainPortalView
                currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
                onSelectCandidate={id => setSelectedCandidateId(id)}
                refreshTrigger={refreshTrigger}
                onManualRefresh={triggerRefresh}
                isEmbeddedInAdmin
              />
            )}

            {activeTab === 'discord_sync' && (
              <DiscordSyncView
                refreshTrigger={refreshTrigger}
                onRefreshAll={triggerRefresh}
                initialServers={stats?.servers}
                currentUserRole={currentUser?.role}
              />
            )}

            {activeTab === 'users' && (
              <UsersView
                refreshTrigger={refreshTrigger}
                onRefreshAll={triggerRefresh}
              />
            )}

            {activeTab === 'audit_logs' && (
              <AuditLogsView refreshTrigger={refreshTrigger} />
            )}

            {activeTab === 'oauth_settings' && <SettingsOAuthView />}
          </div>
        </main>
      </div>

      {/* Candidate Profile Drawer */}
      <CandidateDrawer
        candidateId={selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
        currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
        referrers={referrers}
        onOpenStatusModal={candidate => setActiveStatusCandidate(candidate)}
        onOpenReassignModal={candidate => setActiveReassignCandidate(candidate)}
        onCandidateUpdated={triggerRefresh}
        refreshTrigger={refreshTrigger}
      />

      {/* Status Transition Modal */}
      {activeStatusCandidate && (
        <StatusChangeModal
          candidate={activeStatusCandidate}
          isOpen={Boolean(activeStatusCandidate)}
          onClose={() => setActiveStatusCandidate(null)}
          onSubmit={handleStatusSubmit}
        />
      )}

      {/* Reassign Referrer Modal */}
      {activeReassignCandidate && (
        <ReassignReferrerModal
          candidate={activeReassignCandidate}
          referrers={referrers}
          isOpen={Boolean(activeReassignCandidate)}
          onClose={() => setActiveReassignCandidate(null)}
          onSubmit={handleReassignSubmit}
        />
      )}

      {/* New Candidate Intake Modal */}
      <NewCandidateModal
        referrers={referrers}
        isOpen={isNewCandidateModalOpen}
        onClose={() => setIsNewCandidateModalOpen(false)}
        onSubmit={handleNewCandidateSubmit}
      />
    </div>
  );
}
