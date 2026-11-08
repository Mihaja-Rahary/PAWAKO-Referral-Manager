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

export interface Referrer {
  id: string;
  discordUserId: string;
  discordUsername: string;
  discordDisplayName: string;
  inviteCode: string;
  inviteUrl: string;
  usesCount: number;
  isActive: boolean;
  createdAt: string;
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
