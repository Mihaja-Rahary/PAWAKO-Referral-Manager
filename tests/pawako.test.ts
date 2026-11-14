import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app, { Env } from '../worker/index';
import { FirestoreRestClient, toFirestoreDocument } from '../server/firestoreRest';
import { FirestoreRepository } from '../server/firestoreRepository';
import { toParrainCandidateView } from '../server/api';
import { Candidate } from '../server/types';

// Clé privée RSA PKCS#8 générée localement à la volée pour les tests (aucun secret réel)
const { privateKey: TEST_PKCS8_PRIVATE_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const TEST_PROJECT_ID = 'pawako-test-project';
const TEST_DATABASE_ID = 'pawako-test-db';
const WORKER_ORIGIN = 'https://referral-manager.pawako-saas.workers.dev';
const FRONTEND_ORIGIN = 'https://pawako-referral-manager.pages.dev';

const GUILD_IDS = {
  RECRUTEMENT: '111111111111111111',
  FORMATION: '222222222222222222',
  PRODUCTION_CHATTING: '333333333333333333',
  PRODUCTION_INSTAGRAM: '444444444444444444',
};

interface StoredDoc {
  fields: Record<string, any>;
  createTime: string;
  updateTime: string;
  version: number;
}

class MockExternalServices {
  public collections = new Map<string, Map<string, StoredDoc>>();
  private txCounter = 0;
  private inviteCounter = 0;

  // État configurable Discord REST / OAuth2 pour les tests
  public discordAuthCodes = new Map<
    string,
    { id: string; username: string; global_name?: string; avatar?: string | null }
  >();
  public discordGuildChannels: Array<{ id: string; name: string; type: number; position: number }> = [
    { id: '900000000000000001', name: 'recrutement-liens', type: 0, position: 0 },
  ];
  public discordInvites = new Map<
    string,
    { code: string; guildId: string; channelId: string; uses: number; deleted?: boolean }
  >();
  public failDiscordBotPermissions = false;
  public simulateInviteCommitRaceCount = 0;
  public revokedInvites: string[] = [];
  public discordUsers = new Map<
    string,
    { id: string; username: string; global_name?: string | null; avatar?: string | null }
  >();
  public mockBotGuilds: Array<{
    id: string;
    name: string;
    icon?: string | null;
    approximate_member_count?: number;
    rules_channel_id?: string | null;
    system_channel_id?: string | null;
    roles?: Array<{ id: string; name: string; color?: number; position?: number; managed?: boolean }>;
    channels?: Array<{ id: string; name: string; type: number; position?: number }>;
    invites?: Array<{
      code: string;
      channel?: { id: string; name?: string };
      inviter?: { id: string; username?: string };
      uses?: number;
      max_age?: number;
      temporary?: boolean;
    }>;
    members?: Array<{
      user: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
      nick?: string | null;
      roles: string[];
    }>;
    membersForbidden?: boolean;
  }> = [];

  private getCollection(col: string): Map<string, StoredDoc> {
    let map = this.collections.get(col);
    if (!map) {
      map = new Map<string, StoredDoc>();
      this.collections.set(col, map);
    }
    return map;
  }

  private nextTimestamp(version: number): string {
    return new Date(1760000000000 + version * 1000).toISOString();
  }

  private buildDocJson(col: string, docId: string, doc: StoredDoc) {
    return {
      name: `projects/${TEST_PROJECT_ID}/databases/${TEST_DATABASE_ID}/documents/${col}/${docId}`,
      fields: structuredClone(doc.fields),
      createTime: doc.createTime,
      updateTime: doc.updateTime,
    };
  }

  private parseDocPath(pathname: string): { col: string; docId?: string } | null {
    const marker = '/documents/';
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = pathname.slice(idx + marker.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length === 1) {
      return { col: decodeURIComponent(parts[0]) };
    }
    if (parts.length >= 2) {
      return {
        col: decodeURIComponent(parts[0]),
        docId: decodeURIComponent(parts.slice(1).join('/')),
      };
    }
    return null;
  }

  private checkPrecondition(
    existing: StoredDoc | undefined,
    precondition?: { exists?: boolean; updateTime?: string }
  ): { ok: true } | { ok: false; status: number; firestoreStatus: string; message: string } {
    if (!precondition) return { ok: true };
    if (precondition.exists === false && existing) {
      return {
        ok: false,
        status: 409,
        firestoreStatus: 'ALREADY_EXISTS',
        message: 'Document already exists',
      };
    }
    if (precondition.exists === true && !existing) {
      return {
        ok: false,
        status: 409,
        firestoreStatus: 'FAILED_PRECONDITION',
        message: 'Document missing for precondition exists=true',
      };
    }
    if (precondition.updateTime && (!existing || existing.updateTime !== precondition.updateTime)) {
      return {
        ok: false,
        status: 409,
        firestoreStatus: 'FAILED_PRECONDITION',
        message: 'Document updateTime mismatch',
      };
    }
    return { ok: true };
  }

  public installFetchMock(): () => void {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(urlStr);
      const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();

      // 1. Google OAuth2 Token
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
        return new Response(
          JSON.stringify({ access_token: 'mock-google-access-token', expires_in: 3600 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Cloud Firestore REST v1
      if (url.hostname === 'firestore.googleapis.com') {
        const bodyText = typeof init?.body === 'string' ? init.body : '';

        if (url.pathname.endsWith(':beginTransaction') && method === 'POST') {
          this.txCounter += 1;
          return new Response(JSON.stringify({ transaction: `mock-tx-${this.txCounter}` }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.pathname.endsWith(':commit') && method === 'POST') {
          const parsed = JSON.parse(bodyText || '{}') as {
            writes?: Array<{
              update?: { name: string; fields: Record<string, any> };
              currentDocument?: { exists?: boolean; updateTime?: string };
            }>;
          };
          const writes = parsed.writes || [];

          for (const w of writes) {
            if (!w.update) continue;
            if (!/^projects\/[^/]+\/databases\/[^/]+\/documents\/[^/]+\/.+$/.test(w.update.name || '')) {
              return new Response(
                JSON.stringify({
                  error: {
                    code: 400,
                    status: 'INVALID_ARGUMENT',
                    message: `Document name "${w.update.name}" is not valid. Expected projects/{project}/databases/{db}/documents/{collection}/{docId}.`,
                  },
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }

          // Option pour simuler une collision sur la création concurrente de pawako_referrers
          if (
            this.simulateInviteCommitRaceCount > 0 &&
            writes.some(w => w.update?.name.includes('/pawako_referrers/'))
          ) {
            this.simulateInviteCommitRaceCount -= 1;
            // Exécuter d'abord comme si une requête concurrente avait déjà gagné
            for (const w of writes) {
              if (!w.update) continue;
              const p = this.parseDocPath(`/${w.update.name}`);
              if (!p?.docId) continue;
              const colMap = this.getCollection(p.col);
              const existing = colMap.get(p.docId);
              const version = (existing?.version || 0) + 1;
              const ts = this.nextTimestamp(version);
              colMap.set(p.docId, {
                fields: structuredClone(w.update.fields || {}),
                createTime: existing?.createTime || ts,
                updateTime: ts,
                version,
              });
            }
            return new Response(
              JSON.stringify({ error: { status: 'ALREADY_EXISTS', message: 'Concurrent commit collision' } }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }

          // Vérification atomique de toutes les préconditions avant écriture
          for (const w of writes) {
            if (!w.update) continue;
            const pathInfo = this.parseDocPath(`/${w.update.name}`);
            if (!pathInfo?.docId) continue;
            const existing = this.getCollection(pathInfo.col).get(pathInfo.docId);
            const check = this.checkPrecondition(existing, w.currentDocument);
            if (!check.ok) {
              return new Response(
                JSON.stringify({ error: { status: check.firestoreStatus, message: check.message } }),
                { status: check.status, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }

          // Appliquer toutes les écritures
          for (const w of writes) {
            if (!w.update) continue;
            const pathInfo = this.parseDocPath(`/${w.update.name}`);
            if (!pathInfo?.docId) continue;
            const colMap = this.getCollection(pathInfo.col);
            const existing = colMap.get(pathInfo.docId);
            const version = (existing?.version || 0) + 1;
            const ts = this.nextTimestamp(version);
            colMap.set(pathInfo.docId, {
              fields: structuredClone(w.update.fields || {}),
              createTime: existing?.createTime || ts,
              updateTime: ts,
              version,
            });
          }

          return new Response(JSON.stringify({ writeResults: writes.map(() => ({})) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const pathInfo = this.parseDocPath(url.pathname);
        if (!pathInfo) {
          return new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'Invalid path' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // LIST collection
        if (!pathInfo.docId && method === 'GET') {
          const colMap = this.getCollection(pathInfo.col);
          const docs = Array.from(colMap.entries()).map(([id, doc]) => this.buildDocJson(pathInfo.col, id, doc));
          const pageSize = parseInt(url.searchParams.get('pageSize') || '300', 10);
          return new Response(JSON.stringify({ documents: docs.slice(0, pageSize) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (pathInfo.docId) {
          const colMap = this.getCollection(pathInfo.col);
          const existing = colMap.get(pathInfo.docId);

          if (method === 'GET') {
            if (!existing) {
              return new Response(
                JSON.stringify({
                  error: {
                    status: 'NOT_FOUND',
                    message: `Document "projects/${TEST_PROJECT_ID}/databases/${TEST_DATABASE_ID}/documents/${pathInfo.col}/${pathInfo.docId}" not found.`,
                  },
                }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
              );
            }
            return new Response(JSON.stringify(this.buildDocJson(pathInfo.col, pathInfo.docId, existing)), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (method === 'PATCH') {
            const existsParam = url.searchParams.get('currentDocument.exists');
            const updateTimeParam = url.searchParams.get('currentDocument.updateTime');
            const precondition =
              existsParam !== null || updateTimeParam !== null
                ? {
                    exists: existsParam === null ? undefined : existsParam === 'true',
                    updateTime: updateTimeParam || undefined,
                  }
                : undefined;

            const check = this.checkPrecondition(existing, precondition);
            if (!check.ok) {
              return new Response(
                JSON.stringify({ error: { status: check.firestoreStatus, message: check.message } }),
                { status: check.status, headers: { 'Content-Type': 'application/json' } }
              );
            }

            const body = JSON.parse(bodyText || '{}') as { fields?: Record<string, any> };
            const version = (existing?.version || 0) + 1;
            const ts = this.nextTimestamp(version);
            const nextDoc: StoredDoc = {
              fields: structuredClone(body.fields || {}),
              createTime: existing?.createTime || ts,
              updateTime: ts,
              version,
            };
            colMap.set(pathInfo.docId, nextDoc);
            return new Response(JSON.stringify(this.buildDocJson(pathInfo.col, pathInfo.docId, nextDoc)), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (method === 'DELETE') {
            if (!existing) {
              return new Response(
                JSON.stringify({
                  error: {
                    status: 'NOT_FOUND',
                    message: `Document "projects/${TEST_PROJECT_ID}/databases/${TEST_DATABASE_ID}/documents/${pathInfo.col}/${pathInfo.docId}" not found.`,
                  },
                }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }
              );
            }
            colMap.delete(pathInfo.docId);
            return new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }
      }

      // 3. Discord REST API v10
      if (url.hostname === 'discord.com' && url.pathname.startsWith('/api/v10')) {
        if (url.pathname === '/api/v10/oauth2/token' && method === 'POST') {
          const params =
            init?.body instanceof URLSearchParams
              ? init.body
              : new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
          const code = params.get('code') || '';
          if (!this.discordAuthCodes.has(code)) {
            return new Response(JSON.stringify({ error: 'invalid_grant' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ access_token: `discord-token:${code}`, token_type: 'Bearer' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.pathname === '/api/v10/users/@me' && method === 'GET') {
          const authHeader = (init?.headers as Record<string, string>)?.Authorization || '';
          if (authHeader.startsWith('Bot ')) {
            const botToken = authHeader.slice(4).trim();
            if (!botToken || botToken === 'invalid-bot-token') {
              return new Response(JSON.stringify({ message: '401: Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(
              JSON.stringify({
                id: '999000000000000999',
                username: 'pawako_bot',
                global_name: 'PAWAKO Bot',
                avatar: null,
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }

          const code = authHeader.replace(/^Bearer\s+discord-token:/, '');
          const user = this.discordAuthCodes.get(code);
          if (!user) {
            return new Response(JSON.stringify({ message: '401: Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.pathname === '/api/v10/users/@me/guilds' && method === 'GET') {
          return new Response(
            JSON.stringify(
              this.mockBotGuilds.map(g => ({
                id: g.id,
                name: g.name,
                icon: g.icon ?? null,
                approximate_member_count: g.approximate_member_count ?? g.members?.length ?? 12,
              }))
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const guildMatch = url.pathname.match(/^\/api\/v10\/guilds\/([^/]+)$/);
        if (guildMatch && method === 'GET') {
          const guildId = decodeURIComponent(guildMatch[1]);
          const botGuild = this.mockBotGuilds.find(g => g.id === guildId);
          if (botGuild) {
            return new Response(
              JSON.stringify({
                id: botGuild.id,
                name: botGuild.name,
                icon: botGuild.icon ?? null,
                approximate_member_count: botGuild.approximate_member_count ?? botGuild.members?.length ?? 12,
                rules_channel_id: botGuild.rules_channel_id ?? null,
                system_channel_id: botGuild.system_channel_id ?? null,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (guildId === GUILD_IDS.RECRUTEMENT) {
            return new Response(JSON.stringify({ id: GUILD_IDS.RECRUTEMENT, name: 'PAWAKO Recrutement' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ code: 10004, message: 'Unknown Guild' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const guildSubMatch = url.pathname.match(/^\/api\/v10\/guilds\/([^/]+)\/(roles|channels|invites|members)$/);
        if (guildSubMatch && method === 'GET') {
          const guildId = decodeURIComponent(guildSubMatch[1]);
          const sub = guildSubMatch[2];
          const botGuild = this.mockBotGuilds.find(g => g.id === guildId);

          if (sub === 'channels') {
            if (this.failDiscordBotPermissions) {
              return new Response(JSON.stringify({ code: 50001, message: 'Missing Access' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            if (botGuild?.channels) {
              return new Response(JSON.stringify(botGuild.channels), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            if (guildId === GUILD_IDS.RECRUTEMENT) {
              return new Response(JSON.stringify(this.discordGuildChannels), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (sub === 'roles') {
            return new Response(JSON.stringify(botGuild?.roles || []), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (sub === 'invites') {
            if (botGuild?.invites) {
              return new Response(JSON.stringify(botGuild.invites), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            const existingInvites = Array.from(this.discordInvites.values())
              .filter(inv => inv.guildId === guildId && !inv.deleted)
              .map(inv => ({
                code: inv.code,
                channel: { id: inv.channelId },
                uses: inv.uses,
                max_age: 0,
                temporary: false,
              }));
            return new Response(JSON.stringify(existingInvites), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (sub === 'members') {
            if (botGuild?.membersForbidden) {
              return new Response(JSON.stringify({ code: 50001, message: 'Missing Access' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(JSON.stringify(botGuild?.members || []), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        const createInviteMatch = url.pathname.match(/^\/api\/v10\/channels\/([^/]+)\/invites$/);
        if (createInviteMatch && method === 'POST') {
          if (this.failDiscordBotPermissions) {
            return new Response(JSON.stringify({ code: 50013, message: 'Missing Permissions' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          this.inviteCounter += 1;
          const code = `realDisc${String(this.inviteCounter).padStart(4, '0')}`;
          const channelId = createInviteMatch[1];
          const ownerGuild = this.mockBotGuilds.find(g => g.channels?.some(ch => ch.id === channelId));
          const resolvedGuildId = ownerGuild?.id || GUILD_IDS.RECRUTEMENT;
          this.discordInvites.set(code, {
            code,
            guildId: resolvedGuildId,
            channelId,
            uses: 0,
          });
          return new Response(
            JSON.stringify({
              code,
              guild: { id: resolvedGuildId },
              channel: { id: channelId },
              uses: 0,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const invitePathMatch = url.pathname.match(/^\/api\/v10\/invites\/([^/]+)$/);
        if (invitePathMatch) {
          const code = decodeURIComponent(invitePathMatch[1]);
          const inv = this.discordInvites.get(code);
          if (method === 'GET') {
            if (!inv || inv.deleted) {
              return new Response(JSON.stringify({ code: 10006, message: 'Unknown Invite' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return new Response(
              JSON.stringify({
                code: inv.code,
                guild: { id: inv.guildId },
                channel: { id: inv.channelId },
                uses: inv.uses,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (method === 'DELETE') {
            this.revokedInvites.push(code);
            if (inv) inv.deleted = true;
            return new Response(JSON.stringify({ code }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        const userLookupMatch = url.pathname.match(/^\/api\/v10\/users\/(\d{17,20})$/);
        if (userLookupMatch && method === 'GET') {
          const uid = userLookupMatch[1];
          const found = this.discordUsers.get(uid);
          if (!found) {
            return new Response(JSON.stringify({ code: 10013, message: 'Unknown User' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify(found), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const memberSearchMatch = url.pathname.match(/^\/api\/v10\/guilds\/([^/]+)\/members\/search$/);
        if (memberSearchMatch && method === 'GET') {
          const q = (url.searchParams.get('query') || '').trim().toLowerCase();
          const matched = Array.from(this.discordUsers.values())
            .filter(
              u =>
                u.username.toLowerCase().includes(q) ||
                (u.global_name && u.global_name.toLowerCase().includes(q))
            )
            .map(u => ({ user: u, nick: null }));
          return new Response(JSON.stringify(matched), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    return () => {
      globalThis.fetch = originalFetch;
    };
  }

  public seedDoc(col: string, docId: string, data: Record<string, any>) {
    const colMap = this.getCollection(col);
    const ts = this.nextTimestamp(1);
    colMap.set(docId, {
      fields: toFirestoreDocument(data).fields,
      createTime: ts,
      updateTime: ts,
      version: 1,
    });
  }
}

function createTestEnv(overrides?: Partial<Env>): Env {
  return {
    FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
    FIREBASE_DATABASE_ID: TEST_DATABASE_ID,
    FIREBASE_CLIENT_EMAIL: 'firebase-test@pawako-test-project.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: TEST_PKCS8_PRIVATE_KEY,
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_CLIENT_SECRET: 'test-discord-client-secret',
    DISCORD_REDIRECT_URI: `${WORKER_ORIGIN}/auth/callback`,
    DISCORD_BOT_TOKEN: 'test-discord-bot-token',
    DISCORD_RECRUITMENT_GUILD_ID: GUILD_IDS.RECRUTEMENT,
    DISCORD_FORMATION_GUILD_ID: GUILD_IDS.FORMATION,
    DISCORD_CHATTING_PRODUCTION_GUILD_ID: GUILD_IDS.PRODUCTION_CHATTING,
    DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID: GUILD_IDS.PRODUCTION_INSTAGRAM,
    FRONTEND_URL: FRONTEND_ORIGIN,
    INITIAL_ADMIN_DISCORD_ID: '100000000000000001',
    JARVIS_WEBHOOK_SECRET: 'jarvis-super-secret-webhook-key-2026',
    SESSION_SECRET: 'pawako-session-hmac-secret-test-key-minimum-32-chars',
    ...overrides,
  };
}

function extractCookieValue(setCookieHeader: string | null, name: string): string | null {
  if (!setCookieHeader) return null;
  const regex = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`);
  const match = setCookieHeader.match(regex);
  return match ? match[1] : null;
}

async function loginViaWorkerOAuth(
  mock: MockExternalServices,
  env: Env,
  portal: 'parrain' | 'admin',
  discordUser: { id: string; username: string; global_name?: string; avatar?: string | null }
): Promise<{ status: number; sessionCookie: string | null; html: string }> {
  const code = `code_${portal}_${discordUser.id}_${Math.random().toString(36).slice(2, 8)}`;
  mock.discordAuthCodes.set(code, discordUser);

  const authUrlRes = await app.fetch(
    new Request(`${WORKER_ORIGIN}/api/auth/url?portal=${portal}`, {
      headers: { Origin: FRONTEND_ORIGIN },
    }),
    env
  );
  assert.equal(authUrlRes.status, 200);
  const authUrlData = (await authUrlRes.json()) as { state: string };

  const callbackRes = await app.fetch(
    new Request(
      `${WORKER_ORIGIN}/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(authUrlData.state)}`,
      {
        headers: { Cookie: `oauth_portal=${portal}` },
      }
    ),
    env
  );

  const html = await callbackRes.text();
  const sessionCookie = extractCookieValue(callbackRes.headers.get('Set-Cookie'), 'pawako_session');
  return { status: callbackRes.status, sessionCookie, html };
}

function createRepo(env: Env): FirestoreRepository {
  return new FirestoreRepository(
    new FirestoreRestClient({
      projectId: env.FIREBASE_PROJECT_ID!,
      databaseId: env.FIREBASE_DATABASE_ID!,
      clientEmail: env.FIREBASE_CLIENT_EMAIL!,
      privateKey: env.FIREBASE_PRIVATE_KEY!,
    })
  );
}

describe('PAWAKO Referral Manager — Tests Complets Isolés (Mockés)', () => {
  let mock: MockExternalServices;
  let restoreFetch: () => void;
  let env: Env;

  beforeEach(() => {
    mock = new MockExternalServices();
    restoreFetch = mock.installFetchMock();
    env = createTestEnv();
  });

  afterEach(() => {
    restoreFetch();
  });

  // =========================================================================
  // 1. OUVERTURE DES INSCRIPTIONS PARRAINS & AUTHENTIFICATION OAUTH2
  // =========================================================================
  it('1.1 Permet l inscription ouverte et idempotente d un nouveau parrain avec véritable invitation Discord', async () => {
    const newDiscordUser = {
      id: '200000000000000101',
      username: 'parrain_alice',
      global_name: 'Alice Parrain',
      avatar: null,
    };

    const firstLogin = await loginViaWorkerOAuth(mock, env, 'parrain', newDiscordUser);
    assert.equal(firstLogin.status, 200);
    assert.ok(firstLogin.sessionCookie, 'Le cookie de session pawako_session doit être posé');

    // Vérifier la session via /api/auth/me
    const meRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/auth/me`, {
        headers: { Cookie: `pawako_session=${firstLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(meRes.status, 200);
    const meData = (await meRes.json()) as any;
    assert.equal(meData.authenticated, true);
    assert.equal(meData.user.role, 'PARRAIN');
    assert.equal(meData.user.id, newDiscordUser.id);
    assert.equal(meData.user.status, 'ACTIVE');

    // Vérifier le profil parrain et son vrai lien Discord dans le portail parrain
    const dashRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/dashboard`, {
        headers: { Cookie: `pawako_session=${firstLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(dashRes.status, 200);
    const dash = (await dashRes.json()) as any;
    assert.ok(dash.referrer);
    const createdRef = dash.referrer;
    assert.equal(createdRef.id, `ref-${newDiscordUser.id}`);
    assert.match(createdRef.inviteCode, /^realDisc/);
    assert.equal(createdRef.inviteUrl, `https://discord.gg/${createdRef.inviteCode}`);
    assert.equal(createdRef.inviteStatus, 'ACTIVE');
    assert.equal(createdRef.status, 'ACTIVE');

    // Reconnexion ultérieure : réutilise le même profil et conserve le même code/lien Discord
    const secondLogin = await loginViaWorkerOAuth(mock, env, 'parrain', newDiscordUser);
    assert.equal(secondLogin.status, 200);

    const dashRes2 = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/dashboard`, {
        headers: { Cookie: `pawako_session=${secondLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    const dash2 = (await dashRes2.json()) as any;
    assert.equal(dash2.referrer.id, createdRef.id);
    assert.equal(dash2.referrer.inviteCode, createdRef.inviteCode);
    assert.equal(dash2.referrer.inviteUrl, createdRef.inviteUrl);

    // Journal d audit créé lors de l inscription initiale
    const repo = createRepo(env);
    const logs = await repo.getAuditLogs(20);
    assert.ok(logs.some(l => l.action === 'PARRAIN_SELF_REGISTERED' && l.targetId === `ref-${newDiscordUser.id}`));
  });

  it('1.2 Empêche les doublons lors d inscriptions simultanées (concurrence idempotente)', async () => {
    const repo = createRepo(env);
    mock.simulateInviteCommitRaceCount = 1;

    const raceUser = {
      id: '200000000000000102',
      username: 'concurrent_bob',
      displayName: 'Bob Concurrent',
      avatar: null,
    };

    const [resA, resB] = await Promise.all([
      repo.authenticateOrRegisterParrain({
        discordUser: raceUser,
        discordBotConfig: {
          botToken: env.DISCORD_BOT_TOKEN,
          recruitmentGuildId: env.DISCORD_RECRUITMENT_GUILD_ID,
        },
      }),
      repo.authenticateOrRegisterParrain({
        discordUser: raceUser,
        discordBotConfig: {
          botToken: env.DISCORD_BOT_TOKEN,
          recruitmentGuildId: env.DISCORD_RECRUITMENT_GUILD_ID,
        },
      }),
    ]);

    assert.equal(resA.authorized, true);
    assert.equal(resB.authorized, true);
    const allRefs = await repo.getReferrers();
    const userRefs = allRefs.filter(r => r.discordUserId === raceUser.id);
    assert.equal(userRefs.length, 1, 'Un seul profil parrain doit exister pour un même Discord ID');
    assert.ok(mock.revokedInvites.length >= 1, 'L invitation supplémentaire issue de la collision doit être révoquée');
  });

  it('1.3 Bloque strictement les comptes parrains suspendus ou archivés (403) et préserve les droits Admin/Responsable', async () => {
    const adminUser = {
      id: '100000000000000001',
      username: 'fondateur_admin',
      global_name: 'Admin Fondateur',
      avatar: null,
    };

    // Admin se connecte sur /admin puis sur /parrain : son rôle ADMINISTRATEUR est conservé
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', adminUser);
    assert.equal(adminLogin.status, 200);
    const adminThroughParrain = await loginViaWorkerOAuth(mock, env, 'parrain', adminUser);
    assert.equal(adminThroughParrain.status, 200);

    const adminMeRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/auth/me`, {
        headers: { Cookie: `pawako_session=${adminThroughParrain.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    const adminMe = (await adminMeRes.json()) as any;
    assert.equal(adminMe.user.role, 'ADMINISTRATEUR', 'Un admin passant par /parrain ne doit jamais être rétrogradé en PARRAIN');

    // Créer un Responsable pré-existant et vérifier que son rôle reste RESPONSABLE
    const repo = createRepo(env);
    await repo.upsertUser({ id: '200000000000000103', username: 'resp_claire', displayName: 'Claire Resp', avatar: null }, env.INITIAL_ADMIN_DISCORD_ID!);
    await repo.updateUserRole('200000000000000103', 'RESPONSABLE', adminUser.id, adminUser.global_name);

    const respParrainLogin = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000103',
      username: 'resp_claire',
      global_name: 'Claire Resp',
      avatar: null,
    });
    assert.equal(respParrainLogin.status, 200);
    const respMeRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/auth/me`, {
        headers: { Cookie: `pawako_session=${respParrainLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(((await respMeRes.json()) as any).user.role, 'RESPONSABLE');

    // Parrain standard : suspendu -> 403, archivé -> 403
    const bobUser = {
      id: '200000000000000104',
      username: 'bob_suspended',
      global_name: 'Bob Suspendu',
      avatar: null,
    };
    const bobLogin = await loginViaWorkerOAuth(mock, env, 'parrain', bobUser);
    assert.equal(bobLogin.status, 200);

    // Admin suspend le parrain
    const suspendRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/ref-${bobUser.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ reason: 'Test suspension' }),
      }),
      env
    );
    assert.equal(suspendRes.status, 200);

    // Bob tente de se reconnecter via /parrain : refusé 403
    const bobRetrySuspended = await loginViaWorkerOAuth(mock, env, 'parrain', bobUser);
    assert.equal(bobRetrySuspended.status, 403);
    assert.equal(bobRetrySuspended.sessionCookie, null);
    assert.match(bobRetrySuspended.html, /suspendu/i);

    // Admin archive le parrain -> toujours refusé 403
    const archiveRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/ref-${bobUser.id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ reason: 'Archivage définitif' }),
      }),
      env
    );
    assert.equal(archiveRes.status, 200);

    const bobRetryArchived = await loginViaWorkerOAuth(mock, env, 'parrain', bobUser);
    assert.equal(bobRetryArchived.status, 403);
    assert.equal(bobRetryArchived.sessionCookie, null);
    assert.match(bobRetryArchived.html, /suspendu|archiv/i);
  });

  // =========================================================================
  // 2. VÉRITABLES LIENS DISCORD & GESTION DES ERREURS / EXPIRATIONS
  // =========================================================================
  it('2. Ne fabrique jamais de faux lien PWK-..., remonte les erreurs bot et gère ensure/regenerate/expiration', async () => {
    const envNoBot = createTestEnv({ DISCORD_BOT_TOKEN: '' });
    const parrainUser = {
      id: '200000000000000201',
      username: 'eva_parrain',
      global_name: 'Eva',
      avatar: null,
    };

    // 1. Bot token manquant : l utilisateur est inscrit mais aucun faux code PWK-... n est fabriqué
    const loginWithoutBot = await loginViaWorkerOAuth(mock, envNoBot, 'parrain', parrainUser);
    assert.equal(loginWithoutBot.status, 200);
    const dashNoBotRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/dashboard`, {
        headers: { Cookie: `pawako_session=${loginWithoutBot.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      envNoBot
    );
    const dashNoBot = (await dashNoBotRes.json()) as any;
    const refNoBot = dashNoBot.referrer;
    assert.equal(refNoBot.inviteCode, '');
    assert.equal(refNoBot.inviteUrl, '');
    assert.equal(refNoBot.inviteStatus, 'UNCONFIGURED');
    assert.match(refNoBot.inviteError || '', /DISCORD_BOT_TOKEN/i);

    // 2. Bot présent mais permissions manquantes -> ERROR explicite, toujours aucun faux code
    mock.failDiscordBotPermissions = true;
    const ensureFailRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/invite/ensure`, {
        method: 'POST',
        headers: { Cookie: `pawako_session=${loginWithoutBot.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(ensureFailRes.status, 200);
    const ensureFailData = (await ensureFailRes.json()) as any;
    assert.equal(ensureFailData.success, false);
    assert.equal(ensureFailData.referrer.inviteStatus, 'ERROR');
    assert.equal(ensureFailData.referrer.inviteCode, '');

    // 3. Permissions restaurées -> véritable invitation générée par le bot
    mock.failDiscordBotPermissions = false;
    const ensureOkRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/invite/ensure`, {
        method: 'POST',
        headers: { Cookie: `pawako_session=${loginWithoutBot.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    const ensureOkData = (await ensureOkRes.json()) as any;
    assert.equal(ensureOkData.success, true);
    assert.match(ensureOkData.referrer.inviteCode, /^realDisc/);
    assert.equal(ensureOkData.referrer.inviteStatus, 'ACTIVE');
    const firstRealCode = ensureOkData.referrer.inviteCode;

    // 4. Candidat attribué à Eva sur le premier code, puis admin régénère le lien : attribution historique intacte
    const repo = createRepo(env);
    const filleul = await repo.createCandidate({
      discordUserId: '300000000000000201',
      username: 'filleul_un',
      displayName: 'Filleul Un',
      vaType: 'CHATTEUR',
      inviteCodeUsed: firstRealCode,
      originServer: 'RECRUTEMENT',
    });
    assert.equal(filleul.referrerId, refNoBot.id);
    assert.equal(filleul.attributionStatus, 'CONFIRMED');

    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'admin',
      global_name: 'Admin',
      avatar: null,
    });
    const regenRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${refNoBot.id}/invite/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({}),
      }),
      env
    );
    assert.equal(regenRes.status, 200);
    const regenData = (await regenRes.json()) as any;
    assert.equal(regenData.success, true);
    assert.notEqual(regenData.referrer.inviteCode, firstRealCode);
    assert.equal(regenData.referrer.inviteStatus, 'ACTIVE');

    // Le filleul historique garde son parrain et son attribution CONFIRMED
    const refreshedFilleul = await repo.getCandidateById(filleul.id);
    assert.equal(refreshedFilleul?.referrerId, refNoBot.id);
    assert.equal(refreshedFilleul?.attributionStatus, 'CONFIRMED');
  });

  // =========================================================================
  // 3. ADMINISTRATION COMPLÈTE DES PARRAINS, SUPPRESSION PROTÉGÉE & DERNIER ADMIN
  // =========================================================================
  it('3. Admin complet des parrains : filtrage, édition, cycle de vie, suppression sécurisée (409) & dernier admin', async () => {
    const adminUser = {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    };
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', adminUser);
    assert.equal(adminLogin.status, 200);

    // Créer 2 parrains
    const p1Login = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000301',
      username: 'parrain_avec_filleul',
      global_name: 'Parrain Avec Filleul',
      avatar: null,
    });
    const p2Login = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000302',
      username: 'parrain_sans_filleul',
      global_name: 'Parrain Sans Filleul',
      avatar: null,
    });
    assert.equal(p1Login.status, 200);
    assert.equal(p2Login.status, 200);

    const ref1Id = 'ref-200000000000000301';
    const ref2Id = 'ref-200000000000000302';

    // Éditer notes & displayName de ref1
    const patchRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref1Id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({
          discordDisplayName: 'Parrain Alpha Édité',
          notes: 'Note interne confidentielle admin',
        }),
      }),
      env
    );
    assert.equal(patchRes.status, 200);
    const patchJson = (await patchRes.json()) as any;
    assert.equal(patchJson.referrer.discordDisplayName, 'Parrain Alpha Édité');
    assert.equal(patchJson.referrer.notes, 'Note interne confidentielle admin');

    // Créer un filleul lié à ref1
    const repo = createRepo(env);
    const ref1 = await repo.getReferrerById(ref1Id);
    await repo.createCandidate({
      discordUserId: '300000000000000301',
      username: 'filleul_lie',
      displayName: 'Filleul Lié',
      vaType: 'CHATTEUR',
      inviteCodeUsed: ref1!.inviteCode,
      originServer: 'RECRUTEMENT',
    });

    // Cycle de vie ref2 : suspend -> reactivate -> archive -> restore
    for (const step of ['suspend', 'reactivate', 'archive', 'restore'] as const) {
      const r = await app.fetch(
        new Request(`${WORKER_ORIGIN}/api/referrers/${ref2Id}/${step}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `pawako_session=${adminLogin.sessionCookie}`,
            Origin: FRONTEND_ORIGIN,
          },
          body: JSON.stringify({ reason: `Étape ${step}` }),
        }),
        env
      );
      assert.equal(r.status, 200);
    }

    // Ré-archiver ref2 puis filtrer par status=ARCHIVED
    await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref2Id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ reason: 'Prêt suppression' }),
      }),
      env
    );

    const archivedListRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers?status=ARCHIVED`, {
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    const archivedList = (await archivedListRes.json()) as any;
    assert.equal(archivedList.referrers.length, 1);
    assert.equal(archivedList.referrers[0].id, ref2Id);

    // Suppression physique de ref1 bloquée avec 409 (dépendant + non archivé)
    await repo.setReferrerStatus(ref1Id, 'ARCHIVED', 'Test archivage avant delete', {
      id: adminUser.id,
      displayName: adminUser.global_name,
    });
    const deleteBlockedRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref1Id}?confirm=true`, {
        method: 'DELETE',
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(deleteBlockedRes.status, 409);

    // Suppression physique de ref2 autorisée (ARCHIVED + 0 dépendance)
    const deleteOkRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref2Id}?confirm=true`, {
        method: 'DELETE',
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(deleteOkRes.status, 200);
    assert.equal(await repo.getReferrerById(ref2Id), null);

    // Protection du dernier administrateur actif
    const demoteLastAdminRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/users/${adminUser.id}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ newRole: 'PARRAIN' }),
      }),
      env
    );
    assert.equal(demoteLastAdminRes.status, 400);
    assert.match(((await demoteLastAdminRes.json()) as any).error, /dernier administrateur/i);
  });

  // =========================================================================
  // 4. ATTRIBUTION & CONFIDENTIALITÉ STRICTE PARRAIN
  // =========================================================================
  it('4. Attribution stricte et confidentialité parrain (refusalReason/notes/cross-filleul isolés)', async () => {
    const adminUser = {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'admin_conf',
      global_name: 'Admin Conf',
      avatar: null,
    };
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', adminUser);
    const parrain1Login = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000401',
      username: 'parrain_one',
      global_name: 'Parrain One',
      avatar: null,
    });
    const parrain2Login = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000402',
      username: 'parrain_two',
      global_name: 'Parrain Two',
      avatar: null,
    });

    const repo = createRepo(env);
    const ref1 = await repo.getReferrerByDiscordUserId('200000000000000401');
    const ref2 = await repo.getReferrerByDiscordUserId('200000000000000402');

    // Candidat avec code inconnu -> UNCERTAIN
    const unknownCandidate = await repo.createCandidate({
      discordUserId: '300000000000000400',
      username: 'unknown_inv',
      displayName: 'Unknown Inv',
      vaType: 'CHATTEUR',
      inviteCodeUsed: 'codeInconnu999',
      originServer: 'RECRUTEMENT',
    });
    assert.equal(unknownCandidate.attributionStatus, 'UNCERTAIN');
    assert.equal(unknownCandidate.referrerId, null);

    // Candidat lié à ref1 et refusé avec motif confidentiel + note admin
    const c1 = await repo.createCandidate({
      discordUserId: '300000000000000401',
      username: 'filleul_p1',
      displayName: 'Filleul P1',
      vaType: 'CHATTEUR',
      inviteCodeUsed: ref1!.inviteCode,
      originServer: 'RECRUTEMENT',
    });
    await repo.updateCandidateStatus(c1.id, {
      newAdminStatus: 'REFUSE',
      newOperationalStatus: 'INACTIF',
      refusalReason: 'Échec test confidentiel niveau 2',
      notes: 'Note interne direction secrète',
      actorUserId: adminUser.id,
      actorName: 'Admin Conf',
      actorSource: 'MANUAL_ADMIN',
      isConfidential: true,
    });

    // Candidat lié à ref2
    const c2 = await repo.createCandidate({
      discordUserId: '300000000000000402',
      username: 'filleul_p2',
      displayName: 'Filleul P2',
      vaType: 'INSTAGRAM',
      inviteCodeUsed: ref2!.inviteCode,
      originServer: 'RECRUTEMENT',
    });

    // Parrain 1 consulte son dashboard : ne voit pas refusalReason ni notes ni decisionByName ni c2
    const p1DashRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/dashboard`, {
        headers: { Cookie: `pawako_session=${parrain1Login.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(p1DashRes.status, 200);
    const p1Dash = (await p1DashRes.json()) as any;
    assert.equal(p1Dash.candidates.length, 1);
    assert.equal(p1Dash.candidates[0].id, c1.id);
    assert.equal(p1Dash.candidates[0].refusalReason, null);
    assert.equal(p1Dash.candidates[0].notes, undefined);
    assert.ok(!p1Dash.candidates[0].decisionByName);

    // Parrain 1 tente d accéder à GET /api/candidates/:c2.id -> 403
    const crossCandidateRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/candidates/${c2.id}`, {
        headers: { Cookie: `pawako_session=${parrain1Login.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(crossCandidateRes.status, 403);

    // Parrain 1 consulte sa fiche candidat autorisée c1 : historique confidentiel filtré et refusalReason null
    const ownCandidateRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/candidates/${c1.id}`, {
        headers: { Cookie: `pawako_session=${parrain1Login.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(ownCandidateRes.status, 200);
    const ownData = (await ownCandidateRes.json()) as any;
    assert.equal(ownData.candidate.refusalReason, null);
    assert.ok(!ownData.candidate.notes);
    assert.ok(ownData.statusHistory.every((h: any) => h.isConfidential === false));

    // Vérifier aussi helper Express toParrainCandidateView
    const sampleCandidate: Candidate = {
      ...c1,
      refusalReason: 'Motif secret Express',
      decisionByName: 'Admin Express',
    };
    const safeView = toParrainCandidateView(sampleCandidate) as any;
    assert.equal(safeView.refusalReason, null);
    assert.ok(!safeView.decisionByName);
    assert.equal(safeView.notes, undefined);

    // Suppression de variable inutilisée côté admin
    assert.equal(adminLogin.status, 200);
  });

  // =========================================================================
  // 5. COHÉRENCE DES STATISTIQUES DASHBOARD / PARRAINS / ESPACE PARRAIN
  // =========================================================================
  it('5. Cohérence exacte des KPI entre OverviewStats, ReferrersWithStats et ParrainDashboard', async () => {
    await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'admin_kpi',
      global_name: 'Admin KPI',
      avatar: null,
    });
    const p1Login = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000501',
      username: 'parrain_kpi',
      global_name: 'Parrain KPI',
      avatar: null,
    });
    await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000502',
      username: 'parrain_archive_kpi',
      global_name: 'Parrain Archivé',
      avatar: null,
    });

    const repo = createRepo(env);
    const refActive = await repo.getReferrerByDiscordUserId('200000000000000501');
    const refArchived = await repo.getReferrerByDiscordUserId('200000000000000502');
    await repo.setReferrerStatus(refArchived!.id, 'ARCHIVED', 'Archivé test KPI', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      displayName: 'Admin KPI',
    });

    // Créer 4 candidats sur refActive dans différents statuts (y compris VALIDE)
    const cProd = await repo.createCandidate({
      discordUserId: '300000000000000501',
      username: 'kpi_prod',
      displayName: 'KPI Prod',
      vaType: 'CHATTEUR',
      inviteCodeUsed: refActive!.inviteCode,
      originServer: 'RECRUTEMENT',
    });
    await repo.updateCandidateStatus(cProd.id, {
      newAdminStatus: 'ACCEPTE',
      newOperationalStatus: 'PRODUCTION',
      notes: 'Passage test KPI en production',
      actorUserId: env.INITIAL_ADMIN_DISCORD_ID!,
      actorName: 'Admin KPI',
      actorSource: 'MANUAL_ADMIN',
    });

    const cValide = await repo.createCandidate({
      discordUserId: '300000000000000502',
      username: 'kpi_valide',
      displayName: 'KPI Valide',
      vaType: 'CHATTEUR',
      inviteCodeUsed: refActive!.inviteCode,
      originServer: 'FORMATION',
    });
    await repo.updateCandidateStatus(cValide.id, {
      newAdminStatus: 'ACCEPTE',
      newOperationalStatus: 'VALIDE',
      notes: 'Validation test KPI',
      actorUserId: env.INITIAL_ADMIN_DISCORD_ID!,
      actorName: 'Admin KPI',
      actorSource: 'MANUAL_ADMIN',
    });

    await repo.createCandidate({
      discordUserId: '300000000000000503',
      username: 'kpi_attente',
      displayName: 'KPI Attente',
      vaType: 'INSTAGRAM',
      inviteCodeUsed: refActive!.inviteCode,
      originServer: 'RECRUTEMENT',
    });

    const cRefuse = await repo.createCandidate({
      discordUserId: '300000000000000504',
      username: 'kpi_refuse',
      displayName: 'KPI Refusé',
      vaType: 'INSTAGRAM',
      inviteCodeUsed: refActive!.inviteCode,
      originServer: 'RECRUTEMENT',
    });
    await repo.updateCandidateStatus(cRefuse.id, {
      newAdminStatus: 'REFUSE',
      newOperationalStatus: 'INACTIF',
      notes: 'Refus test KPI',
      refusalReason: 'Test',
      actorUserId: env.INITIAL_ADMIN_DISCORD_ID!,
      actorName: 'Admin KPI',
      actorSource: 'MANUAL_ADMIN',
    });

    const overview = await repo.getOverviewStats(GUILD_IDS);
    const refsStats = await repo.getReferrersWithStats();
    const pDashRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/parrain/dashboard`, {
        headers: { Cookie: `pawako_session=${p1Login.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    const pDash = (await pDashRes.json()) as any;

    // Vérifier la cohérence exacte
    assert.equal(overview.kpis.totalCandidats, 4);
    assert.equal(overview.kpis.totalProductionGlobale, 1);
    assert.equal(overview.kpis.enAttente, 1);
    assert.equal(overview.kpis.refuses, 1);
    assert.equal(overview.kpis.valides, 1);
    assert.ok(
      overview.topParrains.every((p: any) => p.id !== refArchived!.id),
      'Le parrain archivé ne doit pas apparaître dans le classement'
    );

    const activeRow = refsStats.find(r => r.id === refActive!.id)!;
    assert.equal(activeRow.totalFilleuls, pDash.metrics.totalFilleuls);
    assert.equal(activeRow.enProduction, pDash.metrics.enProduction);
    assert.equal(activeRow.valides, pDash.metrics.valides);
    assert.equal(pDash.metrics.valides, 1);
    assert.equal(pDash.metrics.enAttente, 1);
    assert.equal(pDash.metrics.refuses, 1);
    assert.equal(pDash.metrics.conversionRate, 25);
  });

  // =========================================================================
  // 6. INTÉGRATION BOT JARVIS, ANTI-REJEU & 6 ÉVÉNEMENTS GATEWAY
  // =========================================================================
  it('6. Passerelle Discord JARVIS : auth, anti-rejeu atomique 409, 6 événements & isolation VA', async () => {
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'admin_jarvis',
      global_name: 'Admin Jarvis',
      avatar: null,
    });
    const parrainLogin = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '200000000000000601',
      username: 'parrain_jarvis',
      global_name: 'Parrain Jarvis',
      avatar: null,
    });
    assert.equal(parrainLogin.status, 200);

    const repo = createRepo(env);
    const parrainRef = await repo.getReferrerByDiscordUserId('200000000000000601');
    const mappings = await repo.getRoleMappings();
    const enFormationRoleId = '800000000000000001';
    const refuseRoleId = '800000000000000002';
    const updatedMappings = mappings.map(m => {
      if (m.serverId === 'FORMATION' && m.roleType === 'EN_FORMATION') {
        return { ...m, discordRoleId: enFormationRoleId };
      }
      if (m.serverId === 'RECRUTEMENT' && m.roleType === 'CANDIDAT_REFUSE') {
        return { ...m, discordRoleId: refuseRoleId };
      }
      return m;
    });
    await repo.updateRoleMappings(updatedMappings, env.INITIAL_ADMIN_DISCORD_ID!, 'Admin Jarvis');

    // 1. Secret invalide -> 401
    const unauthRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-JARVIS-Secret': 'wrong-secret' },
        body: JSON.stringify({ eventType: 'GUILD_MEMBER_ADD' }),
      }),
      env
    );
    assert.equal(unauthRes.status, 401);

    const sendWebhook = async (payload: Record<string, any>) => {
      return app.fetch(
        new Request(`${WORKER_ORIGIN}/api/discord/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-JARVIS-Secret': env.JARVIS_WEBHOOK_SECRET!,
            'X-JARVIS-Timestamp': String(Date.now()),
          },
          body: JSON.stringify(payload),
        }),
        env
      );
    };

    // 2. INVITE_CREATE
    const invCreateRes = await sendWebhook({
      eventId: 'evt-invite-create-001',
      eventType: 'INVITE_CREATE',
      guildId: GUILD_IDS.RECRUTEMENT,
      inviteCode: parrainRef!.inviteCode,
      inviterId: '200000000000000601',
    });
    assert.equal(invCreateRes.status, 200);

    // 3. Anti-rejeu atomique : réutilisation du même eventId -> 409
    const replayRes = await sendWebhook({
      eventId: 'evt-invite-create-001',
      eventType: 'INVITE_CREATE',
      guildId: GUILD_IDS.RECRUTEMENT,
      inviteCode: parrainRef!.inviteCode,
    });
    assert.equal(replayRes.status, 409);

    // 4. GUILD_MEMBER_ADD (candidat INSTAGRAM rejoint RECRUTEMENT via parrain)
    const addRes = await sendWebhook({
      eventId: 'evt-member-add-001',
      eventType: 'GUILD_MEMBER_ADD',
      guildId: GUILD_IDS.RECRUTEMENT,
      inviteCode: parrainRef!.inviteCode,
      vaType: 'INSTAGRAM',
      user: { id: '300000000000000601', username: 'insta_cand', global_name: 'Insta Candidat' },
    });
    assert.equal(addRes.status, 200);
    const addData = (await addRes.json()) as any;
    assert.equal(addData.candidate.referrerId, parrainRef!.id);
    assert.equal(addData.candidate.vaType, 'INSTAGRAM');

    // 5. Isolation stricte VA INSTAGRAM vs FORMATION : anomalie détectée si le candidat INSTAGRAM rejoint FORMATION
    const badJoinFormationRes = await sendWebhook({
      eventId: 'evt-member-add-002',
      eventType: 'GUILD_MEMBER_ADD',
      guildId: GUILD_IDS.FORMATION,
      user: { id: '300000000000000601', username: 'insta_cand', global_name: 'Insta Candidat' },
    });
    assert.equal(badJoinFormationRes.status, 200);
    const badJoinData = (await badJoinFormationRes.json()) as any;
    assert.equal(badJoinData.candidate.hasAnomaly, true);
    assert.match(badJoinData.anomaly, /VA Instagram.*Formation/i);

    // 6. GUILD_MEMBER_REMOVE : ne supprime jamais et ne passe jamais en ABANDONNE automatiquement
    const removeRes = await sendWebhook({
      eventId: 'evt-member-remove-001',
      eventType: 'GUILD_MEMBER_REMOVE',
      guildId: GUILD_IDS.RECRUTEMENT,
      user: { id: '300000000000000601', username: 'insta_cand' },
    });
    assert.equal(removeRes.status, 200);
    const preservedCandidate = await repo.getCandidateByDiscordUserId('300000000000000601');
    assert.ok(preservedCandidate);
    assert.notEqual(preservedCandidate!.operationalStatus, 'ABANDONNE');

    // 7. GUILD_MEMBER_UPDATE + verrou REFUSE pour un candidat Chatteur
    await sendWebhook({
      eventId: 'evt-member-add-003',
      eventType: 'GUILD_MEMBER_ADD',
      guildId: GUILD_IDS.RECRUTEMENT,
      inviteCode: parrainRef!.inviteCode,
      vaType: 'CHATTEUR',
      user: { id: '300000000000000602', username: 'chat_cand', global_name: 'Chat Candidat' },
    });
    await sendWebhook({
      eventId: 'evt-member-upd-001',
      eventType: 'GUILD_MEMBER_UPDATE',
      guildId: GUILD_IDS.RECRUTEMENT,
      roles: [refuseRoleId],
      user: { id: '300000000000000602', username: 'chat_cand', global_name: 'Chat Candidat' },
    });
    const updConflictRes = await sendWebhook({
      eventId: 'evt-member-upd-002',
      eventType: 'GUILD_MEMBER_UPDATE',
      guildId: GUILD_IDS.FORMATION,
      roles: [enFormationRoleId],
      user: { id: '300000000000000602', username: 'chat_cand', global_name: 'Chat Candidat' },
    });
    assert.equal(updConflictRes.status, 200);
    const refusedLocked = await repo.getCandidateByDiscordUserId('300000000000000602');
    assert.equal(refusedLocked!.adminStatus, 'REFUSE');
    assert.equal(refusedLocked!.hasAnomaly, true);

    // 8. MEMBER_SYNC via webhook + endpoint POST /api/discord/sync-members
    const memberSyncRes = await sendWebhook({
      eventId: 'evt-member-sync-001',
      eventType: 'MEMBER_SYNC',
      guildId: GUILD_IDS.FORMATION,
      roles: [enFormationRoleId],
      user: { id: '300000000000000603', username: 'sync_cand', global_name: 'Sync Candidat' },
    });
    assert.equal(memberSyncRes.status, 200);
    const syncedCand = await repo.getCandidateByDiscordUserId('300000000000000603');
    assert.ok(syncedCand);
    assert.equal(syncedCand!.operationalStatus, 'FORMATION');
    assert.equal(syncedCand!.status, 'EN_FORMATION');

    const bulkSyncRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/sync-members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({
          serverId: 'FORMATION',
          members: [
            {
              discordUserId: '300000000000000604',
              username: 'bulk_cand',
              displayName: 'Bulk Candidat',
              roleIds: [enFormationRoleId],
            },
          ],
        }),
      }),
      env
    );
    assert.equal(bulkSyncRes.status, 200);
    assert.equal(((await bulkSyncRes.json()) as any).synchronizedCount, 1);

    // 9. INVITE_DELETE marque le lien du parrain comme EXPIRED_OR_DELETED
    const invDelRes = await sendWebhook({
      eventId: 'evt-invite-delete-001',
      eventType: 'INVITE_DELETE',
      guildId: GUILD_IDS.RECRUTEMENT,
      inviteCode: parrainRef!.inviteCode,
    });
    assert.equal(invDelRes.status, 200);
    const updatedRef = await repo.getReferrerById(parrainRef!.id);
    assert.equal(updatedRef!.inviteStatus, 'EXPIRED_OR_DELETED');
  });

  // =========================================================================
  // 7. COMPATIBILITÉ DOCUMENTS HÉRITÉS, SUPPRESSION NETTOYÉE & DIAGNOSTIC ERREUR
  // =========================================================================
  it('7.1 Gère les documents hérités sans champ id, nettoie le compte PARRAIN à la suppression et permet une réinscription propre', async () => {
    const adminUser = {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    };
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', adminUser);
    assert.equal(adminLogin.status, 200);

    // Seed un document parrain hérité SANS champ `id`, SANS `discordDisplayName`, SANS `createdAt`
    const legacyDiscordId = '200000000000000777';
    const legacyDocId = 'legacy-ref-777';
    mock.seedDoc('pawako_referrers', legacyDocId, {
      discordUserId: legacyDiscordId,
      isActive: true,
      inviteCode: 'PWK-OLD123',
      inviteUrl: 'https://discord.gg/PWK-OLD123',
    });
    mock.seedDoc('pawako_users', legacyDiscordId, {
      id: legacyDiscordId,
      username: 'legacy_parrain',
      displayName: 'Legacy Parrain',
      avatar: null,
      role: 'PARRAIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });

    // 1. La recherche & liste sur /api/referrers ne plante pas malgré les champs manquants et extrait l'id du doc Firestore
    const listRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers?search=${legacyDiscordId}`, {
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(listRes.status, 200);
    const listJson = (await listRes.json()) as any;
    assert.equal(listJson.referrers.length, 1);
    assert.equal(listJson.referrers[0].id, legacyDocId);

    // 2. Archiver puis supprimer physiquement le parrain hérité
    const archiveRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${legacyDocId}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ reason: 'Nettoyage profil test hérité' }),
      }),
      env
    );
    assert.equal(archiveRes.status, 200);

    const deleteRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${legacyDocId}?confirm=true`, {
        method: 'DELETE',
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(deleteRes.status, 200);

    const repo = createRepo(env);
    assert.equal(await repo.getReferrerById(legacyDocId), null);
    assert.equal(
      await repo.getUserById(legacyDiscordId),
      null,
      'Le compte utilisateur PARRAIN orphelin doit être nettoyé lors de la suppression physique'
    );

    // 3. L'utilisateur supprimé peut se réinscrire proprement plus tard avec un nouveau vrai lien Discord
    const reRegister = await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: legacyDiscordId,
      username: 'legacy_parrain_reborn',
      global_name: 'Legacy Reborn',
      avatar: null,
    });
    assert.equal(reRegister.status, 200);
    assert.ok(reRegister.sessionCookie);
  });

  it('7.2 Surface un diagnostic structuré avec CORS en cas d erreur Firestore au lieu d une erreur 500 opaque', async () => {
    const brokenEnv = createTestEnv({
      FIREBASE_CLIENT_EMAIL: '',
      FIREBASE_PRIVATE_KEY: '',
    });

    // Simuler une requête authentifiée avec un cookie signé valide, alors que Firestore est mal configuré
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    });

    const brokenRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/admin/bootstrap`, {
        headers: {
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
      }),
      brokenEnv
    );
    assert.equal(brokenRes.status, 503);
    assert.equal(brokenRes.headers.get('Access-Control-Allow-Origin'), FRONTEND_ORIGIN);
    const body = (await brokenRes.json()) as any;
    assert.equal(body.category, 'CONFIG');
    assert.match(body.error, /FIREBASE_CLIENT_EMAIL|FIREBASE_PRIVATE_KEY/i);
  });

  it('7.3 Résolution automatique des vrais noms Discord (ID, @username) et synchronisation globale', async () => {
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    });

    mock.discordUsers.set('500000000000000501', {
      id: '500000000000000501',
      username: 'lucas_pawako',
      global_name: 'Lucas PAWAKO',
      avatar: 'avatarhash501',
    });
    mock.discordUsers.set('500000000000000502', {
      id: '500000000000000502',
      username: 'chloe.recrute',
      global_name: 'Chloé Recrutement',
      avatar: null,
    });
    mock.discordUsers.set('500000000000000503', {
      id: '500000000000000503',
      username: 'enzo_real',
      global_name: 'Enzo Authentique',
      avatar: 'enzoavatar',
    });

    // 1. Création par Discord User ID sans connexion OAuth préalable -> vrai nom + avatar résolus via Bot API
    const createByIdRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ discordUserId: '500000000000000501' }),
      }),
      env
    );
    assert.equal(createByIdRes.status, 201);
    const byIdJson = (await createByIdRes.json()) as any;
    assert.equal(byIdJson.referrer.discordDisplayName, 'Lucas PAWAKO');
    assert.equal(byIdJson.referrer.discordUsername, 'lucas_pawako');
    assert.match(byIdJson.referrer.avatar, /avatarhash501/);

    // 2. Création par @username -> résolution via recherche membres Discord
    const createByNameRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ discordUserId: '@chloe.recrute' }),
      }),
      env
    );
    assert.equal(createByNameRes.status, 201);
    const byNameJson = (await createByNameRes.json()) as any;
    assert.equal(byNameJson.referrer.discordUserId, '500000000000000502');
    assert.equal(byNameJson.referrer.discordDisplayName, 'Chloé Recrutement');
    assert.equal(byNameJson.referrer.discordUsername, 'chloe.recrute');

    // 3. Ancien parrain avec nom générique "Parrain 0503" + filleul associé -> POST /api/referrers/sync-discord met tout à jour
    mock.seedDoc('pawako_referrers', 'ref-500000000000000503', {
      id: 'ref-500000000000000503',
      discordUserId: '500000000000000503',
      discordUsername: 'user_0503',
      discordDisplayName: 'Parrain 0503',
      inviteCode: 'realLegacy503',
      inviteUrl: 'https://discord.gg/realLegacy503',
      inviteStatus: 'ACTIVE',
      isActive: true,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const repo = createRepo(env);
    const cand = await repo.createCandidate({
      discordUserId: '600000000000000601',
      username: 'filleul_sync',
      displayName: 'Filleul Sync',
      vaType: 'CHATTEUR',
      inviteCodeUsed: 'realLegacy503',
      originServer: 'RECRUTEMENT',
    });
    assert.equal(cand.referrerName, 'Parrain 0503');

    const syncRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/sync-discord`, {
        method: 'POST',
        headers: {
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
      }),
      env
    );
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as any;
    assert.ok(syncJson.updatedCount >= 1);

    const updatedRef = await repo.getReferrerById('ref-500000000000000503');
    assert.equal(updatedRef?.discordDisplayName, 'Enzo Authentique');
    assert.equal(updatedRef?.discordUsername, 'enzo_real');

    const updatedCand = await repo.getCandidateById(cand.id);
    assert.equal(updatedCand?.referrerName, 'Enzo Authentique');
  });

  it('7.4 Suppression forcée d un parrain détache proprement les filleuls et nettoie les historiques', async () => {
    const adminLogin = await loginViaWorkerOAuth(mock, env, 'admin', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    });
    await loginViaWorkerOAuth(mock, env, 'parrain', {
      id: '500000000000000599',
      username: 'parrain_force_del',
      global_name: 'Parrain À Supprimer',
      avatar: null,
    });

    const repo = createRepo(env);
    const ref = await repo.getReferrerByDiscordUserId('500000000000000599');
    assert.ok(ref);

    const cand = await repo.createCandidate({
      discordUserId: '600000000000000699',
      username: 'filleul_orphelin',
      displayName: 'Filleul Orphelin',
      vaType: 'INSTAGRAM',
      inviteCodeUsed: ref!.inviteCode,
      originServer: 'RECRUTEMENT',
    });

    // Sans force=true, même archivé, le backend conserve la protection 409
    await repo.setReferrerStatus(ref!.id, 'ARCHIVED', 'Test blocage standard', {
      id: env.INITIAL_ADMIN_DISCORD_ID!,
      displayName: 'Super Admin',
    });
    const blockedRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref!.id}?confirm=true`, {
        method: 'DELETE',
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(blockedRes.status, 409);

    // Avec force=true&confirm=true, le parrain est supprimé et le filleul est détaché proprement en UNCERTAIN
    const forceRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers/${ref!.id}?confirm=true&force=true`, {
        method: 'DELETE',
        headers: { Cookie: `pawako_session=${adminLogin.sessionCookie}`, Origin: FRONTEND_ORIGIN },
      }),
      env
    );
    assert.equal(forceRes.status, 200);
    const forceJson = (await forceRes.json()) as any;
    assert.equal(forceJson.success, true);
    assert.equal(forceJson.detachedCandidatesCount, 1);

    assert.equal(await repo.getReferrerById(ref!.id), null);
    assert.equal(await repo.getUserById('500000000000000599'), null);

    const detachedCand = await repo.getCandidateById(cand.id);
    assert.ok(detachedCand);
    assert.equal(detachedCand.referrerId, null);
    assert.equal(detachedCand.referrerName, null);
    assert.equal(detachedCand.attributionStatus, 'UNCERTAIN');
  });

  it('7.5 Bot Discord : auto-détection et liaison complète (serveurs, salons, rôles, membres) sans IDs en variables env', async () => {
    const emptyGuildEnv = createTestEnv({
      DISCORD_RECRUITMENT_GUILD_ID: '',
      DISCORD_RECRUITMENT_INVITE_CHANNEL_ID: '',
      DISCORD_FORMATION_GUILD_ID: '',
      DISCORD_CHATTING_PRODUCTION_GUILD_ID: '',
      DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID: '',
    });

    mock.mockBotGuilds = [
      {
        id: GUILD_IDS.RECRUTEMENT,
        name: 'PAWAKO Recrutement Officiel',
        approximate_member_count: 42,
        channels: [
          { id: '900000000000000010', name: 'annonces', type: 5, position: 0 },
          { id: '900000000000000011', name: 'accueil-recrutement', type: 0, position: 1 },
        ],
        roles: [
          { id: GUILD_IDS.RECRUTEMENT, name: '@everyone', position: 0, managed: false },
          { id: '701000000000000001', name: 'Candidat', position: 5, managed: false },
          { id: '701000000000000002', name: 'Candidat Accepté', position: 6, managed: false },
          { id: '701000000000000003', name: 'Candidat Refusé', position: 7, managed: false },
        ],
        members: [
          {
            user: { id: '880000000000000001', username: 'alice_cand', global_name: 'Alice Candidate', avatar: null },
            roles: ['701000000000000001'],
          },
        ],
      },
      {
        id: GUILD_IDS.FORMATION,
        name: 'PAWAKO Formation Academy',
        approximate_member_count: 18,
        channels: [{ id: '900000000000000020', name: 'planning-formation', type: 0, position: 0 }],
        roles: [
          { id: '702000000000000001', name: 'En Formation', position: 4, managed: false },
          { id: '702000000000000002', name: 'En Simulation', position: 5, managed: false },
          { id: '702000000000000003', name: 'VA Validé', position: 6, managed: false },
        ],
        members: [],
      },
      {
        id: GUILD_IDS.PRODUCTION_CHATTING,
        name: 'PAWAKO Production Chatting',
        approximate_member_count: 25,
        channels: [{ id: '900000000000000030', name: 'general-chatting', type: 0, position: 0 }],
        roles: [{ id: '703000000000000001', name: 'VA Production', position: 8, managed: false }],
        members: [],
      },
      {
        id: GUILD_IDS.PRODUCTION_INSTAGRAM,
        name: 'PAWAKO Production Instagram',
        approximate_member_count: 14,
        channels: [{ id: '900000000000000040', name: 'general-insta', type: 0, position: 0 }],
        roles: [{ id: '704000000000000001', name: 'VA Instagram', position: 8, managed: false }],
        members: [],
      },
    ];

    const adminLogin = await loginViaWorkerOAuth(mock, emptyGuildEnv, 'admin', {
      id: emptyGuildEnv.INITIAL_ADMIN_DISCORD_ID!,
      username: 'super_admin',
      global_name: 'Super Admin',
      avatar: null,
    });

    // 1. Découverte sans modification en base
    const discoverRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/bot/discover`, {
        headers: {
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
      }),
      emptyGuildEnv
    );
    assert.equal(discoverRes.status, 200);
    const discoverJson = (await discoverRes.json()) as any;
    assert.equal(discoverJson.ok, true);
    assert.equal(discoverJson.bot.username, 'pawako_bot');
    assert.match(discoverJson.bot.inviteBotUrl, /permissions=8/);
    assert.equal(discoverJson.guilds.length, 4);
    assert.equal(discoverJson.matchedServers.RECRUTEMENT, GUILD_IDS.RECRUTEMENT);
    assert.equal(discoverJson.matchedServers.FORMATION, GUILD_IDS.FORMATION);
    assert.equal(discoverJson.matchedServers.PRODUCTION_CHATTING, GUILD_IDS.PRODUCTION_CHATTING);
    assert.equal(discoverJson.matchedServers.PRODUCTION_INSTAGRAM, GUILD_IDS.PRODUCTION_INSTAGRAM);

    // 2. Auto-configuration complète vers Firestore
    const autoRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/bot/auto-configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ syncMembers: true }),
      }),
      emptyGuildEnv
    );
    assert.equal(autoRes.status, 200);
    const autoJson = (await autoRes.json()) as any;
    assert.equal(autoJson.ok, true);
    assert.equal(autoJson.serversUpdated, 4);
    assert.ok(autoJson.rolesMapped >= 8);
    assert.ok(autoJson.membersSynced >= 1);

    // 3. Vérifier la persistance des serveurs et du salon d'invitation Recrutement
    const serversRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/servers`, {
        headers: {
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
      }),
      emptyGuildEnv
    );
    assert.equal(serversRes.status, 200);
    const serversJson = (await serversRes.json()) as { servers: any[] };
    const servers = serversJson.servers;
    const recrutementServer = servers.find(s => s.id === 'RECRUTEMENT');
    assert.ok(recrutementServer);
    assert.equal(recrutementServer.guildId, GUILD_IDS.RECRUTEMENT);
    assert.equal(recrutementServer.inviteChannelId, '900000000000000011');
    assert.equal(recrutementServer.inviteChannelName, 'accueil-recrutement');

    // 4. Vérifier les mappings de rôles persistés
    const mappingsRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/discord/role-mappings`, {
        headers: {
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
      }),
      emptyGuildEnv
    );
    assert.equal(mappingsRes.status, 200);
    const mappingsJson = (await mappingsRes.json()) as { mappings: any[] };
    const mappings = mappingsJson.mappings;
    assert.equal(mappings.find(m => m.serverId === 'RECRUTEMENT' && m.roleType === 'CANDIDAT')?.discordRoleId, '701000000000000001');
    assert.equal(mappings.find(m => m.serverId === 'FORMATION' && m.roleType === 'EN_FORMATION')?.discordRoleId, '702000000000000001');
    assert.equal(
      mappings.find(m => m.serverId === 'PRODUCTION_INSTAGRAM' && m.roleType === 'VA_PRODUCTION')?.discordRoleId,
      '704000000000000001'
    );

    // 5. Même avec env guild IDs vides, la création d'un parrain génère une vraie invitation Discord sur le salon découvert
    mock.discordUsers.set('500000000000000750', {
      id: '500000000000000750',
      username: 'parrain_auto',
      global_name: 'Parrain Auto Bound',
      avatar: null,
    });
    const createRefRes = await app.fetch(
      new Request(`${WORKER_ORIGIN}/api/referrers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `pawako_session=${adminLogin.sessionCookie}`,
          Origin: FRONTEND_ORIGIN,
        },
        body: JSON.stringify({ discordUserId: '500000000000000750' }),
      }),
      emptyGuildEnv
    );
    assert.equal(createRefRes.status, 201);
    const createRefJson = (await createRefRes.json()) as any;
    assert.equal(createRefJson.referrer.inviteStatus, 'ACTIVE');
    assert.equal(createRefJson.referrer.inviteChannelId, '900000000000000011');
    assert.match(createRefJson.referrer.inviteUrl, /^https:\/\/discord\.gg\/realDisc/);
  });
});


