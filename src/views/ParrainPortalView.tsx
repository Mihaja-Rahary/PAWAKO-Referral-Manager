import React, { useState, useEffect } from 'react';
import { Candidate, Referrer, UserRole } from '../types';
import { api } from '../api';
import {
  getStatusBadgeClasses,
  getStatusLabel,
  getServerLabel,
  getVaTypeLabel,
  formatDate
} from '../utils/statusUtils';
import {
  Copy,
  Check,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Clock,
  BookOpen,
  PlayCircle,
  ExternalLink,
  Shield,
  Search,
  RefreshCw,
  Lock
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectCandidate: (candidateId: string) => void;
  refreshTrigger: number;
}

export const ParrainPortalView: React.FC<Props> = ({
  currentUserRole,
  onSelectCandidate,
  refreshTrigger,
}) => {
  const [data, setData] = useState<{
    referrer: Referrer;
    metrics: {
      totalFilleuls: number;
      enAttente: number;
      acceptes: number;
      refuses: number;
      enFormation: number;
      enSimulation: number;
      enProduction: number;
      abandonnes: number;
      conversionRate: number;
      acceptanceRate: number;
    };
    candidates: Candidate[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    const loadPortal = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await api.getParrainDashboard();
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Impossible de charger l espace parrain.');
      } finally {
        setIsLoading(false);
      }
    };

    loadPortal();
  }, [refreshTrigger]);

  const handleCopy = () => {
    if (data?.referrer.inviteUrl) {
      navigator.clipboard.writeText(data.referrer.inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
        Chargement de votre espace personnel de parrainage...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-white border border-slate-200 rounded-xl text-center space-y-3">
        <div className="w-10 h-10 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-slate-900 text-sm">Espace Personnel Parrain</h3>
        <p className="text-xs text-slate-500">{error || 'Aucun profil de parrain associé.'}</p>
        <div className="text-[11px] text-slate-400 p-3 bg-slate-50 rounded-lg border border-slate-100">
          Si vous venez de vous connecter, demandez à un Administrateur PAWAKO de vous assigner un code d'invitation Discord.
        </div>
      </div>
    );
  }

  const { referrer, metrics, candidates } = data;

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch =
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.username.toLowerCase().includes(search.toLowerCase()) ||
      c.discordUserId.includes(search);
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Parrain Personal Banner with Invite Link */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
              {referrer.discordDisplayName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {referrer.discordDisplayName}
                </h2>
                <span className="text-[10px] bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded border border-slate-200">
                  {referrer.inviteCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Espace personnel sécurisé · Discord ID : <span className="font-mono">{referrer.discordUserId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Accès restreint à vos propres filleuls</span>
          </div>
        </div>

        {/* Personal Discord Invite Link */}
        <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
            <span>Votre lien d'invitation personnel pour le Serveur Recrutement PAWAKO :</span>
            <span className="text-[11px] text-slate-500 font-normal">
              Utilisé <strong>{referrer.usesCount}</strong> fois
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={referrer.inviteUrl}
              className="flex-1 text-xs font-mono p-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 select-all"
            />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs shrink-0"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copier mon lien</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Tout candidat rejoignant Discord via ce lien sera automatiquement rattaché à votre compte de parrain de manière permanente.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-medium">Total Filleuls</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{metrics.totalFilleuls}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-slate-500 uppercase font-medium">En Attente</div>
          <div className="text-2xl font-bold text-slate-700 mt-1">{metrics.enAttente}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-teal-700 uppercase font-medium">Acceptés</div>
          <div className="text-2xl font-bold text-teal-900 mt-1">{metrics.acceptes}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-amber-700 uppercase font-medium">En Formation</div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{metrics.enFormation}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-blue-700 uppercase font-medium">En Simulation</div>
          <div className="text-2xl font-bold text-blue-900 mt-1">{metrics.enSimulation}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl bg-emerald-50/20">
          <div className="text-[10px] text-emerald-700 uppercase font-medium">En Production</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{metrics.enProduction}</div>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl">
          <div className="text-[10px] text-rose-700 uppercase font-medium">Refusés</div>
          <div className="text-2xl font-bold text-rose-800 mt-1">{metrics.refuses}</div>
        </div>
      </div>

      {/* Conversion Rate Card */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-sm">
              Votre Taux de Conversion vers la Production : {metrics.conversionRate}%
            </div>
            <div className="text-slate-500 mt-0.5">
              Calculé sur vos {metrics.totalFilleuls} filleul(s) au total · Taux d'acceptation initial : {metrics.acceptanceRate}%
            </div>
          </div>
        </div>
      </div>

      {/* List of Filleuls */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Liste de Vos Filleuls ({filteredCandidates.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Suivi transparent de l'avancement de vos filleuls dans les parcours PAWAKO
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher parmi vos filleuls..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 text-slate-900"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="p-1.5 text-xs border border-slate-200 rounded-lg text-slate-800 bg-white"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="ACCEPTE">Accepté</option>
              <option value="EN_FORMATION">En formation</option>
              <option value="EN_SIMULATION">En simulation</option>
              <option value="EN_PRODUCTION">En production</option>
              <option value="REFUSE">Refusé</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Filleul</th>
                <th className="py-3 px-4 font-semibold">Type de VA</th>
                <th className="py-3 px-4 font-semibold">Serveur Actuel</th>
                <th className="py-3 px-4 font-semibold">Statut</th>
                <th className="py-3 px-4 font-semibold">Date d'arrivée</th>
                <th className="py-3 px-4 font-semibold text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 text-xs">
                    {metrics.totalFilleuls === 0
                      ? "Vous n'avez pas encore de filleuls enregistrés. Partagez votre lien personnel d'invitation ci-dessus pour que vos recrues soient automatiquement rattachées à votre compte."
                      : "Aucun filleul trouvé pour les critères de recherche sélectionnés."}
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(candidate => {
                  const badge = getStatusBadgeClasses(candidate.status);
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => onSelectCandidate(candidate.id)}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {candidate.avatar ? (
                            <img
                              src={candidate.avatar}
                              alt={candidate.displayName}
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0">
                              {candidate.displayName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900">
                              {candidate.displayName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              @{candidate.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">
                          {getVaTypeLabel(candidate.vaType)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {getServerLabel(candidate.currentServer)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 text-xs ${badge.text} font-medium`}>
                            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                            {getStatusLabel(candidate.status)}
                          </span>
                          {candidate.status === 'REFUSE' && candidate.refusalReason && (
                            <div className="text-[11px] text-rose-700 font-medium truncate max-w-[200px]" title={`Motif du refus : ${candidate.refusalReason}`}>
                              Motif : {candidate.refusalReason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {formatDate(candidate.arrivalDate)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onSelectCandidate(candidate.id)}
                          className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs transition-colors font-medium"
                        >
                          Voir progression
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
