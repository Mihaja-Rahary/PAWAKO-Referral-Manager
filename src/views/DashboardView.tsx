import React from 'react';
import { OverviewStatistics } from '../types';
import {
  ArrowRight,
  Server,
  AlertTriangle,
  PieChart,
  Activity,
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
  const pctOfPool = (val: number) =>
    totalCandidatesPool > 0 ? Math.max(val > 0 ? 4 : 0, Math.round((val / totalCandidatesPool) * 100)) : 0;

  const stepBarWidth = (count: number, total: number) => {
    if (total <= 0 || count <= 0) return '0%';
    return `${Math.max(8, Math.round((count / total) * 100))}%`;
  };

  return (
    <div className="space-y-6">
      {/* Production Summary */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
              Production Globale :{' '}
              <span className="tabular-nums font-mono text-violet-700 dark:text-violet-300">
                {kpis.totalProductionGlobale}
              </span>{' '}
              agents actifs
            </h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg text-xs">
              <span className="text-slate-600 dark:text-[#9d93b8] font-medium">VA Chatting :</span>{' '}
              <strong className="text-slate-900 dark:text-[#f4f1fa] font-bold font-mono tabular-nums">
                {kpis.prodChatting}
              </strong>
            </div>
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg text-xs">
              <span className="text-slate-600 dark:text-[#9d93b8] font-medium">VA Instagram :</span>{' '}
              <strong className="text-slate-900 dark:text-[#f4f1fa] font-bold font-mono tabular-nums">
                {kpis.prodInstagram}
              </strong>
            </div>
          </div>
        </div>

        {/* Anomalies alert banner if any */}
        {kpis.dossiersAnomalies > 0 && (
          <div
            onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
            className="mt-4 p-3 bg-rose-50 dark:bg-[#220e1e] border border-rose-200 dark:border-rose-500/30 rounded-lg flex items-center justify-between cursor-pointer hover:bg-rose-100/60 dark:hover:bg-[#2b1226] transition-colors"
          >
            <div className="flex items-center gap-2.5 text-xs text-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <strong className="tabular-nums">{kpis.dossiersAnomalies} dossier(s)</strong> en anomalie à vérifier.
              </span>
            </div>
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline flex items-center gap-1 whitespace-nowrap shrink-0">
              Examiner <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        )}
      </div>

      {/* Visual Analytics Row (PAWAKO Violet/Amethyst/Plum Palette) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Donut: VA Chatting vs VA Instagram */}
        <div className="lg:col-span-5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Répartition des Activités
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
        <div className="lg:col-span-7 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Vue Pipeline Global
            </h3>
            <span className="text-xs font-mono tabular-nums font-semibold text-violet-700 dark:text-violet-300">
              {totalCandidatesPool > 0 ? Math.round((totalProd / totalCandidatesPool) * 100) : 0}% en prod
            </span>
          </div>

          <div className="space-y-3">
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
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-violet-600 dark:bg-violet-500" />
                  <span>Production</span>
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalProd}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-purple-400" />
                  <span>Parcours Actif</span>
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalPipelineActive}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-slate-400 dark:bg-[#6a5b8f]" />
                  <span>Attente / Acc.</span>
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalWaiting}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                  <span className="w-2 h-2 rounded-xs bg-slate-500 dark:bg-[#3a2f54]" />
                  <span>Refus / Abandons</span>
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-0.5">
                  {totalStopped}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid (Unified Aubergine/Obsidian Surfaces) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <div
          onClick={() => onNavigateToCandidates(undefined, { vaType: 'CHATTEUR' })}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            Candidats Chatting
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.totalChatteurs}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates(undefined, { vaType: 'INSTAGRAM' })}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            Candidats Instagram
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.totalInstagram}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('EN_FORMATION')}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            En Formation
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.enFormation}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('EN_SIMULATION')}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            En Simulation
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.enSimulation}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('VALIDE')}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            Membres Validés
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.valides}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'CHATTEUR' })}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-violet-200 dark:border-violet-500/35 rounded-xl hover:border-violet-500 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            Prod VA Chatting
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-violet-800 dark:text-violet-200 mt-1">
            {kpis.prodChatting}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('EN_PRODUCTION', { vaType: 'INSTAGRAM' })}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-violet-200 dark:border-violet-500/35 rounded-xl hover:border-violet-500 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
            Prod VA Instagram
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-violet-800 dark:text-violet-200 mt-1">
            {kpis.prodInstagram}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('REFUSE')}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            Refusés
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.refuses}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates('ABANDONNE')}
          className="p-3.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl hover:border-violet-400/60 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
        >
          <div className="text-[11px] font-semibold text-slate-500 dark:text-[#9d93b8]">
            Abandons
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-[#f4f1fa] mt-1">
            {kpis.abandonnes}
          </div>
        </div>

        <div
          onClick={() => onNavigateToCandidates(undefined, { hasAnomaly: true })}
          className={`p-3.5 border rounded-xl transition-colors cursor-pointer ${
            kpis.dossiersAnomalies > 0
              ? 'bg-rose-50/40 dark:bg-[#220e1e] border-rose-300 dark:border-rose-500/40'
              : 'bg-white dark:bg-[#100b1a] border-slate-200 dark:border-[#241a38] hover:border-violet-400/60 dark:hover:border-violet-500/50'
          }`}
        >
          <div className={`text-[11px] font-semibold ${kpis.dossiersAnomalies > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-[#9d93b8]'}`}>
            Anomalies
          </div>
          <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${kpis.dossiersAnomalies > 0 ? 'text-rose-900 dark:text-rose-200' : 'text-slate-900 dark:text-[#f4f1fa]'}`}>
            {kpis.dossiersAnomalies}
          </div>
        </div>
      </div>

      {/* 4 Discord Servers Compact Status */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-3 transition-colors">
        <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          Serveurs Discord
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
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    srv.botConnected ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-[#3f325c]'
                  }`}
                  title={srv.botConnected ? 'Connecté' : 'En attente'}
                />
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

      {/* Two Distinct Parcours Funnels (VA Chatting vs VA Instagram) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* VA Chatting Parcours */}
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e1530]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-600 shrink-0" />
              <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">Parcours VA Chatting</h3>
            </div>
            <span className="text-xs font-semibold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] shrink-0">
              {distribution.chatteur.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-2.5 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-2.5 bg-violet-50/70 dark:bg-[#1c1330] border border-violet-300 dark:border-violet-500/40 rounded-lg flex flex-col justify-between gap-2">
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
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e1530]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
              <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">Parcours VA Instagram</h3>
            </div>
            <span className="text-xs font-semibold font-mono tabular-nums text-slate-600 dark:text-[#9d93b8] shrink-0">
              {distribution.instagram.total} candidat(s)
            </span>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg flex flex-col justify-between gap-2">
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

              <div className="p-3 bg-violet-50/70 dark:bg-[#1c1330] border border-violet-300 dark:border-violet-500/40 rounded-lg flex flex-col justify-between gap-2">
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

      {/* Top Referrers Leaderboard */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-[#1e1530] flex items-center justify-between gap-4">
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">Classement des Parrains</h3>
          <button
            onClick={onNavigateToReferrers}
            className="text-xs font-semibold text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-violet-200 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gérer les parrains <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
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
                topParrains.map((parrain, idx) => (
                  <tr key={parrain.id} className="hover:bg-slate-50/50 dark:hover:bg-[#171026] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-[#7c7296] w-5">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
                            {parrain.discordDisplayName}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-[#7c7296] font-mono">
                            {parrain.discordUserId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono bg-slate-100 dark:bg-[#191129] text-slate-800 dark:text-violet-200 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-[#2e224a]">
                        {parrain.inviteCode}
                      </span>
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
                      <a
                        href={parrain.inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-slate-500 dark:text-violet-300 hover:text-slate-900 dark:hover:text-white underline font-mono"
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
