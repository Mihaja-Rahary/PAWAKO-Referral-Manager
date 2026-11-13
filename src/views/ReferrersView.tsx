import React, { useState, useEffect } from 'react';
import { Referrer, UserRole } from '../types';
import { api } from '../api';
import { Award, Plus, Copy, Check, AlertCircle } from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectReferrerFilter: (referrerId: string) => void;
  refreshTrigger: number;
}

export const ReferrersView: React.FC<Props> = ({
  currentUserRole,
  refreshTrigger,
}) => {
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // New Referrer Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [discordUserId, setDiscordUserId] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentUserRole === 'ADMINISTRATEUR';

  const fetchReferrers = async () => {
    try {
      setIsLoading(true);
      const res = await api.getReferrers();
      setReferrers(res.referrers);
    } catch (err) {
      console.error('Failed to load referrers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrers();
  }, [refreshTrigger]);

  const handleCopyLink = (code: string, url: string) => {
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
      fetchReferrers();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du parrain');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
          Parrains & Liens Discord
        </h2>
        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs shadow-violet-600/20 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Parrain</span>
          </button>
        )}
      </div>

      {/* Referrers Grid / Cards */}
      {isLoading && referrers.length === 0 ? (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-12 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
          Chargement des parrains...
        </div>
      ) : referrers.length === 0 ? (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-12 text-center space-y-2 transition-colors">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] flex items-center justify-center mx-auto border border-transparent dark:border-[#241a38]">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">Aucun parrain configuré</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {referrers.map(ref => {
            const conv = ref.conversionRate || 0;
            return (
              <div
                key={ref.id}
                className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 hover:border-violet-300 dark:hover:border-violet-500/40 transition-colors shadow-xs flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm truncate">
                        {ref.discordDisplayName || ref.discordUsername}
                      </h3>
                      <div className="text-[11px] text-slate-400 dark:text-[#7c7296] font-mono mt-0.5">
                        {ref.discordUserId}
                      </div>
                    </div>
                    <span className="text-[10px] bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] px-2 py-0.5 rounded font-mono font-medium border border-slate-200 dark:border-[#241a38] shrink-0">
                      {ref.inviteCode}
                    </span>
                  </div>

                  {ref.notes && (
                    <p className="text-xs text-slate-500 dark:text-[#9d93b8] italic bg-slate-50 dark:bg-[#171026] p-2 rounded border border-slate-100 dark:border-[#241a38]">
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

                  {/* Detail funnel counters */}
                  <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] space-y-1 pt-1 border-t border-slate-100 dark:border-[#241a38]">
                    <div className="flex justify-between">
                      <span>En attente</span>
                      <span className="font-medium font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb]">
                        {ref.enAttente || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>En formation / simulation</span>
                      <span className="font-medium font-mono tabular-nums text-purple-700 dark:text-purple-300">
                        {(ref.enFormation || 0) + (ref.enSimulation || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Refusés</span>
                      <span className="font-medium font-mono tabular-nums text-rose-700 dark:text-rose-400">
                        {ref.refuses || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Personal Invite Link copy bar */}
                <div className="pt-3 border-t border-slate-100 dark:border-[#241a38] space-y-2">
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-[#d8d0eb]">
                    Lien d'invitation Discord
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={ref.inviteUrl}
                      className="flex-1 text-[11px] font-mono p-1.5 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-700 dark:text-[#d8d0eb] select-all focus:outline-none"
                    />
                    <button
                      onClick={() => handleCopyLink(ref.inviteCode, ref.inviteUrl)}
                      title="Copier le lien Discord"
                      className="p-1.5 text-xs font-medium text-slate-700 dark:text-[#f4f1fa] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] border border-transparent dark:border-[#241a38] rounded transition-colors flex items-center gap-1"
                    >
                      {copiedCode === ref.inviteCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
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
                className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f4f1fa] text-sm"
              >
                ✕
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
                  Code d'invitation (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: PWK-ALEX-99"
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] uppercase font-mono placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] mb-1">
                  Note (Optionnel)
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
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-[#d8d0eb] hover:bg-slate-100 dark:hover:bg-[#171026] rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Génération...' : 'Créer le parrain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
