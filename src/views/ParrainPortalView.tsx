import React, { useState, useEffect, useCallback } from 'react';
import { Candidate, Referrer, UserRole } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getServerLabel,
  getVaTypeLabel,
  formatDate,
} from '../utils/statusUtils';
import { PawakoLogo } from '../components/PawakoLogo';
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
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [vaTypeFilter, setVaTypeFilter] = useState('ALL');

  const loadPortal = useCallback(async (isManual = false) => {
    try {
      if (isManual) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      const res = await api.getParrainDashboard();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Impossible de charger votre espace parrain.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPortal(false);
  }, [refreshTrigger, loadPortal]);

  const handleManualRefreshClick = async () => {
    await loadPortal(true);
    if (onManualRefresh) onManualRefresh();
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
        // Utilisateur a annulé ou navigateur non compatible -> copie presse-papier
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
  const validesCount = metrics.valides ?? candidates.filter(c => c.operationalStatus === 'VALIDE').length;
  const hasRealInvite = Boolean(referrer.inviteUrl && referrer.inviteCode && referrer.inviteStatus !== 'EXPIRED_OR_DELETED');
  const inviteNeedsAction =
    !referrer.inviteUrl ||
    !referrer.inviteCode ||
    referrer.inviteStatus === 'EXPIRED_OR_DELETED' ||
    referrer.inviteStatus === 'UNCONFIGURED' ||
    referrer.inviteStatus === 'ERROR';

  const filteredCandidates = candidates.filter(c => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.displayName.toLowerCase().includes(q) ||
      c.username.toLowerCase().includes(q) ||
      c.discordUserId.includes(q);
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesVaType = vaTypeFilter === 'ALL' || c.vaType === vaTypeFilter;
    return matchesSearch && matchesStatus && matchesVaType;
  });

  const segmentPct = (value: number) =>
    metrics.totalFilleuls > 0 && value > 0
      ? Math.max(4, Math.round((value / metrics.totalFilleuls) * 100))
      : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Parrain Invite Link & Profile Card */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {referrer.avatar ? (
              <img
                src={referrer.avatar}
                alt={referrer.discordDisplayName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
              />
            ) : (
              <PawakoLogo size="md" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] truncate">
                  {referrer.discordDisplayName || referrer.discordUsername}
                </h2>
                <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30">
                  Parrain actif
                </span>
                {referrer.inviteCode && (
                  <span className="text-[11px] bg-slate-100 dark:bg-[#191129] text-slate-700 dark:text-violet-300 font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[#2e224a]">
                    {referrer.inviteCode}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] mt-0.5 truncate">
                @{referrer.discordUsername} · <span className="font-mono">{referrer.discordUserId}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
                Filleuls attribués :{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                  {metrics.totalFilleuls}
                </strong>{' '}
                <span className="text-slate-300 dark:text-[#3b2d5c] mx-1">·</span>
                Utilisations du lien :{' '}
                <strong className="font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                  {referrer.usesCount}
                </strong>
              </p>
            </div>
          </div>

          <button
            onClick={handleManualRefreshClick}
            disabled={isRefreshing}
            className="min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-slate-50 dark:bg-[#171026] hover:bg-slate-100 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg transition-colors flex items-center justify-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-violet-500' : ''}`} />
            <span>Actualiser</span>
          </button>
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
                    "La génération nécessite que le bot JARVIS dispose de la permission Créer une invitation sur le serveur Recrutement."}
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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={hasRealInvite ? referrer.inviteUrl : 'Aucun lien Discord actif disponible pour le moment'}
            aria-label="Votre lien d'invitation Discord Recrutement"
            className={`flex-1 min-h-[44px] text-xs font-mono px-3 py-2.5 bg-slate-50 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38] rounded-lg select-all focus:outline-none ${
              hasRealInvite ? 'text-slate-900 dark:text-[#f4f1fa]' : 'text-slate-400 dark:text-[#7c7296] italic'
            }`}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!hasRealInvite}
              className="flex-1 sm:flex-initial min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg transition-colors shrink-0 whitespace-nowrap cursor-pointer"
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
              className="min-h-[44px] px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] disabled:opacity-40 rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
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
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-[#c4badb] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg transition-colors shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3 text-center text-xs">
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Total</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.totalFilleuls}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">En attente</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb] mt-1">
            {metrics.enAttente}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Acceptés</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.acceptes}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Formation</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.enFormation}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Simulation</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.enSimulation}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Validés</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {validesCount}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-violet-300 dark:border-violet-500/40 rounded-xl">
          <div className="text-[11px] text-violet-700 dark:text-violet-300 font-semibold">Production</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300 mt-1">
            {metrics.enProduction}
          </div>
        </div>
        <div className="p-3.5 sm:p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Refusés</div>
          <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] mt-1">
            {metrics.refuses}
          </div>
        </div>
      </div>

      {/* Conversion Rate & Harmonized PAWAKO Progression Track */}
      <div className="p-4 sm:p-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-4 text-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-[#191129] text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
              Conversion en Production :{' '}
              <span className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
                {metrics.conversionRate}%
              </span>
            </div>
            <div className="text-slate-500 dark:text-[#9d93b8] mt-0.5">
              Acceptation :{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-[#f4f1fa]">
                {metrics.acceptanceRate}%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-[#171026] overflow-hidden flex gap-0.5 p-0.5">
            {metrics.totalFilleuls === 0 ? (
              <div className="w-full h-full rounded-full bg-slate-200 dark:bg-[#241a38]" />
            ) : (
              <>
                {metrics.enProduction > 0 && (
                  <div
                    title={`Production : ${metrics.enProduction}`}
                    className="h-full bg-violet-600 dark:bg-violet-500 rounded-l-full"
                    style={{ width: `${segmentPct(metrics.enProduction)}%` }}
                  />
                )}
                {validesCount > 0 && (
                  <div
                    title={`Validés : ${validesCount}`}
                    className="h-full bg-violet-500/80"
                    style={{ width: `${segmentPct(validesCount)}%` }}
                  />
                )}
                {metrics.enSimulation > 0 && (
                  <div
                    title={`Simulation : ${metrics.enSimulation}`}
                    className="h-full bg-purple-400"
                    style={{ width: `${segmentPct(metrics.enSimulation)}%` }}
                  />
                )}
                {metrics.enFormation > 0 && (
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
                    className="h-full bg-slate-500 dark:bg-[#362b4d] rounded-r-full"
                    style={{ width: `${segmentPct(metrics.refuses)}%` }}
                  />
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-[#9d93b8]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-violet-600 dark:bg-violet-500" />
              Production (<span className="font-mono tabular-nums">{metrics.enProduction}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-violet-500/80" />
              Validés (<span className="font-mono tabular-nums">{validesCount}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-purple-400" />
              Simulation (<span className="font-mono tabular-nums">{metrics.enSimulation}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-violet-300 dark:bg-violet-300/80" />
              Formation (<span className="font-mono tabular-nums">{metrics.enFormation}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-emerald-500/80" />
              Acceptés (<span className="font-mono tabular-nums">{metrics.acceptes}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-slate-400 dark:bg-[#5c4f7a]" />
              Attente (<span className="font-mono tabular-nums">{metrics.enAttente}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-slate-500 dark:bg-[#362b4d]" />
              Refusés (<span className="font-mono tabular-nums">{metrics.refuses}</span>)
            </span>
          </div>
        </div>
      </div>

      {/* List of Filleuls */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-[#1e1530] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
            Filleuls (<span className="font-mono tabular-nums">{filteredCandidates.length}</span>)
          </h3>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
              <input
                type="text"
                placeholder="Rechercher un filleul..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full min-h-[40px] pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
              />
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-2">
              <select
                value={vaTypeFilter}
                onChange={e => setVaTypeFilter(e.target.value)}
                aria-label="Filtrer par activité"
                className="min-h-[40px] px-2.5 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#e9e5f5] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="ALL">Toutes activités</option>
                <option value="CHATTEUR">VA Chatting</option>
                <option value="INSTAGRAM">VA Instagram</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filtrer par statut"
                className="min-h-[40px] px-2.5 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#e9e5f5] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="EN_ATTENTE">En attente</option>
                <option value="ACCEPTE">Accepté</option>
                <option value="EN_FORMATION">En formation</option>
                <option value="EN_SIMULATION">En simulation</option>
                <option value="VALIDE">Validé</option>
                <option value="EN_PRODUCTION">En production</option>
                <option value="REFUSE">Refusé</option>
                <option value="ABANDONNE">Abandonné</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-[#1e1530]">
          {filteredCandidates.length === 0 ? (
            <div className="py-10 px-4 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
              {metrics.totalFilleuls === 0
                ? 'Aucun filleul enregistré pour le moment.'
                : 'Aucun filleul ne correspond à vos filtres.'}
            </div>
          ) : (
            filteredCandidates.map(candidate => {
              const badge = getStatusBadgeClasses(candidate.status);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectCandidate(candidate.id)}
                  className="w-full text-left p-4 hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors space-y-2.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
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
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-xs truncate">
                          {candidate.displayName}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-[#7c7296] truncate">
                          @{candidate.username}
                        </div>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] ${badge.text} font-semibold shrink-0`}>
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                      {getStatusLabel(candidate.status)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#9d93b8] gap-2">
                    <span className="font-medium text-slate-700 dark:text-[#e9e5f5]">
                      {getVaTypeLabel(candidate.vaType)} · {getServerLabel(candidate.currentServer)}
                    </span>
                    <span className="font-mono shrink-0">{formatDate(candidate.arrivalDate)}</span>
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
                <th className="py-3 px-4 font-semibold">Filleul</th>
                <th className="py-3 px-4 font-semibold">Activité</th>
                <th className="py-3 px-4 font-semibold">Serveur</th>
                <th className="py-3 px-4 font-semibold">Statut</th>
                <th className="py-3 px-4 font-semibold">Arrivée</th>
                <th className="py-3 px-4 font-semibold text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530] text-slate-700 dark:text-[#d8d0eb]">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
                    {metrics.totalFilleuls === 0
                      ? 'Aucun filleul enregistré pour le moment.'
                      : 'Aucun filleul trouvé.'}
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(candidate => {
                  const badge = getStatusBadgeClasses(candidate.status);
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => onSelectCandidate(candidate.id)}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {candidate.avatar ? (
                            <img
                              src={candidate.avatar}
                              alt={candidate.displayName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-[#1d1430] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs shrink-0">
                              {candidate.displayName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                              {candidate.displayName}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">
                              @{candidate.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 dark:text-[#e9e5f5]">
                          {getVaTypeLabel(candidate.vaType)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-[#9d93b8]">
                        {getServerLabel(candidate.currentServer)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${badge.text} font-medium`}>
                          <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                          {getStatusLabel(candidate.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-[#9d93b8] font-mono text-[11px]">
                        {formatDate(candidate.arrivalDate)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectCandidate(candidate.id);
                          }}
                          className="px-2 py-1 text-slate-600 dark:text-violet-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#231839] rounded text-xs transition-colors font-medium whitespace-nowrap cursor-pointer"
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
  );
};
