import React from 'react';
import { OverviewStatistics } from '../types';
import {
  Users,
  UserCheck,
  CheckCircle2,
  XCircle,
  BookOpen,
  PlayCircle,
  TrendingUp,
  Award,
  ArrowRight,
  Server,
  AlertTriangle,
  Layers,
  Sparkles
} from 'lucide-react';
import { getServerLabel } from '../utils/statusUtils';

interface Props {
  stats: OverviewStatistics | null;
  onNavigateToCandidates: (statusFilter?: string, extraParams?: { vaType?: string; hasAnomaly?: boolean }) => void;
  onNavigateToReferrers: () => void;
}

export const DashboardView: React.FC<Props> = ({
  stats,
  onNavigateToCandidates,
  onNavigateToReferrers,
}) => {
  if (!stats) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Chargement des métriques globales...
      </div>
    );
  }

  const { kpis, distribution, topParrains, servers } = stats;

  return (
    <div className="space-y-6">
      {/* Production Banner Summary : Production Globale & Détail des 2 Activités */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h2 className="text-base font-bold text-slate-900">
                Production Globale PAWAKO : {kpis.totalProductionGlobale} agents actifs
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cumul vérifié des agents déployés sur les deux serveurs de production indépendants
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
              <span className="text-blue-700 font-medium">Production VA Chatting :</span>{' '}
              <strong className="text-blue-950 font-bold">{kpis.prodChatting}</strong>
            </div>
            <div className="px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg text-xs">
              <span className="text-pink-700 font-medium">Production VA Instagram :</span>{' '}
              <strong className="text-pink-950 font-bold">{kpis.prodInstagram}</strong>
            </div>
          </div>
        </div>

        {/* Anomalies alert banner if any */}
        {kpis.dossiersAnomalies > 0 && (
          <div
            onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
            className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between cursor-pointer hover:bg-rose-100/60 transition-colors"
          >
            <div className="flex items-center gap-2.5 text-xs text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>{kpis.dossiersAnomalies} dossier(s)</strong> nécessitent une intervention humaine (rôle Discord contradictoire, anomalie d'activité ou rejet non synchronisé).
              </span>
            </div>
            <span className="text-xs font-semibold text-rose-700 underline flex items-center gap-1">
              Examiner les anomalies <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards Grid (Section 8 : tous les indicateurs requis affichés séparément) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {/* 1. Candidats VA Chatting */}
        <div
          onClick={() => onNavigateToCandidates(undefined, { vaType: 'CHATTEUR' })}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
            Candidats Chatting
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {kpis.totalChatteurs}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">VA Chatteurs inscrits</div>
        </div>

        {/* 2. Candidats VA Instagram */}
        <div
          onClick={() => onNavigateToCandidates(undefined, { vaType: 'INSTAGRAM' })}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-pink-700 uppercase tracking-wider">
            Candidats Instagram
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {kpis.totalInstagram}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">VA Instagram inscrits</div>
        </div>

        {/* 3. En formation */}
        <div
          onClick={() => onNavigateToCandidates('EN_FORMATION')}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
            En Formation
          </div>
          <div className="text-xl font-bold text-amber-900 mt-1">
            {kpis.enFormation}
          </div>
          <div className="text-[10px] text-amber-600/70 mt-0.5">Serveur Formation</div>
        </div>

        {/* 4. En simulation */}
        <div
          onClick={() => onNavigateToCandidates('EN_SIMULATION')}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
            En Simulation
          </div>
          <div className="text-xl font-bold text-indigo-900 mt-1">
            {kpis.enSimulation}
          </div>
          <div className="text-[10px] text-indigo-600/70 mt-0.5">Tests conditions réelles</div>
        </div>

        {/* 5. Membres validés */}
        <div
          onClick={() => onNavigateToCandidates('VALIDE')}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-teal-700 uppercase tracking-wider">
            Membres Validés
          </div>
          <div className="text-xl font-bold text-teal-900 mt-1">
            {kpis.valides}
          </div>
          <div className="text-[10px] text-teal-600/70 mt-0.5">Prêts pour production</div>
        </div>

        {/* 6. Production VA Chatting */}
        <div
          onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'CHATTEUR' })}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer bg-blue-50/20"
        >
          <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
            Prod VA Chatting
          </div>
          <div className="text-xl font-bold text-blue-900 mt-1">
            {kpis.prodChatting}
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">Serveur Prod Chatting</div>
        </div>

        {/* 7. Production VA Instagram */}
        <div
          onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'INSTAGRAM' })}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer bg-pink-50/20"
        >
          <div className="text-[11px] font-semibold text-pink-800 uppercase tracking-wider">
            Prod VA Instagram
          </div>
          <div className="text-xl font-bold text-pink-900 mt-1">
            {kpis.prodInstagram}
          </div>
          <div className="text-[10px] text-pink-600 mt-0.5">Serveur Prod Insta</div>
        </div>

        {/* 8. Refusés */}
        <div
          onClick={() => onNavigateToCandidates('REFUSE')}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
            Refusés
          </div>
          <div className="text-xl font-bold text-rose-900 mt-1">
            {kpis.refuses}
          </div>
          <div className="text-[10px] text-rose-600/70 mt-0.5">Motifs consignés</div>
        </div>

        {/* 9. Abandons */}
        <div
          onClick={() => onNavigateToCandidates('ABANDONNE')}
          className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Abandons
          </div>
          <div className="text-xl font-bold text-slate-800 mt-1">
            {kpis.abandonnes}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Désistements</div>
        </div>

        {/* 10. Dossiers nécessitant une intervention */}
        <div
          onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
          className={`p-3.5 bg-white border rounded-xl hover:border-slate-300 transition-colors cursor-pointer ${
            kpis.dossiersAnomalies > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
          }`}
        >
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
            Anomalies
          </div>
          <div className={`text-xl font-bold mt-1 ${kpis.dossiersAnomalies > 0 ? 'text-rose-900' : 'text-slate-800'}`}>
            {kpis.dossiersAnomalies}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">À arbitrer manuellement</div>
        </div>
      </div>

      {/* The 4 Independent Discord Servers Cards */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-900" />
              Architecture des 4 Serveurs Discord Indépendants
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chaque serveur remplit un rôle unique dans l'organisation PAWAKO
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {servers.map(srv => (
            <div
              key={srv.id}
              className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs truncate" title={srv.name}>
                  {srv.name}
                </span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    srv.botConnected ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={srv.botConnected ? 'Bot JARVIS connecté' : 'En attente de connexion'}
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed min-h-[32px]">
                {srv.description}
              </p>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Membres réels :</span>
                <span className="font-bold text-slate-900">{srv.memberCount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Distinct Parcours Funnels (VA Chatting vs VA Instagram) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* VA Chatting Parcours */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h3 className="font-bold text-slate-900 text-sm">Parcours VA Chatting</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cycle obligatoire : Recrutement → Formation → Simulation → Validation → Prod Chatting
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-700">
              {distribution.chatteur.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500 text-[10px] uppercase">Attente</div>
                <div className="font-bold text-slate-800 text-base mt-0.5">
                  {distribution.chatteur.enAttente}
                </div>
              </div>
              <div className="p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg">
                <div className="text-amber-700 text-[10px] uppercase">Formation</div>
                <div className="font-bold text-amber-900 text-base mt-0.5">
                  {distribution.chatteur.enFormation}
                </div>
              </div>
              <div className="p-2.5 bg-indigo-50/50 border border-indigo-200 rounded-lg">
                <div className="text-indigo-700 text-[10px] uppercase">Simulation</div>
                <div className="font-bold text-indigo-900 text-base mt-0.5">
                  {distribution.chatteur.enSimulation}
                </div>
              </div>
              <div className="p-2.5 bg-teal-50/50 border border-teal-200 rounded-lg">
                <div className="text-teal-700 text-[10px] uppercase">Validé</div>
                <div className="font-bold text-teal-900 text-base mt-0.5">
                  {distribution.chatteur.valides}
                </div>
              </div>
              <div className="p-2.5 bg-blue-50 border border-blue-300 rounded-lg">
                <div className="text-blue-700 text-[10px] uppercase font-semibold">Production</div>
                <div className="font-bold text-blue-900 text-base mt-0.5">
                  {distribution.chatteur.enProduction}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Refusés : <strong className="text-rose-700">{distribution.chatteur.refuses}</strong></span>
              <span>Abandons : <strong className="text-slate-700">{distribution.chatteur.abandonnes}</strong></span>
              <span>Taux de conversion : <strong className="text-slate-900">{distribution.chatteur.total > 0 ? Math.round((distribution.chatteur.enProduction / distribution.chatteur.total) * 100) : 0}%</strong></span>
            </div>
          </div>
        </div>

        {/* VA Instagram Parcours */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                <h3 className="font-bold text-slate-900 text-sm">Parcours VA Instagram</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Parcours direct sans formation ni simulation : Recrutement → Acceptation → Prod Instagram
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-700">
              {distribution.instagram.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500 text-[10px] uppercase">En Attente</div>
                <div className="font-bold text-slate-800 text-base mt-0.5">
                  {distribution.instagram.enAttente}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Serveur Recrutement</div>
              </div>
              <div className="p-3 bg-teal-50/50 border border-teal-200 rounded-lg">
                <div className="text-teal-700 text-[10px] uppercase">Accepté</div>
                <div className="font-bold text-teal-900 text-base mt-0.5">
                  {distribution.instagram.acceptes}
                </div>
                <div className="text-[10px] text-teal-600/70 mt-1">Validation pôle</div>
              </div>
              <div className="p-3 bg-pink-50 border border-pink-300 rounded-lg">
                <div className="text-pink-700 text-[10px] uppercase font-semibold">Production Directe</div>
                <div className="font-bold text-pink-900 text-base mt-0.5">
                  {distribution.instagram.enProduction}
                </div>
                <div className="text-[10px] text-pink-600 mt-1">Serveur Prod Instagram</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Refusés : <strong className="text-rose-700">{distribution.instagram.refuses}</strong></span>
              <span>Abandons : <strong className="text-slate-700">{distribution.instagram.abandonnes}</strong></span>
              <span>Taux de conversion : <strong className="text-slate-900">{distribution.instagram.total > 0 ? Math.round((distribution.instagram.enProduction / distribution.instagram.total) * 100) : 0}%</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Referrers Leaderboard */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Classement des Parrains PAWAKO</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Suivi des invitations Discord, compteurs d'usage réels et conversion vers la production
            </p>
          </div>
          <button
            onClick={onNavigateToReferrers}
            className="text-xs font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-1"
          >
            Gérer les parrains <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-semibold">Parrain</th>
                <th className="py-3 px-4 font-semibold">Code Invitation</th>
                <th className="py-3 px-4 font-semibold text-center">Filleuls Inscrits</th>
                <th className="py-3 px-4 font-semibold text-center">En Formation / Simu</th>
                <th className="py-3 px-4 font-semibold text-center">En Production</th>
                <th className="py-3 px-4 font-semibold text-center">Taux Conversion</th>
                <th className="py-3 px-4 font-semibold text-right">Lien Discord</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {topParrains.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    Aucun parrain enregistré pour le moment. Les statistiques s'afficheront dès qu'un parrain sera créé ou qu'un membre rejoindra Discord.
                  </td>
                </tr>
              ) : (
                topParrains.map((parrain, idx) => (
                  <tr key={parrain.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400 w-4">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {parrain.discordDisplayName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            ID: {parrain.discordUserId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                        {parrain.inviteCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">
                      {parrain.totalFilleuls}
                    </td>
                    <td className="py-3 px-4 text-center text-amber-700 font-medium">
                      {(parrain.enFormation || 0) + (parrain.enSimulation || 0)}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-700">
                      {parrain.enProduction}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold text-slate-900">
                        {parrain.conversionRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href={parrain.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-slate-500 hover:text-slate-900 underline font-mono"
                      >
                        {parrain.inviteCode}
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
