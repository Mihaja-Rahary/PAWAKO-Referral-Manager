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
 * Comparaison en temps constant de deux chaînes UTF-8 (protection contre les attaques temporelles).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
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

export type OAuthStateErrorCategory = 'AUTH_FAILURE' | 'TECHNICAL_ERROR';

export type OAuthStateFailureCode =
  | 'MISSING_SECRET'
  | 'MISSING_CONSUMER'
  | 'MISSING_STATE'
  | 'INVALID_FORMAT'
  | 'INVALID_PORTAL'
  | 'INVALID_NONCE'
  | 'INVALID_TIMESTAMP'
  | 'STATE_EXPIRED'
  | 'CLOCK_SKEW'
  | 'INVALID_HMAC'
  | 'REPLAY_DETECTED'
  | 'FIRESTORE_ERROR';

export interface PersistentNonceConsumerResult {
  consumed: boolean;
  reason?: 'REPLAY' | 'INVALID_NONCE' | 'TECHNICAL_ERROR';
  category?: string;
  operation?: string;
  httpStatus?: number | null;
  errorCode?: string;
  detail?: string;
}

export type PersistentNonceConsumer = (
  nonce: string,
  expiresAt: number
) => Promise<boolean | PersistentNonceConsumerResult>;

export interface VerifyOAuthStateResult {
  valid: boolean;
  portal?: 'admin' | 'parrain';
  nonce?: string;
  errorCategory?: OAuthStateErrorCategory;
  failureCode?: OAuthStateFailureCode;
  reason?: string;
  diagnostics?: Record<string, string | number | boolean | null>;
}

/**
 * Valide strictement le state reçu au callback OAuth2 :
 * 1. Vérifie la présence de SESSION_SECRET et du consommateur persistant
 * 2. Vérifie le format strict (${portal}_${nonce}_${timestamp}_${sig})
 * 3. Vérifie la signature HMAC en temps constant avant l'horodatage et Firestore
 * 4. Vérifie l'expiration (< 10 minutes) et le décalage horloge
 * 5. Consomme le nonce atomiquement dans Firestore en distinguant rejeu et erreur technique
 */
export async function verifyAndConsumeOAuthState(
  state: string,
  secret: string,
  persistentConsumer: PersistentNonceConsumer
): Promise<VerifyOAuthStateResult> {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    console.error('[OAuth2 State Validation][TECHNICAL_ERROR]', {
      failureCode: 'MISSING_SECRET',
    });
    return {
      valid: false,
      errorCategory: 'TECHNICAL_ERROR',
      failureCode: 'MISSING_SECRET',
      reason: 'SESSION_SECRET obligatoire manquant ou inférieur à 32 caractères',
    };
  }

  if (!persistentConsumer || typeof persistentConsumer !== 'function') {
    console.error('[OAuth2 State Validation][TECHNICAL_ERROR]', {
      failureCode: 'MISSING_CONSUMER',
    });
    return {
      valid: false,
      errorCategory: 'TECHNICAL_ERROR',
      failureCode: 'MISSING_CONSUMER',
      reason: 'Consommateur persistant Firestore obligatoire manquant',
    };
  }

  if (!state || typeof state !== 'string' || !state.trim()) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'MISSING_STATE',
    });
    return {
      valid: false,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'MISSING_STATE',
      reason: 'State OAuth2 manquant',
    };
  }

  const trimmedState = state.trim();
  const parts = trimmedState.split('_');
  if (parts.length !== 4 || parts.some(p => !p)) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_FORMAT',
      partsCount: parts.length,
      stateLength: trimmedState.length,
    });
    return {
      valid: false,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_FORMAT',
      reason: 'Format de state OAuth2 invalide (seuls les states cryptographiquement signés sont autorisés)',
      diagnostics: { partsCount: parts.length, stateLength: trimmedState.length },
    };
  }

  const portal = parts[0] as 'admin' | 'parrain';
  const nonce = parts[1];
  const timestampStr = parts[2];
  const receivedSig = parts[3];

  if (portal !== 'admin' && portal !== 'parrain') {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_PORTAL',
      portalPreview: String(portal).slice(0, 16),
    });
    return {
      valid: false,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_PORTAL',
      reason: 'Portail OAuth2 inconnu',
    };
  }

  if (!/^[a-zA-Z0-9-]{8,128}$/.test(nonce)) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_NONCE',
      portal,
      nonceLength: nonce.length,
    });
    return {
      valid: false,
      portal,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_NONCE',
      reason: 'Format de nonce OAuth2 invalide',
    };
  }

  if (!/^[1-9]\d{9,15}$/.test(timestampStr)) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_TIMESTAMP',
      portal,
      noncePrefix: nonce.slice(0, 8),
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_TIMESTAMP',
      reason: 'Horodatage du state OAuth2 invalide',
    };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_TIMESTAMP',
      portal,
      noncePrefix: nonce.slice(0, 8),
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_TIMESTAMP',
      reason: 'Horodatage du state OAuth2 non numérique',
    };
  }

  // Vérification de la signature HMAC (temps constant) AVANT l'expiration et Firestore
  // Cela évite qu'un state falsifié ou signé avec un autre secret soit classé comme expiré ou rejoué
  const message = `${portal}:${nonce}:${timestamp}`;
  const expectedSig = (await hmacSha256(secret, message)).slice(0, 16);
  if (!constantTimeEqual(receivedSig, expectedSig)) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'INVALID_HMAC',
      portal,
      noncePrefix: nonce.slice(0, 8),
      receivedSigLength: receivedSig.length,
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'INVALID_HMAC',
      reason: 'Signature HMAC du state OAuth2 invalide (secret modifié ou tentative CSRF)',
      diagnostics: { receivedSigLength: receivedSig.length },
    };
  }

  const now = Date.now();
  const ageMs = now - timestamp;

  // Expiration après 10 minutes max (600 000 ms)
  if (ageMs > 600000) {
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'STATE_EXPIRED',
      portal,
      noncePrefix: nonce.slice(0, 8),
      ageMs,
      maxAgeMs: 600000,
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'STATE_EXPIRED',
      reason: 'State OAuth2 expiré (> 10 minutes)',
      diagnostics: { ageMs, maxAgeMs: 600000 },
    };
  }

  // Tolérance maximale de dérive horloge future : 60 secondes (60 000 ms)
  if (timestamp > now + 60000) {
    const skewMs = timestamp - now;
    console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
      failureCode: 'CLOCK_SKEW',
      portal,
      noncePrefix: nonce.slice(0, 8),
      skewMs,
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'AUTH_FAILURE',
      failureCode: 'CLOCK_SKEW',
      reason: 'Horodatage du state OAuth2 invalide (horloge future détectée)',
      diagnostics: { skewMs },
    };
  }

  // Consommation atomique persistante obligatoire dans Firestore
  try {
    const consumeOutcome = await persistentConsumer(nonce, now + 900000);
    const normalized: PersistentNonceConsumerResult =
      typeof consumeOutcome === 'boolean'
        ? { consumed: consumeOutcome, reason: consumeOutcome ? undefined : 'REPLAY' }
        : consumeOutcome;

    if (!normalized.consumed) {
      if (normalized.reason === 'TECHNICAL_ERROR') {
        console.error('[OAuth2 State Validation][TECHNICAL_ERROR]', {
          failureCode: 'FIRESTORE_ERROR',
          portal,
          noncePrefix: nonce.slice(0, 8),
          category: normalized.category || null,
          operation: normalized.operation || null,
          httpStatus: normalized.httpStatus ?? null,
          errorCode: normalized.errorCode || null,
          detail: normalized.detail || null,
        });
        return {
          valid: false,
          portal,
          nonce,
          errorCategory: 'TECHNICAL_ERROR',
          failureCode: 'FIRESTORE_ERROR',
          reason:
            normalized.detail ||
            'Échec technique Firestore lors de la consommation atomique du state OAuth2',
          diagnostics: {
            category: normalized.category || 'UNKNOWN',
            operation: normalized.operation || 'SET',
            httpStatus: normalized.httpStatus ?? null,
            errorCode: normalized.errorCode || 'FIRESTORE_ERROR',
          },
        };
      }

      if (normalized.reason === 'INVALID_NONCE') {
        console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
          failureCode: 'INVALID_NONCE',
          portal,
          noncePrefix: nonce.slice(0, 8),
        });
        return {
          valid: false,
          portal,
          nonce,
          errorCategory: 'AUTH_FAILURE',
          failureCode: 'INVALID_NONCE',
          reason: normalized.detail || 'Format de nonce OAuth2 invalide',
        };
      }

      console.warn('[OAuth2 State Validation][AUTH_FAILURE]', {
        failureCode: 'REPLAY_DETECTED',
        portal,
        noncePrefix: nonce.slice(0, 8),
        errorCode: normalized.errorCode || null,
      });
      return {
        valid: false,
        portal,
        nonce,
        errorCategory: 'AUTH_FAILURE',
        failureCode: 'REPLAY_DETECTED',
        reason: 'Tentative de rejeu de state OAuth2 détectée (state déjà consommé dans Firestore)',
        diagnostics: {
          errorCode: normalized.errorCode || 'ALREADY_CONSUMED',
        },
      };
    }
  } catch (err: any) {
    console.error('[OAuth2 State Validation][TECHNICAL_ERROR]', {
      failureCode: 'FIRESTORE_ERROR',
      portal,
      noncePrefix: nonce.slice(0, 8),
      message: err?.message || 'Erreur inattendue',
    });
    return {
      valid: false,
      portal,
      nonce,
      errorCategory: 'TECHNICAL_ERROR',
      failureCode: 'FIRESTORE_ERROR',
      reason: `Échec de la validation persistante du state OAuth2 (Firestore indisponible : ${err?.message || 'erreur'})`,
      diagnostics: {
        errorCode: 'CONSUMER_EXCEPTION',
      },
    };
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
  if (!constantTimeEqual(receivedSig, expectedSig)) {
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
