import React, { useState } from 'react';
import { Referrer, VAType } from '../types';
import { X, AlertCircle } from 'lucide-react';

interface Props {
  referrers: Referrer[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    discordUserId: string;
    username: string;
    displayName: string;
    vaType: VAType;
    inviteCodeUsed?: string;
  }) => Promise<void>;
}

export const NewCandidateModal: React.FC<Props> = ({
  referrers,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [discordUserId, setDiscordUserId] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vaType, setVaType] = useState<VAType>('CHATTEUR');
  const [inviteCodeUsed, setInviteCodeUsed] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectableReferrers = referrers.filter(r => r.status !== 'ARCHIVED' && Boolean(r.inviteCode));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!discordUserId.trim()) {
      setError('Le Discord User ID est obligatoire.');
      return;
    }
    if (!username.trim()) {
      setError('Le nom d utilisateur Discord est obligatoire.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        discordUserId: discordUserId.trim(),
        username: username.trim(),
        displayName: (displayName.trim() || username.trim()),
        vaType,
        inviteCodeUsed: inviteCodeUsed.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/80 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#100b1a] rounded-xl shadow-xl border border-slate-200 dark:border-[#241a38] w-full max-w-md overflow-hidden transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#241a38] bg-slate-50/50 dark:bg-[#171026]">
          <h3 className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-base">Nouveau Candidat</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f1fa] p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
              placeholder="Ex: 894192019481920192"
              value={discordUserId}
              onChange={e => setDiscordUserId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] font-mono placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                Username Discord <span className="text-rose-600 dark:text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: jerome.va"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                Nom affiché
              </label>
              <input
                type="text"
                placeholder="Ex: Jérôme D."
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1.5">
              Activité
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-2.5 border rounded-lg cursor-pointer text-xs flex flex-col gap-0.5 transition-colors ${
                  vaType === 'CHATTEUR'
                    ? 'border-violet-600 dark:border-violet-500 bg-violet-50/60 dark:bg-violet-500/15 font-semibold text-slate-900 dark:text-[#f4f1fa]'
                    : 'border-slate-200 dark:border-[#241a38] text-slate-600 dark:text-[#9d93b8] hover:bg-slate-50 dark:hover:bg-[#171026]'
                }`}
              >
                <input
                  type="radio"
                  name="vaType"
                  value="CHATTEUR"
                  checked={vaType === 'CHATTEUR'}
                  onChange={() => setVaType('CHATTEUR')}
                  className="sr-only"
                />
                <span>VA Chatteur</span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-[#9d93b8]">Avec formation</span>
              </label>

              <label
                className={`p-2.5 border rounded-lg cursor-pointer text-xs flex flex-col gap-0.5 transition-colors ${
                  vaType === 'INSTAGRAM'
                    ? 'border-violet-600 dark:border-violet-500 bg-violet-50/60 dark:bg-violet-500/15 font-semibold text-slate-900 dark:text-[#f4f1fa]'
                    : 'border-slate-200 dark:border-[#241a38] text-slate-600 dark:text-[#9d93b8] hover:bg-slate-50 dark:hover:bg-[#171026]'
                }`}
              >
                <input
                  type="radio"
                  name="vaType"
                  value="INSTAGRAM"
                  checked={vaType === 'INSTAGRAM'}
                  onChange={() => setVaType('INSTAGRAM')}
                  className="sr-only"
                />
                <span>VA Instagram</span>
                <span className="text-[10px] font-normal text-slate-500 dark:text-[#9d93b8]">Parcours direct</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
              Parrain initial
            </label>
            <select
              value={inviteCodeUsed}
              onChange={e => setInviteCodeUsed(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#171026]"
            >
              <option value="">Aucun</option>
              {selectableReferrers.map(ref => (
                <option key={ref.id} value={ref.inviteCode}>
                  {ref.discordDisplayName} (@{ref.discordUsername}) — {ref.inviteCode}
                </option>
              ))}
            </select>
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
              {isSubmitting ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
