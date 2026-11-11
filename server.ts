import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './server/api';
import { discordService } from './server/discordService';
import { db } from './server/db';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set('trust proxy', 1);

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Strict CORS authorization
const configuredFrontend = (process.env.FRONTEND_URL || '').trim();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();

  let isAllowed = false;
  if (configuredFrontend) {
    try {
      const allowedOrigin = new URL(configuredFrontend).origin;
      if (origin === allowedOrigin) isAllowed = true;
    } catch {}
  }

  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      isAllowed = true;
    }
  }

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-JARVIS-Secret, X-JARVIS-Timestamp');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  }

  if (req.method === 'OPTIONS') {
    return res.status(403).json({ error: 'Origine CORS non autorisée' });
  }
  next();
});

// Mount API routes
app.use('/api', apiRouter);

// Discord OAuth2 Callback routes (handles with and without trailing slash per skill guidelines)
const oauthCallbackHandler = async (req: express.Request, res: express.Response) => {
  const { code, state, error, error_description } = req.query;

  // Récupération de la porte d'entrée visée (admin ou parrain) depuis le paramètre state ou le cookie
  const stateStr = typeof state === 'string' ? state : '';
  let targetPortal: 'admin' | 'parrain' = (req.cookies?.oauth_portal || 'admin') as 'admin' | 'parrain';
  if (stateStr.startsWith('parrain_')) {
    targetPortal = 'parrain';
  } else if (stateStr.startsWith('admin_')) {
    targetPortal = 'admin';
  }

  res.clearCookie('oauth_portal', {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  });

  const portalTitle = targetPortal === 'admin' ? 'Espace Administration' : 'Espace Parrain';
  const portalLoginUrl = targetPortal === 'admin' ? '/admin/login' : '/parrain/login';

  let targetOrigin = `${req.protocol}://${req.get('host')}`;
  if (configuredFrontend) {
    try {
      targetOrigin = new URL(configuredFrontend).origin;
    } catch {}
  }

  if (error) {
    const safeError = escapeHtml(String(error_description || error || 'Autorisation annulée'));
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Connexion Discord annulée — PAWAKO</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 28px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Autorisation Discord annulée</h3>
            <p style="color: #64748b; font-size: 14px; line-height: 1.5;">${safeError}</p>
            <div style="margin-top: 20px;">
              <button onclick="if(window.opener){window.close();}else{window.location.href='${escapeHtml(portalLoginUrl)}';}" style="background: #0f172a; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;">Retour à la page de connexion</button>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  // 1. Protection CSRF : Vérification stricte du paramètre state
  const savedState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state', {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  });

  const isValidState = Boolean(
    state &&
    savedState &&
    (state === savedState || state === `${targetPortal}_${savedState}` || stateStr.endsWith(savedState))
  );

  if (!isValidState && savedState) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur de sécurité OAuth2 — PAWAKO</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
          <div style="background: white; padding: 28px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; max-width: 440px;">
            <h3 style="color: #991b1b; margin-top: 0; font-size: 18px;">Échec de validation de sécurité (CSRF)</h3>
            <p style="color: #7f1d1d; font-size: 14px; line-height: 1.5;">Le jeton d'état (state) Discord est absent ou non concordant. Veuillez relancer la connexion depuis PAWAKO.</p>
            <button onclick="if(window.opener){window.close();}else{window.location.href='${escapeHtml(portalLoginUrl)}';}" style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">Fermer la fenêtre</button>
          </div>
        </body>
      </html>
    `);
  }

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${appUrl}/auth/callback`;

  try {
    if (!code || typeof code !== 'string') {
      throw new Error('Code d autorisation Discord absent.');
    }

    const discordUser = await discordService.exchangeCodeForUser(code, redirectUri);
    if (!discordUser) {
      throw new Error('Impossible d obtenir le profil Discord.');
    }

    // =========================================================================
    // 2. CONTRÔLE D'ACCÈS STRICT PAR PORTE D'ENTRÉE (ADMIN vs PARRAIN)
    // =========================================================================

    if (targetPortal === 'admin') {
      const authCheck = db.canAccessAdmin(discordUser.id);
      if (!authCheck.authorized) {
        res.clearCookie('pawako_session', { secure: true, sameSite: 'none', httpOnly: true });
        const reasonText = authCheck.reason || 'Ce compte n est pas accrédité comme Administrateur.';
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Accès Refusé — Espace Administration PAWAKO</title><meta charset="utf-8"></head>
            <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a;">
              <div style="background: #1e293b; padding: 36px; border-radius: 16px; border: 1px solid #334155; text-align: center; max-width: 460px; color: white; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                <div style="width: 52px; height: 52px; background: rgba(239, 68, 68, 0.15); color: #f87171; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
                <h3 style="color: #f8fafc; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">Accès Refusé</h3>
                <p style="color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 16px;">Espace Administration & Direction</p>
                <div style="background: #0f172a; padding: 14px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 20px; text-align: left; font-size: 12px; line-height: 1.6; color: #cbd5e1;">
                  <div>Compte Discord : <strong>${escapeHtml(discordUser.username)}</strong></div>
                  <div>Discord ID : <code style="color: #38bdf8;">${escapeHtml(discordUser.id)}</code></div>
                  <div style="margin-top: 8px; color: #f87171;">${escapeHtml(reasonText)}</div>
                </div>
                <p style="color: #64748b; font-size: 12px; margin-bottom: 24px;">Seuls les comptes expressément accrédités par la Direction ou désignés via INITIAL_ADMIN_DISCORD_ID peuvent accéder à cet espace.</p>
                <button onclick="if(window.opener){try{window.opener.postMessage(${JSON.stringify({type:'OAUTH_AUTH_FAILED', error: reasonText})}, ${JSON.stringify(targetOrigin)});}catch(e){}window.close();}else{window.location.href='${escapeHtml(portalLoginUrl)}';}" style="background: #334155; color: #f8fafc; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;">Retour à la page de connexion</button>
              </div>
            </body>
          </html>
        `);
      }
    } else {
      // Espace Parrain
      const authCheck = db.canAccessParrain(discordUser.id);
      if (!authCheck.authorized) {
        res.clearCookie('pawako_session', { secure: true, sameSite: 'none', httpOnly: true });
        const reasonText = authCheck.reason || 'Ce compte n est pas enregistré dans la liste des parrains autorisés.';
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Accès Refusé — Espace Parrain PAWAKO</title><meta charset="utf-8"></head>
            <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
              <div style="background: white; padding: 36px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 460px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                <div style="width: 52px; height: 52px; background: #fef2f2; color: #dc2626; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; font-weight: bold;">✕</div>
                <h3 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px; font-weight: 700;">Compte Parrain Non Enregistré</h3>
                <p style="color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 16px;">Espace Parrain PAWAKO</p>
                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; text-align: left; font-size: 12px; line-height: 1.6; color: #334155;">
                  <div>Compte Discord : <strong>${escapeHtml(discordUser.username)}</strong></div>
                  <div>Discord ID : <code style="color: #0284c7;">${escapeHtml(discordUser.id)}</code></div>
                  <div style="margin-top: 8px; color: #dc2626;">${escapeHtml(reasonText)}</div>
                </div>
                <p style="color: #64748b; font-size: 12px; margin-bottom: 24px;">L'Espace Parrain est strictement réservé aux parrains officiels enregistrés. Contactez la Direction pour faire enregistrer votre compte.</p>
                <button onclick="if(window.opener){try{window.opener.postMessage(${JSON.stringify({type:'OAUTH_AUTH_FAILED', error: reasonText})}, ${JSON.stringify(targetOrigin)});}catch(e){}window.close();}else{window.location.href='${escapeHtml(portalLoginUrl)}';}" style="background: #0f172a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;">Retour à la page de connexion</button>
              </div>
            </body>
          </html>
        `);
      }
    }

    // =========================================================================
    // 3. ENREGISTREMENT ET ATTRIBUTION DE SESSION SÉCURISÉE
    // =========================================================================

    const user = db.upsertUser({
      id: discordUser.id,
      username: discordUser.username,
      displayName: discordUser.global_name || discordUser.username,
      avatar: discordService.formatAvatarUrl(discordUser.id, discordUser.avatar),
    });

    // Session cookie sécurisé (30 jours)
    res.cookie('pawako_session', user.id, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const destinationRoute = targetPortal === 'admin' ? '/admin' : '/parrain';

    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Connexion PAWAKO Réussie</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="width: 48px; height: 48px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px;">✓</div>
            <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 20px;">Connexion Discord autorisée</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 4px 0;">Bienvenue <strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.role)}).</p>
            <p style="color: #059669; font-size: 13px; font-weight: 500; margin: 0 0 20px 0;">Accès validé pour : ${escapeHtml(portalTitle)}</p>
          </div>
          <script>
            if (window.opener) {
              try {
                window.opener.postMessage(${JSON.stringify({
                  type: 'OAUTH_AUTH_SUCCESS',
                  portal: targetPortal,
                  role: user.role,
                  userId: user.id,
                })}, ${JSON.stringify(targetOrigin)});
              } catch (e) {}
              window.close();
            } else {
              window.location.href = ${JSON.stringify(destinationRoute)};
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Erreur de connexion Discord — PAWAKO</title><meta charset="utf-8"></head>
        <body style="font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fef2f2;">
          <div style="background: white; padding: 32px; border-radius: 12px; border: 1px solid #fecaca; text-align: center; max-width: 480px;">
            <h3 style="color: #991b1b; margin-top: 0; font-size: 18px;">Échec de la connexion Discord</h3>
            <p style="color: #7f1d1d; font-size: 14px; margin-bottom: 20px;">Une erreur est survenue lors de l'authentification Discord.</p>
            <button onclick="if(window.opener){window.close();}else{window.location.href='${escapeHtml(portalLoginUrl)}';}" style="background: #e11d48; color: white; border: none; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 13px;">Fermer la fenêtre</button>
          </div>
        </body>
      </html>
    `);
  }
};

app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // In development mode, mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production mode, serve built dist files
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PAWAKO] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start PAWAKO server:', err);
  process.exit(1);
});
