/**
 * PAWAKO Referral Manager — Référentiel Firestore Unifié
 * Source unique de vérité et de persistance des données (candidats, parrains, statuts, rôles).
 * Conçu pour s'exécuter dans Cloudflare Workers et dans le serveur Express.
 */

import { FirestoreRestClient } from './firestoreRest';
import {
  User,
  UserRole,
  UserStatus,
  Referrer,
  Candidate,
  StatusHistoryEntry,
  DiscordServerInfo,
  DiscordRoleMapping,
  AuditLog,
  AdminStatus,
  OperationalStatus,
  CandidateStatus,
  VAType,
  DiscordServerType,
  PawakoRoleType,
} from './types';

export const OFFICIAL_DISCORD_SERVERS: DiscordServerInfo[] = [
  {
    id: 'RECRUTEMENT',
    guildId: '',
    name: 'PAWAKO — Serveur Recrutement',
    description: 'Accueil de tous les candidats, orientation VA Chatteurs et VA Instagram.',
    inviteBaseUrl: 'https://discord.gg/pawako-recrutement',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'FORMATION',
    guildId: '',
    name: 'PAWAKO — Serveur Formation',
    description: 'Réservé exclusivement aux VA Chatteurs en cours de formation.',
    inviteBaseUrl: 'https://discord.gg/pawako-formation',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_CHATTING',
    guildId: '',
    name: 'PAWAKO — Serveur Production VA Chatting',
    description: 'Réservé aux VA Chatteurs validés en production active.',
    inviteBaseUrl: 'https://discord.gg/pawako-prod-chatting',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_INSTAGRAM',
    guildId: '',
    name: 'PAWAKO — Serveur Production VA Instagram',
    description: 'Réservé aux VA Instagram acceptés en production active.',
    inviteBaseUrl: 'https://discord.gg/pawako-prod-instagram',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
];

export const DEFAULT_ROLE_MAPPINGS: DiscordRoleMapping[] = [
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT', discordRoleId: '', roleName: 'Candidat (En attente)' },
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT_ACCEPTE', discordRoleId: '', roleName: 'Candidat Accepté' },
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT_REFUSE', discordRoleId: '', roleName: 'Candidat Refusé' },
  { serverId: 'FORMATION', roleType: 'EN_FORMATION', discordRoleId: '', roleName: 'En Formation' },
  { serverId: 'FORMATION', roleType: 'EN_SIMULATION', discordRoleId: '', roleName: 'En Simulation' },
  { serverId: 'FORMATION', roleType: 'VA_VALIDE', discordRoleId: '', roleName: 'VA Validé' },
  { serverId: 'PRODUCTION_CHATTING', roleType: 'VA_PRODUCTION', discordRoleId: '', roleName: 'VA Chatteur Production' },
  { serverId: 'PRODUCTION_INSTAGRAM', roleType: 'VA_PRODUCTION', discordRoleId: '', roleName: 'VA Instagram Production' },
];

export function deriveCandidateStatus(
  adminStatus: AdminStatus,
  operationalStatus: OperationalStatus
): CandidateStatus {
  if (adminStatus === 'REFUSE') return 'REFUSE';
  if (adminStatus === 'ABANDONNE') return 'ABANDONNE';
  if (operationalStatus === 'PRODUCTION') return 'EN_PRODUCTION';
  if (operationalStatus === 'VALIDE') return 'VALIDE';
  if (operationalStatus === 'SIMULATION') return 'EN_SIMULATION';
  if (operationalStatus === 'FORMATION') return 'EN_FORMATION';
  if (operationalStatus === 'RECRUTEMENT' && adminStatus === 'ACCEPTE') return 'ACCEPTE';
  return 'EN_ATTENTE';
}

export class FirestoreRepository {
  private client: FirestoreRestClient;

  constructor(client: FirestoreRestClient) {
    this.client = client;
  }

  // --- MÉTADONNÉES SYSTÈME & PREMIER ADMINISTRATEUR ---

  async getMetadata(): Promise<{
    initialAdminClaimed: boolean;
    initialAdminClaimedAt?: string | null;
    initialAdminDiscordUserId?: string | null;
  }> {
    const meta = await this.client.getDocument<{
      initialAdminClaimed?: boolean;
      initialAdminClaimedAt?: string | null;
      initialAdminDiscordUserId?: string | null;
    }>('pawako_metadata', 'system');

    return {
      initialAdminClaimed: Boolean(meta?.initialAdminClaimed),
      initialAdminClaimedAt: meta?.initialAdminClaimedAt || null,
      initialAdminDiscordUserId: meta?.initialAdminDiscordUserId || null,
    };
  }

  async isInitialAdminClaimed(): Promise<boolean> {
    const meta = await this.getMetadata();
    return meta.initialAdminClaimed;
  }

  /**
   * Consomme atomiquement un nonce OAuth2 dans Firestore.
   * Empêche le rejeu entre toutes les instances Cloudflare Workers distribuées dans le monde.
   */
  async consumeOAuthNonce(nonce: string, expiresAt: number): Promise<boolean> {
    try {
      const existing = await this.client.getDocument('pawako_consumed_nonces', nonce);
      if (existing) {
        return false;
      }
      await this.client.setDocument(
        'pawako_consumed_nonces',
        nonce,
        {
          nonce,
          consumedAt: new Date().toISOString(),
          expiresAt,
        },
        { precondition: { exists: false } }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Tente d'acquérir atomiquement un verrou de traitement d'événement Webhook dans Firestore.
   * Gère les verrous PROCESSING expirés avec reprise atomique et associe un ownerId unique.
   */
  async lockWebhookEvent(
    eventId: string,
    ownerId: string,
    ttlMs: number = 60000
  ): Promise<{ acquired: boolean; reason?: string }> {
    const now = Date.now();
    try {
      const existing = await this.client.getDocument<{
        eventId: string;
        status: string;
        ownerId: string;
        expiresAt: number;
        _updateTime?: string;
      }>('pawako_consumed_webhooks', eventId);

      if (!existing) {
        try {
          await this.client.setDocument(
            'pawako_consumed_webhooks',
            eventId,
            {
              eventId,
              status: 'PROCESSING',
              ownerId,
              lockedAt: new Date().toISOString(),
              expiresAt: now + ttlMs,
            },
            { precondition: { exists: false } }
          );
          return { acquired: true };
        } catch {
          // Document créé simultanément par une autre instance Worker
          return { acquired: false, reason: 'Conflit d écriture concurrent sur l événement webhook.' };
        }
      }

      if (existing.status === 'COMPLETED') {
        return { acquired: false, reason: 'Événement webhook déjà traité avec succès (anti-rejeu).' };
      }

      if (existing.status === 'PROCESSING') {
        if (existing.expiresAt > now) {
          return { acquired: false, reason: 'Événement webhook en cours de traitement par une autre instance.' };
        }

        // Le verrou PROCESSING précédent a expiré : reprise atomique par la nouvelle tentative
        try {
          await this.client.setDocument(
            'pawako_consumed_webhooks',
            eventId,
            {
              eventId,
              status: 'PROCESSING',
              ownerId,
              lockedAt: new Date().toISOString(),
              expiresAt: now + ttlMs,
            },
            { precondition: { updateTime: existing._updateTime } }
          );
          return { acquired: true };
        } catch {
          return { acquired: false, reason: 'Conflit concurrent lors de la reprise du verrou webhook expiré.' };
        }
      }

      return { acquired: false, reason: 'État de verrou webhook inconnu.' };
    } catch (err: any) {
      return { acquired: false, reason: `Erreur d acquisition du verrou : ${err.message}` };
    }
  }

  /**
   * Marque l'événement comme COMPLETED uniquement si le verrou appartient toujours à l'ownerId actuel
   * et via une précondition sur updateTime pour empêcher tout conflit concurrent.
   */
  async completeWebhookEvent(
    eventId: string,
    ownerId: string,
    details?: Record<string, any>
  ): Promise<boolean> {
    try {
      const existing = await this.client.getDocument<{
        ownerId: string;
        status: string;
        lockedAt: string;
        _updateTime?: string;
      }>('pawako_consumed_webhooks', eventId);

      if (!existing || existing.ownerId !== ownerId || existing.status !== 'PROCESSING') {
        return false;
      }

      await this.client.setDocument(
        'pawako_consumed_webhooks',
        eventId,
        {
          eventId,
          status: 'COMPLETED',
          ownerId,
          lockedAt: existing.lockedAt,
          completedAt: new Date().toISOString(),
          expiresAt: Date.now() + 86400000, // Conservation 24h avant purge automatique
          details: details || {},
        },
        { precondition: { updateTime: existing._updateTime } }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Libère le verrou en cas d'erreur métier uniquement si l'ownerId correspond toujours.
   */
  async releaseWebhookEvent(eventId: string, ownerId: string): Promise<boolean> {
    try {
      const existing = await this.client.getDocument<{
        ownerId: string;
        status: string;
        _updateTime?: string;
      }>('pawako_consumed_webhooks', eventId);

      if (!existing || existing.ownerId !== ownerId || existing.status !== 'PROCESSING') {
        return false;
      }

      return await this.client.deleteDocument('pawako_consumed_webhooks', eventId, {
        precondition: { updateTime: existing._updateTime },
      });
    } catch {
      return false;
    }
  }

  // --- UTILISATEURS & RBAC ---

  async getUsers(): Promise<User[]> {
    return this.client.listDocuments<User>('pawako_users');
  }

  async getUserById(id: string): Promise<User | null> {
    return this.client.getDocument<User>('pawako_users', id);
  }

  async canAccessAdmin(
    discordUserId: string,
    configuredAdminId: string
  ): Promise<{ authorized: boolean; reason?: string; isInitialAdmin?: boolean }> {
    const existing = await this.getUserById(discordUserId);
    if (existing && (existing.role === 'ADMINISTRATEUR' || existing.role === 'RESPONSABLE')) {
      return { authorized: true, isInitialAdmin: false };
    }

    const claimed = await this.isInitialAdminClaimed();
    if (!claimed && configuredAdminId && discordUserId === configuredAdminId) {
      return { authorized: true, isInitialAdmin: true };
    }

    if (!configuredAdminId && !claimed) {
      return {
        authorized: false,
        reason: 'La variable INITIAL_ADMIN_DISCORD_ID n est pas configurée. Aucun administrateur initial n est défini.',
      };
    }

    return {
      authorized: false,
      reason: `Le compte Discord (ID: ${discordUserId}) n est pas accrédité comme Administrateur ou Responsable PAWAKO.`,
    };
  }

  async canAccessParrain(discordUserId: string): Promise<{ authorized: boolean; reason?: string }> {
    const referrer = await this.getReferrerByDiscordUserId(discordUserId);
    if (referrer && referrer.isActive) {
      return { authorized: true };
    }

    const existing = await this.getUserById(discordUserId);
    if (existing && (existing.role === 'ADMINISTRATEUR' || existing.role === 'RESPONSABLE')) {
      return { authorized: true };
    }

    return {
      authorized: false,
      reason: `Le compte Discord (ID: ${discordUserId}) n est pas enregistré comme Parrain autorisé PAWAKO. Contactez la Direction pour être ajouté.`,
    };
  }

  async upsertUser(
    user: Partial<User> & { id: string },
    configuredAdminId: string
  ): Promise<User> {
    const existing = await this.getUserById(user.id);
    const now = new Date().toISOString();

    if (existing) {
      const updated: User = {
        ...existing,
        username: user.username || existing.username,
        displayName: user.displayName || existing.displayName,
        avatar: user.avatar !== undefined ? user.avatar : existing.avatar,
        lastLoginAt: now,
      };
      await this.client.setDocument('pawako_users', user.id, updated);
      return updated;
    }

    // Premier administrateur
    const cleanAdminId = (configuredAdminId || '').trim();
    const claimed = await this.isInitialAdminClaimed();
    const canClaim = !claimed && Boolean(cleanAdminId) && user.id === cleanAdminId;

    let assignedRole: UserRole = 'PARRAIN';
    if (canClaim) {
      try {
        // Verrouillage atomique via précondition Firestore
        await this.client.setDocument(
          'pawako_metadata',
          'system',
          {
            initialAdminClaimed: true,
            initialAdminClaimedAt: now,
            initialAdminDiscordUserId: user.id,
            activeAdminDiscordUserIds: [user.id],
            lastUpdated: now,
          },
          { precondition: { exists: false } }
        );
        assignedRole = 'ADMINISTRATEUR';
      } catch {
        // En cas de conflit concurrent, re-vérifier si ce compte est bien celui inscrit dans le verrou
        const freshMeta = await this.getMetadata();
        if (freshMeta.initialAdminDiscordUserId === cleanAdminId) {
          assignedRole = 'ADMINISTRATEUR';
        } else {
          assignedRole = 'PARRAIN';
        }
      }
    }

    const newUser: User = {
      id: user.id,
      username: user.username || `user_${user.id.slice(-4)}`,
      displayName: user.displayName || user.username || `User ${user.id}`,
      avatar: user.avatar || null,
      role: assignedRole,
      status: 'ACTIVE',
      createdAt: now,
      lastLoginAt: now,
    };

    await this.client.setDocument('pawako_users', user.id, newUser);

    if (assignedRole === 'ADMINISTRATEUR') {
      await this.logAudit({
        action: 'INITIAL_ADMIN_CLAIMED',
        actorUserId: user.id,
        actorName: newUser.displayName,
        targetType: 'USER',
        targetId: user.id,
        details: {
          configuredAdminId: cleanAdminId,
          message: 'Premier administrateur PAWAKO initialisé via INITIAL_ADMIN_DISCORD_ID.',
        },
      });
    }

    return newUser;
  }

  /**
   * Met à jour de façon atomique la liste des administrateurs actifs dans pawako_metadata/system.
   * Utilise une précondition Firestore sur _updateTime pour empêcher toute course concurrente
   * qui tenterait de supprimer ou suspendre simultanément le dernier administrateur.
   */
  private async syncActiveAdminState(
    targetUserId: string,
    action: 'ADD' | 'REMOVE'
  ): Promise<void> {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const meta = await this.client.getDocument<{
        initialAdminClaimed?: boolean;
        initialAdminClaimedAt?: string | null;
        initialAdminDiscordUserId?: string | null;
        activeAdminDiscordUserIds?: string[];
        _updateTime?: string;
      }>('pawako_metadata', 'system');

      let currentAdmins: string[] = Array.isArray(meta?.activeAdminDiscordUserIds)
        ? meta.activeAdminDiscordUserIds
        : [];

      // Si le tableau n'est pas encore initialisé dans les métadonnées, le synchroniser depuis la collection users
      if (currentAdmins.length === 0) {
        const allUsers = await this.getUsers();
        currentAdmins = allUsers
          .filter(u => u.role === 'ADMINISTRATEUR' && u.status === 'ACTIVE')
          .map(u => u.id);
        if (currentAdmins.length === 0 && meta?.initialAdminDiscordUserId) {
          currentAdmins = [meta.initialAdminDiscordUserId];
        }
      }

      let updatedAdmins: string[];
      if (action === 'REMOVE') {
        const remaining = currentAdmins.filter(id => id !== targetUserId);
        if (remaining.length === 0) {
          throw new Error('Opération impossible : vous ne pouvez ni rétrograder ni désactiver le dernier administrateur actif du système.');
        }
        updatedAdmins = remaining;
      } else {
        updatedAdmins = Array.from(new Set([...currentAdmins, targetUserId]));
      }

      try {
        const updatePayload = {
          initialAdminClaimed: Boolean(meta?.initialAdminClaimed),
          initialAdminClaimedAt: meta?.initialAdminClaimedAt || null,
          initialAdminDiscordUserId: meta?.initialAdminDiscordUserId || null,
          activeAdminDiscordUserIds: updatedAdmins,
          lastUpdated: new Date().toISOString(),
        };

        if (meta?._updateTime) {
          await this.client.setDocument('pawako_metadata', 'system', updatePayload, {
            precondition: { updateTime: meta._updateTime },
          });
        } else {
          await this.client.setDocument('pawako_metadata', 'system', updatePayload);
        }
        return; // Succès atomique
      } catch (err: any) {
        if (attempt === maxRetries - 1) {
          throw new Error(`Conflit d écriture concurrent sur la vérification de l administrateur : ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 60 * (attempt + 1)));
      }
    }
  }

  async updateUserRole(
    userId: string,
    newRole: UserRole,
    actorId: string,
    actorName: string
  ): Promise<User | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    // Protection atomique : synchroniser l'état des administrateurs actifs
    if (user.role === 'ADMINISTRATEUR' && newRole !== 'ADMINISTRATEUR') {
      if (user.status === 'ACTIVE') {
        await this.syncActiveAdminState(userId, 'REMOVE');
      }
    } else if (user.role !== 'ADMINISTRATEUR' && newRole === 'ADMINISTRATEUR') {
      if (user.status === 'ACTIVE') {
        await this.syncActiveAdminState(userId, 'ADD');
      }
    }

    user.role = newRole;
    await this.client.setDocument('pawako_users', userId, user);

    await this.logAudit({
      action: 'USER_ROLE_CHANGE',
      actorUserId: actorId,
      actorName,
      targetType: 'USER',
      targetId: userId,
      details: { newRole },
    });

    return user;
  }

  async updateUserStatus(
    userId: string,
    newStatus: UserStatus,
    actorId: string,
    actorName: string
  ): Promise<User | null> {
    const user = await this.getUserById(userId);
    if (!user) return null;

    // Protection atomique : synchroniser l'état des administrateurs actifs lors de suspension/réactivation
    if (user.role === 'ADMINISTRATEUR') {
      if (user.status === 'ACTIVE' && newStatus !== 'ACTIVE') {
        await this.syncActiveAdminState(userId, 'REMOVE');
      } else if (user.status !== 'ACTIVE' && newStatus === 'ACTIVE') {
        await this.syncActiveAdminState(userId, 'ADD');
      }
    }

    user.status = newStatus;
    await this.client.setDocument('pawako_users', userId, user);

    await this.logAudit({
      action: 'USER_STATUS_CHANGE',
      actorUserId: actorId,
      actorName,
      targetType: 'USER',
      targetId: userId,
      details: { newStatus },
    });

    return user;
  }

  // --- PARRAINS (REFERRERS) ---

  async getReferrers(): Promise<Referrer[]> {
    return this.client.listDocuments<Referrer>('pawako_referrers');
  }

  async getReferrerById(id: string): Promise<Referrer | null> {
    return this.client.getDocument<Referrer>('pawako_referrers', id);
  }

  async getReferrerByDiscordUserId(discordUserId: string): Promise<Referrer | null> {
    const referrers = await this.getReferrers();
    return referrers.find(r => r.discordUserId === discordUserId) || null;
  }

  async getReferrerByInviteCode(inviteCode: string): Promise<Referrer | null> {
    const clean = inviteCode.trim().toUpperCase();
    const referrers = await this.getReferrers();
    return referrers.find(r => r.inviteCode.toUpperCase() === clean) || null;
  }

  async createReferrer(params: {
    discordUserId: string;
    inviteCode?: string;
    notes?: string;
    actorUserId?: string;
    actorName?: string;
  }): Promise<Referrer> {
    const existing = await this.getReferrerByDiscordUserId(params.discordUserId);
    if (existing) return existing;

    const user = await this.getUserById(params.discordUserId);
    const username = user ? user.username : `user_${params.discordUserId.slice(-4)}`;
    const displayName = user ? user.displayName : `Parrain ${params.discordUserId.slice(-4)}`;

    const code =
      params.inviteCode?.trim().toUpperCase() ||
      `PWK-${username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;

    const id = `ref-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
    const newReferrer: Referrer = {
      id,
      discordUserId: params.discordUserId,
      discordUsername: username,
      discordDisplayName: displayName,
      inviteCode: code,
      inviteUrl: `https://discord.gg/pawako-recrutement?ref=${code}`,
      usesCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: params.notes,
    };

    await this.client.setDocument('pawako_referrers', id, newReferrer);

    if (params.actorUserId) {
      await this.logAudit({
        action: 'REFERRER_CREATED',
        actorUserId: params.actorUserId,
        actorName: params.actorName || 'Système',
        targetType: 'REFERRER',
        targetId: id,
        details: { code, discordUserId: params.discordUserId, displayName },
      });
    }

    return newReferrer;
  }

  async toggleReferrer(id: string, actorId: string, actorName: string): Promise<Referrer | null> {
    const ref = await this.getReferrerById(id);
    if (!ref) return null;

    ref.isActive = !ref.isActive;
    await this.client.setDocument('pawako_referrers', id, ref);

    await this.logAudit({
      action: 'REFERRER_STATUS_TOGGLED',
      actorUserId: actorId,
      actorName,
      targetType: 'REFERRER',
      targetId: id,
      details: { isActive: ref.isActive },
    });

    return ref;
  }

  // --- CANDIDATS ---

  async getCandidates(options?: {
    search?: string;
    vaType?: VAType | 'ALL';
    adminStatus?: AdminStatus | 'ALL';
    operationalStatus?: OperationalStatus | 'ALL';
    server?: string;
    referrerId?: string;
    referrerDiscordUserId?: string;
    hasAnomaly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ candidates: Candidate[]; total: number }> {
    let list = await this.client.listDocuments<Candidate>('pawako_candidates');

    if (options?.referrerDiscordUserId) {
      list = list.filter(c => c.referrerDiscordUserId === options.referrerDiscordUserId);
    }

    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      list = list.filter(
        c =>
          c.username.toLowerCase().includes(q) ||
          c.displayName.toLowerCase().includes(q) ||
          c.discordUserId.includes(q) ||
          (c.referrerName && c.referrerName.toLowerCase().includes(q))
      );
    }

    if (options?.vaType && options.vaType !== 'ALL') {
      list = list.filter(c => c.vaType === options.vaType);
    }

    if (options?.adminStatus && options.adminStatus !== 'ALL') {
      list = list.filter(c => c.adminStatus === options.adminStatus);
    }

    if (options?.operationalStatus && options.operationalStatus !== 'ALL') {
      list = list.filter(c => c.operationalStatus === options.operationalStatus);
    }

    if (options?.server && options.server !== 'ALL') {
      list = list.filter(c => c.currentServer === options.server);
    }

    if (options?.hasAnomaly !== undefined) {
      list = list.filter(c => c.hasAnomaly === options.hasAnomaly);
    }

    // Tri par date décroissante
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const start = (page - 1) * limit;
    const paginated = list.slice(start, start + limit);

    return { candidates: paginated, total };
  }

  async getCandidateById(id: string): Promise<Candidate | null> {
    return this.client.getDocument<Candidate>('pawako_candidates', id);
  }

  async getCandidateByDiscordUserId(discordUserId: string): Promise<Candidate | null> {
    const list = await this.client.listDocuments<Candidate>('pawako_candidates');
    return list.find(c => c.discordUserId === discordUserId) || null;
  }

  async createCandidate(params: {
    discordUserId: string;
    username: string;
    displayName?: string;
    avatar?: string | null;
    vaType: VAType;
    inviteCodeUsed?: string;
    actorUserId?: string;
    actorName?: string;
  }): Promise<Candidate> {
    const existing = await this.getCandidateByDiscordUserId(params.discordUserId);
    if (existing) return existing;

    let referrer: Referrer | null = null;
    let attributionStatus: Candidate['attributionStatus'] = 'UNCERTAIN';
    let uncertaintyReason: string | null =
      "Arrivée sans code d'invitation parrain détecté (invitation directe ou vanity URL).";

    if (params.inviteCodeUsed) {
      referrer = await this.getReferrerByInviteCode(params.inviteCodeUsed);
      if (referrer) {
        attributionStatus = 'CONFIRMED';
        uncertaintyReason = null;
        referrer.usesCount = (referrer.usesCount || 0) + 1;
        await this.client.setDocument('pawako_referrers', referrer.id, referrer);
      }
    }

    const now = new Date().toISOString();
    const id = `cand-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;

    const newCandidate: Candidate = {
      id,
      discordUserId: params.discordUserId,
      username: params.username,
      displayName: params.displayName || params.username,
      avatar: params.avatar || null,
      vaType: params.vaType,
      adminStatus: 'EN_ATTENTE',
      operationalStatus: 'RECRUTEMENT',
      status: 'EN_ATTENTE',
      referrerId: referrer?.id || null,
      referrerDiscordUserId: referrer?.discordUserId || null,
      referrerName: referrer?.discordDisplayName || null,
      attributionStatus,
      uncertaintyReason,
      currentServer: 'RECRUTEMENT',
      hasAnomaly: false,
      anomalyReason: null,
      discordRoles: [],
      arrivalDate: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.client.setDocument('pawako_candidates', id, newCandidate);

    await this.logStatusHistory({
      candidateId: id,
      fromStatus: null,
      toStatus: 'EN_ATTENTE',
      fromAdminStatus: null,
      toAdminStatus: 'EN_ATTENTE',
      fromOperationalStatus: null,
      toOperationalStatus: 'RECRUTEMENT',
      fromServer: null,
      toServer: 'RECRUTEMENT',
      authorUserId: params.actorUserId || 'SYSTEM',
      authorName: params.actorName || 'Système Recrutement',
      authorSource: 'MANUAL_ADMIN',
      reason: referrer ? `Création de dossier avec parrain : ${referrer.discordDisplayName}` : uncertaintyReason,
      isConfidential: false,
    });

    await this.logAudit({
      action: 'CANDIDATE_CREATED',
      actorUserId: params.actorUserId || 'SYSTEM',
      actorName: params.actorName || 'Système',
      targetType: 'CANDIDATE',
      targetId: id,
      details: { discordUserId: params.discordUserId, vaType: params.vaType },
    });

    return newCandidate;
  }

  async updateCandidateStatus(
    candidateId: string,
    params: {
      newAdminStatus?: AdminStatus;
      newOperationalStatus?: OperationalStatus;
      newStatus?: CandidateStatus;
      notes: string;
      refusalReason?: string;
      actorUserId: string;
      actorName: string;
      actorSource?: StatusHistoryEntry['authorSource'];
      isConfidential?: boolean;
    }
  ): Promise<Candidate | null> {
    const candidate = await this.getCandidateById(candidateId);
    if (!candidate) return null;

    const fromAdmin = candidate.adminStatus;
    const fromOp = candidate.operationalStatus;
    const fromStatus = candidate.status;
    const now = new Date().toISOString();

    if (params.newAdminStatus) candidate.adminStatus = params.newAdminStatus;
    if (params.newOperationalStatus) {
      // Règle d'intégrité : les VA Instagram ne peuvent jamais entrer en formation ni en simulation
      if (candidate.vaType === 'INSTAGRAM' && ['FORMATION', 'SIMULATION'].includes(params.newOperationalStatus)) {
        throw new Error('Règle d intégrité : Les VA Instagram ne peuvent pas être placés en formation ou simulation.');
      }
      candidate.operationalStatus = params.newOperationalStatus;
    }

    candidate.status = deriveCandidateStatus(candidate.adminStatus, candidate.operationalStatus);

    if (candidate.adminStatus === 'REFUSE' && params.refusalReason) {
      candidate.refusalReason = params.refusalReason;
      candidate.decisionDate = now;
      candidate.decisionByUserId = params.actorUserId;
      candidate.decisionByName = params.actorName;
    }

    if (candidate.operationalStatus === 'PRODUCTION' && !candidate.productionDate) {
      candidate.productionDate = now;
    }

    candidate.updatedAt = now;
    await this.client.setDocument('pawako_candidates', candidateId, candidate);

    await this.logStatusHistory({
      candidateId,
      fromStatus,
      toStatus: candidate.status,
      fromAdminStatus: fromAdmin,
      toAdminStatus: candidate.adminStatus,
      fromOperationalStatus: fromOp,
      toOperationalStatus: candidate.operationalStatus,
      fromServer: candidate.currentServer,
      toServer: candidate.currentServer,
      authorUserId: params.actorUserId,
      authorName: params.actorName,
      authorSource: params.actorSource || 'MANUAL_ADMIN',
      reason: params.notes,
      isConfidential: Boolean(params.isConfidential),
    });

    return candidate;
  }

  async reassignReferrer(
    candidateId: string,
    params: { newReferrerId: string; reason: string; actorUserId: string; actorName: string }
  ): Promise<Candidate | null> {
    const candidate = await this.getCandidateById(candidateId);
    if (!candidate) return null;

    const newRef = await this.getReferrerById(params.newReferrerId);
    if (!newRef) throw new Error('Parrain cible introuvable');

    candidate.referrerId = newRef.id;
    candidate.referrerDiscordUserId = newRef.discordUserId;
    candidate.referrerName = newRef.discordDisplayName;
    candidate.attributionStatus = 'MANUAL_REASSIGNED';
    candidate.uncertaintyReason = null;
    candidate.updatedAt = new Date().toISOString();

    await this.client.setDocument('pawako_candidates', candidateId, candidate);

    await this.logAudit({
      action: 'REFERRER_REASSIGNED',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: { newReferrerId: newRef.id, reason: params.reason },
    });

    return candidate;
  }

  async clearCandidateAnomaly(
    candidateId: string,
    actorUserId: string,
    actorName: string
  ): Promise<Candidate | null> {
    const candidate = await this.getCandidateById(candidateId);
    if (!candidate) return null;

    candidate.hasAnomaly = false;
    candidate.anomalyReason = null;
    candidate.updatedAt = new Date().toISOString();

    await this.client.setDocument('pawako_candidates', candidateId, candidate);

    await this.logAudit({
      action: 'ANOMALY_CLEARED',
      actorUserId,
      actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: { candidateId },
    });

    return candidate;
  }

  // --- SERVEURS DISCORD & MAPPINGS ---

  async getDiscordServers(guildIds?: Record<DiscordServerType, string>): Promise<DiscordServerInfo[]> {
    let servers = await this.client.listDocuments<DiscordServerInfo>('pawako_discord_servers');

    if (servers.length === 0) {
      servers = OFFICIAL_DISCORD_SERVERS.map(s => ({
        ...s,
        guildId: guildIds?.[s.id] || '',
      }));
      await this.client.batchSet(
        servers.map(s => ({ collection: 'pawako_discord_servers', docId: s.id, data: s }))
      );
    } else if (guildIds) {
      // Met à jour les guildIds depuis l'environnement si fournis
      for (const s of servers) {
        if (guildIds[s.id] && s.guildId !== guildIds[s.id]) {
          s.guildId = guildIds[s.id];
          await this.client.setDocument('pawako_discord_servers', s.id, s);
        }
      }
    }

    return servers;
  }

  async getRoleMappings(): Promise<DiscordRoleMapping[]> {
    let mappings = await this.client.listDocuments<DiscordRoleMapping>('pawako_discord_role_mappings');
    if (mappings.length === 0) {
      mappings = DEFAULT_ROLE_MAPPINGS;
      await this.client.batchSet(
        mappings.map(m => ({
          collection: 'pawako_discord_role_mappings',
          docId: `${m.serverId}_${m.roleType}`,
          data: m,
        }))
      );
    }
    return mappings;
  }

  async updateRoleMappings(
    updates: Array<{ serverId: DiscordServerType; roleType: PawakoRoleType; discordRoleId: string; roleName?: string }>,
    actorUserId: string,
    actorName: string
  ): Promise<DiscordRoleMapping[]> {
    const now = new Date().toISOString();
    const writes = updates.map(u => ({
      collection: 'pawako_discord_role_mappings',
      docId: `${u.serverId}_${u.roleType}`,
      data: {
        serverId: u.serverId,
        roleType: u.roleType,
        discordRoleId: u.discordRoleId.trim(),
        roleName: u.roleName?.trim() || '',
        updatedAt: now,
        updatedBy: actorName,
      },
    }));

    await this.client.batchSet(writes);

    await this.logAudit({
      action: 'ROLE_MAPPINGS_UPDATED',
      actorUserId,
      actorName,
      targetType: 'ROLE_MAPPING',
      targetId: 'ALL',
      details: { count: updates.length },
    });

    return this.getRoleMappings();
  }

  // --- HISTORIQUE & AUDIT ---

  async logStatusHistory(entry: Omit<StatusHistoryEntry, 'id' | 'timestamp'>): Promise<StatusHistoryEntry> {
    const id = `sh-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
    const fullEntry: StatusHistoryEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };
    await this.client.setDocument('pawako_status_history', id, fullEntry);
    return fullEntry;
  }

  async getStatusHistoryForCandidate(candidateId: string): Promise<StatusHistoryEntry[]> {
    const list = await this.client.listDocuments<StatusHistoryEntry>('pawako_status_history');
    return list
      .filter(h => h.candidateId === candidateId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async logAudit(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const id = `audit-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
    const fullLog: AuditLog = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };
    await this.client.setDocument('pawako_audit_logs', id, fullLog);
    return fullLog;
  }

  async getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
    const list = await this.client.listDocuments<AuditLog>('pawako_audit_logs');
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list.slice(0, limit);
  }

  // --- STATISTIQUES GLOBALES ET PARRAIN ---

  async getOverviewStats(guildIds?: Record<DiscordServerType, string>) {
    const [candidates, referrers, servers] = await Promise.all([
      this.client.listDocuments<Candidate>('pawako_candidates'),
      this.client.listDocuments<Referrer>('pawako_referrers'),
      this.getDiscordServers(guildIds),
    ]);

    const totalCandidats = candidates.length;
    const totalChatteurs = candidates.filter(c => c.vaType === 'CHATTEUR').length;
    const totalInstagram = candidates.filter(c => c.vaType === 'INSTAGRAM').length;

    const enAttente = candidates.filter(c => c.adminStatus === 'EN_ATTENTE').length;
    const acceptes = candidates.filter(c => c.adminStatus === 'ACCEPTE').length;
    const refuses = candidates.filter(c => c.adminStatus === 'REFUSE').length;
    const abandonnes = candidates.filter(c => c.adminStatus === 'ABANDONNE').length;

    const enFormation = candidates.filter(c => c.operationalStatus === 'FORMATION').length;
    const enSimulation = candidates.filter(c => c.operationalStatus === 'SIMULATION').length;
    const valides = candidates.filter(c => c.operationalStatus === 'VALIDE').length;

    const prodChatting = candidates.filter(c => c.vaType === 'CHATTEUR' && c.operationalStatus === 'PRODUCTION').length;
    const prodInstagram = candidates.filter(c => c.vaType === 'INSTAGRAM' && c.operationalStatus === 'PRODUCTION').length;
    const totalProductionGlobale = prodChatting + prodInstagram;
    const dossiersAnomalies = candidates.filter(c => c.hasAnomaly).length;

    const conversionProductionRate = totalCandidats > 0 ? Math.round((totalProductionGlobale / totalCandidats) * 100) : 0;
    const acceptanceRate = totalCandidats > 0 ? Math.round(((totalCandidats - refuses - abandonnes) / totalCandidats) * 100) : 0;

    return {
      kpis: {
        totalCandidats,
        totalChatteurs,
        totalInstagram,
        enAttente,
        acceptes,
        enFormation,
        enSimulation,
        valides,
        prodChatting,
        prodInstagram,
        totalProductionGlobale,
        refuses,
        abandonnes,
        dossiersAnomalies,
        conversionProductionRate,
        acceptanceRate,
      },
      distribution: {
        chatteur: {
          total: totalChatteurs,
          enAttente: candidates.filter(c => c.vaType === 'CHATTEUR' && c.adminStatus === 'EN_ATTENTE').length,
          acceptes: candidates.filter(c => c.vaType === 'CHATTEUR' && c.adminStatus === 'ACCEPTE').length,
          enFormation,
          enSimulation,
          valides,
          enProduction: prodChatting,
          refuses: candidates.filter(c => c.vaType === 'CHATTEUR' && c.adminStatus === 'REFUSE').length,
          abandonnes: candidates.filter(c => c.vaType === 'CHATTEUR' && c.adminStatus === 'ABANDONNE').length,
        },
        instagram: {
          total: totalInstagram,
          enAttente: candidates.filter(c => c.vaType === 'INSTAGRAM' && c.adminStatus === 'EN_ATTENTE').length,
          acceptes: candidates.filter(c => c.vaType === 'INSTAGRAM' && c.adminStatus === 'ACCEPTE').length,
          enProduction: prodInstagram,
          refuses: candidates.filter(c => c.vaType === 'INSTAGRAM' && c.adminStatus === 'REFUSE').length,
          abandonnes: candidates.filter(c => c.vaType === 'INSTAGRAM' && c.adminStatus === 'ABANDONNE').length,
        },
      },
      topParrains: referrers
        .map(r => {
          const filleuls = candidates.filter(c => c.referrerDiscordUserId === r.discordUserId);
          const inProd = filleuls.filter(c => c.operationalStatus === 'PRODUCTION').length;
          return {
            referrerId: r.id,
            discordUserId: r.discordUserId,
            name: r.discordDisplayName,
            inviteCode: r.inviteCode,
            totalFilleuls: filleuls.length,
            enProduction: inProd,
            conversionRate: filleuls.length > 0 ? Math.round((inProd / filleuls.length) * 100) : 0,
          };
        })
        .sort((a, b) => b.totalFilleuls - a.totalFilleuls)
        .slice(0, 5),
      servers,
    };
  }

  async getParrainDashboard(discordUserId: string) {
    const referrer = await this.getReferrerByDiscordUserId(discordUserId);
    if (!referrer) {
      throw new Error(`Aucun compte parrain actif n est associé au Discord ID : ${discordUserId}`);
    }

    const allCandidates = await this.client.listDocuments<Candidate>('pawako_candidates');
    const myCandidates = allCandidates.filter(c => c.referrerDiscordUserId === discordUserId);

    // Suppression stricte des données confidentielles
    const sanitizedCandidates = myCandidates.map(c => ({
      ...c,
      decisionByUserId: null,
      decisionByName: null,
    }));

    const totalFilleuls = sanitizedCandidates.length;
    const enAttente = sanitizedCandidates.filter(c => c.adminStatus === 'EN_ATTENTE').length;
    const acceptes = sanitizedCandidates.filter(c => c.adminStatus === 'ACCEPTE').length;
    const refuses = sanitizedCandidates.filter(c => c.adminStatus === 'REFUSE').length;
    const enFormation = sanitizedCandidates.filter(c => c.operationalStatus === 'FORMATION').length;
    const enSimulation = sanitizedCandidates.filter(c => c.operationalStatus === 'SIMULATION').length;
    const enProduction = sanitizedCandidates.filter(c => c.operationalStatus === 'PRODUCTION').length;
    const abandonnes = sanitizedCandidates.filter(c => c.adminStatus === 'ABANDONNE').length;

    return {
      referrer,
      metrics: {
        totalFilleuls,
        enAttente,
        acceptes,
        refuses,
        enFormation,
        enSimulation,
        enProduction,
        abandonnes,
        conversionRate: totalFilleuls > 0 ? Math.round((enProduction / totalFilleuls) * 100) : 0,
        acceptanceRate: totalFilleuls > 0 ? Math.round(((totalFilleuls - refuses) / totalFilleuls) * 100) : 0,
      },
      candidates: sanitizedCandidates,
    };
  }
}
