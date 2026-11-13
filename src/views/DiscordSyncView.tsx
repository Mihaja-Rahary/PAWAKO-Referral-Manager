import React, { useState, useEffect } from 'react';
import { DiscordServerInfo } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import {
  Radio,
  Code,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';

interface Props {
  refreshTrigger: number;
  onRefreshAll: () => void;
}

export const DiscordSyncView: React.FC<Props> = ({ refreshTrigger }) => {
  const [servers, setServers] = useState<DiscordServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const fetchServers = async () => {
    try {
      setIsLoading(true);
      const srvRes = await api.getDiscordServers();
      setServers(srvRes.servers);
    } catch (err) {
      console.error('Failed to load Discord servers info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [refreshTrigger]);

  const examplePayload = JSON.stringify(
    {
      eventId: 'evt_discord_guild_member_update_991823',
      eventType: 'GUILD_MEMBER_UPDATE',
      guildId: servers.find(s => s.id === 'FORMATION')?.guildId || '120000000000000002',
      user: {
        id: '285493021948502016',
        username: 'agent_pawako',
        global_name: 'Alex Dupont',
        avatar: 'a_1234567890abcdef',
      },
      roles: ['120987654321098765'],
      timestamp: '2026-11-08T12:00:00.000Z',
    },
    null,
    2
  );

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(examplePayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 4 Discord Servers Overview */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
            Serveurs Discord
          </h2>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-[#171026] px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 shrink-0">
            <Radio className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Passerelle Active</span>
          </div>
        </div>

        {/* 4 Servers Cards with Real Counts */}
        {isLoading && servers.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-[#9d93b8]">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1.5 text-violet-500" />
            Synchronisation des serveurs...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {servers.map(server => (
              <div
                key={server.id}
                className="p-4 bg-slate-50/70 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3 text-xs transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#9d93b8] tracking-wider">
                    {server.id}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-[#d8d0eb]">
                    <span className={`w-2 h-2 rounded-full ${server.botConnected ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-[#7c7296]'}`} />
                    {server.botConnected ? 'Connecté' : 'En attente'}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs">{server.name}</h3>
                  <div className="text-[10px] text-slate-400 dark:text-[#7c7296] font-mono mt-1 break-all">
                    {server.guildId || 'Non configuré'}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-[#241a38] flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-[#9d93b8]">Membres</span>
                  <span className="font-bold text-slate-900 dark:text-[#f4f1fa] font-mono tabular-nums text-sm">
                    {server.memberCount}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 dark:text-[#7c7296] font-mono">
                  Synchro : {formatDate(server.lastSyncAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook Endpoint Reference */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm flex items-center gap-2">
            <Code className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            Webhook Discord
          </h3>
          <button
            onClick={handleCopyPayload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-[#f4f1fa] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] border border-transparent dark:border-[#241a38] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copier JSON</span>
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
            <span className="bg-violet-100 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300 font-bold px-2 py-0.5 rounded">
              POST
            </span>
            <span className="text-slate-800 dark:text-[#f4f1fa] font-semibold">/api/discord/webhook</span>
            <span className="text-slate-400 dark:text-[#7c7296]">|</span>
            <span className="text-slate-500 dark:text-[#9d93b8]">
              Header :{' '}
              <code className="bg-slate-100 dark:bg-[#171026] px-1.5 py-0.5 rounded text-slate-800 dark:text-[#d8d0eb] border border-transparent dark:border-[#241a38]">
                X-JARVIS-Secret
              </code>
            </span>
          </div>

          <pre className="p-3.5 bg-slate-900 dark:bg-[#08050f] border border-slate-800 dark:border-[#241a38] text-slate-100 dark:text-[#d8d0eb] rounded-lg text-[11px] font-mono overflow-x-auto">
            {examplePayload}
          </pre>
        </div>
      </div>
    </div>
  );
};
