import React, { useState } from 'react';
import { Candidate, CandidateStatus, AdminStatus, OperationalStatus } from '../types';
import { getVaTypeLabel, getStatusLabel } from '../utils/statusUtils';
import { X, AlertCircle } from 'lucide-react';

interface Props {
  candidate: Candidate;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    newAdminStatus?: AdminStatus;
    newOperationalStatus?: OperationalStatus;
    newStatus?: CandidateStatus;
    refusalReason?: string;
    notes: string;
  }) => Promise<void>;
}

export const StatusChangeModal: React.FC<Props> = ({
  candidate,
  isOpen,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;

  const [selectedStatus, setSelectedStatus] = useState<CandidateStatus>(candidate.status);
  const [refusalReason, setRefusalReason] = useState(candidate.refusalReason || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInstagram = candidate.vaType === 'INSTAGRAM';

  // Options de statuts avec respect strict des 2 parcours
  const statusOptions: { value: CandidateStatus; label: string; operational: string; disabled?: boolean; note?: string }[] = [
    {
      value: 'EN_ATTENTE',
      label: 'En attente',
      operational: 'Recrutement',
      note: 'Dossier en cours d évaluation',
    },
    {
      value: 'ACCEPTE',
      label: 'Accepté (Recrutement validé)',
      operational: 'Recrutement',
      note: 'Candidature retenue pour le parcours',
    },
    {
      value: 'EN_FORMATION',
      label: 'En formation',
      operational: 'Formation',
      disabled: isInstagram,
      note: isInstagram ? 'Incompatible : réservé aux VA Chatteurs' : 'Affectation sur le Serveur Formation',
    },
    {
      value: 'EN_SIMULATION',
      label: 'En simulation',
      operational: 'Simulation',
      disabled: isInstagram,
      note: isInstagram ? 'Incompatible : réservé aux VA Chatteurs' : 'Mise en situation live sur Serveur Formation',
    },
    {
      value: 'VALIDE',
      label: 'VA Validé',
      operational: 'Validé',
      disabled: isInstagram,
      note: isInstagram ? 'Incompatible : réservé aux VA Chatteurs' : 'Parcours formation achevé avec succès',
    },
    {
      value: 'EN_PRODUCTION',
      label: isInstagram ? 'En production VA Instagram' : 'En production VA Chatting',
      operational: 'Production',
      note: isInstagram
        ? 'Affectation sur le Serveur Production VA Instagram'
        : 'Affectation sur le Serveur Production VA Chatting',
    },
    {
      value: 'REFUSE',
      label: 'Refusé',
      operational: 'Inactif',
      note: 'Motif de refus confidentiel obligatoire',
    },
    {
      value: 'ABANDONNE',
      label: 'Abandonné',
      operational: 'Inactif',
      note: 'Désistement ou départ volontaire du candidat',
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Règle 1 : Motif obligatoire pour toute modification administrative manuelle
    if (!notes.trim() && selectedStatus !== 'REFUSE') {
      setError('Un motif explicite est obligatoire pour valider une correction administrative.');
      return;
    }

    // Règle 2 : Motif de refus obligatoire lors d'un rejet
    if (selectedStatus === 'REFUSE' && !refusalReason.trim() && !notes.trim()) {
      setError('Un motif de refus détaillé est obligatoire pour rejeter une candidature.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        newStatus: selectedStatus,
        refusalReason: refusalReason.trim(),
        notes: notes.trim() || (selectedStatus === 'REFUSE' ? refusalReason.trim() : 'Modification de statut'),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la mise à jour du statut.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">Modifier le statut</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {candidate.displayName} · <span className="font-medium text-slate-700">{getVaTypeLabel(candidate.vaType)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Progression du parcours ({getVaTypeLabel(candidate.vaType)})
            </label>
            <div className="space-y-1.5">
              {statusOptions.map(option => (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border text-sm transition-all cursor-pointer ${
                    option.disabled
                      ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed'
                      : selectedStatus === option.value
                      ? 'bg-slate-900/5 border-slate-900 text-slate-950 font-medium'
                      : 'border-slate-200 hover:bg-slate-50/80 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={option.value}
                    disabled={option.disabled}
                    checked={selectedStatus === option.value}
                    onChange={() => setSelectedStatus(option.value)}
                    className="mt-0.5 text-slate-900 focus:ring-slate-900"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{option.label}</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        Opérationnel : {option.operational}
                      </span>
                    </div>
                    {option.note && (
                      <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                        {option.note}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Refusal Reason (Mandatory when REFUSE) */}
          {selectedStatus === 'REFUSE' && (
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-rose-800">
                  Motif du refus <span className="text-rose-600">*</span>
                </label>
                <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-medium">
                  Confidentiel (Direction & Responsables)
                </span>
              </div>
              <textarea
                value={refusalReason}
                onChange={e => setRefusalReason(e.target.value)}
                rows={3}
                placeholder="Indiquez précisément la raison motivée du refus (ex: non-respect des critères de disponibilité, compétences rédactionnelles non concluantes, etc.)"
                required
                className="w-full text-xs p-3 border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 bg-rose-50/20"
              />
            </div>
          )}

          {/* Mandatory Internal Notes for Auditability */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Motif obligatoire de la décision / Note de transition <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Tracé dans le journal d'audit</span>
            </div>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Entretien concluant avec le responsable formation, passage en simulation"
              required={selectedStatus !== 'REFUSE'}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer la décision'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
