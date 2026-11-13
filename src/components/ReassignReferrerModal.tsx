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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/80 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#100b1a] rounded-xl shadow-xl border border-slate-200 dark:border-[#241a38] w-full max-w-md overflow-hidden transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#241a38] bg-slate-50/50 dark:bg-[#171026]">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-base">Réassigner le parrain</h3>
            <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
              Candidat : <span className="font-medium text-slate-700 dark:text-[#d8d0eb]">{candidate.displayName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f1fa] p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg text-xs space-y-1">
            <div className="text-slate-500 dark:text-[#9d93b8]">Parrain actuel</div>
            <div className="font-medium text-slate-800 dark:text-[#f4f1fa]">
              {candidate.referrerName || 'Aucun parrain assigné'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1.5">
              Nouveau Parrain
            </label>
            <select
              value={selectedReferrerId}
              onChange={e => setSelectedReferrerId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#171026]"
            >
              {referrers.map(ref => (
                <option key={ref.id} value={ref.id}>
                  {ref.discordDisplayName} ({ref.inviteCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1.5">
              Motif <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Motif de la réattribution..."
              required
              className="w-full text-xs p-3 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-[#241a38]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-[#d8d0eb] hover:bg-slate-100 dark:hover:bg-[#171026] rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
