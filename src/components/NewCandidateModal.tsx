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
  if (!isOpen) return null;

  const [discordUserId, setDiscordUserId] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vaType, setVaType] = useState<VAType>('CHATTEUR');
  const [inviteCodeUsed, setInviteCodeUsed] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">Enregistrer un Candidat</h3>
            <p className="text-xs text-slate-500 mt-0.5">Entrée manuelle ou intégration directe</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Discord User ID (Identifiant unique permanent) <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ex: 894192019481920192"
              value={discordUserId}
              onChange={e => setDiscordUserId(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username Discord <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: jerome.va"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nom affiché
              </label>
              <input
                type="text"
                placeholder="Ex: Jérôme D."
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Type de VA et Parcours
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-2.5 border rounded-lg cursor-pointer text-xs flex flex-col gap-0.5 ${
                  vaType === 'CHATTEUR'
                    ? 'border-slate-900 bg-slate-900/5 font-semibold text-slate-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                <span className="text-[10px] font-normal text-slate-500">Formation & Simu requises</span>
              </label>

              <label
                className={`p-2.5 border rounded-lg cursor-pointer text-xs flex flex-col gap-0.5 ${
                  vaType === 'INSTAGRAM'
                    ? 'border-slate-900 bg-slate-900/5 font-semibold text-slate-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
                <span className="text-[10px] font-normal text-slate-500">Parcours direct production</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Code d'invitation ou Parrain initial
            </label>
            <select
              value={inviteCodeUsed}
              onChange={e => setInviteCodeUsed(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 bg-white"
            >
              <option value="">Sélectionner un code parrain (ou aucun pour attribution incertaine)</option>
              {referrers.map(ref => (
                <option key={ref.id} value={ref.inviteCode}>
                  {ref.inviteCode} — {ref.discordDisplayName}
                </option>
              ))}
            </select>
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
              {isSubmitting ? 'Création...' : 'Créer le candidat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
