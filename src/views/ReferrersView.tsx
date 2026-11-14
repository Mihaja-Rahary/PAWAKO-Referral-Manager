import React, { useState, useEffect, useCallback } from 'react';
import {
  AuditLog,
  Candidate,
  Referrer,
  ReferrerDependencySummary,
  ReferrerStatus,
  UserRole,
} from '../types';
import { api } from '../api';
import {
  formatDate,
  getStatusBadgeClasses,
  getStatusLabel,
  getVaTypeLabel,
} from '../utils/statusUtils';
import {
  Award,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Search,
  RefreshCw,
  SlidersHorizontal,
  Users,
  Link2,
  PauseCircle,
  PlayCircle,
  Archive,
  RotateCcw,
  Trash2,
  X,
  Save,
  ExternalLink,
  AlertTriangle,
  History,
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectReferrerFilter: (referrerId: string) => void;
  onSelectCandidate?: (candidateId: string) => void;
  refreshTrigger: number;
  onRefreshAll?: () => void;
  initialReferrers?: Referrer[];
}

function getReferrerEffectiveStatus(ref: Referrer): ReferrerStatus {
  if (ref.status === 'ARCHIVED' || ref.status === 'SUSPENDED' || ref.status === 'ACTIVE') {
    return ref.status;
  }
  return ref.isActive ? 'ACTIVE' : 'SUSPENDED';
}

function getReferrerStatusBadge(status: ReferrerStatus): { label: string; classes: string; dot: string } {
  switch (status) {
    case 'ACTIVE':
      return {
        label: 'Actif',
        classes: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
        dot: 'bg-emerald-500',
      };
    case 'SUSPENDED':
      return {
        label: 'Suspendu',
        classes: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
        dot: 'bg-amber-500',
      };
    case 'ARCHIVED':
      return {
        label: 'Archivé',
        classes: 'bg-slate-100 dark:bg-[#191129] text-slate-600 dark:text-[#9d93b8] border-slate-200 dark:border-[#2e224a]',
        dot: 'bg-slate-400',
      };
  }
}

export const ReferrersView: React.FC<Props> = ({
  currentUserRole,
  onSelectReferrerFilter,
  onSelectCandidate,
  refreshTrigger,
  onRefreshAll,
  initialReferrers,
}) => {
  const [referrers, setReferrers] = useState<Referrer[]>(initialReferrers || []);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReferrerStatus | 'ALL'>('ALL');

  // New Referrer Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [discordUserId, setDiscordUserId] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail & Management Modal
  const [selectedReferrerId, setSelectedReferrerId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    referrer: Referrer;
    filleuls: Candidate[];
    dependencies: ReferrerDependencySummary;
    history: AuditLog[];
  } | null>(null);

  const [editNotes, setEditNotes] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [manualInviteCode, setManualInviteCode] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<
    null | 'ACTIVATE' | 'SUSPEND' | 'REACTIVATE' | 'ARCHIVE' | 'RESTORE' | 'DELETE_PHYSICAL'
  >(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = currentUserRole === 'ADMINISTRATEUR';

  useEffect(() => {
    if (initialReferrers && initialReferrers.length > 0 && refreshTrigger === 0) {
      setReferrers(initialReferrers);
    }
  }, [initialReferrers, refreshTrigger]);

  const fetchReferrers = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.getReferrers();
      setReferrers(res.referrers || []);
    } catch (err: any) {
      setLoadError(err?.message || 'Impossible de charger la liste des parrains.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialReferrers && initialReferrers.length > 0 && refreshTrigger === 0) {
      return;
    }
    fetchReferrers();
  }, [refreshTrigger, fetchReferrers, initialReferrers]);

  const loadReferrerDetails = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const res = await api.getReferrerDetails(id);
      setDetailData(res);
      setEditNotes(res.referrer.notes || '');
      setEditDisplayName(res.referrer.discordDisplayName || '');
    } catch (err: any) {
      setDetailError(err?.message || 'Impossible de charger les détails du parrain.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openDetails = (id: string) => {
    setSelectedReferrerId(id);
    setPendingAction(null);
    setActionReason('');
    setManualInviteCode('');
    setActionFeedback(null);
    loadReferrerDetails(id);
  };

  const closeDetails = () => {
    setSelectedReferrerId(null);
    setDetailData(null);
    setPendingAction(null);
    setActionFeedback(null);
  };

  const handleCopyLink = (code: string, url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateReferrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!discordUserId.trim()) {
      setError('Le Discord User ID est obligatoire.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.createReferrer({
        discordUserId: discordUserId.trim(),
        inviteCode: customCode.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setIsModalOpen(false);
      setDiscordUserId('');
      setCustomCode('');
      setNotes('');
      await fetchReferrers();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du parrain');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveReferrerInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferrerId || !isAdmin) return;
    try {
      setIsActionLoading(true);
      setActionFeedback(null);
      await api.updateReferrer(selectedReferrerId, {
        notes: editNotes,
        discordDisplayName: editDisplayName.trim() || undefined,
      });
      await Promise.all([loadReferrerDetails(selectedReferrerId), fetchReferrers()]);
      if (onRefreshAll) onRefreshAll();
      setActionFeedback({ type: 'ok', text: 'Informations du parrain enregistrées.' });
    } catch (err: any) {
      setActionFeedback({ type: 'err', text: err?.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRegenerateInvite = async () => {
    if (!selectedReferrerId || !isAdmin) return;
    try {
      setIsActionLoading(true);
      setActionFeedback(null);
      const res = await api.regenerateReferrerInvite(
        selectedReferrerId,
        manualInviteCode.trim() || undefined
      );
      setManualInviteCode('');
      await Promise.all([loadReferrerDetails(selectedReferrerId), fetchReferrers()]);
      if (onRefreshAll) onRefreshAll();
      if (res.success) {
        setActionFeedback({
          type: 'ok',
          text: `Nouveau lien Discord généré : ${res.referrer.inviteUrl}`,
        });
      } else {
        setActionFeedback({
          type: 'err',
          text: res.errorMessage || 'Le bot Discord n a pas pu créer une nouvelle invitation.',
        });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'err', text: err?.message || 'Échec de régénération du lien Discord.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleExecutePendingAction = async () => {
    if (!selectedReferrerId || !pendingAction || !isAdmin) return;
    try {
      setIsActionLoading(true);
      setActionFeedback(null);
      const reason = actionReason.trim() || undefined;

      if (pendingAction === 'ACTIVATE') {
        await api.activateReferrer(selectedReferrerId, reason);
      } else if (pendingAction === 'SUSPEND') {
        await api.suspendReferrer(selectedReferrerId, reason);
      } else if (pendingAction === 'REACTIVATE') {
        await api.reactivateReferrer(selectedReferrerId, reason);
      } else if (pendingAction === 'ARCHIVE') {
        await api.archiveReferrer(selectedReferrerId, reason);
      } else if (pendingAction === 'RESTORE') {
        await api.restoreReferrer(selectedReferrerId, reason);
      } else if (pendingAction === 'DELETE_PHYSICAL') {
        await api.deleteReferrerPhysically(selectedReferrerId);
        closeDetails();
        await fetchReferrers();
        if (onRefreshAll) onRefreshAll();
        return;
      }

      setPendingAction(null);
      setActionReason('');
      await Promise.all([loadReferrerDetails(selectedReferrerId), fetchReferrers()]);
      if (onRefreshAll) onRefreshAll();
      setActionFeedback({ type: 'ok', text: 'Statut du parrain mis à jour avec succès.' });
    } catch (err: any) {
      setActionFeedback({ type: 'err', text: err?.message || 'Opération refusée.' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const counts = referrers.reduce(
    (acc, r) => {
      const s = getReferrerEffectiveStatus(r);
      acc.ALL += 1;
      acc[s] += 1;
      return acc;
    },
    { ALL: 0, ACTIVE: 0, SUSPENDED: 0, ARCHIVED: 0 }
  );

  const filteredReferrers = referrers.filter(ref => {
    const effStatus = getReferrerEffectiveStatus(ref);
    if (statusFilter !== 'ALL' && effStatus !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (ref.discordDisplayName || '').toLowerCase().includes(q) ||
      (ref.discordUsername || '').toLowerCase().includes(q) ||
      ref.discordUserId.toLowerCase().includes(q) ||
      (ref.inviteCode || '').toLowerCase().includes(q)
    );
  });

  const detailStatus = detailData ? getReferrerEffectiveStatus(detailData.referrer) : 'ACTIVE';

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header & Controls */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-5 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
              Parrains & Liens Discord
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
              Suivi complet, cycle de vie et invitations Discord officielles du serveur Recrutement.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="min-h-[42px] flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs shadow-violet-600/20 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Parrain</span>
            </button>
          )}
        </div>

        {/* Search + Status Filter Tabs */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-3 border-t border-slate-100 dark:border-[#1e1530]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
            <input
              type="text"
              placeholder="Rechercher par nom, Discord ID ou code d'invitation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-slate-50/50 dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'ALL', label: `Tous (${counts.ALL})` },
                { id: 'ACTIVE', label: `Actifs (${counts.ACTIVE})` },
                { id: 'SUSPENDED', label: `Suspendus (${counts.SUSPENDED})` },
                { id: 'ARCHIVED', label: `Archivés (${counts.ARCHIVED})` },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-[#171026] text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={fetchReferrers}
            className="px-3 py-1.5 bg-rose-600 text-white rounded-lg font-semibold cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Referrers Grid / Cards */}
      {isLoading && referrers.length === 0 ? (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-12 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
          Chargement des parrains...
        </div>
      ) : filteredReferrers.length === 0 ? (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-12 text-center space-y-2 transition-colors">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] flex items-center justify-center mx-auto border border-transparent dark:border-[#241a38]">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
            {referrers.length === 0 ? 'Aucun parrain configuré' : 'Aucun parrain pour ce filtre'}
          </h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReferrers.map(ref => {
            const conv = ref.conversionRate || 0;
            const effStatus = getReferrerEffectiveStatus(ref);
            const badge = getReferrerStatusBadge(effStatus);
            const hasRealUrl = Boolean(ref.inviteUrl && ref.inviteCode && ref.inviteStatus !== 'EXPIRED_OR_DELETED');

            return (
              <div
                key={ref.id}
                className={`bg-white dark:bg-[#100b1a] border rounded-xl p-4 sm:p-5 space-y-4 transition-colors shadow-xs flex flex-col justify-between ${
                  effStatus === 'ARCHIVED'
                    ? 'border-slate-200/80 dark:border-[#1e1530] opacity-85'
                    : effStatus === 'SUSPENDED'
                      ? 'border-amber-200 dark:border-amber-500/35'
                      : 'border-slate-200 dark:border-[#241a38] hover:border-violet-300 dark:hover:border-violet-500/40'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {ref.avatar ? (
                        <img
                          src={ref.avatar}
                          alt={ref.discordDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-violet-600/15 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-xs shrink-0">
                          {(ref.discordDisplayName || ref.discordUsername || 'P').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm truncate">
                          {ref.discordDisplayName || ref.discordUsername}
                        </h3>
                        <div className="text-[11px] text-slate-400 dark:text-[#7c7296] font-mono truncate">
                          {ref.discordUserId}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-semibold border shrink-0 ${badge.classes}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                      {badge.label}
                    </span>
                  </div>

                  {ref.notes && (
                    <p className="text-xs text-slate-500 dark:text-[#9d93b8] italic bg-slate-50 dark:bg-[#171026] p-2 rounded border border-slate-100 dark:border-[#241a38] line-clamp-2">
                      {ref.notes}
                    </p>
                  )}

                  {/* Metrics Breakdown */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg">
                      <div className="text-[10px] text-slate-500 dark:text-[#9d93b8] uppercase">Filleuls</div>
                      <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] text-base mt-0.5">
                        {ref.totalFilleuls || 0}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg">
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase">En Prod</div>
                      <div className="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 text-base mt-0.5">
                        {ref.enProduction || 0}
                      </div>
                    </div>
                    <div className="p-2 bg-violet-50/70 dark:bg-violet-950/35 border border-violet-200 dark:border-violet-500/30 rounded-lg">
                      <div className="text-[10px] text-violet-700 dark:text-violet-300 uppercase">Conv.</div>
                      <div className="font-bold font-mono tabular-nums text-violet-700 dark:text-violet-200 text-base mt-0.5">
                        {conv}%
                      </div>
                    </div>
                  </div>

                  {/* Visual Conversion Progress Track */}
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1a122b] overflow-hidden">
                    <div
                      className="h-full bg-violet-600 dark:bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, conv)}%` }}
                    />
                  </div>

                  {/* Detail funnel counters + dates */}
                  <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] space-y-1 pt-1 border-t border-slate-100 dark:border-[#241a38]">
                    <div className="flex justify-between">
                      <span>Attente / Acceptés</span>
                      <span className="font-medium font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb]">
                        {(ref.enAttente || 0) + (ref.acceptes || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Formation / Simu / Validés</span>
                      <span className="font-medium font-mono tabular-nums text-purple-700 dark:text-purple-300">
                        {(ref.enFormation || 0) + (ref.enSimulation || 0) + (ref.valides || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Refusés / Abandons</span>
                      <span className="font-medium font-mono tabular-nums text-rose-700 dark:text-rose-400">
                        {(ref.refuses || 0) + (ref.abandonnes || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] pt-1 text-slate-400 dark:text-[#7c7296]">
                      <span>Dernière activité</span>
                      <span className="font-mono">{formatDate(ref.lastActivityAt || ref.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Personal Invite Link + Action Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-[#241a38] space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-slate-600 dark:text-[#d8d0eb]">
                      Invitation Discord
                    </span>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        hasRealUrl
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {hasRealUrl
                        ? ref.inviteCode
                        : ref.inviteStatus === 'EXPIRED_OR_DELETED'
                          ? 'Expirée'
                          : 'Non générée'}
                    </span>
                  </div>

                  {hasRealUrl ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={ref.inviteUrl}
                        aria-label={`Lien Discord de ${ref.discordDisplayName}`}
                        className="flex-1 text-[11px] font-mono p-1.5 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-700 dark:text-[#d8d0eb] select-all focus:outline-none"
                      />
                      <button
                        onClick={() => handleCopyLink(ref.inviteCode, ref.inviteUrl)}
                        title="Copier le lien Discord"
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 text-xs font-medium text-slate-700 dark:text-[#f4f1fa] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] border border-transparent dark:border-[#241a38] rounded transition-colors cursor-pointer"
                      >
                        {copiedCode === ref.inviteCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-500/25 rounded p-2">
                      {ref.inviteError || 'Lien Discord à générer via le bot dans Gérer / Détails.'}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => openDetails(ref.id)}
                      className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Gérer / Détails</span>
                    </button>

                    <button
                      onClick={() => onSelectReferrerFilter(ref.id)}
                      className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-[#e9e5f5] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Filleuls</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Referrer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#100b1a] rounded-xl shadow-xl border border-slate-200 dark:border-[#241a38] w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#241a38] bg-slate-50/50 dark:bg-[#171026]">
              <h3 className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-sm">
                Nouveau Parrain
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Fermer"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f1fa] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReferrer} className="p-6 space-y-4">
              {error && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                  Discord User ID <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 100000000000000005"
                  value={discordUserId}
                  onChange={e => setDiscordUserId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] font-mono placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                  Code d'invitation Discord réel (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Laisser vide pour générer via le bot JARVIS"
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] font-mono placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                />
                <p className="text-[11px] text-slate-500 dark:text-[#9d93b8] mt-1">
                  Aucun code factice n'est fabriqué : laissez vide pour créer une vraie invitation sur le serveur Recrutement, ou saisissez un code discord.gg existant.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                  Note interne (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pôle Instagram"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-[#241a38]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-[#d8d0eb] hover:bg-slate-100 dark:hover:bg-[#171026] rounded-lg transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Création...' : 'Créer le parrain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Referrer Full Management Drawer / Modal */}
      {selectedReferrerId && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 dark:bg-black/80 backdrop-blur-xs flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Gestion détaillée du parrain"
        >
          <div className="w-full max-w-2xl bg-white dark:bg-[#100b1a] h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-[#241a38]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-[#241a38] bg-slate-50/70 dark:bg-[#171026]">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-[#9d93b8]">
                  Administration Parrain
                </div>
                <div className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa] truncate">
                  {detailData?.referrer.discordDisplayName || selectedReferrerId}
                </div>
              </div>
              <button
                onClick={closeDetails}
                aria-label="Fermer les détails du parrain"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#231839] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading || !detailData ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-xs text-slate-500 dark:text-[#9d93b8]">
                {detailError ? (
                  <div className="text-center space-y-3">
                    <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                    <p>{detailError}</p>
                    <button
                      onClick={() => loadReferrerDetails(selectedReferrerId)}
                      className="px-3 py-1.5 bg-violet-600 text-white rounded-lg font-semibold cursor-pointer"
                    >
                      Réessayer
                    </button>
                  </div>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin mb-2 text-violet-500" />
                    <span>Chargement des détails et dépendances...</span>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs">
                {actionFeedback && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2 ${
                      actionFeedback.type === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionFeedback.text}</span>
                  </div>
                )}

                {/* Identity & Dates */}
                <div className="p-4 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {detailData.referrer.avatar ? (
                        <img
                          src={detailData.referrer.avatar}
                          alt={detailData.referrer.discordDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-base shrink-0">
                          {(detailData.referrer.discordDisplayName || 'P').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 dark:text-[#f4f1fa] truncate">
                          {detailData.referrer.discordDisplayName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#9d93b8]">
                          @{detailData.referrer.discordUsername} ·{' '}
                          <span className="font-mono">{detailData.referrer.discordUserId}</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded font-semibold border shrink-0 ${
                        getReferrerStatusBadge(detailStatus).classes
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${getReferrerStatusBadge(detailStatus).dot}`} />
                      {getReferrerStatusBadge(detailStatus).label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-[#241a38] text-[11px]">
                    <div>
                      <span className="text-slate-500 dark:text-[#9d93b8]">Création :</span>{' '}
                      <span className="font-mono text-slate-800 dark:text-[#e9e5f5]">
                        {formatDate(detailData.referrer.createdAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-[#9d93b8]">Dernière activité :</span>{' '}
                      <span className="font-mono text-slate-800 dark:text-[#e9e5f5]">
                        {formatDate(detailData.referrer.lastActivityAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-[#9d93b8]">Mise à jour :</span>{' '}
                      <span className="font-mono text-slate-800 dark:text-[#e9e5f5]">
                        {formatDate(detailData.referrer.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Real Discord Invite Section */}
                <div className="p-4 bg-white dark:bg-[#0b0714] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-1.5">
                      <Link2 className="w-4 h-4 text-violet-500" />
                      <span>Invitation Discord Recrutement</span>
                    </h4>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-[#9d93b8]">
                      Statut : {detailData.referrer.inviteStatus || (detailData.referrer.inviteUrl ? 'ACTIVE' : 'UNCONFIGURED')}
                    </span>
                  </div>

                  {detailData.referrer.inviteUrl ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={detailData.referrer.inviteUrl}
                        className="flex-1 font-mono text-xs p-2 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026] text-slate-900 dark:text-[#f4f1fa]"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyLink(detailData.referrer.inviteCode, detailData.referrer.inviteUrl)}
                        className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCode === detailData.referrer.inviteCode ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Copier</span>
                      </button>
                      <a
                        href={detailData.referrer.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] px-2.5 flex items-center justify-center bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] rounded-lg"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-200">
                      {detailData.referrer.inviteError || "Aucune invitation Discord active n'est enregistrée."}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <input
                        type="text"
                        value={manualInviteCode}
                        onChange={e => setManualInviteCode(e.target.value)}
                        placeholder="Code discord.gg existant (laisser vide = bot)"
                        className="flex-1 min-h-[38px] text-xs font-mono px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026] text-slate-900 dark:text-[#f4f1fa]"
                      />
                      <button
                        type="button"
                        onClick={handleRegenerateInvite}
                        disabled={isActionLoading}
                        className="min-h-[38px] px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
                        <span>Régénérer le lien Discord</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Editable Info & Notes */}
                {isAdmin && (
                  <form
                    onSubmit={handleSaveReferrerInfo}
                    className="p-4 bg-white dark:bg-[#0b0714] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3"
                  >
                    <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa]">
                      Informations & Notes internes
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                          Nom affiché
                        </label>
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={e => setEditDisplayName(e.target.value)}
                          className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026] text-slate-900 dark:text-[#f4f1fa]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                          Notes administratives (invisibles pour le parrain)
                        </label>
                        <textarea
                          rows={2}
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder="Notes de suivi interne..."
                          className="w-full p-2.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026] text-slate-900 dark:text-[#f4f1fa]"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isActionLoading}
                        className="min-h-[38px] px-4 py-1.5 bg-slate-900 dark:bg-violet-600 hover:opacity-90 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Enregistrer</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Lifecycle Actions & Guarded Physical Delete */}
                {isAdmin && (
                  <div className="p-4 bg-white dark:bg-[#0b0714] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3">
                    <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa]">
                      Cycle de vie & Contrôle d'accès
                    </h4>

                    <div className="flex flex-wrap gap-2">
                      {detailStatus === 'ACTIVE' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPendingAction('SUSPEND')}
                            className="min-h-[38px] px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            <span>Suspendre</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingAction('ARCHIVE')}
                            className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border border-slate-200 dark:border-[#241a38] hover:bg-slate-200 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archiver</span>
                          </button>
                        </>
                      )}

                      {detailStatus === 'SUSPENDED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPendingAction('REACTIVATE')}
                            className="min-h-[38px] px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            <span>Réactiver</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingAction('ARCHIVE')}
                            className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border border-slate-200 dark:border-[#241a38] hover:bg-slate-200 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            <span>Archiver</span>
                          </button>
                        </>
                      )}

                      {detailStatus === 'ARCHIVED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPendingAction('RESTORE')}
                            className="min-h-[38px] px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Restaurer (Activer)</span>
                          </button>
                          <button
                            type="button"
                            disabled={!detailData.dependencies.canPhysicallyDelete}
                            onClick={() => setPendingAction('DELETE_PHYSICAL')}
                            className="min-h-[38px] px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Supprimer définitivement</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Dependency explanation for physical delete */}
                    <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg text-[11px] text-slate-600 dark:text-[#9d93b8]">
                      Dépendances :{' '}
                      <strong className="font-mono text-slate-800 dark:text-[#e9e5f5]">
                        {detailData.dependencies.linkedCandidatesCount}
                      </strong>{' '}
                      candidat(s) ·{' '}
                      <strong className="font-mono text-slate-800 dark:text-[#e9e5f5]">
                        {detailData.dependencies.attributionHistoryCount}
                      </strong>{' '}
                      historique(s) d'attribution.
                      {detailData.dependencies.blockingReason && (
                        <div className="text-amber-700 dark:text-amber-300 mt-1">
                          {detailData.dependencies.blockingReason} Utilisez Suspendre ou Archiver pour préserver l'intégrité historique.
                        </div>
                      )}
                    </div>

                    {pendingAction && (
                      <div className="p-3 bg-rose-50/70 dark:bg-[#1a0f21] border border-rose-200 dark:border-rose-500/35 rounded-xl space-y-2.5">
                        <div className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>
                            {pendingAction === 'SUSPEND' && 'Confirmer la suspension de ce parrain ?'}
                            {pendingAction === 'REACTIVATE' && 'Confirmer la réactivation de ce parrain ?'}
                            {pendingAction === 'ACTIVATE' && 'Confirmer l activation de ce parrain ?'}
                            {pendingAction === 'ARCHIVE' && "Confirmer l'archivage de ce parrain ?"}
                            {pendingAction === 'RESTORE' && 'Confirmer la restauration de ce parrain ?'}
                            {pendingAction === 'DELETE_PHYSICAL' &&
                              'Suppression physique irréversible — confirmer ?'}
                          </span>
                        </div>

                        {pendingAction !== 'DELETE_PHYSICAL' && (
                          <input
                            type="text"
                            value={actionReason}
                            onChange={e => setActionReason(e.target.value)}
                            placeholder="Motif (tracé dans le journal d'audit)..."
                            className="w-full min-h-[36px] px-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                          />
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingAction(null)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-[#9d93b8] hover:bg-slate-200/60 dark:hover:bg-[#241a38] cursor-pointer"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleExecutePendingAction}
                            disabled={isActionLoading}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {isActionLoading ? 'Traitement...' : 'Confirmer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Linked Filleuls List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-violet-500" />
                      <span>Filleuls rattachés ({detailData.filleuls.length})</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = detailData.referrer.id;
                        closeDetails();
                        onSelectReferrerFilter(targetId);
                      }}
                      className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 hover:underline cursor-pointer"
                    >
                      Ouvrir dans Candidats
                    </button>
                  </div>

                  {detailData.filleuls.length === 0 ? (
                    <div className="p-4 text-center border border-dashed border-slate-200 dark:border-[#241a38] rounded-lg text-slate-400 dark:text-[#7c7296]">
                      Aucun filleul attribué à ce parrain.
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-[#241a38] rounded-xl divide-y divide-slate-100 dark:divide-[#1e1530] overflow-hidden">
                      {detailData.filleuls.slice(0, 15).map(c => {
                        const badge = getStatusBadgeClasses(c.status);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              if (onSelectCandidate) {
                                closeDetails();
                                onSelectCandidate(c.id);
                              }
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-[#171026] flex items-center justify-between gap-3 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate">
                                {c.displayName}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">
                                @{c.username} · {getVaTypeLabel(c.vaType)}
                              </div>
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold shrink-0 ${badge.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              {getStatusLabel(c.status)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Modification & Audit History */}
                <div className="space-y-2.5">
                  <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-1.5">
                    <History className="w-4 h-4 text-violet-500" />
                    <span>Historique des modifications ({detailData.history.length})</span>
                  </h4>
                  {detailData.history.length === 0 ? (
                    <div className="p-4 text-center border border-dashed border-slate-200 dark:border-[#241a38] rounded-lg text-slate-400 dark:text-[#7c7296]">
                      Aucun événement enregistré pour ce parrain.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detailData.history.slice(0, 20).map(log => (
                        <div
                          key={log.id}
                          className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-violet-700 dark:text-violet-300 text-[11px]">
                              {log.action}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 dark:text-[#7c7296]">
                              {formatDate(log.timestamp)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-[#d8d0eb]">
                            Par <strong>{log.actorName}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
