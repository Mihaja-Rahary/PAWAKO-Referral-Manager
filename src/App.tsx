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
import { LogOut, UserCheck, Shield } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [isOAuthConfigured, setIsOAuthConfigured] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  // Status and shortcut filters from dashboard
  const [candidateStatusFilter, setCandidateStatusFilter] = useState<string | undefined>(undefined);
  const [candidateVaTypeFilter, setCandidateVaTypeFilter] = useState<string | undefined>(undefined);
  const [candidateAnomalyFilter, setCandidateAnomalyFilter] = useState<boolean | undefined>(undefined);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(t => t + 1);
  }, []);

  const loadAuthAndGlobals = useCallback(async () => {
    try {
      const auth = await api.getAuthMe();
      if (auth.authenticated && auth.user) {
        setCurrentUser(auth.user);
        setIsOAuthConfigured(auth.isOAuthConfigured);

        // Fetch sensitive stats only if user is authenticated and authorized for admin views
        if (auth.user.role === 'ADMINISTRATEUR' || auth.user.role === 'RESPONSABLE') {
          const [overviewStats, refRes] = await Promise.all([
            api.getOverviewStats().catch(() => null),
            api.getReferrers().catch(() => ({ referrers: [] })),
          ]);
          if (overviewStats) setStats(overviewStats);
          if (refRes?.referrers) setReferrers(refRes.referrers);
        }
      } else {
        setCurrentUser(null);
        setStats(null);
        setReferrers([]);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
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

      // Origine du frontend courant (Firebase Hosting ou domaine hôte)
      if (typeof window !== 'undefined' && window.location.origin) {
        allowedOrigins.add(window.location.origin);
      }

      // Origine exacte issue de VITE_API_BASE_URL (ex: https://pawako-referral-manager.pawako-saas.workers.dev)
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

      // 3. Contrôle strict de l'origine : refus catégorique de toute origine inconnue (pas de .includes() ou .endsWith())
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
        await loadAuthAndGlobals();
        triggerRefresh();
        const portal = (event.data as { portal?: string }).portal;
        if (portal === 'parrain') {
          navigate('/parrain');
        } else {
          navigate('/admin');
        }
      } else if (eventType === 'OAUTH_AUTH_FAILED') {
        const errorMsg =
          (event.data as { error?: string }).error ||
          'Authentification Discord échouée ou refusée.';
        setOauthError(errorMsg);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadAuthAndGlobals, triggerRefresh, navigate]);

  const handleOpenDiscordLogin = async (portal: 'admin' | 'parrain' = 'admin') => {
    try {
      const info = await api.getOAuthUrl(portal);
      if (!info.isConfigured || !info.url) {
        alert(
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
        alert('Veuillez autoriser les fenêtres pop-up pour vous connecter avec Discord.');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur lors du lancement de l authentification Discord');
    }
  };

  const handleLogout = async (redirectTarget?: string) => {
    await api.logout();
    setCurrentUser(null);
    setStats(null);
    setReferrers([]);
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
    if (!currentUser) {
      navigate('/parrain/login');
      return null;
    }

    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans">
        {/* Parrain Portal Top Bar */}
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur-xs sticky top-0 z-10 px-6 py-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs tracking-wider shadow-xs">
              PW
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm tracking-tight">PAWAKO</span>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Espace Parrain
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Suivi de vos filleuls et lien d'invitation Discord unique
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* If user is admin/responsable visiting parrain portal, allow them to return to admin */}
            {(currentUser.role === 'ADMINISTRATEUR' || currentUser.role === 'RESPONSABLE') && (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Retour Administration</span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.displayName}
                  className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                  {currentUser.displayName.charAt(0)}
                </div>
              )}
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-[10px] text-emerald-600 font-medium">Parrain Officiel</div>
              </div>
            </div>

            <button
              onClick={() => handleLogout('/parrain/login')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        {/* Parrain Main Content */}
        <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
          <ParrainPortalView
            currentUserRole={currentUser.role}
            onSelectCandidate={id => setSelectedCandidateId(id)}
            refreshTrigger={refreshTrigger}
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
        />
      </div>
    );
  }

  // 5. Route : /admin (Espace Administration Protégé)
  // If not logged in, redirect to /admin/login
  if (!currentUser) {
    navigate('/admin/login');
    return null;
  }

  // If a Parrain tries to access /admin, forbid and redirect to /parrain
  if (currentUser.role === 'PARRAIN') {
    navigate('/parrain');
    return null;
  }

  // Authorized Admin / Responsable view
  const getHeaderInfo = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Tableau de Bord & Vue Générale',
          subtitle: 'Métriques globales réelles, conversion vers la production et classement des parrains',
        };
      case 'candidates':
        return {
          title: 'Gestion Centralisée des Candidats',
          subtitle: 'Suivi des candidatures, fiches individuelles et transitions de statuts par parcours',
        };
      case 'referrers':
        return {
          title: 'Gestion des Parrains & Invitations',
          subtitle: "Génération de liens Discord uniques, compteurs d'utilisation et conversion",
        };
      case 'parrain_portal':
        return {
          title: 'Mon Espace Personnel de Parrainage',
          subtitle: 'Votre lien Discord unique, vos statistiques et la progression de vos filleuls',
        };
      case 'discord_sync':
        return {
          title: 'Serveurs Discord & Passerelle Bot JARVIS',
          subtitle:
            'Monitoring des 4 serveurs (Recrutement, Formation, Production Chatting, Production Instagram) et synchronisation JARVIS',
        };
      case 'users':
        return {
          title: 'Utilisateurs & Gestion des Rôles',
          subtitle: 'Administration des accès, permissions RBAC et affectation des droits',
        };
      case 'audit_logs':
        return {
          title: "Journal d'Audit & Traçabilité",
          subtitle: "Historique chronologique inaltérable des actions, statuts et réattributions",
        };
      case 'oauth_settings':
        return {
          title: 'Configuration Discord & Déploiement Gratuit',
          subtitle:
            "Paramètres OAuth2, correspondances des 4 serveurs Discord et base de données Cloud Firestore (Spark)",
        };
      default:
        return { title: 'PAWAKO Referral Manager' };
    }
  };

  const { title, subtitle } = getHeaderInfo();

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-900 overflow-hidden font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={tab => {
          setActiveTab(tab);
          setCandidateStatusFilter(undefined);
          setCandidateVaTypeFilter(undefined);
          setCandidateAnomalyFilter(undefined);
        }}
        currentUser={currentUser}
        servers={stats?.servers}
        onLogout={() => handleLogout('/admin/login')}
        onOpenDiscordLogin={() => handleOpenDiscordLogin('admin')}
        isOAuthConfigured={isOAuthConfigured}
      />

      {/* Main Body */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          title={title}
          subtitle={subtitle}
          currentUser={currentUser}
          onOpenDiscordLogin={() => handleOpenDiscordLogin('admin')}
          onLogout={() => handleLogout('/admin/login')}
          isOAuthConfigured={isOAuthConfigured}
          onRefresh={triggerRefresh}
        />

        {/* View Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeTab === 'dashboard' && (
              <DashboardView
                stats={stats}
                onNavigateToCandidates={(filterStatus, extraParams) => {
                  setCandidateStatusFilter(filterStatus);
                  setCandidateVaTypeFilter(extraParams?.vaType);
                  setCandidateAnomalyFilter(extraParams?.hasAnomaly);
                  setActiveTab('candidates');
                }}
                onNavigateToReferrers={() => setActiveTab('referrers')}
              />
            )}

            {activeTab === 'candidates' && (
              <CandidatesView
                currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
                initialStatusFilter={candidateStatusFilter}
                initialVaTypeFilter={candidateVaTypeFilter}
                initialAnomalyFilter={candidateAnomalyFilter}
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
                onSelectReferrerFilter={() => {
                  setActiveTab('candidates');
                }}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'parrain_portal' && (
              <ParrainPortalView
                currentUserRole={currentUser?.role || 'ADMINISTRATEUR'}
                onSelectCandidate={id => setSelectedCandidateId(id)}
                refreshTrigger={refreshTrigger}
              />
            )}

            {activeTab === 'discord_sync' && (
              <DiscordSyncView
                refreshTrigger={refreshTrigger}
                onRefreshAll={triggerRefresh}
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
        onOpenStatusModal={candidate => setActiveStatusCandidate(candidate)}
        onOpenReassignModal={candidate => setActiveReassignCandidate(candidate)}
        onCandidateUpdated={triggerRefresh}
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
