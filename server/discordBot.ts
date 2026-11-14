/**
 * PAWAKO Referral Manager — Service REST Bot Discord (Edge & Node compatible)
 * Génération et vérification de véritables invitations Discord sur le serveur RECRUTEMENT.
 * Règle critique : ne jamais fabriquer de faux liens (ex: PWK-...) en les présentant comme des invitations Discord réelles.
 */

import {
  DiscordBotDiscoveryResult,
  DiscordBotIdentity,
  DiscordDiscoveredChannel,
  DiscordDiscoveredGuild,
  DiscordDiscoveredInvite,
  DiscordDiscoveredRole,
  DiscordServerInfo,
  DiscordServerType,
  PawakoRoleType,
  ReferrerInviteStatus,
} from './types';

export interface DiscordBotConfig {
  botToken?: string;
  recruitmentGuildId?: string;
  inviteChannelId?: string;
}

export type DiscordBotErrorCode =
  | 'MISSING_DISCORD_BOT_TOKEN'
  | 'MISSING_RECRUITMENT_GUILD_ID'
  | 'MISSING_INVITE_CHANNEL'
  | 'DISCORD_MISSING_PERMISSIONS'
  | 'DISCORD_UNKNOWN_GUILD'
  | 'DISCORD_UNKNOWN_CHANNEL'
  | 'DISCORD_API_ERROR'
  | 'NETWORK_ERROR';

export interface DiscordInviteCreationResult {
  ok: boolean;
  code: string;
  url: string;
  channelId: string | null;
  channelName: string | null;
  guildId: string | null;
  inviteStatus: ReferrerInviteStatus;
  errorCode?: DiscordBotErrorCode;
  errorMessage?: string;
}

export interface DiscordInviteVerificationResult {
  valid: boolean;
  inviteStatus: ReferrerInviteStatus;
  code: string;
  url: string;
  guildId: string | null;
  channelId: string | null;
  uses: number | null;
  errorMessage?: string;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordResolvedUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  resolvedFrom: 'API' | 'GUILD_SEARCH';
}

export interface DiscordUserLookupResult {
  ok: boolean;
  user: DiscordResolvedUser | null;
  errorCode?:
    | 'MISSING_DISCORD_BOT_TOKEN'
    | 'DISCORD_USER_NOT_FOUND'
    | 'DISCORD_INVALID_IDENTIFIER'
    | 'DISCORD_API_ERROR'
    | 'NETWORK_ERROR';
  errorMessage?: string;
}

export function buildDiscordAvatarUrl(userId: string, avatarHash?: string | null): string | null {
  const hash = (avatarHash || '').trim();
  if (!hash) return null;
  if (hash.startsWith('http://') || hash.startsWith('https://')) return hash;
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(hash)}.png`;
}

/**
 * Récupère le profil réel d'un utilisateur Discord via son ID Snowflake (GET /users/{id}).
 * Fonctionne même si l'utilisateur n'a pas encore rejoint le serveur ou lancé OAuth2.
 */
export async function fetchDiscordUserById(params: {
  botToken?: string;
  discordUserId: string;
}): Promise<DiscordUserLookupResult> {
  const token = (params.botToken || '').trim();
  const cleanId = (params.discordUserId || '').trim();

  if (!/^\d{17,20}$/.test(cleanId)) {
    return {
      ok: false,
      user: null,
      errorCode: 'DISCORD_INVALID_IDENTIFIER',
      errorMessage: 'Discord User ID invalide (Snowflake 17-20 chiffres requis).',
    };
  }

  if (!token) {
    return {
      ok: false,
      user: null,
      errorCode: 'MISSING_DISCORD_BOT_TOKEN',
      errorMessage: 'Secret DISCORD_BOT_TOKEN manquant côté serveur.',
    };
  }

  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/${encodeURIComponent(cleanId)}`, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'PawakoReferralManager/1.0',
      },
    });

    if (res.status === 404) {
      return {
        ok: false,
        user: null,
        errorCode: 'DISCORD_USER_NOT_FOUND',
        errorMessage: `Aucun compte Discord trouvé pour l'ID ${cleanId}.`,
      };
    }

    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        user: null,
        errorCode: 'DISCORD_API_ERROR',
        errorMessage: `Impossible de lire le profil Discord (HTTP ${res.status}${errJson?.message ? `: ${errJson.message}` : ''}).`,
      };
    }

    const data = (await res.json()) as {
      id: string;
      username?: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    const username = (data.username || '').trim() || `user_${cleanId.slice(-4)}`;
    const displayName = (data.global_name || '').trim() || username;

    return {
      ok: true,
      user: {
        id: data.id || cleanId,
        username,
        displayName,
        avatar: buildDiscordAvatarUrl(data.id || cleanId, data.avatar),
        resolvedFrom: 'API',
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      user: null,
      errorCode: 'NETWORK_ERROR',
      errorMessage: `Erreur réseau Discord : ${err?.message || 'inconnue'}`,
    };
  }
}

/**
 * Recherche un utilisateur Discord par @username / pseudo sur les serveurs Discord PAWAKO configurés.
 */
export async function searchDiscordMemberByUsername(params: {
  botToken?: string;
  guildIds: string[];
  query: string;
}): Promise<DiscordUserLookupResult> {
  const token = (params.botToken || '').trim();
  const cleanQuery = (params.query || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/#0+$/, '')
    .trim();

  if (!cleanQuery || cleanQuery.length < 2) {
    return {
      ok: false,
      user: null,
      errorCode: 'DISCORD_INVALID_IDENTIFIER',
      errorMessage: "Saisissez un Discord User ID (17-20 chiffres) ou un @nom_utilisateur valide (min. 2 caractères).",
    };
  }

  if (!token) {
    return {
      ok: false,
      user: null,
      errorCode: 'MISSING_DISCORD_BOT_TOKEN',
      errorMessage:
        'DISCORD_BOT_TOKEN est requis pour rechercher un utilisateur par @pseudo. Saisissez directement son Discord User ID numérique.',
    };
  }

  const validGuilds = Array.from(
    new Set((params.guildIds || []).map(g => (g || '').trim()).filter(g => /^\d{17,20}$/.test(g)))
  );

  if (validGuilds.length === 0) {
    return {
      ok: false,
      user: null,
      errorCode: 'DISCORD_API_ERROR',
      errorMessage:
        'Aucun serveur Discord PAWAKO configuré pour rechercher un pseudo. Saisissez directement le Discord User ID numérique.',
    };
  }

  const normalizedQuery = cleanQuery.toLowerCase();
  const candidates: Array<DiscordResolvedUser & { exact: boolean }> = [];
  const seenIds = new Set<string>();
  let anyGuildSucceeded = false;

  for (const guildId of validGuilds) {
    try {
      const res = await fetch(
        `${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/members/search?query=${encodeURIComponent(cleanQuery)}&limit=10`,
        {
          headers: {
            Authorization: `Bot ${token}`,
            'User-Agent': 'PawakoReferralManager/1.0',
          },
        }
      );

      if (!res.ok) continue;
      anyGuildSucceeded = true;

      const members = (await res.json().catch(() => [])) as Array<{
        nick?: string | null;
        user?: {
          id?: string;
          username?: string;
          global_name?: string | null;
          avatar?: string | null;
        };
      }>;

      for (const m of Array.isArray(members) ? members : []) {
        const u = m?.user;
        if (!u?.id || seenIds.has(u.id)) continue;
        seenIds.add(u.id);

        const uname = (u.username || '').trim();
        const gname = (u.global_name || '').trim();
        const nick = (m.nick || '').trim();
        const displayName = gname || nick || uname || `user_${u.id.slice(-4)}`;

        const exact =
          uname.toLowerCase() === normalizedQuery ||
          gname.toLowerCase() === normalizedQuery ||
          nick.toLowerCase() === normalizedQuery;

        candidates.push({
          id: u.id,
          username: uname || `user_${u.id.slice(-4)}`,
          displayName,
          avatar: buildDiscordAvatarUrl(u.id, u.avatar),
          resolvedFrom: 'GUILD_SEARCH',
          exact,
        });
      }
    } catch {
      // Continuer sur les autres serveurs
    }
  }

  const exactMatches = candidates.filter(c => c.exact);
  if (exactMatches.length === 1) {
    const { exact: _exact, ...user } = exactMatches[0];
    return { ok: true, user };
  }

  if (exactMatches.length > 1) {
    const { exact: _exact, ...user } = exactMatches[0];
    return { ok: true, user };
  }

  if (candidates.length === 1) {
    const { exact: _exact, ...user } = candidates[0];
    return { ok: true, user };
  }

  if (candidates.length > 1) {
    const sample = candidates
      .slice(0, 3)
      .map(c => `@${c.username} (${c.id})`)
      .join(', ');
    return {
      ok: false,
      user: null,
      errorCode: 'DISCORD_USER_NOT_FOUND',
      errorMessage: `Plusieurs membres correspondent à "${cleanQuery}" (${sample}). Précisez le @username exact ou saisissez le Discord User ID.`,
    };
  }

  return {
    ok: false,
    user: null,
    errorCode: 'DISCORD_USER_NOT_FOUND',
    errorMessage: anyGuildSucceeded
      ? `Aucun membre "${cleanQuery}" trouvé sur les serveurs Discord PAWAKO. Vérifiez l'orthographe ou saisissez directement son Discord User ID (17-20 chiffres).`
      : `Le bot Discord n'a pas accès aux serveurs pour chercher "${cleanQuery}". Saisissez directement son Discord User ID (17-20 chiffres) ou ajoutez le bot sur le serveur.`,
  };
}

/**
 * Résout indifféremment un Discord User ID (Snowflake) ou un @username via l'API Discord v10.
 */
export async function resolveDiscordUserIdentifier(params: {
  botToken?: string;
  guildIds?: string[];
  identifier: string;
}): Promise<DiscordUserLookupResult> {
  const clean = (params.identifier || '').trim();
  if (/^\d{17,20}$/.test(clean)) {
    return fetchDiscordUserById({ botToken: params.botToken, discordUserId: clean });
  }
  return searchDiscordMemberByUsername({
    botToken: params.botToken,
    guildIds: params.guildIds || [],
    query: clean,
  });
}

/**
 * Détecte les anciens codes factices générés avant l'intégration réelle Discord Bot (PWK-... ou URL factice)
 */
export function isLegacyFakeInvite(inviteCode?: string | null, inviteUrl?: string | null): boolean {
  const code = (inviteCode || '').trim();
  const url = (inviteUrl || '').trim().toLowerCase();
  if (!code) return false;
  if (/^PWK-/i.test(code)) return true;
  if (url.includes('pawako-recrutement?ref=') || url.includes('?ref=')) return true;
  return false;
}

/**
 * Extrait et valide un vrai code d'invitation Discord depuis un code ou une URL discord.gg / discord.com/invite
 */
export function extractDiscordInviteCode(rawInput: string): string | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  if (isLegacyFakeInvite(trimmed, trimmed)) {
    return null;
  }

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (host === 'discord.gg') {
        candidate = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
      } else if (host === 'discord.com' || host === 'www.discord.com' || host === 'discordapp.com') {
        const match = parsed.pathname.match(/^\/invite\/([^/]+)/i);
        candidate = match ? match[1] : '';
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  // Les codes d'invitation Discord réels contiennent uniquement [a-zA-Z0-9-] (typiquement 6 à 32 caractères)
  if (!/^[a-zA-Z0-9-]{2,32}$/.test(candidate)) {
    return null;
  }

  return candidate;
}

interface DiscordChannel {
  id: string;
  name?: string;
  type: number;
  position?: number;
}

function scoreRecruitmentChannel(channel: DiscordChannel, preferredIds: Set<string>): number {
  let score = 0;
  if (preferredIds.has(channel.id)) score += 100;
  const name = (channel.name || '').toLowerCase();
  if (name.includes('recrutement') || name.includes('recruitment')) score += 60;
  if (name.includes('bienvenue') || name.includes('welcome') || name.includes('accueil')) score += 45;
  if (name.includes('general') || name.includes('général')) score += 20;
  if (channel.type === 0) score += 10; // GUILD_TEXT
  if (channel.type === 5) score += 5; // GUILD_ANNOUNCEMENT
  score -= Math.min(20, channel.position || 0) * 0.1;
  return score;
}

/**
 * Crée une véritable invitation Discord permanente et unique vers le serveur RECRUTEMENT
 * via le bot Discord (API REST v10).
 */
export async function createRecruitmentDiscordInvite(params: {
  botToken?: string;
  recruitmentGuildId?: string;
  inviteChannelId?: string;
  reason?: string;
}): Promise<DiscordInviteCreationResult> {
  const botToken = (params.botToken || '').trim();
  const guildId = (params.recruitmentGuildId || '').trim();
  const explicitChannelId = (params.inviteChannelId || '').trim();

  if (!botToken) {
    return {
      ok: false,
      code: '',
      url: '',
      channelId: null,
      channelName: null,
      guildId: guildId || null,
      inviteStatus: 'UNCONFIGURED',
      errorCode: 'MISSING_DISCORD_BOT_TOKEN',
      errorMessage:
        'Configuration Discord manquante : le secret DISCORD_BOT_TOKEN est absent côté serveur pour générer une véritable invitation Discord.',
    };
  }

  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    return {
      ok: false,
      code: '',
      url: '',
      channelId: null,
      channelName: null,
      guildId: guildId || null,
      inviteStatus: 'UNCONFIGURED',
      errorCode: 'MISSING_RECRUITMENT_GUILD_ID',
      errorMessage:
        'Configuration Discord manquante : DISCORD_RECRUITMENT_GUILD_ID doit contenir un Guild ID Discord valide du serveur Recrutement.',
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'PawakoReferralManager/1.0',
  };

  let candidateChannels: Array<{ id: string; name?: string }> = [];

  if (explicitChannelId) {
    if (!/^\d{17,20}$/.test(explicitChannelId)) {
      return {
        ok: false,
        code: '',
        url: '',
        channelId: explicitChannelId,
        channelName: null,
        guildId,
        inviteStatus: 'UNCONFIGURED',
        errorCode: 'DISCORD_UNKNOWN_CHANNEL',
        errorMessage: 'DISCORD_RECRUITMENT_INVITE_CHANNEL_ID est invalide (Snowflake Discord requis).',
      };
    }
    candidateChannels.push({ id: explicitChannelId });
  } else {
    try {
      const [guildRes, channelsRes] = await Promise.all([
        fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}`, { headers }),
        fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(guildId)}/channels`, { headers }),
      ]);

      if (!guildRes.ok && guildRes.status === 404) {
        return {
          ok: false,
          code: '',
          url: '',
          channelId: null,
          channelName: null,
          guildId,
          inviteStatus: 'ERROR',
          errorCode: 'DISCORD_UNKNOWN_GUILD',
          errorMessage:
            `Serveur Recrutement Discord (${guildId}) introuvable ou le bot n'y est pas encore invité.`,
        };
      }

      if (!channelsRes.ok) {
        const errJson = (await channelsRes.json().catch(() => null)) as { code?: number; message?: string } | null;
        if (channelsRes.status === 401 || channelsRes.status === 403 || errJson?.code === 50001 || errJson?.code === 50013) {
          return {
            ok: false,
            code: '',
            url: '',
            channelId: null,
            channelName: null,
            guildId,
            inviteStatus: 'ERROR',
            errorCode: 'DISCORD_MISSING_PERMISSIONS',
            errorMessage:
              "Le bot Discord n'a pas accès au serveur Recrutement ou manque des permissions (VIEW_CHANNEL / CREATE_INSTANT_INVITE).",
          };
        }
        return {
          ok: false,
          code: '',
          url: '',
          channelId: null,
          channelName: null,
          guildId,
          inviteStatus: 'ERROR',
          errorCode: 'DISCORD_API_ERROR',
          errorMessage: `Erreur API Discord lors de la lecture des salons (HTTP ${channelsRes.status}${errJson?.message ? `: ${errJson.message}` : ''}).`,
        };
      }

      const preferredIds = new Set<string>();
      if (guildRes.ok) {
        const guildData = (await guildRes.json().catch(() => null)) as {
          rules_channel_id?: string | null;
          system_channel_id?: string | null;
          public_updates_channel_id?: string | null;
        } | null;
        if (guildData?.rules_channel_id) preferredIds.add(guildData.rules_channel_id);
        if (guildData?.system_channel_id) preferredIds.add(guildData.system_channel_id);
      }

      const rawChannels = (await channelsRes.json().catch(() => [])) as DiscordChannel[];
      const textChannels = (Array.isArray(rawChannels) ? rawChannels : [])
        .filter(ch => ch && (ch.type === 0 || ch.type === 5))
        .sort((a, b) => scoreRecruitmentChannel(b, preferredIds) - scoreRecruitmentChannel(a, preferredIds));

      candidateChannels = textChannels.slice(0, 5).map(ch => ({ id: ch.id, name: ch.name }));
    } catch (err: any) {
      return {
        ok: false,
        code: '',
        url: '',
        channelId: null,
        channelName: null,
        guildId,
        inviteStatus: 'ERROR',
        errorCode: 'NETWORK_ERROR',
        errorMessage: `Impossible de contacter l'API Discord : ${err?.message || 'erreur réseau'}`,
      };
    }
  }

  if (candidateChannels.length === 0) {
    return {
      ok: false,
      code: '',
      url: '',
      channelId: null,
      channelName: null,
      guildId,
      inviteStatus: 'UNCONFIGURED',
      errorCode: 'MISSING_INVITE_CHANNEL',
      errorMessage:
        'Aucun salon texte disponible sur le serveur Recrutement pour créer une invitation. Configurez DISCORD_RECRUITMENT_INVITE_CHANNEL_ID.',
    };
  }

  let lastPermError: DiscordInviteCreationResult | null = null;

  for (const ch of candidateChannels) {
    try {
      const inviteHeaders: Record<string, string> = { ...headers };
      if (params.reason) {
        inviteHeaders['X-Audit-Log-Reason'] = encodeURIComponent(params.reason.slice(0, 200));
      }

      const inviteRes = await fetch(`${DISCORD_API_BASE}/channels/${encodeURIComponent(ch.id)}/invites`, {
        method: 'POST',
        headers: inviteHeaders,
        body: JSON.stringify({
          max_age: 0,
          max_uses: 0,
          temporary: false,
          unique: true,
        }),
      });

      if (inviteRes.ok) {
        const data = (await inviteRes.json()) as {
          code: string;
          channel?: { id?: string; name?: string };
          guild?: { id?: string };
        };

        if (data?.code) {
          return {
            ok: true,
            code: data.code,
            url: `https://discord.gg/${data.code}`,
            channelId: data.channel?.id || ch.id,
            channelName: data.channel?.name || ch.name || null,
            guildId: data.guild?.id || guildId,
            inviteStatus: 'ACTIVE',
          };
        }
      }

      const errJson = (await inviteRes.json().catch(() => null)) as { code?: number; message?: string } | null;

      if (inviteRes.status === 401) {
        return {
          ok: false,
          code: '',
          url: '',
          channelId: ch.id,
          channelName: ch.name || null,
          guildId,
          inviteStatus: 'ERROR',
          errorCode: 'DISCORD_MISSING_PERMISSIONS',
          errorMessage: 'DISCORD_BOT_TOKEN rejeté par Discord (HTTP 401 Unauthorized). Vérifiez le token du bot.',
        };
      }

      if (inviteRes.status === 403 || errJson?.code === 50013 || errJson?.code === 50001) {
        lastPermError = {
          ok: false,
          code: '',
          url: '',
          channelId: ch.id,
          channelName: ch.name || null,
          guildId,
          inviteStatus: 'ERROR',
          errorCode: 'DISCORD_MISSING_PERMISSIONS',
          errorMessage:
            `Permission Discord CREATE_INSTANT_INVITE manquante sur le salon ${ch.name ? `#${ch.name}` : ch.id} du serveur Recrutement.`,
        };
        continue;
      }

      if (inviteRes.status === 404 || errJson?.code === 10003) {
        lastPermError = {
          ok: false,
          code: '',
          url: '',
          channelId: ch.id,
          channelName: ch.name || null,
          guildId,
          inviteStatus: 'ERROR',
          errorCode: 'DISCORD_UNKNOWN_CHANNEL',
          errorMessage: `Salon Discord (${ch.id}) introuvable pour la création d'invitation.`,
        };
        continue;
      }

      lastPermError = {
        ok: false,
        code: '',
        url: '',
        channelId: ch.id,
        channelName: ch.name || null,
        guildId,
        inviteStatus: 'ERROR',
        errorCode: 'DISCORD_API_ERROR',
        errorMessage: `Erreur API Discord (HTTP ${inviteRes.status}${errJson?.message ? `: ${errJson.message}` : ''}).`,
      };
    } catch (err: any) {
      lastPermError = {
        ok: false,
        code: '',
        url: '',
        channelId: ch.id,
        channelName: ch.name || null,
        guildId,
        inviteStatus: 'ERROR',
        errorCode: 'NETWORK_ERROR',
        errorMessage: `Erreur réseau lors de la création d'invitation Discord : ${err?.message || 'inconnue'}`,
      };
    }
  }

  return (
    lastPermError || {
      ok: false,
      code: '',
      url: '',
      channelId: null,
      channelName: null,
      guildId,
      inviteStatus: 'ERROR',
      errorCode: 'DISCORD_API_ERROR',
      errorMessage: "Impossible de créer une invitation Discord sur le serveur Recrutement.",
    }
  );
}

/**
 * Vérifie l'état réel d'un code d'invitation Discord auprès de l'API Discord v10.
 */
export async function verifyDiscordInvite(params: {
  botToken?: string;
  inviteCode: string;
  expectedGuildId?: string;
}): Promise<DiscordInviteVerificationResult> {
  const code = extractDiscordInviteCode(params.inviteCode);
  if (!code) {
    return {
      valid: false,
      inviteStatus: 'ERROR',
      code: params.inviteCode,
      url: '',
      guildId: null,
      channelId: null,
      uses: null,
      errorMessage: 'Code d invitation Discord invalide ou ancien code factice non-Discord.',
    };
  }

  const headers: Record<string, string> = {
    'User-Agent': 'PawakoReferralManager/1.0',
  };
  if (params.botToken?.trim()) {
    headers.Authorization = `Bot ${params.botToken.trim()}`;
  }

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/invites/${encodeURIComponent(code)}?with_counts=true&with_expiration=true`,
      { headers }
    );

    if (res.status === 404) {
      return {
        valid: false,
        inviteStatus: 'EXPIRED_OR_DELETED',
        code,
        url: `https://discord.gg/${code}`,
        guildId: null,
        channelId: null,
        uses: null,
        errorMessage: "Cette invitation Discord n'existe plus ou a expiré.",
      };
    }

    if (!res.ok) {
      return {
        valid: false,
        inviteStatus: 'ERROR',
        code,
        url: `https://discord.gg/${code}`,
        guildId: null,
        channelId: null,
        uses: null,
        errorMessage: `Impossible de vérifier l'invitation Discord (HTTP ${res.status}).`,
      };
    }

    const data = (await res.json()) as {
      code?: string;
      guild?: { id?: string };
      channel?: { id?: string };
      uses?: number;
    };

    const resolvedGuildId = data?.guild?.id || null;
    if (params.expectedGuildId?.trim() && resolvedGuildId && resolvedGuildId !== params.expectedGuildId.trim()) {
      return {
        valid: false,
        inviteStatus: 'ERROR',
        code,
        url: `https://discord.gg/${code}`,
        guildId: resolvedGuildId,
        channelId: data?.channel?.id || null,
        uses: typeof data?.uses === 'number' ? data.uses : null,
        errorMessage: `Ce lien pointe vers un autre serveur (${resolvedGuildId}) et non le serveur Recrutement.`,
      };
    }

    return {
      valid: true,
      inviteStatus: 'ACTIVE',
      code: data.code || code,
      url: `https://discord.gg/${data.code || code}`,
      guildId: resolvedGuildId,
      channelId: data?.channel?.id || null,
      uses: typeof data?.uses === 'number' ? data.uses : null,
    };
  } catch (err: any) {
    return {
      valid: false,
      inviteStatus: 'ERROR',
      code,
      url: `https://discord.gg/${code}`,
      guildId: null,
      channelId: null,
      uses: null,
      errorMessage: `Erreur réseau lors de la vérification de l'invitation Discord : ${err?.message || 'inconnue'}`,
    };
  }
}

/**
 * Suppression best-effort d'une invitation Discord (ex: nettoyage si création concurrente)
 */
export async function revokeDiscordInvite(params: { botToken?: string; inviteCode: string }): Promise<boolean> {
  const token = (params.botToken || '').trim();
  const code = extractDiscordInviteCode(params.inviteCode);
  if (!token || !code) return false;

  try {
    const res = await fetch(`${DISCORD_API_BASE}/invites/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'PawakoReferralManager/1.0',
      },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

// =============================================================================
// AUTO-DÉCOUVERTE & IDENTIFICATION BOT DISCORD (SERVEURS, SALONS, RÔLES, INVITATIONS, MEMBRES)
// =============================================================================

export interface DiscordGuildFetchedMember {
  discordUserId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  roleIds: string[];
}

export interface DiscordBotDiscoveryWithMembersResult extends DiscordBotDiscoveryResult {
  guildMembersByGuildId: Record<string, DiscordGuildFetchedMember[]>;
}

function buildDiscordGuildIconUrl(guildId: string, iconHash?: string | null): string | null {
  const hash = (iconHash || '').trim();
  if (!hash) return null;
  if (hash.startsWith('http://') || hash.startsWith('https://')) return hash;
  return `https://cdn.discordapp.com/icons/${encodeURIComponent(guildId)}/${encodeURIComponent(hash)}.png`;
}

export function normalizeDiscordLabel(raw?: string | null): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function suggestServerTypeForGuildName(guildName?: string | null): DiscordServerType | null {
  const name = normalizeDiscordLabel(guildName);
  if (!name) return null;

  if (/(recrut|recruit|candidat|embauche|selection|onboarding)/.test(name)) {
    return 'RECRUTEMENT';
  }
  if (/(formation|training|ecole|academ|apprenti|bootcamp)/.test(name)) {
    return 'FORMATION';
  }
  if (/(insta|instagram|\big\b|reel|smma)/.test(name)) {
    return 'PRODUCTION_INSTAGRAM';
  }
  if (/(chatting|chatteur|chatter|\bchat\b|onlyfans|mym)/.test(name)) {
    return 'PRODUCTION_CHATTING';
  }
  if (/(production|\bprod\b)/.test(name)) {
    return 'PRODUCTION_CHATTING';
  }
  return null;
}

const SERVER_ROLE_RULES: Record<
  DiscordServerType,
  Array<{ roleType: PawakoRoleType; positive: RegExp[]; negative?: RegExp[] }>
> = {
  RECRUTEMENT: [
    {
      roleType: 'CANDIDAT_ACCEPTE',
      positive: [/\bcandidat accepte\b/, /\baccepte\b/, /\baccepted\b/, /\badmis\b/, /\bretenu\b/, /\brecrute\b/],
      negative: [/\brefus/, /\brejet/],
    },
    {
      roleType: 'CANDIDAT_REFUSE',
      positive: [/\bcandidat refuse\b/, /\brefuse\b/, /\brefus\b/, /\brefused\b/, /\brejete\b/, /\bdeclin\b/],
    },
    {
      roleType: 'CANDIDAT',
      positive: [/\bcandidat\b/, /\bpostulant\b/, /\bapplicant\b/, /\brecrue\b/, /\bnouveau\b/, /\ben attente\b/],
      negative: [/\baccepte\b/, /\brefus/, /\bvalide\b/, /\bformateur\b/, /\bstaff\b/, /\badmin\b/],
    },
  ],
  FORMATION: [
    {
      roleType: 'VA_VALIDE',
      positive: [/\bva valide\b/, /\bvalide\b/, /\bcertifie\b/, /\bcertified\b/, /\bdiplome\b/, /\bpret\b/],
      negative: [/\ben formation\b/, /\bsimulation\b/],
    },
    {
      roleType: 'EN_SIMULATION',
      positive: [/\ben simulation\b/, /\bsimulation\b/, /\bsimu\b/, /\btest\b/],
    },
    {
      roleType: 'EN_FORMATION',
      positive: [/\ben formation\b/, /\bformation\b/, /\btraining\b/, /\bstagiaire\b/, /\beleve\b/, /\bapprenti\b/],
      negative: [/\bformateur\b/, /\btrainer\b/, /\bcoach\b/, /\bstaff\b/],
    },
  ],
  PRODUCTION_CHATTING: [
    {
      roleType: 'VA_PRODUCTION',
      positive: [/\bva production\b/, /\bva chatting\b/, /\bproduction\b/, /\bprod\b/, /\bchatteur\b/, /\bchatter\b/, /\bva\b/],
      negative: [/\badmin\b/, /\bmanager\b/, /\bresponsable\b/, /\bstaff\b/, /\bmoderateur\b/],
    },
  ],
  PRODUCTION_INSTAGRAM: [
    {
      roleType: 'VA_PRODUCTION',
      positive: [/\bva production\b/, /\bva instagram\b/, /\bproduction\b/, /\bprod\b/, /\binstagram\b/, /\binsta\b/, /\bva\b/],
      negative: [/\badmin\b/, /\bmanager\b/, /\bresponsable\b/, /\bstaff\b/, /\bmoderateur\b/],
    },
  ],
};

export function suggestRoleMappingsForGuild(
  serverType: DiscordServerType,
  roles: DiscordDiscoveredRole[]
): Partial<Record<PawakoRoleType, { roleId: string; roleName: string }>> {
  const rules = SERVER_ROLE_RULES[serverType] || [];
  const eligible = roles.filter(r => !r.managed && r.name !== '@everyone');
  const usedRoleIds = new Set<string>();
  const mappings: Partial<Record<PawakoRoleType, { roleId: string; roleName: string }>> = {};

  for (const rule of rules) {
    let bestRole: DiscordDiscoveredRole | null = null;
    let bestScore = 0;

    for (const role of eligible) {
      if (usedRoleIds.has(role.id)) continue;
      const norm = normalizeDiscordLabel(role.name);
      if (!norm) continue;
      if (rule.negative?.some(rx => rx.test(norm))) continue;

      let score = 0;
      rule.positive.forEach((rx, idx) => {
        if (rx.test(norm)) {
          score += (rule.positive.length - idx) * 10;
        }
      });

      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    if (bestRole) {
      usedRoleIds.add(bestRole.id);
      mappings[rule.roleType] = { roleId: bestRole.id, roleName: bestRole.name };
    }
  }

  return mappings;
}

export async function fetchBotIdentity(params: {
  botToken?: string;
  clientId?: string;
}): Promise<{
  ok: boolean;
  bot: DiscordBotIdentity | null;
  errorCode?: string;
  errorMessage?: string;
}> {
  const token = (params.botToken || '').trim();
  if (!token) {
    return {
      ok: false,
      bot: null,
      errorCode: 'MISSING_DISCORD_BOT_TOKEN',
      errorMessage: 'Secret DISCORD_BOT_TOKEN manquant côté Worker Cloudflare.',
    };
  }

  try {
    const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'PawakoReferralManager/1.0',
      },
    });

    if (res.status === 401) {
      return {
        ok: false,
        bot: null,
        errorCode: 'INVALID_DISCORD_BOT_TOKEN',
        errorMessage: 'DISCORD_BOT_TOKEN rejeté par Discord (HTTP 401). Vérifiez ou régénérez le token du bot.',
      };
    }

    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        bot: null,
        errorCode: 'DISCORD_API_ERROR',
        errorMessage: `Erreur API Discord lors de la vérification du bot (HTTP ${res.status}${errJson?.message ? `: ${errJson.message}` : ''}).`,
      };
    }

    const data = (await res.json()) as {
      id: string;
      username?: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    const appId = (params.clientId || '').trim() || data.id;
    const inviteBotUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
      appId
    )}&permissions=8&scope=bot%20applications.commands`;

    return {
      ok: true,
      bot: {
        id: data.id,
        username: data.username || 'pawako-bot',
        displayName: (data.global_name || data.username || 'Bot PAWAKO').trim(),
        avatar: buildDiscordAvatarUrl(data.id, data.avatar),
        inviteBotUrl,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      bot: null,
      errorCode: 'NETWORK_ERROR',
      errorMessage: `Impossible de contacter Discord : ${err?.message || 'erreur réseau'}`,
    };
  }
}

export async function discoverDiscordBotEnvironment(params: {
  botToken?: string;
  clientId?: string;
  envGuildIds?: Partial<Record<DiscordServerType, string>>;
  savedServers?: DiscordServerInfo[];
  includeMembers?: boolean;
}): Promise<DiscordBotDiscoveryWithMembersResult> {
  const token = (params.botToken || '').trim();
  const hasBotToken = Boolean(token);

  const identity = await fetchBotIdentity({ botToken: token, clientId: params.clientId });
  if (!identity.ok || !identity.bot) {
    return {
      ok: false,
      hasBotToken,
      bot: null,
      guilds: [],
      matchedServers: {},
      guildMembersByGuildId: {},
      errorCode: identity.errorCode || 'DISCORD_BOT_ERROR',
      errorMessage: identity.errorMessage || 'Bot Discord indisponible.',
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    'User-Agent': 'PawakoReferralManager/1.0',
  };

  let rawGuilds: Array<{ id: string; name: string; icon?: string | null; approximate_member_count?: number }> = [];
  try {
    const guildsRes = await fetch(`${DISCORD_API_BASE}/users/@me/guilds?with_counts=true&limit=200`, { headers });
    if (!guildsRes.ok) {
      const errJson = (await guildsRes.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        hasBotToken,
        bot: identity.bot,
        guilds: [],
        matchedServers: {},
        guildMembersByGuildId: {},
        errorCode: 'DISCORD_API_ERROR',
        errorMessage: `Impossible de lister les serveurs du bot (HTTP ${guildsRes.status}${errJson?.message ? `: ${errJson.message}` : ''}).`,
      };
    }
    const parsed = await guildsRes.json().catch(() => []);
    rawGuilds = Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    return {
      ok: false,
      hasBotToken,
      bot: identity.bot,
      guilds: [],
      matchedServers: {},
      guildMembersByGuildId: {},
      errorCode: 'NETWORK_ERROR',
      errorMessage: `Erreur réseau lors de la lecture des serveurs Discord : ${err?.message || 'inconnue'}`,
    };
  }

  const guildMembersByGuildId: Record<string, DiscordGuildFetchedMember[]> = {};
  const inspectedGuilds: DiscordDiscoveredGuild[] = [];

  // Inspecter chaque serveur présent sur le bot en tranches de 4
  const chunkSize = 4;
  for (let i = 0; i < rawGuilds.length; i += chunkSize) {
    const chunk = rawGuilds.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async g => {
        const [guildRes, rolesRes, channelsRes, invitesRes, membersRes] = await Promise.all([
          fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(g.id)}?with_counts=true`, { headers }).catch(() => null),
          fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(g.id)}/roles`, { headers }).catch(() => null),
          fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(g.id)}/channels`, { headers }).catch(() => null),
          fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(g.id)}/invites`, { headers }).catch(() => null),
          params.includeMembers
            ? fetch(`${DISCORD_API_BASE}/guilds/${encodeURIComponent(g.id)}/members?limit=1000`, { headers }).catch(
                () => null
              )
            : Promise.resolve(null),
        ]);

        const guildJson = guildRes && guildRes.ok ? ((await guildRes.json().catch(() => null)) as any) : null;
        const rawRoles = rolesRes && rolesRes.ok ? ((await rolesRes.json().catch(() => [])) as any[]) : [];
        const rawChannels = channelsRes && channelsRes.ok ? ((await channelsRes.json().catch(() => [])) as any[]) : [];
        const rawInvites = invitesRes && invitesRes.ok ? ((await invitesRes.json().catch(() => [])) as any[]) : [];

        const roles: DiscordDiscoveredRole[] = (Array.isArray(rawRoles) ? rawRoles : [])
          .filter(r => r && r.id)
          .map(r => ({
            id: String(r.id),
            name: String(r.name || ''),
            color: Number(r.color || 0),
            position: Number(r.position || 0),
            managed: Boolean(r.managed),
          }))
          .sort((a, b) => b.position - a.position);

        const channels: DiscordDiscoveredChannel[] = (Array.isArray(rawChannels) ? rawChannels : [])
          .filter(ch => ch && ch.id && (ch.type === 0 || ch.type === 5))
          .map(ch => ({
            id: String(ch.id),
            name: String(ch.name || ''),
            type: Number(ch.type || 0),
            position: Number(ch.position || 0),
          }))
          .sort((a, b) => a.position - b.position);

        const preferredChannelIds = new Set<string>();
        if (guildJson?.rules_channel_id) preferredChannelIds.add(String(guildJson.rules_channel_id));
        if (guildJson?.system_channel_id) preferredChannelIds.add(String(guildJson.system_channel_id));

        const sortedInviteChannels = [...channels].sort(
          (a, b) => scoreRecruitmentChannel(b, preferredChannelIds) - scoreRecruitmentChannel(a, preferredChannelIds)
        );
        const bestInviteChannel = sortedInviteChannels[0] || null;

        const invites: DiscordDiscoveredInvite[] = (Array.isArray(rawInvites) ? rawInvites : [])
          .filter(inv => inv && inv.code)
          .map(inv => ({
            code: String(inv.code),
            url: `https://discord.gg/${inv.code}`,
            channelId: inv.channel?.id ? String(inv.channel.id) : null,
            channelName: inv.channel?.name ? String(inv.channel.name) : null,
            inviterUserId: inv.inviter?.id ? String(inv.inviter.id) : null,
            inviterUsername: inv.inviter?.username ? String(inv.inviter.username) : null,
            uses: typeof inv.uses === 'number' ? inv.uses : 0,
            maxAge: typeof inv.max_age === 'number' ? inv.max_age : 0,
            temporary: Boolean(inv.temporary),
          }));

        let membersAccessible = false;
        const parsedMembers: DiscordGuildFetchedMember[] = [];
        if (membersRes && membersRes.ok) {
          membersAccessible = true;
          const rawMembers = (await membersRes.json().catch(() => [])) as any[];
          for (const m of Array.isArray(rawMembers) ? rawMembers : []) {
            if (!m?.user?.id || m.user.bot) continue;
            const uid = String(m.user.id);
            const uname = String(m.user.username || `user_${uid.slice(-4)}`);
            const dname = String(m.user.global_name || m.nick || uname).trim();
            parsedMembers.push({
              discordUserId: uid,
              username: uname,
              displayName: dname,
              avatar: buildDiscordAvatarUrl(uid, m.user.avatar),
              roleIds: Array.isArray(m.roles) ? m.roles.map(String) : [],
            });
          }
          guildMembersByGuildId[g.id] = parsedMembers;
        }

        const suggestedType = suggestServerTypeForGuildName(guildJson?.name || g.name);
        const memberCount = Number(
          guildJson?.approximate_member_count ?? g.approximate_member_count ?? parsedMembers.length ?? 0
        );

        return {
          id: g.id,
          name: String(guildJson?.name || g.name || g.id),
          iconUrl: buildDiscordGuildIconUrl(g.id, guildJson?.icon ?? g.icon),
          memberCount,
          ownerId: guildJson?.owner_id ? String(guildJson.owner_id) : null,
          rulesChannelId: guildJson?.rules_channel_id ? String(guildJson.rules_channel_id) : null,
          systemChannelId: guildJson?.system_channel_id ? String(guildJson.system_channel_id) : null,
          suggestedServerType: suggestedType,
          roles,
          channels,
          suggestedInviteChannelId: bestInviteChannel?.id || null,
          suggestedInviteChannelName: bestInviteChannel?.name || null,
          invites,
          suggestedRoleMappings: suggestedType ? suggestRoleMappingsForGuild(suggestedType, roles) : {},
          membersAccessible,
          membersFetchedCount: parsedMembers.length,
        } satisfies DiscordDiscoveredGuild;
      })
    );
    inspectedGuilds.push(...results);
  }

  // Correspondance sans doublon entre les 4 types de serveurs PAWAKO et les serveurs trouvés
  const matchedServers: Partial<Record<DiscordServerType, string>> = {};
  const assignedGuildIds = new Set<string>();
  const guildById = new Map(inspectedGuilds.map(g => [g.id, g]));
  const serverOrder: DiscordServerType[] = [
    'RECRUTEMENT',
    'FORMATION',
    'PRODUCTION_CHATTING',
    'PRODUCTION_INSTAGRAM',
  ];

  // Priorité 1 : variables d'environnement explicites (si présentes sur le bot)
  for (const sType of serverOrder) {
    const envId = (params.envGuildIds?.[sType] || '').trim();
    if (envId && guildById.has(envId) && !assignedGuildIds.has(envId)) {
      matchedServers[sType] = envId;
      assignedGuildIds.add(envId);
    }
  }

  // Priorité 2 : serveurs déjà enregistrés en base Firestore
  for (const sType of serverOrder) {
    if (matchedServers[sType]) continue;
    const savedId = (params.savedServers?.find(s => s.id === sType)?.guildId || '').trim();
    if (savedId && guildById.has(savedId) && !assignedGuildIds.has(savedId)) {
      matchedServers[sType] = savedId;
      assignedGuildIds.add(savedId);
    }
  }

  // Priorité 3 : détection automatique intelligente par le nom du serveur Discord
  for (const sType of serverOrder) {
    if (matchedServers[sType]) continue;
    const matchedGuild = inspectedGuilds.find(g => !assignedGuildIds.has(g.id) && g.suggestedServerType === sType);
    if (matchedGuild) {
      matchedServers[sType] = matchedGuild.id;
      assignedGuildIds.add(matchedGuild.id);
    }
  }

  // Recalculer suggestedRoleMappings & suggestedServerType selon l'association finale
  for (const [sType, gId] of Object.entries(matchedServers) as Array<[DiscordServerType, string]>) {
    const g = guildById.get(gId);
    if (g) {
      g.suggestedServerType = sType;
      g.suggestedRoleMappings = suggestRoleMappingsForGuild(sType, g.roles);
    }
  }

  return {
    ok: true,
    hasBotToken,
    bot: identity.bot,
    guilds: inspectedGuilds,
    matchedServers,
    guildMembersByGuildId,
    errorCode: null,
    errorMessage: null,
  };
}

