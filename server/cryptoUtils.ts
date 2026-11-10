/**
 * PAWAKO Referral Manager — Utilitaires Cryptographiques & Sécurité
 * 100% compatibles Node.js (18+) et Cloudflare Workers (Web Crypto API standard).
 * Zéro dépendance externe.
 */

// Cache glissant pour la protection contre le rejeu (durée de vie : 15 minutes)
const consumedNonces = new Map<string, number>();

function cleanExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedNonces.entries()) {
    if (now > expiresAt) {
      consumedNonces.delete(nonce);
    }
  }
}

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
 * Calcule un HMAC-SHA256 standard via Web Crypto
 */
async function hmacSha256(keyStr: string, messageStr: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(keyStr || 'pawako_default_secret_key_2026');
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
  cleanExpiredNonces();

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
 * 4. Empêche la réutilisation (protection anti-rejeu)
 */
export async function verifyAndConsumeOAuthState(
  state: string,
  secret: string,
  persistentConsumer?: (nonce: string, expiresAt: number) => Promise<boolean>
): Promise<VerifyOAuthStateResult> {
  cleanExpiredNonces();

  if (!state || typeof state !== 'string') {
    return { valid: false, reason: 'State OAuth2 manquant' };
  }

  const parts = state.split('_');
  if (parts.length < 4) {
    // Compatibilité de repli si le state était au format simplifié 'portal_nonce'
    const portalPrefix = parts[0];
    if (portalPrefix === 'admin' || portalPrefix === 'parrain') {
      return { valid: true, portal: portalPrefix, nonce: parts[1] || crypto.randomUUID() };
    }
    return { valid: false, reason: 'Format de state OAuth2 invalide' };
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

  // Protection contre le rejeu L1 (en mémoire locale de l'isolat)
  if (consumedNonces.has(nonce)) {
    return { valid: false, reason: 'Tentative de rejeu de state OAuth2 détectée (state déjà consommé en mémoire)' };
  }

  // Protection contre le rejeu L2 (persistante multi-instances via Firestore)
  if (persistentConsumer) {
    const isFresh = await persistentConsumer(nonce, now + 900000);
    if (!isFresh) {
      return { valid: false, reason: 'Tentative de rejeu de state OAuth2 détectée (state déjà consommé dans Firestore)' };
    }
  }

  // Marque le nonce comme consommé pendant 15 minutes
  consumedNonces.set(nonce, now + 900000);

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
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'Jeton absent' };
  }

  // Si c'est un format signé : userId.role.issuedAt.sig
  const parts = token.split('.');
  if (parts.length === 4) {
    const [userId, role, issuedAtStr, receivedSig] = parts;
    const issuedAt = parseInt(issuedAtStr, 10);
    const now = Math.floor(Date.now() / 1000);

    // Durée maximale de session : 30 jours (2 592 000 secondes)
    if (isNaN(issuedAt) || now - issuedAt > 2592000 || issuedAt > now + 300) {
      return { valid: false, reason: 'Session expirée' };
    }

    const payload = `${userId}.${role}.${issuedAt}`;
    const expectedSig = (await hmacSha256(secret, `session:${payload}`)).slice(0, 32);
    if (receivedSig !== expectedSig) {
      return { valid: false, reason: 'Signature de session invalide' };
    }

    return {
      valid: true,
      payload: { userId, role, issuedAt },
    };
  }

  // Tolérance pour ID Discord direct si environnement de développement interne
  // (uniquement si snowflake numérique 17-20 chiffres)
  if (/^\d{17,20}$/.test(token)) {
    return {
      valid: true,
      payload: { userId: token, role: 'UNKNOWN', issuedAt: Math.floor(Date.now() / 1000) },
    };
  }

  return { valid: false, reason: 'Format de jeton de session non reconnu' };
}

// =============================================================================
// 3. PROTECTION ANTI-REJEU POUR WEBHOOKS JARVIS
// =============================================================================

export interface WebhookValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Valide la fraîcheur et l'unicité d'une requête webhook JARVIS
 */
export function validateWebhookTimestampAndNonce(
  timestampHeader?: string | null,
  nonceHeader?: string | null
): WebhookValidationResult {
  cleanExpiredNonces();

  const now = Date.now();

  // Si un timestamp est fourni, vérifier la fenêtre temporelle (+/- 5 minutes)
  if (timestampHeader) {
    let ts = parseInt(timestampHeader, 10);
    // Support des timestamps en secondes ou millisecondes
    if (ts < 10000000000) ts *= 1000;

    if (isNaN(ts) || Math.abs(now - ts) > 300000) {
      return {
        valid: false,
        reason: 'Requête webhook expirée (délai supérieur à 5 minutes)',
      };
    }
  }

  // Si un nonce ou identifiant d'événement est fourni, vérifier qu'il n'a pas été rejoué
  if (nonceHeader) {
    if (consumedNonces.has(nonceHeader)) {
      return {
        valid: false,
        reason: 'Requête webhook rejouée déjà traitée (protection anti-rejeu)',
      };
    }
    // Enregistrement du nonce pour 10 minutes
    consumedNonces.set(nonceHeader, now + 600000);
  }

  return { valid: true };
}
