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

// Cache du token d'accès Google OAuth2
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

/**
 * Convertit une clé privée PEM PKCS#8 en ArrayBuffer binaire pour crypto.subtle.importKey
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/[\r\n\s]/g, '');

  const binaryString = atob(cleanPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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

/**
 * Génère un JWT Google OAuth2 signé avec RS256 et l'échange contre un Access Token Google
 */
async function getGoogleAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Vérifier le cache (avec marge de 5 minutes)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
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
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      };

      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(payload));
      const message = `${encodedHeader}.${encodedPayload}`;

      const privateKeyBuffer = pemToArrayBuffer(privateKeyPem);
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['sign']
      );

      const encoder = new TextEncoder();
      const signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        encoder.encode(message)
      );

      const signature = bufferToBase64Url(signatureBuffer);
      const jwt = `${message}.${signature}`;

      // Échange du JWT contre un access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Échec de l'obtention du token Google OAuth2 (${tokenRes.status}) : ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
      cachedToken = {
        accessToken: tokenData.access_token,
        expiresAt: now + (tokenData.expires_in || 3600),
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
    this.projectId = config.projectId;
    this.databaseId = config.databaseId || '(default)';
    this.clientEmail = config.clientEmail;
    this.privateKey = config.privateKey;
  }

  private get baseUrl(): string {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.clientEmail && this.privateKey) {
      const token = await getGoogleAccessToken(this.clientEmail, this.privateKey);
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Récupère un document par sa collection et son ID
   */
  async getDocument<T = any>(collection: string, docId: string): Promise<T | null> {
    const url = `${this.baseUrl}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
    const headers = await this.getHeaders();
    const res = await fetch(url, { headers });

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Firestore GET ${collection}/${docId} a échoué (${res.status}): ${err}`);
    }

    const doc = await res.json();
    return fromFirestoreDocument<T>(doc);
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

    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Firestore SET ${collection}/${docId} a échoué (${res.status}): ${err}`);
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
    const res = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (res.status === 404 || res.ok) {
      return true;
    }
    const err = await res.text();
    throw new Error(`Firestore DELETE ${collection}/${docId} a échoué (${res.status}): ${err}`);
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
      const res = await fetch(url, { headers });

      if (!res.ok) {
        if (res.status === 404) return allDocuments;
        const err = await res.text();
        throw new Error(`Firestore LIST ${collection} a échoué (${res.status}): ${err}`);
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

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ writes: firestoreWrites }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Firestore BATCH commit a échoué (${res.status}): ${err}`);
      }
    }
  }
}
