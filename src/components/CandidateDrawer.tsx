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
  Calendar,
  UserCheck,
  Server,
  ArrowRight,
  ShieldAlert,
  Edit3,
  UserPlus,
  RefreshCw,
  CheckCircle2,
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
  const [isClearingAnomaly, setIsClearingAnomaly] = useState(false);

  const isParrainOnly = currentUserRole === 'PARRAIN';
  const isAdmin = currentUserRole === 'ADMINISTRATEUR';
  const isResponsableOrAdmin = currentUserRole === 'ADMINISTRATEUR' || currentUserRole === 'RESPONSABLE';

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      return;
    }

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

  const handleToggleVaType = async () => {
    if (!candidate || !isResponsableOrAdmin) return;
    const targetType: VAType = candidate.vaType === 'CHATTEUR' ? 'INSTAGRAM' : 'CHATTEUR';

    const reason = window.prompt(
      `Indiquez le motif obligatoire pour corriger l'activité vers ${targetType === 'CHATTEUR' ? 'VA Chatting' : 'VA Instagram'} :`
    );

    if (!reason || !reason.trim()) {
      alert('Un motif obligatoire est requis pour changer l activité.');
      return;
    }

    try {
      setIsChangingVaType(true);
      const res = await api.updateCandidateVAType(candidate.id, targetType, reason.trim());
      setCandidate(res.candidate);
      onCandidateUpdated();
    } catch (err: any) {
      alert(err.message || 'Erreur lors du changement d activité');
    } finally {
      setIsChangingVaType(false);
    }
  };

  const handleClearAnomaly = async () => {
    if (!candidate || !isResponsableOrAdmin) return;
    const resolution = window.prompt("Indiquez la note de résolution de l'anomalie pour le journal d'audit :");
    if (!resolution || !resolution.trim()) return;

    try {
      setIsClearingAnomaly(true);
      const res = await api.clearCandidateAnomaly(candidate.id, resolution.trim());
      setCandidate(res.candidate);
      onCandidateUpdated();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la résolution de l anomalie');
    } finally {
      setIsClearingAnomaly(false);
    }
  };

  const badge = candidate ? getStatusBadgeClasses(candidate.status) : null;
  const attrInfo = candidate ? getAttributionLabel(candidate.attributionStatus) : null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-slate-900/30 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Dossier Agent PAWAKO
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono text-slate-600">{candidate?.id}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isLoading || !candidate ? (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-slate-400" />
            Chargement du dossier...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Anomaly Banner */}
            {candidate.hasAnomaly && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-rose-950">Anomalie détectée sur ce dossier</div>
                      <div className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                        {candidate.anomalyReason || 'Incompatibilité de rôle ou incohérence de statut Discord.'}
                      </div>
                    </div>
                  </div>
                  {isResponsableOrAdmin && (
                    <button
                      onClick={handleClearAnomaly}
                      disabled={isClearingAnomaly}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shrink-0"
                    >
                      Résoudre
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Identity Card */}
            <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/40">
              <div className="relative shrink-0">
                {candidate.avatar ? (
                  <img
                    src={candidate.avatar}
                    alt={candidate.displayName}
                    className="w-14 h-14 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-semibold text-lg border border-slate-300">
                    {candidate.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${badge?.dot}`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {candidate.displayName}
                  </h2>
                  <span className="text-xs text-slate-500">@{candidate.username}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 mt-1">
                  <span className="font-mono bg-white px-2 py-0.5 border border-slate-200 rounded text-[11px] text-slate-700">
                    Discord ID: {candidate.discordUserId}
                  </span>
                  <button
                    onClick={handleCopyDiscordId}
                    title="Copier le Discord User ID"
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                  <span className="font-semibold text-slate-900 px-2 py-0.5 rounded bg-slate-200/70">
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
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={() => onOpenStatusModal(candidate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Modifier le statut
                </button>

                {isAdmin && (
                  <button
                    onClick={() => onOpenReassignModal(candidate)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors shadow-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-slate-500" />
                    Réassigner le parrain
                  </button>
                )}

                <button
                  onClick={handleToggleVaType}
                  disabled={isChangingVaType}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Corriger l'activité (motif obligatoire)"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isChangingVaType ? 'animate-spin' : ''}`} />
                  Basculer en {candidate.vaType === 'CHATTEUR' ? 'VA Instagram' : 'VA Chatting'}
                </button>
              </div>
            )}

            {/* Status Split Grid : Administratif & Opérationnel */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">
                  Statut Administratif
                </div>
                <div className="font-bold text-slate-900 text-sm">
                  {getAdminStatusLabel(candidate.adminStatus)}
                </div>
                <div className="text-[11px] text-slate-400">Décision de recrutement</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 font-medium text-[11px] uppercase tracking-wider">
                  Statut Opérationnel
                </div>
                <div className="font-bold text-slate-900 text-sm">
                  {getOperationalStatusLabel(candidate.operationalStatus)}
                </div>
                <div className="text-[11px] text-slate-400">Situation sur le terrain</div>
              </div>
            </div>

            {/* Server & Referrer Info */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 text-[11px]">Serveur Discord actuel</div>
                <div className="font-medium text-slate-900 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-slate-500" />
                  {getServerLabel(candidate.currentServer)}
                </div>
                {candidate.discordRoles?.length > 0 && (
                  <div className="text-[10px] text-slate-400 pt-1">
                    {candidate.discordRoles.length} rôle(s) Discord actif(s)
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-500 text-[11px]">Parrain d'origine</div>
                <div className="font-medium text-slate-900 truncate">
                  {candidate.referrerName || 'Non assigné (Incertain)'}
                </div>
                <div className={`text-[11px] ${attrInfo?.text}`}>
                  {attrInfo?.label}
                </div>
              </div>
            </div>

            {/* Edge Case Warning if attribution is uncertain (Admin & Responsable only) */}
            {!isParrainOnly && candidate.attributionStatus === 'UNCERTAIN' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-950">Attribution de parrainage incertaine</div>
                  <div className="mt-0.5 text-amber-800">
                    {candidate.uncertaintyReason || 'Ce candidat est arrivé sans lien d invitation reconnu.'}
                  </div>
                </div>
              </div>
            )}

            {/* Confidential Refusal Box (Admin & Responsable only) */}
            {candidate.adminStatus === 'REFUSE' && !isParrainOnly && (
              <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    Motif de refus confidentiel
                  </div>
                  <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Strictement Direction & Responsables
                  </span>
                </div>
                <p className="text-xs text-rose-950 bg-white p-3 rounded-lg border border-rose-200 leading-relaxed font-medium">
                  {candidate.refusalReason || 'Aucun motif de refus renseigné.'}
                </p>
                <div className="text-[11px] text-rose-700 flex items-center justify-between pt-1">
                  <span>Décision prise par : {candidate.decisionByName || 'Responsable'}</span>
                  <span>{formatDate(candidate.decisionDate)}</span>
                </div>
              </div>
            )}

            {/* Parcours Milestones */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Jalons du parcours {getVaTypeLabel(candidate.vaType)}
              </h3>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Arrivée Recrutement</span>
                  <span className="font-mono text-slate-800">{formatDate(candidate.arrivalDate)}</span>
                </div>
                {candidate.vaType === 'CHATTEUR' ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Entrée en Formation (Serveur Formation)</span>
                      <span className="font-mono text-slate-800">{formatDate(candidate.formationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Passage en Simulation</span>
                      <span className="font-mono text-slate-800">{formatDate(candidate.simulationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Validation Finale</span>
                      <span className="font-mono text-slate-800">{formatDate(candidate.validationDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Production VA Chatting</span>
                      <span className="font-mono text-slate-800">{formatDate(candidate.productionDate)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-slate-500 italic">
                      <span>Formation / Simulation / Validation</span>
                      <span>Parcours direct sans formation</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Production VA Instagram</span>
                      <span className="font-mono text-slate-800">{formatDate(candidate.productionDate)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Status History Timeline */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Historique chronologique des transitions
                </h3>
                <span className="text-[11px] text-slate-500">{statusHistory.length} entrée(s)</span>
              </div>

              {statusHistory.length === 0 ? (
                <div className="text-xs text-slate-400 p-4 border border-dashed rounded-lg text-center">
                  Aucun historique disponible.
                </div>
              ) : (
                <div className="relative pl-4 space-y-4 before:content-[''] before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {statusHistory.map(entry => (
                    <div key={entry.id} className="relative text-xs group">
                      <span className="absolute -left-[14px] top-1 w-2.5 h-2.5 rounded-full bg-slate-400 border-2 border-white ring-1 ring-slate-200" />
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">
                            {getStatusLabel(entry.toStatus)}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {formatDate(entry.timestamp)}
                          </span>
                        </div>
                        {!isParrainOnly && (
                          <>
                            <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                              {entry.authorName && (
                                <span>Par : <strong className="text-slate-800">{entry.authorName}</strong></span>
                              )}
                              <span className="text-slate-300">·</span>
                              <span className="font-mono text-[10px] text-slate-500">[{entry.authorSource || 'MANUAL'}]</span>
                              {entry.fromServer && entry.toServer && entry.fromServer !== entry.toServer && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="flex items-center gap-1">
                                    {entry.fromServer} <ArrowRight className="w-3 h-3 text-slate-400" /> {entry.toServer}
                                  </span>
                                </>
                              )}
                            </div>
                            {entry.reason && (
                              <div className={`mt-1 text-[11px] p-2 rounded ${entry.isConfidential ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-white text-slate-700 border border-slate-200'}`}>
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
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Journal des réattributions de parrain
                </h3>
                <div className="space-y-2">
                  {attributionHistory.map(att => (
                    <div key={att.id} className="p-2.5 bg-blue-50/50 border border-blue-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-blue-950">
                          {att.oldReferrerName || 'Aucun'} → {att.newReferrerName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">{formatDate(att.timestamp)}</span>
                      </div>
                      <div className="text-[11px] text-slate-600">Par {att.authorName} · Motif : {att.reason}</div>
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
