import React, { useState, useEffect } from 'react';
import { Referrer, UserRole } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import { Award, Plus, Copy, Check, ExternalLink, RefreshCw, Users, TrendingUp, AlertCircle } from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectReferrerFilter: (referrerId: string) => void;
  refreshTrigger: number;
}

export const ReferrersView: React.FC<Props> = ({
  currentUserRole,
  onSelectReferrerFilter,
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Gestion des Parrains & Liens d'invitation Discord
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Chaque parrain dispose de son propre lien d'invitation unique rattaché à son Discord User ID sur le Serveur Recrutement.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Parrain</span>
          </button>
        )}
      </div>

      {/* Referrers Grid / Cards */}
      {referrers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Award className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">Aucun parrain configuré</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Aucun parrain n'est enregistré pour le moment. Cliquez sur « Nouveau Parrain » pour associer un Discord User ID réel et générer son lien personnel d'invitation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {referrers.map(ref => {
            return (
              <div
                key={ref.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 hover:border-slate-300 transition-colors shadow-xs flex flex-col justify-between"
              >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm truncate">
                      {ref.discordDisplayName || ref.discordUsername}
                    </h3>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Discord ID: {ref.discordUserId}
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-medium">
                    {ref.inviteCode}
                  </span>
                </div>

                {ref.notes && (
                  <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">
                    {ref.notes}
                  </p>
                )}

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[10px] text-slate-500 uppercase">Filleuls</div>
                    <div className="font-bold text-slate-900 text-base mt-0.5">
                      {ref.totalFilleuls || 0}
                    </div>
                  </div>
                  <div className="p-2 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                    <div className="text-[10px] text-emerald-700 uppercase">En Prod</div>
                    <div className="font-bold text-emerald-900 text-base mt-0.5">
                      {ref.enProduction || 0}
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50/50 border border-blue-200 rounded-lg">
                    <div className="text-[10px] text-blue-700 uppercase">Conv.</div>
                    <div className="font-bold text-blue-900 text-base mt-0.5">
                      {ref.conversionRate || 0}%
                    </div>
                  </div>
                </div>

                {/* Detail funnel counters */}
                <div className="text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span>En attente :</span>
                    <span className="font-medium text-slate-700">{ref.enAttente || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>En formation / simulation :</span>
                    <span className="font-medium text-amber-700">
                      {(ref.enFormation || 0) + (ref.enSimulation || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Refusés :</span>
                    <span className="font-medium text-rose-700">{ref.refuses || 0}</span>
                  </div>
                </div>
              </div>

              {/* Personal Invite Link copy bar */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  Lien personnel d'invitation Discord :
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={ref.inviteUrl}
                    className="flex-1 text-[11px] font-mono p-1.5 border border-slate-200 rounded bg-slate-50 text-slate-700 select-all"
                  />
                  <button
                    onClick={() => handleCopyLink(ref.inviteCode, ref.inviteUrl)}
                    title="Copier le lien Discord"
                    className="p-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors flex items-center gap-1"
                  >
                    {copiedCode === ref.inviteCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-semibold text-slate-900 text-sm">
                Enregistrer un Nouveau Parrain
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReferrer} className="p-6 space-y-4">
              {error && (
                <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discord User ID du Parrain <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 100000000000000005"
                  value={discordUserId}
                  onChange={e => setDiscordUserId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Code d'invitation personnalisé (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: PWK-ALEX-99 (généré automatiquement sinon)"
                  value={customCode}
                  onChange={e => setCustomCode(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Note ou pôle (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Parrain référent VA Instagram"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Génération...' : 'Créer et générer le lien'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
