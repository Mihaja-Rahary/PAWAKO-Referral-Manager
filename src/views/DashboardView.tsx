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
  MessageSquare,
  Instagram,
  Trophy,
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
      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
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
      <section className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
        <div className="h-1 w-full bg-gradient-to-r from-[#FA4616] via-indigo-500 to-emerald-500" />
        <div className="p-6 sm:p-7 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FA4616] dark:text-orange-400">
                Performance Globale PAWAKO
              </div>
              <div className="flex items-baseline gap-3.5 flex-wrap">
                <span className="text-4xl sm:text-5xl font-extrabold tabular-nums text-slate-950 dark:text-white leading-none">
                  {kpis.totalProductionGlobale}
                </span>
                <div className="space-y-0.5">
                  <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Agents actifs en Production
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Taux de conversion global :{' '}
                    <strong className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {globalProdRate}%
                    </strong>{' '}
                    sur {totalCandidatesPool} candidats suivis
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-side Production Split Bars (Indigo Chatting vs Coral-Orange Instagram) */}
            <div className="w-full lg:w-84 space-y-3 bg-slate-50/90 dark:bg-[#171722] border border-slate-200/80 dark:border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'CHATTEUR' })}
                  className="font-bold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span>VA Chatting :</span>
                  <span className="font-mono tabular-nums">{kpis.prodChatting}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'INSTAGRAM' })}
                  className="font-bold text-[#d9380d] dark:text-orange-300 hover:underline cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-[#FA4616]" />
                  <span>VA Instagram :</span>
                  <span className="font-mono tabular-nums">{kpis.prodInstagram}</span>
                </button>
              </div>

              <div className="h-2.5 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden flex gap-0.5">
                {totalProd > 0 && (
                  <>
                    {kpis.prodChatting > 0 && (
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                        style={{ width: `${prodChattingShare}%` }}
                      />
                    )}
                    {kpis.prodInstagram > 0 && (
                      <div
                        className="h-full bg-gradient-to-r from-[#FA4616] to-rose-500 transition-all"
                        style={{ width: `${prodInstagramShare}%` }}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span>{prodChattingShare}% Chatting</span>
                <span>{prodInstagramShare}% Instagram</span>
              </div>
            </div>
          </div>

          {/* Anomalies alert banner if any */}
          {kpis.dossiersAnomalies > 0 && (
            <div
              onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
              className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-xl flex items-center justify-between cursor-pointer hover:bg-rose-100/70 dark:hover:bg-rose-500/15 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-xs text-rose-900 dark:text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>
                  <strong className="tabular-nums">{kpis.dossiersAnomalies} dossier(s)</strong> en anomalie à vérifier en priorité.
                </span>
              </div>
              <span className="text-xs font-bold text-rose-700 dark:text-rose-300 underline flex items-center gap-1 whitespace-nowrap shrink-0">
                Examiner <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 4 Colorful Master KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateToCandidates(undefined)}
          className="group text-left p-5 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl hover:-translate-y-0.5 hover:border-indigo-400/70 dark:hover:border-indigo-400/50 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="font-bold">Total Candidats</span>
            <span className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold tabular-nums text-slate-950 dark:text-white">
            {totalCandidatesPool}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {kpis.totalChatteurs} Chatting · {kpis.totalInstagram} Instagram
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCandidates('EN_FORMATION')}
          className="group text-left p-5 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl hover:-translate-y-0.5 hover:border-sky-400/70 dark:hover:border-sky-400/50 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="font-bold">Parcours Actif</span>
            <span className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold tabular-nums text-slate-950 dark:text-white">
            {totalPipelineActive}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {kpis.enFormation} form. · {kpis.enSimulation} simu. · {kpis.valides} val.
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToCandidates('EN_PRODUCTION')}
          className="group text-left p-5 bg-white dark:bg-[#111118] border border-emerald-300/80 dark:border-emerald-500/35 rounded-2xl hover:-translate-y-0.5 hover:border-emerald-500 transition-all duration-200 space-y-3 cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
            <span className="font-bold">En Production</span>
            <span className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
            {totalProd}
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 font-mono tabular-nums">
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
              ? 'bg-rose-50/50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/35'
              : 'bg-white dark:bg-[#111118] border-slate-200 dark:border-white/10 hover:border-amber-400/70 dark:hover:border-amber-400/50'
          }`}
        >
          <div
            className={`flex items-center justify-between text-xs ${
              kpis.dossiersAnomalies > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            <span className="font-bold">Vigilance &amp; Sorties</span>
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                kpis.dossiersAnomalies > 0
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div
            className={`text-3xl font-extrabold tabular-nums ${
              kpis.dossiersAnomalies > 0 ? 'text-rose-800 dark:text-rose-200' : 'text-slate-950 dark:text-white'
            }`}
          >
            {kpis.dossiersAnomalies}
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 ml-2">
              anomalie{kpis.dossiersAnomalies > 1 ? 's' : ''}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {kpis.refuses} refusés · {kpis.abandonnes} abandons
          </div>
        </button>
      </section>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Donut: VA Chatting (Indigo) vs VA Instagram (Whop Orange-Coral) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#FA4616]" />
              <span>Répartition des Activités</span>
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
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
                  className="text-slate-100 dark:text-white/10"
                />
                {totalCandidatesPool > 0 && (
                  <>
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="12"
                      strokeDasharray={`${chattingArc} ${circumference}`}
                      strokeLinecap="butt"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      fill="none"
                      stroke="#FA4616"
                      strokeWidth="12"
                      strokeDasharray={`${instagramArc} ${circumference}`}
                      strokeDashoffset={-chattingArc}
                      strokeLinecap="butt"
                    />
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white leading-none">
                  {totalCandidatesPool}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Candidats
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-3 text-xs min-w-0">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 shrink-0" />
                    VA Chatting
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {kpis.totalChatteurs}{' '}
                    <span className="text-slate-400 dark:text-slate-500 font-normal">
                      ({chattingShare}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${chattingShare}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#FA4616] shrink-0" />
                    VA Instagram
                  </span>
                  <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                    {kpis.totalInstagram}{' '}
                    <span className="text-slate-400 dark:text-slate-500 font-normal">
                      ({instagramShare}%)
                    </span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#FA4616] rounded-full transition-all"
                    style={{ width: `${instagramShare}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Health Stacked Overview */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span>Entonnoir Global du Recrutement</span>
            </h3>
            <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
              {globalProdRate}% en prod
            </span>
          </div>

          <div className="space-y-3.5">
            <div className="h-3.5 w-full rounded-lg bg-slate-100 dark:bg-[#181823] overflow-hidden flex gap-0.5 p-0.5">
              {totalCandidatesPool === 0 ? (
                <div className="w-full h-full rounded-md bg-slate-200/70 dark:bg-white/10" />
              ) : (
                <>
                  {totalProd > 0 && (
                    <div
                      title={`Production : ${totalProd}`}
                      className="h-full bg-emerald-500 rounded-l-md transition-all"
                      style={{ width: `${pctOfPool(totalProd)}%` }}
                    />
                  )}
                  {totalPipelineActive > 0 && (
                    <div
                      title={`Parcours Actif : ${totalPipelineActive}`}
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${pctOfPool(totalPipelineActive)}%` }}
                    />
                  )}
                  {totalWaiting > 0 && (
                    <div
                      title={`Attente / Acceptés : ${totalWaiting}`}
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${pctOfPool(totalWaiting)}%` }}
                    />
                  )}
                  {totalStopped > 0 && (
                    <div
                      title={`Refusés / Abandons : ${totalStopped}`}
                      className="h-full bg-rose-500 rounded-r-md transition-all"
                      style={{ width: `${pctOfPool(totalStopped)}%` }}
                    />
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/25">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                  <span>Production</span>
                </div>
                <div className="text-lg font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 mt-0.5">
                  {totalProd}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50/70 dark:bg-sky-500/10 border border-sky-200/80 dark:border-sky-500/25">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  <span className="w-2 h-2 rounded-xs bg-sky-500" />
                  <span>Parcours Actif</span>
                </div>
                <div className="text-lg font-extrabold font-mono tabular-nums text-sky-800 dark:text-sky-200 mt-0.5">
                  {totalPipelineActive}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/25">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  <span className="w-2 h-2 rounded-xs bg-amber-400" />
                  <span>Attente / Acc.</span>
                </div>
                <div className="text-lg font-extrabold font-mono tabular-nums text-amber-900 dark:text-amber-200 mt-0.5">
                  {totalWaiting}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/25">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  <span className="w-2 h-2 rounded-xs bg-rose-500" />
                  <span>Refus / Abandons</span>
                </div>
                <div className="text-lg font-extrabold font-mono tabular-nums text-rose-800 dark:text-rose-200 mt-0.5">
                  {totalStopped}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Distinct Parcours Funnels (VA Chatting Indigo vs VA Instagram Coral-Orange) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* VA Chatting Parcours */}
        <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <span>Parcours VA Chatting</span>
              </h3>
              <span className="text-xs font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-300 shrink-0">
                {distribution.chatteur.total} candidat(s)
              </span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Attente</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.chatteur.enAttente}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: stepBarWidth(distribution.chatteur.enAttente, distribution.chatteur.total) }}
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Formation</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.chatteur.enFormation}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full"
                      style={{ width: stepBarWidth(distribution.chatteur.enFormation, distribution.chatteur.total) }}
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Simulation</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.chatteur.enSimulation}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{ width: stepBarWidth(distribution.chatteur.enSimulation, distribution.chatteur.total) }}
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Validé</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.chatteur.valides}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: stepBarWidth(distribution.chatteur.valides, distribution.chatteur.total) }}
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50/70 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/35 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">Production</div>
                    <div className="font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 text-base mt-0.5">
                      {distribution.chatteur.enProduction}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-emerald-200 dark:bg-emerald-500/20 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: stepBarWidth(distribution.chatteur.enProduction, distribution.chatteur.total) }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <span>
                  Refusés :{' '}
                  <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                    {distribution.chatteur.refuses}
                  </strong>
                </span>
                <span>
                  Abandons :{' '}
                  <strong className="font-mono tabular-nums text-slate-800 dark:text-white">
                    {distribution.chatteur.abandonnes}
                  </strong>
                </span>
                <span>
                  Conversion :{' '}
                  <strong className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                    {distribution.chatteur.total > 0
                      ? Math.round((distribution.chatteur.enProduction / distribution.chatteur.total) * 100)
                      : 0}
                    %
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* VA Instagram Parcours */}
        <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
          <div className="h-1 bg-gradient-to-r from-[#FA4616] to-rose-500" />
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Instagram className="w-4 h-4 text-[#FA4616]" />
                <span>Parcours VA Instagram</span>
              </h3>
              <span className="text-xs font-bold font-mono tabular-nums text-[#d9380d] dark:text-orange-300 shrink-0">
                {distribution.instagram.total} candidat(s)
              </span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="p-3 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">En Attente</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.instagram.enAttente}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{ width: stepBarWidth(distribution.instagram.enAttente, distribution.instagram.total) }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-[#181823] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[10px]">Accepté</div>
                    <div className="font-bold font-mono tabular-nums text-slate-800 dark:text-white text-base mt-0.5">
                      {distribution.instagram.acceptes}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#FA4616] rounded-full"
                      style={{ width: stepBarWidth(distribution.instagram.acceptes, distribution.instagram.total) }}
                    />
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/35 rounded-xl flex flex-col justify-between gap-2">
                  <div>
                    <div className="text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">Production Directe</div>
                    <div className="font-extrabold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 text-base mt-0.5">
                      {distribution.instagram.enProduction}
                    </div>
                  </div>
                  <div className="h-1 w-full rounded-full bg-emerald-200 dark:bg-emerald-500/20 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: stepBarWidth(distribution.instagram.enProduction, distribution.instagram.total) }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                <span>
                  Refusés :{' '}
                  <strong className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                    {distribution.instagram.refuses}
                  </strong>
                </span>
                <span>
                  Abandons :{' '}
                  <strong className="font-mono tabular-nums text-slate-800 dark:text-white">
                    {distribution.instagram.abandonnes}
                  </strong>
                </span>
                <span>
                  Conversion :{' '}
                  <strong className="font-mono tabular-nums text-[#FA4616] dark:text-orange-400">
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
      </div>

      {/* 4 Discord Servers Compact Status */}
      <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl p-5 sm:p-6 space-y-3 transition-colors">
        <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
          <Server className="w-4 h-4 text-[#5865F2]" />
          <span>Serveurs Discord connectés</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {servers.map(srv => (
            <div
              key={srv.id}
              className="p-3.5 bg-slate-50/80 dark:bg-[#181823] border border-slate-200 dark:border-white/10 hover:border-indigo-400/50 rounded-xl space-y-2 text-xs transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 dark:text-white text-xs truncate" title={srv.name}>
                  {srv.name}
                </span>
                <span
                  className={`text-[11px] font-bold shrink-0 ${
                    srv.botConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {srv.botConnected ? 'Actif' : 'En attente'}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Membres :</span>
                <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {srv.memberCount}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Referrers Leaderboard */}
      <div className="bg-white dark:bg-[#111118] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-4">
          <h3 className="font-extrabold text-slate-900 dark:text-white text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Classement des Parrains</span>
          </h3>
          <button
            onClick={onNavigateToReferrers}
            className="text-xs font-bold text-[#FA4616] dark:text-orange-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gérer les parrains <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Leaderboard Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-white/10">
          {topParrains.length === 0 ? (
            <div className="py-8 px-4 text-center text-slate-400 dark:text-slate-500 text-xs">
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
                      <span className="font-mono tabular-nums text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                        #{idx + 1}
                      </span>
                      {parrain.avatar ? (
                        <img
                          src={parrain.avatar}
                          alt={parrain.discordDisplayName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full border border-slate-200 dark:border-white/15 object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {(parrain.discordDisplayName || parrain.discordUsername || 'P').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {parrain.discordDisplayName || parrain.discordUsername}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
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
                        className="font-mono bg-slate-100 dark:bg-white/10 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded text-[11px] border border-slate-200 dark:border-white/10 underline shrink-0"
                      >
                        {parrain.inviteCode}
                      </a>
                    ) : (
                      <span className="font-mono bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-2 py-1 rounded text-[11px] border border-slate-200 dark:border-white/10 shrink-0">
                        Non généré
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 dark:bg-[#181823] border border-slate-100 dark:border-white/10 rounded-lg p-2">
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">Filleuls</div>
                      <div className="font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {parrain.totalFilleuls}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">Form./Simu</div>
                      <div className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {(parrain.enFormation || 0) + (parrain.enSimulation || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">Prod.</div>
                      <div className="font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {parrain.enProduction}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">Conv.</div>
                      <div className="font-semibold font-mono tabular-nums text-slate-900 dark:text-white">
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
            <thead className="bg-slate-50/70 dark:bg-[#181823] text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-white/10">
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
            <tbody className="divide-y divide-slate-100 dark:divide-white/10 text-slate-700 dark:text-slate-300">
              {topParrains.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                    Aucun parrain enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                topParrains.map((parrain, idx) => {
                  const hasValidInvite =
                    Boolean(parrain.inviteUrl && parrain.inviteCode) &&
                    parrain.inviteStatus !== 'EXPIRED_OR_DELETED';

                  return (
                    <tr key={parrain.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono tabular-nums text-[11px] font-bold text-amber-600 dark:text-amber-400 w-5">
                            #{idx + 1}
                          </span>
                          {parrain.avatar ? (
                            <img
                              src={parrain.avatar}
                              alt={parrain.discordDisplayName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full border border-slate-200 dark:border-white/15 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {(parrain.discordDisplayName || parrain.discordUsername || 'P').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                              {parrain.discordDisplayName || parrain.discordUsername}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[220px]">
                              @{parrain.discordUsername}
                              {parrain.vaType ? (
                                <span
                                  className={`font-semibold ${
                                    parrain.vaType === 'INSTAGRAM'
                                      ? 'text-[#d9380d] dark:text-orange-400'
                                      : 'text-indigo-600 dark:text-indigo-400'
                                  }`}
                                >
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
                          <span className="font-mono bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-white/10">
                            {parrain.inviteCode}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {parrain.totalFilleuls}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-600 dark:text-slate-400 font-medium">
                        {(parrain.enFormation || 0) + (parrain.enSimulation || 0)}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {parrain.enProduction}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-gradient-to-r from-[#FA4616] to-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, parrain.conversionRate || 0)}%` }}
                            />
                          </div>
                          <span className="font-semibold font-mono tabular-nums text-slate-900 dark:text-white w-9 text-right">
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
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-mono"
                          >
                            {parrain.inviteCode}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
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
