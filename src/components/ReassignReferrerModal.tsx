import React, { useState } from 'react';
import { Candidate, Referrer } from '../types';
import { X, AlertCircle } from 'lucide-react';

interface Props {
  candidate: Candidate;
  referrers: Referrer[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newReferrerId: string, reason: string) => Promise<void>;
}

export const ReassignReferrerModal: React.FC<Props> = ({
  candidate,
  referrers,
  isOpen,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;

  const [selectedReferrerId, setSelectedReferrerId] = useState(candidate.referrerId || (referrers[0]?.id ?? ''));
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedReferrerId) {
      setError('Veuillez sélectionner un nouveau parrain.');
      return;
    }

    if (!reason.trim()) {
      setError('Un motif explicite est obligatoire pour documenter cette réattribution dans le journal d audit.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(selectedReferrerId, reason.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la réattribution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">Réassigner le parrain</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Candidat: <span className="font-medium text-slate-700">{candidate.displayName}</span>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
            <div className="text-slate-500">Parrain actuel :</div>
            <div className="font-medium text-slate-800">
              {candidate.referrerName || 'Aucun parrain assigné (Attribution incertaine)'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nouveau Parrain Assigné
            </label>
            <select
              value={selectedReferrerId}
              onChange={e => setSelectedReferrerId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 bg-white"
            >
              {referrers.map(ref => (
                <option key={ref.id} value={ref.id}>
                  {ref.discordDisplayName} ({ref.inviteCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Motif de la réattribution <span className="text-rose-600">*</span>
              </label>
              <span className="text-[11px] text-slate-400">Journalisé</span>
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Ex: Confirmation de l'invitation d'origine après vérification manuelle du code ou réclamation légitime du parrain."
              required
              className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
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
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer la réattribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
