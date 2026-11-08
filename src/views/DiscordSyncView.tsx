import React, { useState, useEffect } from 'react';
import { DiscordServerInfo } from '../types';
import { api } from '../api';
import { formatDate } from '../utils/statusUtils';
import {
  Server,
  Radio,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Code,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';

interface Props {
  refreshTrigger: number;
  onRefreshAll: () => void;
}

export const DiscordSyncView: React.FC<Props> = ({ refreshTrigger, onRefreshAll }) => {
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
      {/* Overview Discord Architecture */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Architecture & Connexion aux 4 Serveurs Discord PAWAKO
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Discord Gateway → Bot JARVIS → API Centrale PAWAKO → Base de données
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>Passerelle Webhook Active</span>
          </div>
        </div>

        {/* 4 Servers Cards with Real Counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {servers.map(server => (
            <div
              key={server.id}
              className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Serveur #{server.id}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                  <span className={`w-2 h-2 rounded-full ${server.botConnected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {server.botConnected ? 'Bot Connecté' : 'En attente Bot'}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 text-xs">{server.name}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {server.description}
                </p>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  Guild ID : {server.guildId || 'À renseigner dans les variables'}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">Membres réels :</span>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {server.memberCount}
                </span>
              </div>

              <div className="text-[10px] text-slate-400">
                Dernière synchro : {formatDate(server.lastSyncAt)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Gateway Documentation for Bot JARVIS */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Code className="w-4 h-4 text-slate-900" />
              Spécification Webhook pour le Bot Discord JARVIS
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Point d'entrée sécurisé recevant les événements réels transmis par la passerelle JARVIS.
            </p>
          </div>
          <button
            onClick={handleCopyPayload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copier payload JSON</span>
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
            <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">POST</span>
            <span className="text-slate-800 font-semibold">/api/discord/webhook</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">Header : <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">X-JARVIS-Secret: [VOTRE_SECRET]</code></span>
          </div>

          <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto">
            {examplePayload}
          </pre>
        </div>
      </div>

      {/* Integrity & Zero-Fake-Data Safeguards */}
      <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-3 text-slate-600">
        <h4 className="font-bold text-slate-900 flex items-center gap-1.5 text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Règles d'intégrité et garantie des 4 serveurs PAWAKO
        </h4>
        <ul className="list-disc list-inside space-y-1.5 text-[11px] leading-relaxed">
          <li><strong>Indépendance des serveurs :</strong> Recrutement, Formation, Production VA Chatting et Production VA Instagram sont des serveurs étanches avec leurs propres rôles Discord.</li>
          <li><strong>Parcours stricts :</strong> Les VA Instagram ne peuvent jamais être placés en formation ou simulation.</li>
          <li><strong>Priorité des rôles :</strong> Les rôles contradictoires déclenchent une anomalie sans corrompre le statut fiable du dossier.</li>
          <li><strong>Protection des refus :</strong> Un candidat refusé ne peut jamais être réactivé automatiquement par un simple rôle Discord.</li>
          <li><strong>Identifiant unique :</strong> Le Discord User ID fait foi sur les 4 serveurs et conserve l'historique intégral.</li>
        </ul>
      </div>
    </div>
  );
};
