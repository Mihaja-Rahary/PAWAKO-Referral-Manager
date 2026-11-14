import React, { useState, useEffect } from 'react';
import {
  DiscordBotDiscoveryResult,
  DiscordServerInfo,
  DiscordServerType,
  UserRole,
} from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import {
  Radio,
  Code,
  Copy,
  Check,
  RefreshCw,
  Bot,
  Wand2,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Hash,
} from 'lucide-react';

interface Props {
  refreshTrigger: number;
  onRefreshAll: () => void;
  initialServers?: DiscordServerInfo[];
  currentUserRole?: UserRole;
}

export const DiscordSyncView: React.FC<Props> = ({
  refreshTrigger,
  onRefreshAll,
  initialServers,
  currentUserRole = 'ADMINISTRATEUR',
}) => {
  const [servers, setServers] = useState<DiscordServerInfo[]>(initialServers || []);
  const [discovery, setDiscovery] = useState<DiscordBotDiscoveryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false);
  const [isSavingBinding, setIsSavingBinding] = useState<DiscordServerType | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const isAdmin = currentUserRole === 'ADMINISTRATEUR';

  useEffect(() => {
    if (initialServers && initialServers.length > 0) {
      setServers(initialServers);
    }
  }, [initialServers]);

  const fetchDiscovery = async () => {
    try {
      setIsDiscovering(true);
      const res = await api.discoverDiscordBot();
      setDiscovery(res);
    } catch (err: any) {
      console.error('Failed to discover Discord bot environment:', err);
    } finally {
      setIsDiscovering(false);
    }
  };

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
    if (!(initialServers && initialServers.length > 0 && refreshTrigger === 0)) {
      fetchServers();
    }
    fetchDiscovery();
  }, [refreshTrigger]);

  const handleAutoConfigure = async () => {
    try {
      setIsAutoConfiguring(true);
      setActionError(null);
      setActionSuccess(null);
      const res = await api.autoConfigureDiscordBot({
        overwriteExisting: false,
        syncInvites: true,
        syncMembers: true,
      });
      setDiscovery(res.discovery);
      setServers(res.servers);
      const parts = [
        `${res.serversUpdated} serveur(s) relié(s)`,
        `${res.rolesMapped} rôle(s) identifié(s)`,
        `${res.invitesSynced} invitation(s) vérifiée(s)`,
      ];
      if (res.referrerInvitesCreated > 0) {
        parts.push(`${res.referrerInvitesCreated} lien(s) parrain généré(s)`);
      }
      if (res.membersSynced > 0) {
        parts.push(`${res.membersSynced} membre(s) synchronisé(s)`);
      }
      const intentNote = !res.membersAccessible
        ? " Note : activez l'intent « Server Members Intent » sur Discord Developer Portal pour synchroniser les membres existants en masse."
        : '';
      setActionSuccess(`Synchronisation bot terminée : ${parts.join(' · ')}.${intentNote}`);
      onRefreshAll();
    } catch (err: any) {
      setActionError(err?.message || "Impossible d'exécuter l'auto-détection du bot Discord.");
    } finally {
      setIsAutoConfiguring(false);
    }
  };

  const handleBindGuild = async (serverId: DiscordServerType, guildId: string) => {
    const selectedGuild = discovery?.guilds.find(g => g.id === guildId);
    try {
      setIsSavingBinding(serverId);
      setActionError(null);
      setActionSuccess(null);
      const res = await api.updateDiscordServerBindings([
        {
          id: serverId,
          guildId,
          discordGuildName: selectedGuild?.name || null,
          discordIconUrl: selectedGuild?.iconUrl || null,
          inviteChannelId:
            serverId === 'RECRUTEMENT' ? selectedGuild?.suggestedInviteChannelId || null : undefined,
          inviteChannelName:
            serverId === 'RECRUTEMENT' ? selectedGuild?.suggestedInviteChannelName || null : undefined,
          memberCount: selectedGuild?.memberCount ?? 0,
          botConnected: Boolean(guildId),
        },
      ]);
      setServers(res.servers);
      setActionSuccess(
        selectedGuild
          ? `Serveur « ${selectedGuild.name} » relié à ${serverId}.`
          : `Association mise à jour pour ${serverId}.`
      );
      onRefreshAll();
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de la liaison du serveur.');
    } finally {
      setIsSavingBinding(null);
    }
  };

  const handleBindInviteChannel = async (channelId: string) => {
    const recServer = servers.find(s => s.id === 'RECRUTEMENT');
    const recGuild = discovery?.guilds.find(g => g.id === recServer?.guildId);
    const channelObj = recGuild?.channels.find(c => c.id === channelId);
    if (!recServer) return;

    try {
      setIsSavingBinding('RECRUTEMENT');
      setActionError(null);
      const res = await api.updateDiscordServerBindings([
        {
          id: 'RECRUTEMENT',
          guildId: recServer.guildId,
          inviteChannelId: channelId || null,
          inviteChannelName: channelObj?.name || null,
        },
      ]);
      setServers(res.servers);
      setActionSuccess(
        channelObj
          ? `Salon d'invitation défini sur #${channelObj.name}.`
          : "Salon d'invitation réinitialisé (détection auto)."
      );
    } catch (err: any) {
      setActionError(err?.message || "Impossible de mettre à jour le salon d'invitation.");
    } finally {
      setIsSavingBinding(null);
    }
  };

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
      {/* Bot Connection & Auto-Discovery Card */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 space-y-4 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {discovery?.bot?.avatar ? (
              <img
                src={discovery.bot.avatar}
                alt={discovery.bot.displayName}
                className="w-11 h-11 rounded-full border border-violet-500/30 object-cover shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-500/30 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
                  {discovery?.bot ? discovery.bot.displayName : 'Bot Discord PAWAKO'}
                </h2>
                {discovery?.ok ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Connecté · {discovery.guilds.length} serveur(s) détecté(s)
                  </span>
                ) : isDiscovering ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#171026] text-slate-600 dark:text-[#9d93b8]">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Vérification du bot...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                    Non connecté
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9d93b8] mt-0.5">
                {discovery?.bot
                  ? `@${discovery.bot.username} (${discovery.bot.id}) — Détection automatique des serveurs, salons, rôles et invitations.`
                  : discovery?.errorMessage ||
                    'Vérifiez que DISCORD_BOT_TOKEN est configuré dans les secrets du Worker Cloudflare.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={fetchDiscovery}
              disabled={isDiscovering || isAutoConfiguring}
              className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-[#d8d0eb] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] border border-slate-200 dark:border-[#241a38] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
              <span>Scanner</span>
            </button>

            {discovery?.bot?.inviteBotUrl && (
              <a
                href={discovery.bot.inviteBotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/15 hover:bg-violet-100 dark:hover:bg-violet-500/25 border border-violet-200 dark:border-violet-500/30 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Inviter le bot</span>
              </a>
            )}

            {isAdmin && (
              <button
                onClick={handleAutoConfigure}
                disabled={isAutoConfiguring || !discovery?.ok}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAutoConfiguring ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>{isAutoConfiguring ? 'Synchronisation...' : 'Détecter & tout relier'}</span>
              </button>
            )}
          </div>
        </div>

        {actionSuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200 rounded-lg text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {discovery?.ok && discovery.guilds.length === 0 && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-lg text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Le bot n'est présent sur aucun serveur Discord.</strong> Cliquez sur « Inviter le bot »
              ci-dessus pour l'ajouter sur vos serveurs Recrutement, Formation et Production, puis cliquez sur
              « Scanner ».
            </div>
          </div>
        )}
      </div>

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

        {/* 4 Servers Cards with Real Counts & Bot Guild Binding */}
        {isLoading && servers.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-[#9d93b8]">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1.5 text-violet-500" />
            Synchronisation des serveurs...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {servers.map(server => {
              const liveGuild = discovery?.guilds.find(g => g.id === server.guildId);
              const isConnected = Boolean(liveGuild || server.botConnected);
              const displayMemberCount = liveGuild ? liveGuild.memberCount : server.memberCount;

              return (
                <div
                  key={server.id}
                  className="p-4 bg-slate-50/70 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-xl space-y-3 text-xs transition-colors flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#9d93b8] tracking-wider">
                        {server.id}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-[#d8d0eb]">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isConnected ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-[#7c7296]'
                          }`}
                        />
                        {isConnected ? 'Connecté' : 'En attente'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {liveGuild?.iconUrl || server.discordIconUrl ? (
                        <img
                          src={liveGuild?.iconUrl || server.discordIconUrl || ''}
                          alt={liveGuild?.name || server.name}
                          className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-[#241a38]"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs truncate">
                          {liveGuild?.name || server.discordGuildName || server.name}
                        </h3>
                        <div className="text-[10px] text-slate-400 dark:text-[#7c7296] font-mono mt-0.5 break-all">
                          {server.guildId || 'Non configuré'}
                        </div>
                      </div>
                    </div>

                    {isAdmin && discovery?.ok && discovery.guilds.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <select
                          aria-label={`Serveur Discord pour ${server.id}`}
                          value={server.guildId || ''}
                          disabled={isSavingBinding === server.id}
                          onChange={e => handleBindGuild(server.id, e.target.value)}
                          className="w-full text-[11px] p-1.5 border border-slate-200 dark:border-[#241a38] rounded-md bg-white dark:bg-[#100b1a] text-slate-800 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500"
                        >
                          <option value="">-- Sélectionner un serveur --</option>
                          {discovery.guilds.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.memberCount} mbrs)
                            </option>
                          ))}
                        </select>

                        {server.id === 'RECRUTEMENT' && liveGuild && liveGuild.channels.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <select
                              aria-label="Salon d'invitation Recrutement"
                              value={server.inviteChannelId || ''}
                              disabled={isSavingBinding === 'RECRUTEMENT'}
                              onChange={e => handleBindInviteChannel(e.target.value)}
                              className="w-full text-[11px] p-1.5 border border-slate-200 dark:border-[#241a38] rounded-md bg-white dark:bg-[#100b1a] text-slate-800 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              <option value="">Salon auto ({liveGuild.suggestedInviteChannelName || 'défaut'})</option>
                              {liveGuild.channels.map(ch => (
                                <option key={ch.id} value={ch.id}>
                                  #{ch.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#241a38]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-[#9d93b8]">Membres</span>
                      <span className="font-bold text-slate-900 dark:text-[#f4f1fa] font-mono tabular-nums text-sm">
                        {displayMemberCount}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-[#7c7296] font-mono">
                      Synchro : {formatDate(server.lastSyncAt)}
                    </div>
                  </div>
                </div>
              );
            })}
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
            {copiedPayload ? (
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
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
