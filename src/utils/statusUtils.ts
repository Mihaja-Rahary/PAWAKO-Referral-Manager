import { CandidateStatus, AdminStatus, OperationalStatus, DiscordServerType, VAType, AttributionStatus, PawakoRoleType } from '../types';

export function getStatusLabel(status: CandidateStatus): string {
  switch (status) {
    case 'EN_ATTENTE':
      return 'En attente';
    case 'ACCEPTE':
      return 'Accepté';
    case 'REFUSE':
      return 'Refusé';
    case 'EN_FORMATION':
      return 'En formation';
    case 'EN_SIMULATION':
      return 'En simulation';
    case 'VALIDE':
      return 'Validé';
    case 'EN_PRODUCTION':
      return 'En production';
    case 'ABANDONNE':
      return 'Abandonné';
    default:
      return status;
  }
}

export function getAdminStatusLabel(status: AdminStatus): string {
  switch (status) {
    case 'EN_ATTENTE':
      return 'En attente';
    case 'ACCEPTE':
      return 'Accepté';
    case 'REFUSE':
      return 'Refusé';
    case 'ABANDONNE':
      return 'Abandonné';
    default:
      return status;
  }
}

export function getOperationalStatusLabel(status: OperationalStatus): string {
  switch (status) {
    case 'RECRUTEMENT':
      return 'Recrutement';
    case 'FORMATION':
      return 'Formation';
    case 'SIMULATION':
      return 'Simulation';
    case 'VALIDE':
      return 'Validé';
    case 'PRODUCTION':
      return 'Production';
    case 'INACTIF':
      return 'Inactif';
    default:
      return status;
  }
}

export function getStatusBadgeClasses(status: CandidateStatus): { text: string; dot: string; bg: string } {
  switch (status) {
    case 'EN_ATTENTE':
      return {
        text: 'text-slate-600 dark:text-[#d8d0eb]',
        dot: 'bg-slate-400 dark:bg-[#9d93b8]',
        bg: 'bg-slate-50 dark:bg-[#171026] border-slate-200 dark:border-[#241a38]',
      };
    case 'ACCEPTE':
      return {
        text: 'text-teal-700 dark:text-teal-300',
        dot: 'bg-teal-500 dark:bg-teal-400',
        bg: 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/50',
      };
    case 'REFUSE':
      return {
        text: 'text-rose-700 dark:text-rose-300',
        dot: 'bg-rose-500 dark:bg-rose-400',
        bg: 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50',
      };
    case 'EN_FORMATION':
      return {
        text: 'text-amber-700 dark:text-amber-300',
        dot: 'bg-amber-500 dark:bg-amber-400',
        bg: 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
      };
    case 'EN_SIMULATION':
      return {
        text: 'text-purple-700 dark:text-purple-300',
        dot: 'bg-purple-500 dark:bg-purple-400',
        bg: 'bg-purple-50/60 dark:bg-purple-950/35 border-purple-200 dark:border-purple-800/50',
      };
    case 'VALIDE':
      return {
        text: 'text-violet-700 dark:text-violet-300',
        dot: 'bg-violet-500 dark:bg-violet-400',
        bg: 'bg-violet-50/60 dark:bg-violet-950/40 border-violet-200 dark:border-violet-700/50',
      };
    case 'EN_PRODUCTION':
      return {
        text: 'text-emerald-700 dark:text-emerald-300',
        dot: 'bg-emerald-500 dark:bg-emerald-400',
        bg: 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50',
      };
    case 'ABANDONNE':
      return {
        text: 'text-zinc-600 dark:text-[#9d93b8]',
        dot: 'bg-zinc-400 dark:bg-[#7c7296]',
        bg: 'bg-zinc-50 dark:bg-[#171026] border-zinc-200 dark:border-[#241a38]',
      };
    default:
      return {
        text: 'text-slate-600 dark:text-[#d8d0eb]',
        dot: 'bg-slate-400 dark:bg-[#9d93b8]',
        bg: 'bg-slate-50 dark:bg-[#171026] border-slate-200 dark:border-[#241a38]',
      };
  }
}

export function getServerLabel(server: DiscordServerType | 'AUCUN'): string {
  switch (server) {
    case 'RECRUTEMENT':
      return 'Serveur Recrutement';
    case 'FORMATION':
      return 'Serveur Formation';
    case 'PRODUCTION_CHATTING':
      return 'Serveur Prod VA Chatting';
    case 'PRODUCTION_INSTAGRAM':
      return 'Serveur Prod VA Instagram';
    case 'AUCUN':
      return 'Aucun serveur';
    default:
      return server;
  }
}

export function getVaTypeLabel(vaType: VAType): string {
  return vaType === 'CHATTEUR' ? 'VA Chatting' : 'VA Instagram';
}

export function getPawakoRoleLabel(role: PawakoRoleType): string {
  switch (role) {
    case 'CANDIDAT':
      return 'Candidat (Recrutement)';
    case 'CANDIDAT_ACCEPTE':
      return 'Candidat Accepté';
    case 'EN_FORMATION':
      return 'En Formation (Chatting)';
    case 'EN_SIMULATION':
      return 'En Simulation (Chatting)';
    case 'VA_VALIDE':
      return 'VA Validé (Chatting)';
    case 'VA_PRODUCTION':
      return 'VA en Production';
    case 'CANDIDAT_REFUSE':
      return 'Candidat Refusé';
    default:
      return role;
  }
}

export function getAttributionLabel(attribution: AttributionStatus): { label: string; text: string } {
  switch (attribution) {
    case 'CONFIRMED':
      return { label: 'Confirmé', text: 'text-emerald-700 dark:text-emerald-400' };
    case 'UNCERTAIN':
      return { label: 'Incertain', text: 'text-amber-700 dark:text-amber-400 font-medium' };
    case 'MANUAL_REASSIGNED':
      return { label: 'Réassigné', text: 'text-violet-700 dark:text-violet-300' };
    default:
      return { label: attribution, text: 'text-slate-600 dark:text-[#9d93b8]' };
  }
}

export function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}
