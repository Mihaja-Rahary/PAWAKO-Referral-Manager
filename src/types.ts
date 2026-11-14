export type UserRole = 'ADMINISTRATEUR' | 'RESPONSABLE' | 'PARRAIN';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_APPROVAL';

export type VAType = 'CHATTEUR' | 'INSTAGRAM';

// Statut administratif (décisionnel)
export type AdminStatus = 'EN_ATTENTE' | 'ACCEPTE' | 'REFUSE' | 'ABANDONNE';

// Statut opérationnel (parcours terrain)
export type OperationalStatus =
  | 'RECRUTEMENT'
  | 'FORMATION'
  | 'SIMULATION'
  | 'VALIDE'
  | 'PRODUCTION'
  | 'INACTIF';

// Statut synthétique (pour affichage compact et compatibilité)
export type CandidateStatus =
  | 'EN_ATTENTE'
  | 'ACCEPTE'
  | 'REFUSE'
  | 'EN_FORMATION'
  | 'EN_SIMULATION'
  | 'VALIDE'
  | 'EN_PRODUCTION'
  | 'ABANDONNE';

// Les 4 serveurs Discord indépendants de l'organisation PAWAKO
export type DiscordServerType =
  | 'RECRUTEMENT'
  | 'FORMATION'
  | 'PRODUCTION_CHATTING'
  | 'PRODUCTION_INSTAGRAM';

export type AttributionStatus = 'CONFIRMED' | 'UNCERTAIN' | 'MANUAL_REASSIGNED';

// Rôles Discord PAWAKO configurables
export type PawakoRoleType =
  | 'CANDIDAT'
  | 'CANDIDAT_ACCEPTE'
  | 'EN_FORMATION'
  | 'EN_SIMULATION'
  | 'VA_VALIDE'
  | 'VA_PRODUCTION'
  | 'CANDIDAT_REFUSE';

export interface DiscordRoleMapping {
  serverId: DiscordServerType;
  roleType: PawakoRoleType;
  discordRoleId: string; // Snowflake Discord
  roleName?: string;     // Nom d'affichage
  updatedAt?: string;
  updatedBy?: string;
}

export interface User {
  id: string; // Discord User ID permanent
  username: string;
  displayName: string;
  avatar: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string;
}

export type ReferrerStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type ReferrerInviteStatus = 'ACTIVE' | 'EXPIRED_OR_DELETED' | 'UNCONFIGURED' | 'ERROR';

export interface Referrer {
  id: string;
  discordUserId: string;
  discordUsername: string;
  discordDisplayName: string;
  avatar?: string | null;
  inviteCode: string;
  inviteUrl: string;
  inviteStatus?: ReferrerInviteStatus;
  inviteChannelId?: string | null;
  inviteError?: string | null;
  inviteCreatedAt?: string | null;
  usesCount: number;
  isActive: boolean;
  status?: ReferrerStatus;
  createdAt: string;
  updatedAt?: string;
  lastActivityAt?: string | null;
  suspendedAt?: string | null;
  suspendedByUserId?: string | null;
  suspendReason?: string | null;
  archivedAt?: string | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
  restoredAt?: string | null;
  restoredByUserId?: string | null;
  notes?: string;
  totalFilleuls?: number;
  enAttente?: number;
  acceptes?: number;
  enFormation?: number;
  enSimulation?: number;
  valides?: number;
  enProduction?: number;
  refuses?: number;
  abandonnes?: number;
  conversionRate?: number;
  acceptanceRate?: number;
  chatteurCount?: number;
  instagramCount?: number;
}

export interface ReferrerDependencySummary {
  referrerId: string;
  linkedCandidatesCount: number;
  attributionHistoryCount: number;
  canPhysicallyDelete: boolean;
  blockingReason: string | null;
}

export interface Candidate {
  id: string;
  discordUserId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  vaType: VAType; // Activité : VA Chatting ou VA Instagram
  adminStatus: AdminStatus; // Statut administratif : En attente, Accepté, Refusé, Abandonné
  operationalStatus: OperationalStatus; // Statut opérationnel : Recrutement, Formation, Simulation, Validé, Production, Inactif
  status: CandidateStatus;
  referrerId: string | null;
  referrerDiscordUserId: string | null;
  referrerName: string | null;
  attributionStatus: AttributionStatus;
  uncertaintyReason?: string | null;
  currentServer: DiscordServerType | 'AUCUN';
  hasAnomaly: boolean;
  anomalyReason?: string | null;
  discordRoles: string[];
  arrivalDate: string;
  formationDate?: string | null;
  simulationDate?: string | null;
  validationDate?: string | null;
  productionDate?: string | null;
  decisionDate?: string | null;
  decisionByUserId?: string | null;
  decisionByName?: string | null;
  refusalReason?: string | null;
  lastDiscordSyncAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  candidateId: string;
  fromStatus: CandidateStatus | null;
  toStatus: CandidateStatus;
  fromAdminStatus?: AdminStatus | null;
  toAdminStatus?: AdminStatus;
  fromOperationalStatus?: OperationalStatus | null;
  toOperationalStatus?: OperationalStatus;
  fromServer: DiscordServerType | 'AUCUN' | null;
  toServer: DiscordServerType | 'AUCUN' | null;
  authorUserId: string;
  authorName: string;
  authorSource: 'DISCORD_SYNC' | 'JARVIS_GATEWAY' | 'MANUAL_ADMIN' | 'MANUAL_RESPONSABLE';
  reason?: string | null;
  isConfidential: boolean;
  timestamp: string;
}

export interface ReferralAttributionHistoryEntry {
  id: string;
  candidateId: string;
  candidateName: string;
  oldReferrerId: string | null;
  oldReferrerName: string | null;
  newReferrerId: string;
  newReferrerName: string;
  authorUserId: string;
  authorName: string;
  reason: string;
  timestamp: string;
}

export interface DiscordServerInfo {
  id: DiscordServerType;
  guildId: string;
  name: string;
  description: string;
  inviteBaseUrl: string;
  memberCount: number;
  botConnected: boolean;
  lastSyncAt: string;
  inviteChannelId?: string | null;
  inviteChannelName?: string | null;
  discordGuildName?: string | null;
  discordIconUrl?: string | null;
}

export interface DiscordDiscoveredRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface DiscordDiscoveredChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

export interface DiscordDiscoveredInvite {
  code: string;
  url: string;
  channelId: string | null;
  channelName: string | null;
  inviterUserId: string | null;
  inviterUsername: string | null;
  uses: number;
  maxAge: number;
  temporary: boolean;
}

export interface DiscordDiscoveredGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  ownerId: string | null;
  rulesChannelId: string | null;
  systemChannelId: string | null;
  suggestedServerType: DiscordServerType | null;
  roles: DiscordDiscoveredRole[];
  channels: DiscordDiscoveredChannel[];
  suggestedInviteChannelId: string | null;
  suggestedInviteChannelName: string | null;
  invites: DiscordDiscoveredInvite[];
  suggestedRoleMappings: Partial<Record<PawakoRoleType, { roleId: string; roleName: string }>>;
  membersAccessible: boolean;
  membersFetchedCount: number;
}

export interface DiscordBotIdentity {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  inviteBotUrl: string;
  directInviteBotUrl?: string;
  codeGrantInviteBotUrl?: string;
  requiresCodeGrant?: boolean;
  isBotPublic?: boolean;
  redirectUriRegistered?: boolean;
}

export interface DiscordBotDiscoveryResult {
  ok: boolean;
  hasBotToken: boolean;
  bot: DiscordBotIdentity | null;
  guilds: DiscordDiscoveredGuild[];
  matchedServers: Partial<Record<DiscordServerType, string>>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  actorUserId: string;
  actorName: string;
  targetType: 'CANDIDATE' | 'REFERRER' | 'USER' | 'SERVER' | 'DISCORD' | 'ROLE_MAPPING';
  targetId: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface OverviewStatistics {
  kpis: {
    totalCandidats: number;
    totalChatteurs: number;
    totalInstagram: number;
    enAttente: number;
    acceptes: number;
    enFormation: number;
    enSimulation: number;
    valides: number;
    prodChatting: number;
    prodInstagram: number;
    totalProductionGlobale: number;
    refuses: number;
    abandonnes: number;
    dossiersAnomalies: number;
    conversionProductionRate: number;
    acceptanceRate: number;
  };
  distribution: {
    chatteur: {
      total: number;
      enAttente: number;
      acceptes: number;
      enFormation: number;
      enSimulation: number;
      valides: number;
      enProduction: number;
      refuses: number;
      abandonnes: number;
    };
    instagram: {
      total: number;
      enAttente: number;
      acceptes: number;
      enProduction: number;
      refuses: number;
      abandonnes: number;
    };
  };
  topParrains: Referrer[];
  servers: DiscordServerInfo[];
}
