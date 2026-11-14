import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  DiscordBotDiscoveryResult,
  DiscordRoleMapping,
  DiscordServerType,
  PawakoRoleType,
} from '../types';
import { getPawakoRoleLabel } from '../utils/statusUtils';
import {
  KeyRound,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Server,
  AlertCircle,
  Save,
  Layers,
  Webhook,
  Settings,
  Database,
  Cloud,
  HardDrive,
  UploadCloud,
  FileCheck,
  Wand2,
  RefreshCw,
} from 'lucide-react';

export const SettingsOAuthView: React.FC = () => {
  const [oauthInfo, setOauthInfo] = useState<{
    url: string;
    isConfigured: boolean;
    redirectUri: string;
    appUrl: string;
  } | null>(null);

  const [roleMappings, setRoleMappings] = useState<DiscordRoleMapping[]>([]);
  const [discovery, setDiscovery] = useState<DiscordBotDiscoveryResult | null>(null);
  const [isAutoIdentifying, setIsAutoIdentifying] = useState(false);
  const [autoIdentifyMessage, setAutoIdentifyMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ROLES' | 'SERVERS' | 'WEBHOOK' | 'FIRESTORE'>('ROLES');
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Firestore & Storage status
  const [firestoreStatus, setFirestoreStatus] = useState<{
    isConfigured: boolean;
    isConnected: boolean;
    projectId: string | null;
    clientEmail: string | null;
    storageMode: 'firestore' | 'local';
    error: string | null;
  } | null>(null);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [authRes, rolesRes, fsRes, discRes] = await Promise.all([
          api.getOAuthUrl(),
          api.getRoleMappings(),
          api.getFirestoreStatus().catch(() => null),
          api.discoverDiscordBot().catch(() => null),
        ]);
        setOauthInfo(authRes);
        setRoleMappings(rolesRes.mappings);
        if (fsRes) setFirestoreStatus(fsRes);
        if (discRes) setDiscovery(discRes);
      } catch (err) {
        console.error('Failed to load settings data:', err);
      }
    };
    load();
  }, []);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRoleChange = (
    serverId: DiscordServerType,
    roleType: PawakoRoleType,
    value: string,
    roleName?: string
  ) => {
    setRoleMappings(prev => {
      const idx = prev.findIndex(m => m.serverId === serverId && m.roleType === roleType);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          discordRoleId: value,
          ...(roleName !== undefined ? { roleName } : {}),
        };
        return updated;
      } else {
        return [...prev, { serverId, roleType, discordRoleId: value, roleName }];
      }
    });
  };

  const handleAutoIdentifyRoles = async () => {
    try {
      setIsAutoIdentifying(true);
      setSaveError(null);
      setAutoIdentifyMessage(null);
      const res = await api.autoConfigureDiscordBot({
        overwriteExisting: false,
        syncInvites: true,
        syncMembers: false,
      });
      setDiscovery(res.discovery);
      setRoleMappings(res.mappings);
      setAutoIdentifyMessage(
        `Auto-identification terminée : ${res.serversUpdated} serveur(s) relié(s), ${res.rolesMapped} rôle(s) identifié(s).`
      );
    } catch (err: any) {
      setSaveError(err?.message || "Impossible d'auto-identifier les rôles via le bot Discord.");
    } finally {
      setIsAutoIdentifying(false);
    }
  };

  const handleSaveRoleMappings = async () => {
    try {
      setIsSavingRoles(true);
      setSaveError(null);
      setSaveSuccess(false);
      const res = await api.updateRoleMappings(roleMappings);
      setRoleMappings(res.mappings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Erreur lors de la sauvegarde des correspondances');
    } finally {
      setIsSavingRoles(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true);
      setMigrationError(null);
      const res = await api.createFirestoreBackup();
      setBackupPath(res.backupPath);
    } catch (err: any) {
      setMigrationError(err.message || 'Erreur lors de la création de la sauvegarde locale');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleMigrateFirestore = async () => {
    try {
      setIsMigrating(true);
      setConfirmMigrate(false);
      setMigrationError(null);
      setMigrationResult(null);
      const res = await api.migrateToFirestore();
      setMigrationResult(res);
      const fsRes = await api.getFirestoreStatus().catch(() => null);
      if (fsRes) setFirestoreStatus(fsRes);
    } catch (err: any) {
      setMigrationError(err.message || 'Erreur lors de la migration Firestore');
    } finally {
      setIsMigrating(false);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const devCallback = oauthInfo?.redirectUri || `${apiBase || currentOrigin}/auth/callback`;
  const webhookUrl = `${apiBase || currentOrigin}/api/discord/webhook`;

  const serverSections: { id: DiscordServerType; title: string; roles: PawakoRoleType[] }[] = [
    {
      id: 'RECRUTEMENT',
      title: '1. Serveur Recrutement',
      roles: ['CANDIDAT', 'CANDIDAT_ACCEPTE', 'CANDIDAT_REFUSE'],
    },
    {
      id: 'FORMATION',
      title: '2. Serveur Formation',
      roles: ['EN_FORMATION', 'EN_SIMULATION', 'VA_VALIDE'],
    },
    {
      id: 'PRODUCTION_CHATTING',
      title: '3. Serveur Production VA Chatting',
      roles: ['VA_PRODUCTION'],
    },
    {
      id: 'PRODUCTION_INSTAGRAM',
      title: '4. Serveur Production VA Instagram',
      roles: ['VA_PRODUCTION'],
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header & Tabs */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-5 shadow-xs space-y-3 transition-colors">
        <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
          Paramètres Discord & Système
        </h2>

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-[#241a38] overflow-x-auto">
          <button
            onClick={() => setActiveTab('ROLES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'ROLES'
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 dark:text-[#9d93b8] hover:bg-slate-100 dark:hover:bg-[#171026] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Rôles Discord</span>
          </button>

          <button
            onClick={() => setActiveTab('SERVERS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'SERVERS'
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 dark:text-[#9d93b8] hover:bg-slate-100 dark:hover:bg-[#171026] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>OAuth2 & Variables</span>
          </button>

          <button
            onClick={() => setActiveTab('WEBHOOK')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'WEBHOOK'
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 dark:text-[#9d93b8] hover:bg-slate-100 dark:hover:bg-[#171026] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Webhook</span>
          </button>

          <button
            onClick={() => setActiveTab('FIRESTORE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'FIRESTORE'
                ? 'bg-violet-600 text-white'
                : 'text-slate-600 dark:text-[#9d93b8] hover:bg-slate-100 dark:hover:bg-[#171026] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Base de données</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Role Mappings Configuration */}
      {activeTab === 'ROLES' && (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 space-y-6 shadow-xs text-xs transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm flex items-center gap-2">
              <Settings className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Correspondance des Role ID Discord
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleAutoIdentifyRoles}
                disabled={isAutoIdentifying || !discovery?.ok}
                className="px-3.5 py-2 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/15 hover:bg-violet-100 dark:hover:bg-violet-500/25 border border-violet-200 dark:border-violet-500/30 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                {isAutoIdentifying ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>{isAutoIdentifying ? 'Identification...' : 'Auto-identifier via le bot'}</span>
              </button>

              <button
                onClick={handleSaveRoleMappings}
                disabled={isSavingRoles}
                className="px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingRoles ? 'Enregistrement...' : 'Enregistrer'}</span>
              </button>
            </div>
          </div>

          {autoIdentifyMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{autoIdentifyMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Correspondances enregistrées.</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 rounded-lg flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Independent Configuration for the 4 Servers */}
          <div className="space-y-5">
            {serverSections.map(sec => {
              const matchedGuildId = discovery?.matchedServers?.[sec.id];
              const matchedGuild = matchedGuildId
                ? discovery?.guilds.find(g => g.id === matchedGuildId)
                : undefined;
              const availableRoles = (matchedGuild?.roles || []).filter(
                r => !r.managed && r.name !== '@everyone'
              );

              return (
                <div
                  key={sec.id}
                  className="p-4 border border-slate-200 dark:border-[#241a38] rounded-xl bg-slate-50/40 dark:bg-[#171026] space-y-3"
                >
                  <div className="border-b border-slate-200 dark:border-[#241a38] pb-2 flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs">{sec.title}</h4>
                    {matchedGuild ? (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                        {matchedGuild.name} · {availableRoles.length} rôle(s) détecté(s)
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-[#7c7296]">
                        Serveur non relié au bot
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {sec.roles.map(roleType => {
                      const currentMapping = roleMappings.find(
                        m => m.serverId === sec.id && m.roleType === roleType
                      );
                      const currentId = currentMapping?.discordRoleId || '';

                      return (
                        <div
                          key={roleType}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-lg"
                        >
                          <div className="min-w-[200px]">
                            <div className="font-bold text-slate-900 dark:text-[#f4f1fa] text-xs">
                              {getPawakoRoleLabel(roleType)}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-[#7c7296] font-mono">
                              {roleType}
                            </div>
                          </div>

                          <div className="flex-1 max-w-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            {availableRoles.length > 0 && (
                              <select
                                aria-label={`Choisir le rôle Discord pour ${roleType}`}
                                value={availableRoles.some(r => r.id === currentId) ? currentId : ''}
                                onChange={e => {
                                  const picked = availableRoles.find(r => r.id === e.target.value);
                                  handleRoleChange(sec.id, roleType, e.target.value, picked?.name);
                                }}
                                className="sm:w-52 text-xs p-2 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500"
                              >
                                <option value="">-- Rôle Discord --</option>
                                {availableRoles.map(r => (
                                  <option key={r.id} value={r.id}>
                                    @{r.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <input
                              type="text"
                              placeholder="Role ID Discord"
                              value={currentId}
                              onChange={e => handleRoleChange(sec.id, roleType, e.target.value)}
                              className="flex-1 text-xs font-mono p-2 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-slate-400 dark:placeholder:text-[#7c7296]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveRoleMappings}
              disabled={isSavingRoles}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingRoles ? 'Enregistrement...' : 'Enregistrer'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: OAuth2 & Environment Variables */}
      {activeTab === 'SERVERS' && (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 space-y-6 shadow-xs text-xs transition-colors">
          {/* Status banner */}
          <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
            oauthInfo?.isConfigured
              ? 'bg-emerald-50 dark:bg-[#171026] border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-[#171026] border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
          }`}>
            {oauthInfo?.isConfigured ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <div className="font-bold">
              {oauthInfo?.isConfigured
                ? 'OAuth2 Discord configuré'
                : 'Identifiants OAuth2 en attente'}
            </div>
          </div>

          {/* Callback URL */}
          <div className="space-y-2">
            <div className="font-semibold text-slate-800 dark:text-[#f4f1fa] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Redirect URI Discord</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={devCallback}
                className="flex-1 text-xs font-mono p-2 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] select-all focus:outline-none"
              />
              <button
                onClick={() => handleCopy('devCallback', devCallback)}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'devCallback' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copier</span>
              </button>
            </div>
            <div>
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 dark:text-violet-400 hover:underline font-medium inline-flex items-center gap-1 text-[11px]"
              >
                Discord Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Table of Environment Variables */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm">
              Variables d'Environnement
            </h4>
            <div className="overflow-x-auto border border-slate-200 dark:border-[#241a38] rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#171026] text-slate-500 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
                  <tr>
                    <th className="p-2.5 font-semibold">Variable</th>
                    <th className="p-2.5 font-semibold">Rôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#241a38] font-mono text-[11px] text-slate-700 dark:text-[#d8d0eb]">
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_RECRUITMENT_GUILD_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Serveur Recrutement</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_FORMATION_GUILD_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Serveur Formation (Chatting)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_CHATTING_PRODUCTION_GUILD_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Serveur Prod VA Chatting</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Serveur Prod VA Instagram</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_BOT_TOKEN</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Token Bot Discord (création/vérification des liens réels)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_RECRUITMENT_INVITE_CHANNEL_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Variable Worker — Salon cible des invitations Recrutement (optionnel si détection auto)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">INITIAL_ADMIN_DISCORD_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Discord ID du 1er Administrateur</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">JARVIS_WEBHOOK_SECRET</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Secret Webhook (X-JARVIS-Secret)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_CLIENT_ID</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Client ID OAuth2</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_CLIENT_SECRET</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Secret OAuth2</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">SESSION_SECRET</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Signature HMAC-SHA256 des sessions et states</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">FIREBASE_CLIENT_EMAIL</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Compte de service Firebase REST</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">FIREBASE_PRIVATE_KEY</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Secret Worker — Clé privée RS256 PKCS#8 Firebase</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">FRONTEND_URL</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Variable Worker — Origine Cloudflare Pages autorisée</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">DISCORD_REDIRECT_URI</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Variable Worker — Callback OAuth2 Discord</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-[#f4f1fa]">VITE_API_BASE_URL</td>
                    <td className="p-2.5 font-sans text-slate-500 dark:text-[#9d93b8]">Variable Frontend Pages — URL du Worker API</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Webhook Specifications */}
      {activeTab === 'WEBHOOK' && (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 space-y-5 shadow-xs text-xs transition-colors">
          <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm flex items-center gap-2">
            <Webhook className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            Webhook Discord
          </h3>

          <div className="space-y-2">
            <label className="font-semibold text-slate-800 dark:text-[#d8d0eb]">URL du Webhook</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 text-xs font-mono p-2 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] select-all focus:outline-none"
              />
              <button
                onClick={() => handleCopy('webhookUrl', webhookUrl)}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'webhookUrl' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copier</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">GUILD_MEMBER_ADD</span>
            </div>
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">GUILD_MEMBER_UPDATE</span>
            </div>
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">GUILD_MEMBER_REMOVE</span>
            </div>
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">INVITE_CREATE</span>
            </div>
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">INVITE_DELETE</span>
            </div>
            <div className="p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#171026]">
              <span className="font-mono font-bold text-slate-900 dark:text-[#f4f1fa]">MEMBER_SYNC</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-slate-800 dark:text-[#d8d0eb]">Payload JSON</label>
            <pre className="p-3 bg-slate-900 dark:bg-[#08050f] border border-slate-800 dark:border-[#241a38] text-slate-100 dark:text-[#d8d0eb] rounded-lg font-mono text-[11px] overflow-x-auto">
{`POST /api/discord/webhook
Headers:
  Content-Type: application/json
  X-JARVIS-Secret: <JARVIS_WEBHOOK_SECRET>

Body:
{
  "eventId": "evt-update-1709720000-987654321",
  "eventType": "GUILD_MEMBER_UPDATE",
  "guildId": "120000000000000002",
  "user": {
    "id": "285493021948502016",
    "username": "candidate_discord",
    "global_name": "Alex Dupont",
    "avatar": "a_1234567890abcdef"
  },
  "roles": ["120987654321098765"],
  "timestamp": "2026-11-06T14:00:00.000Z"
}`}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 4: Database Status & Backup */}
      {activeTab === 'FIRESTORE' && (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-6 space-y-5 shadow-xs text-xs transition-colors">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h3 className="font-bold text-slate-900 dark:text-[#f4f1fa] text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Cloud Firestore
            </h3>
            <span
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-xs ${
                firestoreStatus?.isConfigured
                  ? 'bg-emerald-50 dark:bg-[#171026] text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-[#171026] text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${firestoreStatus?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>
                {firestoreStatus?.isConfigured ? 'Configuré' : 'Stockage local'}
              </span>
            </span>
          </div>

          {/* Storage Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#7c7296]">Mode</span>
              <div className="font-bold text-slate-900 dark:text-[#f4f1fa] font-mono flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-500 dark:text-[#9d93b8]" />
                <span>{firestoreStatus?.storageMode === 'firestore' ? 'Cloud Firestore' : 'Local'}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#7c7296]">Projet Firebase</span>
              <div className="font-bold text-slate-900 dark:text-[#f4f1fa] font-mono truncate">
                {firestoreStatus?.projectId || '—'}
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] rounded-lg space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-[#7c7296]">Compte de Service</span>
              <div className="font-bold text-slate-900 dark:text-[#f4f1fa] font-mono truncate">
                {firestoreStatus?.isConfigured ? 'Configuré (masqué)' : '—'}
              </div>
            </div>
          </div>

          {/* Error banner if any */}
          {firestoreStatus?.error && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 rounded-lg text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span className="text-[11px] leading-relaxed">{firestoreStatus.error}</span>
            </div>
          )}

          {/* Migration & Backup Controls */}
          <div className="pt-3 border-t border-slate-100 dark:border-[#241a38] flex items-center justify-end gap-2 flex-wrap">
            <button
              onClick={handleCreateBackup}
              disabled={isBackingUp}
              className="px-3.5 py-2 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#241a38] text-slate-800 dark:text-[#f4f1fa] border border-transparent dark:border-[#241a38] font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              <FileCheck className="w-3.5 h-3.5 text-slate-600 dark:text-[#9d93b8]" />
              <span>{isBackingUp ? 'Sauvegarde...' : 'Sauvegarde locale'}</span>
            </button>

            {!confirmMigrate ? (
              <button
                onClick={() => setConfirmMigrate(true)}
                disabled={isMigrating || !firestoreStatus?.isConfigured}
                className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-40"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isMigrating ? 'Migration...' : 'Transférer vers Firestore'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmMigrate(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-[#9d93b8] hover:bg-slate-100 dark:hover:bg-[#171026] rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={handleMigrateFirestore}
                  disabled={isMigrating}
                  className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg transition-colors text-xs"
                >
                  Confirmer le transfert
                </button>
              </div>
            )}
          </div>

          {backupPath && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center justify-between">
              <span>Sauvegarde créée : <code>{backupPath}</code></span>
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </div>
          )}

          {migrationResult && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-emerald-800 dark:text-emerald-200 text-[11px] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{migrationResult.message}</span>
              </div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono">
                {JSON.stringify(migrationResult.details)}
              </div>
            </div>
          )}

          {migrationError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-lg text-rose-800 dark:text-rose-200 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{migrationError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
