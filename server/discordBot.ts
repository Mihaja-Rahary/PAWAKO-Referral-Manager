/**
 * PAWAKO Referral Manager — Service REST Bot Discord (Edge & Node compatible)
 * Génération et vérification de véritables invitations Discord sur le serveur RECRUTEMENT.
 * Règle critique : ne jamais fabriquer de faux liens (ex: PWK-...) en les présentant comme des invitations Discord réelles.
 */

import { ReferrerInviteStatus } from './types';

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
