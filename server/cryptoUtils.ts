/**
 * PAWAKO Referral Manager — Utilitaires Cryptographiques & Sécurité
 * 100% compatibles Node.js (18+) et Cloudflare Workers (Web Crypto API standard).
 * Zéro clé secrète par défaut, zéro fallback prévisible.
 */

/**
 * Encode un buffer en chaîne hexadécimale
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Calcule un HMAC-SHA256 standard via Web Crypto.
 * Exige strictement une clé non vide d'au moins 32 caractères.
 */
async function hmacSha256(keyStr: string, messageStr: string): Promise<string> {
  if (!keyStr || typeof keyStr !== 'string' || keyStr.trim().length < 32) {
    throw new Error('Secret cryptographique obligatoire manquant ou inférieur à 32 caractères');
  }

  const enc = new TextEncoder();
  const keyData = enc.encode(keyStr.trim());
  const messageData = enc.encode(messageStr);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return bufferToHex(signature);
}

// =============================================================================
// 1. OAUTH DISCORD STATE SÉCURISÉ (CSRF + ANTI-REJEU + DISTINCTION PORTAIL)
// =============================================================================

export interface GeneratedOAuthState {
  state: string;
  portal: 'admin' | 'parrain';
  nonce: string;
}

/**
 * Génère un state OAuth2 cryptographiquement aléatoire et signé en HMAC.
 * Format : `${portal}_${nonce}_${timestamp}_${signature}`
 */
export async function generateSecureOAuthState(
  portal: 'admin' | 'parrain',
  secret: string
): Promise<GeneratedOAuthState> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('SESSION_SECRET obligatoire manquant ou inférieur à 32 caractères');
  }

  const nonce = crypto.randomUUID();
  const timestamp = Date.now();
  const message = `${portal}:${nonce}:${timestamp}`;
  const sig = await hmacSha256(secret, message);

  // Signature tronquée à 16 caractères pour un state compact et robuste
  const shortSig = sig.slice(0, 16);
  const state = `${portal}_${nonce}_${timestamp}_${shortSig}`;

  return { state, portal, nonce };
}

export interface VerifyOAuthStateResult {
  valid: boolean;
  portal?: 'admin' | 'parrain';
  nonce?: string;
  reason?: string;
}

/**
 * Valide strictement le state reçu au callback OAuth2 :
 * 1. Vérifie le format
 * 2. Vérifie la signature HMAC
 * 3. Vérifie l'expiration (< 10 minutes)
 * 4. Empêche la réutilisation via consommation persistante OBLIGATOIRE dans Firestore (aucun cache mémoire)
 * En cas d'indisponibilité de Firestore, refuse systématiquement l'authentification.
 */
export async function verifyAndConsumeOAuthState(
  state: string,
  secret: string,
  persistentConsumer: (nonce: string, expiresAt: number) => Promise<boolean>
): Promise<VerifyOAuthStateResult> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    return { valid: false, reason: 'SESSION_SECRET obligatoire manquant ou inférieur à 32 caractères' };
  }

  if (!persistentConsumer || typeof persistentConsumer !== 'function') {
    return { valid: false, reason: 'Consommateur persistant Firestore obligatoire manquant' };
  }

  if (!state || typeof state !== 'string') {
    return { valid: false, reason: 'State OAuth2 manquant' };
  }

  const parts = state.split('_');
  if (parts.length !== 4) {
    return { valid: false, reason: 'Format de state OAuth2 invalide (seuls les states cryptographiquement signés sont autorisés)' };
  }

  const portal = parts[0] as 'admin' | 'parrain';
  const nonce = parts[1];
  const timestampStr = parts[2];
  const receivedSig = parts[3];

  if (portal !== 'admin' && portal !== 'parrain') {
    return { valid: false, reason: 'Portail OAuth2 inconnu' };
  }

  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();

  // Expiration après 10 minutes max (600 000 ms)
  if (isNaN(timestamp) || now - timestamp > 600000 || timestamp > now + 60000) {
    return { valid: false, reason: 'State OAuth2 expiré (> 10 minutes)' };
  }

  // Vérification de la signature HMAC
  const message = `${portal}:${nonce}:${timestamp}`;
  const expectedSig = (await hmacSha256(secret, message)).slice(0, 16);
  if (receivedSig !== expectedSig) {
    return { valid: false, reason: 'Signature HMAC du state OAuth2 invalide (CSRF suspecté)' };
  }

  // Consommation persistante obligatoire dans Firestore
  try {
    const isFresh = await persistentConsumer(nonce, now + 900000);
    if (!isFresh) {
      return { valid: false, reason: 'Tentative de rejeu de state OAuth2 détectée (state déjà consommé dans Firestore)' };
    }
  } catch (err: any) {
    return { valid: false, reason: `Échec de la validation persistante du state OAuth2 (Firestore indisponible : ${err?.message || 'erreur'})` };
  }

  return { valid: true, portal, nonce };
}

// =============================================================================
// 2. JETONS DE SESSION CRYPTOGRAPHIQUES (COMPATIBILITÉ 3RD-PARTY COOKIES)
// =============================================================================

export interface SessionPayload {
  userId: string;
  role: string;
  issuedAt: number;
}

/**
 * Crée un jeton de session inviolable signé par HMAC-SHA256
 * Format : `${userId}.${role}.${issuedAt}.${signature}`
 */
export async function createSignedSessionToken(
  userId: string,
  role: string,
  secret: string
): Promise<string> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('SESSION_SECRET manquant ou inférieur à 32 caractères');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${userId}.${role}.${issuedAt}`;
  const sig = await hmacSha256(secret, `session:${payload}`);
  return `${payload}.${sig.slice(0, 32)}`;
}

/**
 * Vérifie un jeton de session cryptographique (Bearer ou cookie)
 * Validité : 30 jours max.
 */
export async function verifySignedSessionToken(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: SessionPayload; reason?: string }> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    return { valid: false, reason: 'Configuration de sécurité serveur incomplète (SESSION_SECRET manquant ou insuffisant)' };
  }

  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Jeton absent' };
  }

  // Format obligatoire strict : userId.role.issuedAt.sig
  const parts = token.split('.');
  if (parts.length !== 4) {
    return { valid: false, reason: 'Format de jeton de session invalide (jeton HMAC-SHA256 requis)' };
  }

  const [userId, role, issuedAtStr, receivedSig] = parts;

  // Validation de l'identifiant Discord (snowflake numérique 17-20 chiffres)
  if (!/^\d{17,20}$/.test(userId)) {
    return { valid: false, reason: 'Identifiant Discord invalide dans le jeton' };
  }

  const issuedAt = parseInt(issuedAtStr, 10);
  const now = Math.floor(Date.now() / 1000);

  // Durée maximale de session : 30 jours (2 592 000 secondes), rejet des dates futures (> 300s)
  if (isNaN(issuedAt) || now - issuedAt > 2592000 || issuedAt > now + 300) {
    return { valid: false, reason: 'Session expirée' };
  }

  const payload = `${userId}.${role}.${issuedAt}`;
  const expectedSig = (await hmacSha256(secret, `session:${payload}`)).slice(0, 32);
  if (receivedSig !== expectedSig) {
    return { valid: false, reason: 'Signature HMAC de session invalide (jeton falsifié)' };
  }

  return {
    valid: true,
    payload: { userId, role, issuedAt },
  };
}

// =============================================================================
// 3. VALIDATION HORODATAGE ET IDENTIFIANT POUR WEBHOOKS JARVIS
// =============================================================================

export interface WebhookValidationResult {
  valid: boolean;
  eventId?: string;
  timestamp?: number;
  reason?: string;
  error?: string;
}

/**
 * Valide la présence et la fraîcheur d'un webhook JARVIS.
 * N'utilise aucune mémoire locale volatile pour l'unicité (déléguée à Firestore).
 * Exige obligatoirement un timestamp valide dans une fenêtre de 5 minutes et un eventId stable.
 */
export function validateWebhookTimestampAndEventId(
  timestampHeader?: string | null,
  eventIdHeader?: string | null
): WebhookValidationResult {
  if (!timestampHeader || !timestampHeader.trim()) {
    return {
      valid: false,
      reason: 'En-tête X-JARVIS-Timestamp manquant (obligatoire)',
    };
  }

  if (!eventIdHeader || !eventIdHeader.trim()) {
    return {
      valid: false,
      reason: 'Identifiant d événement unique X-JARVIS-Nonce ou eventId manquant (obligatoire)',
    };
  }

  const cleanEventId = eventIdHeader.trim();
  if (!/^[a-zA-Z0-9_\-:.]{8,128}$/.test(cleanEventId)) {
    return {
      valid: false,
      reason: 'Format d identifiant d événement invalide (8 à 128 caractères alphanumériques requis)',
    };
  }

  let ts = parseInt(timestampHeader.trim(), 10);
  if (isNaN(ts) || ts <= 0) {
    return {
      valid: false,
      reason: 'Format de timestamp webhook invalide',
    };
  }

  // Support des timestamps en secondes ou millisecondes
  if (ts < 10000000000) {
    ts *= 1000;
  }

  const now = Date.now();
  // Fenêtre stricte de tolérance de 5 minutes (300 000 ms)
  if (Math.abs(now - ts) > 300000) {
    return {
      valid: false,
      reason: 'Horodatage webhook hors de la fenêtre de tolérance autorisée (5 minutes)',
    };
  }

  return {
    valid: true,
    eventId: cleanEventId,
    timestamp: ts,
  };
}
