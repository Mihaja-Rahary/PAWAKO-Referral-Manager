import {
  Candidate,
  CandidateStatus,
  AdminStatus,
  OperationalStatus,
  OverviewStatistics,
  Referrer,
  StatusHistoryEntry,
  ReferralAttributionHistoryEntry,
  User,
  UserRole,
  VAType,
  DiscordServerInfo,
  DiscordRoleMapping,
  AuditLog,
} from './types';

// Base URL de l'API : Cloudflare Worker (ex: https://pawako-api.<subdomain>.workers.dev) ou même origine en local
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Synchronisation automatique de la session depuis le fragment d'URL (#), les query params, ou postMessage
if (typeof window !== 'undefined') {
  // 1. Extraction sécurisée depuis le fragment d'URL (Hash)
  const hashString = window.location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hashString);
  const urlParams = new URLSearchParams(window.location.search);

  const sessionToken =
    hashParams.get('sessionToken') ||
    hashParams.get('token') ||
    hashParams.get('session') ||
    urlParams.get('sessionToken') ||
    urlParams.get('token') ||
    urlParams.get('session');

  if (sessionToken) {
    localStorage.setItem('pawako_session_token', sessionToken);
    localStorage.setItem('pawako_user_id', sessionToken);

    // Nettoie immédiatement l'URL (hash et search) sans recharger la page
    urlParams.delete('sessionToken');
    urlParams.delete('token');
    urlParams.delete('session');
    const newSearch = urlParams.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);
  }

  // 2. Écoute les événements d'authentification émis par le popup OAuth Discord avec validation d'origine stricte
  window.addEventListener('message', (ev: MessageEvent) => {
    // Vérification de l'origine : seul le backend autorisé ou l'origine courante est accepté
    const trustedBackendOrigin = API_BASE ? new URL(API_BASE).origin : window.location.origin;
    if (ev.origin !== trustedBackendOrigin && ev.origin !== window.location.origin) {
      return;
    }

    if (ev.data && ev.data.type === 'OAUTH_AUTH_SUCCESS') {
      const token = ev.data.token || ev.data.userId;
      if (token && typeof token === 'string') {
        localStorage.setItem('pawako_session_token', token);
        localStorage.setItem('pawako_user_id', ev.data.userId || token);
      }
    }
  });
}

function getHeaders(customHeaders?: HeadersInit): Headers {
  const headers = new Headers(customHeaders || {});
  if (typeof window !== 'undefined') {
    const sessionToken = localStorage.getItem('pawako_session_token') || localStorage.getItem('pawako_user_id');
    if (sessionToken) {
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${sessionToken}`);
      }
      if (!headers.has('X-Pawako-Session')) {
        headers.set('X-Pawako-Session', sessionToken);
      }
      if (!headers.has('X-Pawako-User-Id')) {
        headers.set('X-Pawako-User-Id', sessionToken);
      }
    }
  }
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = getHeaders(options.headers);

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errMsg = `Erreur HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg = errJson.error || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  // Auth
  async getAuthMe(): Promise<{
    authenticated: boolean;
    user: User | null;
    referrer: Referrer | null;
    isOAuthConfigured: boolean;
    isBotConfigured: boolean;
    isInitialAdminClaimed?: boolean;
  }> {
    return request('/api/auth/me');
  },

  async getOAuthUrl(portal: 'admin' | 'parrain' = 'admin'): Promise<{
    url: string;
    portal: string;
    isConfigured: boolean;
    redirectUri: string;
    appUrl: string;
  }> {
    return request(`/api/auth/url?portal=${portal}`);
  },

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pawako_session_token');
      localStorage.removeItem('pawako_user_id');
    }
    await request('/api/auth/logout', { method: 'POST' });
  },

  // Firestore Management (Plan Spark / Workers)
  async getFirestoreStatus(): Promise<{
    isConfigured: boolean;
    isConnected: boolean;
    projectId: string | null;
    clientEmail: string | null;
    storageMode: 'firestore' | 'local';
    error: string | null;
  }> {
    return request('/api/admin/firestore/status');
  },

  async createFirestoreBackup(): Promise<{ success: boolean; backupPath: string; message: string }> {
    return request('/api/admin/firestore/backup', { method: 'POST' });
  },

  async migrateToFirestore(): Promise<{
    success: boolean;
    backupPath: string;
    details: Record<string, number>;
    message: string;
  }> {
    return request('/api/admin/firestore/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
  },

  // Candidates
  async getCandidates(params?: {
    search?: string;
    vaType?: VAType | 'ALL';
    adminStatus?: AdminStatus | 'ALL';
    operationalStatus?: OperationalStatus | 'ALL';
    status?: CandidateStatus | 'ALL';
    server?: string;
    attributionStatus?: string;
    hasAnomaly?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{
    candidates: Candidate[];
    total: number;
    page: number;
    totalPages: number;
    pageSize: number;
  }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.vaType && params.vaType !== 'ALL') query.set('vaType', params.vaType);
    if (params?.adminStatus && params.adminStatus !== 'ALL') query.set('adminStatus', params.adminStatus);
    if (params?.operationalStatus && params.operationalStatus !== 'ALL') query.set('operationalStatus', params.operationalStatus);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.server && params.server !== 'ALL') query.set('server', params.server);
    if (params?.attributionStatus && params.attributionStatus !== 'ALL') query.set('attributionStatus', params.attributionStatus);
    if (params?.hasAnomaly !== undefined) query.set('hasAnomaly', params.hasAnomaly ? 'true' : 'false');
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    return request(`/api/candidates?${query.toString()}`);
  },

  async getCandidate(id: string): Promise<{
    candidate: Candidate;
    statusHistory: StatusHistoryEntry[];
    attributionHistory: ReferralAttributionHistoryEntry[];
  }> {
    return request(`/api/candidates/${id}`);
  },

  async createCandidate(payload: {
    discordUserId: string;
    username: string;
    displayName?: string;
    vaType: VAType;
    inviteCodeUsed?: string;
  }): Promise<{ success: boolean; candidate: Candidate; isNew: boolean; edgeCase: string | null }> {
    return request('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async updateCandidateStatus(
    candidateId: string,
    payload: {
      newAdminStatus?: AdminStatus;
      newOperationalStatus?: OperationalStatus;
      newStatus?: CandidateStatus;
      refusalReason?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; candidate: Candidate }> {
    return request(`/api/candidates/${candidateId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async reassignReferrer(
    candidateId: string,
    payload: { newReferrerId: string; reason: string }
  ): Promise<{ success: boolean; candidate: Candidate }> {
    return request(`/api/candidates/${candidateId}/referrer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async updateCandidateVAType(
    candidateId: string,
    newVaType: VAType,
    reason: string
  ): Promise<{ success: boolean; candidate: Candidate }> {
    return request(`/api/candidates/${candidateId}/va-type`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newVaType, reason }),
    });
  },

  async clearCandidateAnomaly(
    candidateId: string,
    resolutionNotes: string
  ): Promise<{ success: boolean; candidate: Candidate }> {
    return request(`/api/candidates/${candidateId}/clear-anomaly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNotes }),
    });
  },

  // Referrers
  async getReferrers(): Promise<{ referrers: Referrer[] }> {
    return request('/api/referrers');
  },

  async createReferrer(payload: {
    discordUserId: string;
    inviteCode?: string;
    notes?: string;
  }): Promise<{ success: boolean; referrer: Referrer }> {
    return request('/api/referrers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async toggleReferrer(id: string): Promise<{ success: boolean; referrer: Referrer }> {
    return request(`/api/referrers/${id}/toggle`, { method: 'PATCH' });
  },

  // Parrain Personal Space
  async getParrainDashboard(): Promise<{
    referrer: Referrer;
    metrics: {
      totalFilleuls: number;
      enAttente: number;
      acceptes: number;
      refuses: number;
      enFormation: number;
      enSimulation: number;
      enProduction: number;
      abandonnes: number;
      conversionRate: number;
      acceptanceRate: number;
    };
    candidates: Candidate[];
  }> {
    return request('/api/parrain/dashboard');
  },

  // Stats
  async getOverviewStats(): Promise<OverviewStatistics> {
    return request('/api/stats/overview');
  },

  // Discord Servers & Role Mappings
  async getDiscordServers(): Promise<{ servers: DiscordServerInfo[] }> {
    return request('/api/discord/servers');
  },

  async getRoleMappings(): Promise<{ mappings: DiscordRoleMapping[] }> {
    return request('/api/discord/role-mappings');
  },

  async updateRoleMappings(mappings: DiscordRoleMapping[]): Promise<{ success: boolean; mappings: DiscordRoleMapping[] }> {
    return request('/api/discord/role-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });
  },

  async syncServerMembers(serverId: string, members: any[]): Promise<{ success: boolean; synchronizedCount: number; anomaliesCount: number }> {
    return request('/api/discord/sync-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, members }),
    });
  },

  // Users & Permissions
  async getUsers(): Promise<{ users: User[] }> {
    return request('/api/users');
  },

  async updateUserRole(userId: string, newRole: UserRole): Promise<{ success: boolean; user: User }> {
    return request(`/api/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole }),
    });
  },

  // Audit Logs
  async getAuditLogs(limit = 100): Promise<{ auditLogs: AuditLog[] }> {
    return request(`/api/audit-logs?limit=${limit}`);
  },
};
