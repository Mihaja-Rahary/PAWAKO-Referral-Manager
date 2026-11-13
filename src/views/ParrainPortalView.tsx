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
import { PawakoLogo } from '../components/PawakoLogo';
import {
  Copy,
  Check,
  TrendingUp,
  Shield,
  Search,
  RefreshCw,
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
  onSelectCandidate: (candidateId: string) => void;
  refreshTrigger: number;
}

export const ParrainPortalView: React.FC<Props> = ({
  currentUserRole: _currentUserRole,
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
        setError(err.message || 'Impossible de charger votre espace parrain.');
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
      <div className="p-12 text-center text-slate-500 dark:text-[#9d93b8] text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
        Chargement...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-md mx-auto bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl text-center space-y-3">
        <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 rounded-full flex items-center justify-center mx-auto">
          <Shield className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-slate-900 dark:text-[#f4f1fa] text-sm">Espace Parrain</h3>
        <p className="text-xs text-slate-500 dark:text-[#9d93b8]">
          {error || 'Aucun profil de parrain associé à ce compte.'}
        </p>
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

  const segmentPct = (value: number) =>
    metrics.totalFilleuls > 0 && value > 0
      ? Math.max(4, Math.round((value / metrics.totalFilleuls) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Parrain Invite Link Card — Simple & Direct */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PawakoLogo size="md" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa]">
                  {referrer.discordDisplayName}
                </h2>
                <span className="text-[11px] bg-slate-100 dark:bg-[#191129] text-slate-700 dark:text-violet-300 font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[#2e224a]">
                  {referrer.inviteCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
                Utilisations du lien : <strong className="font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">{referrer.usesCount}</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={referrer.inviteUrl}
            aria-label="Votre lien d'invitation"
            className="flex-1 text-xs font-mono p-2.5 bg-slate-50 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-900 dark:text-[#f4f1fa] select-all focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shrink-0 whitespace-nowrap cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4" />
                <span>Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copier mon lien</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Total</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.totalFilleuls}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">En attente</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb] mt-1">
            {metrics.enAttente}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Acceptés</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.acceptes}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Formation</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.enFormation}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Simulation</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {metrics.enSimulation}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-violet-300 dark:border-violet-500/40 rounded-xl">
          <div className="text-[11px] text-violet-700 dark:text-violet-300 font-semibold">Production</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300 mt-1">
            {metrics.enProduction}
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl">
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-medium">Refusés</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] mt-1">
            {metrics.refuses}
          </div>
        </div>
      </div>

      {/* Conversion Rate & Harmonized PAWAKO Progression Track */}
      <div className="p-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-4 text-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-[#191129] text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
              Conversion en Production :{' '}
              <span className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
                {metrics.conversionRate}%
              </span>
            </div>
            <div className="text-slate-500 dark:text-[#9d93b8] mt-0.5">
              Acceptation : <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-[#f4f1fa]">{metrics.acceptanceRate}%</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-[#171026] overflow-hidden flex gap-0.5 p-0.5">
            {metrics.totalFilleuls === 0 ? (
              <div className="w-full h-full rounded-full bg-slate-200 dark:bg-[#241a38]" />
            ) : (
              <>
                {metrics.enProduction > 0 && (
                  <div
                    title={`Production : ${metrics.enProduction}`}
                    className="h-full bg-violet-600 dark:bg-violet-500 rounded-l-full"
                    style={{ width: `${segmentPct(metrics.enProduction)}%` }}
                  />
                )}
                {metrics.enSimulation > 0 && (
                  <div
                    title={`Simulation : ${metrics.enSimulation}`}
                    className="h-full bg-purple-400"
                    style={{ width: `${segmentPct(metrics.enSimulation)}%` }}
                  />
                )}
                {metrics.enFormation > 0 && (
                  <div
                    title={`Formation : ${metrics.enFormation}`}
                    className="h-full bg-violet-300 dark:bg-violet-300/80"
                    style={{ width: `${segmentPct(metrics.enFormation)}%` }}
                  />
                )}
                {metrics.acceptes > 0 && (
                  <div
                    title={`Acceptés : ${metrics.acceptes}`}
                    className="h-full bg-emerald-500/80"
                    style={{ width: `${segmentPct(metrics.acceptes)}%` }}
                  />
                )}
                {metrics.enAttente > 0 && (
                  <div
                    title={`En attente : ${metrics.enAttente}`}
                    className="h-full bg-slate-400 dark:bg-[#5c4f7a]"
                    style={{ width: `${segmentPct(metrics.enAttente)}%` }}
                  />
                )}
                {metrics.refuses > 0 && (
                  <div
                    title={`Refusés : ${metrics.refuses}`}
                    className="h-full bg-slate-500 dark:bg-[#362b4d] rounded-r-full"
                    style={{ width: `${segmentPct(metrics.refuses)}%` }}
                  />
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-[#9d93b8]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-violet-600 dark:bg-violet-500" />
              Production (<span className="font-mono tabular-nums">{metrics.enProduction}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-purple-400" />
              Simulation (<span className="font-mono tabular-nums">{metrics.enSimulation}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-violet-300 dark:bg-violet-300/80" />
              Formation (<span className="font-mono tabular-nums">{metrics.enFormation}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-emerald-500/80" />
              Acceptés (<span className="font-mono tabular-nums">{metrics.acceptes}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-slate-400 dark:bg-[#5c4f7a]" />
              Attente (<span className="font-mono tabular-nums">{metrics.enAttente}</span>)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-xs bg-slate-500 dark:bg-[#362b4d]" />
              Refusés (<span className="font-mono tabular-nums">{metrics.refuses}</span>)
            </span>
          </div>
        </div>
      </div>

      {/* List of Filleuls */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden transition-colors">
        <div className="p-4 border-b border-slate-100 dark:border-[#1e1530] flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
            Filleuls (<span className="font-mono tabular-nums">{filteredCandidates.length}</span>)
          </h3>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-500 text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#171026] placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="p-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-800 dark:text-[#e9e5f5] bg-white dark:bg-[#171026] focus:outline-none focus:ring-1 focus:ring-violet-500"
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
            <thead className="bg-slate-50 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                <th className="py-3 px-4 font-semibold">Filleul</th>
                <th className="py-3 px-4 font-semibold">Activité</th>
                <th className="py-3 px-4 font-semibold">Serveur</th>
                <th className="py-3 px-4 font-semibold">Statut</th>
                <th className="py-3 px-4 font-semibold">Arrivée</th>
                <th className="py-3 px-4 font-semibold text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530] text-slate-700 dark:text-[#d8d0eb]">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-[#9d93b8] text-xs">
                    {metrics.totalFilleuls === 0
                      ? 'Aucun filleul enregistré pour le moment.'
                      : 'Aucun filleul trouvé.'}
                  </td>
                </tr>
              ) : (
                filteredCandidates.map(candidate => {
                  const badge = getStatusBadgeClasses(candidate.status);
                  return (
                    <tr
                      key={candidate.id}
                      onClick={() => onSelectCandidate(candidate.id)}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#171026] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {candidate.avatar ? (
                            <img
                              src={candidate.avatar}
                              alt={candidate.displayName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-[#2e224a] shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-[#1d1430] flex items-center justify-center font-bold text-slate-700 dark:text-[#f4f1fa] text-xs shrink-0">
                              {candidate.displayName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                              {candidate.displayName}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">
                              @{candidate.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 dark:text-[#e9e5f5]">
                          {getVaTypeLabel(candidate.vaType)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-[#9d93b8]">
                        {getServerLabel(candidate.currentServer)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs ${badge.text} font-medium`}>
                          <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                          {getStatusLabel(candidate.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-[#9d93b8] font-mono text-[11px]">
                        {formatDate(candidate.arrivalDate)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectCandidate(candidate.id);
                          }}
                          className="px-2 py-1 text-slate-600 dark:text-violet-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#231839] rounded text-xs transition-colors font-medium whitespace-nowrap"
                        >
                          Voir
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
