import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Candidate, ParrainGuide, Referrer, UserRole, VAType } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getRecruitmentStageLabel,
  getRecruitmentStageBadgeClasses,
  getServerLabel,
  getVaTypeLabel,
  formatDate,
} from '../utils/statusUtils';
import { PawakoLogo } from '../components/PawakoLogo';
import { ParrainGuideRenderer } from '../components/ParrainGuideRenderer';
import {
  estimateReadingMinutes,
  extractGuideExcerpt,
  resolveGuideCoverUrl,
} from '../utils/blogCovers';
import { getSpecialtyTheme, getTopicColorTheme } from '../utils/categoryTheme';
import {
  Copy,
  Check,
  TrendingUp,
  Shield,
  Search,
  RefreshCw,
  Share2,
  ExternalLink,
  AlertTriangle,
  Link2,
  BookOpen,
  Users,
  Lock,
  MessageSquare,
  Instagram,
  ArrowRight,
  ArrowLeft,
  Clock,
  AlertCircle,
  Flame,
  LayoutList,
  LayoutGrid,
  Hash,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectCandidate: (candidateId: string) => void;
  refreshTrigger: number;
  onManualRefresh?: () => void;
  isMobileSidebarOpen?: boolean;
  onCloseMobileSidebar?: () => void;
  isEmbeddedInAdmin?: boolean;
}

export const ParrainPortalView: React.FC<Props> = ({
  currentUserRole: _currentUserRole,
  onSelectCandidate,
  refreshTrigger,
  onManualRefresh,
  isMobileSidebarOpen = false,
  onCloseMobileSidebar,
  isEmbeddedInAdmin = false,
}) => {
  const [data, setData] = useState<{
    referrer: Referrer;
    metrics: {
      totalFilleuls: number;
      enAttente: number;
      acceptes: number;
      refuses: number;
      enFormation: number;
      enSimulation: number;
      valides?: number;
      enProduction: number;
      abandonnes: number;
      enAttenteQualification?: number;
      enAttenteRetour?: number;
      qualifies?: number;
      nonQualifies?: number;
      conversionRate: number;
      acceptanceRate: number;
    };
    candidates: Candidate[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEnsuringInvite, setIsEnsuringInvite] = useState(false);
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [sharedLink, setSharedLink] = useState(false);
  const [search, setSearch] = useState('');
  const [actionTab, setActionTab] = useState<'ALL' | 'IN_PROGRESS' | 'PRODUCTION' | 'WAITING' | 'STOPPED'>('ALL');

  // Navigation interne (Fil & Journal / Mes Filleuls / Mon Lien Discord)
  const [activePortalTab, setActivePortalTab] = useState<'home' | 'filleuls' | 'invite'>('home');
  const [homeLayout, setHomeLayout] = useState<'feed' | 'grid'>('feed');

  // Guide d'accueil dynamique selon spécialité (guide principal + guides d'onboarding créés)
  const [guides, setGuides] = useState<ParrainGuide[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>('ALL');
  const [homeViewMode, setHomeViewMode] = useState<'magazine' | 'article'>('magazine');
  const [isGuideLoading, setIsGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  // Onboarding spécialité exclusive (premier choix verrouillé)
  const [selectedSpecialty, setSelectedSpecialty] = useState<VAType | null>(null);
  const [confirmingSpecialty, setConfirmingSpecialty] = useState(false);
  const [isSavingSpecialty, setIsSavingSpecialty] = useState(false);
  const [specialtyError, setSpecialtyError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMobileSidebarOpen || !onCloseMobileSidebar) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobileSidebar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileSidebarOpen, onCloseMobileSidebar]);

  const loadGuide = useCallback(async (vaType: VAType) => {
    try {
      setIsGuideLoading(true);
      setGuideError(null);
      const res = await api.getParrainGuide(vaType);
      const list =
        Array.isArray(res.guides) && res.guides.length > 0
          ? res.guides
          : res.guide
            ? [res.guide]
            : [];
      setGuides(list);
      setSelectedTopicFilter('ALL');
      setSelectedGuideId(prev =>
        prev && list.some(g => g.id === prev) ? prev : list[0]?.id || null
      );
    } catch (err: any) {
      setGuideError(err?.message || "Impossible de charger le guide d'accueil.");
    } finally {
      setIsGuideLoading(false);
    }
  }, []);

  const loadPortal = useCallback(
    async (isManual = false) => {
      try {
        if (isManual) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setError(null);
        const res = await api.getParrainDashboard();
        setData(res);
        if (res.referrer?.vaType === 'CHATTEUR' || res.referrer?.vaType === 'INSTAGRAM') {
          loadGuide(res.referrer.vaType);
        } else {
          setGuides([]);
          setSelectedGuideId(null);
        }
      } catch (err: any) {
        setError(err.message || 'Impossible de charger votre espace parrain.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [loadGuide]
  );

  useEffect(() => {
    loadPortal(false);
  }, [refreshTrigger, loadPortal]);

  const handleManualRefreshClick = async () => {
    await loadPortal(true);
    if (onManualRefresh) onManualRefresh();
  };

  const handleConfirmSpecialty = async () => {
    if (!selectedSpecialty || isSavingSpecialty) return;
    try {
      setIsSavingSpecialty(true);
      setSpecialtyError(null);
      await api.setParrainSpecialty(selectedSpecialty);
      setConfirmingSpecialty(false);
      setActivePortalTab('home');
      await loadPortal(true);
      if (onManualRefresh) onManualRefresh();
    } catch (err: any) {
      setSpecialtyError(err?.message || 'Impossible d’enregistrer votre spécialité.');
    } finally {
      setIsSavingSpecialty(false);
    }
  };

  const handleCopy = () => {
    if (data?.referrer.inviteUrl) {
      navigator.clipboard.writeText(data.referrer.inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleShare = async () => {
    if (!data?.referrer.inviteUrl) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Rejoindre PAWAKO',
          text: 'Rejoins le serveur Recrutement PAWAKO via mon lien de parrainage officiel :',
          url: data.referrer.inviteUrl,
        });
        setSharedLink(true);
        setTimeout(() => setSharedLink(false), 2000);
        return;
      } catch {
        // Fallback clipboard
      }
    }
    handleCopy();
  };

  const handleEnsureInvite = async () => {
    try {
      setIsEnsuringInvite(true);
      setInviteActionMessage(null);
      const res = await api.ensureParrainInvite();
      setData(prev => (prev ? { ...prev, referrer: res.referrer } : prev));
      if (!res.success && res.errorMessage) {
        setInviteActionMessage(res.errorMessage);
      } else if (res.success) {
        setInviteActionMessage('Lien Discord officiel vérifié et prêt à être partagé.');
      }
    } catch (err: any) {
      setInviteActionMessage(err.message || 'Impossible de générer le lien Discord pour le moment.');
    } finally {
      setIsEnsuringInvite(false);
    }
  };

  // Extract topic filters from guides cleanly via memo
  const topicFilters = useMemo(() => {
    const topicCounts = new Map<string, { label: string; count: number }>();
    for (const g of guides) {
      const seenInGuide = new Set<string>();
      const labels = [
        ...(g.category ? [g.category] : []),
        ...(Array.isArray(g.tags) ? g.tags : []),
      ];
      for (const rawLabel of labels) {
        const cleaned = String(rawLabel || '').trim();
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (seenInGuide.has(key)) continue;
        seenInGuide.add(key);
        const cur = topicCounts.get(key);
        if (cur) cur.count += 1;
        else topicCounts.set(key, { label: cleaned, count: 1 });
      }
    }
    return Array.from(topicCounts.values()).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')
    );
  }, [guides]);

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FA4616]" />
        Chargement de votre espace parrain...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl text-center space-y-4">
        <div className="w-10 h-10 bg-orange-50 dark:bg-[#FA4616]/15 text-[#FA4616] dark:text-orange-300 rounded-xl flex items-center justify-center mx-auto">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white text-sm">Espace Parrain</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {error || 'Aucun profil de parrain associé à ce compte.'}
        </p>
        <button
          onClick={() => loadPortal(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Réessayer</span>
        </button>
      </div>
    );
  }

  const { referrer, metrics, candidates } = data;
  const lockedSpecialty = referrer.vaType === 'CHATTEUR' || referrer.vaType === 'INSTAGRAM' ? referrer.vaType : null;

  // =========================================================================
  // ONBOARDING EXCLUSIF : CHOIX DE SPÉCIALITÉ AU PREMIER ACCÈS
  // =========================================================================
  if (!lockedSpecialty) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="h-1.5 bg-gradient-to-r from-[#FA4616] via-rose-500 to-indigo-500" />
          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-50 dark:bg-[#FA4616]/15 border border-orange-200 dark:border-[#FA4616]/30 text-[11px] font-bold uppercase tracking-wider text-[#d9380d] dark:text-orange-300">
                <Lock className="w-3.5 h-3.5" />
                <span>Configuration initiale</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                Choisissez votre spécialité de parrainage
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Chez PAWAKO, chaque parrain accompagne uniquement les filleuls du pôle où il possède une réelle expertise terrain. Vous avez l&apos;obligation de suivre vos filleuls jusqu&apos;à l&apos;obtention de résultats, car votre rémunération est directement liée à leur réussite.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-500/35 bg-amber-50/80 dark:bg-amber-500/10 text-xs text-amber-950 dark:text-amber-100 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-semibold">
                Ne prenez que la partie que vous maîtrisez.
              </span>
            </div>

            {specialtyError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{specialtyError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedSpecialty('CHATTEUR');
                  setConfirmingSpecialty(false);
                  setSpecialtyError(null);
                }}
                className={`text-left p-5 rounded-2xl border transition-all space-y-3 cursor-pointer ${
                  selectedSpecialty === 'CHATTEUR'
                    ? 'bg-indigo-50/80 dark:bg-indigo-500/15 border-indigo-600 dark:border-indigo-400 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50/70 dark:bg-[#181824] border-slate-200 dark:border-white/10 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  {selectedSpecialty === 'CHATTEUR' && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white">
                      Sélectionné
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Parrain VA Chatteur
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Accompagnement complet du parcours Chatting : sélection, formation, simulation, validation et suivi des performances en production.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedSpecialty('INSTAGRAM');
                  setConfirmingSpecialty(false);
                  setSpecialtyError(null);
                }}
                className={`text-left p-5 rounded-2xl border transition-all space-y-3 cursor-pointer ${
                  selectedSpecialty === 'INSTAGRAM'
                    ? 'bg-orange-50/80 dark:bg-[#FA4616]/15 border-[#FA4616] ring-2 ring-[#FA4616]/25'
                    : 'bg-slate-50/70 dark:bg-[#181824] border-slate-200 dark:border-white/10 hover:border-[#FA4616]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#FA4616]/15 text-[#FA4616] dark:text-orange-300 flex items-center justify-center">
                    <Instagram className="w-5 h-5" />
                  </div>
                  {selectedSpecialty === 'INSTAGRAM' && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#FA4616] text-white">
                      Sélectionné
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Parrain VA Instagram
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Accompagnement dédié au pôle Instagram : qualification, intégration directe en production et coaching de régularité sur les comptes.
                  </p>
                </div>
              </button>
            </div>

            {selectedSpecialty && !confirmingSpecialty && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingSpecialty(true)}
                  className={`min-h-[44px] px-5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                    getSpecialtyTheme(selectedSpecialty).button
                  }`}
                >
                  <span>Continuer avec {getVaTypeLabel(selectedSpecialty)}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {selectedSpecialty && confirmingSpecialty && (
              <div className="p-4 bg-slate-50 dark:bg-[#181824] border border-slate-200 dark:border-white/15 rounded-xl space-y-3">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#FA4616] shrink-0" />
                  <span>
                    Confirmer votre spécialité « {getVaTypeLabel(selectedSpecialty)} » ?
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Une fois validé, vous accéderez au fil d&apos;articles, aux outils et au suivi des filleuls du parcours{' '}
                  <strong>{getVaTypeLabel(selectedSpecialty)}</strong>.
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingSpecialty(false)}
                    disabled={isSavingSpecialty}
                    className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-lg cursor-pointer"
                  >
                    Modifier mon choix
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSpecialty}
                    disabled={isSavingSpecialty}
                    className={`min-h-[40px] px-5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      getSpecialtyTheme(selectedSpecialty).button
                    }`}
                  >
                    {isSavingSpecialty ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isSavingSpecialty ? 'Enregistrement...' : 'Valider et accéder'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PORTAIL PARRAIN 3 COLONNES (SIDEBAR + FLUX SOCIAL + WIDGETS EXPRESS)
  // =========================================================================
  const specialtyTheme = getSpecialtyTheme(lockedSpecialty);
  const hasRealInvite = Boolean(
    referrer.inviteUrl && referrer.inviteCode && referrer.inviteStatus !== 'EXPIRED_OR_DELETED'
  );
  const inviteNeedsAction =
    !referrer.inviteUrl ||
    !referrer.inviteCode ||
    referrer.inviteStatus === 'EXPIRED_OR_DELETED' ||
    referrer.inviteStatus === 'UNCONFIGURED' ||
    referrer.inviteStatus === 'ERROR';

  const isCandidateInProgress = (c: Candidate) =>
    c.status === 'ACCEPTE' ||
    c.status === 'EN_FORMATION' ||
    c.status === 'EN_SIMULATION' ||
    c.status === 'VALIDE';

  const isCandidateStopped = (c: Candidate) =>
    c.status === 'REFUSE' || c.status === 'ABANDONNE';

  const tabCounts = {
    ALL: candidates.length,
    IN_PROGRESS: candidates.filter(isCandidateInProgress).length,
    PRODUCTION: candidates.filter(c => c.status === 'EN_PRODUCTION').length,
    WAITING: candidates.filter(c => c.status === 'EN_ATTENTE').length,
    STOPPED: candidates.filter(isCandidateStopped).length,
  };

  const filteredCandidates = candidates.filter(c => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.displayName.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.discordUserId.includes(q);
    if (!matchesSearch) return false;
    if (actionTab === 'IN_PROGRESS') return isCandidateInProgress(c);
    if (actionTab === 'PRODUCTION') return c.status === 'EN_PRODUCTION';
    if (actionTab === 'WAITING') return c.status === 'EN_ATTENTE';
    if (actionTab === 'STOPPED') return isCandidateStopped(c);
    return true;
  });

  const getStepProgress = (status: Candidate['status'], specialty: VAType) => {
    if (specialty === 'INSTAGRAM') {
      switch (status) {
        case 'EN_PRODUCTION':
          return { step: 3, total: 3, pct: 100, stopped: false, completed: true };
        case 'ACCEPTE':
        case 'VALIDE':
          return { step: 2, total: 3, pct: 66, stopped: false, completed: false };
        case 'REFUSE':
        case 'ABANDONNE':
          return { step: 0, total: 3, pct: 0, stopped: true, completed: false };
        case 'EN_ATTENTE':
        default:
          return { step: 1, total: 3, pct: 33, stopped: false, completed: false };
      }
    }

    switch (status) {
      case 'EN_PRODUCTION':
        return { step: 5, total: 5, pct: 100, stopped: false, completed: true };
      case 'VALIDE':
        return { step: 4, total: 5, pct: 88, stopped: false, completed: false };
      case 'EN_SIMULATION':
        return { step: 4, total: 5, pct: 76, stopped: false, completed: false };
      case 'EN_FORMATION':
        return { step: 3, total: 5, pct: 58, stopped: false, completed: false };
      case 'ACCEPTE':
        return { step: 2, total: 5, pct: 38, stopped: false, completed: false };
      case 'REFUSE':
      case 'ABANDONNE':
        return { step: 0, total: 5, pct: 0, stopped: true, completed: false };
      case 'EN_ATTENTE':
      default:
        return { step: 1, total: 5, pct: 18, stopped: false, completed: false };
    }
  };

  // Palier de dynamique Production (1 -> 3 -> 5 -> 10 -> 20 -> +)
  const milestones = [1, 3, 5, 10, 20, 35, 50];
  const nextMilestone = milestones.find(m => m > metrics.enProduction) || metrics.enProduction + 10;
  const milestonePct = Math.min(100, Math.round((metrics.enProduction / nextMilestone) * 100));
  const remainingToMilestone = Math.max(0, nextMilestone - metrics.enProduction);

  const ambassadorRank =
    metrics.enProduction >= 10
      ? 'Élite PAWAKO'
      : metrics.enProduction >= 5
        ? 'Ambassadeur Confirmé'
        : metrics.enProduction >= 1
          ? 'Ambassadeur Actif'
          : 'Nouveau Parrain';

  const activeTopicKey =
    selectedTopicFilter === 'ALL' ? null : selectedTopicFilter.toLowerCase();
  const visibleGuides = activeTopicKey
    ? guides.filter(g => {
        const topics = [
          ...(g.category ? [g.category.trim().toLowerCase()] : []),
          ...(Array.isArray(g.tags) ? g.tags.map(t => t.trim().toLowerCase()) : []),
        ];
        return topics.includes(activeTopicKey);
      })
    : guides;

  const leadGuide = visibleGuides[0] || null;
  const secondaryGuides = leadGuide ? visibleGuides.slice(1) : [];

  const handleSelectNav = (tab: 'home' | 'filleuls' | 'invite') => {
    setActivePortalTab(tab);
    if (tab === 'home') {
      setHomeViewMode('magazine');
    }
    if (onCloseMobileSidebar) onCloseMobileSidebar();
  };

  const handleSelectTopicFromSidebar = (topic: string) => {
    setSelectedTopicFilter(topic);
    setActivePortalTab('home');
    setHomeViewMode('magazine');
    if (onCloseMobileSidebar) onCloseMobileSidebar();
  };

  const renderLeftSidebar = (isDrawer: boolean) => (
    <div
      className={`bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-4 space-y-5 flex flex-col ${
        isDrawer ? 'h-full rounded-none border-y-0 border-l-0 w-72 overflow-y-auto' : 'sticky top-20'
      }`}
    >
      {/* Mobile Drawer Close Header */}
      {isDrawer && onCloseMobileSidebar && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-center gap-2">
            <PawakoLogo size="sm" />
            <span className="font-extrabold text-sm text-slate-950 dark:text-white">Menu Parrain</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobileSidebar}
            aria-label="Fermer le menu parrain"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Parrain Identity Card */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-[2px] rounded-full bg-gradient-to-br ${specialtyTheme.gradient} shrink-0`}>
            {referrer.avatar ? (
              <img
                src={referrer.avatar}
                alt={referrer.discordDisplayName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full bg-white dark:bg-[#111118] object-cover"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                {(referrer.discordDisplayName || referrer.discordUsername || 'P').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-950 dark:text-white truncate">
              {referrer.discordDisplayName || referrer.discordUsername}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              @{referrer.discordUsername}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${specialtyTheme.badge}`}>
            {lockedSpecialty === 'INSTAGRAM' ? (
              <Instagram className="w-3 h-3" />
            ) : (
              <MessageSquare className="w-3 h-3" />
            )}
            <span>{getVaTypeLabel(lockedSpecialty)}</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
            <Trophy className="w-3 h-3" />
            <span>{ambassadorRank}</span>
          </span>
        </div>
      </div>

      {/* Primary Hub Navigation */}
      <nav aria-label="Navigation Espace Parrain" className="space-y-1">
        <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Navigation
        </div>

        <button
          type="button"
          onClick={() => handleSelectNav('home')}
          className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
            activePortalTab === 'home'
              ? 'bg-slate-950 text-white dark:bg-white/10 dark:text-white border border-slate-950 dark:border-white/15 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              activePortalTab === 'home'
                ? 'bg-[#FA4616] text-white'
                : 'bg-orange-50 dark:bg-[#FA4616]/15 text-[#FA4616] dark:text-orange-300'
            }`}>
              <Flame className="w-3.5 h-3.5" />
            </span>
            <span>Fil &amp; Journal</span>
          </span>
          <span className="font-mono tabular-nums text-[11px] opacity-75">{guides.length}</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectNav('filleuls')}
          className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
            activePortalTab === 'filleuls'
              ? 'bg-slate-950 text-white dark:bg-white/10 dark:text-white border border-slate-950 dark:border-white/15 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              activePortalTab === 'filleuls'
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
            }`}>
              <Users className="w-3.5 h-3.5" />
            </span>
            <span>Mes Filleuls</span>
          </span>
          <span className="font-mono tabular-nums text-[11px] opacity-75">{metrics.totalFilleuls}</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectNav('invite')}
          className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
            activePortalTab === 'invite'
              ? 'bg-slate-950 text-white dark:bg-white/10 dark:text-white border border-slate-950 dark:border-white/15 shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              activePortalTab === 'invite'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
            }`}>
              <Link2 className="w-3.5 h-3.5" />
            </span>
            <span>Mon Lien Discord</span>
          </span>
          <span className="font-mono tabular-nums text-[11px] opacity-75">{referrer.usesCount}</span>
        </button>
      </nav>

      {/* Thématiques & Tags Directory */}
      {topicFilters.length > 0 && (
        <div className="pt-3 border-t border-slate-100 dark:border-white/10 space-y-1.5">
          <div className="px-2 pb-0.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            <span>Thématiques</span>
            <Hash className="w-3 h-3" />
          </div>

          <button
            type="button"
            onClick={() => handleSelectTopicFromSidebar('ALL')}
            className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
              activePortalTab === 'home' && selectedTopicFilter === 'ALL'
                ? 'bg-slate-100 dark:bg-white/10 text-slate-950 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-[#FA4616] to-indigo-500" />
              <span>Tous les articles</span>
            </span>
            <span className="font-mono tabular-nums text-[11px] opacity-75">{guides.length}</span>
          </button>

          <div className="space-y-1 max-h-60 overflow-y-auto pr-0.5">
            {topicFilters.map(topic => {
              const tTheme = getTopicColorTheme(topic.label);
              const isSelected =
                activePortalTab === 'home' &&
                selectedTopicFilter.toLowerCase() === topic.label.toLowerCase();

              return (
                <button
                  key={topic.label}
                  type="button"
                  onClick={() => handleSelectTopicFromSidebar(topic.label)}
                  className={`w-full min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-white/10 text-slate-950 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tTheme.dot}`} />
                    <span className="truncate">{topic.label}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75 shrink-0 ml-2">
                    {topic.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Sticky Quick Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-white/10 space-y-2 mt-auto">
        {hasRealInvite ? (
          <button
            type="button"
            onClick={handleCopy}
            className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${specialtyTheme.button}`}
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'Lien Discord copié !' : 'Copier mon lien'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              handleEnsureInvite();
              handleSelectNav('invite');
            }}
            disabled={isEnsuringInvite}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#FA4616] to-rose-500 text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            <span>{isEnsuringInvite ? 'Génération...' : 'Activer mon lien'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleManualRefreshClick}
          disabled={isRefreshing}
          className="w-full min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FA4616]' : ''}`} />
          <span>Actualiser les données</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 xl:gap-6 items-start">
      {/* Desktop Dedicated Parrain Left Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        {renderLeftSidebar(false)}
      </aside>

      {/* Mobile Slide-Over Drawer for Parrain Sidebar */}
      {!isEmbeddedInAdmin && isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu latéral Parrain"
        >
          <div
            className="fixed inset-0 bg-slate-950/60 dark:bg-black/80 backdrop-blur-xs"
            onClick={onCloseMobileSidebar}
          />
          <div className="relative z-10 h-full">{renderLeftSidebar(true)}</div>
        </div>
      )}

      {/* CENTER COLUMN: SOCIAL FEED / FILLEULS / LINK HUB */}
      <div className="flex-1 min-w-0 w-full space-y-5">
        {/* Compact Mobile Quick Switcher (always reachable even without opening drawer) */}
        <div className="lg:hidden bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-2 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => handleSelectNav('home')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activePortalTab === 'home'
                ? 'bg-[#FA4616] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Fil &amp; Journal</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectNav('filleuls')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activePortalTab === 'filleuls'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Mes Filleuls ({metrics.totalFilleuls})</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectNav('invite')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activePortalTab === 'invite'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Mon Lien</span>
          </button>
        </div>

        {/* TAB 1 : FIL & JOURNAL DES PARRAINS */}
        {activePortalTab === 'home' && (
          <div className="space-y-5">
            {isGuideLoading ? (
              <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#FA4616]" />
                Chargement du fil d&apos;articles...
              </div>
            ) : guideError ? (
              <div className="bg-white dark:bg-[#111118] border border-rose-200 dark:border-rose-500/30 rounded-2xl p-6 text-center space-y-2 text-xs text-rose-800 dark:text-rose-200">
                <p>{guideError}</p>
                <button
                  type="button"
                  onClick={() => loadGuide(lockedSpecialty)}
                  className="px-3.5 py-1.5 bg-[#FA4616] text-white font-semibold rounded-xl cursor-pointer"
                >
                  Réessayer
                </button>
              </div>
            ) : guides.length > 0 ? (
              guides.length === 1 || homeViewMode === 'article' ? (
                <div className="space-y-4">
                  {guides.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setHomeViewMode('magazine')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#111118] hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl cursor-pointer transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-[#FA4616]" />
                        <span>Retour au fil ({guides.length} articles)</span>
                      </button>

                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-bold ${specialtyTheme.badge}`}>
                        Édition {getVaTypeLabel(lockedSpecialty)}
                      </span>
                    </div>
                  )}

                  {(() => {
                    const activeIndex = Math.max(
                      0,
                      guides.findIndex(g => g.id === (selectedGuideId || guides[0]?.id))
                    );
                    const activeGuide = guides[activeIndex] || guides[0];
                    const prevGuide = activeIndex > 0 ? guides[activeIndex - 1] : null;
                    const nextGuide = activeIndex < guides.length - 1 ? guides[activeIndex + 1] : null;

                    return (
                      <>
                        <ParrainGuideRenderer guide={activeGuide} />

                        {guides.length > 1 && (prevGuide || nextGuide) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {prevGuide ? (
                              <button
                                type="button"
                                onClick={() => setSelectedGuideId(prevGuide.id)}
                                className="text-left p-4 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 hover:border-[#FA4616]/60 rounded-2xl transition-colors cursor-pointer space-y-1"
                              >
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                                  <ArrowLeft className="w-3 h-3" />
                                  <span>Article précédent</span>
                                </div>
                                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                                  {prevGuide.title}
                                </div>
                              </button>
                            ) : (
                              <div />
                            )}

                            {nextGuide && (
                              <button
                                type="button"
                                onClick={() => setSelectedGuideId(nextGuide.id)}
                                className="text-left sm:text-right p-4 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 hover:border-[#FA4616]/60 rounded-2xl transition-colors cursor-pointer space-y-1"
                              >
                                <div className="text-[11px] font-bold uppercase tracking-wider text-[#FA4616] flex items-center sm:justify-end gap-1">
                                  <span>Article suivant</span>
                                  <ArrowRight className="w-3 h-3" />
                                </div>
                                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white line-clamp-1">
                                  {nextGuide.title}
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                /* Whop-inspired Social Feed + Grid Magazine */
                <div className="space-y-5">
                  {/* Feed Masthead Banner + View Mode Switch */}
                  <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
                    <div className={`h-1 w-full bg-gradient-to-r ${specialtyTheme.gradient}`} />
                    <div className="p-4 sm:p-6 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border text-[11px] font-bold uppercase tracking-wider ${specialtyTheme.badge}`}>
                              <Sparkles className="w-3 h-3" />
                              <span>Hub {getVaTypeLabel(lockedSpecialty)}</span>
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {visibleGuides.length} / {guides.length} publications
                            </span>
                          </div>
                          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                            Le Fil des Parrains PAWAKO
                          </h2>
                        </div>

                        {/* Vue Flux / Vue Grille Switch */}
                        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#191924] border border-slate-200 dark:border-white/10 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setHomeLayout('feed')}
                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                              homeLayout === 'feed'
                                ? 'bg-white dark:bg-[#252536] text-slate-950 dark:text-white shadow-xs'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <LayoutList className="w-3.5 h-3.5" />
                            <span>Vue Flux</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setHomeLayout('grid')}
                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                              homeLayout === 'grid'
                                ? 'bg-white dark:bg-[#252536] text-slate-950 dark:text-white shadow-xs'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Vue Grille</span>
                          </button>
                        </div>
                      </div>

                      {/* Colorful Topic / Tag Filter Chips */}
                      {topicFilters.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Filtrer par catégorie ou tag">
                          <button
                            type="button"
                            onClick={() => setSelectedTopicFilter('ALL')}
                            className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                              selectedTopicFilter === 'ALL'
                                ? 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-slate-950 dark:border-white'
                                : 'bg-slate-50 dark:bg-[#181823] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:text-slate-950 dark:hover:text-white'
                            }`}
                          >
                            <span>Tous</span>
                            <span className="font-mono tabular-nums text-[11px] opacity-75">
                              {guides.length}
                            </span>
                          </button>

                          {topicFilters.map(topic => {
                            const isActive =
                              selectedTopicFilter.toLowerCase() === topic.label.toLowerCase();
                            const tTheme = getTopicColorTheme(topic.label);
                            return (
                              <button
                                key={topic.label}
                                type="button"
                                onClick={() =>
                                  setSelectedTopicFilter(prev =>
                                    prev.toLowerCase() === topic.label.toLowerCase()
                                      ? 'ALL'
                                      : topic.label
                                  )
                                }
                                className={`min-h-[32px] px-3 py-1 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                                  isActive
                                    ? tTheme.chipActive
                                    : `${tTheme.badge} hover:brightness-95 dark:hover:brightness-110`
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-current opacity-85' : tTheme.dot}`} />
                                <span>{topic.label}</span>
                                <span className="font-mono tabular-nums text-[11px] opacity-80">
                                  {topic.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {!leadGuide ? (
                    <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-8 text-center space-y-3 text-xs text-slate-500 dark:text-slate-400">
                      <p>Aucun article trouvé pour la thématique « {selectedTopicFilter} ».</p>
                      <button
                        type="button"
                        onClick={() => setSelectedTopicFilter('ALL')}
                        className="px-4 py-2 bg-[#FA4616] hover:bg-[#e43d11] text-white font-bold rounded-xl cursor-pointer"
                      >
                        Voir tous les articles
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Featured Lead Story Card */}
                      {(() => {
                        const leadCover = resolveGuideCoverUrl(leadGuide);
                        const leadMinutes = estimateReadingMinutes(leadGuide);
                        const leadCat = leadGuide.category?.trim() || '';
                        const leadExcerpt = extractGuideExcerpt(leadGuide, 190);
                        const leadTheme = getTopicColorTheme(leadCat || leadGuide.vaType);

                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGuideId(leadGuide.id);
                              setHomeViewMode('article');
                            }}
                            className={`group w-full text-left bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 ${leadTheme.borderAccent} rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl grid grid-cols-1 md:grid-cols-12 items-stretch cursor-pointer`}
                          >
                            <div className="md:col-span-6 aspect-[16/10] md:aspect-auto md:min-h-[270px] overflow-hidden bg-slate-100 dark:bg-[#09090d] relative">
                              <img
                                src={leadCover}
                                alt={leadGuide.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                              />
                              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-xs text-white text-[11px] font-bold">
                                <Flame className="w-3 h-3 text-[#FA4616]" />
                                <span>À la une</span>
                              </div>
                            </div>

                            <div className="md:col-span-6 p-5 sm:p-6 flex flex-col justify-between gap-4">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  {leadCat && (
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${leadTheme.badge}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${leadTheme.dot}`} />
                                      <span>{leadCat}</span>
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                    <Clock className="w-3 h-3" />
                                    {leadMinutes} min
                                  </span>
                                </div>

                                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-950 dark:text-white leading-[1.18] group-hover:text-[#FA4616] dark:group-hover:text-orange-400 transition-colors [text-wrap:balance]">
                                  {leadGuide.title}
                                </h3>

                                {leadExcerpt && (
                                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                                    {leadExcerpt}
                                  </p>
                                )}

                                {Array.isArray(leadGuide.tags) && leadGuide.tags.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {leadGuide.tags.slice(0, 4).map(t => {
                                      const tagT = getTopicColorTheme(t);
                                      return (
                                        <span
                                          key={t}
                                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${tagT.badge}`}
                                        >
                                          #{t}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs font-bold text-[#FA4616] dark:text-orange-400">
                                <span>Lire le guide complet</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </button>
                        );
                      })()}

                      {/* Secondary Publications — Vue Flux (Social Post Cards) OR Vue Grille */}
                      {secondaryGuides.length > 0 && (
                        homeLayout === 'feed' ? (
                          <div className="space-y-3.5">
                            {secondaryGuides.map(item => {
                              const itemCover = resolveGuideCoverUrl(item);
                              const itemMinutes = estimateReadingMinutes(item);
                              const itemTags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
                              const itemCat = item.category?.trim() || '';
                              const itemExcerpt = extractGuideExcerpt(item, 150);
                              const itemTheme = getTopicColorTheme(itemCat || item.vaType);

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedGuideId(item.id);
                                    setHomeViewMode('article');
                                  }}
                                  className={`group w-full text-left bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 ${itemTheme.borderAccent} rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg flex flex-col sm:flex-row gap-4 sm:gap-5 items-stretch cursor-pointer`}
                                >
                                  <div className="sm:w-52 aspect-[16/10] sm:aspect-auto sm:h-36 rounded-xl overflow-hidden bg-slate-100 dark:bg-[#09090d] border border-slate-200/70 dark:border-white/10 shrink-0">
                                    <img
                                      src={itemCover}
                                      alt={item.title}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                                    />
                                  </div>

                                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        {itemCat ? (
                                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${itemTheme.badge}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${itemTheme.dot}`} />
                                            <span>{itemCat}</span>
                                          </span>
                                        ) : (
                                          <span />
                                        )}
                                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                          <Clock className="w-3 h-3" />
                                          {itemMinutes} min
                                        </span>
                                      </div>

                                      <h4 className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white leading-snug group-hover:text-[#FA4616] dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                                        {item.title}
                                      </h4>

                                      {itemExcerpt && (
                                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                                          {itemExcerpt}
                                        </p>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {itemTags.map(t => {
                                          const tTheme = getTopicColorTheme(t);
                                          return (
                                            <span
                                              key={t}
                                              className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${tTheme.badge}`}
                                            >
                                              #{t}
                                            </span>
                                          );
                                        })}
                                      </div>

                                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${itemTheme.text} shrink-0`}>
                                        <span>Ouvrir</span>
                                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {secondaryGuides.map(item => {
                              const itemCover = resolveGuideCoverUrl(item);
                              const itemMinutes = estimateReadingMinutes(item);
                              const itemTags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
                              const itemCat = item.category?.trim() || '';
                              const itemExcerpt = extractGuideExcerpt(item, 140);
                              const itemTheme = getTopicColorTheme(itemCat || item.vaType);

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedGuideId(item.id);
                                    setHomeViewMode('article');
                                  }}
                                  className={`group text-left bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 ${itemTheme.borderAccent} rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg flex flex-col cursor-pointer`}
                                >
                                  <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-[#09090d] border-b border-slate-100 dark:border-white/10">
                                    <img
                                      src={itemCover}
                                      alt={item.title}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                                    />
                                  </div>

                                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                                    <div className="space-y-2.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        {itemCat ? (
                                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${itemTheme.badge}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${itemTheme.dot}`} />
                                            <span>{itemCat}</span>
                                          </span>
                                        ) : (
                                          <span />
                                        )}
                                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                          <Clock className="w-3 h-3" />
                                          {itemMinutes} min
                                        </span>
                                      </div>

                                      <h4 className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white leading-snug group-hover:text-[#FA4616] dark:group-hover:text-orange-400 transition-colors line-clamp-2">
                                        {item.title}
                                      </h4>

                                      {itemExcerpt && (
                                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                                          {itemExcerpt}
                                        </p>
                                      )}

                                      {itemTags.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                          {itemTags.map(t => {
                                            const tTheme = getTopicColorTheme(t);
                                            return (
                                              <span
                                                key={t}
                                                className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${tTheme.badge}`}
                                              >
                                                #{t}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>

                                    <div className={`pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-xs font-bold ${itemTheme.text}`}>
                                      <span>Lire l&apos;article</span>
                                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )
            ) : (
              <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-10 text-center space-y-2">
                <BookOpen className="w-6 h-6 text-[#FA4616] mx-auto" />
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Aucun article publié pour le moment
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Les guides d&apos;onboarding apparaîtront ici dès leur publication.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2 : MES FILLEULS & PROGRESSION */}
        {activePortalTab === 'filleuls' && (
          <div className="space-y-5">
            {/* Colorful KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Filleuls</div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-950 dark:text-white">
                  {metrics.totalFilleuls}
                </div>
              </div>

              <div className="bg-white dark:bg-[#111118] border border-indigo-200 dark:border-indigo-500/30 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">Suivi actif</div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-indigo-700 dark:text-indigo-200">
                  {tabCounts.IN_PROGRESS}
                </div>
              </div>

              <div className="bg-white dark:bg-[#111118] border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">En Production</div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-200">
                  {metrics.enProduction}
                </div>
              </div>

              <div className="bg-white dark:bg-[#111118] border border-orange-200 dark:border-[#FA4616]/35 rounded-2xl p-4 space-y-1">
                <div className="text-[11px] font-semibold text-[#d9380d] dark:text-orange-300">Conversion</div>
                <div className="text-2xl font-extrabold font-mono tabular-nums text-[#FA4616] dark:text-orange-300">
                  {metrics.conversionRate}%
                </div>
              </div>
            </div>

            {/* List of Filleuls with Action Tabs & Step Progress */}
            <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
              <div className="p-5 border-b border-slate-100 dark:border-white/10 space-y-4">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-950 dark:text-white text-lg">
                      Suivi de vos filleuls {getVaTypeLabel(lockedSpecialty)}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Repérez en un coup d&apos;œil l&apos;étape de chacun pour les accompagner vers la production.
                    </p>
                  </div>

                  <div className="relative w-full md:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      placeholder="Rechercher un filleul..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full min-h-[40px] pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FA4616]/30 text-slate-900 dark:text-white bg-slate-50 dark:bg-[#181824] placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Colorful Action Filter Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      {
                        id: 'ALL',
                        label: 'Tous',
                        count: tabCounts.ALL,
                        activeClass: 'bg-slate-950 dark:bg-white text-white dark:text-slate-950 border-slate-950 dark:border-white',
                      },
                      {
                        id: 'IN_PROGRESS',
                        label: 'En cours de suivi',
                        count: tabCounts.IN_PROGRESS,
                        activeClass: 'bg-indigo-600 text-white border-indigo-600',
                      },
                      {
                        id: 'PRODUCTION',
                        label: 'En Production',
                        count: tabCounts.PRODUCTION,
                        activeClass: 'bg-emerald-600 text-white border-emerald-600',
                      },
                      {
                        id: 'WAITING',
                        label: 'À relancer / Attente',
                        count: tabCounts.WAITING,
                        activeClass: 'bg-amber-500 text-slate-950 border-amber-500',
                      },
                      {
                        id: 'STOPPED',
                        label: 'Refusés / Abandons',
                        count: tabCounts.STOPPED,
                        activeClass: 'bg-rose-600 text-white border-rose-600',
                      },
                    ] as const
                  ).map(tab => {
                    const active = actionTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActionTab(tab.id)}
                        className={`min-h-[34px] px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors flex items-center gap-2 cursor-pointer ${
                          active
                            ? tab.activeClass
                            : 'bg-slate-50 dark:bg-[#181824] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/25'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="font-mono tabular-nums text-[11px] opacity-80">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {(candidates.some(c => c.recruitmentStage === 'EN_ATTENTE_QUALIFICATION' || c.recruitmentStage === 'EN_ATTENTE_RETOUR')) && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 pt-1">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Suivi Serveur Recrutement :</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-300 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                      Formulaire à compléter :{' '}
                      <span className="font-mono tabular-nums">
                        {candidates.filter(c => c.recruitmentStage === 'EN_ATTENTE_QUALIFICATION').length}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Sans réponse 24h+ (à relancer) :{' '}
                      <span className="font-mono tabular-nums">
                        {candidates.filter(c => c.recruitmentStage === 'EN_ATTENTE_RETOUR').length}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-white/10">
                {filteredCandidates.length === 0 ? (
                  <div className="py-10 px-4 text-center text-slate-500 dark:text-slate-400 text-xs">
                    {metrics.totalFilleuls === 0
                      ? `Aucun filleul ${getVaTypeLabel(lockedSpecialty)} enregistré pour le moment.`
                      : 'Aucun filleul dans cet onglet.'}
                  </div>
                ) : (
                  filteredCandidates.map(candidate => {
                    const badge = getStatusBadgeClasses(candidate.status);
                    const prog = getStepProgress(candidate.status, lockedSpecialty);
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => onSelectCandidate(candidate.id)}
                        className="w-full text-left p-4 hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors space-y-3 cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {candidate.avatar ? (
                              <img
                                src={candidate.avatar}
                                alt={candidate.displayName}
                                referrerPolicy="no-referrer"
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-white/15 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-[#1c1c29] flex items-center justify-center font-bold text-slate-700 dark:text-white text-xs shrink-0">
                                {candidate.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white text-xs truncate">
                                {candidate.displayName}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                @{candidate.username}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[11px] ${badge.text} font-bold`}>
                              {getStatusLabel(candidate.status)}
                            </span>
                            {candidate.recruitmentStage && (() => {
                              const stageBadge = getRecruitmentStageBadgeClasses(candidate.recruitmentStage);
                              return (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${stageBadge.bg} ${stageBadge.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${stageBadge.dot}`} />
                                  {getRecruitmentStageLabel(candidate.recruitmentStage)}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Step Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{getServerLabel(candidate.currentServer)}</span>
                            <span className="font-mono tabular-nums">
                              {prog.stopped ? 'Parcours clos' : `Étape ${prog.step}/${prog.total}`}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                prog.stopped
                                  ? 'bg-rose-400/70'
                                  : prog.completed
                                    ? 'bg-emerald-500'
                                    : specialtyTheme.bar
                              }`}
                              style={{ width: `${prog.stopped ? 100 : prog.pct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#181823] text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="py-3.5 px-5 font-semibold">Filleul</th>
                      <th className="py-3.5 px-4 font-semibold">Serveur</th>
                      <th className="py-3.5 px-4 font-semibold">Statut</th>
                      <th className="py-3.5 px-4 font-semibold">Progression</th>
                      <th className="py-3.5 px-4 font-semibold">Arrivée</th>
                      <th className="py-3.5 px-5 font-semibold text-right">Détails</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-slate-700 dark:text-slate-300">
                    {filteredCandidates.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400 text-xs">
                          {metrics.totalFilleuls === 0
                            ? `Aucun filleul ${getVaTypeLabel(lockedSpecialty)} enregistré pour le moment.`
                            : 'Aucun filleul dans cet onglet.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCandidates.map(candidate => {
                        const badge = getStatusBadgeClasses(candidate.status);
                        const prog = getStepProgress(candidate.status, lockedSpecialty);
                        return (
                          <tr
                            key={candidate.id}
                            onClick={() => onSelectCandidate(candidate.id)}
                            className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 px-5">
                              <div className="flex items-center gap-3">
                                {candidate.avatar ? (
                                  <img
                                    src={candidate.avatar}
                                    alt={candidate.displayName}
                                    referrerPolicy="no-referrer"
                                    className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/15 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#1c1c29] flex items-center justify-center font-bold text-slate-700 dark:text-white text-xs shrink-0">
                                    {candidate.displayName.charAt(0)}
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-slate-900 dark:text-white">
                                    {candidate.displayName}
                                  </div>
                                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                    @{candidate.username}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                              {getServerLabel(candidate.currentServer)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <span className={`text-xs ${badge.text} font-bold block`}>
                                  {getStatusLabel(candidate.status)}
                                </span>
                                {candidate.recruitmentStage && (() => {
                                  const stageBadge = getRecruitmentStageBadgeClasses(candidate.recruitmentStage);
                                  return (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${stageBadge.bg} ${stageBadge.text}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${stageBadge.dot}`} />
                                      <span>{getRecruitmentStageLabel(candidate.recruitmentStage)}</span>
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 min-w-[160px]">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                  <span>
                                    {prog.stopped ? 'Clos' : `Étape ${prog.step}/${prog.total}`}
                                  </span>
                                  {!prog.stopped && <span>{prog.pct}%</span>}
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      prog.stopped
                                        ? 'bg-rose-400/70'
                                        : prog.completed
                                          ? 'bg-emerald-500'
                                          : specialtyTheme.bar
                                    }`}
                                    style={{ width: `${prog.stopped ? 100 : prog.pct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                              {formatDate(candidate.arrivalDate)}
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onSelectCandidate(candidate.id);
                                }}
                                className={`px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-xs transition-colors font-bold whitespace-nowrap cursor-pointer ${specialtyTheme.text}`}
                              >
                                Voir
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3 : MON LIEN DISCORD & PARTAGE */}
        {activePortalTab === 'invite' && (
          <div className="space-y-5">
            <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className={`h-1.5 w-full bg-gradient-to-r ${specialtyTheme.gradient}`} />
              <div className="p-6 sm:p-8 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider ${specialtyTheme.badge}`}>
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Lien Discord Officiel</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {referrer.usesCount} clic{referrer.usesCount > 1 ? 's' : ''}
                    {referrer.inviteCode ? ` · ${referrer.inviteCode}` : ''}
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                    Partagez votre lien {getVaTypeLabel(lockedSpecialty)}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                    Chaque candidat rejoignant le serveur Recrutement PAWAKO avec votre lien personnel vous est automatiquement attribué et suivi jusqu&apos;à la production.
                  </p>
                </div>

                {inviteNeedsAction && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="font-bold">
                          {referrer.inviteStatus === 'EXPIRED_OR_DELETED'
                            ? 'Votre lien Discord a expiré ou été supprimé sur le serveur Recrutement.'
                            : "Lien d'invitation Discord officiel non encore généré"}
                        </div>
                        <div className="text-[11px] opacity-90 leading-relaxed">
                          {referrer.inviteError ||
                            'La génération nécessite que le bot JARVIS dispose de la permission Créer une invitation sur le serveur Recrutement.'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleEnsureInvite}
                      disabled={isEnsuringInvite}
                      className="min-h-[40px] px-4 py-2 bg-[#FA4616] hover:bg-[#e43d11] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Link2 className={`w-3.5 h-3.5 ${isEnsuringInvite ? 'animate-pulse' : ''}`} />
                      <span>{isEnsuringInvite ? 'Vérification...' : 'Générer mon lien Discord'}</span>
                    </button>
                  </div>
                )}

                {inviteActionMessage && (
                  <div className="p-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-700 dark:text-slate-200">
                    {inviteActionMessage}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <input
                    type="text"
                    readOnly
                    value={hasRealInvite ? referrer.inviteUrl : 'Aucun lien Discord actif disponible pour le moment'}
                    aria-label="Votre lien d'invitation Discord Recrutement"
                    className={`flex-1 min-h-[46px] text-xs font-mono px-3.5 py-2.5 bg-slate-50 dark:bg-[#09090d] border border-slate-200 dark:border-white/15 rounded-xl select-all focus:outline-none ${
                      hasRealInvite ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500 italic'
                    }`}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      disabled={!hasRealInvite}
                      className={`flex-1 sm:flex-initial min-h-[46px] flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl transition-all hover:-translate-y-0.5 shrink-0 whitespace-nowrap cursor-pointer disabled:opacity-40 ${specialtyTheme.button}`}
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLink ? 'Lien copié !' : 'Copier le lien'}</span>
                    </button>

                    <button
                      onClick={handleShare}
                      disabled={!hasRealInvite}
                      title="Partager le lien"
                      className="min-h-[46px] px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>{sharedLink ? 'Partagé' : 'Partager'}</span>
                    </button>

                    {hasRealInvite && (
                      <a
                        href={referrer.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir l'invitation Discord"
                        aria-label="Ouvrir l'invitation Discord"
                        className="min-h-[46px] min-w-[46px] flex items-center justify-center text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 border border-slate-200 dark:border-white/10 rounded-xl transition-colors shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  1. Briefez votre contact avant le clic
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Expliquez clairement le rôle {getVaTypeLabel(lockedSpecialty)} et ses exigences avant d&apos;envoyer votre lien pour maximiser votre taux d&apos;acceptation ({metrics.acceptanceRate}%).
                </p>
              </div>

              <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-2">
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  2. Suivez chaque étape en direct
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Dès son arrivée sur le serveur Recrutement, retrouvez votre filleul dans l&apos;onglet Mes Filleuls et relancez-le s&apos;il reste en attente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT WIDGET RAIL: EXPRESS LINK + MILESTONES + PULSE */}
      <aside className="w-full xl:w-80 shrink-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
        {/* Widget 1: Mon Lien Express */}
        <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
          <div className={`px-4 py-3 bg-gradient-to-r ${specialtyTheme.gradient} text-white flex items-center justify-between gap-2`}>
            <div className="flex items-center gap-2 text-xs font-extrabold tracking-tight">
              <Link2 className="w-4 h-4 shrink-0" />
              <span>Mon Lien Express</span>
            </div>
            <span className="font-mono tabular-nums text-[11px] bg-black/25 px-2 py-0.5 rounded-md font-bold">
              {referrer.usesCount} clic{referrer.usesCount > 1 ? 's' : ''}
            </span>
          </div>

          <div className="p-4 space-y-3">
            {inviteNeedsAction ? (
              <div className="space-y-2.5">
                <div className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3 leading-relaxed">
                  {referrer.inviteStatus === 'EXPIRED_OR_DELETED'
                    ? 'Lien expiré : régénérez votre invitation Discord officielle.'
                    : 'Lien Discord officiel non encore actif.'}
                </div>
                <button
                  type="button"
                  onClick={handleEnsureInvite}
                  disabled={isEnsuringInvite}
                  className="w-full min-h-[40px] px-3.5 py-2 bg-[#FA4616] hover:bg-[#e43d11] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Link2 className={`w-3.5 h-3.5 ${isEnsuringInvite ? 'animate-pulse' : ''}`} />
                  <span>{isEnsuringInvite ? 'Génération...' : 'Générer mon lien'}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-[#09090d] border border-slate-200 dark:border-white/10 rounded-xl">
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-200 truncate">
                    {referrer.inviteUrl}
                  </span>
                  <span className="font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                    {referrer.inviteCode}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`flex-1 min-h-[38px] px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all ${specialtyTheme.button}`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copié !' : 'Copier'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Partager"
                    className="min-h-[38px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <a
                    href={referrer.inviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Ouvrir Discord"
                    aria-label="Ouvrir Discord"
                    className="min-h-[38px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 rounded-xl flex items-center justify-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Widget 2: Objectifs & Paliers */}
        <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Objectifs &amp; Paliers
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-950 dark:text-white">
                  {metrics.enProduction}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  en production
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Cap {nextMilestone} en prod.
              </span>
              <span className="font-mono tabular-nums font-bold text-[#FA4616] dark:text-orange-400">
                {metrics.enProduction} / {nextMilestone}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FA4616] via-amber-400 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.max(metrics.enProduction > 0 ? 10 : 0, milestonePct)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {metrics.enProduction === 0
                ? 'Accompagnez votre premier filleul en production pour lancer votre palier.'
                : `Encore ${remainingToMilestone} filleul${remainingToMilestone > 1 ? 's' : ''} pour valider le palier ${nextMilestone}.`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-white/10 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#181823]">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Conversion</div>
              <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {metrics.conversionRate}%
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#181823]">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Acceptation</div>
              <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {metrics.acceptanceRate}%
              </div>
            </div>
          </div>
        </div>

        {/* Widget 3: Pouls des Filleuls (Interactive Jump Links) */}
        <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
              Pouls de mes filleuls
            </span>
            <button
              type="button"
              onClick={() => {
                setActionTab('ALL');
                setActivePortalTab('filleuls');
              }}
              className={`text-[11px] font-bold hover:underline cursor-pointer ${specialtyTheme.text}`}
            >
              Tout voir
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setActionTab('PRODUCTION');
                setActivePortalTab('filleuls');
              }}
              className="w-full p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/25 flex items-center justify-between text-xs hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>En Production</span>
              </span>
              <span className="font-mono tabular-nums font-extrabold text-emerald-700 dark:text-emerald-300">
                {tabCounts.PRODUCTION}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionTab('IN_PROGRESS');
                setActivePortalTab('filleuls');
              }}
              className="w-full p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200/80 dark:border-indigo-500/25 flex items-center justify-between text-xs hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 font-semibold text-indigo-800 dark:text-indigo-300">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span>Parcours Actif</span>
              </span>
              <span className="font-mono tabular-nums font-extrabold text-indigo-700 dark:text-indigo-300">
                {tabCounts.IN_PROGRESS}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionTab('WAITING');
                setActivePortalTab('filleuls');
              }}
              className="w-full p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/25 flex items-center justify-between text-xs hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>À relancer / Attente</span>
              </span>
              <span className="font-mono tabular-nums font-extrabold text-amber-700 dark:text-amber-300">
                {tabCounts.WAITING}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionTab('STOPPED');
                setActivePortalTab('filleuls');
              }}
              className="w-full p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/25 flex items-center justify-between text-xs hover:brightness-95 dark:hover:brightness-110 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 font-semibold text-rose-800 dark:text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Refusés / Abandons</span>
              </span>
              <span className="font-mono tabular-nums font-extrabold text-rose-700 dark:text-rose-300">
                {tabCounts.STOPPED}
              </span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
