import fs from 'fs';
import path from 'path';
import {
  DatabaseSchema,
  User,
  Referrer,
  Candidate,
  StatusHistoryEntry,
  ReferralAttributionHistoryEntry,
  DiscordServerInfo,
  DiscordMembership,
  RecruitmentEvent,
  AuditLog,
  UserRole,
  VAType,
  AdminStatus,
  OperationalStatus,
  CandidateStatus,
  DiscordServerType,
  PawakoRoleType,
  DiscordRoleMapping,
} from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pawako_db.json');

// Configuration des 4 serveurs Discord indépendants PAWAKO
const OFFICIAL_DISCORD_SERVERS: DiscordServerInfo[] = [
  {
    id: 'RECRUTEMENT',
    guildId: process.env.DISCORD_RECRUITMENT_GUILD_ID || '',
    name: 'PAWAKO — Serveur Recrutement',
    description: 'Accueil de tous les candidats, orientation VA Chatteurs et VA Instagram.',
    inviteBaseUrl: 'https://discord.gg/pawako-recrutement',
    memberCount: 0,
    botConnected: Boolean(process.env.DISCORD_BOT_TOKEN),
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'FORMATION',
    guildId: process.env.DISCORD_FORMATION_GUILD_ID || '',
    name: 'PAWAKO — Serveur Formation',
    description: 'Réservé exclusivement aux VA Chatteurs en cours de formation.',
    inviteBaseUrl: 'https://discord.gg/pawako-formation',
    memberCount: 0,
    botConnected: Boolean(process.env.DISCORD_BOT_TOKEN),
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_CHATTING',
    guildId: process.env.DISCORD_CHATTING_PRODUCTION_GUILD_ID || '',
    name: 'PAWAKO — Serveur Production VA Chatting',
    description: 'Réservé aux VA Chatteurs validés en production active.',
    inviteBaseUrl: 'https://discord.gg/pawako-prod-chatting',
    memberCount: 0,
    botConnected: Boolean(process.env.DISCORD_BOT_TOKEN),
    lastSyncAt: new Date().toISOString(),
  },
  {
    id: 'PRODUCTION_INSTAGRAM',
    guildId: process.env.DISCORD_INSTAGRAM_PRODUCTION_GUILD_ID || '',
    name: 'PAWAKO — Serveur Production VA Instagram',
    description: 'Réservé aux VA Instagram acceptés en production active.',
    inviteBaseUrl: 'https://discord.gg/pawako-prod-instagram',
    memberCount: 0,
    botConnected: Boolean(process.env.DISCORD_BOT_TOKEN),
    lastSyncAt: new Date().toISOString(),
  },
];

// Mappings initiaux par défaut des rôles Discord pour chacun des 4 serveurs
const DEFAULT_ROLE_MAPPINGS: DiscordRoleMapping[] = [
  // 1. Serveur Recrutement
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT', discordRoleId: '', roleName: 'Candidat (En attente)' },
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT_ACCEPTE', discordRoleId: '', roleName: 'Candidat Accepté' },
  { serverId: 'RECRUTEMENT', roleType: 'CANDIDAT_REFUSE', discordRoleId: '', roleName: 'Candidat Refusé' },

  // 2. Serveur Formation (Chatteurs uniquement)
  { serverId: 'FORMATION', roleType: 'EN_FORMATION', discordRoleId: '', roleName: 'En Formation' },
  { serverId: 'FORMATION', roleType: 'EN_SIMULATION', discordRoleId: '', roleName: 'En Simulation' },
  { serverId: 'FORMATION', roleType: 'VA_VALIDE', discordRoleId: '', roleName: 'VA Validé' },

  // 3. Serveur Production VA Chatting
  { serverId: 'PRODUCTION_CHATTING', roleType: 'VA_PRODUCTION', discordRoleId: '', roleName: 'VA Chatteur Production' },

  // 4. Serveur Production VA Instagram
  { serverId: 'PRODUCTION_INSTAGRAM', roleType: 'VA_PRODUCTION', discordRoleId: '', roleName: 'VA Instagram Production' },
];

export function deriveCandidateStatus(
  adminStatus: AdminStatus,
  operationalStatus: OperationalStatus
): CandidateStatus {
  if (adminStatus === 'REFUSE') return 'REFUSE';
  if (adminStatus === 'ABANDONNE') return 'ABANDONNE';
  if (operationalStatus === 'PRODUCTION') return 'EN_PRODUCTION';
  if (operationalStatus === 'VALIDE') return 'VALIDE';
  if (operationalStatus === 'SIMULATION') return 'EN_SIMULATION';
  if (operationalStatus === 'FORMATION') return 'EN_FORMATION';
  if (operationalStatus === 'RECRUTEMENT' && adminStatus === 'ACCEPTE') return 'ACCEPTE';
  return 'EN_ATTENTE';
}

class DatabaseService {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirectory();
    this.data = this.loadDatabase();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Ensure all 4 servers are present and updated
        const existingServers: DiscordServerInfo[] = parsed.discord_servers || [];
        const servers: DiscordServerInfo[] = OFFICIAL_DISCORD_SERVERS.map(def => {
          const found = existingServers.find(s => s.id === def.id);
          return {
            ...def,
            guildId: found?.guildId || def.guildId,
            memberCount: found?.memberCount || 0,
            botConnected: found?.botConnected ?? def.botConnected,
            lastSyncAt: found?.lastSyncAt || def.lastSyncAt,
          };
        });

        // Ensure role mappings
        const roleMappings: DiscordRoleMapping[] = parsed.discord_role_mappings?.length
          ? parsed.discord_role_mappings
          : DEFAULT_ROLE_MAPPINGS;

        // Migrate candidates if necessary
        const candidates: Candidate[] = (parsed.candidates || []).map((c: any) => {
          const adminStatus: AdminStatus =
            c.adminStatus ||
            (c.status === 'REFUSE'
              ? 'REFUSE'
              : c.status === 'ABANDONNE'
              ? 'ABANDONNE'
              : c.status === 'EN_ATTENTE'
              ? 'EN_ATTENTE'
              : 'ACCEPTE');

          let operationalStatus: OperationalStatus =
            c.operationalStatus ||
            (c.status === 'EN_PRODUCTION'
              ? 'PRODUCTION'
              : c.status === 'VALIDE'
              ? 'VALIDE'
              : c.status === 'EN_SIMULATION'
              ? 'SIMULATION'
              : c.status === 'EN_FORMATION'
              ? 'FORMATION'
              : c.status === 'REFUSE' || c.status === 'ABANDONNE'
              ? 'INACTIF'
              : 'RECRUTEMENT');

          // Correct server assignment if legacy
          let currentServer: DiscordServerType | 'AUCUN' = c.currentServer;
          if (currentServer === ('PRODUCTION' as any)) {
            currentServer = c.vaType === 'INSTAGRAM' ? 'PRODUCTION_INSTAGRAM' : 'PRODUCTION_CHATTING';
          }

          return {
            ...c,
            adminStatus,
            operationalStatus,
            status: deriveCandidateStatus(adminStatus, operationalStatus),
            hasAnomaly: Boolean(c.hasAnomaly),
            anomalyReason: c.anomalyReason || null,
            discordRoles: Array.isArray(c.discordRoles) ? c.discordRoles : [],
            currentServer,
          };
        });

        return {
          users: parsed.users || [],
          referrers: parsed.referrers || [],
          candidates,
          status_history: parsed.status_history || [],
          referral_attributions_history: parsed.referral_attributions_history || [],
          discord_servers: servers,
          discord_role_mappings: roleMappings,
          discord_memberships: parsed.discord_memberships || [],
          recruitment_events: parsed.recruitment_events || [],
          audit_logs: parsed.audit_logs || [],
          meta: parsed.meta || { initialAdminClaimed: false },
        };
      } catch (err) {
        console.error('Error reading database file:', err);
      }
    }

    const emptyDb: DatabaseSchema = {
      users: [],
      referrers: [],
      candidates: [],
      status_history: [],
      referral_attributions_history: [],
      discord_servers: OFFICIAL_DISCORD_SERVERS,
      discord_role_mappings: DEFAULT_ROLE_MAPPINGS,
      discord_memberships: [],
      recruitment_events: [],
      audit_logs: [],
      meta: { initialAdminClaimed: false },
    };
    this.saveDatabase(emptyDb);
    return emptyDb;
  }

  public saveDatabase(dataToSave?: DatabaseSchema) {
    const data = dataToSave || this.data;
    try {
      this.ensureDirectory();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to save database file atomically:', err);
    }
  }

  public purgeAllFakeData(): void {
    this.data = {
      users: [],
      referrers: [],
      candidates: [],
      status_history: [],
      referral_attributions_history: [],
      discord_servers: OFFICIAL_DISCORD_SERVERS,
      discord_role_mappings: DEFAULT_ROLE_MAPPINGS,
      discord_memberships: [],
      recruitment_events: [],
      audit_logs: [],
      meta: { initialAdminClaimed: false },
    };
    this.saveDatabase();
  }

  public isInitialAdminClaimed(): boolean {
    return Boolean(this.data.meta?.initialAdminClaimed);
  }

  public getInitialAdminConfiguredId(): string {
    return (
      process.env.INITIAL_ADMIN_DISCORD_ID ||
      process.env.PAWAKO_INITIAL_ADMIN_DISCORD_ID ||
      ''
    ).trim();
  }

  public getAllData(): DatabaseSchema {
    return this.data;
  }

  /**
   * Vérifie si un Discord User ID est autorisé à accéder à l'Espace Administration
   */
  public canAccessAdmin(discordUserId: string): { authorized: boolean; reason?: string; isInitialAdmin?: boolean } {
    const existing = this.getUserById(discordUserId);
    if (existing && (existing.role === 'ADMINISTRATEUR' || existing.role === 'RESPONSABLE')) {
      return { authorized: true, isInitialAdmin: false };
    }

    const configuredAdminId = this.getInitialAdminConfiguredId();
    if (!this.isInitialAdminClaimed() && configuredAdminId && discordUserId === configuredAdminId) {
      return { authorized: true, isInitialAdmin: true };
    }

    if (!configuredAdminId && !this.isInitialAdminClaimed()) {
      return {
        authorized: false,
        reason: 'La variable serveur INITIAL_ADMIN_DISCORD_ID (ou PAWAKO_INITIAL_ADMIN_DISCORD_ID) n est pas configurée. Aucun administrateur initial n est défini.',
      };
    }

    return {
      authorized: false,
      reason: `Le compte Discord (ID: ${discordUserId}) n est pas accrédité comme Administrateur ou Responsable PAWAKO.`,
    };
  }

  /**
   * Vérifie si un Discord User ID est autorisé à accéder à l'Espace Parrain
   */
  public canAccessParrain(discordUserId: string): { authorized: boolean; reason?: string } {
    // 1. Parrain formellement enregistré dans la liste des parrains autorisés
    const referrer = this.getReferrerByDiscordUserId(discordUserId);
    if (referrer && referrer.isActive) {
      return { authorized: true };
    }

    // 2. Les Administrateurs et Responsables ont également accès à l'Espace Parrain
    const existing = this.getUserById(discordUserId);
    if (existing && (existing.role === 'ADMINISTRATEUR' || existing.role === 'RESPONSABLE')) {
      return { authorized: true };
    }

    return {
      authorized: false,
      reason: `Le compte Discord (ID: ${discordUserId}) n est pas enregistré comme Parrain autorisé PAWAKO. Contactez la Direction pour être ajouté.`,
    };
  }

  // --- Users & RBAC ---
  getUsers(): User[] {
    return this.data.users;
  }

  getUserById(id: string): User | undefined {
    return this.data.users.find(u => u.id === id);
  }

  getUserByUsername(username: string): User | undefined {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  upsertUser(user: Partial<User> & { id: string }): User {
    const existingIndex = this.data.users.findIndex(u => u.id === user.id);
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      const existing = this.data.users[existingIndex];
      const updated: User = {
        ...existing,
        username: user.username || existing.username,
        displayName: user.displayName || existing.displayName,
        avatar: user.avatar !== undefined ? user.avatar : existing.avatar,
        lastLoginAt: now,
        role: existing.role, // Le rôle ne peut pas être modifié par une simple reconnexion
        status: existing.status,
      };
      this.data.users[existingIndex] = updated;
      this.saveDatabase();
      return updated;
    } else {
      // Sécurisation stricte du premier administrateur:
      // Seul le Discord User ID configuré dans PAWAKO_INITIAL_ADMIN_DISCORD_ID
      // peut réclamer le premier rôle ADMINISTRATEUR. Une fois réclamé, le mécanisme est verrouillé.
      const configuredAdminId = this.getInitialAdminConfiguredId();
      const canClaimInitialAdmin =
        !this.isInitialAdminClaimed() &&
        Boolean(configuredAdminId) &&
        user.id === configuredAdminId;

      let assignedRole: UserRole = 'PARRAIN';
      if (canClaimInitialAdmin) {
        assignedRole = 'ADMINISTRATEUR';
        this.data.meta = {
          initialAdminClaimed: true,
          initialAdminClaimedAt: now,
          initialAdminDiscordUserId: user.id,
        };
      } else if (user.role && ['ADMINISTRATEUR', 'RESPONSABLE', 'PARRAIN'].includes(user.role)) {
        assignedRole = user.role;
      }

      const newUser: User = {
        id: user.id,
        username: user.username || `user_${user.id.slice(-4)}`,
        displayName: user.displayName || user.username || `User ${user.id}`,
        avatar: user.avatar || null,
        role: assignedRole,
        status: user.status || 'ACTIVE',
        createdAt: now,
        lastLoginAt: now,
      };
      this.data.users.push(newUser);
      this.saveDatabase();

      if (canClaimInitialAdmin) {
        this.logAudit({
          action: 'INITIAL_ADMIN_CLAIMED',
          actorUserId: user.id,
          actorName: newUser.displayName,
          targetType: 'USER',
          targetId: user.id,
          details: {
            configuredAdminId,
            message: 'Premier administrateur PAWAKO initialisé via PAWAKO_INITIAL_ADMIN_DISCORD_ID.',
          },
        });
      }

      return newUser;
    }
  }

  updateUserRole(userId: string, newRole: UserRole, actorId: string, actorName: string): User | null {
    const user = this.getUserById(userId);
    if (!user) return null;
    const oldRole = user.role;
    user.role = newRole;
    this.saveDatabase();

    this.logAudit({
      action: 'USER_ROLE_CHANGE',
      actorUserId: actorId,
      actorName: actorName,
      targetType: 'USER',
      targetId: userId,
      details: { oldRole, newRole, targetName: user.displayName },
    });

    return user;
  }

  // --- Role Mappings (Configuration des 4 serveurs) ---
  getRoleMappings(): DiscordRoleMapping[] {
    return this.data.discord_role_mappings;
  }

  getRoleMappingsForServer(serverId: DiscordServerType): DiscordRoleMapping[] {
    return this.data.discord_role_mappings.filter(m => m.serverId === serverId);
  }

  updateRoleMapping(params: {
    serverId: DiscordServerType;
    roleType: PawakoRoleType;
    discordRoleId: string;
    roleName?: string;
    actorUserId: string;
    actorName: string;
  }): DiscordRoleMapping {
    const existingIndex = this.data.discord_role_mappings.findIndex(
      m => m.serverId === params.serverId && m.roleType === params.roleType
    );

    const now = new Date().toISOString();
    const updated: DiscordRoleMapping = {
      serverId: params.serverId,
      roleType: params.roleType,
      discordRoleId: params.discordRoleId.trim(),
      roleName: params.roleName?.trim(),
      updatedAt: now,
      updatedBy: params.actorName,
    };

    if (existingIndex >= 0) {
      this.data.discord_role_mappings[existingIndex] = updated;
    } else {
      this.data.discord_role_mappings.push(updated);
    }
    this.saveDatabase();

    this.logAudit({
      action: 'ROLE_MAPPING_UPDATED',
      actorUserId: params.actorUserId,
      actorName: params.actorName,
      targetType: 'ROLE_MAPPING',
      targetId: `${params.serverId}:${params.roleType}`,
      details: {
        serverId: params.serverId,
        roleType: params.roleType,
        discordRoleId: params.discordRoleId,
        roleName: params.roleName,
      },
    });

    return updated;
  }

  bulkUpdateRoleMappings(
    mappings: Array<{ serverId: DiscordServerType; roleType: PawakoRoleType; discordRoleId: string; roleName?: string }>,
    actorUserId: string,
    actorName: string
  ): DiscordRoleMapping[] {
    mappings.forEach(m => {
      this.updateRoleMapping({
        ...m,
        actorUserId,
        actorName,
      });
    });
    return this.data.discord_role_mappings;
  }

  // --- Referrers ---
  getReferrers(): Referrer[] {
    return this.data.referrers;
  }

  getReferrerById(id: string): Referrer | undefined {
    return this.data.referrers.find(r => r.id === id);
  }

  getReferrerByDiscordUserId(discordUserId: string): Referrer | undefined {
    return this.data.referrers.find(r => r.discordUserId === discordUserId);
  }

  getReferrerByInviteCode(inviteCode: string): Referrer | undefined {
    const clean = inviteCode.trim().toUpperCase();
    return this.data.referrers.find(r => r.inviteCode.toUpperCase() === clean);
  }

  createReferrer(params: {
    discordUserId: string;
    inviteCode?: string;
    notes?: string;
    actorUserId?: string;
    actorName?: string;
  }): Referrer {
    const existing = this.getReferrerByDiscordUserId(params.discordUserId);
    if (existing) return existing;

    const user = this.getUserById(params.discordUserId);
    const username = user ? user.username : `user_${params.discordUserId.slice(-4)}`;
    const displayName = user ? user.displayName : `Parrain ${params.discordUserId.slice(-4)}`;

    const code =
      params.inviteCode?.trim().toUpperCase() ||
      `PWK-${username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;

    const newReferrer: Referrer = {
      id: `ref-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      discordUserId: params.discordUserId,
      discordUsername: username,
      discordDisplayName: displayName,
      inviteCode: code,
      inviteUrl: `https://discord.gg/pawako-recrutement?ref=${code}`,
      usesCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      notes: params.notes,
    };

    this.data.referrers.push(newReferrer);
    this.saveDatabase();

    if (params.actorUserId) {
      this.logAudit({
        action: 'REFERRER_CREATED',
        actorUserId: params.actorUserId,
        actorName: params.actorName || 'Système',
        targetType: 'REFERRER',
        targetId: newReferrer.id,
        details: { code, discordUserId: params.discordUserId, displayName },
      });
    }

    return newReferrer;
  }

  incrementReferrerUsage(referrerId: string): void {
    const r = this.getReferrerById(referrerId);
    if (r) {
      r.usesCount = (r.usesCount || 0) + 1;
      this.saveDatabase();
    }
  }

  // --- Candidates (Dossiers des agents & parcours) ---
  getCandidates(filters?: {
    search?: string;
    vaType?: VAType | 'ALL';
    adminStatus?: AdminStatus | 'ALL';
    operationalStatus?: OperationalStatus | 'ALL';
    status?: CandidateStatus | 'ALL';
    server?: DiscordServerType | 'AUCUN' | 'ALL';
    attributionStatus?: Candidate['attributionStatus'] | 'ALL';
    hasAnomaly?: boolean;
    referrerId?: string;
  }): Candidate[] {
    let result = [...this.data.candidates];

    if (filters?.referrerId) {
      result = result.filter(c => c.referrerId === filters.referrerId);
    }

    if (filters?.vaType && filters.vaType !== 'ALL') {
      result = result.filter(c => c.vaType === filters.vaType);
    }

    if (filters?.adminStatus && filters.adminStatus !== 'ALL') {
      result = result.filter(c => c.adminStatus === filters.adminStatus);
    }

    if (filters?.operationalStatus && filters.operationalStatus !== 'ALL') {
      result = result.filter(c => c.operationalStatus === filters.operationalStatus);
    }

    if (filters?.status && filters.status !== 'ALL') {
      result = result.filter(c => c.status === filters.status);
    }

    if (filters?.server && filters.server !== 'ALL') {
      result = result.filter(c => c.currentServer === filters.server);
    }

    if (filters?.attributionStatus && filters.attributionStatus !== 'ALL') {
      result = result.filter(c => c.attributionStatus === filters.attributionStatus);
    }

    if (filters?.hasAnomaly !== undefined) {
      result = result.filter(c => Boolean(c.hasAnomaly) === filters.hasAnomaly);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        c =>
          c.username.toLowerCase().includes(q) ||
          c.displayName.toLowerCase().includes(q) ||
          c.discordUserId.includes(q) ||
          (c.referrerName && c.referrerName.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());
    return result;
  }

  getCandidateById(id: string): Candidate | undefined {
    return this.data.candidates.find(c => c.id === id);
  }

  getCandidateByDiscordUserId(discordUserId: string): Candidate | undefined {
    return this.data.candidates.find(c => c.discordUserId === discordUserId);
  }

  createOrUpdateCandidateOnDiscordJoin(params: {
    discordUserId: string;
    username: string;
    displayName: string;
    avatar: string | null;
    inviteCodeUsed?: string | null;
    vaType?: VAType;
    originServer?: DiscordServerType;
  }): { candidate: Candidate; isNew: boolean; edgeCase: string | null } {
    const existing = this.getCandidateByDiscordUserId(params.discordUserId);
    const now = new Date().toISOString();
    const server = params.originServer || 'RECRUTEMENT';

    if (existing) {
      existing.username = params.username;
      existing.displayName = params.displayName;
      if (params.avatar) existing.avatar = params.avatar;
      existing.currentServer = server;
      existing.updatedAt = now;
      this.saveDatabase();

      this.logStatusHistory({
        candidateId: existing.id,
        fromStatus: existing.status,
        toStatus: existing.status,
        fromAdminStatus: existing.adminStatus,
        toAdminStatus: existing.adminStatus,
        fromOperationalStatus: existing.operationalStatus,
        toOperationalStatus: existing.operationalStatus,
        fromServer: 'AUCUN',
        toServer: server,
        authorUserId: 'JARVIS_BOT',
        authorName: 'Bot JARVIS',
        authorSource: 'JARVIS_GATEWAY',
        reason: `Retour du membre sur le serveur Discord ${server}. Dossier historique et parrain d'origine conservés.`,
        isConfidential: false,
      });

      return { candidate: existing, isNew: false, edgeCase: 'CANDIDAT_DEJA_EXISTANT' };
    }

    let referrer: Referrer | undefined;
    let attributionStatus: Candidate['attributionStatus'] = 'UNCERTAIN';
    let uncertaintyReason: string | null = null;

    if (params.inviteCodeUsed) {
      referrer = this.getReferrerByInviteCode(params.inviteCodeUsed);
      if (referrer) {
        attributionStatus = 'CONFIRMED';
        this.incrementReferrerUsage(referrer.id);
      } else {
        attributionStatus = 'UNCERTAIN';
        uncertaintyReason = `Code d'invitation non reconnu ou expiré: "${params.inviteCodeUsed}". Signalé pour vérification manuelle.`;
      }
    } else {
      attributionStatus = 'UNCERTAIN';
      uncertaintyReason = "Arrivée sans code d'invitation parrain détecté (invitation directe ou vanity URL). Signalé pour vérification manuelle.";
    }

    const defaultVaType: VAType = params.vaType || 'CHATTEUR';

    const newCandidate: Candidate = {
      id: `cand-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      discordUserId: params.discordUserId,
      username: params.username,
      displayName: params.displayName,
      avatar: params.avatar,
      vaType: defaultVaType,
      adminStatus: 'EN_ATTENTE',
      operationalStatus: 'RECRUTEMENT',
      status: 'EN_ATTENTE',
      referrerId: referrer ? referrer.id : null,
      referrerDiscordUserId: referrer ? referrer.discordUserId : null,
      referrerName: referrer ? referrer.discordDisplayName : null,
      attributionStatus,
      uncertaintyReason,
      currentServer: server,
      hasAnomaly: false,
      anomalyReason: null,
      discordRoles: [],
      arrivalDate: now,
      createdAt: now,
      updatedAt: now,
    };

    this.data.candidates.push(newCandidate);
    this.saveDatabase();

    this.logStatusHistory({
      candidateId: newCandidate.id,
      fromStatus: null,
      toStatus: 'EN_ATTENTE',
      fromAdminStatus: null,
      toAdminStatus: 'EN_ATTENTE',
      fromOperationalStatus: null,
      toOperationalStatus: 'RECRUTEMENT',
      fromServer: null,
      toServer: server,
      authorUserId: 'JARVIS_BOT',
      authorName: 'Bot JARVIS',
      authorSource: 'JARVIS_GATEWAY',
      reason: referrer
        ? `Arrivée sur le serveur Recrutement via le parrain ${referrer.discordDisplayName} (${params.inviteCodeUsed})`
        : `Arrivée sans parrain confirmé. ${uncertaintyReason}`,
      isConfidential: false,
    });

    this.logAudit({
      action: 'CANDIDATE_CREATED',
      actorUserId: 'JARVIS_BOT',
      actorName: 'Bot JARVIS',
      targetType: 'CANDIDATE',
      targetId: newCandidate.id,
      details: {
        discordUserId: params.discordUserId,
        vaType: defaultVaType,
        referrerName: referrer?.discordDisplayName,
        attributionStatus,
      },
    });

    return { candidate: newCandidate, isNew: true, edgeCase: attributionStatus === 'UNCERTAIN' ? 'ATTRIBUTION_INCERTAINE' : null };
  }

  // Modification administrative manuelle ou automatique du statut
  updateCandidateStatus(params: {
    candidateId: string;
    newAdminStatus?: AdminStatus;
    newOperationalStatus?: OperationalStatus;
    newStatus?: CandidateStatus;
    authorUserId: string;
    authorName: string;
    authorSource?: 'MANUAL_ADMIN' | 'MANUAL_RESPONSABLE' | 'DISCORD_SYNC' | 'JARVIS_GATEWAY';
    refusalReason?: string;
    notes?: string;
  }): { success: boolean; candidate?: Candidate; error?: string } {
    const candidate = this.getCandidateById(params.candidateId);
    if (!candidate) return { success: false, error: 'Candidat introuvable' };

    const oldAdminStatus = candidate.adminStatus;
    const oldOperationalStatus = candidate.operationalStatus;
    const oldStatus = candidate.status;
    const oldServer = candidate.currentServer;
    const now = new Date().toISOString();
    const source = params.authorSource || 'MANUAL_RESPONSABLE';

    let targetAdmin: AdminStatus = candidate.adminStatus;
    let targetOp: OperationalStatus = candidate.operationalStatus;

    if (params.newAdminStatus) {
      targetAdmin = params.newAdminStatus;
    }
    if (params.newOperationalStatus) {
      targetOp = params.newOperationalStatus;
    }

    // Si newStatus (synthétique) est fourni, déduire les deux statuts
    if (params.newStatus) {
      switch (params.newStatus) {
        case 'EN_ATTENTE':
          targetAdmin = 'EN_ATTENTE';
          targetOp = 'RECRUTEMENT';
          break;
        case 'ACCEPTE':
          targetAdmin = 'ACCEPTE';
          targetOp = 'RECRUTEMENT';
          break;
        case 'EN_FORMATION':
          targetAdmin = 'ACCEPTE';
          targetOp = 'FORMATION';
          break;
        case 'EN_SIMULATION':
          targetAdmin = 'ACCEPTE';
          targetOp = 'SIMULATION';
          break;
        case 'VALIDE':
          targetAdmin = 'ACCEPTE';
          targetOp = 'VALIDE';
          break;
        case 'EN_PRODUCTION':
          targetAdmin = 'ACCEPTE';
          targetOp = 'PRODUCTION';
          break;
        case 'REFUSE':
          targetAdmin = 'REFUSE';
          targetOp = 'INACTIF';
          break;
        case 'ABANDONNE':
          targetAdmin = 'ABANDONNE';
          targetOp = 'INACTIF';
          break;
      }
    }

    // Règle stricte 1 : Un VA Instagram ne doit JAMAIS être envoyé en Formation, Simulation ou Validation
    if (candidate.vaType === 'INSTAGRAM') {
      if (targetOp === 'FORMATION' || targetOp === 'SIMULATION' || targetOp === 'VALIDE') {
        return {
          success: false,
          error: 'Règle métier PAWAKO : Un VA Instagram ne peut pas suivre de Formation, Simulation ou Validation (Parcours direct : Recrutement → Acceptation → Production VA Instagram).',
        };
      }
    }

    // Règle stricte 2 : Motif de refus obligatoire lors du rejet
    if (targetAdmin === 'REFUSE') {
      if (!params.refusalReason && !params.notes) {
        return {
          success: false,
          error: 'Un motif de refus détaillé est obligatoire pour rejeter une candidature.',
        };
      }
      candidate.refusalReason = (params.refusalReason || params.notes || '').trim();
      targetOp = 'INACTIF';
    }

    // Règle stricte 3 : Si abandonné
    if (targetAdmin === 'ABANDONNE') {
      targetOp = 'INACTIF';
    }

    // Motif obligatoire pour toute modification manuelle
    if ((source === 'MANUAL_ADMIN' || source === 'MANUAL_RESPONSABLE') && (!params.notes || !params.notes.trim()) && targetAdmin !== 'REFUSE') {
      return {
        success: false,
        error: 'Un motif explicite est obligatoire lors d une correction administrative manuelle.',
      };
    }

    // Détermination du serveur Discord selon le parcours
    let targetServer: DiscordServerType | 'AUCUN' = candidate.currentServer;
    if (targetOp === 'FORMATION' || targetOp === 'SIMULATION' || targetOp === 'VALIDE') {
      targetServer = 'FORMATION';
    } else if (targetOp === 'PRODUCTION') {
      targetServer = candidate.vaType === 'INSTAGRAM' ? 'PRODUCTION_INSTAGRAM' : 'PRODUCTION_CHATTING';
    } else if (targetOp === 'RECRUTEMENT') {
      targetServer = 'RECRUTEMENT';
    }

    // Mise à jour des jalons de date
    if (targetOp === 'FORMATION' && !candidate.formationDate) candidate.formationDate = now;
    if (targetOp === 'SIMULATION' && !candidate.simulationDate) candidate.simulationDate = now;
    if (targetOp === 'VALIDE' && !candidate.validationDate) candidate.validationDate = now;
    if (targetOp === 'PRODUCTION' && !candidate.productionDate) candidate.productionDate = now;
    if (targetAdmin === 'ACCEPTE' || targetAdmin === 'REFUSE') {
      if (!candidate.decisionDate) candidate.decisionDate = now;
      candidate.decisionByUserId = params.authorUserId;
      candidate.decisionByName = params.authorName;
    }

    candidate.adminStatus = targetAdmin;
    candidate.operationalStatus = targetOp;
    candidate.status = deriveCandidateStatus(targetAdmin, targetOp);
    candidate.currentServer = targetServer;
    candidate.updatedAt = now;

    // Si le dossier avait une anomalie et qu'on effectue une correction manuelle cohérente, lever l'anomalie
    if (source === 'MANUAL_ADMIN' || source === 'MANUAL_RESPONSABLE') {
      candidate.hasAnomaly = false;
      candidate.anomalyReason = null;
    }

    this.saveDatabase();

    this.logStatusHistory({
      candidateId: candidate.id,
      fromStatus: oldStatus,
      toStatus: candidate.status,
      fromAdminStatus: oldAdminStatus,
      toAdminStatus: targetAdmin,
      fromOperationalStatus: oldOperationalStatus,
      toOperationalStatus: targetOp,
      fromServer: oldServer,
      toServer: targetServer,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      authorSource: source,
      reason: targetAdmin === 'REFUSE' ? candidate.refusalReason : (params.notes || 'Transition de statut'),
      isConfidential: targetAdmin === 'REFUSE',
    });

    this.logAudit({
      action: 'STATUS_CHANGE',
      actorUserId: params.authorUserId,
      actorName: params.authorName,
      targetType: 'CANDIDATE',
      targetId: candidate.id,
      details: {
        candidateName: candidate.displayName,
        oldStatus,
        newStatus: candidate.status,
        oldAdminStatus,
        newAdminStatus: targetAdmin,
        oldOperationalStatus,
        newOperationalStatus: targetOp,
        vaType: candidate.vaType,
        source,
        reason: params.notes,
      },
    });

    return { success: true, candidate };
  }

  // Correction de l'activité (VA Chatting <-> VA Instagram) avec motif obligatoire
  updateCandidateVAType(params: {
    candidateId: string;
    newVaType: VAType;
    reason: string;
    authorUserId: string;
    authorName: string;
  }): { success: boolean; candidate?: Candidate; error?: string } {
    const candidate = this.getCandidateById(params.candidateId);
    if (!candidate) return { success: false, error: 'Candidat introuvable' };

    if (!params.reason || !params.reason.trim()) {
      return { success: false, error: 'Un motif obligatoire est requis pour modifier l activité d un candidat.' };
    }

    const oldType = candidate.vaType;
    if (oldType === params.newVaType) return { success: true, candidate };

    const now = new Date().toISOString();

    // Si on passe un candidat en VA Instagram alors qu'il était en Formation ou Simulation,
    // on adapte son statut opérationnel (il ne peut pas rester en formation)
    if (params.newVaType === 'INSTAGRAM') {
      if (candidate.operationalStatus === 'FORMATION' || candidate.operationalStatus === 'SIMULATION' || candidate.operationalStatus === 'VALIDE') {
        candidate.operationalStatus = 'RECRUTEMENT';
        candidate.status = deriveCandidateStatus(candidate.adminStatus, candidate.operationalStatus);
        candidate.currentServer = 'RECRUTEMENT';
      } else if (candidate.operationalStatus === 'PRODUCTION') {
        candidate.currentServer = 'PRODUCTION_INSTAGRAM';
      }
    } else {
      // Si on passe en VA Chatting
      if (candidate.operationalStatus === 'PRODUCTION') {
        candidate.currentServer = 'PRODUCTION_CHATTING';
      }
    }

    candidate.vaType = params.newVaType;
    candidate.hasAnomaly = false;
    candidate.anomalyReason = null;
    candidate.updatedAt = now;
    this.saveDatabase();

    this.logAudit({
      action: 'VA_TYPE_CORRECTED',
      actorUserId: params.authorUserId,
      actorName: params.authorName,
      targetType: 'CANDIDATE',
      targetId: candidate.id,
      details: {
        oldType,
        newType: params.newVaType,
        reason: params.reason,
      },
    });

    this.logStatusHistory({
      candidateId: candidate.id,
      fromStatus: candidate.status,
      toStatus: candidate.status,
      fromAdminStatus: candidate.adminStatus,
      toAdminStatus: candidate.adminStatus,
      fromOperationalStatus: candidate.operationalStatus,
      toOperationalStatus: candidate.operationalStatus,
      fromServer: candidate.currentServer,
      toServer: candidate.currentServer,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      authorSource: 'MANUAL_RESPONSABLE',
      reason: `Correction d'activité : ${oldType} → ${params.newVaType}. Motif : ${params.reason}`,
      isConfidential: false,
    });

    return { success: true, candidate };
  }

  // Signalement ou résolution d'anomalie
  flagCandidateAnomaly(candidateId: string, anomalyReason: string): void {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate) return;

    candidate.hasAnomaly = true;
    candidate.anomalyReason = anomalyReason;
    candidate.updatedAt = new Date().toISOString();
    this.saveDatabase();

    this.logAudit({
      action: 'ANOMALY_FLAGGED',
      actorUserId: 'SYSTEM',
      actorName: 'JARVIS Sync Engine',
      targetType: 'CANDIDATE',
      targetId: candidate.id,
      details: { anomalyReason, candidateName: candidate.displayName },
    });
  }

  reassignCandidateReferrer(params: {
    candidateId: string;
    newReferrerId: string;
    authorUserId: string;
    authorName: string;
    reason: string;
  }): { success: boolean; candidate?: Candidate; error?: string } {
    const candidate = this.getCandidateById(params.candidateId);
    if (!candidate) return { success: false, error: 'Candidat introuvable' };

    const newReferrer = this.getReferrerById(params.newReferrerId);
    if (!newReferrer) return { success: false, error: 'Nouveau parrain introuvable' };

    if (!params.reason || !params.reason.trim()) {
      return { success: false, error: 'Un motif d attribution explicite est requis pour le journal d audit.' };
    }

    const oldRefId = candidate.referrerId;
    const oldRefName = candidate.referrerName;

    candidate.referrerId = newReferrer.id;
    candidate.referrerDiscordUserId = newReferrer.discordUserId;
    candidate.referrerName = newReferrer.discordDisplayName;
    candidate.attributionStatus = 'MANUAL_REASSIGNED';
    candidate.uncertaintyReason = null;
    candidate.updatedAt = new Date().toISOString();

    const logEntry: ReferralAttributionHistoryEntry = {
      id: `rah-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      candidateId: candidate.id,
      candidateName: candidate.displayName,
      oldReferrerId: oldRefId,
      oldReferrerName: oldRefName,
      newReferrerId: newReferrer.id,
      newReferrerName: newReferrer.discordDisplayName,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
      reason: params.reason,
      timestamp: new Date().toISOString(),
    };

    this.data.referral_attributions_history.push(logEntry);
    this.saveDatabase();

    this.logAudit({
      action: 'REFERRAL_REASSIGNMENT',
      actorUserId: params.authorUserId,
      actorName: params.authorName,
      targetType: 'CANDIDATE',
      targetId: candidate.id,
      details: {
        candidateName: candidate.displayName,
        oldReferrer: oldRefName,
        newReferrer: newReferrer.discordDisplayName,
        reason: params.reason,
      },
    });

    return { success: true, candidate };
  }

  getStatusHistory(candidateId: string, filterConfidentialForParrain = false): StatusHistoryEntry[] {
    const history = this.data.status_history.filter(h => h.candidateId === candidateId);
    if (filterConfidentialForParrain) {
      return history.map(h => ({
        id: h.id,
        candidateId: h.candidateId,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        fromAdminStatus: h.fromAdminStatus,
        toAdminStatus: h.toAdminStatus,
        fromOperationalStatus: h.fromOperationalStatus,
        toOperationalStatus: h.toOperationalStatus,
        fromServer: null,
        toServer: null,
        authorUserId: '',
        authorName: '',
        authorSource: h.authorSource,
        reason: null, // Les motifs confidentiels et notes internes restent réservés Direction & Responsables
        isConfidential: false,
        timestamp: h.timestamp,
      }));
    }
    return history;
  }

  private logStatusHistory(entry: Omit<StatusHistoryEntry, 'id' | 'timestamp'>) {
    const fullEntry: StatusHistoryEntry = {
      ...entry,
      id: `sh-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.status_history.push(fullEntry);
    this.saveDatabase();
  }

  getReferralAttributionsHistory(candidateId?: string): ReferralAttributionHistoryEntry[] {
    if (candidateId) {
      return this.data.referral_attributions_history.filter(h => h.candidateId === candidateId);
    }
    return this.data.referral_attributions_history;
  }

  isEventProcessed(eventId: string): boolean {
    return this.data.recruitment_events.some(e => e.id === eventId && e.processed);
  }

  recordEvent(event: RecruitmentEvent): void {
    const existingIndex = this.data.recruitment_events.findIndex(e => e.id === event.id);
    if (existingIndex >= 0) {
      this.data.recruitment_events[existingIndex] = event;
    } else {
      this.data.recruitment_events.push(event);
    }
    this.saveDatabase();
  }

  getDiscordServers(): DiscordServerInfo[] {
    return this.data.discord_servers;
  }

  updateDiscordServerSync(serverId: DiscordServerType, memberDelta = 0): void {
    const server = this.data.discord_servers.find(s => s.id === serverId);
    if (server) {
      server.memberCount = Math.max(0, server.memberCount + memberDelta);
      server.lastSyncAt = new Date().toISOString();
      server.botConnected = true;
      this.saveDatabase();
    }
  }

  logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const fullLog: AuditLog = {
      ...log,
      id: `audit-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.audit_logs.push(fullLog);
    if (this.data.audit_logs.length > 2000) {
      this.data.audit_logs = this.data.audit_logs.slice(-2000);
    }
    this.saveDatabase();
  }

  getAuditLogs(limit = 100): AuditLog[] {
    return [...this.data.audit_logs].reverse().slice(0, limit);
  }

  getOverviewStatistics() {
    const candidates = this.data.candidates;
    const total = candidates.length;

    const chatteurs = candidates.filter(c => c.vaType === 'CHATTEUR');
    const instagram = candidates.filter(c => c.vaType === 'INSTAGRAM');

    const enAttente = candidates.filter(c => c.adminStatus === 'EN_ATTENTE').length;
    const acceptes = candidates.filter(c => c.adminStatus === 'ACCEPTE').length;
    const refuses = candidates.filter(c => c.adminStatus === 'REFUSE').length;
    const abandonnes = candidates.filter(c => c.adminStatus === 'ABANDONNE').length;

    const enFormation = chatteurs.filter(c => c.operationalStatus === 'FORMATION').length;
    const enSimulation = chatteurs.filter(c => c.operationalStatus === 'SIMULATION').length;
    const valides = chatteurs.filter(c => c.operationalStatus === 'VALIDE').length;
    const prodChatting = chatteurs.filter(c => c.operationalStatus === 'PRODUCTION').length;
    const prodInstagram = instagram.filter(c => c.operationalStatus === 'PRODUCTION').length;
    const totalProductionGlobale = prodChatting + prodInstagram;

    const dossiersAnomalies = candidates.filter(c => c.hasAnomaly).length;

    const conversionProductionRate = total > 0 ? Math.round((totalProductionGlobale / total) * 100) : 0;
    const acceptanceRate = total > 0 ? Math.round(((total - refuses) / total) * 100) : 0;

    const referrersStats = this.data.referrers.map(r => {
      const myCandidates = candidates.filter(c => c.referrerId === r.id);
      const myTotal = myCandidates.length;
      const myInProd = myCandidates.filter(c => c.operationalStatus === 'PRODUCTION').length;
      const myAccepted = myCandidates.filter(c => c.adminStatus === 'ACCEPTE').length;
      const myRefused = myCandidates.filter(c => c.adminStatus === 'REFUSE').length;
      const myConversion = myTotal > 0 ? Math.round((myInProd / myTotal) * 100) : 0;
      const myAcceptRate = myTotal > 0 ? Math.round(((myTotal - myRefused) / myTotal) * 100) : 0;

      return {
        id: r.id,
        discordUserId: r.discordUserId,
        discordUsername: r.discordUsername,
        discordDisplayName: r.discordDisplayName,
        inviteCode: r.inviteCode,
        inviteUrl: r.inviteUrl,
        usesCount: r.usesCount,
        isActive: r.isActive,
        createdAt: r.createdAt,
        notes: r.notes,
        totalFilleuls: myTotal,
        enAttente: myCandidates.filter(c => c.adminStatus === 'EN_ATTENTE').length,
        acceptes: myAccepted,
        enFormation: myCandidates.filter(c => c.operationalStatus === 'FORMATION').length,
        enSimulation: myCandidates.filter(c => c.operationalStatus === 'SIMULATION').length,
        valides: myCandidates.filter(c => c.operationalStatus === 'VALIDE').length,
        enProduction: myInProd,
        refuses: myRefused,
        abandonnes: myCandidates.filter(c => c.adminStatus === 'ABANDONNE').length,
        conversionRate: myConversion,
        acceptanceRate: myAcceptRate,
        chatteurCount: myCandidates.filter(c => c.vaType === 'CHATTEUR').length,
        instagramCount: myCandidates.filter(c => c.vaType === 'INSTAGRAM').length,
      };
    }).sort((a, b) => b.totalFilleuls - a.totalFilleuls || b.enProduction - a.enProduction);

    return {
      kpis: {
        totalCandidats: total,
        totalChatteurs: chatteurs.length,
        totalInstagram: instagram.length,
        enAttente,
        acceptes,
        enFormation,
        enSimulation,
        valides,
        prodChatting,
        prodInstagram,
        totalProductionGlobale,
        refuses,
        abandonnes,
        dossiersAnomalies,
        conversionProductionRate,
        acceptanceRate,
      },
      distribution: {
        chatteur: {
          total: chatteurs.length,
          enAttente: chatteurs.filter(c => c.adminStatus === 'EN_ATTENTE').length,
          acceptes: chatteurs.filter(c => c.adminStatus === 'ACCEPTE').length,
          enFormation,
          enSimulation,
          valides,
          enProduction: prodChatting,
          refuses: chatteurs.filter(c => c.adminStatus === 'REFUSE').length,
          abandonnes: chatteurs.filter(c => c.adminStatus === 'ABANDONNE').length,
        },
        instagram: {
          total: instagram.length,
          enAttente: instagram.filter(c => c.adminStatus === 'EN_ATTENTE').length,
          acceptes: instagram.filter(c => c.adminStatus === 'ACCEPTE').length,
          enProduction: prodInstagram,
          refuses: instagram.filter(c => c.adminStatus === 'REFUSE').length,
          abandonnes: instagram.filter(c => c.adminStatus === 'ABANDONNE').length,
        },
      },
      topParrains: referrersStats,
      servers: this.data.discord_servers,
    };
  }
}

export const db = new DatabaseService();
