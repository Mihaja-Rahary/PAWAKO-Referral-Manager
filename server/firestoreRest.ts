/**
 * PAWAKO Referral Manager — Client Cloud Firestore REST API v1
 * 100% compatible avec Cloudflare Workers, Node.js et les environnements Edge V8.
 * Utilise Web Crypto (crypto.subtle) pour l'authentification Google OAuth2 sans gRPC ni Node addons.
 */

export interface FirestoreRestConfig {
  projectId: string;
  databaseId?: string;
  clientEmail?: string;
  privateKey?: string;
}

export type FirestoreErrorCategory =
  | 'CONFIG'
  | 'AUTH'
  | 'PRECONDITION'
  | 'NOT_FOUND'
  | 'PERMISSION'
  | 'RATE_LIMIT'
  | 'TRANSIENT'
  | 'NETWORK'
  | 'UNKNOWN';

export class FirestoreRestError extends Error {
  public readonly status?: number;
  public readonly firestoreStatus?: string;
  public readonly operation: string;
  public readonly category: FirestoreErrorCategory;

  constructor(
    message: string,
    options: {
      status?: number;
      firestoreStatus?: string;
      operation: string;
      category: FirestoreErrorCategory;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = 'FirestoreRestError';
    this.status = options.status;
    this.firestoreStatus = options.firestoreStatus;
    this.operation = options.operation;
    this.category = options.category;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /**
   * Indique un conflit atomique attendu (document déjà existant ou précondition non satisfaite)
   */
  get isPreconditionConflict(): boolean {
    return (
      this.category === 'PRECONDITION' ||
      this.status === 409 ||
      this.status === 412 ||
      this.firestoreStatus === 'ALREADY_EXISTS' ||
      this.firestoreStatus === 'FAILED_PRECONDITION'
    );
  }
}

function classifyFirestoreHttpError(status: number, firestoreStatus?: string): FirestoreErrorCategory {
  if (
    status === 409 ||
    status === 412 ||
    firestoreStatus === 'ALREADY_EXISTS' ||
    firestoreStatus === 'FAILED_PRECONDITION'
  ) {
    return 'PRECONDITION';
  }
  if (status === 401 || firestoreStatus === 'UNAUTHENTICATED') {
    return 'AUTH';
  }
  if (status === 403 || firestoreStatus === 'PERMISSION_DENIED') {
    return 'PERMISSION';
  }
  if (status === 404 || firestoreStatus === 'NOT_FOUND') {
    return 'NOT_FOUND';
  }
  if (status === 429 || firestoreStatus === 'RESOURCE_EXHAUSTED') {
    return 'RATE_LIMIT';
  }
  if (
    status >= 500 ||
    firestoreStatus === 'UNAVAILABLE' ||
    firestoreStatus === 'DEADLINE_EXCEEDED' ||
    firestoreStatus === 'ABORTED' ||
    firestoreStatus === 'INTERNAL'
  ) {
    return 'TRANSIENT';
  }
  return 'UNKNOWN';
}

function buildFirestoreHttpError(operation: string, status: number, rawBody: string): FirestoreRestError {
  let firestoreStatus: string | undefined;
  let safeApiMessage = '';

  try {
    const parsed = JSON.parse(rawBody) as {
      error?: { status?: string; message?: string };
    };
    if (parsed?.error?.status && typeof parsed.error.status === 'string') {
      firestoreStatus = parsed.error.status;
    }
    if (parsed?.error?.message && typeof parsed.error.message === 'string') {
      safeApiMessage = parsed.error.message.slice(0, 240);
    }
  } catch {
    safeApiMessage = rawBody.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  const category = classifyFirestoreHttpError(status, firestoreStatus);
  const statusLabel = firestoreStatus ? `${status}/${firestoreStatus}` : `${status}`;
  const detail = safeApiMessage ? `: ${safeApiMessage}` : '';

  return new FirestoreRestError(`Firestore ${operation} a échoué (${statusLabel})${detail}`, {
    status,
    firestoreStatus,
    operation,
    category,
  });
}

// Cache du token d'accès Google OAuth2 indexé par clientEmail
let cachedToken: { clientEmail: string; accessToken: string; expiresAt: number } | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

function sanitizeConfigValue(raw?: string): string {
  let val = (raw || '').trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
}

export interface PrivateKeyDiagnostic {
  valid: boolean;
  code:
    | 'OK_PKCS8'
    | 'MISSING_PRIVATE_KEY'
    | 'JSON_KEY_INSTEAD_OF_PEM'
    | 'PKCS1_RSA_KEY_NOT_PKCS8'
    | 'PEM_HEADERS_MISSING'
    | 'PEM_BODY_EMPTY'
    | 'PEM_BASE64_CORRUPTED';
  detail: string;
}

function unwrapAndNormalizePemText(rawPem: string): string {
  let pem = sanitizeConfigValue(rawPem);
  pem = pem
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return pem.trim();
}

export function diagnosePrivateKeyPem(rawPem?: string): PrivateKeyDiagnostic {
  const trimmed = (rawPem || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: 'MISSING_PRIVATE_KEY',
      detail: 'Secret FIREBASE_PRIVATE_KEY manquant ou vide.',
    };
  }

  const pem = unwrapAndNormalizePemText(trimmed);

  if (pem.startsWith('{') && pem.includes('"private_key"')) {
    return {
      valid: false,
      code: 'JSON_KEY_INSTEAD_OF_PEM',
      detail:
        'FIREBASE_PRIVATE_KEY contient le fichier JSON complet du compte de service au lieu de la seule clé PEM (champ private_key).',
    };
  }

  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    return {
      valid: false,
      code: 'PKCS1_RSA_KEY_NOT_PKCS8',
      detail: 'Format FIREBASE_PRIVATE_KEY invalide : clé PKCS#8 (-----BEGIN PRIVATE KEY-----) requise.',
    };
  }

  if (!pem.includes('-----BEGIN PRIVATE KEY-----') || !pem.includes('-----END PRIVATE KEY-----')) {
    return {
      valid: false,
      code: 'PEM_HEADERS_MISSING',
      detail: 'Format FIREBASE_PRIVATE_KEY invalide : en-têtes PEM PKCS#8 manquants.',
    };
  }

  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  if (!cleanPem) {
    return {
      valid: false,
      code: 'PEM_BODY_EMPTY',
      detail: 'FIREBASE_PRIVATE_KEY vide après normalisation PEM.',
    };
  }

  try {
    const binaryString = atob(cleanPem);
    if (binaryString.length < 64) {
      return {
        valid: false,
        code: 'PEM_BASE64_CORRUPTED',
        detail: 'FIREBASE_PRIVATE_KEY invalide : contenu PKCS#8 trop court ou tronqué.',
      };
    }
    return {
      valid: true,
      code: 'OK_PKCS8',
      detail: 'Clé privée PKCS#8 valide.',
    };
  } catch {
    return {
      valid: false,
      code: 'PEM_BASE64_CORRUPTED',
      detail: 'FIREBASE_PRIVATE_KEY invalide : encodage Base64 PKCS#8 corrompu.',
    };
  }
}

/**
 * Normalise une clé privée PEM issue d'un secret Cloudflare (gère \n échappés, \r\n et guillemets éventuels)
 */
function normalizePrivateKeyPem(rawPem: string): string {
  const diag = diagnosePrivateKeyPem(rawPem);
  if (!diag.valid) {
    throw new FirestoreRestError(diag.detail, {
      operation: 'CONFIG',
      firestoreStatus: diag.code,
      category: 'CONFIG',
    });
  }
  return unwrapAndNormalizePemText(rawPem);
}

/**
 * Convertit une clé privée PEM PKCS#8 en ArrayBuffer binaire pour crypto.subtle.importKey
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = normalizePrivateKeyPem(pem);
  const cleanPem = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  try {
    const binaryString = atob(cleanPem);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (err) {
    throw new FirestoreRestError('FIREBASE_PRIVATE_KEY invalide : encodage Base64 PKCS#8 corrompu.', {
      operation: 'CONFIG',
      firestoreStatus: 'PEM_BASE64_CORRUPTED',
      category: 'CONFIG',
      cause: err,
    });
  }
}

/**
 * Encode une chaîne en Base64URL
 */
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

function isMissingDatabaseOrProject404(rawBody: string): boolean {
  const lower = (rawBody || '').toLowerCase();
  if (!lower) return false;
  if (lower.includes('database') && lower.includes('does not exist')) return true;
  if (lower.includes('project') && (lower.includes('does not exist') || lower.includes('not found'))) {
    return true;
  }
  return false;
}

/**
 * Génère un JWT Google OAuth2 signé avec RS256 et l'échange contre un Access Token Google
 */
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const cleanEmail = sanitizeConfigValue(clientEmail);
  const cleanKey = (privateKeyPem || '').trim();

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new FirestoreRestError(
      'Authentification Firebase impossible : FIREBASE_CLIENT_EMAIL manquant ou invalide.',
      { operation: 'AUTH_TOKEN', firestoreStatus: 'INVALID_CLIENT_EMAIL', category: 'CONFIG' }
    );
  }
  if (!cleanKey) {
    throw new FirestoreRestError(
      'Authentification Firebase impossible : FIREBASE_PRIVATE_KEY manquant.',
      { operation: 'AUTH_TOKEN', firestoreStatus: 'MISSING_PRIVATE_KEY', category: 'CONFIG' }
    );
  }

  const now = Math.floor(Date.now() / 1000);

  // Vérifier le cache (avec marge de renouvellement anticipé de 5 minutes)
  if (
    cachedToken &&
    cachedToken.clientEmail === cleanEmail &&
    cachedToken.expiresAt > now + 300
  ) {
    return cachedToken.accessToken;
  }

  // Protection contre les requêtes simultanées de renouvellement
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const header = {
        alg: 'RS256',
        typ: 'JWT',
      };

      const payload = {
        iss: cleanEmail,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      };

      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(payload));
      const message = `${encodedHeader}.${encodedPayload}`;

      const privateKeyBuffer = pemToArrayBuffer(cleanKey);
      let cryptoKey: CryptoKey;
      try {
        cryptoKey = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyBuffer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
          },
          false,
          ['sign']
        );
      } catch (err) {
        throw new FirestoreRestError(
          'Clé privée Firebase (FIREBASE_PRIVATE_KEY) incompatible avec la signature RS256 PKCS#8.',
          { operation: 'AUTH_TOKEN', category: 'CONFIG', cause: err }
        );
      }

      const encoder = new TextEncoder();
      const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        encoder.encode(message)
      );

      const signature = bufferToBase64Url(signatureBuffer);
      const jwt = `${message}.${signature}`;

      // Échange du JWT contre un access token
      let tokenRes: Response;
      try {
        tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
          }),
        });
      } catch (err: any) {
        cachedToken = null;
        throw new FirestoreRestError(
          `Erreur réseau lors de l'authentification Google OAuth2 Firestore : ${err?.message || 'connexion impossible'}`,
          { operation: 'AUTH_TOKEN', category: 'NETWORK', cause: err }
        );
      }

      if (!tokenRes.ok) {
        let errorCode = 'unknown_error';
        let errorDescription = '';
        try {
          const errJson = (await tokenRes.json()) as { error?: string; error_description?: string };
          if (errJson?.error) errorCode = errJson.error;
          if (errJson?.error_description && typeof errJson.error_description === 'string') {
            errorDescription = errJson.error_description.replace(/\s+/g, ' ').trim().slice(0, 160);
          }
        } catch {
          // Ne jamais exposer le corps brut en cas d'erreur de format
        }
        cachedToken = null;
        const descSuffix = errorDescription ? ` — ${errorDescription}` : '';
        throw new FirestoreRestError(
          `Échec de l'authentification Google OAuth2 Firestore (HTTP ${tokenRes.status}, code: ${errorCode}${descSuffix}). Vérifiez FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.`,
          {
            operation: 'AUTH_TOKEN',
            status: tokenRes.status,
            firestoreStatus: errorCode,
            category: 'AUTH',
          }
        );
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
      if (!tokenData?.access_token) {
        cachedToken = null;
        throw new FirestoreRestError('Réponse OAuth2 Google invalide : access_token absent.', {
          operation: 'AUTH_TOKEN',
          category: 'AUTH',
        });
      }

      const ttl = Number(tokenData.expires_in) > 0 ? Number(tokenData.expires_in) : 3600;
      cachedToken = {
        clientEmail: cleanEmail,
        accessToken: tokenData.access_token,
        expiresAt: Math.floor(Date.now() / 1000) + ttl,
      };

      return cachedToken.accessToken;
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}

// =============================================================================
// CONVERSION DES DONNÉES FIRESTORE REST <-> OBJETS TYPESCRIPT PURS
// =============================================================================

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;

  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

export function toFirestoreDocument(data: Record<string, any>): { fields: Record<string, any> } {
  const fields: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value);
    }
  }
  return { fields };
}

export function fromFirestoreDocument<T = any>(doc: any): T {
  if (!doc) return null as any;
  const fields = doc.fields || {};
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    data[k] = fromFirestoreValue(v);
  }
  if (doc.updateTime) {
    data._updateTime = doc.updateTime;
  }
  return data as T;
}

// =============================================================================
// CLIENT REST FIRESTORE PRINCIPAL
// =============================================================================

export class FirestoreRestClient {
  private projectId: string;
  private databaseId: string;
  private clientEmail?: string;
  private privateKey?: string;

  constructor(config: FirestoreRestConfig) {
    this.projectId = sanitizeConfigValue(config.projectId);
    this.databaseId = sanitizeConfigValue(config.databaseId) || '(default)';
    this.clientEmail = sanitizeConfigValue(config.clientEmail);
    this.privateKey = config.privateKey;
  }

  private get baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/databases/${encodeURIComponent(this.databaseId)}/documents`;
  }

  /**
   * Diagnostic en lecture seule de la configuration, de l'authentification Google JWT RS256
   * et de l'accessibilité réelle de la base Cloud Firestore (sans jamais exposer de secret).
   */
  async diagnoseFirestoreConnection(): Promise<{
    ok: boolean;
    stage: 'CONFIG' | 'GOOGLE_OAUTH2' | 'FIRESTORE_API' | 'OK';
    category?: FirestoreErrorCategory;
    httpStatus?: number | null;
    firestoreStatus?: string | null;
    diagnosticCode: string;
    message: string;
    projectId: string;
    databaseId: string;
  }> {
    if (!this.projectId) {
      return {
        ok: false,
        stage: 'CONFIG',
        category: 'CONFIG',
        diagnosticCode: 'MISSING_PROJECT_ID',
        message: 'FIREBASE_PROJECT_ID manquant.',
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    }

    if (!this.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.clientEmail)) {
      return {
        ok: false,
        stage: 'CONFIG',
        category: 'CONFIG',
        diagnosticCode: this.clientEmail ? 'INVALID_CLIENT_EMAIL' : 'MISSING_CLIENT_EMAIL',
        message: 'FIREBASE_CLIENT_EMAIL manquant ou invalide.',
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    }

    const keyDiag = diagnosePrivateKeyPem(this.privateKey);
    if (!keyDiag.valid) {
      return {
        ok: false,
        stage: 'CONFIG',
        category: 'CONFIG',
        diagnosticCode: keyDiag.code,
        message: keyDiag.detail,
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    }

    let token: string;
    try {
      token = await getGoogleAccessToken(this.clientEmail, this.privateKey || '');
    } catch (err: any) {
      const fErr = err instanceof FirestoreRestError ? err : null;
      return {
        ok: false,
        stage: fErr?.category === 'CONFIG' ? 'CONFIG' : 'GOOGLE_OAUTH2',
        category: fErr?.category || 'AUTH',
        httpStatus: fErr?.status ?? null,
        firestoreStatus: fErr?.firestoreStatus ?? null,
        diagnosticCode: fErr?.firestoreStatus || fErr?.category || 'AUTH_TOKEN_FAILED',
        message: fErr?.message || 'Échec authentification Google OAuth2.',
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    }

    const probeUrl = `${this.baseUrl}/pawako_metadata/system`;
    try {
      const res = await this.executeFetch('DIAGNOSE_GET pawako_metadata/system', probeUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        return {
          ok: true,
          stage: 'OK',
          httpStatus: res.status,
          firestoreStatus: 'OK',
          diagnosticCode: 'FIRESTORE_CONNECTED',
          message: 'Connexion Google OAuth2 RS256 et lecture Firestore REST vérifiées.',
          projectId: this.projectId,
          databaseId: this.databaseId,
        };
      }

      const rawErr = await res.text();
      if (res.status === 404 && !isMissingDatabaseOrProject404(rawErr)) {
        return {
          ok: true,
          stage: 'OK',
          httpStatus: 404,
          firestoreStatus: 'DOC_NOT_FOUND_DB_OK',
          diagnosticCode: 'FIRESTORE_CONNECTED_EMPTY_META',
          message: 'Connexion Google OAuth2 RS256 et accès base Firestore vérifiés (document système non encore créé).',
          projectId: this.projectId,
          databaseId: this.databaseId,
        };
      }

      const fErr = buildFirestoreHttpError('DIAGNOSE_GET pawako_metadata/system', res.status, rawErr);
      return {
        ok: false,
        stage: 'FIRESTORE_API',
        category: fErr.category,
        httpStatus: fErr.status ?? res.status,
        firestoreStatus: fErr.firestoreStatus ?? null,
        diagnosticCode: fErr.firestoreStatus || fErr.category,
        message: fErr.message,
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    } catch (err: any) {
      const fErr = err instanceof FirestoreRestError ? err : null;
      return {
        ok: false,
        stage: 'FIRESTORE_API',
        category: fErr?.category || 'NETWORK',
        httpStatus: fErr?.status ?? null,
        firestoreStatus: fErr?.firestoreStatus ?? null,
        diagnosticCode: fErr?.firestoreStatus || fErr?.category || 'NETWORK_ERROR',
        message: fErr?.message || 'Erreur réseau lors du diagnostic Firestore.',
        projectId: this.projectId,
        databaseId: this.databaseId,
      };
    }
  }

  private async getHeaders(): Promise<HeadersInit> {
    if (!this.clientEmail || !this.privateKey) {
      throw new FirestoreRestError(
        'Configuration Firestore incomplète : les secrets FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY sont obligatoires.',
        { operation: 'CONFIG', firestoreStatus: 'MISSING_SERVICE_ACCOUNT', category: 'CONFIG' }
      );
    }

    const token = await getGoogleAccessToken(this.clientEmail, this.privateKey);
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async executeFetch(operation: string, url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      throw new FirestoreRestError(
        `Erreur réseau Firestore (${operation}) : ${err?.message || 'connexion impossible'}`,
        { operation, category: 'NETWORK', cause: err }
      );
    }
  }

  /**
   * Récupère un document par sa collection et son ID, avec support optionnel d'une transaction REST
   */
  async getDocument<T = any>(
    collection: string,
    docId: string,
    options?: { transaction?: string }
  ): Promise<(T & { _updateTime?: string }) | null> {
    let url = `${this.baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
    if (options?.transaction) {
      url += `?transaction=${encodeURIComponent(options.transaction)}`;
    }
    const headers = await this.getHeaders();
    const res = await this.executeFetch(`GET ${collection}/${docId}`, url, { headers });

    if (res.status === 404) {
      const rawBody = await res.text();
      if (isMissingDatabaseOrProject404(rawBody)) {
        throw buildFirestoreHttpError(`GET ${collection}/${docId}`, res.status, rawBody);
      }
      return null;
    }
    if (!res.ok) {
      const err = await res.text();
      throw buildFirestoreHttpError(`GET ${collection}/${docId}`, res.status, err);
    }

    const doc = await res.json();
    return fromFirestoreDocument<T>(doc) as T & { _updateTime?: string };
  }

  /**
   * Démarre une transaction Firestore REST native
   */
  async beginTransaction(): Promise<string> {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents:beginTransaction`;
    const headers = await this.getHeaders();
    const res = await this.executeFetch('BEGIN_TRANSACTION', url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ options: { readWrite: {} } }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw buildFirestoreHttpError('BEGIN_TRANSACTION', res.status, err);
    }

    const data = (await res.json()) as { transaction: string };
    return data.transaction;
  }

  /**
   * Crée ou remplace un document avec un ID spécifique.
   * Supporte les préconditions pour l'atomicité et la protection contre les conflits concurrents.
   */
  async setDocument<T extends Record<string, any>>(
    collection: string,
    docId: string,
    data: T,
    options?: {
      precondition?: { exists?: boolean; updateTime?: string };
    }
  ): Promise<T> {
    let url = `${this.baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
    if (options?.precondition) {
      const params = new URLSearchParams();
      if (options.precondition.exists !== undefined) {
        params.set('currentDocument.exists', String(options.precondition.exists));
      }
      if (options.precondition.updateTime) {
        params.set('currentDocument.updateTime', options.precondition.updateTime);
      }
      url += `?${params.toString()}`;
    }

    const headers = await this.getHeaders();
    const body = JSON.stringify(toFirestoreDocument(data));

    const res = await this.executeFetch(`SET ${collection}/${docId}`, url, {
      method: 'PATCH',
      headers,
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw buildFirestoreHttpError(`SET ${collection}/${docId}`, res.status, err);
    }

    const doc = await res.json();
    return fromFirestoreDocument<T>(doc);
  }

  /**
   * Supprime un document par son ID (supporte les préconditions pour suppression atomique)
   */
  async deleteDocument(
    collection: string,
    docId: string,
    options?: { precondition?: { exists?: boolean; updateTime?: string } }
  ): Promise<boolean> {
    let url = `${this.baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
    if (options?.precondition) {
      const params = new URLSearchParams();
      if (options.precondition.exists !== undefined) {
        params.set('currentDocument.exists', String(options.precondition.exists));
      }
      if (options.precondition.updateTime) {
        params.set('currentDocument.updateTime', options.precondition.updateTime);
      }
      url += `?${params.toString()}`;
    }

    const headers = await this.getHeaders();
    const res = await this.executeFetch(`DELETE ${collection}/${docId}`, url, {
      method: 'DELETE',
      headers,
    });

    if (res.status === 404 || res.ok) {
      return true;
    }
    const err = await res.text();
    throw buildFirestoreHttpError(`DELETE ${collection}/${docId}`, res.status, err);
  }

  /**
   * Liste tous les documents d'une collection avec support complet de la pagination (nextPageToken)
   */
  async listDocuments<T = any>(collection: string, pageSize: number = 300): Promise<T[]> {
    const headers = await this.getHeaders();
    const allDocuments: T[] = [];
    let pageToken: string | null = null;

    do {
      let url = `${this.baseUrl}/${encodeURIComponent(collection)}?pageSize=${pageSize}`;
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }
      const res = await this.executeFetch(`LIST ${collection}`, url, { headers });

      if (!res.ok) {
        const err = await res.text();
        if (res.status === 404 && !isMissingDatabaseOrProject404(err)) {
          return allDocuments;
        }
        throw buildFirestoreHttpError(`LIST ${collection}`, res.status, err);
      }

      const data = (await res.json()) as { documents?: any[]; nextPageToken?: string };
      if (data.documents && Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          allDocuments.push(fromFirestoreDocument<T>(doc));
        }
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return allDocuments;
  }

  /**
   * Effectue un commit par lots (jusqu'à 500 écritures atomiques)
   */
  async batchSet(writes: Array<{ collection: string; docId: string; data: Record<string, any> }>): Promise<void> {
    if (writes.length === 0) return;

    // Découpage en tranches de 400 écritures max
    const chunkSize = 400;
    for (let i = 0; i < writes.length; i += chunkSize) {
      const chunk = writes.slice(i, i + chunkSize);
      const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents:commit`;
      const headers = await this.getHeaders();

      const firestoreWrites = chunk.map(w => ({
        update: {
          name: `${this.baseUrl}/${encodeURIComponent(w.collection)}/${encodeURIComponent(w.docId)}`,
          fields: toFirestoreDocument(w.data).fields,
        },
      }));

      const res = await this.executeFetch('BATCH_COMMIT', url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ writes: firestoreWrites }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw buildFirestoreHttpError('BATCH_COMMIT', res.status, err);
      }
    }
  }

  /**
   * Effectue un commit atomique de documents avec support de transaction et préconditions.
   */
  async commit(params: {
    transaction?: string;
    writes: Array<{
      collection: string;
      docId: string;
      data: Record<string, any>;
      precondition?: { exists?: boolean; updateTime?: string };
    }>;
  }): Promise<void> {
    if (params.writes.length === 0) return;
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents:commit`;
    const headers = await this.getHeaders();

    const firestoreWrites = params.writes.map(w => {
      const writeObj: any = {
        update: {
          name: `${this.baseUrl}/${encodeURIComponent(w.collection)}/${encodeURIComponent(w.docId)}`,
          fields: toFirestoreDocument(w.data).fields,
        },
      };
      if (w.precondition) {
        writeObj.currentDocument = {};
        if (w.precondition.exists !== undefined) {
          writeObj.currentDocument.exists = w.precondition.exists;
        }
        if (w.precondition.updateTime) {
          writeObj.currentDocument.updateTime = w.precondition.updateTime;
        }
      }
      return writeObj;
    });

    const body: Record<string, any> = { writes: firestoreWrites };
    if (params.transaction) {
      body.transaction = params.transaction;
    }

    const res = await this.executeFetch('COMMIT', url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw buildFirestoreHttpError('COMMIT', res.status, err);
    }
  }
}
