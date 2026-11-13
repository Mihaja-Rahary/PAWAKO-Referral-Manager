import React, { useState, useEffect } from 'react';
import { Candidate, StatusHistoryEntry, ReferralAttributionHistoryEntry, UserRole, VAType } from '../types';
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
  X,
  Copy,
  Check,
  Server,
  ArrowRight,
  ShieldAlert,
  Edit3,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  Lock
} from 'lucide-react';

interface Props {
  candidateId: string | null;
  onClose: () => void;
  currentUserRole: UserRole;
  onOpenStatusModal: (candidate: Candidate) => void;
  onOpenReassignModal: (candidate: Candidate) => void;
  onCandidateUpdated: () => void;
}

export const CandidateDrawer: React.FC<Props> = ({
  candidateId,
  onClose,
  currentUserRole,
  onOpenStatusModal,
  onOpenReassignModal,
  onCandidateUpdated,
}) => {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [attributionHistory, setAttributionHistory] = useState<ReferralAttributionHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isChangingVaType, setIsChangingVaType] = useState(false);
  const [showVaTypeForm, setShowVaTypeForm] = useState(false);
  const [vaTypeReason, setVaTypeReason] = useState('');
  const [isClearingAnomaly, setIsClearingAnomaly] = useState(false);
  const [showAnomalyForm, setShowAnomalyForm] = useState(false);
  const [anomalyResolution, setAnomalyResolution] = useState('');
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const isParrainOnly = currentUserRole === 'PARRAIN';
  const isAdmin = currentUserRole === 'ADMINISTRATEUR';
  const isResponsableOrAdmin = currentUserRole === 'ADMINISTRATEUR' || currentUserRole === 'RESPONSABLE';

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      return;
    }

    setShowVaTypeForm(false);
    setShowAnomalyForm(false);
    setVaTypeReason('');
    setAnomalyResolution('');
    setDrawerError(null);

    const loadData = async () => {
      try {
        setIsLoading(true);
        const res = await api.getCandidate(candidateId);
        setCandidate(res.candidate);
        setStatusHistory(res.statusHistory);
        setAttributionHistory(res.attributionHistory);
      } catch (err) {
        console.error('Failed to load candidate:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [candidateId]);

  if (!candidateId) return null;

  const handleCopyDiscordId = () => {
    if (candidate) {
      navigator.clipboard.writeText(candidate.discordUserId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleToggleVaType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !isResponsableOrAdmin) return;
    const targetType: VAType = candidate.vaType === 'CHATTEUR' ? 'INSTAGRAM' : 'CHATTEUR';

    if (!vaTypeReason.trim()) {
      setDrawerError('Un motif obligatoire est requis.');
      return;
    }

    try {
      setDrawerError(null);
      setIsChangingVaType(true);
      const res = await api.updateCandidateVAType(candidate.id, targetType, vaTypeReason.trim());
      setCandidate(res.candidate);
      setShowVaTypeForm(false);
      setVaTypeReason('');
      onCandidateUpdated();
    } catch (err: any) {
      setDrawerError(err.message || "Erreur lors du changement d'activité");
    } finally {
      setIsChangingVaType(false);
    }
  };

  const handleClearAnomaly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !isResponsableOrAdmin) return;
    if (!anomalyResolution.trim()) {
      setDrawerError('Une note de résolution est obligatoire.');
      return;
    }

    try {
      setDrawerError(null);
      setIsClearingAnomaly(true);
      const res = await api.clearCandidateAnomaly(candidate.id, anomalyResolution.trim());
      setCandidate(res.candidate);
      setShowAnomalyForm(false);
      setAnomalyResolution('');
      onCandidateUpdated();
    } catch (err: any) {
      setDrawerError(err.message || "Erreur lors de la résolution de l'anomalie");
    } finally {
      setIsClearingAnomaly(false);
    }
  };

  const badge = candidate ? getStatusBadgeClasses(candidate.status) : null;
  const attrInfo = candidate ? getAttributionLabel(candidate.attributionStatus) : null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-900/40 dark:bg-black/80 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white dark:bg-[#100b1a] h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-[#241a38] transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-[#241a38] bg-slate-50/70 dark:bg-[#171026]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider">
              Dossier Candidat
            </span>
            <span className="text-slate-300 dark:text-[#2e2249]">/</span>
            <span className="text-xs font-mono text-slate-600 dark:text-[#d8d0eb]">{candidate?.id}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f1fa] p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isLoading || !candidate ? (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-500 dark:text-[#9d93b8] text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-violet-500" />
            Chargement du dossier...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {drawerError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-xl text-xs text-rose-800 dark:text-rose-200">
                {drawerError}
              </div>
            )}

            {/* Anomaly Banner */}
            {candidate.hasAnomaly && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-500/30 rounded-xl text-xs space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 text-rose-900 dark:text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-950 dark:text-rose-100">Anomalie détectée</div>
                      <div className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5 leading-relaxed">
                        {candidate.anomalyReason || 'Incompatibilité de rôle ou de statut Discord.'}
                      </div>
                    </div>
                  </div>
                  {isResponsableOrAdmin && !showAnomalyForm && (
                    <button
                      onClick={() => setShowAnomalyForm(true)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shrink-0"
                    >
                      Résoudre
                    </button>
                  )}
                </div>

                {showAnomalyForm && isResponsableOrAdmin && (
                  <form onSubmit={handleClearAnomaly} className="pt-2 border-t border-rose-200 dark:border-rose-500/20 flex items-center gap-2">
                    <input
                      type="text"
                      value={anomalyResolution}
                      onChange={e => setAnomalyResolution(e.target.value)}
                      placeholder="Note de résolution..."
                      required
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-[#241a38] bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnomalyForm(false)}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-[#9d93b8]"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isClearingAnomaly}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
                    >
                      Valider
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Identity Card */}
            <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-[#241a38] bg-slate-50/40 dark:bg-[#171026]">
              <div className="relative shrink-0">
                {candidate.avatar ? (
                  <img
                    src={candidate.avatar}
                    alt={candidate.displayName}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover border border-slate-200 dark:border-[#2e2249]"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-[#241a38] flex items-center justify-center text-slate-700 dark:text-[#f4f1fa] font-semibold text-lg border border-slate-300 dark:border-[#2e2249]">
                    {candidate.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#171026] ${badge?.dot}`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] truncate">
                    {candidate.displayName}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-[#9d93b8]">@{candidate.username}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#d8d0eb] mt-1">
                  <span className="font-mono bg-white dark:bg-[#08050f] px-2 py-0.5 border border-slate-200 dark:border-[#241a38] rounded text-[11px] text-slate-700 dark:text-[#d8d0eb]">
                    {candidate.discordUserId}
                  </span>
                  <button
                    onClick={handleCopyDiscordId}
                    title="Copier le Discord User ID"
                    className="p-1 hover:bg-slate-200 dark:hover:bg-[#241a38] rounded text-slate-500 dark:text-[#9d93b8] transition-colors"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                  <span className="font-semibold text-slate-900 dark:text-[#f4f1fa] px-2 py-0.5 rounded bg-slate-200/70 dark:bg-[#241a38] border border-transparent dark:border-[#2e2249]">
                    {getVaTypeLabel(candidate.vaType)}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 ${badge?.text} font-medium`}>
                    <span className={`w-2 h-2 rounded-full ${badge?.dot}`} />
                    {getStatusLabel(candidate.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions Bar (Admins & Responsables) */}
            {!isParrainOnly && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onOpenStatusModal(candidate)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Modifier le statut
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => onOpenReassignModal(candidate)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] hover:bg-slate-50 dark:hover:bg-[#241a38] rounded-lg transition-colors shadow-xs"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-slate-500 dark:text-[#9d93b8]" />
                      Réassigner le parrain
                    </button>
                  )}

                  <button
                    onClick={() => setShowVaTypeForm(!showVaTypeForm)}
                    disabled={isChangingVaType}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-[#d8d0eb] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] border border-transparent dark:border-[#241a38] rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isChangingVaType ? 'animate-spin' : ''}`} />
                    Basculer en {candidate.vaType === 'CHATTEUR' ? 'VA Instagram' : 'VA Chatting'}
                  </button>
                </div>

                {showVaTypeForm && (
                  <form onSubmit={handleToggleVaType} className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex items-center gap-2">
                    <input
                      type="text"
                      value={vaTypeReason}
                      onChange={e => setVaTypeReason(e.target.value)}
                      placeholder="Motif du changement d'activité..."
                      required
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#241a38] bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVaTypeForm(false)}
                      className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-[#9d93b8]"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isChangingVaType}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
                    >
                      Confirmer
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Status Split Grid : Administratif & Opérationnel */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-1">
                <div className="text-slate-500 dark:text-[#9d93b8] font-medium text-[11px] uppercase tracking-wider">
                  Statut Administratif
                </div>
                <div className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
                  {getAdminStatusLabel(candidate.adminStatus)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-1">
                <div className="text-slate-500 dark:text-[#9d93b8] font-medium text-[11px] uppercase tracking-wider">
                  Statut Opérationnel
                </div>
                <div className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
                  {getOperationalStatusLabel(candidate.operationalStatus)}
                </div>
              </div>
            </div>

            {/* Server & Referrer Info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50/70 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-1">
                <div className="text-slate-500 dark:text-[#9d93b8] text-[11px]">Serveur Discord</div>
                <div className="font-medium text-slate-900 dark:text-[#f4f1fa] flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-slate-500 dark:text-[#9d93b8]" />
                  {getServerLabel(candidate.currentServer)}
                </div>
                {candidate.discordRoles?.length > 0 && (
                  <div className="text-[10px] text-slate-400 dark:text-[#7c7296] pt-1">
                    {candidate.discordRoles.length} rôle(s)
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50/70 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-1">
                <div className="text-slate-500 dark:text-[#9d93b8] text-[11px]">Parrain</div>
                <div className="font-medium text-slate-900 dark:text-[#f4f1fa] truncate">
                  {candidate.referrerName || 'Non assigné'}
                </div>
                <div className={`text-[11px] ${attrInfo?.text}`}>
                  {attrInfo?.label}
                </div>
              </div>
            </div>

            {/* Warning if attribution is uncertain (Admin & Responsable only) */}
            {!isParrainOnly && candidate.attributionStatus === 'UNCERTAIN' && (
              <div className="p-3 bg-amber-50 dark:bg-[#171026] border border-amber-200 dark:border-amber-500/30 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-950 dark:text-amber-100">Attribution incertaine</div>
                  <div className="mt-0.5 text-amber-800 dark:text-amber-300">
                    {candidate.uncertaintyReason || "Arrivé sans lien d'invitation reconnu."}
                  </div>
                </div>
              </div>
            )}

            {/* Confidential Refusal Box (Admin & Responsable only) */}
            {candidate.adminStatus === 'REFUSE' && !isParrainOnly && (
              <div className="p-4 bg-rose-50/70 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-500/30 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900 dark:text-rose-200">
                    <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    Motif de refus
                  </div>
                  <span className="text-[10px] bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Confidentiel
                  </span>
                </div>
                <p className="text-xs text-rose-950 dark:text-rose-100 bg-white dark:bg-[#08050f] p-3 rounded-lg border border-rose-200 dark:border-rose-500/30 leading-relaxed font-medium">
                  {candidate.refusalReason || 'Aucun motif renseigné.'}
                </p>
                <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center justify-between pt-1">
                  <span>Par {candidate.decisionByName || 'Responsable'}</span>
                  <span>{formatDate(candidate.decisionDate)}</span>
                </div>
              </div>
            )}

            {/* Parcours Milestones */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] uppercase tracking-wider">
                Parcours {getVaTypeLabel(candidate.vaType)}
              </h3>
              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-[#9d93b8]">Arrivée</span>
                  <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.arrivalDate)}</span>
                </div>
                {candidate.vaType === 'CHATTEUR' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-[#9d93b8]">Formation</span>
                      <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.formationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-[#9d93b8]">Simulation</span>
                      <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.simulationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-[#9d93b8]">Validation</span>
                      <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.validationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-[#9d93b8]">Production VA Chatting</span>
                      <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.productionDate)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-[#9d93b8]">Production VA Instagram</span>
                    <span className="font-mono text-slate-800 dark:text-[#f4f1fa]">{formatDate(candidate.productionDate)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Status History Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] uppercase tracking-wider">
                  Historique
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#9d93b8]">
                  {statusHistory.length}
                </span>
              </div>

              {statusHistory.length === 0 ? (
                <div className="text-xs text-slate-400 dark:text-[#7c7296] p-4 border border-dashed border-slate-200 dark:border-[#241a38] rounded-lg text-center">
                  Aucun historique.
                </div>
              ) : (
                <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-[#241a38]">
                  {statusHistory.map(entry => (
                    <div key={entry.id} className="relative text-xs group">
                      <span className="absolute -left-[14px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-violet-500 border-2 border-white dark:border-[#100b1a] ring-1 ring-slate-200 dark:ring-[#241a38]" />
                      <div className="bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                            {getStatusLabel(entry.toStatus)}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono">
                            {formatDate(entry.timestamp)}
                          </span>
                        </div>
                        {!isParrainOnly && (
                          <>
                            <div className="text-[11px] text-slate-600 dark:text-[#9d93b8] flex items-center gap-1.5 flex-wrap">
                              {entry.authorName && (
                                <span>Par : <strong className="text-slate-800 dark:text-[#d8d0eb]">{entry.authorName}</strong></span>
                              )}
                              <span className="text-slate-300 dark:text-[#2e2249]">·</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-[#9d93b8]">[{entry.authorSource || 'MANUAL'}]</span>
                              {entry.fromServer && entry.toServer && entry.fromServer !== entry.toServer && (
                                <>
                                  <span className="text-slate-300 dark:text-[#2e2249]">·</span>
                                  <span className="flex items-center gap-1">
                                    {entry.fromServer} <ArrowRight className="w-3 h-3 text-slate-400 dark:text-[#7c7296]" /> {entry.toServer}
                                  </span>
                                </>
                              )}
                            </div>
                            {entry.reason && (
                              <div className={`mt-1 text-[11px] p-2 rounded ${
                                entry.isConfidential
                                  ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-500/30'
                                  : 'bg-white dark:bg-[#08050f] text-slate-700 dark:text-[#d8d0eb] border border-slate-200 dark:border-[#241a38]'
                              }`}>
                                {entry.reason}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Attribution Audit History (Admins only) */}
            {!isParrainOnly && attributionHistory.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#241a38]">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] uppercase tracking-wider">
                  Réattributions de parrain
                </h3>
                <div className="space-y-2">
                  {attributionHistory.map(att => (
                    <div key={att.id} className="p-2.5 bg-violet-50/50 dark:bg-[#171026] border border-violet-200 dark:border-violet-500/30 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-violet-950 dark:text-violet-200">
                          {att.oldReferrerName || 'Aucun'} → {att.newReferrerName}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono">{formatDate(att.timestamp)}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-[#d8d0eb]">Par {att.authorName} · {att.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
