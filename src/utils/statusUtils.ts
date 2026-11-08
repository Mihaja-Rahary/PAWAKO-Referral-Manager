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
      return { text: 'text-slate-600', dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200' };
    case 'ACCEPTE':
      return { text: 'text-teal-700', dot: 'bg-teal-500', bg: 'bg-teal-50/60 border-teal-200' };
    case 'REFUSE':
      return { text: 'text-rose-700', dot: 'bg-rose-500', bg: 'bg-rose-50/60 border-rose-200' };
    case 'EN_FORMATION':
      return { text: 'text-amber-700', dot: 'bg-amber-500', bg: 'bg-amber-50/60 border-amber-200' };
    case 'EN_SIMULATION':
      return { text: 'text-blue-700', dot: 'bg-blue-500', bg: 'bg-blue-50/60 border-blue-200' };
    case 'VALIDE':
      return { text: 'text-indigo-700', dot: 'bg-indigo-500', bg: 'bg-indigo-50/60 border-indigo-200' };
    case 'EN_PRODUCTION':
      return { text: 'text-emerald-700', dot: 'bg-emerald-500', bg: 'bg-emerald-50/60 border-emerald-200' };
    case 'ABANDONNE':
      return { text: 'text-zinc-600', dot: 'bg-zinc-400', bg: 'bg-zinc-50 border-zinc-200' };
    default:
      return { text: 'text-slate-600', dot: 'bg-slate-400', bg: 'bg-slate-50 border-slate-200' };
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
      return { label: 'Confirmé', text: 'text-emerald-700' };
    case 'UNCERTAIN':
      return { label: 'Incertain (À vérifier)', text: 'text-amber-700 font-medium' };
    case 'MANUAL_REASSIGNED':
      return { label: 'Réassigné manuellement', text: 'text-blue-700' };
    default:
      return { label: attribution, text: 'text-slate-600' };
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
