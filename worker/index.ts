/**
 * PAWAKO Referral Manager — Cloudflare Worker API Backend (pawako-api)
 * Déployable sur l'offre gratuite Cloudflare Workers (workers.dev)
 * Persistance stricte sur Cloud Firestore via REST API
 * Sécurité durcie : Zéro secret par défaut, CORS strict, Webhooks anti-rejeu atomiques,
 * Protection du dernier administrateur, Réponses OAuth sans fuite d'information.
 */

import { Hono } from 'hono';
import { FirestoreRestClient } from '../server/firestoreRest';
import { FirestoreRepository } from '../server/firestoreRepository';
import {
  AdminStatus,
  Candidate,
  CandidateStatus,
  DiscordServerType,
  OperationalStatus,
  PawakoRoleType,
  User,
  UserRole,
  UserStatus,
  VAType,
} from '../server/types';
import {
  generateSecureOAuthState,
  verifyAndConsumeOAuthState,
  createSignedSessionToken,
  verifySignedSessionToken,
  validateWebhookTimestampAndEventId,
} from '../server/cryptoUtils';

export interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  FRONTEND_URL?: string;
  INITIAL_ADMIN_DISCORD_ID?: string;
  PAWAKO_INITIAL_ADMIN_DISCORD_ID?: string;
  JARVIS_WEBHOOK_SECRET?: string;
  DISCORD_BOT_WEBHOOK_SECRET?: string;
  SESSION_SECRET?: string;
  DISCORD_RECRUITMENT_GUILD_ID?: string;
  DISCORD_FORMATION_GUILD_ID?: string;
  DISCORD_CHATTING_PRODUCTION_GUILD_ID?: string;
  DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID?: string;
  ENVIRONMENT?: string;
  NODE_ENV?: string;
}

const app = new Hono<{ Bindings: Env }>();

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

// Helper pour initialiser le repository Firestore depuis l'environnement du Worker
function getRepository(env: Env): FirestoreRepository {
  const projectId = env.FIREBASE_PROJECT_ID?.trim() || 'gen-lang-client-0255826431';
  const databaseId = env.FIREBASE_DATABASE_ID?.trim() || 'ai-studio-pawakoreferralma-1d4a1a22-a715-4552-b717-2e03e349fbee';
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = env.FIREBASE_PRIVATE_KEY?.trim();

  if (privateKey && privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const restClient = new FirestoreRestClient({
    projectId,
    databaseId,
    clientEmail,
    privateKey,
  });

  return new FirestoreRepository(restClient);
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

// -----------------------------------------------------------------------------
// 2. CONFIGURATION CORS STRICTE (RESTRICTION AUX SEULES ORIGINES AUTORISÉES)
// -----------------------------------------------------------------------------

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');

  // Si aucune en-tête Origin n'est fournie (requête server-to-server, webhook, curl direct sans Origin)
  if (!origin) {
    return next();
  }

  const frontendUrl = (c.env.FRONTEND_URL || '').trim();
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

  // Vérification explicite du mode développement
  const isDevelopment = c.env.ENVIRONMENT === 'development' || c.env.NODE_ENV === 'development';

  let isAllowedOrigin = false;
  if (isDevelopment) {
    const isLocalhost =
      origin === 'http://localhost:3000' ||
      origin === 'http://127.0.0.1:3000' ||
      origin === 'http://localhost:5173' ||
      origin === 'http://127.0.0.1:5173';
    isAllowedOrigin = isLocalhost || Boolean(configuredFrontendOrigin && origin === configuredFrontendOrigin);
  } else {
    // En production : exclusivement l'origine exacte configurée dans FRONTEND_URL.
    // Si FRONTEND_URL est absent ou invalide, tout accès CORS est strictement refusé.
    isAllowedOrigin = Boolean(configuredFrontendOrigin && origin === configuredFrontendOrigin);
  }

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
  const match = cookieHeader.match(/pawako_session=([^;]+)/);
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
  refusalReason: string | null;
  productionDate: string | null;
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
    refusalReason: c.adminStatus === 'REFUSE' ? (c.refusalReason || null) : null,
    productionDate: c.productionDate || null,
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

app.get('/api/health', c => {
  const projectId = c.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0255826431';
  return c.json({
    status: 'ok',
    worker: 'referral-manager',
    firestore: {
      projectId,
      hasServiceAccount: Boolean(c.env.FIREBASE_CLIENT_EMAIL && c.env.FIREBASE_PRIVATE_KEY),
    },
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// 5. AUTHENTIFICATION & SESSIONS DISCORD OAUTH2
// -----------------------------------------------------------------------------

app.get('/api/auth/url', async c => {
  let signingSecret: string;
  try {
    signingSecret = getValidatedSessionSecret(c.env);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }

  const portal = c.req.query('portal') === 'parrain' ? 'parrain' : 'admin';
  const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';

  // Calcule l'URL de redirection vers le Worker
  const workerOrigin = new URL(c.req.url).origin;
  const redirectUri = c.env.DISCORD_REDIRECT_URI?.trim() || `${workerOrigin}/auth/callback`;

  // Le state est cryptographiquement aléatoire, signé en HMAC et protégé contre le rejeu
  const { state } = await generateSecureOAuthState(portal, signingSecret);

  const isConfigured = Boolean(clientId && c.env.DISCORD_CLIENT_SECRET);
  const discordUrl = isConfigured
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=identify&state=${encodeURIComponent(state)}`
    : '';

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
  } catch {
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

  const repo = getRepository(c.env);

  // Validation cryptographique stricte du state OAuth2 et protection contre le rejeu distribué (Firestore)
  const stateCheck = await verifyAndConsumeOAuthState(state, signingSecret, (nonce, exp) =>
    repo.consumeOAuthNonce(nonce, exp)
  );

  // Détection du portail visé depuis le state vérifié ou le cookie
  const cookieHeader = c.req.header('Cookie') || '';
  const cookiePortalMatch = cookieHeader.match(/oauth_portal=([^;]+)/);
  const portalFromCookie = cookiePortalMatch ? cookiePortalMatch[1] : null;

  let portal: 'admin' | 'parrain' =
    stateCheck.valid && stateCheck.portal
      ? stateCheck.portal
      : portalFromCookie === 'parrain' || state.startsWith('parrain_')
      ? 'parrain'
      : 'admin';

  const frontendUrl = c.env.FRONTEND_URL?.trim() || 'https://pawako-referral-manager.pages.dev';
  let targetOrigin = '';
  try {
    targetOrigin = new URL(frontendUrl).origin;
  } catch {
    targetOrigin = 'https://pawako-referral-manager.pages.dev';
  }

  const portalLoginUrl = `${frontendUrl}/${portal}/login`;
  const portalDestUrl = `${frontendUrl}/${portal}`;

  if (error || !code) {
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

  // Échec de validation du state (CSRF ou Rejeu)
  if (!stateCheck.valid) {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Sécurité OAuth2 — PAWAKO</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white;">
          <div style="background: #1e293b; padding: 32px; border-radius: 14px; border: 1px solid #dc2626; text-align: center; max-width: 440px;">
            <div style="width: 48px; height: 48px; background: rgba(220,38,38,0.2); color: #f87171; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✕</div>
            <h3 style="margin: 0 0 8px 0; color: #f87171;">Échec de sécurité OAuth2</h3>
            <p style="color: #cbd5e1; font-size: 13px;">La validation de sécurité a échoué (session expirée ou tentative de rejeu détectée).</p>
            <button id="btn-back" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 14px;">Retour à la connexion</button>
          </div>
          <script>
            const targetOrigin = ${JSON.stringify(targetOrigin)};
            const loginUrl = ${JSON.stringify(portalLoginUrl)};
            document.getElementById('btn-back').addEventListener('click', function() {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: 'Échec de sécurité OAuth2' }, targetOrigin);
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

  try {
    const workerOrigin = new URL(c.req.url).origin;
    const redirectUri = c.env.DISCORD_REDIRECT_URI?.trim() || `${workerOrigin}/auth/callback`;
    const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';
    const clientSecret = c.env.DISCORD_CLIENT_SECRET?.trim() || '';

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
      throw new Error('Échec de l échange de token Discord');
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Récupération du profil utilisateur Discord réel
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error('Impossible de récupérer le profil Discord de l utilisateur');
    }

    const discordUser = (await userRes.json()) as {
      id: string;
      username: string;
      global_name?: string;
      avatar?: string | null;
    };

    const configuredAdminId =
      c.env.INITIAL_ADMIN_DISCORD_ID?.trim() ||
      c.env.PAWAKO_INITIAL_ADMIN_DISCORD_ID?.trim() ||
      '';

    // CONTRÔLE STRICT DES ACCÈS PAR PORTAIL
    if (portal === 'admin') {
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
                  <div style="margin-top: 8px; color: #f87171;">Ce compte n est pas accrédité comme Administrateur ou Responsable.</div>
                </div>
                <button id="btn-back" style="background: #334155; color: #f8fafc; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
              <script>
                const targetOrigin = ${JSON.stringify(targetOrigin)};
                const loginUrl = ${JSON.stringify(portalLoginUrl)};
                document.getElementById('btn-back').addEventListener('click', function() {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: 'Compte non accrédité Administrateur' }, targetOrigin);
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
    } else {
      // Espace Parrain
      const authCheck = await repo.canAccessParrain(discordUser.id);
      if (!authCheck.authorized) {
        return c.html(`
          <!DOCTYPE html>
          <html>
            <head><title>Accès Refusé — Espace Parrain PAWAKO</title></head>
            <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
              <div style="background: white; padding: 36px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 460px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                <div style="width: 52px; height: 52px; background: #fef2f2; color: #dc2626; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
                <h3 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Compte Parrain Non Enregistré</h3>
                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 16px 0; text-align: left; font-size: 12px; line-height: 1.6; color: #334155;">
                  <div>Compte Discord : <strong>${escapeHtml(discordUser.username)}</strong></div>
                  <div>Discord ID : <code style="color: #0284c7;">${escapeHtml(discordUser.id)}</code></div>
                  <div style="margin-top: 8px; color: #dc2626;">Ce compte n est pas enregistré comme Parrain autorisé PAWAKO.</div>
                </div>
                <button id="btn-back" style="background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
              <script>
                const targetOrigin = ${JSON.stringify(targetOrigin)};
                const loginUrl = ${JSON.stringify(portalLoginUrl)};
                document.getElementById('btn-back').addEventListener('click', function() {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_FAILED', error: 'Compte non enregistré comme Parrain' }, targetOrigin);
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
    }

    // Utilisateur validé : persistance dans Firestore
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    const user = await repo.upsertUser(
      {
        id: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name || discordUser.username,
        avatar: avatarUrl,
      },
      configuredAdminId
    );

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
  } catch {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur de connexion Discord</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; max-width: 480px;">
            <h3 style="color: #991b1b; margin-top: 0;">Erreur d authentification</h3>
            <p style="color: #7f1d1d; font-size: 14px;">Une erreur est survenue lors de l authentification Discord. Veuillez réessayer.</p>
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
  const user = await getAuthenticatedUser(c, repo);

  let hasValidSecret = false;
  try {
    getValidatedSessionSecret(c.env);
    hasValidSecret = true;
  } catch {
    hasValidSecret = false;
  }

  let isClaimed = false;
  try {
    isClaimed = await repo.isInitialAdminClaimed();
  } catch {
    isClaimed = false;
  }

  if (!user) {
    return c.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured: Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET && hasValidSecret),
      isBotConfigured: Boolean(c.env.JARVIS_WEBHOOK_SECRET),
      hasAnyUsers: false,
      isInitialAdminClaimed: isClaimed,
    });
  }

  let referrer: any = null;
  try {
    referrer = await repo.getReferrerByDiscordUserId(user.id);
  } catch {
    referrer = null;
  }

  return c.json({
    authenticated: true,
    user,
    referrer: referrer || null,
    isOAuthConfigured: Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET && hasValidSecret),
    isBotConfigured: Boolean(c.env.JARVIS_WEBHOOK_SECRET),
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
    // Filtrage strict par liste blanche des candidats retournés dans le dashboard parrain
    const safeCandidates = (dashboard.candidates || []).map(toParrainCandidateView);
    return c.json({
      ...dashboard,
      candidates: safeCandidates,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
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

  const search = c.req.query('search');
  const vaType = c.req.query('vaType') as VAType | 'ALL' | undefined;
  const adminStatus = c.req.query('adminStatus') as AdminStatus | 'ALL' | undefined;
  const operationalStatus = c.req.query('operationalStatus') as OperationalStatus | 'ALL' | undefined;
  const server = c.req.query('server');
  const hasAnomaly = c.req.query('hasAnomaly') ? c.req.query('hasAnomaly') === 'true' : undefined;
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const result = await repo.getCandidates({
    search,
    vaType,
    adminStatus,
    operationalStatus,
    server,
    hasAnomaly,
    referrerDiscordUserId: isParrainOnly ? user.id : undefined,
    page,
    limit,
  });

  // Pour les parrains, construction obligatoire par liste blanche des seuls champs autorisés
  if (isParrainOnly) {
    return c.json({
      candidates: result.candidates.map(toParrainCandidateView),
      total: result.total,
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

  // Règle d'isolation : un parrain ne peut consulter que ses propres filleuls
  if (user.role === 'PARRAIN' && candidate.referrerDiscordUserId !== user.id) {
    return c.json({ error: 'Accès refusé. Ce candidat n est pas l un de vos filleuls.' }, 403);
  }

  const history = await repo.getStatusHistoryForCandidate(candidate.id);

  // Pour les parrains, filtrage strict par liste blanche (exclusion totale des notes et métadonnées internes)
  if (user.role === 'PARRAIN') {
    const sanitizedHistory = history
      .filter(h => !h.isConfidential)
      .map(h => ({
        id: h.id,
        toStatus: h.toStatus,
        toAdminStatus: h.toAdminStatus,
        toOperationalStatus: h.toOperationalStatus,
        toServer: h.toServer,
        timestamp: h.timestamp,
        reason: h.reason,
      }));

    return c.json({
      candidate: toParrainCandidateView(candidate),
      history: sanitizedHistory,
    });
  }

  return c.json({ candidate, history });
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
  const { newAdminStatus, newOperationalStatus, notes, refusalReason, isConfidential } = body;

  if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
    return c.json({ error: 'Un motif d audit tracé (notes) est strictement obligatoire.' }, 400);
  }

  try {
    const updated = await repo.updateCandidateStatus(c.req.param('id'), {
      newAdminStatus,
      newOperationalStatus,
      notes,
      refusalReason,
      isConfidential: Boolean(isConfidential),
      actorUserId: user.id,
      actorName: user.displayName,
      actorSource: user.role === 'ADMINISTRATEUR' ? 'MANUAL_ADMIN' : 'MANUAL_RESPONSABLE',
    });

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

  const updated = await repo.clearCandidateAnomaly(c.req.param('id'), user.id, user.displayName);
  return c.json({ success: true, candidate: updated });
});

app.post('/api/candidates/:id/reassign', async c => {
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

  if (!newReferrerId || !reason) {
    return c.json({ error: 'newReferrerId et reason obligatoires' }, 400);
  }

  const updated = await repo.reassignReferrer(c.req.param('id'), {
    newReferrerId,
    reason,
    actorUserId: user.id,
    actorName: user.displayName,
  });

  return c.json({ success: true, candidate: updated });
});

// -----------------------------------------------------------------------------
// 8. GESTION DES PARRAINS
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

  // Isolation stricte : un parrain ne peut voir que sa propre fiche de parrainage
  if (user.role === 'PARRAIN') {
    const myReferrer = await repo.getReferrerByDiscordUserId(user.id);
    return c.json({ referrers: myReferrer ? [myReferrer] : [] });
  }

  const referrers = await repo.getReferrers();
  return c.json({ referrers });
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

  const body = await c.req.json();
  const { discordUserId, inviteCode, notes } = body;

  if (!discordUserId) {
    return c.json({ error: 'discordUserId requis' }, 400);
  }

  const referrer = await repo.createReferrer({
    discordUserId,
    inviteCode,
    notes,
    actorUserId: user.id,
    actorName: user.displayName,
  });

  return c.json({ success: true, referrer }, 201);
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

  const referrer = await repo.toggleReferrer(c.req.param('id'), user.id, user.displayName);
  return c.json({ success: true, referrer });
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

  const guildIds = {
    RECRUTEMENT: c.env.DISCORD_RECRUITMENT_GUILD_ID || '',
    FORMATION: c.env.DISCORD_FORMATION_GUILD_ID || '',
    PRODUCTION_CHATTING: c.env.DISCORD_CHATTING_PRODUCTION_GUILD_ID || '',
    PRODUCTION_INSTAGRAM: c.env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID || '',
  };
  const servers = await repo.getDiscordServers(guildIds);
  return c.json({ servers });
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

app.post('/api/discord/webhook', async c => {
  // 1. Authentification sécurisée du Bot JARVIS via secret partagé
  const expectedSecret = (
    c.env.JARVIS_WEBHOOK_SECRET ||
    c.env.DISCORD_BOT_WEBHOOK_SECRET ||
    ''
  ).trim();
  const receivedSecret = c.req.header('X-JARVIS-Secret');

  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return c.json({ error: 'Secret JARVIS invalide ou manquant. Requête non autorisée.' }, 401);
  }

  const payload = await c.req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return c.json({ error: 'Corps de requête JSON manquant ou invalide.' }, 400);
  }

  const { eventType, guildId, user } = payload;

  // 2. Protection contre les attaques par rejeu : exige systématiquement timestamp et eventId
  const timestampHeader =
    c.req.header('X-JARVIS-Timestamp') || (payload.timestamp ? String(payload.timestamp) : null);
  const nonceHeader =
    c.req.header('X-JARVIS-Nonce') || (payload.eventId ? String(payload.eventId) : null);

  const replayValidation = validateWebhookTimestampAndEventId(timestampHeader, nonceHeader);
  if (!replayValidation.valid || !replayValidation.eventId) {
    return c.json({ error: replayValidation.reason }, 400);
  }

  const eventId = replayValidation.eventId;

  // 3. Validation stricte du schéma métier
  if (!eventType || typeof eventType !== 'string' || !guildId || !user?.id) {
    return c.json({ error: 'Payload d événement Discord incomplet (eventType, guildId, user.id requis).' }, 400);
  }

  // Validation du format des identifiants Discord (snowflake numérique 17-20 chiffres)
  if (!/^\d{17,20}$/.test(String(guildId)) || !/^\d{17,20}$/.test(String(user.id))) {
    return c.json({ error: 'Identifiant Discord (guildId ou user.id) invalide.' }, 400);
  }

  const repo = getRepository(c.env);

  // 4. Verrouillage atomique distribué dans Firestore avec identifiant propriétaire unique
  const ownerId = crypto.randomUUID();
  const lock = await repo.lockWebhookEvent(eventId, ownerId, 60000);
  if (!lock.acquired) {
    return c.json({ error: lock.reason || 'Événement webhook déjà traité ou en cours (anti-rejeu).' }, 409);
  }

  try {
    // Journalisation de l'événement dans Firestore
    await repo.logAudit({
      action: `DISCORD_EVENT_${eventType}`,
      actorUserId: 'BOT_JARVIS',
      actorName: 'Passerelle Bot JARVIS',
      targetType: 'DISCORD',
      targetId: user.id,
      details: { eventType, guildId, username: user.username },
    });

    // Finalisation atomique sécurisée par ownerId et updateTime
    const finalized = await repo.completeWebhookEvent(eventId, ownerId, {
      eventType,
      guildId,
      userId: user.id,
      username: user.username,
    });

    if (!finalized) {
      // Le verrou n'a pas pu être confirmé (ex: expiré et repris ou conflit concurrent)
      // Ne jamais retourner success: true si la finalisation du verrou n'a pas été confirmée
      await repo.releaseWebhookEvent(eventId, ownerId);
      return c.json({ error: 'Échec de la confirmation de finalisation du verrou webhook.' }, 500);
    }

    return c.json({ success: true, message: `Événement ${eventType} traité pour ${user.username} (${user.id})` });
  } catch (err: any) {
    // En cas d'échec métier ou exception, libérer le verrou uniquement avec l'ownerId correspondant
    try {
      await repo.releaseWebhookEvent(eventId, ownerId);
    } catch {}
    return c.json({ error: 'Erreur lors du traitement interne de l événement.' }, 500);
  }
});

// -----------------------------------------------------------------------------
// 10. UTILISATEURS & AUDIT LOGS
// -----------------------------------------------------------------------------

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
