import React from 'react';
import { OverviewStatistics } from '../types';
import { getVaTypeLabel } from '../utils/statusUtils';
import {
  ArrowRight,
  Server,
  AlertTriangle,
  PieChart,
  Activity,
  Users,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';

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
      <div className="p-8 text-center text-slate-500 dark:text-[#9d93b8] text-sm">
        Chargement des données...
      </div>
    );
  }

  const { kpis, distribution, topParrains, servers } = stats;

  const totalCandidatesPool = kpis.totalChatteurs + kpis.totalInstagram;
  const chattingShare = totalCandidatesPool > 0 ? Math.round((kpis.totalChatteurs / totalCandidatesPool) * 100) : 0;
  const instagramShare = totalCandidatesPool > 0 ? 100 - chattingShare : 0;

  // SVG Donut Geometry (r = 44 => circumference ≈ 276.46)
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const chattingArc = totalCandidatesPool > 0 ? (kpis.totalChatteurs / totalCandidatesPool) * circumference : 0;
  const instagramArc = totalCandidatesPool > 0 ? (kpis.totalInstagram / totalCandidatesPool) * circumference : 0;

  const totalProd = kpis.totalProductionGlobale;
  const totalPipelineActive = kpis.enFormation + kpis.enSimulation + kpis.valides;
  const totalStopped = kpis.refuses + kpis.abandonnes;
  const totalWaiting = Math.max(0, totalCandidatesPool - totalProd - totalPipelineActive - totalStopped);
  const globalProdRate = totalCandidatesPool > 0 ? Math.round((totalProd / totalCandidatesPool) * 100) : 0;

  const prodChattingShare = totalProd > 0 ? Math.round((kpis.prodChatting / totalProd) * 100) : 0;
  const prodInstagramShare = totalProd > 0 ? 100 - prodChattingShare : 0;

  const pctOfPool = (val: number) =>
    totalCandidatesPool > 0 ? Math.max(val > 0 ? 4 : 0, Math.round((val / totalCandidatesPool) * 100)) : 0;

  const stepBarWidth = (count: number, total: number) => {
    if (total <= 0 || count <= 0) return '0%';
    return `${Math.max(8, Math.round((count / total) * 100))}%`;
  };

  return (
    <div className="space-y-6">
      {/* Executive Focal Command Header */}
      <section className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-6 sm:p-7 space-y-5 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
              Performance Globale PAWAKO
            </div>
            <div className="flex items-baseline gap-3.5 flex-wrap">
              <span className="font-serif text-4xl sm:text-5xl font-bold tabular-nums text-slate-950 dark:text-[#f8f6fc] leading-none">
                {kpis.totalProductionGlobale}
              </span>
              <div className="space-y-0.5">
                <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f1fa]">
                  Agents actifs en Production
                </div>
                <div className="text-xs text-slate-500 dark:text-[#9d93b8]">
                  Taux de conversion global :{' '}
                  <strong className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
                    {globalProdRate}%
                  </strong>{' '}
                  sur {totalCandidatesPool} candidats suivis
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-side Production Split Bars */}
          <div className="w-full lg:w-80 space-y-3 bg-slate-50/80 dark:bg-[#150e24] border border-slate-200/80 dark:border-[#241a38] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'CHATTEUR' })}
                className="font-semibold text-slate-800 dark:text-[#e9e5f5] hover:text-violet-600 dark:hover:text-violet-300 cursor-pointer transition-colors"
              >
                VA Chatting :{' '}
                <span className="font-mono tabular-nums font-bold">{kpis.prodChatting}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'INSTAGRAM' })}
                className="font-semibold text-slate-800 dark:text-[#e9e5f5] hover:text-violet-600 dark:hover:text-violet-300 cursor-pointer transition-colors"
              >
                VA Instagram :{' '}
                <span className="font-mono tabular-nums font-bold">{kpis.prodInstagram}</span>
              </button>
            </div>

            <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden flex gap-0.5">
              {totalProd > 0 && (
                <>
                  {kpis.prodChatting > 0 && (
                    <div
                      className="h-full bg-violet-600 dark:bg-violet-500 transition-all"
                      style={{ width: `${prodChattingShare}%` }}
                    />
                  )}
                  {kpis.prodInstagram > 0 && (
                    <div
                      className="h-full bg-purple-400 transition-all"
                      style={{ width: `${prodInstagramShare}%` }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#9d93b8]">
              <span>{prodChattingShare}% Chatting</span>
              <span>{prodInstagramShare}% Instagram</span>
            </div>
          </div>
        </div>

        {/* Anomalies alert banner if any */}
        {kpis.dossiersAnomalies > 0 && (
          <div
            onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
            className="p-3.5 bg-rose-50 dark:bg-[#220e1e] border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center justify-between cursor-pointer hover:bg-rose-100/70 dark:hover:bg-[#2b1226] transition-colors"
          >
            <div className="flex items-center gap-2.5 text-xs text-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <strong className="tabular-nums">{kpis.dossiersAnomalies} dossier(s)</strong> en anomalie à vérifier en priorité.
              </span>
            </div>
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline flex items-center gap-1 whitespace-nowrap shrink-0">
              Examiner <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        )}
      </section>

      {/* 4 Master KPI Cards (High Signal, Low Clutter) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateToCandidates(undefined)}
          className="group text-left p-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl hover:-translate-y-0.5 hover:border-violet-400/70 dark:hover:border-violet-500/50 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9d93b8]">
            <span className="font-semibold">Total Candidats</span>
            <Users className="w-4 h-4 text-slate-400 dark:text-[#7c7296] group-hover:text-violet-500 transition-colors" />
          </div>
          <div className="font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-[#f8f6fc]">
            {totalCandidatesPool}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
            {kpis.totalChatteurs} Chatting · {kpis.totalInstagram} Instagram
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCandidates('EN_FORMATION')}
          className="group text-left p-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl hover:-translate-y-0.5 hover:border-violet-400/70 dark:hover:border-violet-500/50 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9d93b8]">
            <span className="font-semibold">Parcours Actif</span>
            <Sparkles className="w-4 h-4 text-slate-400 dark:text-[#7c7296] group-hover:text-violet-500 transition-colors" />
          </div>
          <div className="font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-[#f8f6fc]">
            {totalPipelineActive}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
            {kpis.enFormation} form. · {kpis.enSimulation} simu. · {kpis.valides} val.
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCandidates('EN_PRODUCTION')}
          className="group text-left p-5 bg-white dark:bg-[#100b1a] border border-violet-300/80 dark:border-violet-500/40 rounded-2xl hover:-translate-y-0.5 hover:border-violet-500 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-violet-700 dark:text-violet-300">
            <span className="font-semibold">En Production</span>
            <CheckCircle2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="font-serif text-3xl font-bold tabular-nums text-violet-800 dark:text-violet-200">
            {totalProd}
          </div>
          <div className="text-[11px] text-violet-700/80 dark:text-violet-300/80 font-mono tabular-nums">
            {globalProdRate}% de conversion finale
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            kpis.dossiersAnomalies > 0
              ? onNavigateToCandidates(undefined, { hasAnomaly: true })
              : onNavigateToCandidates('REFUSE')
          }
          className={`group text-left p-5 border rounded-2xl hover:-translate-y-0.5 transition-all duration-200 space-y-3 cursor-pointer ${
            kpis.dossiersAnomalies > 0
              ? 'bg-rose-50/40 dark:bg-[#220e1e] border-rose-300 dark:border-rose-500/40'
              : 'bg-white dark:bg-[#100b1a] border-slate-200 dark:border-[#241a38] hover:border-violet-400/70 dark:hover:border-violet-500/50'
          }`}
        >
          <div
            className={`flex items-center justify-between text-xs ${
              kpis.dossiersAnomalies > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-[#9d93b8]'
            }`}
          >
            <span className="font-semibold">Vigilance &amp; Sorties</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                kpis.dossiersAnomalies > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-400 dark:text-[#7c7296]'
              }`}
            />
          </div>
          <div
            className={`font-serif text-3xl font-bold tabular-nums ${
              kpis.dossiersAnomalies > 0 ? 'text-rose-900 dark:text-rose-200' : 'text-slate-950 dark:text-[#f8f6fc]'
            }`}
          >
            {kpis.dossiersAnomalies}
            <span className="text-xs font-sans font-medium text-slate-400 dark:text-[#7c7296] ml-2">
              anomalie{kpis.dossiersAnomalies > 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-[#9d93b8] font-mono tabular-nums">
            {kpis.refuses} refusés · {kpis.abandonnes} abandons
          </div>
        </button>
      </section>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Donut: VA Chatting vs VA Instagram */}
        <div className="lg:col-span-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Répartition des Activités</span>
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-[#9d93b8]">
              {totalCandidatesPool} total
            </span>
          </div>

          <div className="flex items-center gap-6 py-1">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 112 112" className="w-full h-full -rotate-90" aria-label="Répartition VA Chatting et VA Instagram">
                <circle
                  cx="56"
                  cy="56"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-slate-100 dark:text-[#1d1430]"
                />
                {totalCandidatesPool > 0 && (
                  <>
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="12"
                      strokeDasharray={`${chattingArc} ${circumference}`}
                      strokeLinecap="butt"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="12"
                      strokeDasharray={`${instagramArc} ${circumference}`}
                      strokeDashoffset={-chattingArc}
                      strokeLinecap="butt"
                    />
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] leading-none">
                  {totalCandidatesPool}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#9d93b8] mt-1">
                  Candidats
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-3 text-xs min-w-0">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9e5f5]">
                    <span className="w-2.5 h-2.5 rounded-xs bg-violet-600 shrink-0" />
                    VA Chatting
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-[#f4f1fa]">
                    {kpis.totalChatteurs}{' '}
                    <span className="text-slate-400 dark:text-[#7c7296] font-normal">
                      ({chattingShare}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1d1430] overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full transition-all"
                    style={{ width: `${chattingShare}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-[#e9e5f5]">
                    <span className="w-2.5 h-2.5 rounded-xs bg-purple-400 shrink-0" />
                    VA Instagram
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-[#f4f1fa]">
                    {kpis.totalInstagram}{' '}
                    <span className="text-slate-400 dark:text-[#7c7296] font-normal">
                      ({instagramShare}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1d1430] overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full transition-all"
                    style={{ width: `${instagramShare}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Health Stacked Overview */}
        <div className="lg:col-span-7 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Entonnoir Global du Recrutement</span>
            </h3>
            <span className="text-xs font-mono tabular-nums font-semibold text-violet-700 dark:text-violet-300">
              {globalProdRate}% en prod
            </span>
          </div>

          <div className="space-y-3.5">
            <div className="h-3.5 w-full rounded-lg bg-slate-100 dark:bg-[#171026] overflow-hidden flex gap-0.5 p-0.5">
              {totalCandidatesPool === 0 ? (
                <div className="w-full h-full rounded-md bg-slate-200/70 dark:bg-[#241a38]" />
              ) : (
                <>
                  {totalProd > 0 && (
                    <div
                      title={`Production : ${totalProd}`}
                      className="h-full bg-violet-600 dark:bg-violet-500 rounded-l-md transition-all"
                      style={{ width: `${pctOfPool(totalProd)}%` }}
                    />
                  )}
                  {totalPipelineActive > 0 && (
                    <div
                      title={`Parcours Actif : ${totalPipelineActive}`}
                      className="h-full bg-purple-400 transition-all"
                      style={{ width: `${pctOfPool(totalPipelineActive)}%` }}
                    />
                  )}
                  {totalWaiting > 0 && (
                    <div
                      title={`Attente / Acceptés : ${totalWaiting}`}
                      className="h-full bg-slate-400 dark:bg-[#6a5b8f] transition-all"
                      style={{ width: `${pctOfPool(totalWaiting)}%` }}
                    />
                  )}
                  {totalStopped > 0 && (
                    <div
                      title={`Refusés / Abandons : ${totalStopped}`}
                      className="h-full bg-slate-500 dark:bg-[#3a2f54] rounded-r-md transition-all"
                      style={{ width: `${pctOfPool(totalStopped)}%` }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-violet-600 dark:bg-violet-500" />
                  <span>Production</span>
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalProd}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-purple-400" />
                  <span>Parcours Actif</span>
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalPipelineActive}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-slate-400 dark:bg-[#6a5b8f]" />
                  <span>Attente / Acc.</span>
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalWaiting}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-slate-500 dark:bg-[#3a2f54]" />
                  <span>Refus / Abandons</span>
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalStopped}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Distinct Parcours Funnels (VA Chatting vs VA Instagram) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* VA Chatting Parcours */}
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e1530]">
            <h3 className="font-serif font-bold text-slate-900 dark:text-[#f4f1fa] text-base">
              Parcours VA Chatting
            </h3>
            <span className="text-xs font-semibold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] shrink-0">
              {distribution.chatteur.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">Attente</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.chatteur.enAttente}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-slate-500 dark:bg-[#6a5b8f] rounded-full"
                    style={{ width: stepBarWidth(distribution.chatteur.enAttente, distribution.chatteur.total) }}
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">Formation</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.chatteur.enFormation}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-violet-400 rounded-full"
                    style={{ width: stepBarWidth(distribution.chatteur.enFormation, distribution.chatteur.total) }}
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">Simulation</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.chatteur.enSimulation}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full"
                    style={{ width: stepBarWidth(distribution.chatteur.enSimulation, distribution.chatteur.total) }}
                  />
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">Validé</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.chatteur.valides}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full"
                    style={{ width: stepBarWidth(distribution.chatteur.valides, distribution.chatteur.total) }}
                  />
                </div>
              </div>

              <div className="p-2.5 bg-violet-50/70 dark:bg-[#1c1330] border border-violet-300 dark:border-violet-500/40 rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-violet-700 dark:text-violet-300 text-[10px] font-semibold">Production</div>
                  <div className="font-bold font-mono tabular-nums text-violet-900 dark:text-violet-200 text-base mt-0.5">
                    {distribution.chatteur.enProduction}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-violet-200 dark:bg-violet-500/20 overflow-hidden">
                  <div
                    className="h-full bg-violet-600 dark:bg-violet-500 rounded-full"
                    style={{ width: stepBarWidth(distribution.chatteur.enProduction, distribution.chatteur.total) }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9d93b8] pt-1">
              <span>
                Refusés :{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                  {distribution.chatteur.refuses}
                </strong>
              </span>
              <span>
                Abandons :{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                  {distribution.chatteur.abandonnes}
                </strong>
              </span>
              <span>
                Conversion :{' '}
                <strong className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
                  {distribution.chatteur.total > 0
                    ? Math.round((distribution.chatteur.enProduction / distribution.chatteur.total) * 100)
                    : 0}
                  %
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* VA Instagram Parcours */}
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e1530]">
            <h3 className="font-serif font-bold text-slate-900 dark:text-[#f4f1fa] text-base">
              Parcours VA Instagram
            </h3>
            <span className="text-xs font-semibold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] shrink-0">
              {distribution.instagram.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">En Attente</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.instagram.enAttente}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-slate-500 dark:bg-[#6a5b8f] rounded-full"
                    style={{ width: stepBarWidth(distribution.instagram.enAttente, distribution.instagram.total) }}
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-slate-500 dark:text-[#9d93b8] text-[10px]">Accepté</div>
                  <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa] text-base mt-0.5">
                    {distribution.instagram.acceptes}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-[#241a38] overflow-hidden">
                  <div
                    className="h-full bg-violet-400 rounded-full"
                    style={{ width: stepBarWidth(distribution.instagram.acceptes, distribution.instagram.total) }}
                  />
                </div>
              </div>

              <div className="p-3 bg-violet-50/70 dark:bg-[#1c1330] border border-violet-300 dark:border-violet-500/40 rounded-xl flex flex-col justify-between gap-2">
                <div>
                  <div className="text-violet-700 dark:text-violet-300 text-[10px] font-semibold">Production Directe</div>
                  <div className="font-bold font-mono tabular-nums text-violet-900 dark:text-violet-200 text-base mt-0.5">
                    {distribution.instagram.enProduction}
                  </div>
                </div>
                <div className="h-1 w-full rounded-full bg-violet-200 dark:bg-violet-500/20 overflow-hidden">
                  <div
                    className="h-full bg-purple-400 rounded-full"
                    style={{ width: stepBarWidth(distribution.instagram.enProduction, distribution.instagram.total) }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9d93b8] pt-1">
              <span>
                Refusés :{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                  {distribution.instagram.refuses}
                </strong>
              </span>
              <span>
                Abandons :{' '}
                <strong className="font-mono tabular-nums text-slate-800 dark:text-[#f4f1fa]">
                  {distribution.instagram.abandonnes}
                </strong>
              </span>
              <span>
                Conversion :{' '}
                <strong className="font-mono tabular-nums text-violet-700 dark:text-violet-300">
                  {distribution.instagram.total > 0
                    ? Math.round((distribution.instagram.enProduction / distribution.instagram.total) * 100)
                    : 0}
                  %
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Discord Servers Compact Status */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-3 transition-colors">
        <h3 className="font-serif font-bold text-slate-900 dark:text-[#f4f1fa] text-base flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span>Serveurs Discord connectés</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {servers.map(srv => (
            <div
              key={srv.id}
              className="p-3.5 bg-slate-50/70 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-2 text-xs transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs truncate" title={srv.name}>
                  {srv.name}
                </span>
                <span
                  className={`text-[11px] font-medium shrink-0 ${
                    srv.botConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-[#7c7296]'
                  }`}
                >
                  {srv.botConnected ? 'Actif' : 'En attente'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-[#241a38] flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-[#9d93b8]">Membres :</span>
                <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                  {srv.memberCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Referrers Leaderboard */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl overflow-hidden transition-colors">
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-[#1e1530] flex items-center justify-between gap-4">
          <h3 className="font-serif font-bold text-slate-900 dark:text-[#f4f1fa] text-base">
            Classement des Parrains
          </h3>
          <button
            onClick={onNavigateToReferrers}
            className="text-xs font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-violet-200 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gérer les parrains <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Leaderboard Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-[#1e1530]">
          {topParrains.length === 0 ? (
            <div className="py-8 px-4 text-center text-slate-400 dark:text-[#7c7296] text-xs">
              Aucun parrain enregistré pour le moment.
            </div>
          ) : (
            topParrains.map((parrain, idx) => {
              const hasValidInvite =
                Boolean(parrain.inviteUrl && parrain.inviteCode) &&
                parrain.inviteStatus !== 'EXPIRED_OR_DELETED';

              return (
                <div key={parrain.id} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-[#7c7296] shrink-0">
                        #{idx + 1}
                      </span>
                      {parrain.avatar ? (
                        <img
                          src={parrain.avatar}
                          alt={parrain.discordDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-violet-600/15 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {(parrain.discordDisplayName || parrain.discordUsername || 'P').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate">
                          {parrain.discordDisplayName || parrain.discordUsername}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-[#7c7296] truncate">
                          @{parrain.discordUsername}
                          {parrain.vaType ? ` · ${getVaTypeLabel(parrain.vaType)}` : ''}
                        </div>
                      </div>
                    </div>

                    {hasValidInvite ? (
                      <a
                        href={parrain.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono bg-slate-100 dark:bg-[#191129] text-violet-700 dark:text-violet-300 px-2 py-1 rounded text-[11px] border border-slate-200 dark:border-[#2e224a] underline shrink-0"
                      >
                        {parrain.inviteCode}
                      </a>
                    ) : (
                      <span className="font-mono bg-slate-100 dark:bg-[#191129] text-slate-500 dark:text-[#9d93b8] px-2 py-1 rounded text-[11px] border border-slate-200 dark:border-[#2e224a] shrink-0">
                        Non généré
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 dark:bg-[#171026] border border-slate-100 dark:border-[#241a38] rounded-lg p-2">
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">Filleuls</div>
                      <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                        {parrain.totalFilleuls}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">Form./Simu</div>
                      <div className="font-mono tabular-nums text-slate-700 dark:text-[#d8d0eb]">
                        {(parrain.enFormation || 0) + (parrain.enSimulation || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">Prod.</div>
                      <div className="font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300">
                        {parrain.enProduction}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-[#7c7296]">Conv.</div>
                      <div className="font-semibold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                        {parrain.conversionRate || 0}%
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Leaderboard Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                <th className="py-3 px-4 font-semibold">Parrain</th>
                <th className="py-3 px-4 font-semibold">Code</th>
                <th className="py-3 px-4 font-semibold text-center">Filleuls</th>
                <th className="py-3 px-4 font-semibold text-center">Formation / Simu</th>
                <th className="py-3 px-4 font-semibold text-center">Production</th>
                <th className="py-3 px-4 font-semibold text-center">Conversion</th>
                <th className="py-3 px-4 font-semibold text-right">Lien</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530] text-slate-700 dark:text-[#d8d0eb]">
              {topParrains.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-[#7c7296] text-xs">
                    Aucun parrain enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                topParrains.map((parrain, idx) => {
                  const hasValidInvite =
                    Boolean(parrain.inviteUrl && parrain.inviteCode) &&
                    parrain.inviteStatus !== 'EXPIRED_OR_DELETED';

                  return (
                    <tr key={parrain.id} className="hover:bg-slate-50/50 dark:hover:bg-[#171026] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-[#7c7296] w-5">
                            #{idx + 1}
                          </span>
                          {parrain.avatar ? (
                            <img
                              src={parrain.avatar}
                              alt={parrain.discordDisplayName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full border border-slate-200 dark:border-[#2e224a] object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-violet-600/15 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {(parrain.discordDisplayName || parrain.discordUsername || 'P').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-[#f4f1fa] truncate max-w-[180px]">
                              {parrain.discordDisplayName || parrain.discordUsername}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-[#7c7296] truncate max-w-[220px]">
                              @{parrain.discordUsername}
                              {parrain.vaType ? (
                                <span className="text-violet-600 dark:text-violet-300 font-medium">
                                  {' '}· {getVaTypeLabel(parrain.vaType)}
                                </span>
                              ) : (
                                ' · Spécialité non choisie'
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {parrain.inviteCode ? (
                          <span className="font-mono bg-slate-100 dark:bg-[#191129] text-slate-800 dark:text-violet-200 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-[#2e224a]">
                            {parrain.inviteCode}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-[#7c7296]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa]">
                        {parrain.totalFilleuls}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] font-medium">
                        {(parrain.enFormation || 0) + (parrain.enSimulation || 0)}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono tabular-nums text-violet-700 dark:text-violet-300">
                        {parrain.enProduction}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-[#1d1430] overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-violet-600 dark:bg-violet-500 rounded-full"
                              style={{ width: `${Math.min(100, parrain.conversionRate || 0)}%` }}
                            />
                          </div>
                          <span className="font-semibold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] w-9 text-right">
                            {parrain.conversionRate || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {hasValidInvite ? (
                          <a
                            href={parrain.inviteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-slate-500 dark:text-violet-300 hover:text-slate-900 dark:hover:text-white underline font-mono"
                          >
                            {parrain.inviteCode}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-[#7c7296]">
                            Non généré
                          </span>
                        )}
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
