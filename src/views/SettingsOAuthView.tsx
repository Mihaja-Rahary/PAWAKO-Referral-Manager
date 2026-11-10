import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { DiscordRoleMapping, DiscordServerType, PawakoRoleType } from '../types';
import { getServerLabel, getPawakoRoleLabel } from '../utils/statusUtils';
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
  FileCheck
} from 'lucide-react';

export const SettingsOAuthView: React.FC = () => {
  const [oauthInfo, setOauthInfo] = useState<{
    url: string;
    isConfigured: boolean;
    redirectUri: string;
    appUrl: string;
  } | null>(null);

  const [roleMappings, setRoleMappings] = useState<DiscordRoleMapping[]>([]);
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
  const [migrationResult, setMigrationResult] = useState<any | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [authRes, rolesRes, fsRes] = await Promise.all([
          api.getOAuthUrl(),
          api.getRoleMappings(),
          api.getFirestoreStatus().catch(() => null),
        ]);
        setOauthInfo(authRes);
        setRoleMappings(rolesRes.mappings);
        if (fsRes) setFirestoreStatus(fsRes);
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

  const handleRoleChange = (serverId: DiscordServerType, roleType: PawakoRoleType, value: string) => {
    setRoleMappings(prev => {
      const idx = prev.findIndex(m => m.serverId === serverId && m.roleType === roleType);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], discordRoleId: value };
        return updated;
      } else {
        return [...prev, { serverId, roleType, discordRoleId: value }];
      }
    });
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
    if (!window.confirm('Confirmer le transfert des données vers Cloud Firestore ? Une sauvegarde locale intégrale sera automatiquement créée avant toute écriture.')) {
      return;
    }
    try {
      setIsMigrating(true);
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
  const devCallback = `${currentOrigin}/auth/callback`;
  const webhookUrl = `${currentOrigin}/api/discord/webhook`;

  const serverSections: { id: DiscordServerType; title: string; subtitle: string; roles: PawakoRoleType[] }[] = [
    {
      id: 'RECRUTEMENT',
      title: '1. Serveur Recrutement',
      subtitle: 'Accueil de tous les candidats (Chatting & Instagram)',
      roles: ['CANDIDAT', 'CANDIDAT_ACCEPTE', 'CANDIDAT_REFUSE'],
    },
    {
      id: 'FORMATION',
      title: '2. Serveur Formation (VA Chatting uniquement)',
      subtitle: 'Parcours des VA Chatteurs en cours d apprentissage et de simulation',
      roles: ['EN_FORMATION', 'EN_SIMULATION', 'VA_VALIDE'],
    },
    {
      id: 'PRODUCTION_CHATTING',
      title: '3. Serveur Production VA Chatting',
      subtitle: 'Serveur de travail réservé aux VA Chatteurs confirmés',
      roles: ['VA_PRODUCTION'],
    },
    {
      id: 'PRODUCTION_INSTAGRAM',
      title: '4. Serveur Production VA Instagram',
      subtitle: 'Serveur de travail réservé aux VA Instagram acceptés',
      roles: ['VA_PRODUCTION'],
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-2">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Configuration Discord, Rôles & Passerelle JARVIS
        </h2>
        <p className="text-xs text-slate-500">
          Gestion centralisée des correspondances de rôles Discord, de l'architecture des 4 serveurs et de la sécurisation OAuth2.
        </p>

        {/* Tabs Bar */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('ROLES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'ROLES'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Correspondance des Rôles (4 Serveurs)</span>
          </button>

          <button
            onClick={() => setActiveTab('SERVERS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'SERVERS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Architecture & Variables d'Environnement</span>
          </button>

          <button
            onClick={() => setActiveTab('WEBHOOK')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'WEBHOOK'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Passerelle Bot JARVIS</span>
          </button>

          <button
            onClick={() => setActiveTab('FIRESTORE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'FIRESTORE'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Base Firestore & Déploiement Gratuit</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Role Mappings Configuration */}
      {activeTab === 'ROLES' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs text-xs">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-900" />
                Configuration des Role ID Discord pour chaque Serveur
              </h3>
              <p className="text-slate-500 text-[11px] mt-1">
                Le Referral Manager utilise les identifiants numériques <strong>Role ID (Snowflake)</strong> plutôt que les libellés.
                Un simple renommage de rôle dans Discord ne rompra ainsi jamais la synchronisation des statuts.
              </p>
            </div>
            <button
              onClick={handleSaveRoleMappings}
              disabled={isSavingRoles}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingRoles ? 'Enregistrement...' : 'Enregistrer les correspondances'}</span>
            </button>
          </div>

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Correspondances de rôles enregistrées avec succès dans la base de données.</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px] leading-relaxed">
            <strong>Comment obtenir un Role ID dans Discord ?</strong> Dans Discord : Paramètres du serveur → Rôles → Clic droit sur le rôle souhaité → <em>Copier l'identifiant du rôle</em> (le Mode Développeur doit être activé).
          </div>

          {/* Independent Configuration for the 4 Servers */}
          <div className="space-y-6">
            {serverSections.map(sec => (
              <div key={sec.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 space-y-3">
                <div className="border-b border-slate-200 pb-2">
                  <h4 className="font-bold text-slate-900 text-xs">{sec.title}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{sec.subtitle}</p>
                </div>

                <div className="space-y-3 pt-1">
                  {sec.roles.map(roleType => {
                    const currentMapping = roleMappings.find(
                      m => m.serverId === sec.id && m.roleType === roleType
                    );
                    const currentId = currentMapping?.discordRoleId || '';

                    return (
                      <div
                        key={roleType}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-lg"
                      >
                        <div className="min-w-[200px]">
                          <div className="font-bold text-slate-900 text-xs">
                            {getPawakoRoleLabel(roleType)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Type PAWAKO : {roleType}
                          </div>
                        </div>

                        <div className="flex-1 max-w-md">
                          <input
                            type="text"
                            placeholder="Role ID Discord (ex: 120123456789012345)"
                            value={currentId}
                            onChange={e => handleRoleChange(sec.id, roleType, e.target.value)}
                            className="w-full text-xs font-mono p-2 border border-slate-200 rounded bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveRoleMappings}
              disabled={isSavingRoles}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingRoles ? 'Enregistrement...' : 'Enregistrer toutes les correspondances'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Architecture & Environment Variables */}
      {activeTab === 'SERVERS' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-xs text-xs">
          {/* Status banner */}
          <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
            oauthInfo?.isConfigured
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            {oauthInfo?.isConfigured ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold">
                {oauthInfo?.isConfigured
                  ? 'OAuth2 Discord Actif & Opérationnel'
                  : 'Identifiants Discord OAuth2 en attente de configuration'}
              </div>
              <p className="text-[11px] leading-relaxed">
                {oauthInfo?.isConfigured
                  ? 'Les identifiants DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET sont injectés. La connexion sécurisée par popup est opérationnelle.'
                  : 'Renseignez les variables DISCORD_CLIENT_ID et DISCORD_CLIENT_SECRET dans vos paramètres d environnement.'}
              </p>
            </div>
          </div>

          {/* Callback URL */}
          <div className="space-y-2">
            <div className="font-semibold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-900" />
              <span>URL de Redirection OAuth2 Discord (Redirect URI)</span>
            </div>
            <p className="text-slate-500">
              Dans le <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1">Discord Developer Portal <ExternalLink className="w-3 h-3" /></a>, sous <strong>OAuth2 → General → Redirects</strong>, ajoutez l'URL suivante :
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={devCallback}
                className="flex-1 text-xs font-mono p-2 border border-slate-200 rounded bg-slate-50 text-slate-900 select-all"
              />
              <button
                onClick={() => handleCopy('devCallback', devCallback)}
                className="px-3 py-2 bg-slate-900 text-white font-medium rounded hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'devCallback' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copier</span>
              </button>
            </div>
          </div>

          {/* Table of the 4 Servers & Variables */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-sm">
              Tableau des Variables d'Environnement Système
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-semibold">Variable</th>
                    <th className="p-2.5 font-semibold">Description</th>
                    <th className="p-2.5 font-semibold">Serveur Associé / Origine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_RECRUITMENT_GUILD_ID</td>
                    <td className="p-2.5 font-sans">Guild ID du Serveur Recrutement</td>
                    <td className="p-2.5 font-sans text-slate-500">Serveur Recrutement (Accueil tous candidats)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_FORMATION_GUILD_ID</td>
                    <td className="p-2.5 font-sans">Guild ID du Serveur Formation</td>
                    <td className="p-2.5 font-sans text-slate-500">Serveur Formation (Réservé VA Chatteurs)</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_CHATTING_PRODUCTION_GUILD_ID</td>
                    <td className="p-2.5 font-sans">Guild ID du Serveur Production Chatting</td>
                    <td className="p-2.5 font-sans text-slate-500">Serveur Production VA Chatting</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID</td>
                    <td className="p-2.5 font-sans">Guild ID du Serveur Production Instagram</td>
                    <td className="p-2.5 font-sans text-slate-500">Serveur Production VA Instagram</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">PAWAKO_INITIAL_ADMIN_DISCORD_ID</td>
                    <td className="p-2.5 font-sans">Discord User ID du 1er Administrateur habilité</td>
                    <td className="p-2.5 font-sans text-slate-500">Mode Développeur → Clic droit sur votre profil</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">JARVIS_WEBHOOK_SECRET</td>
                    <td className="p-2.5 font-sans">Secret d'authentification du webhook JARVIS</td>
                    <td className="p-2.5 font-sans text-slate-500">Header HTTP X-JARVIS-Secret</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_CLIENT_ID</td>
                    <td className="p-2.5 font-sans">Client ID OAuth2 de l'application</td>
                    <td className="p-2.5 font-sans text-slate-500">Discord Dev Portal → General Information</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_CLIENT_SECRET</td>
                    <td className="p-2.5 font-sans">Secret OAuth2 (côté serveur uniquement)</td>
                    <td className="p-2.5 font-sans text-slate-500">Discord Dev Portal → OAuth2 → General</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-900">DISCORD_BOT_TOKEN</td>
                    <td className="p-2.5 font-sans">Token d'authentification du Bot JARVIS</td>
                    <td className="p-2.5 font-sans text-slate-500">Discord Dev Portal → Bot → Reset Token</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Webhook JARVIS Specifications */}
      {activeTab === 'WEBHOOK' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-xs text-xs">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Webhook className="w-4 h-4 text-slate-900" />
              Intégration du Webhook JARVIS (Passerelle Discord)
            </h3>
            <p className="text-slate-500 text-[11px] mt-1">
              Configurez le bot JARVIS pour transmettre en temps réel les arrivées, départs et modifications de rôles vers cette URL.
            </p>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-slate-800">URL du Webhook :</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 text-xs font-mono p-2 border border-slate-200 rounded bg-slate-50 text-slate-900 select-all"
              />
              <button
                onClick={() => handleCopy('webhookUrl', webhookUrl)}
                className="px-3 py-2 bg-slate-900 text-white font-medium rounded hover:bg-slate-800 transition-colors flex items-center gap-1 text-[11px]"
              >
                {copiedKey === 'webhookUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copier</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-slate-800">Événements pris en charge :</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                <span className="font-mono font-bold text-slate-900">GUILD_MEMBER_ADD</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Arrivée d'un membre ou retour historique</p>
              </div>
              <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                <span className="font-mono font-bold text-slate-900">GUILD_MEMBER_UPDATE</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Ajout ou retrait de rôles Discord</p>
              </div>
              <div className="p-2.5 border border-slate-200 rounded-lg bg-slate-50">
                <span className="font-mono font-bold text-slate-900">GUILD_MEMBER_REMOVE</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Départ d'un serveur (dossier conservé)</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-semibold text-slate-800">Exemple de Payload JSON :</label>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto">
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

      {/* TAB 4: Cloud Firestore & Free Deployment Architecture */}
      {activeTab === 'FIRESTORE' && (
        <div className="space-y-6">
          {/* Firestore Status Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-xs text-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-900" />
                  État de la Base de Données Cloud Firestore (Plan Spark Gratuit)
                </h3>
                <p className="text-slate-500 text-[11px] mt-1">
                  Transition du stockage local vers Cloud Firestore sans interruption ni frais payants.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-xs ${
                    firestoreStatus?.isConfigured
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${firestoreStatus?.isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>
                    {firestoreStatus?.isConfigured
                      ? 'Firestore Configuré'
                      : 'Stockage Local (En attente de clés)'}
                  </span>
                </span>
              </div>
            </div>

            {/* Storage Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Mode de Stockage Actif</span>
                <div className="font-bold text-slate-900 font-mono flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                  <span>{firestoreStatus?.storageMode === 'firestore' ? 'Cloud Firestore' : 'Local (/data/pawako_db.json)'}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Projet Firebase</span>
                <div className="font-bold text-slate-900 font-mono truncate">
                  {firestoreStatus?.projectId || 'Non configuré (FIREBASE_PROJECT_ID)'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Compte de Service</span>
                <div className="font-bold text-slate-900 font-mono truncate">
                  {firestoreStatus?.clientEmail || 'Non configuré (FIREBASE_CLIENT_EMAIL)'}
                </div>
              </div>
            </div>

            {/* Error banner if any */}
            {firestoreStatus?.error && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">{firestoreStatus.error}</span>
              </div>
            )}

            {/* Migration Controls */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500 max-w-lg">
                Une sauvegarde locale intégrale de sécurité est systématiquement créée avant tout transfert de données vers Firestore.
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateBackup}
                  disabled={isBackingUp}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-50"
                >
                  <FileCheck className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isBackingUp ? 'Sauvegarde...' : 'Créer une Sauvegarde Locale'}</span>
                </button>

                <button
                  onClick={handleMigrateFirestore}
                  disabled={isMigrating || !firestoreStatus?.isConfigured}
                  title={!firestoreStatus?.isConfigured ? 'Renseignez FIREBASE_PROJECT_ID dans les variables pour activer la migration' : ''}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors flex items-center gap-1.5 text-xs disabled:opacity-40"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
                  <span>{isMigrating ? 'Migration en cours...' : 'Transférer vers Cloud Firestore'}</span>
                </button>
              </div>
            </div>

            {backupPath && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center justify-between">
                <span>Sauvegarde locale enregistrée avec succès : <code>{backupPath}</code></span>
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
            )}

            {migrationResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{migrationResult.message}</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-mono">
                  Éléments transférés : {JSON.stringify(migrationResult.details)}
                </div>
              </div>
            )}

            {migrationError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{migrationError}</span>
              </div>
            )}
          </div>

          {/* Architecture & Free Deployment Guide */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs text-xs">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Cloud className="w-4 h-4 text-slate-900" />
              Architecture Déployée (Offres 100% Gratuites)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  1. Frontend Web : Firebase Hosting (Plan Spark)
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Hébergement statique mondial rapide, SSL automatique, gratuit dans le plan Spark. Fichier <code className="bg-white px-1 py-0.5 rounded border border-slate-200">firebase.json</code> configuré avec réécriture SPA vers <code className="bg-white px-1 py-0.5 rounded border border-slate-200">/index.html</code>.
                </p>
                <div className="pt-2 text-[10px] text-slate-500 font-mono">
                  Commande : <code className="text-slate-800 font-semibold">firebase deploy --only hosting</code>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  2. Base de Données : Cloud Firestore (Plan Spark)
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Inclus gratuitement : 1 Go de stockage, 50 000 lectures/jour, 20 000 écritures/jour. Règles de sécurité <code className="bg-white px-1 py-0.5 rounded border border-slate-200">firestore.rules</code> restreintes interdisant tout accès direct non-médié par le backend.
                </p>
                <div className="pt-2 text-[10px] text-slate-500 font-mono">
                  Commande : <code className="text-slate-800 font-semibold">firebase deploy --only firestore:rules</code>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  3. Backend API : Cloudflare Workers (pawako-api sur workers.dev)
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Worker autonome ultra-rapide sur l'offre gratuite Cloudflare Workers (100 000 requêtes/jour gratuites), sans abonnement ni domaine personnalisé. Utilise l'API REST Firestore sans dépendance gRPC native.
                </p>
                <div className="pt-2 text-[10px] text-slate-500 font-mono">
                  Déploiement : <code className="text-slate-800 font-semibold">npm run deploy:worker</code>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  4. Portes d'Entrée Séparées : /admin/login & /parrain/login
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Parcours de connexion et contrôles d'autorisation hermétiques avec état Discord OAuth2 sécurisé (<code className="text-slate-800 font-semibold">admin_*</code> / <code className="text-slate-800 font-semibold">parrain_*</code>). Les parrains n'ont accès qu'à leurs propres filleuls.
                </p>
                <div className="pt-2 text-[10px] text-slate-500 font-mono">
                  URLs : <code className="text-slate-800 font-semibold">/admin/login</code> & <code className="text-slate-800 font-semibold">/parrain/login</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
