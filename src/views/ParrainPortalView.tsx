import React, { useState, useEffect, useCallback } from 'react';
import { Candidate, ParrainGuide, Referrer, UserRole, VAType } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getStatusLabel,
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
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectCandidate: (candidateId: string) => void;
  refreshTrigger: number;
  onManualRefresh?: () => void;
}

export const ParrainPortalView: React.FC<Props> = ({
  currentUserRole: _currentUserRole,
  onSelectCandidate,
  refreshTrigger,
  onManualRefresh,
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

  // Navigation interne (Accueil / Mes Filleuls & Lien)
  const [activePortalTab, setActivePortalTab] = useState<'home' | 'filleuls'>('home');

  // Guide d'accueil dynamique selon spécialité (guide principal + guides d'onboarding créés)
  const [guides, setGuides] = useState<ParrainGuide[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [homeViewMode, setHomeViewMode] = useState<'magazine' | 'article'>('magazine');
  const [isGuideLoading, setIsGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);

  // Onboarding spécialité exclusive (premier choix verrouillé)
  const [selectedSpecialty, setSelectedSpecialty] = useState<VAType | null>(null);
  const [confirmingSpecialty, setConfirmingSpecialty] = useState(false);
  const [isSavingSpecialty, setIsSavingSpecialty] = useState(false);
  const [specialtyError, setSpecialtyError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-[#9d93b8] text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
        Chargement de votre espace parrain...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl text-center space-y-4">
        <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-sm">Espace Parrain</h3>
        <p className="text-xs text-slate-500 dark:text-[#9d93b8] leading-relaxed">
          {error || 'Aucun profil de parrain associé à ce compte.'}
        </p>
        <button
          onClick={() => loadPortal(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
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
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              <Lock className="w-3.5 h-3.5" />
              <span>Configuration initiale obligatoire</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
              Choisissez votre spécialité exclusive de parrainage
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#b7aed0] leading-relaxed">
              Chez PAWAKO, chaque parrain accompagne uniquement les filleuls du pôle où il possède une réelle expertise terrain. Vous avez l&apos;obligation de suivre vos filleuls jusqu&apos;à l&apos;obtention de résultats, car votre rémunération est directement liée à leur réussite.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-500/35 bg-amber-50/70 dark:bg-[#1b1410] text-xs text-amber-950 dark:text-amber-100 space-y-1.5">
            <div className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Règle stricte de cloisonnement &amp; verrouillage</span>
            </div>
            <p className="leading-relaxed opacity-90">
              Si vous choisissez <strong>VA Instagram</strong> (ou <strong>VA Chatteur</strong>) et qu&apos;un candidat ayant cliqué sur votre lien bascule sur l&apos;autre poste, il ne sera ni affiché dans votre espace ni comptabilisé dans votre rémunération. Ce choix est <strong>verrouillé</strong> : seul un Administrateur peut le modifier en cas d&apos;erreur.
            </p>
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
              className={`text-left p-5 rounded-xl border transition-colors space-y-3 cursor-pointer ${
                selectedSpecialty === 'CHATTEUR'
                  ? 'bg-violet-50/70 dark:bg-[#191129] border-violet-600 dark:border-violet-400'
                  : 'bg-slate-50/60 dark:bg-[#171026] border-slate-200 dark:border-[#241a38] hover:border-violet-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-violet-600/15 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4" />
                </div>
                {selectedSpecialty === 'CHATTEUR' && (
                  <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                    Sélectionné
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa]">
                  Parrain VA Chatteur
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#9d93b8] mt-1 leading-relaxed">
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
              className={`text-left p-5 rounded-xl border transition-colors space-y-3 cursor-pointer ${
                selectedSpecialty === 'INSTAGRAM'
                  ? 'bg-violet-50/70 dark:bg-[#191129] border-violet-600 dark:border-violet-400'
                  : 'bg-slate-50/60 dark:bg-[#171026] border-slate-200 dark:border-[#241a38] hover:border-violet-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                  <Instagram className="w-4 h-4" />
                </div>
                {selectedSpecialty === 'INSTAGRAM' && (
                  <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                    Sélectionné
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa]">
                  Parrain VA Instagram
                </h3>
                <p className="text-xs text-slate-600 dark:text-[#9d93b8] mt-1 leading-relaxed">
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
                className="min-h-[44px] px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Continuer avec {getVaTypeLabel(selectedSpecialty)}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedSpecialty && confirmingSpecialty && (
            <div className="p-4 bg-slate-50 dark:bg-[#171026] border border-violet-300 dark:border-violet-500/40 rounded-xl space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
                <Lock className="w-4 h-4 text-violet-500 shrink-0" />
                <span>
                  Confirmer votre spécialité « {getVaTypeLabel(selectedSpecialty)} » ?
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-[#b7aed0] leading-relaxed">
                Une fois validé, ce choix sera immédiatement verrouillé. Vous n&apos;aurez accès qu&apos;au guide, aux conditions et aux filleuls du parcours{' '}
                <strong>{getVaTypeLabel(selectedSpecialty)}</strong>.
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingSpecialty(false)}
                  disabled={isSavingSpecialty}
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-600 dark:text-[#9d93b8] hover:bg-slate-200/70 dark:hover:bg-[#231839] rounded-lg cursor-pointer"
                >
                  Modifier mon choix
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSpecialty}
                  disabled={isSavingSpecialty}
                  className="min-h-[40px] px-5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingSpecialty ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSavingSpecialty ? 'Enregistrement...' : 'Valider et verrouiller'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // PORTAIL PARRAIN VERROUILLÉ SUR UNE SPÉCIALITÉ (ACCUEIL + MES FILLEULS)
  // =========================================================================
  const validesCount = metrics.valides ?? candidates.filter(c => c.operationalStatus === 'VALIDE').length;
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
          return { step: 3, total: 3, pct: 100, stopped: false };
        case 'ACCEPTE':
        case 'VALIDE':
          return { step: 2, total: 3, pct: 66, stopped: false };
        case 'REFUSE':
        case 'ABANDONNE':
          return { step: 0, total: 3, pct: 0, stopped: true };
        case 'EN_ATTENTE':
        default:
          return { step: 1, total: 3, pct: 33, stopped: false };
      }
    }

    switch (status) {
      case 'EN_PRODUCTION':
        return { step: 5, total: 5, pct: 100, stopped: false };
      case 'VALIDE':
        return { step: 4, total: 5, pct: 88, stopped: false };
      case 'EN_SIMULATION':
        return { step: 4, total: 5, pct: 76, stopped: false };
      case 'EN_FORMATION':
        return { step: 3, total: 5, pct: 58, stopped: false };
      case 'ACCEPTE':
        return { step: 2, total: 5, pct: 38, stopped: false };
      case 'REFUSE':
      case 'ABANDONNE':
        return { step: 0, total: 5, pct: 0, stopped: true };
      case 'EN_ATTENTE':
      default:
        return { step: 1, total: 5, pct: 18, stopped: false };
    }
  };

  // Palier de dynamique Production (1 -> 3 -> 5 -> 10 -> 20 -> +)
  const milestones = [1, 3, 5, 10, 20, 35, 50];
  const nextMilestone = milestones.find(m => m > metrics.enProduction) || metrics.enProduction + 10;
  const milestonePct = Math.min(100, Math.round((metrics.enProduction / nextMilestone) * 100));
  const remainingToMilestone = Math.max(0, nextMilestone - metrics.enProduction);

  const segmentPct = (value: number) =>
    metrics.totalFilleuls > 0 && value > 0
      ? Math.max(4, Math.round((value / metrics.totalFilleuls) * 100))
      : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Unified Header + Quick Actions + Tab Switcher */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-4 sm:p-6 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {referrer.avatar ? (
              <img
                src={referrer.avatar}
                alt={referrer.discordDisplayName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
              />
            ) : (
              <PawakoLogo size="md" />
            )}
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-serif text-lg sm:text-xl font-bold text-slate-950 dark:text-[#f8f6fc] truncate">
                  {referrer.discordDisplayName || referrer.discordUsername}
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  <Lock className="w-3 h-3" />
                  <span>{getVaTypeLabel(lockedSpecialty)}</span>
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-[#9d93b8] truncate">
                @{referrer.discordUsername}
                <span className="mx-1.5 text-slate-300 dark:text-[#3b2d5c]">·</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-[#e9e5f5] font-medium">
                  {metrics.enProduction}
                </span>{' '}
                en production sur{' '}
                <span className="font-mono tabular-nums text-slate-800 dark:text-[#e9e5f5] font-medium">
                  {metrics.totalFilleuls}
                </span>{' '}
                filleul{metrics.totalFilleuls > 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
              <button
                type="button"
                onClick={() => setActivePortalTab('home')}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  activePortalTab === 'home'
                    ? 'bg-slate-950 text-white dark:bg-violet-600'
                    : 'text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Journal &amp; Règles</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePortalTab('filleuls')}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  activePortalTab === 'filleuls'
                    ? 'bg-slate-950 text-white dark:bg-violet-600'
                    : 'text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Mes Filleuls &amp; Lien</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    activePortalTab === 'filleuls' ? 'text-violet-200 dark:text-violet-100' : 'text-slate-400 dark:text-[#7c7296]'
                  }`}
                >
                  {metrics.totalFilleuls}
                </span>
              </button>
            </div>

            {hasRealInvite && (
              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[38px] px-3 py-1.5 bg-violet-50 dark:bg-[#191129] hover:bg-violet-100 dark:hover:bg-[#231839] border border-violet-200 dark:border-violet-500/35 rounded-xl text-xs font-semibold text-violet-700 dark:text-violet-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Lien copié' : 'Copier mon lien'}</span>
              </button>
            )}

            <button
              onClick={handleManualRefreshClick}
              disabled={isRefreshing}
              title="Actualiser"
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-slate-50 dark:bg-[#171026] hover:bg-slate-100 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-violet-500' : ''}`} />
              <span className="hidden md:inline">Actualiser</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1 : ACCUEIL & GUIDE PARCOURS */}
      {activePortalTab === 'home' && (
        <div className="space-y-4 sm:space-y-5">

          {isGuideLoading ? (
            <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-10 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
              Chargement du guide d&apos;accueil...
            </div>
          ) : guideError ? (
            <div className="bg-white dark:bg-[#100b1a] border border-rose-200 dark:border-rose-500/30 rounded-xl p-6 text-center space-y-2 text-xs text-rose-800 dark:text-rose-200">
              <p>{guideError}</p>
              <button
                type="button"
                onClick={() => loadGuide(lockedSpecialty)}
                className="px-3.5 py-1.5 bg-violet-600 text-white font-semibold rounded-lg cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          ) : guides.length > 0 ? (
            guides.length === 1 || homeViewMode === 'article' ? (
              <div className="space-y-4 sm:space-y-5">
                {guides.length > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setHomeViewMode('magazine')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-white dark:bg-[#100b1a] hover:bg-slate-50 dark:hover:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg cursor-pointer transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      <span>Tous les articles ({guides.length})</span>
                    </button>

                    <div className="text-[11px] text-slate-500 dark:text-[#9d93b8]">
                      Journal {getVaTypeLabel(lockedSpecialty)}
                    </div>
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
                              className="text-left p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] hover:border-violet-400 dark:hover:border-violet-500/50 rounded-xl transition-colors cursor-pointer space-y-1"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#7c7296] flex items-center gap-1">
                                <ArrowLeft className="w-3 h-3" />
                                <span>Article précédent</span>
                              </div>
                              <div className="font-serif text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f1fa] line-clamp-1">
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
                              className="text-left sm:text-right p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] hover:border-violet-400 dark:hover:border-violet-500/50 rounded-xl transition-colors cursor-pointer space-y-1"
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center sm:justify-end gap-1">
                                <span>Article suivant</span>
                                <ArrowRight className="w-3 h-3" />
                              </div>
                              <div className="font-serif text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f1fa] line-clamp-1">
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
              /* Magazine Blog Front-Page (when 2+ articles exist) */
              (() => {
                const leadGuide = guides[0];
                const secondaryGuides = guides.slice(1);
                const leadCover = resolveGuideCoverUrl(leadGuide);
                const leadMinutes = estimateReadingMinutes(leadGuide);

                return (
                  <div className="space-y-6">
                    {/* Publication Masthead */}
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-slate-200 dark:border-[#241a38]">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                          Édition {getVaTypeLabel(lockedSpecialty)}
                        </div>
                        <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-950 dark:text-[#f8f6fc] tracking-tight mt-0.5">
                          Le Journal des Parrains PAWAKO
                        </h2>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
                        {guides.length} articles publiés
                      </div>
                    </div>

                    {/* Featured Lead Story (Split 2-col editorial hero) */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGuideId(leadGuide.id);
                        setHomeViewMode('article');
                      }}
                      className="group w-full text-left bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] hover:border-violet-400/70 dark:hover:border-violet-500/45 rounded-2xl overflow-hidden transition-colors grid grid-cols-1 lg:grid-cols-12 items-stretch cursor-pointer"
                    >
                      <div className="lg:col-span-7 aspect-[16/10] lg:aspect-auto lg:min-h-[300px] overflow-hidden bg-slate-100 dark:bg-[#08050f]">
                        <img
                          src={leadCover}
                          alt={leadGuide.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                        />
                      </div>

                      <div className="lg:col-span-5 p-5 sm:p-7 flex flex-col justify-between gap-5">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                            <span className="font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                              À la une
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{leadGuide.category || 'Guide principal'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <Clock className="w-3 h-3" />
                              {leadMinutes} min
                            </span>
                          </div>

                          <h3 className="font-serif text-xl sm:text-2xl lg:text-[1.7rem] font-bold text-slate-950 dark:text-[#f8f6fc] leading-[1.2] group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors [text-wrap:balance]">
                            {leadGuide.title}
                          </h3>

                          <p className="text-xs sm:text-sm text-slate-600 dark:text-[#b7aed0] leading-relaxed line-clamp-3">
                            {extractGuideExcerpt(leadGuide, 200)}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 dark:border-[#1e1530] flex items-center justify-between text-xs font-semibold text-violet-700 dark:text-violet-300">
                          <span>Lire le guide complet</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </button>

                    {/* Secondary Articles Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {secondaryGuides.map(item => {
                        const itemCover = resolveGuideCoverUrl(item);
                        const itemMinutes = estimateReadingMinutes(item);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedGuideId(item.id);
                              setHomeViewMode('article');
                            }}
                            className="group text-left bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] hover:border-violet-400/70 dark:hover:border-violet-500/45 rounded-2xl overflow-hidden transition-colors flex flex-col cursor-pointer"
                          >
                            <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100 dark:bg-[#08050f] border-b border-slate-100 dark:border-[#1e1530]">
                              <img
                                src={itemCover}
                                alt={item.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                              />
                            </div>

                            <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                                  <span className="font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                                    {item.category || 'Onboarding'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                                    <Clock className="w-3 h-3" />
                                    {itemMinutes} min
                                  </span>
                                </div>

                                <h4 className="font-serif text-lg font-bold text-slate-950 dark:text-[#f8f6fc] leading-snug group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors line-clamp-2">
                                  {item.title}
                                </h4>

                                <p className="text-xs text-slate-600 dark:text-[#b7aed0] leading-relaxed line-clamp-3">
                                  {extractGuideExcerpt(item, 140)}
                                </p>
                              </div>

                              <div className="pt-3 border-t border-slate-100 dark:border-[#1e1530] flex items-center justify-between text-xs font-semibold text-violet-700 dark:text-violet-300">
                                <span>Lire l&apos;article</span>
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )
          ) : null}
        </div>
      )}

      {/* TAB 2 : MES FILLEULS & PERFORMANCES */}
      {activePortalTab === 'filleuls' && (
        <div className="space-y-6">
          {/* 2-Column Momentum & Official Discord Link Hero Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: Official Invite Link Express */}
            <div className="lg:col-span-7 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
                    Lien d&apos;invitation Discord officiel
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
                    {referrer.usesCount} clic{referrer.usesCount > 1 ? 's' : ''}
                    {referrer.inviteCode ? ` · ${referrer.inviteCode}` : ''}
                  </span>
                </div>
                <h3 className="font-serif text-xl font-bold text-slate-950 dark:text-[#f8f6fc]">
                  Partagez votre lien {getVaTypeLabel(lockedSpecialty)}
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#9d93b8] leading-relaxed">
                  Chaque candidat rejoignant le serveur Recrutement via ce lien vous est automatiquement attribué.
                </p>
              </div>

              {inviteNeedsAction && (
                <div className="p-3.5 bg-amber-50 dark:bg-[#1b1224] border border-amber-200 dark:border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">
                        {referrer.inviteStatus === 'EXPIRED_OR_DELETED'
                          ? 'Votre lien Discord a expiré ou été supprimé sur le serveur Recrutement.'
                          : "Lien d'invitation Discord officiel non encore généré"}
                      </div>
                      <div className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                        {referrer.inviteError ||
                          'La génération nécessite que le bot JARVIS dispose de la permission Créer une invitation sur le serveur Recrutement.'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleEnsureInvite}
                    disabled={isEnsuringInvite}
                    className="min-h-[40px] px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Link2 className={`w-3.5 h-3.5 ${isEnsuringInvite ? 'animate-pulse' : ''}`} />
                    <span>{isEnsuringInvite ? 'Vérification...' : 'Générer mon lien Discord'}</span>
                  </button>
                </div>
              )}

              {inviteActionMessage && (
                <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg text-xs text-slate-700 dark:text-[#d8d0eb]">
                  {inviteActionMessage}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={hasRealInvite ? referrer.inviteUrl : 'Aucun lien Discord actif disponible pour le moment'}
                  aria-label="Votre lien d'invitation Discord Recrutement"
                  className={`flex-1 min-h-[44px] text-xs font-mono px-3.5 py-2.5 bg-slate-50 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38] rounded-xl select-all focus:outline-none ${
                    hasRealInvite ? 'text-slate-900 dark:text-[#f4f1fa]' : 'text-slate-400 dark:text-[#7c7296] italic'
                  }`}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    disabled={!hasRealInvite}
                    className="flex-1 sm:flex-initial min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl transition-all hover:-translate-y-0.5 shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copié</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copier</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleShare}
                    disabled={!hasRealInvite}
                    title="Partager le lien"
                    className="min-h-[44px] px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] disabled:opacity-40 rounded-xl transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden xs:inline">{sharedLink ? 'Partagé' : 'Partager'}</span>
                  </button>

                  {hasRealInvite && (
                    <a
                      href={referrer.inviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ouvrir l'invitation Discord"
                      aria-label="Ouvrir l'invitation Discord"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-[#c4badb] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl transition-colors shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Momentum & Milestone Progression Card */}
            <div className="lg:col-span-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[#9d93b8]">
                    Conversion &amp; Dynamique
                  </div>
                  <div className="flex items-baseline gap-2.5 mt-1">
                    <span className="font-serif text-4xl font-bold tabular-nums text-slate-950 dark:text-[#f8f6fc] leading-none">
                      {metrics.conversionRate}%
                    </span>
                    <span className="text-xs font-medium text-slate-500 dark:text-[#9d93b8]">
                      en Production
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-[#191129] text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              {/* Milestone Progress Bar */}
              <div className="space-y-2 bg-slate-50 dark:bg-[#150e24] border border-slate-200/80 dark:border-[#241a38] rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-[#e9e5f5]">
                    Objectif : {nextMilestone} en Production
                  </span>
                  <span className="font-mono tabular-nums font-bold text-violet-700 dark:text-violet-300">
                    {metrics.enProduction} / {nextMilestone}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-violet-600 dark:bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(metrics.enProduction > 0 ? 8 : 0, milestonePct)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  {metrics.enProduction === 0
                    ? 'Accompagnez votre premier filleul jusqu’en production pour lancer votre palier.'
                    : `Plus que ${remainingToMilestone} filleul${remainingToMilestone > 1 ? 's' : ''} en production pour atteindre le cap ${nextMilestone}.`}
                </p>
              </div>

              {/* Compact Pipeline Summary */}
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-[#171026] overflow-hidden flex gap-0.5">
                  {metrics.totalFilleuls === 0 ? (
                    <div className="w-full h-full bg-slate-200 dark:bg-[#241a38]" />
                  ) : (
                    <>
                      {metrics.enProduction > 0 && (
                        <div
                          title={`Production : ${metrics.enProduction}`}
                          className="h-full bg-violet-600 dark:bg-violet-500"
                          style={{ width: `${segmentPct(metrics.enProduction)}%` }}
                        />
                      )}
                      {lockedSpecialty === 'CHATTEUR' && validesCount > 0 && (
                        <div
                          title={`Validés : ${validesCount}`}
                          className="h-full bg-violet-500/80"
                          style={{ width: `${segmentPct(validesCount)}%` }}
                        />
                      )}
                      {lockedSpecialty === 'CHATTEUR' && metrics.enSimulation > 0 && (
                        <div
                          title={`Simulation : ${metrics.enSimulation}`}
                          className="h-full bg-purple-400"
                          style={{ width: `${segmentPct(metrics.enSimulation)}%` }}
                        />
                      )}
                      {lockedSpecialty === 'CHATTEUR' && metrics.enFormation > 0 && (
                        <div
                          title={`Formation : ${metrics.enFormation}`}
                          className="h-full bg-violet-300 dark:bg-violet-300/80"
                          style={{ width: `${segmentPct(metrics.enFormation)}%` }}
                        />
                      )}
                      {metrics.acceptes > 0 && (
                        <div
                          title={`Acceptés : ${metrics.acceptes}`}
                          className="h-full bg-emerald-500/80"
                          style={{ width: `${segmentPct(metrics.acceptes)}%` }}
                        />
                      )}
                      {metrics.enAttente > 0 && (
                        <div
                          title={`En attente : ${metrics.enAttente}`}
                          className="h-full bg-slate-400 dark:bg-[#5c4f7a]"
                          style={{ width: `${segmentPct(metrics.enAttente)}%` }}
                        />
                      )}
                      {metrics.refuses > 0 && (
                        <div
                          title={`Refusés : ${metrics.refuses}`}
                          className="h-full bg-slate-500 dark:bg-[#362b4d]"
                          style={{ width: `${segmentPct(metrics.refuses)}%` }}
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span>
                    <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                      {tabCounts.IN_PROGRESS}
                    </strong>{' '}
                    en suivi actif
                  </span>
                  <span>
                    Acceptation :{' '}
                    <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                      {metrics.acceptanceRate}%
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* List of Filleuls with Action Tabs & Step Progress */}
          <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl overflow-hidden transition-colors">
            <div className="p-5 border-b border-slate-100 dark:border-[#1e1530] space-y-4">
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-slate-900 dark:text-[#f4f1fa] text-lg">
                    Suivi de vos filleuls {getVaTypeLabel(lockedSpecialty)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
                    Repérez en un coup d&apos;œil l&apos;étape de chacun pour les accompagner vers la production.
                  </p>
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
                  <input
                    type="text"
                    placeholder="Rechercher un filleul..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full min-h-[40px] pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-slate-50 dark:bg-[#171026] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                  />
                </div>
              </div>

              {/* Action Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'ALL', label: 'Tous', count: tabCounts.ALL },
                    { id: 'IN_PROGRESS', label: 'En cours de suivi', count: tabCounts.IN_PROGRESS },
                    { id: 'PRODUCTION', label: 'En Production', count: tabCounts.PRODUCTION },
                    { id: 'WAITING', label: 'À relancer / Attente', count: tabCounts.WAITING },
                    { id: 'STOPPED', label: 'Refusés / Abandons', count: tabCounts.STOPPED },
                  ] as const
                ).map(tab => {
                  const active = actionTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActionTab(tab.id)}
                      className={`min-h-[34px] px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-2 cursor-pointer ${
                        active
                          ? 'bg-slate-950 text-white border-slate-950 dark:bg-violet-600 dark:border-violet-600'
                          : 'bg-slate-50 dark:bg-[#171026] text-slate-600 dark:text-[#b7aed0] border-slate-200 dark:border-[#241a38] hover:border-slate-300 dark:hover:border-[#392959]'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`font-mono tabular-nums text-[11px] ${
                          active ? 'text-slate-300 dark:text-violet-100' : 'text-slate-400 dark:text-[#7c7296]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-[#1e1530]">
              {filteredCandidates.length === 0 ? (
                <div className="py-10 px-4 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
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
                      className="w-full text-left p-4 hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors space-y-3 cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {candidate.avatar ? (
                            <img
                              src={candidate.avatar}
                              alt={candidate.displayName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-[#1d1430] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs shrink-0">
                              {candidate.displayName.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-xs truncate">
                              {candidate.displayName}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-[#7c7296] truncate">
                              @{candidate.username}
                            </div>
                          </div>
                        </div>
                        <span className={`text-[11px] ${badge.text} font-semibold shrink-0`}>
                          {getStatusLabel(candidate.status)}
                        </span>
                      </div>

                      {/* Step Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#9d93b8]">
                          <span>{getServerLabel(candidate.currentServer)}</span>
                          <span className="font-mono tabular-nums">
                            {prog.stopped ? 'Parcours clos' : `Étape ${prog.step}/${prog.total}`}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1d1430] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              prog.stopped ? 'bg-slate-400 dark:bg-[#493b6b]' : 'bg-violet-600 dark:bg-violet-500'
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
                <thead className="bg-slate-50 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
                  <tr>
                    <th className="py-3.5 px-5 font-semibold">Filleul</th>
                    <th className="py-3.5 px-4 font-semibold">Serveur</th>
                    <th className="py-3.5 px-4 font-semibold">Statut</th>
                    <th className="py-3.5 px-4 font-semibold">Progression</th>
                    <th className="py-3.5 px-4 font-semibold">Arrivée</th>
                    <th className="py-3.5 px-5 font-semibold text-right">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530] text-slate-700 dark:text-[#d8d0eb]">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
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
                          className="hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              {candidate.avatar ? (
                                <img
                                  src={candidate.avatar}
                                  alt={candidate.displayName}
                                  referrerPolicy="no-referrer"
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#1d1430] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs shrink-0">
                                  {candidate.displayName.charAt(0)}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                                  {candidate.displayName}
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-[#7c7296]">
                                  @{candidate.username}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-[#9d93b8]">
                            {getServerLabel(candidate.currentServer)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`text-xs ${badge.text} font-semibold`}>
                              {getStatusLabel(candidate.status)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 min-w-[160px]">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#9d93b8]">
                                <span>
                                  {prog.stopped ? 'Clos' : `Étape ${prog.step}/${prog.total}`}
                                </span>
                                {!prog.stopped && <span>{prog.pct}%</span>}
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1d1430] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    prog.stopped ? 'bg-slate-400 dark:bg-[#493b6b]' : 'bg-violet-600 dark:bg-violet-500'
                                  }`}
                                  style={{ width: `${prog.stopped ? 100 : prog.pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums text-[11px]">
                            {formatDate(candidate.arrivalDate)}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onSelectCandidate(candidate.id);
                              }}
                              className="px-2.5 py-1 text-slate-700 dark:text-violet-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#231839] rounded-lg text-xs transition-colors font-semibold whitespace-nowrap cursor-pointer"
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
    </div>
  );
};
