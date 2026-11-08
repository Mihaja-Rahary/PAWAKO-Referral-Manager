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
  AuditLog
} from './types';

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
    const res = await fetch('/api/auth/me');
    return res.json();
  },

  async getOAuthUrl(portal: 'admin' | 'parrain' = 'admin'): Promise<{
    url: string;
    portal: string;
    isConfigured: boolean;
    redirectUri: string;
    appUrl: string;
  }> {
    const res = await fetch(`/api/auth/url?portal=${portal}`);
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
  },

  // Firestore Management (Plan Spark)
  async getFirestoreStatus(): Promise<{
    isConfigured: boolean;
    isConnected: boolean;
    projectId: string | null;
    clientEmail: string | null;
    storageMode: 'firestore' | 'local';
    error: string | null;
  }> {
    const res = await fetch('/api/admin/firestore/status');
    return res.json();
  },

  async createFirestoreBackup(): Promise<{ success: boolean; backupPath: string; message: string }> {
    const res = await fetch('/api/admin/firestore/backup', { method: 'POST' });
    return res.json();
  },

  async migrateToFirestore(): Promise<{
    success: boolean;
    backupPath: string;
    details: Record<string, number>;
    message: string;
  }> {
    const res = await fetch('/api/admin/firestore/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    return res.json();
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

    const res = await fetch(`/api/candidates?${query.toString()}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors du chargement des candidats');
    return res.json();
  },

  async getCandidate(id: string): Promise<{
    candidate: Candidate;
    statusHistory: StatusHistoryEntry[];
    attributionHistory: ReferralAttributionHistoryEntry[];
  }> {
    const res = await fetch(`/api/candidates/${id}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors du chargement du dossier');
    return res.json();
  },

  async createCandidate(payload: {
    discordUserId: string;
    username: string;
    displayName?: string;
    vaType: VAType;
    inviteCodeUsed?: string;
  }): Promise<{ success: boolean; candidate: Candidate; isNew: boolean; edgeCase: string | null }> {
    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la création');
    return res.json();
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
    const res = await fetch(`/api/candidates/${candidateId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la mise à jour du statut');
    return res.json();
  },

  async reassignReferrer(
    candidateId: string,
    payload: { newReferrerId: string; reason: string }
  ): Promise<{ success: boolean; candidate: Candidate }> {
    const res = await fetch(`/api/candidates/${candidateId}/referrer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la réattribution');
    return res.json();
  },

  async updateCandidateVAType(
    candidateId: string,
    newVaType: VAType,
    reason: string
  ): Promise<{ success: boolean; candidate: Candidate }> {
    const res = await fetch(`/api/candidates/${candidateId}/va-type`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newVaType, reason }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors du changement de type VA');
    return res.json();
  },

  async clearCandidateAnomaly(
    candidateId: string,
    resolutionNotes: string
  ): Promise<{ success: boolean; candidate: Candidate }> {
    const res = await fetch(`/api/candidates/${candidateId}/clear-anomaly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNotes }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la résolution de l anomalie');
    return res.json();
  },

  // Referrers
  async getReferrers(): Promise<{ referrers: Referrer[] }> {
    const res = await fetch('/api/referrers');
    if (!res.ok) throw new Error('Erreur lors du chargement des parrains');
    return res.json();
  },

  async createReferrer(payload: {
    discordUserId: string;
    inviteCode?: string;
    notes?: string;
  }): Promise<{ success: boolean; referrer: Referrer }> {
    const res = await fetch('/api/referrers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur création parrain');
    return res.json();
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
      valides: number;
      enProduction: number;
      abandonnes: number;
      conversionRate: number;
      acceptanceRate: number;
    };
    candidates: Candidate[];
  }> {
    const res = await fetch('/api/parrain/dashboard');
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur chargement espace parrain');
    return res.json();
  },

  // Stats
  async getOverviewStats(): Promise<OverviewStatistics> {
    const res = await fetch('/api/stats/overview');
    if (!res.ok) throw new Error('Erreur lors du chargement des statistiques');
    return res.json();
  },

  // Discord Servers & Role Mappings
  async getDiscordServers(): Promise<{ servers: DiscordServerInfo[] }> {
    const res = await fetch('/api/discord/servers');
    if (!res.ok) throw new Error('Erreur serveurs Discord');
    return res.json();
  },

  async getRoleMappings(): Promise<{ mappings: DiscordRoleMapping[] }> {
    const res = await fetch('/api/discord/role-mappings');
    if (!res.ok) throw new Error('Erreur chargement des correspondances de rôles');
    return res.json();
  },

  async updateRoleMappings(mappings: DiscordRoleMapping[]): Promise<{ success: boolean; mappings: DiscordRoleMapping[] }> {
    const res = await fetch('/api/discord/role-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur sauvegarde des rôles');
    return res.json();
  },

  async syncServerMembers(serverId: string, members: any[]): Promise<{ success: boolean; synchronizedCount: number; anomaliesCount: number }> {
    const res = await fetch('/api/discord/sync-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, members }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur lors de la synchronisation des membres');
    return res.json();
  },

  // Users & Permissions
  async getUsers(): Promise<{ users: User[] }> {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Erreur utilisateurs');
    return res.json();
  },

  async updateUserRole(userId: string, newRole: UserRole): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newRole }),
    });
    if (!res.ok) throw new Error('Erreur mise à jour rôle');
    return res.json();
  },

  // Audit Logs
  async getAuditLogs(limit = 100): Promise<{ auditLogs: AuditLog[] }> {
    const res = await fetch(`/api/audit-logs?limit=${limit}`);
    if (!res.ok) throw new Error('Erreur chargement logs');
    return res.json();
  },
};
