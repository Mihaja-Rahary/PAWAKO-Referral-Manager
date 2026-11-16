import coverChatteur from '../assets/images/blog_cover_chatteur_1794762846084.jpg';
import coverInstagram from '../assets/images/blog_cover_instagram_1794762847926.jpg';
import coverOnboarding from '../assets/images/blog_cover_onboarding_1794762845933.jpg';
import coverRewards from '../assets/images/blog_cover_rewards_1794762847176.jpg';
import { ParrainGuide } from '../types';

export interface BuiltinBlogCover {
  id: string;
  label: string;
  description: string;
  url: string;
}

export const BUILTIN_BLOG_COVERS: BuiltinBlogCover[] = [
  {
    id: 'chatteur',
    label: 'Pôle VA Chatteur',
    description: 'Studio éditorial & performance chatting',
    url: coverChatteur,
  },
  {
    id: 'instagram',
    label: 'Pôle VA Instagram',
    description: 'Direction artistique & croissance sociale',
    url: coverInstagram,
  },
  {
    id: 'onboarding',
    label: 'Onboarding & Méthode',
    description: 'Checklist, accompagnement & premiers pas',
    url: coverOnboarding,
  },
  {
    id: 'rewards',
    label: 'Rémunération & Paliers',
    description: 'Primes, objectifs & suivi financier',
    url: coverRewards,
  },
];

/**
 * Retourne la couverture éditoriale du guide :
 * - Si l'admin a défini une URL/image personnalisée, on l'utilise en priorité.
 * - Sinon, on attribue automatiquement l'une des couvertures éditoriales PAWAKO
 *   selon la catégorie, le titre ou la spécialité du parcours.
 */
export function resolveGuideCoverUrl(
  guide: Pick<ParrainGuide, 'heroImageUrl' | 'vaType' | 'category' | 'title' | 'isPrimary'>
): string {
  const custom = typeof guide.heroImageUrl === 'string' ? guide.heroImageUrl.trim() : '';
  if (custom) return custom;

  const haystack = `${guide.category || ''} ${guide.title || ''}`.toLowerCase();
  if (/r[eé]mun[eé]ration|palier|prime|commission|salaire|bonus|revenu/.test(haystack)) {
    return coverRewards;
  }
  if (!guide.isPrimary && /onboarding|pratique|checklist|d[eé]marr|m[eé]thode|suivi|r[eè]gle/.test(haystack)) {
    return coverOnboarding;
  }

  return guide.vaType === 'INSTAGRAM' ? coverInstagram : coverChatteur;
}

export function stripRichTextSyntax(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(?:•|-|\*|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractGuideExcerpt(guide: ParrainGuide, maxLength = 155): string {
  if (guide.subtitle && guide.subtitle.trim()) {
    const cleanSub = stripRichTextSyntax(guide.subtitle);
    if (cleanSub.length <= maxLength) return cleanSub;
    return `${cleanSub.slice(0, maxLength - 1).trimEnd()}…`;
  }

  for (const block of guide.blocks || []) {
    if (block.body && block.body.trim()) {
      const cleanBody = stripRichTextSyntax(block.body);
      if (cleanBody) {
        if (cleanBody.length <= maxLength) return cleanBody;
        return `${cleanBody.slice(0, maxLength - 1).trimEnd()}…`;
      }
    }
  }

  return '';
}

export function estimateReadingMinutes(guide: ParrainGuide): number {
  const parts: string[] = [guide.title || '', guide.subtitle || ''];
  for (const block of guide.blocks || []) {
    if (block.title) parts.push(block.title);
    if (block.body) parts.push(stripRichTextSyntax(block.body));
    if (block.caption) parts.push(block.caption);
    if (block.headers) parts.push(block.headers.join(' '));
    if (block.rows) {
      for (const r of block.rows) {
        parts.push(r.join(' '));
      }
    }
  }
  const words = parts
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}
