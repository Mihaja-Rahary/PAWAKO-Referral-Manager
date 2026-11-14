/**
 * PAWAKO Referral Manager — Cloudflare Worker API Backend (referral-manager)
 * Déployable sur l'offre gratuite Cloudflare Workers (workers.dev)
 * Persistance stricte sur Cloud Firestore via REST API
 * Sécurité durcie : Zéro secret par défaut, CORS strict, Webhooks anti-rejeu atomiques,
 * Protection du dernier administrateur, Réponses OAuth sans fuite d'information.
 */

import { Hono } from 'hono';
import { FirestoreRestClient, FirestoreRestError, diagnosePrivateKeyPem } from '../server/firestoreRest';
import { FirestoreRepository, getEffectiveReferrerStatus } from '../server/firestoreRepository';
import { DiscordBotConfig, discoverDiscordBotEnvironment } from '../server/discordBot';
import {
  AdminStatus,
  Candidate,
  CandidateStatus,
  DiscordServerType,
  OperationalStatus,
  PawakoRoleType,
  ReferrerStatus,
  User,
  UserRole,
  UserStatus,
  VAType,
} from '../server/types';
import {
  generateSecureOAuthState,
  verifyAndConsumeOAuthState,
  generateBotInstallState,
  verifyBotInstallState,
  createSignedSessionToken,
  verifySignedSessionToken,
  validateWebhookTimestampAndEventId,
  constantTimeEqual,
} from '../server/cryptoUtils';

export interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_RECRUITMENT_INVITE_CHANNEL_ID?: string;
  FRONTEND_URL?: string;
  INITIAL_ADMIN_DISCORD_ID?: string;
  JARVIS_WEBHOOK_SECRET?: string;
  SESSION_SECRET?: string;
  DISCORD_RECRUITMENT_GUILD_ID?: string;
  DISCORD_FORMATION_GUILD_ID?: string;
  DISCORD_CHATTING_PRODUCTION_GUILD_ID?: string;
  DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID?: string;
  ENVIRONMENT?: string;
  NODE_ENV?: string;
}

function getDiscordBotConfig(env: Env): DiscordBotConfig {
  return {
    botToken: env.DISCORD_BOT_TOKEN?.trim(),
    recruitmentGuildId: env.DISCORD_RECRUITMENT_GUILD_ID?.trim(),
    inviteChannelId: env.DISCORD_RECRUITMENT_INVITE_CHANNEL_ID?.trim(),
  };
}

function getEnvGuildIds(env: Env): Record<DiscordServerType, string> {
  return {
    RECRUTEMENT: (env.DISCORD_RECRUITMENT_GUILD_ID || '').trim(),
    FORMATION: (env.DISCORD_FORMATION_GUILD_ID || '').trim(),
    PRODUCTION_CHATTING: (env.DISCORD_CHATTING_PRODUCTION_GUILD_ID || '').trim(),
    PRODUCTION_INSTAGRAM: (env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID || '').trim(),
  };
}

const app = new Hono<{ Bindings: Env }>();

function sanitizeDiagnosticText(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, '[PEM_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(client_secret|private_key|botToken|password|secret)=[^&\s]+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function isOriginAllowedForEnv(origin: string | undefined, env: Env): origin is string {
  if (!origin) return false;
  const frontendUrl = (env.FRONTEND_URL || '').trim();
  let configuredFrontendOrigin: string | null = null;
  if (frontendUrl) {
    try {
      const parsed = new URL(frontendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        configuredFrontendOrigin = parsed.origin;
      }
    } catch {
      configuredFrontendOrigin = null;
    }
  }
  const isDevelopment = env.ENVIRONMENT === 'development' || env.NODE_ENV === 'development';
  if (isDevelopment) {
    const isLocalhost =
      origin === 'http://localhost:3000' ||
      origin === 'http://127.0.0.1:3000' ||
      origin === 'http://localhost:5173' ||
      origin === 'http://127.0.0.1:5173';
    return isLocalhost || Boolean(configuredFrontendOrigin && origin === configuredFrontendOrigin);
  }
  return Boolean(configuredFrontendOrigin && origin === configuredFrontendOrigin);
}

// Gestionnaire global d'erreurs : journalisation structurée et diagnostic sûr sans jamais exposer de secret
app.onError((err, c) => {
  const origin = c.req.header('Origin');
  const corsHeaders: Record<string, string> = isOriginAllowedForEnv(origin, c.env)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      }
    : {};

  if (err instanceof FirestoreRestError) {
    const safeMsg = sanitizeDiagnosticText(err.message) || 'Erreur Firestore.';
    console.error('[Worker Unhandled FirestoreRestError]', {
      method: c.req.method,
      path: c.req.path,
      category: err.category,
      operation: err.operation,
      status: err.status ?? null,
      firestoreStatus: err.firestoreStatus ?? null,
      message: safeMsg,
    });

    if (err.isPreconditionConflict) {
      return c.json(
        {
          error: 'Conflit de mise à jour concurrente dans Firestore. Veuillez actualiser et réessayer.',
          code: 'FIRESTORE_PRECONDITION_CONFLICT',
          category: err.category,
          operation: err.operation,
        },
        409,
        corsHeaders
      );
    }

    const httpStatus =
      err.category === 'RATE_LIMIT'
        ? 429
        : ['AUTH', 'CONFIG', 'PERMISSION', 'NETWORK', 'TRANSIENT'].includes(err.category)
          ? 503
          : 500;

    return c.json(
      {
        error: safeMsg,
        code: err.firestoreStatus || err.category,
        category: err.category,
        operation: err.operation,
        httpStatus: err.status ?? null,
      },
      httpStatus,
      corsHeaders
    );
  }

  const errName = (err as any)?.name || 'Error';
  const safeMsg = sanitizeDiagnosticText((err as any)?.message);
  console.error('[Worker Unhandled Error]', {
    method: c.req.method,
    path: c.req.path,
    name: errName,
    message: safeMsg,
  });

  return c.json(
    {
      error: safeMsg
        ? `Erreur interne du serveur (${errName}: ${safeMsg}).`
        : `Erreur interne du serveur (${errName}).`,
      code: 'INTERNAL_SERVER_ERROR',
    },
    500,
    corsHeaders
  );
});

// Échappement HTML sécurisé pour toute injection dynamique
function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper pour initialiser le client REST Firestore et le repository depuis l'environnement du Worker
function createFirestoreClient(env: Env): FirestoreRestClient {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() || 'gen-lang-client-0255826431';
  const databaseId =
    env.FIREBASE_DATABASE_ID?.trim() || 'ai-studio-pawakoreferralma-1d4a1a22-a715-4552-b717-2e03e349fbee';
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY?.trim();

  return new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail,
    privateKey,
  });
}

function getRepository(env: Env): FirestoreRepository {
  return new FirestoreRepository(createFirestoreClient(env));
}

export interface WorkerFirestoreDiagnosticResult {
  ok: boolean;
  probeTarget: string;
  stage: 'CONFIG' | 'GOOGLE_OAUTH2' | 'FIRESTORE_API' | 'OK';
  classification:
    | 'AUTHENTICATED_OK'
    | 'DOCUMENT_ABSENT'
    | 'DATABASE_OR_PROJECT_NOT_FOUND'
    | 'PERMISSION_DENIED'
    | 'GOOGLE_AUTH_ERROR'
    | 'CONFIG_ERROR'
    | 'NETWORK_ERROR'
    | 'FIRESTORE_ERROR';
  category?: string;
  httpStatus?: number | null;
  firestoreStatus?: string | null;
  diagnosticCode: string;
  message: string;
  projectId: string;
  databaseId: string;
}

/**
 * Utilitaire de diagnostic Firestore du Worker :
 * sonde en lecture seule la collection racine `pawako_metadata` (pageSize=1)
 * au lieu d'un document spécifique, afin de différencier :
 * - 200 / 404 document absent (connexion base OK)
 * - 404 base/projet inexistant
 * - 401 / 403 / 500+ (authentification Google, permissions IAM ou indisponibilité)
 */
export async function runFirestoreRootCollectionDiagnostic(
  env: Env
): Promise<WorkerFirestoreDiagnosticResult> {
  const client = createFirestoreClient(env);
  const result = await client.diagnoseFirestoreConnection();
  return {
    ...result,
    probeTarget: 'root_collection:pawako_metadata?pageSize=1',
  };
}

// -----------------------------------------------------------------------------
// 1. GESTION STRICTE DU SECRET DE SESSION (AUCUN FALLBACK PRÉVISIBLE)
// -----------------------------------------------------------------------------

function getValidatedSessionSecret(env: Env): string {
  const secret = (env.SESSION_SECRET || '').trim();
  if (!secret || secret.length < 32) {
    throw new Error('Configuration serveur incomplète : SESSION_SECRET manquant ou inférieur à 32 caractères dans les secrets Cloudflare.');
  }
  return secret;
}

const OFFICIAL_PRODUCTION_DISCORD_REDIRECT_URI =
  'https://referral-manager.pawako-saas.workers.dev/auth/callback';

function getDiscordRedirectUri(env: Env, requestUrl: string): string {
  const isDevelopment = env.ENVIRONMENT === 'development' || env.NODE_ENV === 'development';
  const configured = (env.DISCORD_REDIRECT_URI || '').trim();

  if (!isDevelopment) {
    const candidate = configured || `${new URL(requestUrl).origin}/auth/callback`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error('Configuration serveur invalide : DISCORD_REDIRECT_URI invalide.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        'Configuration serveur invalide : DISCORD_REDIRECT_URI doit impérativement utiliser HTTPS en production.'
      );
    }

    if (candidate !== OFFICIAL_PRODUCTION_DISCORD_REDIRECT_URI) {
      throw new Error(
        `Configuration serveur invalide : DISCORD_REDIRECT_URI doit correspondre exactement à ${OFFICIAL_PRODUCTION_DISCORD_REDIRECT_URI}.`
      );
    }

    return OFFICIAL_PRODUCTION_DISCORD_REDIRECT_URI;
  }

  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new Error('Configuration serveur invalide : DISCORD_REDIRECT_URI invalide.');
    }
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return configured;
    }
    throw new Error('Configuration serveur invalide : DISCORD_REDIRECT_URI invalide.');
  }

  const workerOrigin = new URL(requestUrl).origin;
  return `${workerOrigin}/auth/callback`;
}

// -----------------------------------------------------------------------------
// 2. CONFIGURATION CORS STRICTE (RESTRICTION AUX SEULES ORIGINES AUTORISÉES)
// -----------------------------------------------------------------------------

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');

  // Si aucune en-tête Origin n'est fournie (requête server-to-server, webhook, curl direct sans Origin)
  if (!origin) {
    return next();
  }

  const isAllowedOrigin = isOriginAllowedForEnv(origin, c.env);

  // Traitement des requêtes pré-vol (OPTIONS)
  if (c.req.method === 'OPTIONS') {
    if (!isAllowedOrigin) {
      return c.json({ error: 'Origine CORS non autorisée' }, 403);
    }
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Origin, Content-Type, Accept, Authorization, X-JARVIS-Secret, X-JARVIS-Timestamp, X-JARVIS-Nonce',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Requête standard d'une origine non autorisée : refus immédiat
  if (!isAllowedOrigin) {
    return c.json({ error: 'Origine CORS non autorisée' }, 403);
  }

  await next();

  c.res.headers.set('Access-Control-Allow-Origin', origin);
  c.res.headers.set('Access-Control-Allow-Credentials', 'true');
});

// Helper pour extraire et valider l'utilisateur authentifié
export async function getAuthenticatedUser(c: any, repo: FirestoreRepository): Promise<User | null> {
  let secret: string;
  try {
    secret = getValidatedSessionSecret(c.env);
  } catch {
    // Si SESSION_SECRET n'est pas configuré, refuser silencieusement toute session non sécurisée
    return null;
  }

  // Authentification EXCLUSIVE par cookie HttpOnly sécurisé pawako_session
  // Les en-têtes Authorization, X-Pawako-Session ou X-Pawako-User-Id sont formellement refusés comme moyen d'authentification
  const cookieHeader = c.req.header('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)pawako_session=([^;]+)/);
  const token = match ? match[1].trim() : null;

  if (!token || typeof token !== 'string') {
    return null;
  }

  // Vérification cryptographique de la signature et de la validité temporelle
  const verification = await verifySignedSessionToken(token, secret);
  if (!verification.valid || !verification.payload) {
    return null;
  }

  const user = await repo.getUserById(verification.payload.userId);
  if (!user || user.status !== 'ACTIVE') {
    return null; // Révocation immédiate si l'utilisateur est inexistant ou non actif
  }

  return user;
}

// -----------------------------------------------------------------------------
// 3. WHITELIST STRICTE POUR LE PORTAIL PARRAIN
// -----------------------------------------------------------------------------

export interface ParrainCandidateView {
  id: string;
  discordUserId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  vaType: VAType;
  adminStatus: AdminStatus;
  operationalStatus: OperationalStatus;
  status: CandidateStatus;
  currentServer: DiscordServerType | 'AUCUN';
  arrivalDate: string;
  refusalReason: null;
  productionDate: string | null;
  hasAnomaly: boolean;
  anomalyReason: string | null;
  createdAt: string;
}

export function toParrainCandidateView(c: Candidate): ParrainCandidateView {
  return {
    id: c.id,
    discordUserId: c.discordUserId,
    username: c.username,
    displayName: c.displayName,
    avatar: c.avatar || null,
    vaType: c.vaType,
    adminStatus: c.adminStatus,
    operationalStatus: c.operationalStatus,
    status: c.status,
    currentServer: c.currentServer,
    arrivalDate: c.arrivalDate,
    refusalReason: null, // Confidentialité stricte : les motifs de refus internes ne sont jamais exposés aux parrains
    productionDate: c.productionDate || null,
    hasAnomaly: Boolean(c.hasAnomaly),
    anomalyReason: c.hasAnomaly ? 'Vérification administrative en cours' : null,
    createdAt: c.createdAt,
  };
}

// -----------------------------------------------------------------------------
// 4. SANTÉ DU WORKER
// -----------------------------------------------------------------------------

app.get('/health', c => {
  return c.json({
    status: 'ok',
    worker: 'referral-manager',
    runtime: 'Cloudflare Workers (Edge)',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async c => {
  const rawProjectId =
    (c.env.FIREBASE_PROJECT_ID || '').trim().replace(/^["']|["']$/g, '') ||
    'gen-lang-client-0255826431';
  const rawDatabaseId =
    (c.env.FIREBASE_DATABASE_ID || '').trim().replace(/^["']|["']$/g, '') ||
    'ai-studio-pawakoreferralma-1d4a1a22-a715-4552-b717-2e03e349fbee';
  const cleanEmail = (c.env.FIREBASE_CLIENT_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const hasClientEmail = Boolean(cleanEmail);
  const clientEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const keyDiag = diagnosePrivateKeyPem(c.env.FIREBASE_PRIVATE_KEY);

  let sessionSecretValid = false;
  try {
    getValidatedSessionSecret(c.env);
    sessionSecretValid = true;
  } catch {
    sessionSecretValid = false;
  }

  let oauthRedirectUriValid = false;
  try {
    getDiscordRedirectUri(c.env, c.req.url);
    oauthRedirectUriValid = true;
  } catch {
    oauthRedirectUriValid = false;
  }

  const skipConnectivityCheck =
    c.req.query('shallow') === '1' ||
    c.req.query('shallow') === 'true' ||
    c.req.query('check') === 'config';

  const connectivity = skipConnectivityCheck
    ? undefined
    : await runFirestoreRootCollectionDiagnostic(c.env);
  const httpStatus = connectivity && !connectivity.ok ? 503 : 200;

  return c.json(
    {
      status: connectivity && !connectivity.ok ? 'degraded' : 'ok',
      worker: 'referral-manager',
      firestore: {
        projectId: rawProjectId,
        databaseId: rawDatabaseId,
        hasServiceAccount: Boolean(hasClientEmail && c.env.FIREBASE_PRIVATE_KEY?.trim()),
        hasClientEmail,
        clientEmailFormatValid,
        hasPrivateKey: Boolean(c.env.FIREBASE_PRIVATE_KEY?.trim()),
        privateKeyFormat: keyDiag.code,
        ...(connectivity ? { connectivity } : {}),
      },
      auth: {
        hasSessionSecret: Boolean((c.env.SESSION_SECRET || '').trim()),
        sessionSecretValid,
        hasDiscordClientId: Boolean((c.env.DISCORD_CLIENT_ID || '').trim()),
        hasDiscordClientSecret: Boolean((c.env.DISCORD_CLIENT_SECRET || '').trim()),
        oauthRedirectUriValid,
      },
      discordBot: {
        hasBotToken: Boolean((c.env.DISCORD_BOT_TOKEN || '').trim()),
        hasRecruitmentGuildId: Boolean((c.env.DISCORD_RECRUITMENT_GUILD_ID || '').trim()),
        hasRecruitmentInviteChannelId: Boolean((c.env.DISCORD_RECRUITMENT_INVITE_CHANNEL_ID || '').trim()),
        hasJarvisWebhookSecret: Boolean((c.env.JARVIS_WEBHOOK_SECRET || '').trim()),
      },
      timestamp: new Date().toISOString(),
    },
    httpStatus
  );
});

// -----------------------------------------------------------------------------
// 5. AUTHENTIFICATION & SESSIONS DISCORD OAUTH2
// -----------------------------------------------------------------------------

app.get('/api/auth/url', async c => {
  let signingSecret: string;
  try {
    signingSecret = getValidatedSessionSecret(c.env);
  } catch (err: any) {
    console.error('[OAuth2 Auth URL][CONFIG_ERROR]', {
      reason: 'MISSING_OR_INVALID_SESSION_SECRET',
      message: err?.message || 'SESSION_SECRET invalide',
    });
    return c.json({ error: err.message }, 500);
  }

  const portal = c.req.query('portal') === 'parrain' ? 'parrain' : 'admin';
  const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';
  const clientSecret = c.env.DISCORD_CLIENT_SECRET?.trim() || '';

  // Calcule l'URL de redirection exacte vers le Worker
  const workerOrigin = new URL(c.req.url).origin;
  let redirectUri: string;
  try {
    redirectUri = getDiscordRedirectUri(c.env, c.req.url);
  } catch (err: any) {
    console.error('[OAuth2 Auth URL][CONFIG_ERROR]', {
      reason: 'INVALID_DISCORD_REDIRECT_URI',
      message: err?.message || 'DISCORD_REDIRECT_URI invalide',
    });
    return c.json({ error: err.message }, 500);
  }

  // Le state est cryptographiquement aléatoire, signé en HMAC et protégé contre le rejeu
  const { state, nonce } = await generateSecureOAuthState(portal, signingSecret);

  const isConfigured = Boolean(clientId && clientSecret);
  const discordUrl = isConfigured
    ? `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=identify&state=${encodeURIComponent(state)}`
    : '';

  console.info('[OAuth2 Auth URL] State generated', {
    portal,
    noncePrefix: nonce.slice(0, 8),
    isConfigured,
  });

  return c.json(
    {
      url: discordUrl,
      portal,
      isConfigured,
      redirectUri,
      appUrl: workerOrigin,
      state,
    },
    200,
    {
      'Set-Cookie': `oauth_portal=${portal}; Path=/; Secure; SameSite=None; Max-Age=600; HttpOnly`,
    }
  );
});

const handleAuthCallback = async (c: any) => {
  let signingSecret: string;
  try {
    signingSecret = getValidatedSessionSecret(c.env);
  } catch (err: any) {
    console.error('[OAuth2 Callback][TECHNICAL_ERROR]', {
      failureCode: 'MISSING_SECRET',
      message: err?.message || 'SESSION_SECRET manquant',
    });
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur Serveur — PAWAKO</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
          <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 440px;">
            <h3 style="margin: 0 0 8px 0; color: #f87171;">Configuration serveur incomplète</h3>
            <p style="color: #cbd5e1; font-size: 13px;">Le secret de session serveur (SESSION_SECRET) n est pas configuré. Veuillez contacter l administrateur.</p>
          </div>
        </body>
      </html>
    `, 500);
  }

  const code = c.req.query('code');
  const state = c.req.query('state') || '';
  const error = c.req.query('error');
  const guildIdParam = (c.req.query('guild_id') || '').trim();
  const isBotInstallCallback =
    state.startsWith('botinstall_') ||
    (Boolean(guildIdParam) &&
      /^\d{17,20}$/.test(guildIdParam) &&
      !state.startsWith('admin_') &&
      !state.startsWith('parrain_'));

  // Détection préliminaire du portail visé depuis le state ou le cookie (avant consommation atomique)
  const cookieHeader = c.req.header('Cookie') || '';
  const cookiePortalMatch = cookieHeader.match(/(?:^|;\s*)oauth_portal=([^;]+)/);
  const portalFromCookie = cookiePortalMatch ? cookiePortalMatch[1] : null;

  let portal: 'admin' | 'parrain' =
    portalFromCookie === 'parrain' || state.startsWith('parrain_') ? 'parrain' : 'admin';

  const frontendUrl = c.env.FRONTEND_URL?.trim() || 'https://pawako-referral-manager.pages.dev';
  let targetOrigin = '';
  try {
    targetOrigin = new URL(frontendUrl).origin;
  } catch {
    targetOrigin = 'https://pawako-referral-manager.pages.dev';
  }

  let portalLoginUrl = `${targetOrigin}/${portal}/login`;
  let portalDestUrl = `${targetOrigin}/${portal}`;

  if (isBotInstallCallback) {
    if (error || !code) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>Ajout du bot annulé — PAWAKO</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
            <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #334155; text-align: center; max-width: 440px;">
              <h3 style="margin: 0 0 8px 0; color: #f8fafc;">Ajout du bot annulé</h3>
              <p style="color: #cbd5e1; font-size: 13px;">L'autorisation d'ajouter le bot au serveur Discord a été annulée.</p>
              <button id="btn-back" style="background: #7c3aed; color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 12px;">Retour à PAWAKO</button>
            </div>
            <script>
              const targetOrigin = ${JSON.stringify(targetOrigin)};
              document.getElementById('btn-back').addEventListener('click', function() {
                if (window.opener) {
                  window.close();
                } else {
                  window.location.href = targetOrigin + '/admin';
                }
              });
            </script>
          </body>
        </html>
      `, 400);
    }

    if (state.startsWith('botinstall_')) {
      const botStateCheck = await verifyBotInstallState(state, signingSecret);
      if (!botStateCheck.valid) {
        return c.html(`
          <!DOCTYPE html>
          <html>
            <head><title>Sécurité Bot Discord — PAWAKO</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
              <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 440px;">
                <h3 style="margin: 0 0 8px 0; color: #f87171;">Lien d'invitation bot expiré ou invalide</h3>
                <p style="color: #cbd5e1; font-size: 13px;">${escapeHtml(botStateCheck.reason || 'Validation de sécurité échouée.')}</p>
                <button id="btn-back" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 12px;">Retour à PAWAKO</button>
              </div>
              <script>
                const targetOrigin = ${JSON.stringify(targetOrigin)};
                document.getElementById('btn-back').addEventListener('click', function() {
                  if (window.opener) { window.close(); } else { window.location.href = targetOrigin + '/admin'; }
                });
              </script>
            </body>
          </html>
        `, 403);
      }
    }

    const redirectUri = getDiscordRedirectUri(c.env, c.req.url);
    const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';
    const clientSecret = c.env.DISCORD_CLIENT_SECRET?.trim() || '';

    if (!clientId || !clientSecret) {
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>Configuration Discord incomplète — PAWAKO</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
            <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 460px;">
              <h3 style="margin: 0 0 8px 0; color: #f87171;">DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET manquant</h3>
              <p style="color: #cbd5e1; font-size: 13px;">Impossible de finaliser l'échange OAuth2 Code Grant du bot sans les identifiants client Discord côté Worker.</p>
            </div>
          </body>
        </html>
      `, 503);
    }

    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errJson = (await tokenRes.json().catch(() => null)) as {
        error?: string;
        error_description?: string;
      } | null;
      const errMsg = errJson?.error_description || errJson?.error || `HTTP ${tokenRes.status}`;
      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>Erreur ajout bot Discord — PAWAKO</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
            <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 460px;">
              <h3 style="margin: 0 0 8px 0; color: #f87171;">Échec de finalisation Code Grant</h3>
              <p style="color: #cbd5e1; font-size: 13px;">Discord a refusé l'échange du code d'autorisation bot : <code>${escapeHtml(errMsg)}</code></p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 8px;">Vérifiez que DISCORD_CLIENT_SECRET correspond à votre application Discord et que la Redirect URI <code>${escapeHtml(redirectUri)}</code> est enregistrée.</p>
              <button id="btn-back" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 12px;">Retour à PAWAKO</button>
            </div>
            <script>
              const targetOrigin = ${JSON.stringify(targetOrigin)};
              document.getElementById('btn-back').addEventListener('click', function() {
                if (window.opener) { window.close(); } else { window.location.href = targetOrigin + '/admin'; }
              });
            </script>
          </body>
        </html>
      `, 400);
    }

    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      guild?: { id?: string; name?: string };
    };
    const addedGuildId = tokenData?.guild?.id || guildIdParam || '';
    const addedGuildName = tokenData?.guild?.name || '';

    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Bot PAWAKO ajouté — PAWAKO</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
          <div style="background: #1e293b; padding: 34px; border-radius: 16px; border: 1px solid #10b981; text-align: center; max-width: 460px;">
            <div style="width: 48px; height: 48px; background: rgba(16,185,129,0.18); color: #34d399; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✓</div>
            <h2 style="margin: 0 0 8px 0; font-size: 20px; color: #f8fafc;">Bot Discord ajouté avec succès</h2>
            <p style="color: #cbd5e1; font-size: 14px; margin: 0 0 16px 0;">
              Serveur connecté : <strong>${escapeHtml(addedGuildName || addedGuildId || 'Serveur Discord')}</strong>
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin: 0 0 18px 0;">
              Vous pouvez fermer cet onglet et cliquer sur « Scanner » ou « Détecter &amp; tout relier » dans votre espace PAWAKO.
            </p>
            <button id="btn-done" style="background: #7c3aed; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;">Retour au Dashboard</button>
          </div>
          <script>
            const targetOrigin = ${JSON.stringify(targetOrigin)};
            const payload = {
              type: 'DISCORD_BOT_INVITED',
              guildId: ${JSON.stringify(addedGuildId)},
              guildName: ${JSON.stringify(addedGuildName)}
            };
            if (window.opener) {
              try { window.opener.postMessage(payload, targetOrigin); } catch (e) {}
            }
            document.getElementById('btn-done').addEventListener('click', function() {
              if (window.opener) { window.close(); } else { window.location.replace(targetOrigin + '/admin'); }
            });
            if (window.opener) {
              setTimeout(function() { try { window.close(); } catch (e) {} }, 900);
            }
          </script>
        </body>
      </html>
    `, 200);
  }

  // Vérifier d'abord l'annulation Discord ou l'absence de code avant de consommer le nonce dans Firestore
  if (error || !code) {
    console.warn('[OAuth2 Callback][CANCELLED_OR_MISSING_CODE]', {
      portal,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      discordError: error || null,
    });
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Connexion Discord annulée — PAWAKO</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 28px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Autorisation Discord annulée</h3>
            <p style="color: #64748b; font-size: 14px;">L autorisation demandée a été annulée ou refusée.</p>
            <button id="btn-back" style="background: #0f172a; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;">Retour à la page de connexion</button>
          </div>
          <script>
            const targetOrigin = ${JSON.stringify(targetOrigin)};
            const loginUrl = ${JSON.stringify(portalLoginUrl)};
            document.getElementById('btn-back').addEventListener('click', function() {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_CANCELLED' }, targetOrigin);
                window.close();
              } else {
                window.location.href = loginUrl;
              }
            });
          </script>
        </body>
      </html>
    `, 400);
  }

  const repo = getRepository(c.env);

  // Validation cryptographique stricte du state OAuth2 et consommation atomique dans Firestore
  const stateCheck = await verifyAndConsumeOAuthState(state, signingSecret, (nonce, exp) =>
    repo.consumeOAuthNonce(nonce, exp)
  );

  if (stateCheck.portal) {
    portal = stateCheck.portal;
    portalLoginUrl = `${targetOrigin}/${portal}/login`;
    portalDestUrl = `${targetOrigin}/${portal}`;
  }

  // Échec de validation du state : distinguer erreur technique Firestore (503) et échec de sécurité/authentification (403)
  if (!stateCheck.valid) {
    const noncePrefix = stateCheck.nonce ? stateCheck.nonce.slice(0, 8) : null;

    if (stateCheck.errorCategory === 'TECHNICAL_ERROR') {
      const diag = stateCheck.diagnostics || {};
      const diagCategory = diag.category ? String(diag.category) : 'UNKNOWN';
      const diagOperation = diag.operation ? String(diag.operation) : 'FIRESTORE';
      const diagStatus = diag.httpStatus ? `HTTP ${diag.httpStatus}` : null;
      const diagErrorCode = diag.errorCode ? String(diag.errorCode) : null;
      const safeDiagnosticLine = [
        diagCategory,
        diagOperation,
        diagStatus,
        diagErrorCode ? `(${diagErrorCode})` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      console.error('[OAuth2 Callback][TECHNICAL_ERROR]', {
        failureCode: stateCheck.failureCode || 'FIRESTORE_ERROR',
        portal,
        noncePrefix,
        reason: stateCheck.reason || 'Erreur technique Firestore',
        diagnostics: diag,
      });

      const techErrorMessage =
        'Erreur technique serveur lors de la vérification OAuth2 (service Firestore temporairement indisponible ou mal configuré).';

      return c.html(`
        <!DOCTYPE html>
        <html>
          <head><title>Erreur Technique OAuth2 — PAWAKO</title></head>
          <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
            <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #f59e0b; text-align: center; max-width: 460px;">
              <div style="width: 48px; height: 48px; background: rgba(245,158,11,0.2); color: #fbbf24; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">!</div>
              <h3 style="margin: 0 0 8px 0; color: #fbbf24;">Erreur technique temporaire</h3>
              <p style="color: #cbd5e1; font-size: 13px; line-height: 1.5;">${escapeHtml(techErrorMessage)}</p>
              <p style="color: #94a3b8; font-size: 11px; margin-top: 8px;">Code : ${escapeHtml(stateCheck.failureCode || 'FIRESTORE_ERROR')}</p>
              <p style="color: #64748b; font-size: 11px; margin-top: 4px; font-family: monospace;">Diagnostic : ${escapeHtml(safeDiagnosticLine)}</p>
              <button id="btn-back" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 14px;">Retour à la connexion</button>
            </div>
            <script>
              const targetOrigin = ${JSON.stringify(targetOrigin)};
              const loginUrl = ${JSON.stringify(portalLoginUrl)};
              const failureCode = ${JSON.stringify(stateCheck.failureCode || 'FIRESTORE_ERROR')};
              const diagnostic = ${JSON.stringify(safeDiagnosticLine)};
              const errorMessage = ${JSON.stringify(techErrorMessage)};
              document.getElementById('btn-back').addEventListener('click', function() {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', category: 'TECHNICAL_ERROR', code: failureCode, diagnostic: diagnostic, error: errorMessage }, targetOrigin);
                  window.close();
                } else {
                  window.location.href = loginUrl;
                }
              });
            </script>
          </body>
        </html>
      `, 503);
    }

    console.warn('[OAuth2 Callback][AUTH_FAILURE]', {
      failureCode: stateCheck.failureCode || 'INVALID_STATE',
      portal,
      noncePrefix,
      reason: stateCheck.reason || 'Validation de state échouée',
      diagnostics: stateCheck.diagnostics || null,
    });

    let authErrorMessage = 'La validation de sécurité a échoué (jeton OAuth2 invalide).';
    if (stateCheck.failureCode === 'STATE_EXPIRED') {
      authErrorMessage = 'La session de connexion Discord a expiré (> 10 minutes). Veuillez réessayer.';
    } else if (stateCheck.failureCode === 'REPLAY_DETECTED') {
      authErrorMessage = 'Ce jeton de connexion Discord a déjà été utilisé (rejeu bloqué). Veuillez relancer la connexion.';
    } else if (stateCheck.failureCode === 'INVALID_HMAC') {
      authErrorMessage = 'Signature de sécurité OAuth2 invalide. Veuillez relancer la connexion depuis PAWAKO.';
    }

    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Sécurité OAuth2 — PAWAKO</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
          <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 440px;">
            <div style="width: 48px; height: 48px; background: rgba(220,38,38,0.2); color: #f87171; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✕</div>
            <h3 style="margin: 0 0 8px 0; color: #f87171;">Échec de sécurité OAuth2</h3>
            <p style="color: #cbd5e1; font-size: 13px; line-height: 1.5;">${escapeHtml(authErrorMessage)}</p>
            <p style="color: #94a3b8; font-size: 11px; margin-top: 8px;">Code : ${escapeHtml(stateCheck.failureCode || 'AUTH_FAILURE')}</p>
            <button id="btn-back" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 14px;">Retour à la connexion</button>
          </div>
          <script>
            const targetOrigin = ${JSON.stringify(targetOrigin)};
            const loginUrl = ${JSON.stringify(portalLoginUrl)};
            const failureCode = ${JSON.stringify(stateCheck.failureCode || 'AUTH_FAILURE')};
            const errorMessage = ${JSON.stringify(authErrorMessage)};
            document.getElementById('btn-back').addEventListener('click', function() {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', category: 'AUTH_FAILURE', code: failureCode, error: errorMessage }, targetOrigin);
                window.close();
              } else {
                window.location.href = loginUrl;
              }
            });
          </script>
        </body>
      </html>
    `, 403);
  }

  let processingStage = 'DISCORD_CONFIG';
  try {
    const redirectUri = getDiscordRedirectUri(c.env, c.req.url);
    const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';
    const clientSecret = c.env.DISCORD_CLIENT_SECRET?.trim() || '';

    if (!clientId || !clientSecret) {
      throw new Error('Configuration Discord OAuth2 incomplète.');
    }

    processingStage = 'DISCORD_TOKEN_EXCHANGE';
    // Échange du code contre le token Discord
    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      let discordErrCode = 'token_exchange_failed';
      try {
        const errBody = (await tokenRes.json()) as { error?: string };
        if (errBody?.error && typeof errBody.error === 'string') {
          discordErrCode = errBody.error.slice(0, 64);
        }
      } catch {
        // Ignorer si réponse non JSON
      }
      const tokenErr: any = new Error(
        `Échec de l'échange de token Discord (HTTP ${tokenRes.status}, ${discordErrCode})`
      );
      tokenErr.httpStatus = tokenRes.status;
      tokenErr.errorCode = discordErrCode;
      throw tokenErr;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    processingStage = 'DISCORD_USER_PROFILE';
    // Récupération du profil utilisateur Discord réel
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      const profileErr: any = new Error(
        `Impossible de récupérer le profil Discord de l'utilisateur (HTTP ${userRes.status})`
      );
      profileErr.httpStatus = userRes.status;
      profileErr.errorCode = `DISCORD_HTTP_${userRes.status}`;
      throw profileErr;
    }

    const discordUser = (await userRes.json()) as {
      id: string;
      username: string;
      global_name?: string;
      avatar?: string | null;
    };

    const configuredAdminId = c.env.INITIAL_ADMIN_DISCORD_ID?.trim() || '';
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    let user: User;

    // CONTRÔLE STRICT DES ACCÈS PAR PORTAIL
    if (portal === 'admin') {
      processingStage = 'FIRESTORE_ADMIN_ACCESS_CHECK';
      const authCheck = await repo.canAccessAdmin(discordUser.id, configuredAdminId);
      if (!authCheck.authorized) {
        return c.html(`
          <!DOCTYPE html>
          <html>
            <head><title>Accès Refusé — Espace Administration PAWAKO</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
              <div style="background: #1e293b; padding: 36px; border-radius: 16px; border: 1px solid #334155; text-align: center; max-width: 460px;">
                <div style="width: 52px; height: 52px; background: rgba(239, 68, 68, 0.15); color: #f87171; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
                <h3 style="margin: 0 0 8px 0; font-size: 20px;">Accès Refusé — Administration</h3>
                <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; margin: 16px 0; text-align: left; font-size: 12px; line-height: 1.6; color: #cbd5e1;">
                  <div>Compte Discord : <strong>${escapeHtml(discordUser.username)}</strong></div>
                  <div>Discord ID : <code style="color: #38bdf8;">${escapeHtml(discordUser.id)}</code></div>
                  <div style="margin-top: 8px; color: #f87171;">${escapeHtml(authCheck.reason || "Ce compte n est pas accrédité comme Administrateur ou Responsable.")}</div>
                </div>
                <button id="btn-back" style="background: #334155; color: #f8fafc; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
              <script>
                const targetOrigin = ${JSON.stringify(targetOrigin)};
                const loginUrl = ${JSON.stringify(portalLoginUrl)};
                document.getElementById('btn-back').addEventListener('click', function() {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: ${JSON.stringify(authCheck.reason || 'Compte non accrédité Administrateur')} }, targetOrigin);
                    window.close();
                  } else {
                    window.location.href = loginUrl;
                  }
                });
              </script>
            </body>
          </html>
        `, 403);
      }

      processingStage = 'FIRESTORE_USER_UPSERT';
      user = await repo.upsertUser(
        {
          id: discordUser.id,
          username: discordUser.username,
          displayName: discordUser.global_name || discordUser.username,
          avatar: avatarUrl,
        },
        configuredAdminId
      );
    } else {
      // Espace Parrain : inscription ouverte, idempotente, atomique, avec véritable invitation Discord
      // tout en bloquant strictement les profils suspendus ou archivés.
      processingStage = 'FIRESTORE_PARRAIN_REGISTER_OR_LOGIN';
      const effectiveDiscord = await repo.getEffectiveDiscordSettings(
        getDiscordBotConfig(c.env),
        getEnvGuildIds(c.env)
      );
      const parrainAuth = await repo.authenticateOrRegisterParrain({
        discordUser: {
          id: discordUser.id,
          username: discordUser.username,
          displayName: discordUser.global_name || discordUser.username,
          avatar: avatarUrl,
        },
        discordBotConfig: effectiveDiscord.botConfig,
      });

      if (!parrainAuth.authorized || !parrainAuth.user) {
        const denyReason =
          parrainAuth.reason || "L accès à votre espace parrain est actuellement restreint par la Direction.";
        return c.html(`
          <!DOCTYPE html>
          <html>
            <head><title>Accès Restreint — Espace Parrain PAWAKO</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
              <div style="background: white; padding: 36px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 460px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                <div style="width: 52px; height: 52px; background: #fef2f2; color: #dc2626; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
                <h3 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Accès Parrain Refusé</h3>
                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 16px 0; text-align: left; font-size: 12px; line-height: 1.6; color: #334155;">
                  <div>Compte Discord : <strong>${escapeHtml(discordUser.username)}</strong></div>
                  <div>Discord ID : <code style="color: #0284c7;">${escapeHtml(discordUser.id)}</code></div>
                  <div style="margin-top: 8px; color: #dc2626;">${escapeHtml(denyReason)}</div>
                </div>
                <button id="btn-back" style="background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
              <script>
                const targetOrigin = ${JSON.stringify(targetOrigin)};
                const loginUrl = ${JSON.stringify(portalLoginUrl)};
                const errMsg = ${JSON.stringify(denyReason)};
                const errCode = ${JSON.stringify(parrainAuth.errorCode || 'PARRAIN_ACCESS_DENIED')};
                document.getElementById('btn-back').addEventListener('click', function() {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', code: errCode, error: errMsg }, targetOrigin);
                    window.close();
                  } else {
                    window.location.href = loginUrl;
                  }
                });
              </script>
            </body>
          </html>
        `, 403);
      }

      user = parrainAuth.user;
    }

    processingStage = 'SESSION_SIGNING';
    // Génération du jeton de session cryptographique (exige SESSION_SECRET validé)
    const signedToken = await createSignedSessionToken(user.id, user.role, signingSecret);

    // Définition du cookie de session sécurisé
    const sessionCookie = `pawako_session=${signedToken}; Path=/; Secure; SameSite=None; Max-Age=2592000; HttpOnly`;

    return c.html(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Connexion PAWAKO Réussie</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="width: 48px; height: 48px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✓</div>
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Connexion Discord réussie</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">Bienvenue <strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.role)}).</p>
          </div>
          <script>
            try {
              const targetOrigin = ${JSON.stringify(targetOrigin)};
              const payload = {
                type: 'OAUTH_AUTH_SUCCESS',
                portal: ${JSON.stringify(portal)},
                role: ${JSON.stringify(user.role)},
                userId: ${JSON.stringify(user.id)}
              };
              const redirectUrl = ${JSON.stringify(portalDestUrl)};
              if (window.opener) {
                window.opener.postMessage(payload, targetOrigin);
                window.close();
              } else {
                window.location.replace(redirectUrl);
              }
            } catch (e) {
              window.location.replace(${JSON.stringify(portalDestUrl)});
            }
          </script>
        </body>
      </html>
    `,
      200,
      {
        'Set-Cookie': sessionCookie,
      }
    );
  } catch (err: any) {
    const isFsErr = err instanceof FirestoreRestError;
    const safeCategory = isFsErr ? err.category : processingStage;
    const safeOperation = isFsErr ? err.operation : null;
    const safeStatus = isFsErr ? (err.status ?? null) : (typeof err?.httpStatus === 'number' ? err.httpStatus : null);
    const safeCode = isFsErr
      ? (err.firestoreStatus || err.category)
      : (typeof err?.errorCode === 'string' ? err.errorCode : null);

    const safeDiagnosticLine = [
      safeCategory,
      safeOperation,
      safeStatus ? `HTTP ${safeStatus}` : null,
      safeCode ? `(${safeCode})` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    console.error('[OAuth2 Callback][PROCESSING_ERROR]', {
      portal,
      processingStage,
      isFirestoreError: isFsErr,
      firestoreCategory: isFsErr ? err.category : null,
      status: safeStatus,
      errorCode: safeCode,
      message: err?.message || 'Erreur inconnue lors du callback Discord',
    });
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur de connexion Discord</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; max-width: 480px;">
            <h3 style="color: #991b1b; margin-top: 0;">Erreur d authentification</h3>
            <p style="color: #7f1d1d; font-size: 14px;">Une erreur est survenue lors de l authentification Discord. Veuillez réessayer.</p>
            <p style="color: #991b1b; font-size: 11px; margin-top: 8px; font-family: monospace;">Diagnostic : ${escapeHtml(safeDiagnosticLine)}</p>
            <button id="btn-close" style="background: #e11d48; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">Fermer</button>
          </div>
          <script>
            const loginUrl = ${JSON.stringify(portalLoginUrl)};
            document.getElementById('btn-close').addEventListener('click', function() {
              if (window.opener) {
                window.close();
              } else {
                window.location.href = loginUrl;
              }
            });
          </script>
        </body>
      </html>
    `, 500);
  }
};

app.get('/auth/callback', handleAuthCallback);
app.get('/auth/callback/', handleAuthCallback);

app.get('/api/auth/me', async c => {
  const repo = getRepository(c.env);

  let hasValidSecret = false;
  let secret = '';
  try {
    secret = getValidatedSessionSecret(c.env);
    hasValidSecret = true;
  } catch {
    hasValidSecret = false;
  }

  const isOAuthConfigured = Boolean(
    c.env.DISCORD_CLIENT_ID?.trim() && c.env.DISCORD_CLIENT_SECRET?.trim() && hasValidSecret
  );
  const isBotConfigured = Boolean(c.env.DISCORD_BOT_TOKEN?.trim() || c.env.JARVIS_WEBHOOK_SECRET?.trim());

  // Vérification cryptographique du cookie AVANT toute requête Firestore
  let verifiedUserId: string | null = null;
  let verifiedRole: UserRole | null = null;
  if (hasValidSecret) {
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(/(?:^|;\s*)pawako_session=([^;]+)/);
    const token = match ? match[1].trim() : null;
    if (token) {
      const verification = await verifySignedSessionToken(token, secret);
      if (verification.valid && verification.payload) {
        verifiedUserId = verification.payload.userId;
        verifiedRole = verification.payload.role as UserRole;
      }
    }
  }

  if (!verifiedUserId) {
    const isClaimed = await repo.isInitialAdminClaimed().catch(() => false);
    return c.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured,
      isBotConfigured,
      hasAnyUsers: false,
      isInitialAdminClaimed: isClaimed,
    });
  }

  const [user, isClaimed, referrer] = await Promise.all([
    repo.getUserById(verifiedUserId).catch(() => null),
    repo.isInitialAdminClaimed().catch(() => false),
    verifiedRole === 'PARRAIN'
      ? repo.getReferrerByDiscordUserId(verifiedUserId).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!user || user.status !== 'ACTIVE') {
    return c.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured,
      isBotConfigured,
      hasAnyUsers: false,
      isInitialAdminClaimed: isClaimed,
    });
  }

  if (user.role === 'PARRAIN' && (!referrer || getEffectiveReferrerStatus(referrer) !== 'ACTIVE')) {
    return c.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured,
      isBotConfigured,
      hasAnyUsers: true,
      isInitialAdminClaimed: isClaimed,
    });
  }

  const safeReferrer =
    referrer && user.role === 'PARRAIN' ? { ...referrer, notes: undefined } : referrer || null;

  return c.json({
    authenticated: true,
    user,
    referrer: safeReferrer,
    isOAuthConfigured,
    isBotConfigured,
    hasAnyUsers: true,
    isInitialAdminClaimed: isClaimed,
  });
});

app.post('/api/auth/logout', c => {
  return c.json({ success: true, message: 'Déconnexion effectuée' }, 200, {
    'Set-Cookie': 'pawako_session=; Path=/; Secure; SameSite=None; Max-Age=0; HttpOnly',
  });
});

// -----------------------------------------------------------------------------
// 6. STATISTIQUES GLOBALES & ESPACE PARRAIN (RBAC ET LISTE BLANCHE STRICTS)
// -----------------------------------------------------------------------------

app.get('/api/admin/bootstrap', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  let hasValidSecret = false;
  try {
    getValidatedSessionSecret(c.env);
    hasValidSecret = true;
  } catch {
    hasValidSecret = false;
  }

  const guildIds = {
    RECRUTEMENT: c.env.DISCORD_RECRUITMENT_GUILD_ID || '',
    FORMATION: c.env.DISCORD_FORMATION_GUILD_ID || '',
    PRODUCTION_CHATTING: c.env.DISCORD_CHATTING_PRODUCTION_GUILD_ID || '',
    PRODUCTION_INSTAGRAM: c.env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID || '',
  };

  const bootstrap = await repo.getAdminBootstrapData(guildIds);

  return c.json({
    authenticated: true,
    user,
    referrer: null,
    isOAuthConfigured: Boolean(
      c.env.DISCORD_CLIENT_ID?.trim() && c.env.DISCORD_CLIENT_SECRET?.trim() && hasValidSecret
    ),
    isBotConfigured: Boolean(c.env.DISCORD_BOT_TOKEN?.trim() || c.env.JARVIS_WEBHOOK_SECRET?.trim()),
    isInitialAdminClaimed: bootstrap.isInitialAdminClaimed,
    stats: bootstrap.stats,
    referrers: bootstrap.referrers,
  });
});

app.get('/api/stats/overview', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  // Réservé explicitement aux Administrateurs et Responsables
  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  const guildIds = {
    RECRUTEMENT: c.env.DISCORD_RECRUITMENT_GUILD_ID || '',
    FORMATION: c.env.DISCORD_FORMATION_GUILD_ID || '',
    PRODUCTION_CHATTING: c.env.DISCORD_CHATTING_PRODUCTION_GUILD_ID || '',
    PRODUCTION_INSTAGRAM: c.env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID || '',
  };

  const stats = await repo.getOverviewStats(guildIds);
  return c.json(stats);
});

app.get('/api/parrain/dashboard', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  // Le dashboard Parrain est réservé au rôle PARRAIN (ou ADMINISTRATEUR)
  if (user.role !== 'PARRAIN' && user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Parrains autorisés.' }, 403);
  }

  try {
    const dashboard = await repo.getParrainDashboard(user.id);
    // Retrait des notes internes admin de la fiche parrain pour le portail parrain
    const safeReferrer = { ...dashboard.referrer, notes: undefined };
    const safeCandidates = (dashboard.candidates || []).map(toParrainCandidateView);
    return c.json({
      ...dashboard,
      referrer: safeReferrer,
      candidates: safeCandidates,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, err?.status === 403 ? 403 : 404);
  }
});

app.post('/api/parrain/invite/ensure', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'PARRAIN' && user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Parrains autorisés.' }, 403);
  }

  try {
    const effectiveDiscord = await repo.getEffectiveDiscordSettings(
      getDiscordBotConfig(c.env),
      getEnvGuildIds(c.env)
    );
    const result = await repo.ensureParrainInvite(user.id, effectiveDiscord.botConfig);
    if (!result) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }
    return c.json({
      success: result.ok,
      referrer: { ...result.referrer, notes: undefined },
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Impossible de générer ou vérifier le lien Discord.' }, 403);
  }
});

// -----------------------------------------------------------------------------
// 7. CANDIDATS & RECRUTEMENT
// -----------------------------------------------------------------------------

app.get('/api/candidates', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE' && user.role !== 'PARRAIN') {
    return c.json({ error: 'Rôle utilisateur non autorisé.' }, 403);
  }

  const isParrainOnly = user.role === 'PARRAIN';
  if (isParrainOnly) {
    const myRef = await repo.getReferrerByDiscordUserId(user.id);
    if (!myRef || getEffectiveReferrerStatus(myRef) !== 'ACTIVE') {
      return c.json({ error: 'Votre profil parrain est inactif, suspendu ou archivé.' }, 403);
    }
  }

  const search = c.req.query('search');
  const vaType = c.req.query('vaType') as VAType | 'ALL' | undefined;
  const adminStatus = c.req.query('adminStatus') as AdminStatus | 'ALL' | undefined;
  const operationalStatus = c.req.query('operationalStatus') as OperationalStatus | 'ALL' | undefined;
  const status = c.req.query('status') as CandidateStatus | 'ALL' | undefined;
  const attributionStatus = c.req.query('attributionStatus');
  const referrerId = isParrainOnly ? undefined : c.req.query('referrerId');
  const server = c.req.query('server');
  const hasAnomalyParam = c.req.query('hasAnomaly');
  const hasAnomaly =
    hasAnomalyParam === 'true' ? true : hasAnomalyParam === 'false' ? false : undefined;
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const result = await repo.getCandidates({
    search,
    vaType,
    adminStatus,
    operationalStatus,
    status,
    attributionStatus,
    referrerId,
    server,
    hasAnomaly,
    referrerDiscordUserId: isParrainOnly ? user.id : undefined,
    page,
    limit,
  });

  if (isParrainOnly) {
    return c.json({
      candidates: result.candidates.map(toParrainCandidateView),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      pageSize: result.pageSize,
    });
  }

  return c.json(result);
});

app.get('/api/candidates/:id', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE' && user.role !== 'PARRAIN') {
    return c.json({ error: 'Rôle utilisateur non autorisé.' }, 403);
  }

  const candidate = await repo.getCandidateById(c.req.param('id'));
  if (!candidate) {
    return c.json({ error: 'Candidat introuvable' }, 404);
  }

  if (user.role === 'PARRAIN') {
    const myRef = await repo.getReferrerByDiscordUserId(user.id);
    if (!myRef || getEffectiveReferrerStatus(myRef) !== 'ACTIVE') {
      return c.json({ error: 'Profil parrain suspendu ou archivé.' }, 403);
    }
    const isOwnedByParrain =
      candidate.referrerDiscordUserId === user.id || candidate.referrerId === myRef.id;
    if (!isOwnedByParrain) {
      return c.json({ error: 'Accès refusé. Ce candidat n est pas l un de vos filleuls.' }, 403);
    }
  }

  const [statusHistory, attributionHistory] = await Promise.all([
    repo.getStatusHistoryForCandidate(candidate.id),
    user.role === 'PARRAIN' ? Promise.resolve([]) : repo.getReferralAttributionsHistory(candidate.id),
  ]);

  if (user.role === 'PARRAIN') {
    const sanitizedHistory = statusHistory
      .filter(h => !h.isConfidential && h.toAdminStatus !== 'REFUSE' && h.toStatus !== 'REFUSE')
      .map(h => ({
        id: h.id,
        candidateId: h.candidateId,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        toAdminStatus: h.toAdminStatus,
        toOperationalStatus: h.toOperationalStatus,
        fromServer: h.fromServer,
        toServer: h.toServer,
        authorUserId: 'SYSTEM',
        authorName: 'Système PAWAKO',
        authorSource: h.authorSource,
        reason: h.authorSource === 'DISCORD_SYNC' || h.authorSource === 'JARVIS_GATEWAY' ? h.reason : null,
        isConfidential: false,
        timestamp: h.timestamp,
      }));

    return c.json({
      candidate: toParrainCandidateView(candidate),
      statusHistory: sanitizedHistory,
      attributionHistory: [],
      history: sanitizedHistory,
    });
  }

  return c.json({
    candidate,
    statusHistory,
    attributionHistory,
    history: statusHistory,
  });
});

app.post('/api/candidates', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  const body = await c.req.json();
  const { discordUserId, username, displayName, vaType, inviteCodeUsed } = body;

  if (!discordUserId || !username || !vaType) {
    return c.json({ error: 'discordUserId, username et vaType sont requis' }, 400);
  }

  const candidate = await repo.createCandidate({
    discordUserId,
    username,
    displayName,
    vaType,
    inviteCodeUsed,
    actorUserId: user.id,
    actorName: user.displayName,
  });

  return c.json({ success: true, candidate }, 201);
});

app.patch('/api/candidates/:id/status', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  const body = await c.req.json();
  const { newAdminStatus, newOperationalStatus, newStatus, notes, refusalReason, isConfidential } = body;

  if (!newAdminStatus && !newOperationalStatus && !newStatus) {
    return c.json(
      { error: 'Un nouveau statut (newStatus, newAdminStatus ou newOperationalStatus) est requis.' },
      400
    );
  }

  const effectiveNotes =
    (typeof notes === 'string' && notes.trim()) ||
    (typeof refusalReason === 'string' && refusalReason.trim()) ||
    '';

  if (!effectiveNotes) {
    return c.json({ error: 'Un motif d audit tracé (notes ou motif de refus) est strictement obligatoire.' }, 400);
  }

  try {
    const updated = await repo.updateCandidateStatus(c.req.param('id'), {
      newAdminStatus,
      newOperationalStatus,
      newStatus,
      notes: effectiveNotes,
      refusalReason,
      isConfidential: Boolean(isConfidential),
      actorUserId: user.id,
      actorName: user.displayName,
      actorSource: user.role === 'ADMINISTRATEUR' ? 'MANUAL_ADMIN' : 'MANUAL_RESPONSABLE',
    });

    if (!updated) {
      return c.json({ error: 'Candidat introuvable' }, 404);
    }

    return c.json({ success: true, candidate: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.patch('/api/candidates/:id/va-type', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  const body = await c.req.json();
  const { newVaType, reason } = body;

  if (newVaType !== 'CHATTEUR' && newVaType !== 'INSTAGRAM') {
    return c.json({ error: 'Activité invalide (CHATTEUR ou INSTAGRAM attendu).' }, 400);
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return c.json({ error: 'Un motif explicite est obligatoire pour modifier l activité.' }, 400);
  }

  try {
    const updated = await repo.updateCandidateVAType(c.req.param('id'), {
      newVaType,
      reason: reason.trim(),
      actorUserId: user.id,
      actorName: user.displayName,
    });
    if (!updated) {
      return c.json({ error: 'Candidat introuvable' }, 404);
    }
    return c.json({ success: true, candidate: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.post('/api/candidates/:id/clear-anomaly', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const resolutionNotes = typeof body?.resolutionNotes === 'string' ? body.resolutionNotes.trim() : '';

  const updated = await repo.clearCandidateAnomaly(
    c.req.param('id'),
    user.id,
    user.displayName,
    resolutionNotes
  );
  if (!updated) {
    return c.json({ error: 'Candidat introuvable' }, 404);
  }
  return c.json({ success: true, candidate: updated });
});

const handleReassignReferrer = async (c: any) => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent réattribuer un parrain.' }, 403);
  }

  const body = await c.req.json();
  const { newReferrerId, reason } = body;

  if (!newReferrerId || !reason || !String(reason).trim()) {
    return c.json({ error: 'newReferrerId et reason obligatoires' }, 400);
  }

  try {
    const updated = await repo.reassignReferrer(c.req.param('id'), {
      newReferrerId,
      reason: String(reason).trim(),
      actorUserId: user.id,
      actorName: user.displayName,
    });
    if (!updated) {
      return c.json({ error: 'Candidat introuvable' }, 404);
    }
    return c.json({ success: true, candidate: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
};

app.patch('/api/candidates/:id/referrer', handleReassignReferrer);
app.post('/api/candidates/:id/reassign', handleReassignReferrer);

// -----------------------------------------------------------------------------
// 8. GESTION COMPLÈTE DES PARRAINS
// -----------------------------------------------------------------------------

app.get('/api/referrers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Accès non autorisé. Session requise.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE' && user.role !== 'PARRAIN') {
    return c.json({ error: 'Rôle utilisateur non autorisé.' }, 403);
  }

  if (user.role === 'PARRAIN') {
    const myReferrer = await repo.getReferrerByDiscordUserId(user.id);
    if (!myReferrer || getEffectiveReferrerStatus(myReferrer) !== 'ACTIVE') {
      return c.json({ error: 'Votre profil parrain est suspendu ou archivé.' }, 403);
    }
    return c.json({ referrers: [{ ...myReferrer, notes: undefined }] });
  }

  const statusParam = c.req.query('status') as ReferrerStatus | 'ALL' | undefined;
  const search = c.req.query('search');
  const referrers = await repo.getReferrersWithStats({
    status: statusParam || 'ALL',
    search,
  });
  return c.json({ referrers });
});

app.get('/api/referrers/:id', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé exclusivement à la Direction et aux Responsables.' }, 403);
  }

  const details = await repo.getReferrerDetails(c.req.param('id'));
  if (!details) {
    return c.json({ error: 'Profil parrain introuvable.' }, 404);
  }

  return c.json(details);
});

app.post('/api/referrers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const rawIdentifier =
    (typeof body.discordUserId === 'string' && body.discordUserId.trim()) ||
    (typeof body.identifier === 'string' && body.identifier.trim()) ||
    '';

  if (!rawIdentifier) {
    return c.json({ error: 'Discord User ID ou @nom_utilisateur requis.' }, 400);
  }

  try {
    const effectiveDiscord = await repo.getEffectiveDiscordSettings(
      getDiscordBotConfig(c.env),
      getEnvGuildIds(c.env)
    );
    const referrer = await repo.createReferrer({
      discordUserId: rawIdentifier,
      inviteCode: typeof body.inviteCode === 'string' ? body.inviteCode : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      actorUserId: user.id,
      actorName: user.displayName,
      discordBotConfig: effectiveDiscord.botConfig,
      guildIds: Object.values(effectiveDiscord.guildIds).filter(Boolean),
    });

    return c.json({ success: true, referrer }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || 'Impossible de créer le parrain.' }, 400);
  }
});

app.post('/api/referrers/sync-discord', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent synchroniser les noms Discord.' }, 403);
  }

  try {
    const result = await repo.syncAllReferrersDiscordProfiles({
      discordBotConfig: getDiscordBotConfig(c.env),
      actor: { id: user.id, displayName: user.displayName },
    });
    return c.json({ success: true, ...result });
  } catch (err: any) {
    if (err instanceof FirestoreRestError) throw err;
    return c.json({ error: err?.message || 'Impossible de synchroniser les profils Discord.' }, 400);
  }
});

app.post('/api/referrers/:id/sync-discord', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent synchroniser ce profil Discord.' }, 403);
  }

  try {
    const result = await repo.syncReferrerDiscordProfile(c.req.param('id'), {
      discordBotConfig: getDiscordBotConfig(c.env),
      actor: { id: user.id, displayName: user.displayName },
    });
    if (!result) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }
    return c.json({
      success: !result.errorMessage,
      updated: result.updated,
      referrer: result.referrer,
      errorMessage: result.errorMessage || null,
    });
  } catch (err: any) {
    if (err instanceof FirestoreRestError) throw err;
    return c.json({ error: err?.message || 'Impossible de synchroniser ce profil Discord.' }, 400);
  }
});

app.patch('/api/referrers/:id', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent modifier un profil parrain.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  try {
    const updated = await repo.updateReferrer(
      c.req.param('id'),
      {
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        discordDisplayName:
          typeof body.discordDisplayName === 'string' ? body.discordDisplayName : undefined,
        discordUsername: typeof body.discordUsername === 'string' ? body.discordUsername : undefined,
      },
      { id: user.id, displayName: user.displayName }
    );

    if (!updated) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }

    return c.json({ success: true, referrer: updated });
  } catch (err: any) {
    if (err instanceof FirestoreRestError) {
      if (err.isPreconditionConflict) {
        return c.json(
          { error: 'Conflit concurrent lors de la mise à jour du parrain. Réessayez.' },
          409
        );
      }
      throw err;
    }
    return c.json({ error: err?.message || 'Impossible de mettre à jour ce profil parrain.' }, 400);
  }
});

app.patch('/api/referrers/:id/toggle', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé aux Administrateurs' }, 403);
  }

  try {
    const referrer = await repo.toggleReferrer(c.req.param('id'), user.id, user.displayName);
    if (!referrer) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }
    return c.json({ success: true, referrer });
  } catch (err: any) {
    if (err instanceof FirestoreRestError && !err.isPreconditionConflict) {
      throw err;
    }
    return c.json({ error: err.message }, err instanceof FirestoreRestError ? 409 : 400);
  }
});

const handleReferrerStatusRoute = (targetStatus: ReferrerStatus) => async (c: any) => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent gérer le cycle de vie d un parrain.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;

  try {
    const updated = await repo.setReferrerStatus(c.req.param('id'), targetStatus, reason, {
      id: user.id,
      displayName: user.displayName,
    });

    if (!updated) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }

    return c.json({ success: true, referrer: updated });
  } catch (err: any) {
    if (err instanceof FirestoreRestError) {
      if (err.isPreconditionConflict) {
        return c.json(
          { error: 'Conflit concurrent lors du changement de statut. Actualisez et réessayez.' },
          409
        );
      }
      throw err;
    }
    return c.json({ error: err?.message || 'Impossible de modifier le statut de ce parrain.' }, 400);
  }
};

app.post('/api/referrers/:id/activate', handleReferrerStatusRoute('ACTIVE'));
app.post('/api/referrers/:id/suspend', handleReferrerStatusRoute('SUSPENDED'));
app.post('/api/referrers/:id/reactivate', handleReferrerStatusRoute('ACTIVE'));
app.post('/api/referrers/:id/archive', handleReferrerStatusRoute('ARCHIVED'));
app.post('/api/referrers/:id/restore', handleReferrerStatusRoute('ACTIVE'));

app.post('/api/referrers/:id/invite/regenerate', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent régénérer un lien Discord.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const manualInviteCode =
    typeof body?.manualInviteCode === 'string' ? body.manualInviteCode.trim() : undefined;

  try {
    const effectiveDiscord = await repo.getEffectiveDiscordSettings(
      getDiscordBotConfig(c.env),
      getEnvGuildIds(c.env)
    );
    const result = await repo.regenerateReferrerInvite(c.req.param('id'), {
      discordBotConfig: effectiveDiscord.botConfig,
      manualInviteCode,
      actorUserId: user.id,
      actorName: user.displayName,
    });

    if (!result) {
      return c.json({ error: 'Profil parrain introuvable.' }, 404);
    }

    return c.json({
      success: result.ok,
      referrer: result.referrer,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.delete('/api/referrers/:id', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent supprimer un profil parrain.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const confirm = c.req.query('confirm') === 'true' || body?.confirm === true;
  const force = c.req.query('force') === 'true' || body?.force === true;

  try {
    const result = await repo.deleteReferrerPhysically(
      c.req.param('id'),
      confirm,
      {
        id: user.id,
        displayName: user.displayName,
      },
      getDiscordBotConfig(c.env),
      { force }
    );
    return c.json({
      success: result.deleted,
      summary: result.summary,
      detachedCandidatesCount: result.detachedCandidatesCount || 0,
      cleanedHistoryCount: result.cleanedHistoryCount || 0,
    });
  } catch (err: any) {
    if (err instanceof FirestoreRestError && !err.isPreconditionConflict) {
      throw err;
    }
    const status = err?.status === 409 || err?.isPreconditionConflict ? 409 : 400;
    return c.json(
      {
        error: err.message,
        dependencies: err?.dependencies || null,
      },
      status
    );
  }
});

// -----------------------------------------------------------------------------
// 9. SERVEURS DISCORD, ROLE MAPPINGS & BOT JARVIS WEBHOOK
// -----------------------------------------------------------------------------

app.get('/api/discord/servers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
  }

  const servers = await repo.getDiscordServers(getEnvGuildIds(c.env));
  return c.json({ servers });
});

app.put('/api/discord/servers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent associer les serveurs Discord.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const bindings = Array.isArray(body?.bindings) ? body.bindings : null;
  if (!bindings) {
    return c.json({ error: 'Tableau bindings requis.' }, 400);
  }

  const validBindings = bindings.filter(
    (b: any) =>
      b &&
      ['RECRUTEMENT', 'FORMATION', 'PRODUCTION_CHATTING', 'PRODUCTION_INSTAGRAM'].includes(b.id)
  );

  const servers = await repo.updateServerBindings({
    bindings: validBindings,
    actorUserId: user.id,
    actorName: user.displayName,
    envGuildIds: getEnvGuildIds(c.env),
  });

  return c.json({ success: true, servers });
});

app.get('/api/discord/bot/discover', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
  }

  const envGuildIds = getEnvGuildIds(c.env);
  const savedServers = await repo.getDiscordServers(envGuildIds);
  const redirectUri = getDiscordRedirectUri(c.env, c.req.url);
  let botInstallState: string | undefined;
  try {
    botInstallState = await generateBotInstallState(getValidatedSessionSecret(c.env));
  } catch {
    botInstallState = undefined;
  }

  const full = await discoverDiscordBotEnvironment({
    botToken: c.env.DISCORD_BOT_TOKEN?.trim(),
    clientId: c.env.DISCORD_CLIENT_ID?.trim(),
    redirectUri,
    botInstallState,
    envGuildIds,
    savedServers,
    includeMembers: false,
  });

  const { guildMembersByGuildId: _ignored, ...publicDiscovery } = full;
  return c.json(publicDiscovery);
});

app.post('/api/discord/bot/auto-configure', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent lancer l auto-détection complète du bot.' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const redirectUri = getDiscordRedirectUri(c.env, c.req.url);
  let botInstallState: string | undefined;
  try {
    botInstallState = await generateBotInstallState(getValidatedSessionSecret(c.env));
  } catch {
    botInstallState = undefined;
  }

  const result = await repo.autoConfigureFromDiscordBot({
    botToken: c.env.DISCORD_BOT_TOKEN?.trim(),
    clientId: c.env.DISCORD_CLIENT_ID?.trim(),
    redirectUri,
    botInstallState,
    envGuildIds: getEnvGuildIds(c.env),
    overwriteExisting: Boolean(body?.overwriteExisting),
    syncInvites: body?.syncInvites !== false,
    syncMembers: body?.syncMembers !== false,
    actor: { id: user.id, displayName: user.displayName },
  });

  return c.json(result, result.ok ? 200 : 400);
});

app.get('/api/discord/role-mappings', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé aux Responsables et Administrateurs' }, 403);
  }

  const mappings = await repo.getRoleMappings();
  return c.json({ mappings });
});

app.put('/api/discord/role-mappings', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Seuls les Administrateurs peuvent modifier les correspondances de rôles' }, 403);
  }

  const body = await c.req.json();
  const { mappings } = body;

  if (!Array.isArray(mappings)) {
    return c.json({ error: 'Tableau mappings requis' }, 400);
  }

  const updated = await repo.updateRoleMappings(mappings, user.id, user.displayName);
  return c.json({ success: true, mappings: updated });
});

app.post('/api/discord/sync-members', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR' && user.role !== 'RESPONSABLE') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const serverId = body?.serverId as DiscordServerType | undefined;
  const members = body?.members;

  if (!serverId || !['RECRUTEMENT', 'FORMATION', 'PRODUCTION_CHATTING', 'PRODUCTION_INSTAGRAM'].includes(serverId)) {
    return c.json({ error: 'serverId Discord PAWAKO valide requis.' }, 400);
  }
  if (!Array.isArray(members)) {
    return c.json({ error: 'Tableau members requis.' }, 400);
  }

  const effective = await repo.getEffectiveDiscordSettings(getDiscordBotConfig(c.env), getEnvGuildIds(c.env));
  const result = await repo.syncServerMembers({
    serverId,
    members,
    actorUserId: user.id,
    actorName: user.displayName,
    envGuildIds: effective.guildIds,
  });

  return c.json({ success: true, ...result });
});

app.post('/api/discord/webhook', async c => {
  // 1. Authentification sécurisée du Bot JARVIS via secret partagé (temps constant)
  const expectedSecret = (c.env.JARVIS_WEBHOOK_SECRET || '').trim();
  const receivedSecret = (c.req.header('X-JARVIS-Secret') || '').trim();

  if (!expectedSecret || !receivedSecret || !constantTimeEqual(receivedSecret, expectedSecret)) {
    return c.json({ error: 'Secret JARVIS invalide ou manquant. Requête non autorisée.' }, 401);
  }

  const payload = await c.req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return c.json({ error: 'Corps de requête JSON manquant ou invalide.' }, 400);
  }

  const { eventType, guildId, user, roles, inviteCode, channelId, inviterId, vaType, timestamp } = payload;

  // 2. Protection contre les attaques par rejeu : exige systématiquement timestamp et eventId
  const timestampHeader =
    c.req.header('X-JARVIS-Timestamp') || (timestamp ? String(timestamp) : null);
  const nonceHeader =
    c.req.header('X-JARVIS-Nonce') || (payload.eventId ? String(payload.eventId) : null);

  const replayValidation = validateWebhookTimestampAndEventId(timestampHeader, nonceHeader);
  if (!replayValidation.valid || !replayValidation.eventId) {
    return c.json({ error: replayValidation.reason }, 400);
  }

  const eventId = replayValidation.eventId;

  // 3. Validation stricte du schéma métier
  const supportedEvents = [
    'GUILD_MEMBER_ADD',
    'GUILD_MEMBER_REMOVE',
    'GUILD_MEMBER_UPDATE',
    'INVITE_CREATE',
    'INVITE_DELETE',
    'MEMBER_SYNC',
  ];

  if (!eventType || typeof eventType !== 'string' || !supportedEvents.includes(eventType)) {
    return c.json({ error: 'eventType Discord non supporté ou manquant.' }, 400);
  }

  if (!guildId || !/^\d{17,20}$/.test(String(guildId))) {
    return c.json({ error: 'Identifiant Discord (guildId) invalide ou manquant.' }, 400);
  }

  const isInviteEvent = eventType === 'INVITE_CREATE' || eventType === 'INVITE_DELETE';
  if (isInviteEvent) {
    if (!inviteCode || typeof inviteCode !== 'string' || inviteCode.trim().length < 2) {
      return c.json({ error: 'inviteCode requis pour les événements INVITE_CREATE / INVITE_DELETE.' }, 400);
    }
  } else {
    if (!user?.id || !/^\d{17,20}$/.test(String(user.id))) {
      return c.json({ error: 'Payload d événement Discord incomplet : user.id Snowflake valide requis.' }, 400);
    }
  }

  const repo = getRepository(c.env);

  // 4. Verrouillage atomique distribué dans Firestore avec identifiant propriétaire unique
  const ownerId = crypto.randomUUID();
  const lock = await repo.lockWebhookEvent(eventId, ownerId, 60000);
  if (!lock.acquired) {
    return c.json({ error: lock.reason || 'Événement webhook déjà traité ou en cours (anti-rejeu).' }, 409);
  }

  try {
    const result = await repo.processDiscordGatewayEvent({
      eventId,
      eventType: eventType as any,
      guildId: String(guildId),
      user,
      roles: Array.isArray(roles) ? roles : undefined,
      inviteCode: typeof inviteCode === 'string' ? inviteCode : null,
      channelId: typeof channelId === 'string' ? channelId : null,
      inviterId: typeof inviterId === 'string' ? inviterId : null,
      vaType,
      timestamp: timestamp ? String(timestamp) : undefined,
      envGuildIds: getEnvGuildIds(c.env),
    });

    const finalized = await repo.completeWebhookEvent(eventId, ownerId, {
      eventType,
      guildId,
      userId: user?.id || null,
      inviteCode: inviteCode || null,
    });

    if (!finalized) {
      await repo.releaseWebhookEvent(eventId, ownerId);
      return c.json({ error: 'Échec de la confirmation de finalisation du verrou webhook.' }, 500);
    }

    return c.json(result);
  } catch (err: any) {
    try {
      await repo.releaseWebhookEvent(eventId, ownerId);
    } catch {}
    return c.json({ error: err?.message || 'Erreur lors du traitement interne de l événement.' }, 500);
  }
});

// -----------------------------------------------------------------------------
// 10. UTILISATEURS, DIAGNOSTIC FIRESTORE ADMIN & AUDIT LOGS
// -----------------------------------------------------------------------------

app.get('/api/admin/firestore/status', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const diag = await runFirestoreRootCollectionDiagnostic(c.env);
  return c.json({
    isConfigured: Boolean((c.env.FIREBASE_CLIENT_EMAIL || '').trim() && (c.env.FIREBASE_PRIVATE_KEY || '').trim()),
    isConnected: diag.ok,
    projectId: diag.projectId,
    databaseId: diag.databaseId,
    clientEmail: (c.env.FIREBASE_CLIENT_EMAIL || '').trim() || null,
    storageMode: 'firestore',
    error: diag.ok ? null : diag.message,
    diagnostic: diag,
  });
});

app.get('/api/users', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const users = await repo.getUsers();
  return c.json({ users });
});

app.patch('/api/users/:id/role', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const body = await c.req.json();
  const { newRole } = body;

  if (!newRole || !['ADMINISTRATEUR', 'RESPONSABLE', 'PARRAIN'].includes(newRole)) {
    return c.json({ error: 'Rôle invalide' }, 400);
  }

  try {
    const updated = await repo.updateUserRole(c.req.param('id'), newRole as UserRole, user.id, user.displayName);
    if (!updated) {
      return c.json({ error: 'Utilisateur introuvable' }, 404);
    }
    return c.json({ success: true, user: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.patch('/api/users/:id/status', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const body = await c.req.json();
  const { newStatus } = body;

  if (!newStatus || !['ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL'].includes(newStatus)) {
    return c.json({ error: 'Statut invalide (ACTIVE, SUSPENDED, PENDING_APPROVAL attendu)' }, 400);
  }

  try {
    const updated = await repo.updateUserStatus(
      c.req.param('id'),
      newStatus as UserStatus,
      user.id,
      user.displayName
    );
    if (!updated) {
      return c.json({ error: 'Utilisateur introuvable' }, 404);
    }
    return c.json({ success: true, user: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

app.get('/api/audit-logs', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée.' }, 401);
  }

  if (user.role !== 'ADMINISTRATEUR') {
    return c.json({ error: 'Accès réservé exclusivement aux Administrateurs' }, 403);
  }

  const limit = Math.min(200, parseInt(c.req.query('limit') || '50', 10));
  const auditLogs = await repo.getAuditLogs(limit);
  return c.json({ auditLogs });
});

export default app;
