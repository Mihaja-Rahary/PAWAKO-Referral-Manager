import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import { RefreshCw, Search, AlertCircle } from 'lucide-react';

interface Props {
  refreshTrigger: number;
}

export const AuditLogsView: React.FC<Props> = ({ refreshTrigger }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getAuditLogs(100);
      setLogs(res.auditLogs);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setError(err?.message || "Impossible de charger le journal d'audit.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [refreshTrigger]);

  const filteredLogs = logs.filter(l => {
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.targetId.toLowerCase().includes(q) ||
      JSON.stringify(l.details).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
          Journal d'Audit
        </h2>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#7c7296]" />
          <input
            type="text"
            placeholder="Filtrer les logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full min-h-[38px] pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg text-slate-900 dark:text-[#f4f1fa] bg-white dark:bg-[#08050f] placeholder:text-slate-400 dark:placeholder:text-[#7c7296] focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchLogs}
            className="px-2.5 py-1 bg-rose-600 text-white rounded-md font-semibold shrink-0 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Logs List */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden shadow-xs transition-colors">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-[#241a38]/80 text-xs">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 dark:text-[#9d93b8]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-violet-500" />
              Chargement du journal...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-[#9d93b8]">
              Aucun événement enregistré.
            </div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold bg-slate-100 dark:bg-[#171026] text-slate-800 dark:text-violet-200 px-2 py-0.5 rounded border border-slate-200 dark:border-[#241a38] truncate">
                    {log.action}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-[#9d93b8] shrink-0">
                    {formatDate(log.timestamp)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-[#d8d0eb]">
                  <strong>{log.actorName}</strong> ·{' '}
                  <span className="font-mono text-slate-500 dark:text-[#9d93b8]">
                    {log.targetType}: {log.targetId}
                  </span>
                </div>
                <div className="text-[10px] font-mono bg-slate-50 dark:bg-[#08050f] p-2 rounded border border-slate-100 dark:border-[#241a38] break-all text-slate-600 dark:text-[#d8d0eb]">
                  {JSON.stringify(log.details)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                <th className="py-3 px-4 font-semibold">Date & Heure</th>
                <th className="py-3 px-4 font-semibold">Action</th>
                <th className="py-3 px-4 font-semibold">Acteur</th>
                <th className="py-3 px-4 font-semibold">Cible</th>
                <th className="py-3 px-4 font-semibold">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#241a38]/80 text-slate-700 dark:text-[#d8d0eb]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#9d93b8]">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-1 text-violet-500" />
                    Chargement du journal...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-[#9d93b8]">
                    Aucun événement enregistré.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-[#171026] transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-[#9d93b8] whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] font-semibold bg-slate-100 dark:bg-[#171026] text-slate-800 dark:text-violet-200 px-2 py-0.5 rounded border border-slate-200 dark:border-[#241a38]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900 dark:text-[#f4f1fa]">{log.actorName}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-[#9d93b8]">
                      {log.targetType}: {log.targetId}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-[#d8d0eb] max-w-md">
                      <div className="text-[11px] font-mono bg-slate-50 dark:bg-[#08050f] p-1.5 rounded border border-slate-100 dark:border-[#241a38] break-words">
                        {JSON.stringify(log.details)}
                      </div>
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
