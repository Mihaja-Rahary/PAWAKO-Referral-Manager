/**
 * PAWAKO Referral Manager — Cloudflare Worker API Backend (pawako-api)
 * Déployable sur l'offre gratuite Cloudflare Workers (workers.dev)
 * Persistance stricte sur Cloud Firestore via REST API
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FirestoreRestClient } from '../server/firestoreRest';
import { FirestoreRepository } from '../server/firestoreRepository';
import {
  AdminStatus,
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
  validateWebhookTimestampAndNonce,
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
}

const app = new Hono<{ Bindings: Env }>();

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

// Configuration CORS dynamique
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '';
  const frontendUrl = c.env.FRONTEND_URL?.trim() || '';

  // Autorise le frontend Firebase Hosting configuré, ou les domaines de développement/staging
  const isAllowedOrigin =
    (frontendUrl && origin === frontendUrl) ||
    origin.endsWith('.web.app') ||
    origin.endsWith('.firebaseapp.com') ||
    origin.endsWith('.run.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');

  const corsHandler = cors({
    origin: isAllowedOrigin ? origin : '*',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Origin',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-JARVIS-Secret',
      'X-JARVIS-Timestamp',
      'X-JARVIS-Nonce',
      'X-Pawako-Session',
      'X-Pawako-User-Id',
    ],
  });

  return corsHandler(c, next);
});

function getSessionSecret(env: Env): string {
  const secret = (env.SESSION_SECRET || env.DISCORD_CLIENT_SECRET || '').trim();
  if (secret.length >= 32) return secret;
  return secret || 'pawako_default_secret_key_minimum_32_chars_2026';
}

// Helper pour extraire et valider l'utilisateur authentifié
async function getAuthenticatedUser(c: any, repo: FirestoreRepository): Promise<User | null> {
  const secret = getSessionSecret(c.env);

  // 1. En-tête Authorization: Bearer <token>
  const authHeader = c.req.header('Authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // 2. En-tête personnalisé X-Pawako-Session ou X-Pawako-User-Id
  if (!token) {
    token = c.req.header('X-Pawako-Session') || c.req.header('X-Pawako-User-Id') || null;
  }

  // 3. Cookie pawako_session
  if (!token) {
    const cookieHeader = c.req.header('Cookie') || '';
    const match = cookieHeader.match(/pawako_session=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

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
    return null; // Révocation immédiate si l'utilisateur est inexistant ou désactivé
  }

  return user;
}

// -----------------------------------------------------------------------------
// 1. SANTÉ & VÉRIFICATION DU WORKER
// -----------------------------------------------------------------------------

app.get('/health', c => {
  return c.json({
    status: 'ok',
    worker: 'pawako-api',
    runtime: 'Cloudflare Workers (Edge)',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', c => {
  const projectId = c.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0255826431';
  return c.json({
    status: 'ok',
    worker: 'pawako-api',
    firestore: {
      projectId,
      hasServiceAccount: Boolean(c.env.FIREBASE_CLIENT_EMAIL && c.env.FIREBASE_PRIVATE_KEY),
    },
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------------
// 2. AUTHENTIFICATION & SESSIONS DISCORD OAUTH2
// -----------------------------------------------------------------------------

app.get('/api/auth/url', async c => {
  const portal = c.req.query('portal') === 'parrain' ? 'parrain' : 'admin';
  const clientId = c.env.DISCORD_CLIENT_ID?.trim() || '';
  const signingSecret = c.env.DISCORD_CLIENT_SECRET || c.env.SESSION_SECRET || 'pawako_oauth_salt_2026';

  // Calcule l'URL de redirection par défaut vers le Worker
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
  const code = c.req.query('code');
  const state = c.req.query('state') || '';
  const error = c.req.query('error');
  const errorDescription = c.req.query('error_description');
  const signingSecret = c.env.DISCORD_CLIENT_SECRET || c.env.SESSION_SECRET || 'pawako_oauth_salt_2026';

  const repo = getRepository(c.env);

  // Validation cryptographique stricte du state OAuth2 et protection contre le rejeu distribué (Firestore)
  const stateCheck = await verifyAndConsumeOAuthState(state, signingSecret, (nonce, exp) =>
    repo.consumeOAuthNonce(nonce, exp)
  );

  // Détection du portail visé depuis le state vérifié ou le cookie
  const cookieHeader = c.req.header('Cookie') || '';
  const cookiePortalMatch = cookieHeader.match(/oauth_portal=([^;]+)/);
  const portalFromCookie = cookiePortalMatch ? cookiePortalMatch[1] : null;

  let portal: 'admin' | 'parrain' = stateCheck.valid && stateCheck.portal
    ? stateCheck.portal
    : (portalFromCookie === 'parrain' || state.startsWith('parrain_') ? 'parrain' : 'admin');

  const frontendUrl = c.env.FRONTEND_URL?.trim() || 'https://gen-lang-client-0255826431.web.app';
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
            <p style="color: #64748b; font-size: 14px;">${errorDescription || error || 'Code manquant'}</p>
            <button onclick="if(window.opener){window.close();}else{window.location.href='${portalLoginUrl}';}" style="background: #0f172a; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;">Retour à la page de connexion</button>
          </div>
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
            <p style="color: #cbd5e1; font-size: 13px;">${stateCheck.reason || 'State OAuth2 invalide ou expiré.'}</p>
            <button onclick="if(window.opener){window.close();}else{window.location.href='${portalLoginUrl}';}" style="background: #334155; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; margin-top: 14px;">Retour à la connexion</button>
          </div>
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
      const errBody = await tokenRes.text();
      throw new Error(`Échec de l'échange de token Discord (${tokenRes.status}) : ${errBody}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Récupération du profil utilisateur Discord réel
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new Error('Impossible de récupérer le profil Discord de l utilisateur.');
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
                  <div>Compte Discord : <strong>${discordUser.username}</strong></div>
                  <div>Discord ID : <code style="color: #38bdf8;">${discordUser.id}</code></div>
                  <div style="margin-top: 8px; color: #f87171;">${authCheck.reason || 'Ce compte n est pas accrédité comme Administrateur.'}</div>
                </div>
                <button onclick="if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_FAILED', error:'${authCheck.reason}'},'*');window.close();}else{window.location.href='${portalLoginUrl}';}" style="background: #334155; color: #f8fafc; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
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
                  <div>Compte Discord : <strong>${discordUser.username}</strong></div>
                  <div>Discord ID : <code style="color: #0284c7;">${discordUser.id}</code></div>
                  <div style="margin-top: 8px; color: #dc2626;">${authCheck.reason || 'Ce compte n est pas enregistré comme Parrain.'}</div>
                </div>
                <button onclick="if(window.opener){window.opener.postMessage({type:'OAUTH_AUTH_FAILED', error:'${authCheck.reason}'},'*');window.close();}else{window.location.href='${portalLoginUrl}';}" style="background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;">Retour à la page de connexion</button>
              </div>
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

    // Génération du jeton de session cryptographique (compatible 3rd-party cookies)
    const sessionSecret = c.env.SESSION_SECRET || c.env.DISCORD_CLIENT_SECRET || 'pawako_session_salt_2026';
    const signedToken = await createSignedSessionToken(user.id, user.role, sessionSecret);

    // Définition du cookie de session sécurisé
    const sessionCookie = `pawako_session=${signedToken}; Path=/; Secure; SameSite=None; Max-Age=2592000; HttpOnly`;

    const targetOrigin = new URL(frontendUrl).origin;

    return c.html(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Connexion PAWAKO Réussie</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="width: 48px; height: 48px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✓</div>
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Connexion Discord réussie</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 20px 0;">Bienvenue <strong>${user.displayName}</strong> (${user.role}).</p>
          </div>
          <script>
            try {
              if (window.opener) {
                // Origine cible strictement restreinte au domaine frontend pour empêcher toute interception
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', portal: '${portal}', role: '${user.role}', userId: '${user.id}', token: '${signedToken}' }, '${targetOrigin}');
                window.close();
              } else {
                // Utilisation du fragment (#) au lieu de query (?) pour ne pas exposer le jeton dans les logs de requêtes ou l'en-tête Referer
                window.location.replace('${portalDestUrl}#sessionToken=${signedToken}&session=${user.id}');
              }
            } catch (e) {
              window.location.replace('${portalDestUrl}#sessionToken=${signedToken}&session=${user.id}');
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
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur de connexion Discord</title></head>
        <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; max-width: 480px;">
            <h3 style="color: #991b1b; margin-top: 0;">Erreur d'authentification</h3>
            <p style="color: #7f1d1d; font-size: 14px;">${err.message || 'Erreur imprévue'}</p>
            <button onclick="if(window.opener){window.close();}else{window.location.href='${portalLoginUrl}';}" style="background: #e11d48; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">Fermer</button>
          </div>
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

  if (!user) {
    return c.json({
      authenticated: false,
      user: null,
      referrer: null,
      isOAuthConfigured: Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET),
      isBotConfigured: Boolean(c.env.JARVIS_WEBHOOK_SECRET),
      hasAnyUsers: false,
      isInitialAdminClaimed: await repo.isInitialAdminClaimed(),
    });
  }

  const referrer = await repo.getReferrerByDiscordUserId(user.id);

  return c.json({
    authenticated: true,
    user,
    referrer: referrer || null,
    isOAuthConfigured: Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET),
    isBotConfigured: Boolean(c.env.JARVIS_WEBHOOK_SECRET),
    hasAnyUsers: true,
    isInitialAdminClaimed: await repo.isInitialAdminClaimed(),
  });
});

app.post('/api/auth/logout', c => {
  return c.json({ success: true, message: 'Déconnexion effectuée' }, 200, {
    'Set-Cookie': 'pawako_session=; Path=/; Secure; SameSite=None; Max-Age=0; HttpOnly',
  });
});

// -----------------------------------------------------------------------------
// 3. STATISTIQUES GLOBALES & ESPACE PARRAIN
// -----------------------------------------------------------------------------

app.get('/api/stats/overview', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  if (user.role === 'PARRAIN') {
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

  try {
    const dashboard = await repo.getParrainDashboard(user.id);
    return c.json(dashboard);
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
});

// -----------------------------------------------------------------------------
// 4. CANDIDATS & RECRUTEMENT
// -----------------------------------------------------------------------------

app.get('/api/candidates', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
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

  // Pour les parrains, masquer les informations confidentielles internes mais conserver le motif de refus transparent
  if (isParrainOnly) {
    result.candidates = result.candidates.map(cand => ({
      ...cand,
      decisionByUserId: undefined,
      decisionByName: undefined,
      uncertaintyReason: undefined,
      anomalyReason: cand.hasAnomaly ? 'Anomalie administrative en cours de traitement' : null,
    }));
  }

  return c.json(result);
});

app.get('/api/candidates/:id', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter via Discord.' }, 401);
  }

  const candidate = await repo.getCandidateById(c.req.param('id'));

  if (!candidate) {
    return c.json({ error: 'Candidat introuvable' }, 404);
  }

  // Si c'est un parrain, il ne peut voir que ses propres filleuls
  if (user.role === 'PARRAIN' && candidate.referrerDiscordUserId !== user.id) {
    return c.json({ error: 'Accès refusé. Ce candidat n est pas l un de vos filleuls.' }, 403);
  }

  const history = await repo.getStatusHistoryForCandidate(candidate.id);
  // Les parrains ont accès à l'historique transparent et aux motifs de refus, hors notes strictement confidentielles
  const sanitizedHistory =
    user.role === 'PARRAIN' ? history.filter(h => !h.isConfidential) : history;

  const sanitizedCandidate = user.role === 'PARRAIN' ? {
    ...candidate,
    decisionByUserId: undefined,
    decisionByName: undefined,
    uncertaintyReason: undefined,
    anomalyReason: candidate.hasAnomaly ? 'Anomalie administrative en cours de traitement' : null,
  } : candidate;

  return c.json({ candidate: sanitizedCandidate, history: sanitizedHistory });
});

app.post('/api/candidates', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role === 'PARRAIN') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
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

  if (user.role === 'PARRAIN') {
    return c.json({ error: 'Accès réservé à la Direction et aux Responsables.' }, 403);
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

  if (user.role === 'PARRAIN') {
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
// 5. GESTION DES PARRAINS
// -----------------------------------------------------------------------------

app.get('/api/referrers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Accès non autorisé. Session requise.' }, 401);
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
// 6. DISCORD SERVERS, ROLE MAPPINGS & BOT JARVIS WEBHOOK
// -----------------------------------------------------------------------------

app.get('/api/discord/servers', async c => {
  const repo = getRepository(c.env);
  const user = await getAuthenticatedUser(c, repo);

  if (!user) {
    return c.json({ error: 'Session non authentifiée. Veuillez vous connecter.' }, 401);
  }

  if (user.role === 'PARRAIN') {
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

  const payload = await c.req.json();
  const { eventType, guildId, user } = payload || {};

  // 2. Protection contre les attaques par rejeu (horodatage + nonce anti-rejeu)
  const timestampHeader =
    c.req.header('X-JARVIS-Timestamp') || (payload?.timestamp ? String(payload.timestamp) : null);
  const nonceHeader =
    c.req.header('X-JARVIS-Nonce') || (payload?.eventId ? String(payload.eventId) : null);

  const replayValidation = validateWebhookTimestampAndNonce(timestampHeader, nonceHeader);
  if (!replayValidation.valid) {
    return c.json({ error: replayValidation.reason }, 400);
  }

  // 3. Validation stricte du schéma
  if (!eventType || typeof eventType !== 'string' || !guildId || !user?.id) {
    return c.json({ error: 'Payload d événement Discord incomplet (eventType, guildId, user.id requis).' }, 400);
  }

  // Validation du format des identifiants Discord (snowflake numérique 17-20 chiffres)
  if (!/^\d{17,20}$/.test(String(guildId)) || !/^\d{17,20}$/.test(String(user.id))) {
    return c.json({ error: 'Identifiant Discord (guildId ou user.id) invalide.' }, 400);
  }

  const repo = getRepository(c.env);
  const eventId = nonceHeader || `evt_${Date.now()}_${user.id}_${eventType}`;

  // 4. Verrouillage atomique distribué dans Firestore (anti-rejeu persistant)
  const lock = await repo.lockWebhookEvent(eventId, Date.now() + 60000);
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

    // Marquer l'événement comme COMPLETED dans Firestore
    await repo.completeWebhookEvent(eventId, {
      eventType,
      guildId,
      userId: user.id,
      username: user.username,
    });

    return c.json({ success: true, message: `Événement ${eventType} traité pour ${user.username} (${user.id})` });
  } catch (err: any) {
    // En cas d'échec métier, libérer le verrou pour autoriser une nouvelle tentative
    await repo.releaseWebhookEvent(eventId);
    return c.json({ error: `Erreur lors du traitement de l'événement : ${err.message}` }, 500);
  }
});

// -----------------------------------------------------------------------------
// 7. UTILISATEURS & AUDIT LOGS
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
    return c.json({ error: 'Accès réservé aux Administrateurs' }, 403);
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
    return c.json({ error: 'Accès réservé aux Administrateurs' }, 403);
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
    return c.json({ error: 'Accès réservé aux Administrateurs' }, 403);
  }

  const limit = Math.min(200, parseInt(c.req.query('limit') || '50', 10));
  const auditLogs = await repo.getAuditLogs(limit);
  return c.json({ auditLogs });
});

export default app;
