import { VAType } from '../types';

export interface TopicColorTheme {
  badge: string;
  chipActive: string;
  dot: string;
  text: string;
  borderAccent: string;
  glow: string;
}

const PRESET_THEMES: Record<string, TopicColorTheme> = {
  onboarding: {
    badge:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
    chipActive: 'bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500',
    dot: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    borderAccent: 'hover:border-sky-400/70 dark:hover:border-sky-400/50',
    glow: 'from-sky-500/20 to-cyan-500/5',
  },
  discord: {
    badge:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/35',
    chipActive: 'bg-indigo-600 text-white border-indigo-600 dark:bg-[#5865F2] dark:border-[#5865F2]',
    dot: 'bg-[#5865F2]',
    text: 'text-indigo-600 dark:text-indigo-400',
    borderAccent: 'hover:border-indigo-400/70 dark:hover:border-indigo-400/50',
    glow: 'from-indigo-500/20 to-violet-500/5',
  },
  outils: {
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    chipActive: 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    borderAccent: 'hover:border-emerald-400/70 dark:hover:border-emerald-400/50',
    glow: 'from-emerald-500/20 to-teal-500/5',
  },
  remuneration: {
    badge:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/35',
    chipActive: 'bg-amber-500 text-slate-950 border-amber-500',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    borderAccent: 'hover:border-amber-400/70 dark:hover:border-amber-400/50',
    glow: 'from-amber-500/20 to-orange-500/5',
  },
  regles: {
    badge:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/35',
    chipActive: 'bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    borderAccent: 'hover:border-rose-400/70 dark:hover:border-rose-400/50',
    glow: 'from-rose-500/20 to-pink-500/5',
  },
  guide: {
    badge:
      'bg-orange-50 text-[#d9380d] border-orange-200 dark:bg-[#FA4616]/15 dark:text-orange-300 dark:border-[#FA4616]/35',
    chipActive: 'bg-[#FA4616] text-white border-[#FA4616]',
    dot: 'bg-[#FA4616]',
    text: 'text-[#d9380d] dark:text-orange-400',
    borderAccent: 'hover:border-orange-400/70 dark:hover:border-[#FA4616]/55',
    glow: 'from-[#FA4616]/20 to-rose-500/5',
  },
  coaching: {
    badge:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/35',
    chipActive: 'bg-violet-600 text-white border-violet-600',
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    borderAccent: 'hover:border-violet-400/70 dark:hover:border-violet-400/50',
    glow: 'from-violet-500/20 to-purple-500/5',
  },
  pratiques: {
    badge:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
    chipActive: 'bg-teal-600 text-white border-teal-600',
    dot: 'bg-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    borderAccent: 'hover:border-teal-400/70 dark:hover:border-teal-400/50',
    glow: 'from-teal-500/20 to-emerald-500/5',
  },
};

const FALLBACK_PALETTE: TopicColorTheme[] = [
  PRESET_THEMES.guide,
  PRESET_THEMES.discord,
  PRESET_THEMES.onboarding,
  PRESET_THEMES.outils,
  PRESET_THEMES.remuneration,
  PRESET_THEMES.regles,
  PRESET_THEMES.coaching,
  PRESET_THEMES.pratiques,
];

function normalizeTopicKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getTopicColorTheme(label?: string | null): TopicColorTheme {
  const key = normalizeTopicKey(label || '');
  if (!key) return PRESET_THEMES.guide;

  if (key.includes('onboarding') || key.includes('demarr') || key.includes('debut')) {
    return PRESET_THEMES.onboarding;
  }
  if (key.includes('discord') || key.includes('serveur') || key.includes('bot')) {
    return PRESET_THEMES.discord;
  }
  if (key.includes('outil') || key.includes('script') || key.includes('checklist') || key.includes('ressource')) {
    return PRESET_THEMES.outils;
  }
  if (key.includes('remuner') || key.includes('prime') || key.includes('paiement') || key.includes('bareme')) {
    return PRESET_THEMES.remuneration;
  }
  if (key.includes('regle') || key.includes('suivi') || key.includes('condition') || key.includes('sanction')) {
    return PRESET_THEMES.regles;
  }
  if (key.includes('principal') || key.includes('une') || key.includes('essentiel')) {
    return PRESET_THEMES.guide;
  }
  if (key.includes('simul') || key.includes('coach') || key.includes('forma')) {
    return PRESET_THEMES.coaching;
  }
  if (key.includes('pratique') || key.includes('astuce') || key.includes('conseil')) {
    return PRESET_THEMES.pratiques;
  }

  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

export interface SpecialtyTheme {
  label: string;
  gradient: string;
  softBg: string;
  badge: string;
  button: string;
  ring: string;
  text: string;
  bar: string;
}

export function getSpecialtyTheme(vaType?: VAType | null): SpecialtyTheme {
  if (vaType === 'INSTAGRAM') {
    return {
      label: 'VA Instagram',
      gradient: 'from-[#FA4616] via-rose-500 to-pink-500',
      softBg: 'bg-orange-50/80 dark:bg-[#FA4616]/10 border-orange-200 dark:border-[#FA4616]/30',
      badge:
        'bg-orange-50 text-[#d9380d] border-orange-200 dark:bg-[#FA4616]/15 dark:text-orange-300 dark:border-[#FA4616]/35',
      button:
        'bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 text-white shadow-sm shadow-[#FA4616]/25',
      ring: 'ring-[#FA4616]/40 border-[#FA4616]/50',
      text: 'text-[#d9380d] dark:text-orange-400',
      bar: 'bg-gradient-to-r from-[#FA4616] to-rose-500',
    };
  }

  return {
    label: 'VA Chatteur',
    gradient: 'from-indigo-500 via-violet-500 to-purple-600',
    softBg: 'bg-indigo-50/80 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30',
    badge:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/35',
    button:
      'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-sm shadow-indigo-600/25',
    ring: 'ring-indigo-500/40 border-indigo-500/50',
    text: 'text-indigo-600 dark:text-indigo-400',
    bar: 'bg-gradient-to-r from-indigo-500 to-violet-500',
  };
}
