import React, { useState, useEffect } from 'react';
import { Candidate, CandidateStatus, DiscordServerType, UserRole, VAType } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getAdminStatusLabel,
  getOperationalStatusLabel,
  getServerLabel,
  getVaTypeLabel,
  formatDate,
  getAttributionLabel
} from '../utils/statusUtils';
import {
  Search,
  Plus,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Edit3,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  Server
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  initialStatusFilter?: string;
  initialVaTypeFilter?: string;
  initialAnomalyFilter?: boolean;
  initialReferrerIdFilter?: string;
  onClearReferrerFilter?: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onOpenStatusModal: (candidate: Candidate) => void;
  onOpenReassignModal: (candidate: Candidate) => void;
  onOpenNewCandidateModal: () => void;
  refreshTrigger: number;
}

export const CandidatesView: React.FC<Props> = ({
  currentUserRole,
  initialStatusFilter,
  initialVaTypeFilter,
  initialAnomalyFilter,
  initialReferrerIdFilter,
  onClearReferrerFilter,
  onSelectCandidate,
  onOpenStatusModal,
  onOpenReassignModal,
  onOpenNewCandidateModal,
  refreshTrigger,
}) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [vaType, setVaType] = useState<VAType | 'ALL'>((initialVaTypeFilter as any) || 'ALL');
  const [status, setStatus] = useState<CandidateStatus | 'ALL'>((initialStatusFilter as any) || 'ALL');
  const [server, setServer] = useState<string>('ALL');
  const [attributionStatus, setAttributionStatus] = useState<string>('ALL');
  const [anomalyOnly, setAnomalyOnly] = useState<boolean>(Boolean(initialAnomalyFilter));
  const [referrerIdFilter, setReferrerIdFilter] = useState<string | undefined>(initialReferrerIdFilter);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isParrainOnly = currentUserRole === 'PARRAIN';
  const isAdmin = currentUserRole === 'ADMINISTRATEUR';
  const isResponsableOrAdmin = currentUserRole === 'ADMINISTRATEUR' || currentUserRole === 'RESPONSABLE';

  useEffect(() => {
    setStatus(((initialStatusFilter as any) || 'ALL') as CandidateStatus | 'ALL');
    setVaType(((initialVaTypeFilter as any) || 'ALL') as VAType | 'ALL');
    setAnomalyOnly(Boolean(initialAnomalyFilter));
    setReferrerIdFilter(initialReferrerIdFilter);
    setPage(1);
  }, [initialStatusFilter, initialVaTypeFilter, initialAnomalyFilter, initialReferrerIdFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCandidates = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.getCandidates({
        search: debouncedSearch.trim() || undefined,
        vaType,
        status,
        server,
        attributionStatus,
        referrerId: referrerIdFilter,
        hasAnomaly: anomalyOnly ? true : undefined,
        page,
        limit: 12,
      });
      setCandidates(res.candidates);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error('Error fetching candidates:', err);
      setLoadError(err?.message || 'Impossible de charger la liste des candidats.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [debouncedSearch, vaType, status, server, attributionStatus, anomalyOnly, referrerIdFilter, page, refreshTrigger]);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const uncertainCount = candidates.filter(c => c.attributionStatus === 'UNCERTAIN').length;
  const anomalyCount = candidates.filter(c => c.hasAnomaly).length;

  return (
    <div className="space-y-4">
      {/* Notices Banners */}
      <div className="space-y-2">
        {loadError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
            <span>{loadError}</span>
            <button
              onClick={fetchCandidates}
              className="px-2.5 py-1 bg-rose-600 text-white font-semibold rounded-md shrink-0 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {referrerIdFilter && (
          <div className="p-3 bg-violet-50 dark:bg-[#191129] border border-violet-200 dark:border-violet-500/35 rounded-xl flex items-center justify-between gap-3 text-xs text-violet-900 dark:text-violet-200">
            <span>
              Filtré sur le parrain : <strong className="font-mono">{referrerIdFilter}</strong>
            </span>
            <button
              onClick={() => {
                setReferrerIdFilter(undefined);
                setPage(1);
                if (onClearReferrerFilter) onClearReferrerFilter();
              }}
              className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tout afficher
            </button>
          </div>
        )}

        {isAdmin && attributionStatus !== 'UNCERTAIN' && uncertainCount > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-[#171026] border border-amber-200 dark:border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong className="tabular-nums">{uncertainCount} candidat(s)</strong> sans attribution confirmée.
              </span>
            </div>
            <button
              onClick={() => {
                setAttributionStatus('UNCERTAIN');
                setPage(1);
              }}
              className="px-2.5 py-1 bg-amber-200/80 dark:bg-amber-500/20 hover:bg-amber-200 dark:hover:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Filtrer
            </button>
          </div>
        )}

        {isResponsableOrAdmin && !anomalyOnly && anomalyCount > 0 && (
          <div className="p-3 bg-rose-50 dark:bg-[#171026] border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-900 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <strong className="tabular-nums">{anomalyCount} anomalie(s)</strong> Discord détectée(s).
              </span>
            </div>
            <button
              onClick={() => {
                setAnomalyOnly(true);
                setPage(1);
              }}
              className="px-2.5 py-1 bg-rose-200/80 dark:bg-rose-500/20 hover:bg-rose-200 dark:hover:bg-rose-500/30 text-rose-950 dark:text-rose-100 font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Afficher
            </button>
          </div>
        )}
      </div>

      {/* Control Bar: Filters & Actions */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 space-y-3 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
            <input
              type="text"
              placeholder="Rechercher par pseudo, Discord ID ou parrain..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-slate-50/50 dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isResponsableOrAdmin && (
              <button
                onClick={onOpenNewCandidateModal}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs shadow-violet-600/20 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau Candidat</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-1 text-xs">
          {/* VA Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#9d93b8] mb-1">
              Activité
            </label>
            <select
              value={vaType}
              onChange={e => {
                setVaType(e.target.value as any);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="ALL">Toutes activités</option>
              <option value="CHATTEUR">VA Chatting</option>
              <option value="INSTAGRAM">VA Instagram</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#9d93b8] mb-1">
              Statut
            </label>
            <select
              value={status}
              onChange={e => {
                setStatus(e.target.value as any);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
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

          {/* Server Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#9d93b8] mb-1">
              Serveur Discord
            </label>
            <select
              value={server}
              onChange={e => {
                setServer(e.target.value);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="ALL">Tous les serveurs</option>
              <option value="RECRUTEMENT">Recrutement</option>
              <option value="FORMATION">Formation</option>
              <option value="PRODUCTION_CHATTING">Prod VA Chatting</option>
              <option value="PRODUCTION_INSTAGRAM">Prod VA Instagram</option>
              <option value="AUCUN">Hors serveur</option>
            </select>
          </div>

          {/* Attribution Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#9d93b8] mb-1">
              Attribution
            </label>
            <select
              value={attributionStatus}
              onChange={e => {
                setAttributionStatus(e.target.value);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="ALL">Toutes attributions</option>
              <option value="CONFIRMED">Confirmé</option>
              <option value="UNCERTAIN">Incertain</option>
              <option value="MANUAL_REASSIGNED">Réassigné</option>
            </select>
          </div>

          {/* Anomaly Toggle */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-[#9d93b8] mb-1">
              Anomalies
            </label>
            <button
              type="button"
              onClick={() => {
                setAnomalyOnly(!anomalyOnly);
                setPage(1);
              }}
              className={`w-full p-2 border rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                anomalyOnly
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border-slate-200 dark:border-[#241a38] hover:bg-slate-50 dark:hover:bg-[#1f1633]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{anomalyOnly ? 'Anomalies seules' : 'Toutes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Candidates List (Mobile Cards + Desktop Table) */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden shadow-xs transition-colors">
        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-[#241a38]/80">
          {isLoading ? (
            <div className="py-12 px-4 text-center text-slate-400 dark:text-[#9d93b8] text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
              Chargement des dossiers candidats...
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-400 dark:text-[#9d93b8] text-xs">
              Aucun dossier candidat trouvé.
            </div>
          ) : (
            candidates.map(candidate => {
              const badge = getStatusBadgeClasses(candidate.status);
              const attrInfo = getAttributionLabel(candidate.attributionStatus);

              return (
                <div
                  key={candidate.id}
                  onClick={() => onSelectCandidate(candidate.id)}
                  className={`p-4 space-y-3 cursor-pointer active:bg-slate-50 dark:active:bg-[#171026] transition-colors ${
                    candidate.hasAnomaly ? 'bg-rose-50/20 dark:bg-rose-950/15' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {candidate.avatar ? (
                          <img
                            src={candidate.avatar}
                            alt={candidate.displayName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-[#2e2249]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-[#1f1633] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs border border-transparent dark:border-[#2e2249]">
                            {candidate.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#100b1a] ${badge.dot}`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-[#f4f1fa] truncate">
                            {candidate.displayName}
                          </span>
                          {candidate.hasAnomaly && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 rounded font-semibold inline-flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Anomalie
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#7c7296] font-mono">
                          <span className="truncate">{candidate.discordUserId}</span>
                          <button
                            type="button"
                            onClick={e => handleCopyId(e, candidate.discordUserId)}
                            title="Copier l'identifiant Discord"
                            className="p-1.5 hover:text-slate-700 dark:hover:text-[#f4f1fa] rounded transition-colors"
                          >
                            {copiedId === candidate.discordUserId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] shrink-0">
                      {getVaTypeLabel(candidate.vaType)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 dark:bg-[#171026] border border-slate-100 dark:border-[#241a38] rounded-lg px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-[#7c7296]">Statut</div>
                      <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate mt-0.5">
                        {getOperationalStatusLabel(candidate.operationalStatus)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-[#9d93b8] truncate">
                        Admin : {getAdminStatusLabel(candidate.adminStatus)}
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#171026] border border-slate-100 dark:border-[#241a38] rounded-lg px-2.5 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-[#7c7296]">Parrain</div>
                      <div className="font-medium text-slate-900 dark:text-[#f4f1fa] truncate mt-0.5">
                        {candidate.referrerName || 'Non assigné'}
                      </div>
                      <div className={`text-[10px] truncate ${attrInfo.text}`}>
                        {attrInfo.label}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Server className="w-3.5 h-3.5 text-slate-400 dark:text-[#7c7296] shrink-0" />
                      <span className="truncate">{getServerLabel(candidate.currentServer)}</span>
                    </div>
                    <span className="font-mono shrink-0">{formatDate(candidate.arrivalDate)}</span>
                  </div>

                  {!isParrainOnly && (
                    <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onOpenStatusModal(candidate)}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-[#d8d0eb] bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] hover:bg-slate-100 dark:hover:bg-[#1f1633] rounded-lg transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Modifier statut</span>
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onOpenReassignModal(candidate)}
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 hover:bg-violet-100 dark:hover:bg-violet-500/20 rounded-lg transition-colors"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Réassigner</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                <th className="py-3 px-4 font-semibold">Candidat</th>
                <th className="py-3 px-4 font-semibold">Activité</th>
                <th className="py-3 px-4 font-semibold">Statut</th>
                <th className="py-3 px-4 font-semibold">Serveur Discord</th>
                <th className="py-3 px-4 font-semibold">Parrain</th>
                <th className="py-3 px-4 font-semibold">Arrivée</th>
                {!isParrainOnly && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#241a38]/80 text-slate-700 dark:text-[#d8d0eb]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-[#9d93b8] text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
                    Chargement des dossiers candidats...
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-[#9d93b8] text-xs">
                    Aucun dossier candidat trouvé.
                  </td>
                </tr>
              ) : (
                candidates.map(candidate => {
                  const badge = getStatusBadgeClasses(candidate.status);
                  const attrInfo = getAttributionLabel(candidate.attributionStatus);

                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => onSelectCandidate(candidate.id)}
                      className={`hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors cursor-pointer ${
                        candidate.hasAnomaly ? 'bg-rose-50/20 dark:bg-rose-950/15' : ''
                      }`}
                    >
                      {/* Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            {candidate.avatar ? (
                              <img
                                src={candidate.avatar}
                                alt={candidate.displayName}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#2e2249]"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#1f1633] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs border border-transparent dark:border-[#2e2249]">
                                {candidate.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#100b1a] ${badge.dot}`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate">
                                {candidate.displayName}
                              </span>
                              {candidate.hasAnomaly && (
                                <span
                                  title={candidate.anomalyReason || 'Anomalie détectée'}
                                  className="px-1.5 py-0.5 text-[10px] bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 rounded font-semibold flex items-center gap-0.5"
                                >
                                  <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Anomalie
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-[#7c7296] font-mono">
                              <span>{candidate.discordUserId}</span>
                              <button
                                onClick={e => handleCopyId(e, candidate.discordUserId)}
                                title="Copier l'identifiant Discord"
                                className="p-0.5 hover:text-slate-700 dark:hover:text-[#f4f1fa] rounded transition-colors"
                              >
                                {copiedId === candidate.discordUserId ? (
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* VA Type */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-[#f4f1fa]">
                          {getVaTypeLabel(candidate.vaType)}
                        </span>
                      </td>

                      {/* Split Status */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                            <span className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs">
                              {getOperationalStatusLabel(candidate.operationalStatus)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8]">
                            Admin : <strong className="text-slate-700 dark:text-[#d8d0eb]">{getAdminStatusLabel(candidate.adminStatus)}</strong>
                          </div>
                        </div>
                      </td>

                      {/* Server */}
                      <td className="py-3 px-4 text-slate-700 dark:text-[#d8d0eb]">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Server className="w-3.5 h-3.5 text-slate-400 dark:text-[#7c7296] shrink-0" />
                          <span className="truncate max-w-[150px]">
                            {getServerLabel(candidate.currentServer)}
                          </span>
                        </div>
                      </td>

                      {/* Referrer */}
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-[#f4f1fa] truncate max-w-[130px]">
                            {candidate.referrerName || 'Non assigné'}
                          </div>
                          <div className={`text-[10px] ${attrInfo.text}`}>
                            {attrInfo.label}
                          </div>
                        </div>
                      </td>

                      {/* Arrival Date */}
                      <td className="py-3 px-4 text-slate-500 dark:text-[#9d93b8] font-mono text-[11px]">
                        {formatDate(candidate.arrivalDate)}
                      </td>

                      {/* Actions (Admins & Responsables) */}
                      {!isParrainOnly && (
                        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onOpenStatusModal(candidate)}
                              title="Modifier le statut"
                              className="p-1.5 text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa] hover:bg-slate-100 dark:hover:bg-[#1f1633] rounded-md transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {isAdmin && (
                              <button
                                onClick={() => onOpenReassignModal(candidate)}
                                title="Réassigner le parrain"
                                className="p-1.5 text-slate-600 dark:text-[#9d93b8] hover:text-slate-900 dark:hover:text-[#f4f1fa] hover:bg-slate-100 dark:hover:bg-[#1f1633] rounded-md transition-colors"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-[#241a38] flex items-center justify-between text-xs text-slate-500 dark:text-[#9d93b8]">
          <div>
            Affichage de <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">{candidates.length}</strong> sur{' '}
            <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">{total}</strong> dossier(s)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || isLoading}
              className="p-1.5 border border-slate-200 dark:border-[#241a38] rounded-md hover:bg-slate-50 dark:hover:bg-[#171026] disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb]">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 border border-slate-200 dark:border-[#241a38] rounded-md hover:bg-slate-50 dark:hover:bg-[#171026] disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
