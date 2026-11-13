import { db, deriveCandidateStatus } from './db';
import { DiscordServerType, VAType, RecruitmentEvent, PawakoRoleType, Candidate } from './types';

export interface DiscordOAuthUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email?: string;
}

export class DiscordService {
  private clientId: string;
  private clientSecret: string;
  private webhookSecret: string;

  constructor() {
    this.clientId = (process.env.DISCORD_CLIENT_ID || '').trim();
    this.clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim();
    this.webhookSecret = (process.env.JARVIS_WEBHOOK_SECRET || '').trim();
  }

  isOAuthConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  isBotConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  getOAuthUrl(redirectUri: string, state?: string): { url: string; isConfigured: boolean } {
    if (!this.clientId) {
      return {
        url: '',
        isConfigured: false,
      };
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      prompt: 'consent',
    });

    if (state) {
      params.set('state', state);
    }

    return {
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
      isConfigured: true,
    };
  }

  async exchangeCodeForUser(code: string, redirectUri: string): Promise<DiscordOAuthUser | null> {
    if (!this.isOAuthConfigured()) {
      throw new Error('Les identifiants Discord OAuth2 (DISCORD_CLIENT_ID & DISCORD_CLIENT_SECRET) ne sont pas configurés.');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Discord token exchange failed:', tokenResponse.status, errText);
      throw new Error(`Échec de l échange de code OAuth2 Discord: ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Impossible de récupérer le profil utilisateur Discord (@me).');
    }

    const userData: DiscordOAuthUser = await userResponse.json();
    return userData;
  }

  formatAvatarUrl(discordUserId: string, avatarHash: string | null): string {
    if (avatarHash) {
      const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
      return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${ext}?size=128`;
    }
    const defaultIndex = (BigInt(discordUserId) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  }

  /**
   * Identifie le serveur PAWAKO correspondant à une Guild ID Discord
   */
  resolveServerByGuildId(guildId: string): DiscordServerType {
    const servers = db.getDiscordServers();
    const matched = servers.find(s => s.guildId && s.guildId === guildId);
    if (matched) return matched.id;

    // Correspondance par défaut basée sur l'activité supposée ou les variables d'environnement
    if (guildId === process.env.DISCORD_FORMATION_GUILD_ID) return 'FORMATION';
    if (guildId === process.env.DISCORD_CHATTING_PRODUCTION_GUILD_ID) return 'PRODUCTION_CHATTING';
    if (guildId === process.env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID) return 'PRODUCTION_INSTAGRAM';
    return 'RECRUTEMENT';
  }

  /**
   * Détermine le rôle PAWAKO correspondant à un Role ID Discord sur un serveur spécifique
   */
  resolvePawakoRoleType(serverId: DiscordServerType, discordRoleId: string): PawakoRoleType | null {
    const mappings = db.getRoleMappingsForServer(serverId);
    const match = mappings.find(m => m.discordRoleId && m.discordRoleId === discordRoleId);
    return match ? match.roleType : null;
  }

  /**
   * Traitement d'un événement passerelle Discord transmis par le bot JARVIS
   */
  async processDiscordGatewayEvent(payload: {
    eventId?: string;
    eventType: 'GUILD_MEMBER_ADD' | 'GUILD_MEMBER_REMOVE' | 'GUILD_MEMBER_UPDATE' | 'INVITE_CREATE' | 'INVITE_DELETE' | 'MEMBER_SYNC';
    guildId: string;
    user: {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    roles?: string[]; // Liste complète des Role IDs actuels
    addedRoleIds?: string[];
    removedRoleIds?: string[];
    inviteCode?: string | null;
    vaType?: VAType;
    timestamp?: string;
  }): Promise<{ success: boolean; message: string; candidate?: any; anomaly?: string | null }> {
    const eventId = payload.eventId || `evt-${payload.eventType}-${payload.guildId}-${payload.user.id}-${Date.now()}`;

    // 1. Protection contre les doublons et rejeu (Idempotence)
    if (db.isEventProcessed(eventId)) {
      return {
        success: true,
        message: 'Événement Discord déjà traité (protection contre les doublons active)',
      };
    }

    const serverType = this.resolveServerByGuildId(payload.guildId);
    let resultMessage = '';
    let candidateResult: Candidate | undefined = undefined;
    let anomalyDetected: string | null = null;

    // Récupérer le dossier existant
    let candidate = db.getCandidateByDiscordUserId(payload.user.id);

    // 2. Traitement GUILD_MEMBER_ADD (Nouvelle arrivée ou réintégration)
    if (payload.eventType === 'GUILD_MEMBER_ADD') {
      const avatarUrl = payload.user.avatar
        ? (payload.user.avatar.startsWith('http') ? payload.user.avatar : this.formatAvatarUrl(payload.user.id, payload.user.avatar))
        : null;

      const { candidate: c, isNew, edgeCase } = db.createOrUpdateCandidateOnDiscordJoin({
        discordUserId: payload.user.id,
        username: payload.user.username,
        displayName: payload.user.global_name || payload.user.username,
        avatar: avatarUrl,
        inviteCodeUsed: payload.inviteCode,
        vaType: payload.vaType || 'CHATTEUR',
        originServer: serverType,
      });

      candidate = c;
      candidateResult = c;
      db.updateDiscordServerSync(serverType, 1);

      resultMessage = isNew
        ? `Nouveau membre Discord enregistré sur ${serverType} : ${c.displayName} (${c.discordUserId})`
        : `Membre déjà répertorié de retour sur Discord (${serverType}) : ${c.displayName}. Dossier et parrain d'origine conservés.`;
    }

    // 3. Traitement GUILD_MEMBER_REMOVE (Départ de serveur)
    else if (payload.eventType === 'GUILD_MEMBER_REMOVE') {
      if (candidate) {
        // Règle stricte PAWAKO : Un départ de serveur ne signifie pas automatiquement un abandon.
        // Le dossier n'est jamais supprimé, l'historique est conservé.
        candidateResult = candidate;
        resultMessage = `Départ détecté du serveur ${serverType} pour ${payload.user.username}. Dossier candidat conservé intact.`;
      }
      db.updateDiscordServerSync(serverType, -1);
    }

    // 4. Traitement GUILD_MEMBER_UPDATE & Synchronisation des Rôles
    if (candidate && (payload.eventType === 'GUILD_MEMBER_UPDATE' || payload.eventType === 'MEMBER_SYNC' || payload.roles)) {
      const currentRoles = payload.roles || [];
      candidate.discordRoles = currentRoles;
      candidate.lastDiscordSyncAt = new Date().toISOString();

      // Analyser les rôles PAWAKO présents sur ce serveur
      const detectedPawakoRoles: PawakoRoleType[] = [];
      for (const roleId of currentRoles) {
        const pawakoRole = this.resolvePawakoRoleType(serverType, roleId);
        if (pawakoRole && !detectedPawakoRoles.includes(pawakoRole)) {
          detectedPawakoRoles.push(pawakoRole);
        }
      }

      // Règle 1 : Rôle contradictoire (ex: Formation et Production simultanées)
      const hasFormation = detectedPawakoRoles.includes('EN_FORMATION') || detectedPawakoRoles.includes('EN_SIMULATION');
      const hasProduction = detectedPawakoRoles.includes('VA_PRODUCTION');
      if (hasFormation && hasProduction) {
        anomalyDetected = 'Combinaison de rôles contradictoire détectée sur Discord : rôles de Formation et de Production simultanément attribués.';
        db.flagCandidateAnomaly(candidate.id, anomalyDetected);
      }

      // Règle 2 : Incompatibilité avec l'activité du candidat
      if (candidate.vaType === 'INSTAGRAM' && (detectedPawakoRoles.includes('EN_FORMATION') || detectedPawakoRoles.includes('EN_SIMULATION') || detectedPawakoRoles.includes('VA_VALIDE'))) {
        anomalyDetected = 'Incompatibilité d activité : un candidat VA Instagram ne doit jamais posséder de rôles de Formation, Simulation ou Validation.';
        db.flagCandidateAnomaly(candidate.id, anomalyDetected);
      }

      // Règle 3 : Un candidat déjà REFUSÉ ne doit JAMAIS redevenir automatiquement accepté ou en formation par rôle Discord
      if (candidate.adminStatus === 'REFUSE') {
        if (detectedPawakoRoles.some(r => r === 'CANDIDAT_ACCEPTE' || r === 'EN_FORMATION' || r === 'EN_SIMULATION' || r === 'VA_VALIDE' || r === 'VA_PRODUCTION')) {
          anomalyDetected = 'Rôle d acceptation/formation détecté sur Discord pour un candidat classé REFUSÉ. Aucune réactivation automatique autorisée sans décision manuelle.';
          db.flagCandidateAnomaly(candidate.id, anomalyDetected);
        }
      } else if (!anomalyDetected) {
        // Appliquer la transition autorisée selon la hiérarchie de priorité
        if (detectedPawakoRoles.includes('CANDIDAT_REFUSE')) {
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'REFUSE',
            newOperationalStatus: 'INACTIF',
            refusalReason: 'Refus notifié automatiquement via l attribution du rôle Discord Candidat Refusé',
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: 'Synchronisation automatique du rôle Discord CANDIDAT_REFUSE',
          });
          resultMessage += ' Statut actualisé : REFUSÉ.';
        } else if (detectedPawakoRoles.includes('VA_PRODUCTION')) {
          const targetServer: DiscordServerType = candidate.vaType === 'INSTAGRAM' ? 'PRODUCTION_INSTAGRAM' : 'PRODUCTION_CHATTING';
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'ACCEPTE',
            newOperationalStatus: 'PRODUCTION',
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: `Passage en production via le rôle Discord VA_PRODUCTION sur ${targetServer}`,
          });
          resultMessage += ` Statut actualisé : PRODUCTION (${candidate.vaType === 'INSTAGRAM' ? 'Instagram' : 'Chatting'}).`;
        } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('VA_VALIDE')) {
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'ACCEPTE',
            newOperationalStatus: 'VALIDE',
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: 'Validation du candidat via le rôle Discord VA_VALIDE',
          });
          resultMessage += ' Statut actualisé : VALIDÉ.';
        } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('EN_SIMULATION')) {
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'ACCEPTE',
            newOperationalStatus: 'SIMULATION',
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: 'Passage en simulation via le rôle Discord EN_SIMULATION',
          });
          resultMessage += ' Statut actualisé : SIMULATION.';
        } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('EN_FORMATION')) {
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'ACCEPTE',
            newOperationalStatus: 'FORMATION',
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: 'Entrée en formation via le rôle Discord EN_FORMATION',
          });
          resultMessage += ' Statut actualisé : FORMATION.';
        } else if (detectedPawakoRoles.includes('CANDIDAT_ACCEPTE')) {
          db.updateCandidateStatus({
            candidateId: candidate.id,
            newAdminStatus: 'ACCEPTE',
            newOperationalStatus: candidate.operationalStatus === 'INACTIF' ? 'RECRUTEMENT' : candidate.operationalStatus,
            authorUserId: 'JARVIS_BOT',
            authorName: 'Bot JARVIS',
            authorSource: 'DISCORD_SYNC',
            notes: 'Acceptation de la candidature via le rôle Discord CANDIDAT_ACCEPTE',
          });
          resultMessage += ' Statut administratif actualisé : ACCEPTÉ.';
        }
      }

      candidateResult = db.getCandidateById(candidate.id);
    }

    // 5. Enregistrer l'événement pour idempotence
    const eventRecord: RecruitmentEvent = {
      id: eventId,
      eventType: payload.eventType,
      serverId: serverType,
      guildId: payload.guildId,
      discordUserId: payload.user.id,
      payload,
      processed: true,
      processedAt: new Date().toISOString(),
      result: resultMessage || `Événement ${payload.eventType} enregistré`,
    };
    db.recordEvent(eventRecord);

    return {
      success: true,
      message: resultMessage || 'Événement Discord traité avec succès',
      candidate: candidateResult,
      anomaly: anomalyDetected,
    };
  }

  /**
   * Synchronisation initiale des membres et de leurs rôles depuis Discord
   */
  async syncServerMembers(params: {
    serverId: DiscordServerType;
    members: Array<{
      discordUserId: string;
      username: string;
      displayName?: string;
      avatar?: string | null;
      roleIds: string[];
      vaType?: VAType;
    }>;
    actorUserId: string;
    actorName: string;
  }): Promise<{ synchronizedCount: number; anomaliesCount: number }> {
    let syncCount = 0;
    let anomalyCount = 0;

    for (const m of params.members) {
      const eventId = `sync-${params.serverId}-${m.discordUserId}-${Date.now()}`;
      const res = await this.processDiscordGatewayEvent({
        eventId,
        eventType: 'MEMBER_SYNC',
        guildId: db.getDiscordServers().find(s => s.id === params.serverId)?.guildId || '',
        user: {
          id: m.discordUserId,
          username: m.username,
          global_name: m.displayName || m.username,
          avatar: m.avatar || null,
        },
        roles: m.roleIds,
        vaType: m.vaType,
      });

      if (res.success) syncCount++;
      if (res.anomaly) anomalyCount++;
    }

    db.updateDiscordServerSync(params.serverId, 0);

    db.logAudit({
      action: 'SERVER_MEMBERS_SYNC',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'SERVER',
      targetId: params.serverId,
      details: { synchronizedCount: syncCount, anomaliesCount: anomalyCount },
    });

    return { synchronizedCount: syncCount, anomaliesCount: anomalyCount };
  }
}

export const discordService = new DiscordService();
