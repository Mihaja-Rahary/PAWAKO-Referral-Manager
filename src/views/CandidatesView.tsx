import React, { useState, useEffect } from 'react';
import { Candidate, CandidateStatus, AdminStatus, OperationalStatus, DiscordServerType, UserRole, VAType } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getAdminStatusLabel,
  getOperationalStatusLabel,
  getServerLabel,
  getVaTypeLabel,
  formatDate,
  getAttributionLabel
} from '../utils/statusUtils';
import {
  Search,
  Filter,
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

  // Filters
  const [search, setSearch] = useState('');
  const [vaType, setVaType] = useState<VAType | 'ALL'>((initialVaTypeFilter as any) || 'ALL');
  const [status, setStatus] = useState<CandidateStatus | 'ALL'>((initialStatusFilter as any) || 'ALL');
  const [server, setServer] = useState<string>('ALL');
  const [attributionStatus, setAttributionStatus] = useState<string>('ALL');
  const [anomalyOnly, setAnomalyOnly] = useState<boolean>(Boolean(initialAnomalyFilter));

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isParrainOnly = currentUserRole === 'PARRAIN';
  const isAdmin = currentUserRole === 'ADMINISTRATEUR';
  const isResponsableOrAdmin = currentUserRole === 'ADMINISTRATEUR' || currentUserRole === 'RESPONSABLE';

  const fetchCandidates = async () => {
    try {
      setIsLoading(true);
      const res = await api.getCandidates({
        search: search.trim() || undefined,
        vaType,
        status,
        server,
        attributionStatus,
        hasAnomaly: anomalyOnly ? true : undefined,
        page,
        limit: 12,
      });
      setCandidates(res.candidates);
      setTotal(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching candidates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, [search, vaType, status, server, attributionStatus, anomalyOnly, page, refreshTrigger]);

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
        {isAdmin && attributionStatus !== 'UNCERTAIN' && uncertainCount > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{uncertainCount} candidat(s)</strong> nécessitent une vérification de parrainage (invitation directe ou code non confirmé).
              </span>
            </div>
            <button
              onClick={() => {
                setAttributionStatus('UNCERTAIN');
                setPage(1);
              }}
              className="px-2.5 py-1 bg-amber-200/80 hover:bg-amber-200 text-amber-950 font-semibold rounded-md transition-colors"
            >
              Filtrer les incertains
            </button>
          </div>
        )}

        {isResponsableOrAdmin && !anomalyOnly && anomalyCount > 0 && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>{anomalyCount} anomalie(s)</strong> détectée(s) : rôles Discord contradictoires ou incompatibilité de parcours.
              </span>
            </div>
            <button
              onClick={() => {
                setAnomalyOnly(true);
                setPage(1);
              }}
              className="px-2.5 py-1 bg-rose-200/80 hover:bg-rose-200 text-rose-950 font-semibold rounded-md transition-colors"
            >
              Afficher les anomalies
            </button>
          </div>
        )}
      </div>

      {/* Control Bar: Filters & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par pseudo, Discord ID ou nom du parrain..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 bg-slate-50/50"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isResponsableOrAdmin && (
              <button
                onClick={onOpenNewCandidateModal}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
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
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Activité
            </label>
            <select
              value={vaType}
              onChange={e => {
                setVaType(e.target.value as any);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">Toutes activités (Chatting & Insta)</option>
              <option value="CHATTEUR">VA Chatting (Avec Formation)</option>
              <option value="INSTAGRAM">VA Instagram (Parcours Direct)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Statut
            </label>
            <select
              value={status}
              onChange={e => {
                setStatus(e.target.value as any);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="EN_ATTENTE">En attente (Recrutement)</option>
              <option value="ACCEPTE">Accepté</option>
              <option value="EN_FORMATION">En formation (Chatting)</option>
              <option value="EN_SIMULATION">En simulation (Chatting)</option>
              <option value="VALIDE">Validé (Chatting)</option>
              <option value="EN_PRODUCTION">En production</option>
              <option value="REFUSE">Refusé</option>
              <option value="ABANDONNE">Abandonné</option>
            </select>
          </div>

          {/* Server Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Serveur Discord
            </label>
            <select
              value={server}
              onChange={e => {
                setServer(e.target.value);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">Tous les 4 serveurs</option>
              <option value="RECRUTEMENT">Serveur Recrutement</option>
              <option value="FORMATION">Serveur Formation (Chatting)</option>
              <option value="PRODUCTION_CHATTING">Serveur Prod VA Chatting</option>
              <option value="PRODUCTION_INSTAGRAM">Serveur Prod VA Instagram</option>
              <option value="AUCUN">Hors serveur</option>
            </select>
          </div>

          {/* Attribution Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Attribution Parrain
            </label>
            <select
              value={attributionStatus}
              onChange={e => {
                setAttributionStatus(e.target.value);
                setPage(1);
              }}
              className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="ALL">Toutes attributions</option>
              <option value="CONFIRMED">Confirmé (Lien valide)</option>
              <option value="UNCERTAIN">Incertain (À vérifier)</option>
              <option value="MANUAL_REASSIGNED">Réassigné manuellement</option>
            </select>
          </div>

          {/* Anomaly Toggle */}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Anomalies Discord
            </label>
            <button
              type="button"
              onClick={() => {
                setAnomalyOnly(!anomalyOnly);
                setPage(1);
              }}
              className={`w-full p-2 border rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                anomalyOnly
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{anomalyOnly ? 'Anomalies seules' : 'Toutes situations'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Candidat</th>
                <th className="py-3 px-4 font-semibold">Activité</th>
                <th className="py-3 px-4 font-semibold">Statut Administratif & Opérationnel</th>
                <th className="py-3 px-4 font-semibold">Serveur Discord</th>
                <th className="py-3 px-4 font-semibold">Parrain Rattaché</th>
                <th className="py-3 px-4 font-semibold">Arrivée</th>
                {!isParrainOnly && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                    Chargement des dossiers candidats...
                  </td>
                </tr>
              ) : candidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Aucun dossier candidat ne correspond aux filtres sélectionnés.
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
                      className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                        candidate.hasAnomaly ? 'bg-rose-50/20' : ''
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
                                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                                {candidate.displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${badge.dot}`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-900 truncate">
                                {candidate.displayName}
                              </span>
                              {candidate.hasAnomaly && (
                                <span
                                  title={candidate.anomalyReason || 'Anomalie détectée'}
                                  className="px-1.5 py-0.2 text-[10px] bg-rose-100 text-rose-800 rounded font-semibold flex items-center gap-0.5"
                                >
                                  <AlertTriangle className="w-3 h-3 text-rose-600" /> Anomalie
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                              <span>ID: {candidate.discordUserId}</span>
                              <button
                                onClick={e => handleCopyId(e, candidate.discordUserId)}
                                title="Copier le Discord ID"
                                className="p-0.5 hover:text-slate-700 rounded transition-colors"
                              >
                                {copiedId === candidate.discordUserId ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
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
                        <span className="font-semibold text-slate-800">
                          {getVaTypeLabel(candidate.vaType)}
                        </span>
                      </td>

                      {/* Split Status */}
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                            <span className="font-bold text-slate-900 text-xs">
                              {getOperationalStatusLabel(candidate.operationalStatus)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Admin : <strong className="text-slate-700">{getAdminStatusLabel(candidate.adminStatus)}</strong>
                          </div>
                        </div>
                      </td>

                      {/* Server */}
                      <td className="py-3 px-4 text-slate-700">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[140px]">
                            {getServerLabel(candidate.currentServer)}
                          </span>
                        </div>
                      </td>

                      {/* Referrer */}
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-slate-900 truncate max-w-[130px]">
                            {candidate.referrerName || 'Non assigné'}
                          </div>
                          <div className={`text-[10px] ${attrInfo.text}`}>
                            {attrInfo.label}
                          </div>
                        </div>
                      </td>

                      {/* Arrival Date */}
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {formatDate(candidate.arrivalDate)}
                      </td>

                      {/* Actions (Admins & Responsables) */}
                      {!isParrainOnly && (
                        <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onOpenStatusModal(candidate)}
                              title="Modifier le statut"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {isAdmin && (
                              <button
                                onClick={() => onOpenReassignModal(candidate)}
                                title="Réassigner le parrain"
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
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
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div>
            Affichage de <strong>{candidates.length}</strong> sur <strong>{total}</strong> dossier(s)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || isLoading}
              className="p-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-slate-700">
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
