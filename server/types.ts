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

// Statut synthétique (pour compatibilité et filtres)
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

// Rôles Discord PAWAKO pour la synchronisation automatique
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
  discordRoleId: string; // Discord Snowflake Role ID
  roleName?: string;     // Friendly label
  updatedAt?: string;
  updatedBy?: string;
}

export interface User {
  id: string; // Discord User ID (identifiant permanent unique)
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
  // Champs statistiques calculés côté repository
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

export interface DiscordInviteRecord {
  inviteCode: string;
  inviteUrl: string;
  guildId: string;
  serverId: DiscordServerType;
  channelId?: string | null;
  inviterDiscordUserId?: string | null;
  referrerId?: string | null;
  active: boolean;
  createdAt: string;
  deletedAt?: string | null;
  uses?: number;
}

export interface Candidate {
  id: string;
  discordUserId: string; // Discord User ID permanent
  username: string;
  displayName: string;
  avatar: string | null;
  vaType: VAType; // Activité : VA Chatting ou VA Instagram
  adminStatus: AdminStatus; // Statut administratif : En attente, Accepté, Refusé, Abandonné
  operationalStatus: OperationalStatus; // Statut opérationnel : Recrutement, Formation, Simulation, Validé, Production, Inactif
  status: CandidateStatus; // Statut synthétique pour affichage immédiat
  referrerId: string | null;
  referrerDiscordUserId: string | null;
  referrerName: string | null;
  attributionStatus: AttributionStatus;
  uncertaintyReason?: string | null;
  currentServer: DiscordServerType | 'AUCUN';
  hasAnomaly: boolean; // Détection d'incompatibilité ou combinaison contradictoire
  anomalyReason?: string | null;
  discordRoles: string[]; // Liste des Role IDs Discord actuellement attribués
  arrivalDate: string;
  formationDate?: string | null;
  simulationDate?: string | null;
  validationDate?: string | null;
  productionDate?: string | null;
  decisionDate?: string | null;
  decisionByUserId?: string | null;
  decisionByName?: string | null;
  refusalReason?: string | null; // Strictement confidentiel Direction & Responsables
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
  reason?: string | null; // Motif obligatoire en cas de correction manuelle
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
}

export interface DiscordMembership {
  id: string;
  discordUserId: string;
  serverId: DiscordServerType;
  joinedAt: string;
  leftAt?: string | null;
  roles: string[];
  nickname?: string | null;
}

export interface RecruitmentEvent {
  id: string;
  eventType: 'GUILD_MEMBER_ADD' | 'GUILD_MEMBER_REMOVE' | 'GUILD_MEMBER_UPDATE' | 'INVITE_CREATE' | 'INVITE_DELETE' | 'MEMBER_SYNC';
  serverId: DiscordServerType;
  guildId: string;
  discordUserId: string;
  payload: any;
  processed: boolean;
  processedAt: string;
  result: string;
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

export interface DatabaseSchema {
  users: User[];
  referrers: Referrer[];
  candidates: Candidate[];
  status_history: StatusHistoryEntry[];
  referral_attributions_history: ReferralAttributionHistoryEntry[];
  discord_servers: DiscordServerInfo[];
  discord_role_mappings: DiscordRoleMapping[];
  discord_memberships: DiscordMembership[];
  recruitment_events: RecruitmentEvent[];
  audit_logs: AuditLog[];
  meta?: {
    initialAdminClaimed: boolean;
    initialAdminClaimedAt?: string;
    initialAdminDiscordUserId?: string;
  };
}
