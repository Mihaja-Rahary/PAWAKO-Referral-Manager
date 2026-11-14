/**
 * PAWAKO Referral Manager — Référentiel Firestore Unifié
 * Source unique de vérité et de persistance des données (candidats, parrains, statuts, rôles, invitations Discord).
 * Conçu pour s'exécuter dans Cloudflare Workers et dans Node.js.
 */

import { FirestoreRestClient, FirestoreRestError } from './firestoreRest';
import {
  DiscordBotConfig,
  DiscordInviteCreationResult,
  createRecruitmentDiscordInvite,
  extractDiscordInviteCode,
  isLegacyFakeInvite,
  revokeDiscordInvite,
  verifyDiscordInvite,
} from './discordBot';
import {
  User,
  UserRole,
  UserStatus,
  Referrer,
  ReferrerStatus,
  ReferrerDependencySummary,
  DiscordInviteRecord,
  DiscordMembership,
  Candidate,
  StatusHistoryEntry,
  ReferralAttributionHistoryEntry,
  DiscordServerInfo,
  DiscordRoleMapping,
  RecruitmentEvent,
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
    inviteBaseUrl: 'https://discord.com',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'FORMATION',
    guildId: '',
    name: 'PAWAKO — Serveur Formation',
    description: 'Réservé exclusivement aux VA Chatteurs en cours de formation.',
    inviteBaseUrl: 'https://discord.com',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_CHATTING',
    guildId: '',
    name: 'PAWAKO — Serveur Production VA Chatting',
    description: 'Réservé aux VA Chatteurs validés en production active.',
    inviteBaseUrl: 'https://discord.com',
    memberCount: 0,
    botConnected: false,
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_INSTAGRAM',
    guildId: '',
    name: 'PAWAKO — Serveur Production VA Instagram',
    description: 'Réservé aux VA Instagram acceptés en production active.',
    inviteBaseUrl: 'https://discord.com',
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

export function getEffectiveReferrerStatus(ref: Partial<Referrer> | null | undefined): ReferrerStatus {
  if (!ref) return 'SUSPENDED';
  if (ref.status === 'ARCHIVED' || Boolean(ref.archivedAt)) return 'ARCHIVED';
  if (ref.status === 'SUSPENDED' || ref.isActive === false) return 'SUSPENDED';
  return 'ACTIVE';
}

function stripFirestoreMeta<T extends Record<string, any>>(doc: T): T {
  const { _updateTime, ...clean } = doc as Record<string, any>;
  return clean as T;
}

function normalizeReferrerDocument(raw: Referrer): Referrer {
  const effectiveStatus = getEffectiveReferrerStatus(raw);
  const legacyFake = isLegacyFakeInvite(raw.inviteCode, raw.inviteUrl);
  let inviteStatus = raw.inviteStatus;
  let inviteError = raw.inviteError || null;
  let inviteUrl = raw.inviteUrl || '';

  if (legacyFake) {
    inviteStatus = 'UNCONFIGURED';
    inviteUrl = '';
    inviteError =
      'Ancien code interne (non Discord). Veuillez générer une véritable invitation Discord pour le serveur Recrutement.';
  } else if (!inviteStatus) {
    inviteStatus = raw.inviteCode && inviteUrl ? 'ACTIVE' : 'UNCONFIGURED';
  }

  return {
    ...stripFirestoreMeta(raw),
    status: effectiveStatus,
    isActive: effectiveStatus === 'ACTIVE',
    inviteCode: raw.inviteCode || '',
    inviteUrl,
    inviteStatus,
    inviteError,
  };
}

function mapSyntheticStatusToPair(newStatus: CandidateStatus): {
  adminStatus?: AdminStatus;
  operationalStatus?: OperationalStatus;
} {
  switch (newStatus) {
    case 'EN_ATTENTE':
      return { adminStatus: 'EN_ATTENTE', operationalStatus: 'RECRUTEMENT' };
    case 'ACCEPTE':
      return { adminStatus: 'ACCEPTE', operationalStatus: 'RECRUTEMENT' };
    case 'EN_FORMATION':
      return { adminStatus: 'ACCEPTE', operationalStatus: 'FORMATION' };
    case 'EN_SIMULATION':
      return { adminStatus: 'ACCEPTE', operationalStatus: 'SIMULATION' };
    case 'VALIDE':
      return { adminStatus: 'ACCEPTE', operationalStatus: 'VALIDE' };
    case 'EN_PRODUCTION':
      return { adminStatus: 'ACCEPTE', operationalStatus: 'PRODUCTION' };
    case 'REFUSE':
      return { adminStatus: 'REFUSE', operationalStatus: 'INACTIF' };
    case 'ABANDONNE':
      return { adminStatus: 'ABANDONNE', operationalStatus: 'INACTIF' };
    default:
      return {};
  }
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
   * Consomme atomiquement un nonce OAuth2 dans Firestore via une écriture conditionnelle unique (exists=false).
   */
  async consumeOAuthNonce(
    nonce: string,
    expiresAt: number
  ): Promise<{
    consumed: boolean;
    reason?: 'REPLAY' | 'INVALID_NONCE' | 'TECHNICAL_ERROR';
    category?: string;
    operation?: string;
    httpStatus?: number | null;
    errorCode?: string;
    detail?: string;
  }> {
    if (!nonce || typeof nonce !== 'string' || !/^[a-zA-Z0-9-]{8,128}$/.test(nonce)) {
      return {
        consumed: false,
        reason: 'INVALID_NONCE',
        errorCode: 'INVALID_NONCE',
        detail: 'Format de nonce OAuth2 invalide.',
      };
    }

    try {
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
      return { consumed: true };
    } catch (err: any) {
      if (err instanceof FirestoreRestError && err.isPreconditionConflict) {
        return {
          consumed: false,
          reason: 'REPLAY',
          category: 'PRECONDITION',
          operation: err.operation,
          httpStatus: err.status ?? 409,
          errorCode: err.firestoreStatus || `HTTP_${err.status || 409}`,
          detail: 'Nonce OAuth2 déjà consommé dans Firestore.',
        };
      }

      const firestoreErr = err instanceof FirestoreRestError ? err : null;
      const category = firestoreErr?.category || 'UNKNOWN';
      const operation = firestoreErr?.operation || 'SET';
      const httpStatus = firestoreErr?.status ?? null;
      const errorCode = firestoreErr
        ? firestoreErr.firestoreStatus || firestoreErr.category
        : 'UNEXPECTED_ERROR';
      const statusSuffix = httpStatus ? ` (HTTP ${httpStatus})` : '';
      const safeDetail = `${operation} ${errorCode}${statusSuffix}: ${
        err?.message || 'Erreur Firestore inconnue'
      }`;

      console.error('[Firestore][consumeOAuthNonce] Technical Firestore failure', {
        noncePrefix: nonce.slice(0, 8),
        category,
        operation,
        status: httpStatus,
        firestoreStatus: firestoreErr?.firestoreStatus ?? null,
        message: err?.message || 'Unknown error',
      });

      return {
        consumed: false,
        reason: 'TECHNICAL_ERROR',
        category,
        operation,
        httpStatus,
        errorCode,
        detail: safeDetail,
      };
    }
  }

  /**
   * Tente d'acquérir atomiquement un verrou de traitement d'événement Webhook dans Firestore.
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
          expiresAt: Date.now() + 86400000,
          details: details || {},
        },
        { precondition: { updateTime: existing._updateTime } }
      );
      return true;
    } catch {
      return false;
    }
  }

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
    const users = await this.client.listDocuments<User>('pawako_users');
    return users.map(u => stripFirestoreMeta(u));
  }

  async getUserById(id: string): Promise<(User & { _updateTime?: string }) | null> {
    return this.client.getDocument<User>('pawako_users', id);
  }

  async canAccessAdmin(
    discordUserId: string,
    configuredAdminId: string
  ): Promise<{ authorized: boolean; reason?: string; isInitialAdmin?: boolean }> {
    const existing = await this.getUserById(discordUserId);
    if (existing) {
      if (existing.role === 'ADMINISTRATEUR' || existing.role === 'RESPONSABLE') {
        if (existing.status !== 'ACTIVE') {
          return {
            authorized: false,
            reason: `Le compte ${existing.role} (${discordUserId}) est actuellement suspendu ou inactif.`,
          };
        }
        return { authorized: true, isInitialAdmin: false };
      }
      return {
        authorized: false,
        reason: `Le compte Discord (ID: ${discordUserId}) possède le rôle ${existing.role} et n'est pas accrédité pour l'administration.`,
      };
    }

    const claimed = await this.isInitialAdminClaimed();
    if (!claimed && configuredAdminId && discordUserId === configuredAdminId.trim()) {
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
    const existingUser = await this.getUserById(discordUserId);
    if (existingUser && existingUser.status !== 'ACTIVE') {
      return {
        authorized: false,
        reason: 'Ce compte utilisateur est suspendu ou en attente de validation.',
      };
    }

    const referrer = await this.getReferrerByDiscordUserId(discordUserId);
    if (referrer) {
      const effStatus = getEffectiveReferrerStatus(referrer);
      if (effStatus === 'SUSPENDED') {
        return {
          authorized: false,
          reason: 'Votre profil parrain est actuellement suspendu par la Direction.',
        };
      }
      if (effStatus === 'ARCHIVED') {
        return {
          authorized: false,
          reason: 'Votre profil parrain a été archivé par la Direction.',
        };
      }
      return { authorized: true };
    }

    // L'inscription sur /parrain/login est ouverte à tout nouveau compte Discord valide
    return { authorized: true };
  }

  async upsertUser(
    user: Partial<User> & { id: string },
    configuredAdminId: string
  ): Promise<User> {
    const existing = await this.getUserById(user.id);
    const now = new Date().toISOString();

    if (existing) {
      const updated: User = {
        ...stripFirestoreMeta(existing),
        username: user.username || existing.username,
        displayName: user.displayName || existing.displayName,
        avatar: user.avatar !== undefined ? user.avatar : existing.avatar,
        lastLoginAt: now,
      };
      await this.client.setDocument('pawako_users', user.id, updated);
      return updated;
    }

    const cleanAdminId = (configuredAdminId || '').trim();
    const claimed = await this.isInitialAdminClaimed();
    const canClaim = !claimed && Boolean(cleanAdminId) && user.id === cleanAdminId;

    let assignedRole: UserRole = 'PARRAIN';
    if (canClaim) {
      try {
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
          claimedByUserId: user.id,
          message: 'Premier administrateur PAWAKO initialisé via INITIAL_ADMIN_DISCORD_ID.',
        },
      });
    }

    return newUser;
  }

  /**
   * Connexion et inscription ouverte idempotente des Parrains depuis /parrain/login :
   * - Si compte parrain existant : le retrouve et met à jour son profil Discord sans écraser son lien réel.
   * - Si suspendu ou archivé (user ou referrer) : refuse strictement (403) sans jamais réactiver automatiquement.
   * - Si Administrateur ou Responsable existant : conserve intégralement son rôle sans rétrogradation ni élévation.
   * - Si première inscription : crée atomiquement pawako_users (role='PARRAIN', status='ACTIVE') +
   *   pawako_referrers/ref-{discordId} + véritable invitation Discord sur le serveur RECRUTEMENT + audit log.
   * - Sécurisé contre les connexions simultanées du même Discord ID (préconditions atomiques Firestore).
   */
  async authenticateOrRegisterParrain(params: {
    discordUser: {
      id: string;
      username: string;
      displayName: string;
      avatar: string | null;
    };
    discordBotConfig?: DiscordBotConfig;
  }): Promise<{
    authorized: boolean;
    reason?: string;
    errorCode?: 'USER_SUSPENDED' | 'REFERRER_SUSPENDED' | 'REFERRER_ARCHIVED';
    user?: User;
    referrer?: Referrer;
    isNewRegistration?: boolean;
  }> {
    const { discordUser, discordBotConfig } = params;
    const now = new Date().toISOString();
    const deterministicRefId = `ref-${discordUser.id}`;

    const [existingUser, existingReferrer] = await Promise.all([
      this.getUserById(discordUser.id),
      this.getReferrerByDiscordUserId(discordUser.id),
    ]);

    // 1. Vérification stricte de suspension / archivage (aucune réactivation par reconnexion)
    if (existingUser && existingUser.status !== 'ACTIVE') {
      return {
        authorized: false,
        errorCode: 'USER_SUSPENDED',
        reason:
          "Votre compte PAWAKO est actuellement suspendu ou en attente d'approbation. Contactez la Direction pour le réactiver.",
      };
    }

    if (existingReferrer) {
      const refStatus = getEffectiveReferrerStatus(existingReferrer);
      if (refStatus === 'SUSPENDED') {
        return {
          authorized: false,
          errorCode: 'REFERRER_SUSPENDED',
          reason:
            'Votre profil parrain est actuellement suspendu par la Direction. Une simple reconnexion Discord ne peut pas le réactiver.',
        };
      }
      if (refStatus === 'ARCHIVED') {
        return {
          authorized: false,
          errorCode: 'REFERRER_ARCHIVED',
          reason:
            'Votre profil parrain a été archivé. Contactez un administrateur PAWAKO pour demander une restauration.',
        };
      }

      // 2. Parrain actif existant : retrouver et conserver le lien réel existant
      const userPayload: User = existingUser
        ? {
            ...stripFirestoreMeta(existingUser),
            username: discordUser.username || existingUser.username,
            displayName: discordUser.displayName || existingUser.displayName,
            avatar: discordUser.avatar !== undefined ? discordUser.avatar : existingUser.avatar,
            lastLoginAt: now,
          }
        : {
            id: discordUser.id,
            username: discordUser.username,
            displayName: discordUser.displayName,
            avatar: discordUser.avatar,
            role: 'PARRAIN',
            status: 'ACTIVE',
            createdAt: now,
            lastLoginAt: now,
          };

      let updatedReferrer: Referrer = {
        ...normalizeReferrerDocument(existingReferrer),
        discordUsername: discordUser.username || existingReferrer.discordUsername,
        discordDisplayName: discordUser.displayName || existingReferrer.discordDisplayName,
        avatar: discordUser.avatar !== undefined ? discordUser.avatar : existingReferrer.avatar || null,
        lastActivityAt: now,
        updatedAt: now,
      };

      const needsRealInvite =
        !updatedReferrer.inviteCode ||
        !updatedReferrer.inviteUrl ||
        isLegacyFakeInvite(updatedReferrer.inviteCode, updatedReferrer.inviteUrl) ||
        updatedReferrer.inviteStatus === 'EXPIRED_OR_DELETED' ||
        updatedReferrer.inviteStatus === 'UNCONFIGURED' ||
        updatedReferrer.inviteStatus === 'ERROR';

      let createdInviteResult: DiscordInviteCreationResult | null = null;
      if (needsRealInvite && discordBotConfig?.botToken && discordBotConfig?.recruitmentGuildId) {
        createdInviteResult = await createRecruitmentDiscordInvite({
          botToken: discordBotConfig.botToken,
          recruitmentGuildId: discordBotConfig.recruitmentGuildId,
          inviteChannelId: discordBotConfig.inviteChannelId,
          reason: `Lien parrainage PAWAKO pour ${discordUser.username} (${discordUser.id})`,
        });

        if (createdInviteResult.ok) {
          updatedReferrer = {
            ...updatedReferrer,
            inviteCode: createdInviteResult.code,
            inviteUrl: createdInviteResult.url,
            inviteStatus: 'ACTIVE',
            inviteChannelId: createdInviteResult.channelId,
            inviteError: null,
            inviteCreatedAt: now,
          };
        } else {
          updatedReferrer = {
            ...updatedReferrer,
            inviteStatus: createdInviteResult.inviteStatus,
            inviteError: createdInviteResult.errorMessage || createdInviteResult.errorCode || 'Erreur Discord',
          };
        }
      }

      const writes: Array<{
        collection: string;
        docId: string;
        data: Record<string, any>;
        precondition?: { exists?: boolean; updateTime?: string };
      }> = [
        {
          collection: 'pawako_users',
          docId: discordUser.id,
          data: userPayload,
          precondition: existingUser?._updateTime
            ? { updateTime: existingUser._updateTime }
            : !existingUser
            ? { exists: false }
            : undefined,
        },
        {
          collection: 'pawako_referrers',
          docId: updatedReferrer.id,
          data: stripFirestoreMeta(updatedReferrer),
        },
      ];

      if (createdInviteResult?.ok) {
        const inviteDoc: DiscordInviteRecord = {
          inviteCode: createdInviteResult.code,
          inviteUrl: createdInviteResult.url,
          guildId: createdInviteResult.guildId || discordBotConfig?.recruitmentGuildId || '',
          serverId: 'RECRUTEMENT',
          channelId: createdInviteResult.channelId,
          inviterDiscordUserId: discordUser.id,
          referrerId: updatedReferrer.id,
          active: true,
          createdAt: now,
          uses: 0,
        };
        writes.push({
          collection: 'pawako_discord_invites',
          docId: createdInviteResult.code,
          data: inviteDoc,
        });
      }

      try {
        await this.client.commit({ writes });
      } catch (err) {
        if (err instanceof FirestoreRestError && err.isPreconditionConflict) {
          // Concurrence : relire les documents gagnants
          if (createdInviteResult?.ok && discordBotConfig?.botToken) {
            await revokeDiscordInvite({
              botToken: discordBotConfig.botToken,
              inviteCode: createdInviteResult.code,
            }).catch(() => false);
          }
          const [freshUser, freshRef] = await Promise.all([
            this.getUserById(discordUser.id),
            this.getReferrerByDiscordUserId(discordUser.id),
          ]);
          if (freshUser && freshUser.status !== 'ACTIVE') {
            return {
              authorized: false,
              errorCode: 'USER_SUSPENDED',
              reason: 'Votre compte PAWAKO est suspendu.',
            };
          }
          if (freshRef && getEffectiveReferrerStatus(freshRef) !== 'ACTIVE') {
            return {
              authorized: false,
              errorCode:
                getEffectiveReferrerStatus(freshRef) === 'ARCHIVED'
                  ? 'REFERRER_ARCHIVED'
                  : 'REFERRER_SUSPENDED',
              reason: 'Votre profil parrain est suspendu ou archivé.',
            };
          }
          return {
            authorized: true,
            user: freshUser ? stripFirestoreMeta(freshUser) : userPayload,
            referrer: freshRef ? normalizeReferrerDocument(freshRef) : updatedReferrer,
            isNewRegistration: false,
          };
        }
        throw err;
      }

      return {
        authorized: true,
        user: userPayload,
        referrer: updatedReferrer,
        isNewRegistration: false,
      };
    }

    // 3. Première inscription parrain : création idempotente et atomique
    // Un nouvel inscrit ne peut jamais choisir son rôle ; un admin/responsable existant conserve son rôle.
    const assignedRole: UserRole = existingUser ? existingUser.role : 'PARRAIN';
    const userPayload: User = existingUser
      ? {
          ...stripFirestoreMeta(existingUser),
          username: discordUser.username || existingUser.username,
          displayName: discordUser.displayName || existingUser.displayName,
          avatar: discordUser.avatar !== undefined ? discordUser.avatar : existingUser.avatar,
          lastLoginAt: now,
        }
      : {
          id: discordUser.id,
          username: discordUser.username,
          displayName: discordUser.displayName,
          avatar: discordUser.avatar,
          role: assignedRole,
          status: 'ACTIVE',
          createdAt: now,
          lastLoginAt: now,
        };

    // Générer une véritable invitation Discord unique vers RECRUTEMENT (sans jamais fabriquer de faux code PWK-)
    const inviteResult = await createRecruitmentDiscordInvite({
      botToken: discordBotConfig?.botToken,
      recruitmentGuildId: discordBotConfig?.recruitmentGuildId,
      inviteChannelId: discordBotConfig?.inviteChannelId,
      reason: `Inscription parrain PAWAKO : ${discordUser.username} (${discordUser.id})`,
    });

    const newReferrer: Referrer = {
      id: deterministicRefId,
      discordUserId: discordUser.id,
      discordUsername: discordUser.username,
      discordDisplayName: discordUser.displayName,
      avatar: discordUser.avatar,
      inviteCode: inviteResult.ok ? inviteResult.code : '',
      inviteUrl: inviteResult.ok ? inviteResult.url : '',
      inviteStatus: inviteResult.ok ? 'ACTIVE' : inviteResult.inviteStatus,
      inviteChannelId: inviteResult.channelId || null,
      inviteError: inviteResult.ok ? null : inviteResult.errorMessage || inviteResult.errorCode || null,
      inviteCreatedAt: inviteResult.ok ? now : null,
      usesCount: 0,
      isActive: true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      notes: '',
    };

    const writes: Array<{
      collection: string;
      docId: string;
      data: Record<string, any>;
      precondition?: { exists?: boolean; updateTime?: string };
    }> = [
      {
        collection: 'pawako_users',
        docId: discordUser.id,
        data: userPayload,
        precondition: existingUser
          ? existingUser._updateTime
            ? { updateTime: existingUser._updateTime }
            : undefined
          : { exists: false },
      },
      {
        collection: 'pawako_referrers',
        docId: deterministicRefId,
        data: newReferrer,
        precondition: { exists: false },
      },
    ];

    if (inviteResult.ok) {
      const inviteDoc: DiscordInviteRecord = {
        inviteCode: inviteResult.code,
        inviteUrl: inviteResult.url,
        guildId: inviteResult.guildId || discordBotConfig?.recruitmentGuildId || '',
        serverId: 'RECRUTEMENT',
        channelId: inviteResult.channelId,
        inviterDiscordUserId: discordUser.id,
        referrerId: deterministicRefId,
        active: true,
        createdAt: now,
        uses: 0,
      };
      writes.push({
        collection: 'pawako_discord_invites',
        docId: inviteResult.code,
        data: inviteDoc,
      });
    }

    try {
      await this.client.commit({ writes });
    } catch (err) {
      if (err instanceof FirestoreRestError && err.isPreconditionConflict) {
        // Une requête concurrente vient de créer le profil pour ce même Discord ID :
        // nettoyer l'invitation supplémentaire créée en double, puis relire le profil gagnant.
        if (inviteResult.ok && discordBotConfig?.botToken) {
          await revokeDiscordInvite({
            botToken: discordBotConfig.botToken,
            inviteCode: inviteResult.code,
          }).catch(() => false);
        }

        const [winnerUser, winnerRef] = await Promise.all([
          this.getUserById(discordUser.id),
          this.getReferrerByDiscordUserId(discordUser.id),
        ]);

        if (winnerUser && winnerUser.status !== 'ACTIVE') {
          return {
            authorized: false,
            errorCode: 'USER_SUSPENDED',
            reason: 'Votre compte PAWAKO est suspendu.',
          };
        }
        if (winnerRef && getEffectiveReferrerStatus(winnerRef) !== 'ACTIVE') {
          const eff = getEffectiveReferrerStatus(winnerRef);
          return {
            authorized: false,
            errorCode: eff === 'ARCHIVED' ? 'REFERRER_ARCHIVED' : 'REFERRER_SUSPENDED',
            reason: 'Votre profil parrain est suspendu ou archivé.',
          };
        }

        if (winnerUser && winnerRef) {
          return {
            authorized: true,
            user: stripFirestoreMeta(winnerUser),
            referrer: normalizeReferrerDocument(winnerRef),
            isNewRegistration: false,
          };
        }
      }
      throw err;
    }

    await this.logAudit({
      action: 'PARRAIN_SELF_REGISTERED',
      actorUserId: discordUser.id,
      actorName: discordUser.displayName,
      targetType: 'REFERRER',
      targetId: deterministicRefId,
      details: {
        discordUserId: discordUser.id,
        username: discordUser.username,
        roleAssigned: assignedRole,
        inviteStatus: newReferrer.inviteStatus,
        inviteCode: newReferrer.inviteCode || null,
        inviteError: newReferrer.inviteError || null,
      },
    });

    return {
      authorized: true,
      user: userPayload,
      referrer: newReferrer,
      isNewRegistration: true,
    };
  }

  /**
   * Exécute une mutation atomique d'un utilisateur et de l'état système des administrateurs actifs.
   */
  private async executeAtomicAdminUserMutation(
    userId: string,
    mutate: (user: User, currentAdmins: string[]) => { updatedUser: User; newAdmins: string[] }
  ): Promise<User | null> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const transaction = await this.client.beginTransaction();
        const user = await this.client.getDocument<User>('pawako_users', userId, { transaction });
        if (!user) {
          return null;
        }

        const meta = await this.client.getDocument<{
          initialAdminClaimed?: boolean;
          initialAdminClaimedAt?: string | null;
          initialAdminDiscordUserId?: string | null;
          activeAdminDiscordUserIds?: string[];
          _updateTime?: string;
        }>('pawako_metadata', 'system', { transaction });

        let currentAdmins: string[] = Array.isArray(meta?.activeAdminDiscordUserIds)
          ? [...meta.activeAdminDiscordUserIds]
          : [];

        if (currentAdmins.length === 0) {
          const allUsers = await this.getUsers();
          currentAdmins = allUsers
            .filter(u => u.role === 'ADMINISTRATEUR' && u.status === 'ACTIVE')
            .map(u => u.id);
          if (currentAdmins.length === 0 && meta?.initialAdminDiscordUserId) {
            currentAdmins = [meta.initialAdminDiscordUserId];
          }
        }

        const { updatedUser, newAdmins } = mutate(stripFirestoreMeta(user), currentAdmins);

        const wasActiveAdmin = user.role === 'ADMINISTRATEUR' && user.status === 'ACTIVE';
        const willBeActiveAdmin = updatedUser.role === 'ADMINISTRATEUR' && updatedUser.status === 'ACTIVE';
        if (wasActiveAdmin && !willBeActiveAdmin) {
          if (newAdmins.length === 0) {
            throw new Error(
              'Action refusée : impossible de rétrograder ou désactiver le dernier administrateur actif du système.'
            );
          }
        }

        const writes: Array<{
          collection: string;
          docId: string;
          data: Record<string, any>;
          precondition?: { exists?: boolean; updateTime?: string };
        }> = [];

        writes.push({
          collection: 'pawako_users',
          docId: userId,
          data: updatedUser,
          precondition: user._updateTime ? { updateTime: user._updateTime } : undefined,
        });

        const adminsChanged =
          newAdmins.length !== currentAdmins.length ||
          newAdmins.some((id, idx) => id !== currentAdmins[idx]);

        if (adminsChanged || !meta) {
          const updateMetaPayload = {
            initialAdminClaimed: Boolean(meta?.initialAdminClaimed),
            initialAdminClaimedAt: meta?.initialAdminClaimedAt || null,
            initialAdminDiscordUserId: meta?.initialAdminDiscordUserId || null,
            activeAdminDiscordUserIds: newAdmins,
            lastUpdated: new Date().toISOString(),
          };

          writes.push({
            collection: 'pawako_metadata',
            docId: 'system',
            data: updateMetaPayload,
            precondition: meta?._updateTime
              ? { updateTime: meta._updateTime }
              : meta === null
              ? { exists: false }
              : undefined,
          });
        }

        await this.client.commit({
          transaction,
          writes,
        });

        return updatedUser;
      } catch (err: any) {
        lastError = err;
        if (err.message && err.message.includes('dernier administrateur actif')) {
          throw err;
        }

        if (attempt === maxRetries - 1) {
          throw new Error(
            `Conflit concurrent lors de la mise à jour atomique de l administrateur : ${err.message}`
          );
        }
        await new Promise(r => setTimeout(r, 60 * (attempt + 1)));
      }
    }

    throw lastError || new Error('Échec de la transaction atomique.');
  }

  async updateUserRole(
    userId: string,
    newRole: UserRole,
    actorId: string,
    actorName: string
  ): Promise<User | null> {
    const updatedUser = await this.executeAtomicAdminUserMutation(userId, (user, currentAdmins) => {
      let newAdmins = [...currentAdmins];
      const isCurrentlyActiveAdmin = user.role === 'ADMINISTRATEUR' && user.status === 'ACTIVE';
      const willBeActiveAdmin = newRole === 'ADMINISTRATEUR' && user.status === 'ACTIVE';

      if (isCurrentlyActiveAdmin && !willBeActiveAdmin) {
        newAdmins = currentAdmins.filter(id => id !== userId);
      } else if (!isCurrentlyActiveAdmin && willBeActiveAdmin) {
        newAdmins = Array.from(new Set([...currentAdmins, userId]));
      }

      const updated: User = {
        ...user,
        role: newRole,
      };

      return { updatedUser: updated, newAdmins };
    });

    if (updatedUser) {
      await this.logAudit({
        action: 'USER_ROLE_CHANGE',
        actorUserId: actorId,
        actorName,
        targetType: 'USER',
        targetId: userId,
        details: { newRole },
      });
    }

    return updatedUser;
  }

  async updateUserStatus(
    userId: string,
    newStatus: UserStatus,
    actorId: string,
    actorName: string
  ): Promise<User | null> {
    const updatedUser = await this.executeAtomicAdminUserMutation(userId, (user, currentAdmins) => {
      let newAdmins = [...currentAdmins];
      const isCurrentlyActiveAdmin = user.role === 'ADMINISTRATEUR' && user.status === 'ACTIVE';
      const willBeActiveAdmin = user.role === 'ADMINISTRATEUR' && newStatus === 'ACTIVE';

      if (isCurrentlyActiveAdmin && !willBeActiveAdmin) {
        newAdmins = currentAdmins.filter(id => id !== userId);
      } else if (!isCurrentlyActiveAdmin && willBeActiveAdmin) {
        newAdmins = Array.from(new Set([...currentAdmins, userId]));
      }

      const updated: User = {
        ...user,
        status: newStatus,
      };

      return { updatedUser: updated, newAdmins };
    });

    if (updatedUser) {
      await this.logAudit({
        action: 'USER_STATUS_CHANGE',
        actorUserId: actorId,
        actorName,
        targetType: 'USER',
        targetId: userId,
        details: { newStatus },
      });
    }

    return updatedUser;
  }

  // --- PARRAINS (REFERRERS) & STATISTIQUES DÉRIVÉES ---

  async getReferrers(): Promise<Referrer[]> {
    const raw = await this.client.listDocuments<Referrer>('pawako_referrers');
    return raw.map(normalizeReferrerDocument);
  }

  private enrichReferrerWithCandidates(ref: Referrer, allCandidates: Candidate[]): Referrer {
    const normalized = normalizeReferrerDocument(ref);
    const filleuls = allCandidates.filter(
      c => c.referrerId === normalized.id || c.referrerDiscordUserId === normalized.discordUserId
    );
    const totalFilleuls = filleuls.length;
    const enAttente = filleuls.filter(c => c.adminStatus === 'EN_ATTENTE').length;
    const acceptes = filleuls.filter(c => c.adminStatus === 'ACCEPTE').length;
    const enFormation = filleuls.filter(c => c.operationalStatus === 'FORMATION').length;
    const enSimulation = filleuls.filter(c => c.operationalStatus === 'SIMULATION').length;
    const valides = filleuls.filter(c => c.operationalStatus === 'VALIDE').length;
    const enProduction = filleuls.filter(c => c.operationalStatus === 'PRODUCTION').length;
    const refuses = filleuls.filter(c => c.adminStatus === 'REFUSE').length;
    const abandonnes = filleuls.filter(c => c.adminStatus === 'ABANDONNE').length;
    const chatteurCount = filleuls.filter(c => c.vaType === 'CHATTEUR').length;
    const instagramCount = filleuls.filter(c => c.vaType === 'INSTAGRAM').length;
    const conversionRate = totalFilleuls > 0 ? Math.round((enProduction / totalFilleuls) * 100) : 0;
    const acceptanceRate = totalFilleuls > 0 ? Math.round(((totalFilleuls - refuses) / totalFilleuls) * 100) : 0;

    return {
      ...normalized,
      usesCount: totalFilleuls,
      totalFilleuls,
      enAttente,
      acceptes,
      enFormation,
      enSimulation,
      valides,
      enProduction,
      refuses,
      abandonnes,
      conversionRate,
      acceptanceRate,
      chatteurCount,
      instagramCount,
    };
  }

  async getReferrersWithStats(options?: {
    status?: ReferrerStatus | 'ALL';
    search?: string;
  }): Promise<Referrer[]> {
    const [referrers, candidates] = await Promise.all([
      this.getReferrers(),
      this.client.listDocuments<Candidate>('pawako_candidates'),
    ]);

    let enriched = referrers.map(r => this.enrichReferrerWithCandidates(r, candidates));

    if (options?.status && options.status !== 'ALL') {
      enriched = enriched.filter(r => getEffectiveReferrerStatus(r) === options.status);
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      enriched = enriched.filter(
        r =>
          r.discordDisplayName.toLowerCase().includes(q) ||
          r.discordUsername.toLowerCase().includes(q) ||
          r.discordUserId.includes(q) ||
          (r.inviteCode && r.inviteCode.toLowerCase().includes(q))
      );
    }

    enriched.sort((a, b) => {
      const statusOrder: Record<ReferrerStatus, number> = { ACTIVE: 0, SUSPENDED: 1, ARCHIVED: 2 };
      const sa = statusOrder[getEffectiveReferrerStatus(a)];
      const sb = statusOrder[getEffectiveReferrerStatus(b)];
      if (sa !== sb) return sa - sb;
      return (b.totalFilleuls || 0) - (a.totalFilleuls || 0);
    });

    return enriched;
  }

  async getReferrerById(id: string): Promise<Referrer | null> {
    const raw = await this.client.getDocument<Referrer>('pawako_referrers', id);
    return raw ? normalizeReferrerDocument(raw) : null;
  }

  async getReferrerByDiscordUserId(discordUserId: string): Promise<Referrer | null> {
    // Vérifie en priorité l'ID déterministe puis recherche par scan en compatibilité avec d'anciens IDs aléatoires
    const direct = await this.getReferrerById(`ref-${discordUserId}`);
    if (direct && direct.discordUserId === discordUserId) {
      return direct;
    }
    const referrers = await this.getReferrers();
    return referrers.find(r => r.discordUserId === discordUserId) || null;
  }

  async getReferrerByInviteCode(inviteCode: string): Promise<Referrer | null> {
    const matches = await this.findReferrersByInviteCode(inviteCode);
    return matches[0] || null;
  }

  async findReferrersByInviteCode(inviteCode: string): Promise<Referrer[]> {
    const clean = (inviteCode || '').trim();
    if (!clean) return [];
    const referrers = await this.getReferrers();
    const exactMatches = referrers.filter(r => r.inviteCode && r.inviteCode === clean);
    if (exactMatches.length > 0) return exactMatches;

    const upper = clean.toUpperCase();
    return referrers.filter(r => r.inviteCode && r.inviteCode.toUpperCase() === upper);
  }

  async createReferrer(params: {
    discordUserId: string;
    inviteCode?: string;
    notes?: string;
    actorUserId?: string;
    actorName?: string;
    discordBotConfig?: DiscordBotConfig;
  }): Promise<Referrer> {
    const cleanDiscordId = params.discordUserId.trim();
    if (!/^\d{17,20}$/.test(cleanDiscordId)) {
      throw new Error('Discord User ID invalide (Snowflake numérique 17-20 chiffres requis).');
    }

    const existing = await this.getReferrerByDiscordUserId(cleanDiscordId);
    if (existing) {
      return existing;
    }

    const user = await this.getUserById(cleanDiscordId);
    const username = user ? user.username : `user_${cleanDiscordId.slice(-4)}`;
    const displayName = user ? user.displayName : `Parrain ${cleanDiscordId.slice(-4)}`;
    const now = new Date().toISOString();
    const id = `ref-${cleanDiscordId}`;

    let finalInviteCode = '';
    let finalInviteUrl = '';
    let finalInviteStatus: Referrer['inviteStatus'] = 'UNCONFIGURED';
    let finalInviteChannelId: string | null = null;
    let finalInviteError: string | null = null;
    let finalInviteCreatedAt: string | null = null;

    if (params.inviteCode && params.inviteCode.trim()) {
      const extracted = extractDiscordInviteCode(params.inviteCode.trim());
      if (!extracted) {
        throw new Error(
          'Code ou lien d invitation Discord invalide : les codes factices (ex: PWK-...) sont refusés. Fournissez un vrai code discord.gg ou laissez vide pour génération automatique par le bot.'
        );
      }

      if (params.discordBotConfig?.botToken) {
        const verification = await verifyDiscordInvite({
          botToken: params.discordBotConfig.botToken,
          inviteCode: extracted,
          expectedGuildId: params.discordBotConfig.recruitmentGuildId,
        });
        if (!verification.valid) {
          throw new Error(
            verification.errorMessage || "Le code d invitation Discord saisi n'est pas actif sur le serveur Recrutement."
          );
        }
        finalInviteCode = verification.code;
        finalInviteUrl = verification.url;
        finalInviteChannelId = verification.channelId;
        finalInviteStatus = 'ACTIVE';
        finalInviteCreatedAt = now;
      } else {
        finalInviteCode = extracted;
        finalInviteUrl = `https://discord.gg/${extracted}`;
        finalInviteStatus = 'ACTIVE';
        finalInviteCreatedAt = now;
      }
    } else {
      // Génération réelle via Bot Discord (sans jamais fabriquer de faux code PWK-)
      const inviteRes = await createRecruitmentDiscordInvite({
        botToken: params.discordBotConfig?.botToken,
        recruitmentGuildId: params.discordBotConfig?.recruitmentGuildId,
        inviteChannelId: params.discordBotConfig?.inviteChannelId,
        reason: `Création profil parrain PAWAKO (${cleanDiscordId})`,
      });
      if (inviteRes.ok) {
        finalInviteCode = inviteRes.code;
        finalInviteUrl = inviteRes.url;
        finalInviteStatus = 'ACTIVE';
        finalInviteChannelId = inviteRes.channelId;
        finalInviteCreatedAt = now;
      } else {
        finalInviteStatus = inviteRes.inviteStatus;
        finalInviteChannelId = inviteRes.channelId;
        finalInviteError = inviteRes.errorMessage || inviteRes.errorCode || 'Configuration Discord manquante';
      }
    }

    const newReferrer: Referrer = {
      id,
      discordUserId: cleanDiscordId,
      discordUsername: username,
      discordDisplayName: displayName,
      avatar: user?.avatar || null,
      inviteCode: finalInviteCode,
      inviteUrl: finalInviteUrl,
      inviteStatus: finalInviteStatus,
      inviteChannelId: finalInviteChannelId,
      inviteError: finalInviteError,
      inviteCreatedAt: finalInviteCreatedAt,
      usesCount: 0,
      isActive: true,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      notes: params.notes?.trim() || '',
    };

    try {
      await this.client.setDocument('pawako_referrers', id, newReferrer, {
        precondition: { exists: false },
      });
    } catch (err) {
      if (err instanceof FirestoreRestError && err.isPreconditionConflict) {
        const winner = await this.getReferrerByDiscordUserId(cleanDiscordId);
        if (winner) return winner;
      }
      throw err;
    }

    if (finalInviteCode && finalInviteStatus === 'ACTIVE') {
      await this.client
        .setDocument('pawako_discord_invites', finalInviteCode, {
          inviteCode: finalInviteCode,
          inviteUrl: finalInviteUrl,
          guildId: params.discordBotConfig?.recruitmentGuildId || '',
          serverId: 'RECRUTEMENT',
          channelId: finalInviteChannelId,
          inviterDiscordUserId: cleanDiscordId,
          referrerId: id,
          active: true,
          createdAt: now,
          uses: 0,
        })
        .catch(() => null);
    }

    if (params.actorUserId) {
      await this.logAudit({
        action: 'REFERRER_CREATED',
        actorUserId: params.actorUserId,
        actorName: params.actorName || 'Système',
        targetType: 'REFERRER',
        targetId: id,
        details: {
          code: finalInviteCode || null,
          inviteStatus: finalInviteStatus,
          inviteError: finalInviteError,
          discordUserId: cleanDiscordId,
          displayName,
        },
      });
    }

    return newReferrer;
  }

  async analyzeReferrerDependencies(referrerId: string): Promise<ReferrerDependencySummary> {
    const ref = await this.getReferrerById(referrerId);
    const [candidates, attributions] = await Promise.all([
      this.client.listDocuments<Candidate>('pawako_candidates'),
      this.client.listDocuments<ReferralAttributionHistoryEntry>('pawako_referral_attributions_history'),
    ]);

    const linkedCandidatesCount = candidates.filter(
      c => c.referrerId === referrerId || (ref && c.referrerDiscordUserId === ref.discordUserId)
    ).length;

    const attributionHistoryCount = attributions.filter(
      a => a.oldReferrerId === referrerId || a.newReferrerId === referrerId
    ).length;

    const canPhysicallyDelete = linkedCandidatesCount === 0 && attributionHistoryCount === 0;
    const blockingReasons: string[] = [];
    if (linkedCandidatesCount > 0) {
      blockingReasons.push(`${linkedCandidatesCount} candidat(s) rattaché(s)`);
    }
    if (attributionHistoryCount > 0) {
      blockingReasons.push(`${attributionHistoryCount} historique(s) d'attribution`);
    }

    return {
      referrerId,
      linkedCandidatesCount,
      attributionHistoryCount,
      canPhysicallyDelete,
      blockingReason: canPhysicallyDelete
        ? null
        : `Suppression physique bloquée pour préserver l'intégrité : ${blockingReasons.join(' et ')}. Utilisez l'archivage.`,
    };
  }

  async getReferrerDetails(id: string): Promise<{
    referrer: Referrer;
    filleuls: Candidate[];
    dependencies: ReferrerDependencySummary;
    history: AuditLog[];
  } | null> {
    const raw = await this.getReferrerById(id);
    if (!raw) return null;

    const [candidates, attributions, logs] = await Promise.all([
      this.client.listDocuments<Candidate>('pawako_candidates'),
      this.client.listDocuments<ReferralAttributionHistoryEntry>('pawako_referral_attributions_history'),
      this.getAuditLogs(200),
    ]);

    const enriched = this.enrichReferrerWithCandidates(raw, candidates);
    const filleuls = candidates
      .filter(c => c.referrerId === id || c.referrerDiscordUserId === raw.discordUserId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const linkedCandidatesCount = filleuls.length;
    const attributionHistoryCount = attributions.filter(
      a => a.oldReferrerId === id || a.newReferrerId === id
    ).length;
    const canPhysicallyDelete = linkedCandidatesCount === 0 && attributionHistoryCount === 0;

    const blockingReasons: string[] = [];
    if (linkedCandidatesCount > 0) blockingReasons.push(`${linkedCandidatesCount} candidat(s) rattaché(s)`);
    if (attributionHistoryCount > 0) blockingReasons.push(`${attributionHistoryCount} historique(s) d'attribution`);

    const history = logs.filter(
      l =>
        l.targetId === id ||
        l.targetId === raw.discordUserId ||
        l.details?.referrerId === id ||
        l.details?.newReferrerId === id
    );

    return {
      referrer: enriched,
      filleuls,
      dependencies: {
        referrerId: id,
        linkedCandidatesCount,
        attributionHistoryCount,
        canPhysicallyDelete,
        blockingReason: canPhysicallyDelete
          ? null
          : `Suppression physique bloquée : ${blockingReasons.join(' et ')}.`,
      },
      history,
    };
  }

  async updateReferrer(
    id: string,
    patch: { notes?: string; discordDisplayName?: string; discordUsername?: string },
    actor: { id: string; displayName: string }
  ): Promise<Referrer | null> {
    const raw = await this.client.getDocument<Referrer>('pawako_referrers', id);
    if (!raw) return null;

    const now = new Date().toISOString();
    const cleanedExisting = stripFirestoreMeta(raw);
    const changes: Record<string, { from: any; to: any }> = {};

    const updated: Referrer = {
      ...cleanedExisting,
      updatedAt: now,
    };

    if (patch.notes !== undefined && patch.notes !== raw.notes) {
      changes.notes = { from: raw.notes || '', to: patch.notes };
      updated.notes = patch.notes;
    }
    if (patch.discordDisplayName !== undefined && patch.discordDisplayName.trim()) {
      const nextName = patch.discordDisplayName.trim();
      if (nextName !== raw.discordDisplayName) {
        changes.discordDisplayName = { from: raw.discordDisplayName, to: nextName };
        updated.discordDisplayName = nextName;
      }
    }
    if (patch.discordUsername !== undefined && patch.discordUsername.trim()) {
      const nextUsername = patch.discordUsername.trim();
      if (nextUsername !== raw.discordUsername) {
        changes.discordUsername = { from: raw.discordUsername, to: nextUsername };
        updated.discordUsername = nextUsername;
      }
    }

    await this.client.setDocument('pawako_referrers', id, updated, {
      precondition: raw._updateTime ? { updateTime: raw._updateTime } : undefined,
    });

    await this.logAudit({
      action: 'REFERRER_UPDATED',
      actorUserId: actor.id,
      actorName: actor.displayName,
      targetType: 'REFERRER',
      targetId: id,
      details: { changes },
    });

    const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
    return this.enrichReferrerWithCandidates(updated, candidates);
  }

  async setReferrerStatus(
    id: string,
    targetStatus: ReferrerStatus,
    reason: string | undefined,
    actor: { id: string; displayName: string }
  ): Promise<Referrer | null> {
    const raw = await this.client.getDocument<Referrer>('pawako_referrers', id);
    if (!raw) return null;

    const previousStatus = getEffectiveReferrerStatus(raw);
    const now = new Date().toISOString();
    const cleanReason = reason?.trim() || null;

    const updated: Referrer = {
      ...stripFirestoreMeta(raw),
      status: targetStatus,
      isActive: targetStatus === 'ACTIVE',
      updatedAt: now,
    };

    if (targetStatus === 'SUSPENDED') {
      updated.suspendedAt = now;
      updated.suspendedByUserId = actor.id;
      updated.suspendReason = cleanReason;
    } else if (targetStatus === 'ARCHIVED') {
      updated.archivedAt = now;
      updated.archivedByUserId = actor.id;
      updated.archiveReason = cleanReason;
    } else if (targetStatus === 'ACTIVE') {
      updated.restoredAt = now;
      updated.restoredByUserId = actor.id;
    }

    await this.client.setDocument('pawako_referrers', id, updated, {
      precondition: raw._updateTime ? { updateTime: raw._updateTime } : undefined,
    });

    // Synchroniser prudemment pawako_users UNIQUEMENT si l'utilisateur a le rôle PARRAIN
    // (ne jamais altérer un compte ADMINISTRATEUR ou RESPONSABLE via la gestion des parrains)
    const linkedUser = await this.getUserById(raw.discordUserId);
    if (linkedUser && linkedUser.role === 'PARRAIN') {
      const targetUserStatus: UserStatus = targetStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';
      if (linkedUser.status !== targetUserStatus) {
        await this.client.setDocument(
          'pawako_users',
          linkedUser.id,
          {
            ...stripFirestoreMeta(linkedUser),
            status: targetUserStatus,
          },
          { precondition: linkedUser._updateTime ? { updateTime: linkedUser._updateTime } : undefined }
        );
      }
    }

    const actionMap: Record<ReferrerStatus, string> = {
      ACTIVE: previousStatus === 'ARCHIVED' ? 'REFERRER_RESTORED' : previousStatus === 'SUSPENDED' ? 'REFERRER_REACTIVATED' : 'REFERRER_ACTIVATED',
      SUSPENDED: 'REFERRER_SUSPENDED',
      ARCHIVED: 'REFERRER_ARCHIVED',
    };

    await this.logAudit({
      action: actionMap[targetStatus],
      actorUserId: actor.id,
      actorName: actor.displayName,
      targetType: 'REFERRER',
      targetId: id,
      details: {
        previousStatus,
        newStatus: targetStatus,
        reason: cleanReason,
        discordUserId: raw.discordUserId,
      },
    });

    const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
    return this.enrichReferrerWithCandidates(updated, candidates);
  }

  async toggleReferrer(id: string, actorId: string, actorName: string): Promise<Referrer | null> {
    const ref = await this.getReferrerById(id);
    if (!ref) return null;
    const eff = getEffectiveReferrerStatus(ref);
    if (eff === 'ARCHIVED') {
      throw new Error("Impossible d'activer/suspendre un parrain archivé sans le restaurer d'abord.");
    }
    const nextStatus: ReferrerStatus = eff === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    return this.setReferrerStatus(id, nextStatus, undefined, { id: actorId, displayName: actorName });
  }

  async regenerateReferrerInvite(
    id: string,
    params: {
      discordBotConfig?: DiscordBotConfig;
      manualInviteCode?: string;
      actorUserId: string;
      actorName: string;
    }
  ): Promise<{
    referrer: Referrer;
    ok: boolean;
    errorCode?: string;
    errorMessage?: string;
  } | null> {
    const raw = await this.client.getDocument<Referrer>('pawako_referrers', id);
    if (!raw) return null;

    if (getEffectiveReferrerStatus(raw) === 'ARCHIVED') {
      throw new Error('Impossible de régénérer le lien d un parrain archivé.');
    }

    const now = new Date().toISOString();
    const oldInviteCode = raw.inviteCode || '';
    let updated = normalizeReferrerDocument(raw);
    let ok = false;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    if (params.manualInviteCode && params.manualInviteCode.trim()) {
      const extracted = extractDiscordInviteCode(params.manualInviteCode.trim());
      if (!extracted) {
        throw new Error(
          'Lien ou code Discord invalide. Les anciens codes factices (PWK-...) ne sont pas acceptés.'
        );
      }

      if (params.discordBotConfig?.botToken) {
        const verified = await verifyDiscordInvite({
          botToken: params.discordBotConfig.botToken,
          inviteCode: extracted,
          expectedGuildId: params.discordBotConfig.recruitmentGuildId,
        });
        if (!verified.valid) {
          throw new Error(verified.errorMessage || 'Invitation Discord introuvable ou expirée.');
        }
        updated = {
          ...updated,
          inviteCode: verified.code,
          inviteUrl: verified.url,
          inviteStatus: 'ACTIVE',
          inviteChannelId: verified.channelId,
          inviteError: null,
          inviteCreatedAt: now,
          updatedAt: now,
        };
      } else {
        updated = {
          ...updated,
          inviteCode: extracted,
          inviteUrl: `https://discord.gg/${extracted}`,
          inviteStatus: 'ACTIVE',
          inviteError: null,
          inviteCreatedAt: now,
          updatedAt: now,
        };
      }
      ok = true;
    } else {
      const inviteRes = await createRecruitmentDiscordInvite({
        botToken: params.discordBotConfig?.botToken,
        recruitmentGuildId: params.discordBotConfig?.recruitmentGuildId,
        inviteChannelId: params.discordBotConfig?.inviteChannelId,
        reason: `Régénération lien parrainage PAWAKO par ${params.actorName}`,
      });

      if (inviteRes.ok) {
        ok = true;
        updated = {
          ...updated,
          inviteCode: inviteRes.code,
          inviteUrl: inviteRes.url,
          inviteStatus: 'ACTIVE',
          inviteChannelId: inviteRes.channelId,
          inviteError: null,
          inviteCreatedAt: now,
          updatedAt: now,
        };
      } else {
        ok = false;
        errorCode = inviteRes.errorCode;
        errorMessage = inviteRes.errorMessage;
        updated = {
          ...updated,
          inviteStatus: inviteRes.inviteStatus,
          inviteError: inviteRes.errorMessage || inviteRes.errorCode || 'Erreur Discord',
          updatedAt: now,
        };
      }
    }

    await this.client.setDocument('pawako_referrers', id, stripFirestoreMeta(updated));

    if (ok && updated.inviteCode) {
      if (oldInviteCode && oldInviteCode !== updated.inviteCode && !isLegacyFakeInvite(oldInviteCode)) {
        const oldInviteDoc = await this.client.getDocument<DiscordInviteRecord>(
          'pawako_discord_invites',
          oldInviteCode
        );
        if (oldInviteDoc) {
          await this.client
            .setDocument('pawako_discord_invites', oldInviteCode, {
              ...stripFirestoreMeta(oldInviteDoc),
              active: false,
              deletedAt: now,
            })
            .catch(() => null);
        }
      }

      await this.client
        .setDocument('pawako_discord_invites', updated.inviteCode, {
          inviteCode: updated.inviteCode,
          inviteUrl: updated.inviteUrl,
          guildId: params.discordBotConfig?.recruitmentGuildId || '',
          serverId: 'RECRUTEMENT',
          channelId: updated.inviteChannelId || null,
          inviterDiscordUserId: updated.discordUserId,
          referrerId: updated.id,
          active: true,
          createdAt: now,
          uses: 0,
        })
        .catch(() => null);
    }

    await this.logAudit({
      action: ok ? 'REFERRER_INVITE_REGENERATED' : 'REFERRER_INVITE_ERROR',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'REFERRER',
      targetId: id,
      details: {
        previousInviteCode: oldInviteCode || null,
        newInviteCode: ok ? updated.inviteCode : null,
        inviteStatus: updated.inviteStatus,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
      },
    });

    const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
    return {
      referrer: this.enrichReferrerWithCandidates(updated, candidates),
      ok,
      errorCode,
      errorMessage,
    };
  }

  async ensureParrainInvite(
    discordUserId: string,
    discordBotConfig?: DiscordBotConfig
  ): Promise<{ referrer: Referrer; ok: boolean; errorCode?: string; errorMessage?: string } | null> {
    const ref = await this.getReferrerByDiscordUserId(discordUserId);
    if (!ref) return null;

    if (getEffectiveReferrerStatus(ref) !== 'ACTIVE') {
      throw new Error('Votre profil parrain est suspendu ou archivé.');
    }

    // Si le parrain possède déjà un vrai code Discord, vérifier auprès de Discord qu'il est toujours actif
    if (ref.inviteCode && ref.inviteUrl && !isLegacyFakeInvite(ref.inviteCode, ref.inviteUrl) && ref.inviteStatus === 'ACTIVE') {
      if (discordBotConfig?.botToken) {
        const verification = await verifyDiscordInvite({
          botToken: discordBotConfig.botToken,
          inviteCode: ref.inviteCode,
          expectedGuildId: discordBotConfig.recruitmentGuildId,
        });
        if (verification.valid) {
          const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
          return { referrer: this.enrichReferrerWithCandidates(ref, candidates), ok: true };
        }
        // Si l'invitation a expiré ou été supprimée sur Discord, régénérer proprement
        if (verification.inviteStatus !== 'EXPIRED_OR_DELETED') {
          const updatedErr: Referrer = {
            ...stripFirestoreMeta(ref),
            inviteStatus: verification.inviteStatus,
            inviteError: verification.errorMessage || null,
            updatedAt: new Date().toISOString(),
          };
          await this.client.setDocument('pawako_referrers', ref.id, updatedErr);
          const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
          return {
            referrer: this.enrichReferrerWithCandidates(updatedErr, candidates),
            ok: false,
            errorMessage: verification.errorMessage,
          };
        }
      } else {
        const candidates = await this.client.listDocuments<Candidate>('pawako_candidates');
        return { referrer: this.enrichReferrerWithCandidates(ref, candidates), ok: true };
      }
    }

    return this.regenerateReferrerInvite(ref.id, {
      discordBotConfig,
      actorUserId: discordUserId,
      actorName: ref.discordDisplayName,
    });
  }

  async deleteReferrerPhysically(
    id: string,
    confirm: boolean,
    actor: { id: string; displayName: string }
  ): Promise<{ deleted: boolean; summary: ReferrerDependencySummary }> {
    if (!confirm) {
      throw new Error('Confirmation explicite requise (confirm=true) pour supprimer définitivement un profil.');
    }

    const ref = await this.getReferrerById(id);
    if (!ref) {
      throw new Error('Parrain introuvable.');
    }

    if (getEffectiveReferrerStatus(ref) !== 'ARCHIVED') {
      throw new Error(
        "Action refusée : vous devez d'abord archiver ce parrain avant toute tentative de suppression définitive."
      );
    }

    const deps = await this.analyzeReferrerDependencies(id);
    if (!deps.canPhysicallyDelete) {
      const err: any = new Error(deps.blockingReason || 'Suppression physique impossible : dépendances existantes.');
      err.code = 'CONFLICT_DEPENDENCIES';
      err.status = 409;
      err.dependencies = deps;
      throw err;
    }

    await this.client.deleteDocument('pawako_referrers', id);

    await this.logAudit({
      action: 'REFERRER_DELETED_PERMANENTLY',
      actorUserId: actor.id,
      actorName: actor.displayName,
      targetType: 'REFERRER',
      targetId: id,
      details: {
        discordUserId: ref.discordUserId,
        discordDisplayName: ref.discordDisplayName,
        inviteCode: ref.inviteCode || null,
      },
    });

    return { deleted: true, summary: deps };
  }

  // --- CANDIDATS ---

  async getCandidates(options?: {
    search?: string;
    vaType?: VAType | 'ALL';
    adminStatus?: AdminStatus | 'ALL';
    operationalStatus?: OperationalStatus | 'ALL';
    status?: CandidateStatus | 'ALL';
    server?: string;
    attributionStatus?: string;
    referrerId?: string;
    referrerDiscordUserId?: string;
    hasAnomaly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    candidates: Candidate[];
    total: number;
    page: number;
    totalPages: number;
    pageSize: number;
  }> {
    let list = await this.client.listDocuments<Candidate>('pawako_candidates');

    if (options?.referrerDiscordUserId) {
      list = list.filter(c => c.referrerDiscordUserId === options.referrerDiscordUserId);
    }

    if (options?.referrerId) {
      list = list.filter(c => c.referrerId === options.referrerId);
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

    if (options?.status && options.status !== 'ALL') {
      list = list.filter(c => c.status === options.status);
    }

    if (options?.attributionStatus && options.attributionStatus !== 'ALL') {
      list = list.filter(c => c.attributionStatus === options.attributionStatus);
    }

    if (options?.server && options.server !== 'ALL') {
      list = list.filter(c => c.currentServer === options.server);
    }

    if (options?.hasAnomaly !== undefined) {
      list = list.filter(c => c.hasAnomaly === options.hasAnomaly);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.max(1, Math.min(200, options?.limit || 50));
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginated = list.slice(start, start + pageSize).map(c => stripFirestoreMeta(c));

    return { candidates: paginated, total, page, totalPages, pageSize };
  }

  async getCandidateById(id: string): Promise<Candidate | null> {
    const raw = await this.client.getDocument<Candidate>('pawako_candidates', id);
    return raw ? stripFirestoreMeta(raw) : null;
  }

  async getCandidateByDiscordUserId(discordUserId: string): Promise<Candidate | null> {
    const list = await this.client.listDocuments<Candidate>('pawako_candidates');
    const found = list.find(c => c.discordUserId === discordUserId) || null;
    return found ? stripFirestoreMeta(found) : null;
  }

  private async resolveAttributionByInviteCode(inviteCodeUsed?: string | null): Promise<{
    referrer: Referrer | null;
    attributionStatus: Candidate['attributionStatus'];
    uncertaintyReason: string | null;
  }> {
    const code = (inviteCodeUsed || '').trim();
    if (!code) {
      return {
        referrer: null,
        attributionStatus: 'UNCERTAIN',
        uncertaintyReason:
          "Arrivée sans code d'invitation parrain détecté (invitation directe ou lien serveur générique).",
      };
    }

    const matchedReferrers = await this.findReferrersByInviteCode(code);
    if (matchedReferrers.length > 1) {
      const activeMatches = matchedReferrers.filter(r => getEffectiveReferrerStatus(r) === 'ACTIVE');
      if (activeMatches.length !== 1) {
        return {
          referrer: null,
          attributionStatus: 'UNCERTAIN',
          uncertaintyReason: `Ambiguïté : plusieurs profils parrains (${matchedReferrers.length}) correspondent au code d'invitation ${code}. Attribution manuelle requise.`,
        };
      }
      const winner = activeMatches[0];
      return {
        referrer: winner,
        attributionStatus: 'CONFIRMED',
        uncertaintyReason: null,
      };
    }

    if (matchedReferrers.length === 1) {
      const match = matchedReferrers[0];
      const status = getEffectiveReferrerStatus(match);
      if (status !== 'ACTIVE') {
        return {
          referrer: null,
          attributionStatus: 'UNCERTAIN',
          uncertaintyReason: `Le code d'invitation ${code} appartient à un parrain ${
            status === 'ARCHIVED' ? 'archivé' : 'suspendu'
          } (${match.discordDisplayName}). Réattribution manuelle requise.`,
        };
      }

      return {
        referrer: match,
        attributionStatus: 'CONFIRMED',
        uncertaintyReason: null,
      };
    }

    // Vérifier si l'invitation existait dans pawako_discord_invites
    const inviteRecord = await this.client.getDocument<DiscordInviteRecord>('pawako_discord_invites', code);
    if (inviteRecord?.referrerId) {
      const ref = await this.getReferrerById(inviteRecord.referrerId);
      if (ref && getEffectiveReferrerStatus(ref) === 'ACTIVE') {
        return {
          referrer: ref,
          attributionStatus: 'CONFIRMED',
          uncertaintyReason: null,
        };
      }
    }

    return {
      referrer: null,
      attributionStatus: 'UNCERTAIN',
      uncertaintyReason: `Code d'invitation Discord (${code}) inconnu ou non rattaché à un parrain actif PAWAKO.`,
    };
  }

  async createCandidate(params: {
    discordUserId: string;
    username: string;
    displayName?: string;
    avatar?: string | null;
    vaType: VAType;
    inviteCodeUsed?: string;
    originServer?: DiscordServerType;
    actorUserId?: string;
    actorName?: string;
  }): Promise<Candidate> {
    const existing = await this.getCandidateByDiscordUserId(params.discordUserId);
    if (existing) return existing;

    const attribution = await this.resolveAttributionByInviteCode(params.inviteCodeUsed);
    const referrer = attribution.referrer;
    const now = new Date().toISOString();
    const id = `cand-${params.discordUserId}`;

    if (referrer) {
      const updatedRef: Referrer = {
        ...stripFirestoreMeta(referrer),
        usesCount: (referrer.usesCount || 0) + 1,
        lastActivityAt: now,
        updatedAt: now,
      };
      await this.client.setDocument('pawako_referrers', referrer.id, updatedRef);
    }

    const originServer = params.originServer || 'RECRUTEMENT';

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
      attributionStatus: attribution.attributionStatus,
      uncertaintyReason: attribution.uncertaintyReason,
      currentServer: originServer,
      hasAnomaly: false,
      anomalyReason: null,
      discordRoles: [],
      arrivalDate: now,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.client.setDocument('pawako_candidates', id, newCandidate, {
        precondition: { exists: false },
      });
    } catch (err) {
      if (err instanceof FirestoreRestError && err.isPreconditionConflict) {
        const concurrent = await this.getCandidateByDiscordUserId(params.discordUserId);
        if (concurrent) return concurrent;
      }
      throw err;
    }

    if (referrer) {
      await this.recordAttributionHistory({
        candidateId: id,
        candidateName: newCandidate.displayName,
        oldReferrerId: null,
        oldReferrerName: null,
        newReferrerId: referrer.id,
        newReferrerName: referrer.discordDisplayName,
        authorUserId: params.actorUserId || 'SYSTEM',
        authorName: params.actorName || 'Système Discord',
        reason: `Attribution automatique confirmée via le code Discord ${params.inviteCodeUsed}`,
      });
    }

    await this.logStatusHistory({
      candidateId: id,
      fromStatus: null,
      toStatus: 'EN_ATTENTE',
      fromAdminStatus: null,
      toAdminStatus: 'EN_ATTENTE',
      fromOperationalStatus: null,
      toOperationalStatus: 'RECRUTEMENT',
      fromServer: null,
      toServer: originServer,
      authorUserId: params.actorUserId || 'SYSTEM',
      authorName: params.actorName || 'Système Recrutement',
      authorSource: params.actorUserId ? 'MANUAL_ADMIN' : 'DISCORD_SYNC',
      reason: referrer
        ? `Arrivée sur ${originServer} avec parrain confirmé : ${referrer.discordDisplayName}`
        : attribution.uncertaintyReason,
      isConfidential: false,
    });

    await this.logAudit({
      action: 'CANDIDATE_CREATED',
      actorUserId: params.actorUserId || 'SYSTEM',
      actorName: params.actorName || 'Système',
      targetType: 'CANDIDATE',
      targetId: id,
      details: {
        discordUserId: params.discordUserId,
        vaType: params.vaType,
        attributionStatus: attribution.attributionStatus,
        referrerId: referrer?.id || null,
      },
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

    let nextAdmin = params.newAdminStatus;
    let nextOp = params.newOperationalStatus;

    if (params.newStatus && (!nextAdmin || !nextOp)) {
      const mapped = mapSyntheticStatusToPair(params.newStatus);
      if (!nextAdmin && mapped.adminStatus) nextAdmin = mapped.adminStatus;
      if (!nextOp && mapped.operationalStatus) nextOp = mapped.operationalStatus;
    }

    if (nextAdmin) candidate.adminStatus = nextAdmin;
    if (nextOp) {
      if (candidate.vaType === 'INSTAGRAM' && ['FORMATION', 'SIMULATION', 'VALIDE'].includes(nextOp)) {
        throw new Error(
          'Règle d intégrité : Les VA Instagram ne peuvent pas être placés en formation, simulation ou validation intermédiaire.'
        );
      }
      candidate.operationalStatus = nextOp;
    }

    candidate.status = deriveCandidateStatus(candidate.adminStatus, candidate.operationalStatus);

    if (candidate.operationalStatus === 'FORMATION' && !candidate.formationDate) {
      candidate.formationDate = now;
    }
    if (candidate.operationalStatus === 'SIMULATION' && !candidate.simulationDate) {
      candidate.simulationDate = now;
    }
    if (candidate.operationalStatus === 'VALIDE' && !candidate.validationDate) {
      candidate.validationDate = now;
    }
    if (candidate.operationalStatus === 'PRODUCTION' && !candidate.productionDate) {
      candidate.productionDate = now;
    }

    if (candidate.adminStatus === 'ACCEPTE' && !candidate.decisionDate) {
      candidate.decisionDate = now;
      candidate.decisionByUserId = params.actorUserId;
      candidate.decisionByName = params.actorName;
    }

    if (candidate.adminStatus === 'REFUSE') {
      candidate.refusalReason = params.refusalReason?.trim() || params.notes.trim() || candidate.refusalReason || null;
      candidate.decisionDate = now;
      candidate.decisionByUserId = params.actorUserId;
      candidate.decisionByName = params.actorName;
    }

    candidate.updatedAt = now;
    await this.client.setDocument('pawako_candidates', candidateId, stripFirestoreMeta(candidate));

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
      isConfidential: Boolean(params.isConfidential || candidate.adminStatus === 'REFUSE'),
    });

    await this.logAudit({
      action: 'CANDIDATE_STATUS_UPDATED',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: {
        fromStatus,
        toStatus: candidate.status,
        notes: params.notes,
      },
    });

    return candidate;
  }

  async updateCandidateVAType(
    candidateId: string,
    params: {
      newVaType: VAType;
      reason: string;
      actorUserId: string;
      actorName: string;
    }
  ): Promise<Candidate | null> {
    const candidate = await this.getCandidateById(candidateId);
    if (!candidate) return null;

    if (
      params.newVaType === 'INSTAGRAM' &&
      ['FORMATION', 'SIMULATION', 'VALIDE'].includes(candidate.operationalStatus)
    ) {
      throw new Error(
        "Impossible de basculer vers VA Instagram tant que le candidat est en formation, simulation ou validation."
      );
    }

    const oldVaType = candidate.vaType;
    candidate.vaType = params.newVaType;
    candidate.updatedAt = new Date().toISOString();

    await this.client.setDocument('pawako_candidates', candidateId, stripFirestoreMeta(candidate));

    await this.logStatusHistory({
      candidateId,
      fromStatus: candidate.status,
      toStatus: candidate.status,
      fromAdminStatus: candidate.adminStatus,
      toAdminStatus: candidate.adminStatus,
      fromOperationalStatus: candidate.operationalStatus,
      toOperationalStatus: candidate.operationalStatus,
      fromServer: candidate.currentServer,
      toServer: candidate.currentServer,
      authorUserId: params.actorUserId,
      authorName: params.actorName,
      authorSource: 'MANUAL_ADMIN',
      reason: `Modification d'activité (${oldVaType} -> ${params.newVaType}) : ${params.reason}`,
      isConfidential: false,
    });

    await this.logAudit({
      action: 'CANDIDATE_VA_TYPE_UPDATED',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: { oldVaType, newVaType: params.newVaType, reason: params.reason },
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
    if (getEffectiveReferrerStatus(newRef) === 'ARCHIVED') {
      throw new Error("Impossible d'attribuer un candidat à un parrain archivé.");
    }

    const oldReferrerId = candidate.referrerId || null;
    const oldReferrerName = candidate.referrerName || null;

    candidate.referrerId = newRef.id;
    candidate.referrerDiscordUserId = newRef.discordUserId;
    candidate.referrerName = newRef.discordDisplayName;
    candidate.attributionStatus = 'MANUAL_REASSIGNED';
    candidate.uncertaintyReason = null;
    candidate.updatedAt = new Date().toISOString();

    await this.client.setDocument('pawako_candidates', candidateId, stripFirestoreMeta(candidate));

    await this.recordAttributionHistory({
      candidateId,
      candidateName: candidate.displayName,
      oldReferrerId,
      oldReferrerName,
      newReferrerId: newRef.id,
      newReferrerName: newRef.discordDisplayName,
      authorUserId: params.actorUserId,
      authorName: params.actorName,
      reason: params.reason,
    });

    await this.logAudit({
      action: 'REFERRER_REASSIGNED',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: {
        oldReferrerId,
        newReferrerId: newRef.id,
        newReferrerName: newRef.discordDisplayName,
        reason: params.reason,
      },
    });

    return candidate;
  }

  async clearCandidateAnomaly(
    candidateId: string,
    actorUserId: string,
    actorName: string,
    resolutionNotes?: string
  ): Promise<Candidate | null> {
    const candidate = await this.getCandidateById(candidateId);
    if (!candidate) return null;

    const oldAnomaly = candidate.anomalyReason || null;
    candidate.hasAnomaly = false;
    candidate.anomalyReason = null;
    candidate.updatedAt = new Date().toISOString();

    await this.client.setDocument('pawako_candidates', candidateId, stripFirestoreMeta(candidate));

    await this.logAudit({
      action: 'ANOMALY_CLEARED',
      actorUserId,
      actorName,
      targetType: 'CANDIDATE',
      targetId: candidateId,
      details: { candidateId, oldAnomaly, resolutionNotes: resolutionNotes || '' },
    });

    return candidate;
  }

  // --- SERVEURS DISCORD, MAPPINGS & ÉVÉNEMENTS BOT JARVIS ---

  async getDiscordServers(guildIds?: Record<DiscordServerType, string>): Promise<DiscordServerInfo[]> {
    let servers = await this.client.listDocuments<DiscordServerInfo>('pawako_discord_servers');

    if (servers.length === 0) {
      servers = OFFICIAL_DISCORD_SERVERS.map(s => ({
        ...s,
        guildId: guildIds?.[s.id] || '',
        botConnected: Boolean(guildIds?.[s.id]),
      }));
      await this.client.batchSet(
        servers.map(s => ({ collection: 'pawako_discord_servers', docId: s.id, data: s }))
      );
    } else if (guildIds) {
      const changedServers: Array<{ collection: string; docId: string; data: Record<string, any> }> = [];
      servers = servers.map(s => {
        const clean = stripFirestoreMeta(s);
        if (guildIds[clean.id] && (clean.guildId !== guildIds[clean.id] || !clean.botConnected)) {
          const updated: DiscordServerInfo = {
            ...clean,
            guildId: guildIds[clean.id],
            botConnected: true,
          };
          changedServers.push({ collection: 'pawako_discord_servers', docId: clean.id, data: updated });
          return updated;
        }
        return clean;
      });
      if (changedServers.length > 0) {
        await this.client.batchSet(changedServers);
      }
    }

    return servers.map(s => stripFirestoreMeta(s));
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
    return mappings.map(m => stripFirestoreMeta(m));
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

  private resolveServerType(
    guildId: string,
    servers: DiscordServerInfo[],
    envGuildIds?: Partial<Record<DiscordServerType, string>>
  ): DiscordServerType {
    const matched = servers.find(s => s.guildId && s.guildId === guildId);
    if (matched) return matched.id;

    if (envGuildIds?.FORMATION && guildId === envGuildIds.FORMATION) return 'FORMATION';
    if (envGuildIds?.PRODUCTION_CHATTING && guildId === envGuildIds.PRODUCTION_CHATTING) return 'PRODUCTION_CHATTING';
    if (envGuildIds?.PRODUCTION_INSTAGRAM && guildId === envGuildIds.PRODUCTION_INSTAGRAM) return 'PRODUCTION_INSTAGRAM';
    return 'RECRUTEMENT';
  }

  async processDiscordGatewayEvent(params: {
    eventId: string;
    eventType: RecruitmentEvent['eventType'];
    guildId: string;
    user?: {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
    roles?: string[];
    inviteCode?: string | null;
    channelId?: string | null;
    inviterId?: string | null;
    vaType?: VAType;
    timestamp?: string;
    envGuildIds?: Partial<Record<DiscordServerType, string>>;
  }): Promise<{
    success: boolean;
    message: string;
    candidate?: Candidate | null;
    anomaly?: string | null;
    inviteAffectedReferrerId?: string | null;
  }> {
    const now = new Date().toISOString();
    const servers = await this.getDiscordServers(params.envGuildIds as Record<DiscordServerType, string>);
    const serverType = this.resolveServerType(params.guildId, servers, params.envGuildIds);
    const cleanInviteCode = params.inviteCode ? params.inviteCode.trim() : '';

    // 1. Événements d'invitation Discord (INVITE_CREATE / INVITE_DELETE)
    if (params.eventType === 'INVITE_CREATE') {
      if (!cleanInviteCode) {
        return { success: true, message: 'INVITE_CREATE ignoré (inviteCode absent).' };
      }
      const existingInvite = await this.client.getDocument<DiscordInviteRecord>(
        'pawako_discord_invites',
        cleanInviteCode
      );
      const matchedReferrers = await this.findReferrersByInviteCode(cleanInviteCode);
      const linkedReferrer =
        matchedReferrers[0] ||
        (params.inviterId ? await this.getReferrerByDiscordUserId(params.inviterId) : null);

      const record: DiscordInviteRecord = {
        inviteCode: cleanInviteCode,
        inviteUrl: `https://discord.gg/${cleanInviteCode}`,
        guildId: params.guildId,
        serverId: serverType,
        channelId: params.channelId || existingInvite?.channelId || null,
        inviterDiscordUserId: params.inviterId || params.user?.id || existingInvite?.inviterDiscordUserId || null,
        referrerId: linkedReferrer?.id || existingInvite?.referrerId || null,
        active: true,
        createdAt: existingInvite?.createdAt || now,
        deletedAt: null,
        uses: existingInvite?.uses || 0,
      };
      await this.client.setDocument('pawako_discord_invites', cleanInviteCode, record);

      await this.logAudit({
        action: 'DISCORD_EVENT_INVITE_CREATE',
        actorUserId: 'BOT_JARVIS',
        actorName: 'Passerelle Bot JARVIS',
        targetType: 'DISCORD',
        targetId: cleanInviteCode,
        details: { guildId: params.guildId, serverType, referrerId: record.referrerId },
      });

      return {
        success: true,
        message: `Invitation Discord ${cleanInviteCode} enregistrée sur ${serverType}.`,
        inviteAffectedReferrerId: record.referrerId || null,
      };
    }

    if (params.eventType === 'INVITE_DELETE') {
      if (!cleanInviteCode) {
        return { success: true, message: 'INVITE_DELETE ignoré (inviteCode absent).' };
      }

      const existingInvite = await this.client.getDocument<DiscordInviteRecord>(
        'pawako_discord_invites',
        cleanInviteCode
      );
      if (existingInvite) {
        await this.client.setDocument('pawako_discord_invites', cleanInviteCode, {
          ...stripFirestoreMeta(existingInvite),
          active: false,
          deletedAt: now,
        });
      }

      const affectedReferrers = await this.findReferrersByInviteCode(cleanInviteCode);
      for (const ref of affectedReferrers) {
        const updatedRef: Referrer = {
          ...stripFirestoreMeta(ref),
          inviteStatus: 'EXPIRED_OR_DELETED',
          inviteError: `L'invitation Discord (${cleanInviteCode}) a été supprimée ou a expiré sur le serveur Recrutement.`,
          updatedAt: now,
        };
        await this.client.setDocument('pawako_referrers', ref.id, updatedRef);
      }

      await this.logAudit({
        action: 'DISCORD_EVENT_INVITE_DELETE',
        actorUserId: 'BOT_JARVIS',
        actorName: 'Passerelle Bot JARVIS',
        targetType: 'DISCORD',
        targetId: cleanInviteCode,
        details: {
          guildId: params.guildId,
          serverType,
          affectedReferrerIds: affectedReferrers.map(r => r.id),
        },
      });

      return {
        success: true,
        message: `Suppression de l'invitation ${cleanInviteCode} enregistrée (${affectedReferrers.length} parrain(s) marqué(s) expiré(s)).`,
        inviteAffectedReferrerId: affectedReferrers[0]?.id || null,
      };
    }

    // 2. Événements membres Discord (GUILD_MEMBER_ADD, GUILD_MEMBER_REMOVE, GUILD_MEMBER_UPDATE, MEMBER_SYNC)
    if (!params.user?.id) {
      throw new Error('user.id est obligatoire pour cet événement Discord.');
    }

    const discordUserId = params.user.id;
    const username = params.user.username || `user_${discordUserId.slice(-4)}`;
    const displayName = params.user.global_name || username;
    const avatarUrl = params.user.avatar
      ? params.user.avatar.startsWith('http')
        ? params.user.avatar
        : `https://cdn.discordapp.com/avatars/${discordUserId}/${params.user.avatar}.png`
      : null;

    let candidate = await this.getCandidateByDiscordUserId(discordUserId);
    let resultMessage = '';
    let anomalyDetected: string | null = null;

    // Mise à jour serveur + compteur
    const targetServerDoc = servers.find(s => s.id === serverType);
    const updateServerSync = async (delta: number) => {
      if (!targetServerDoc) return;
      const nextCount = Math.max(0, (targetServerDoc.memberCount || 0) + delta);
      await this.client.setDocument('pawako_discord_servers', serverType, {
        ...targetServerDoc,
        memberCount: nextCount,
        botConnected: true,
        lastSyncAt: now,
      });
    };

    if (params.eventType === 'GUILD_MEMBER_ADD') {
      if (!candidate) {
        const inferredVaType: VAType =
          serverType === 'PRODUCTION_INSTAGRAM' ? 'INSTAGRAM' : params.vaType || 'CHATTEUR';
        candidate = await this.createCandidate({
          discordUserId,
          username,
          displayName,
          avatar: avatarUrl,
          vaType: inferredVaType,
          inviteCodeUsed: cleanInviteCode || undefined,
          originServer: serverType,
        });
        resultMessage = `Nouveau candidat créé sur ${serverType} : ${candidate.displayName}.`;
      } else {
        // Membre déjà répertorié : conserver le parrain d'origine et actualiser sa présence serveur
        const previousServer = candidate.currentServer;
        candidate.username = username;
        candidate.displayName = displayName;
        if (avatarUrl) candidate.avatar = avatarUrl;
        candidate.currentServer = serverType;
        candidate.lastDiscordSyncAt = now;
        candidate.updatedAt = now;

        // Cohérence serveur vs activité VA & refus préalable
        if (candidate.vaType === 'INSTAGRAM' && serverType === 'FORMATION') {
          anomalyDetected =
            "Incompatibilité : un candidat VA Instagram a rejoint le serveur Formation (réservé aux VA Chatteurs).";
        } else if (candidate.vaType === 'INSTAGRAM' && serverType === 'PRODUCTION_CHATTING') {
          anomalyDetected =
            'Incompatibilité serveur : un VA Instagram a rejoint le serveur Production Chatting.';
        } else if (candidate.vaType === 'CHATTEUR' && serverType === 'PRODUCTION_INSTAGRAM') {
          anomalyDetected =
            'Incompatibilité serveur : un VA Chatteur a rejoint le serveur Production Instagram.';
        } else if (
          candidate.adminStatus === 'REFUSE' &&
          (serverType === 'FORMATION' ||
            serverType === 'PRODUCTION_CHATTING' ||
            serverType === 'PRODUCTION_INSTAGRAM')
        ) {
          anomalyDetected =
            "Alerte sécurité : un candidat classé REFUSÉ a rejoint un serveur Formation/Production sans levée de refus.";
        }

        if (anomalyDetected) {
          candidate.hasAnomaly = true;
          candidate.anomalyReason = anomalyDetected;
        }

        await this.client.setDocument('pawako_candidates', candidate.id, stripFirestoreMeta(candidate));

        if (previousServer !== serverType) {
          await this.logStatusHistory({
            candidateId: candidate.id,
            fromStatus: candidate.status,
            toStatus: candidate.status,
            fromAdminStatus: candidate.adminStatus,
            toAdminStatus: candidate.adminStatus,
            fromOperationalStatus: candidate.operationalStatus,
            toOperationalStatus: candidate.operationalStatus,
            fromServer: previousServer,
            toServer: serverType,
            authorUserId: 'BOT_JARVIS',
            authorName: 'Bot JARVIS',
            authorSource: 'JARVIS_GATEWAY',
            reason: `Arrivée détectée sur le serveur Discord ${serverType} (parrain d'origine conservé).`,
            isConfidential: false,
          });
        }

        resultMessage = `Membre existant actualisé sur ${serverType} : ${candidate.displayName}.`;
      }

      const membership: DiscordMembership = {
        id: `${serverType}_${discordUserId}`,
        discordUserId,
        serverId: serverType,
        joinedAt: now,
        leftAt: null,
        roles: params.roles || candidate.discordRoles || [],
        nickname: displayName,
      };
      await this.client.setDocument('pawako_discord_memberships', membership.id, membership);
      await updateServerSync(1);
    } else if (params.eventType === 'GUILD_MEMBER_REMOVE') {
      const existingMembership = await this.client.getDocument<DiscordMembership>(
        'pawako_discord_memberships',
        `${serverType}_${discordUserId}`
      );
      await this.client.setDocument('pawako_discord_memberships', `${serverType}_${discordUserId}`, {
        id: `${serverType}_${discordUserId}`,
        discordUserId,
        serverId: serverType,
        joinedAt: existingMembership?.joinedAt || now,
        leftAt: now,
        roles: existingMembership?.roles || [],
        nickname: existingMembership?.nickname || displayName,
      });

      // Règle stricte PAWAKO : jamais de suppression ni passage automatique à ABANDONNE lors d'un départ serveur
      if (candidate) {
        candidate.lastDiscordSyncAt = now;
        candidate.updatedAt = now;
        await this.client.setDocument('pawako_candidates', candidate.id, stripFirestoreMeta(candidate));
        await this.logStatusHistory({
          candidateId: candidate.id,
          fromStatus: candidate.status,
          toStatus: candidate.status,
          fromAdminStatus: candidate.adminStatus,
          toAdminStatus: candidate.adminStatus,
          fromOperationalStatus: candidate.operationalStatus,
          toOperationalStatus: candidate.operationalStatus,
          fromServer: candidate.currentServer,
          toServer: candidate.currentServer,
          authorUserId: 'BOT_JARVIS',
          authorName: 'Bot JARVIS',
          authorSource: 'JARVIS_GATEWAY',
          reason: `Départ observé sur le serveur ${serverType}. Dossier candidat et historique conservés intacts.`,
          isConfidential: false,
        });
        resultMessage = `Départ de ${serverType} enregistré pour ${candidate.displayName} (dossier conservé intact).`;
      } else {
        resultMessage = `Départ Discord observé sur ${serverType} pour ${username} (aucun dossier candidat associé).`;
      }

      await updateServerSync(-1);
    }

    // 3. Synchronisation des rôles (GUILD_MEMBER_UPDATE, MEMBER_SYNC ou rôles fournis dans GUILD_MEMBER_ADD)
    if (
      params.eventType === 'GUILD_MEMBER_UPDATE' ||
      params.eventType === 'MEMBER_SYNC' ||
      (params.eventType === 'GUILD_MEMBER_ADD' && Array.isArray(params.roles) && params.roles.length > 0)
    ) {
      const roleMappings = await this.getRoleMappings();
      const serverMappings = roleMappings.filter(m => m.serverId === serverType && m.discordRoleId);
      const currentRoles = Array.isArray(params.roles) ? params.roles : [];

      const detectedPawakoRoles: PawakoRoleType[] = [];
      for (const rId of currentRoles) {
        const match = serverMappings.find(m => m.discordRoleId === rId);
        if (match && !detectedPawakoRoles.includes(match.roleType)) {
          detectedPawakoRoles.push(match.roleType);
        }
      }

      // Lors d'un MEMBER_SYNC initial, créer le dossier si un rôle PAWAKO mappé existe et que le candidat manque
      if (!candidate && params.eventType === 'MEMBER_SYNC' && detectedPawakoRoles.length > 0) {
        const inferredVaType: VAType =
          serverType === 'PRODUCTION_INSTAGRAM' ? 'INSTAGRAM' : params.vaType || 'CHATTEUR';
        candidate = await this.createCandidate({
          discordUserId,
          username,
          displayName,
          avatar: avatarUrl,
          vaType: inferredVaType,
          originServer: serverType,
        });
      }

      if (candidate) {
        candidate.discordRoles = currentRoles;
        candidate.lastDiscordSyncAt = now;
        candidate.updatedAt = now;

        const membership: DiscordMembership = {
          id: `${serverType}_${discordUserId}`,
          discordUserId,
          serverId: serverType,
          joinedAt: now,
          leftAt: null,
          roles: currentRoles,
          nickname: displayName,
        };
        await this.client.setDocument('pawako_discord_memberships', membership.id, membership);

        // Détection d'anomalies
        const hasFormation =
          detectedPawakoRoles.includes('EN_FORMATION') || detectedPawakoRoles.includes('EN_SIMULATION');
        const hasProduction = detectedPawakoRoles.includes('VA_PRODUCTION');

        if (hasFormation && hasProduction) {
          anomalyDetected =
            'Combinaison de rôles contradictoire détectée sur Discord : Formation/Simulation et Production simultanées.';
        } else if (
          candidate.vaType === 'INSTAGRAM' &&
          (detectedPawakoRoles.includes('EN_FORMATION') ||
            detectedPawakoRoles.includes('EN_SIMULATION') ||
            detectedPawakoRoles.includes('VA_VALIDE'))
        ) {
          anomalyDetected =
            "Incompatibilité d'activité : un candidat VA Instagram ne doit jamais posséder de rôle Formation, Simulation ou Validé.";
        } else if (
          candidate.adminStatus === 'REFUSE' &&
          detectedPawakoRoles.some(r =>
            ['CANDIDAT_ACCEPTE', 'EN_FORMATION', 'EN_SIMULATION', 'VA_VALIDE', 'VA_PRODUCTION'].includes(r)
          )
        ) {
          anomalyDetected =
            'Rôle d acceptation/formation/production détecté sur Discord pour un candidat REFUSÉ. Réactivation automatique bloquée.';
        }

        if (anomalyDetected) {
          candidate.hasAnomaly = true;
          candidate.anomalyReason = anomalyDetected;
          await this.client.setDocument('pawako_candidates', candidate.id, stripFirestoreMeta(candidate));
        } else {
          // Appliquer la hiérarchie de transition Discord autorisée
          await this.client.setDocument('pawako_candidates', candidate.id, stripFirestoreMeta(candidate));

          if (detectedPawakoRoles.includes('CANDIDAT_REFUSE')) {
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'REFUSE',
              newOperationalStatus: 'INACTIF',
              refusalReason: 'Refus synchronisé via le rôle Discord CANDIDAT_REFUSE',
              notes: 'Synchronisation automatique du rôle Discord CANDIDAT_REFUSE',
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
              isConfidential: true,
            });
            resultMessage += ' Statut actualisé : REFUSÉ.';
          } else if (detectedPawakoRoles.includes('VA_PRODUCTION')) {
            const expectedProdServer: DiscordServerType =
              candidate.vaType === 'INSTAGRAM' ? 'PRODUCTION_INSTAGRAM' : 'PRODUCTION_CHATTING';
            if (serverType === expectedProdServer || serverType === 'RECRUTEMENT' || serverType === 'FORMATION') {
              candidate.currentServer = expectedProdServer;
              await this.client.setDocument('pawako_candidates', candidate.id, stripFirestoreMeta(candidate));
            }
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'ACCEPTE',
              newOperationalStatus: 'PRODUCTION',
              notes: `Passage en production via le rôle Discord VA_PRODUCTION sur ${serverType}`,
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
            });
            resultMessage += ` Statut actualisé : PRODUCTION (${candidate?.vaType}).`;
          } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('VA_VALIDE')) {
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'ACCEPTE',
              newOperationalStatus: 'VALIDE',
              notes: 'Validation du candidat via le rôle Discord VA_VALIDE',
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
            });
            resultMessage += ' Statut actualisé : VALIDÉ.';
          } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('EN_SIMULATION')) {
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'ACCEPTE',
              newOperationalStatus: 'SIMULATION',
              notes: 'Passage en simulation via le rôle Discord EN_SIMULATION',
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
            });
            resultMessage += ' Statut actualisé : SIMULATION.';
          } else if (candidate.vaType === 'CHATTEUR' && detectedPawakoRoles.includes('EN_FORMATION')) {
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'ACCEPTE',
              newOperationalStatus: 'FORMATION',
              notes: 'Entrée en formation via le rôle Discord EN_FORMATION',
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
            });
            resultMessage += ' Statut actualisé : FORMATION.';
          } else if (detectedPawakoRoles.includes('CANDIDAT_ACCEPTE')) {
            candidate = await this.updateCandidateStatus(candidate.id, {
              newAdminStatus: 'ACCEPTE',
              newOperationalStatus:
                candidate.operationalStatus === 'INACTIF' ? 'RECRUTEMENT' : candidate.operationalStatus,
              notes: 'Acceptation de la candidature via le rôle Discord CANDIDAT_ACCEPTE',
              actorUserId: 'BOT_JARVIS',
              actorName: 'Bot JARVIS',
              actorSource: 'DISCORD_SYNC',
            });
            resultMessage += ' Statut administratif actualisé : ACCEPTÉ.';
          }
        }
      }
    }

    const eventRecord: RecruitmentEvent = {
      id: params.eventId,
      eventType: params.eventType,
      serverId: serverType,
      guildId: params.guildId,
      discordUserId,
      payload: {
        userId: discordUserId,
        username,
        rolesCount: params.roles?.length || 0,
        inviteCode: cleanInviteCode || null,
      },
      processed: true,
      processedAt: now,
      result: resultMessage || `Événement ${params.eventType} traité sur ${serverType}`,
    };
    await this.client.setDocument('pawako_recruitment_events', params.eventId, eventRecord);

    await this.logAudit({
      action: `DISCORD_EVENT_${params.eventType}`,
      actorUserId: 'BOT_JARVIS',
      actorName: 'Passerelle Bot JARVIS',
      targetType: 'DISCORD',
      targetId: discordUserId,
      details: {
        eventId: params.eventId,
        eventType: params.eventType,
        serverType,
        guildId: params.guildId,
        username,
        anomaly: anomalyDetected,
      },
    });

    return {
      success: true,
      message: resultMessage || `Événement ${params.eventType} traité pour ${username}.`,
      candidate,
      anomaly: anomalyDetected,
    };
  }

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
    envGuildIds?: Partial<Record<DiscordServerType, string>>;
  }): Promise<{ synchronizedCount: number; anomaliesCount: number }> {
    const servers = await this.getDiscordServers(params.envGuildIds as Record<DiscordServerType, string>);
    const serverInfo = servers.find(s => s.id === params.serverId);
    const guildId = serverInfo?.guildId || params.envGuildIds?.[params.serverId] || params.serverId;

    let synchronizedCount = 0;
    let anomaliesCount = 0;

    for (const member of params.members) {
      const res = await this.processDiscordGatewayEvent({
        eventId: `sync-${params.serverId}-${member.discordUserId}-${Date.now()}`,
        eventType: 'MEMBER_SYNC',
        guildId,
        user: {
          id: member.discordUserId,
          username: member.username,
          global_name: member.displayName || member.username,
          avatar: member.avatar || null,
        },
        roles: member.roleIds || [],
        vaType: member.vaType,
        envGuildIds: params.envGuildIds,
      });

      if (res.success) synchronizedCount++;
      if (res.anomaly) anomaliesCount++;
    }

    if (serverInfo) {
      await this.client.setDocument('pawako_discord_servers', params.serverId, {
        ...serverInfo,
        memberCount: Math.max(serverInfo.memberCount || 0, params.members.length),
        botConnected: true,
        lastSyncAt: new Date().toISOString(),
      });
    }

    await this.logAudit({
      action: 'SERVER_MEMBERS_SYNC',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'SERVER',
      targetId: params.serverId,
      details: { synchronizedCount, anomaliesCount },
    });

    return { synchronizedCount, anomaliesCount };
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
      .map(h => stripFirestoreMeta(h))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async recordAttributionHistory(
    entry: Omit<ReferralAttributionHistoryEntry, 'id' | 'timestamp'>
  ): Promise<ReferralAttributionHistoryEntry> {
    const id = `attr-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;
    const fullEntry: ReferralAttributionHistoryEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };
    await this.client.setDocument('pawako_referral_attributions_history', id, fullEntry);
    return fullEntry;
  }

  async getReferralAttributionsHistory(candidateId: string): Promise<ReferralAttributionHistoryEntry[]> {
    const list = await this.client.listDocuments<ReferralAttributionHistoryEntry>(
      'pawako_referral_attributions_history'
    );
    return list
      .filter(a => a.candidateId === candidateId)
      .map(a => stripFirestoreMeta(a))
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
    const clean = list.map(l => stripFirestoreMeta(l));
    clean.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return clean.slice(0, limit);
  }

  // --- STATISTIQUES GLOBALES ET PARRAIN (SOURCE UNIQUE DE VÉRITÉ FIRESTORE) ---

  private computeOverviewStatsFromData(params: {
    candidates: Candidate[];
    referrers: Referrer[];
    servers: DiscordServerInfo[];
  }) {
    const { candidates, referrers, servers } = params;

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

    const conversionProductionRate =
      totalCandidats > 0 ? Math.round((totalProductionGlobale / totalCandidats) * 100) : 0;
    const acceptanceRate =
      totalCandidats > 0 ? Math.round(((totalCandidats - refuses - abandonnes) / totalCandidats) * 100) : 0;

    const enrichedReferrers = referrers.map(r => this.enrichReferrerWithCandidates(r, candidates));
    const topParrains = enrichedReferrers
      .filter(r => getEffectiveReferrerStatus(r) !== 'ARCHIVED')
      .sort((a, b) => {
        const diff = (b.totalFilleuls || 0) - (a.totalFilleuls || 0);
        if (diff !== 0) return diff;
        return (b.enProduction || 0) - (a.enProduction || 0);
      })
      .slice(0, 10);

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
      topParrains,
      servers,
    };
  }

  async getOverviewStats(guildIds?: Record<DiscordServerType, string>) {
    const [candidates, referrers, servers] = await Promise.all([
      this.client.listDocuments<Candidate>('pawako_candidates'),
      this.getReferrers(),
      this.getDiscordServers(guildIds),
    ]);

    return this.computeOverviewStatsFromData({ candidates, referrers, servers });
  }

  async getAdminBootstrapData(guildIds?: Record<DiscordServerType, string>) {
    const [candidates, referrers, servers, isInitialAdminClaimed] = await Promise.all([
      this.client.listDocuments<Candidate>('pawako_candidates'),
      this.getReferrers(),
      this.getDiscordServers(guildIds),
      this.isInitialAdminClaimed().catch(() => false),
    ]);

    const enrichedReferrers = referrers.map(r => this.enrichReferrerWithCandidates(r, candidates));

    return {
      stats: this.computeOverviewStatsFromData({ candidates, referrers: enrichedReferrers, servers }),
      referrers: enrichedReferrers,
      isInitialAdminClaimed,
    };
  }

  async getParrainDashboard(discordUserId: string) {
    const [referrers, allCandidates] = await Promise.all([
      this.getReferrers(),
      this.client.listDocuments<Candidate>('pawako_candidates'),
    ]);

    const rawReferrer = referrers.find(r => r.discordUserId === discordUserId) || null;
    if (!rawReferrer) {
      throw new Error(`Aucun compte parrain actif n est associé au Discord ID : ${discordUserId}`);
    }

    const effStatus = getEffectiveReferrerStatus(rawReferrer);
    if (effStatus !== 'ACTIVE') {
      const err: any = new Error(
        effStatus === 'ARCHIVED'
          ? 'Votre profil parrain est archivé.'
          : 'Votre profil parrain est actuellement suspendu.'
      );
      err.status = 403;
      throw err;
    }

    const myCandidates = allCandidates.filter(
      c => c.referrerId === rawReferrer.id || c.referrerDiscordUserId === discordUserId
    );
    myCandidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Suppression stricte des données confidentielles (refusalReason, décisionnaires, incertitudes internes)
    const sanitizedCandidates = myCandidates.map(c => ({
      ...stripFirestoreMeta(c),
      refusalReason: null,
      decisionByUserId: null,
      decisionByName: null,
      anomalyReason: c.hasAnomaly ? 'Vérification administrative en cours' : null,
    }));

    const enrichedReferrer = this.enrichReferrerWithCandidates(rawReferrer, myCandidates);
    const totalFilleuls = sanitizedCandidates.length;
    const enAttente = sanitizedCandidates.filter(c => c.adminStatus === 'EN_ATTENTE').length;
    const acceptes = sanitizedCandidates.filter(c => c.adminStatus === 'ACCEPTE').length;
    const refuses = sanitizedCandidates.filter(c => c.adminStatus === 'REFUSE').length;
    const enFormation = sanitizedCandidates.filter(c => c.operationalStatus === 'FORMATION').length;
    const enSimulation = sanitizedCandidates.filter(c => c.operationalStatus === 'SIMULATION').length;
    const valides = sanitizedCandidates.filter(c => c.operationalStatus === 'VALIDE').length;
    const enProduction = sanitizedCandidates.filter(c => c.operationalStatus === 'PRODUCTION').length;
    const abandonnes = sanitizedCandidates.filter(c => c.adminStatus === 'ABANDONNE').length;

    return {
      referrer: enrichedReferrer,
      metrics: {
        totalFilleuls,
        enAttente,
        acceptes,
        refuses,
        enFormation,
        enSimulation,
        valides,
        enProduction,
        abandonnes,
        conversionRate: totalFilleuls > 0 ? Math.round((enProduction / totalFilleuls) * 100) : 0,
        acceptanceRate: totalFilleuls > 0 ? Math.round(((totalFilleuls - refuses) / totalFilleuls) * 100) : 0,
      },
      candidates: sanitizedCandidates,
    };
  }
}
