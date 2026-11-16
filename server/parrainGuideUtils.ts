import {
  ParrainGuide,
  ParrainGuideBlock,
  ParrainGuideBlockType,
  ParrainGuideCalloutTone,
  VAType,
} from './types';

export function validateSafeImageUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  throw new Error(
    "Format d'image invalide : utilisez un lien https:// ou une photo importée (PNG, JPEG, WebP)."
  );
}

export function isValidGuideId(rawId: string): boolean {
  return typeof rawId === 'string' && /^[a-zA-Z0-9_-]{2,80}$/.test(rawId.trim());
}

export function isPrimaryGuideId(rawId: string): rawId is VAType {
  const upper = (rawId || '').trim().toUpperCase();
  return upper === 'CHATTEUR' || upper === 'INSTAGRAM';
}

export function generateCustomGuideId(vaType: VAType, title: string): string {
  const slug = (title || 'guide')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'onboarding';
  const rand = Math.random().toString(36).slice(2, 6);
  return `guide-${vaType.toLowerCase()}-${slug}-${Date.now().toString(36)}-${rand}`;
}

export function sanitizeGuideTags(rawTags: unknown): string[] {
  let candidates: string[] = [];
  if (Array.isArray(rawTags)) {
    candidates = rawTags.filter((item): item is string => typeof item === 'string');
  } else if (typeof rawTags === 'string') {
    candidates = rawTags.split(',');
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of candidates) {
    const cleaned = item
      .replace(/^#+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 32);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 8) break;
  }

  return result;
}

const LEGACY_PREMADE_GUIDE_TITLES = new Set([
  'Guide Officiel Parrain — Pôle VA Chatteur',
  'Guide Officiel Parrain — Pôle VA Instagram',
  'Guide Officiel Parrain - Pôle VA Chatteur',
  'Guide Officiel Parrain - Pôle VA Instagram',
]);

export function isLegacyPreMadeParrainGuide(raw: Partial<ParrainGuide> | null | undefined): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.isDefault === true) return true;
  if (raw.updatedByUserId === 'SYSTEM') return true;
  const title = String(raw.title || '').trim();
  if (LEGACY_PREMADE_GUIDE_TITLES.has(title)) return true;
  return false;
}

export function normalizeStoredParrainGuide(raw: ParrainGuide): ParrainGuide {
  const vaType: VAType = raw.vaType === 'INSTAGRAM' ? 'INSTAGRAM' : 'CHATTEUR';
  const id = String(raw.id || vaType).trim();

  return {
    ...raw,
    id,
    vaType,
    category: typeof raw.category === 'string' ? raw.category.trim().slice(0, 60) : '',
    tags: sanitizeGuideTags(raw.tags),
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 10,
    title: String(raw.title || '').trim() || 'Article sans titre',
    subtitle: String(raw.subtitle || ''),
    heroImageUrl: raw.heroImageUrl || null,
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    isDefault: false,
    isPrimary: false,
  };
}

export function sortParrainGuides(guides: ParrainGuide[]): ParrainGuide[] {
  return [...guides].sort((a, b) => {
    if (a.vaType !== b.vaType) {
      return a.vaType === 'CHATTEUR' ? -1 : 1;
    }
    const aPrimary = a.isPrimary || a.id === 'CHATTEUR' || a.id === 'INSTAGRAM' ? 0 : 1;
    const bPrimary = b.isPrimary || b.id === 'CHATTEUR' || b.id === 'INSTAGRAM' ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;

    const aOrder = typeof a.order === 'number' ? a.order : 10;
    const bOrder = typeof b.order === 'number' ? b.order : 10;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return new Date(a.createdAt || a.updatedAt || 0).getTime() - new Date(b.createdAt || b.updatedAt || 0).getTime();
  });
}

export function sanitizeAndBuildParrainGuide(
  vaType: VAType,
  payload: {
    title: string;
    subtitle?: string;
    category?: string;
    tags?: string[];
    order?: number;
    heroImageUrl?: string | null;
    blocks: ParrainGuideBlock[];
  },
  actor: { id: string; displayName: string },
  options?: {
    guideId?: string;
    existingCreatedAt?: string;
  }
): { doc: ParrainGuide; byteLength: number } {
  if (vaType !== 'CHATTEUR' && vaType !== 'INSTAGRAM') {
    throw new Error('Spécialité invalide (CHATTEUR ou INSTAGRAM attendu).');
  }

  const targetId = options?.guideId?.trim() || vaType;
  if (!isValidGuideId(targetId)) {
    throw new Error('Identifiant de guide invalide.');
  }
  const isPrimary = targetId === 'CHATTEUR' || targetId === 'INSTAGRAM';
  const resolvedVaType: VAType = isPrimary ? (targetId as VAType) : vaType;

  const cleanTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!cleanTitle) {
    throw new Error('Le titre du guide est obligatoire.');
  }
  if (cleanTitle.length > 200) {
    throw new Error('Le titre du guide ne doit pas dépasser 200 caractères.');
  }

  const cleanSubtitle = typeof payload.subtitle === 'string' ? payload.subtitle.trim().slice(0, 500) : '';
  const cleanCategory =
    typeof payload.category === 'string' ? payload.category.trim().slice(0, 60) : '';
  const cleanTags = sanitizeGuideTags(payload.tags);
  const cleanOrder =
    typeof payload.order === 'number' && Number.isFinite(payload.order)
      ? Math.max(0, Math.min(999, Math.round(payload.order)))
      : 10;

  const cleanHeroImageUrl =
    typeof payload.heroImageUrl === 'string' && payload.heroImageUrl.trim()
      ? validateSafeImageUrl(payload.heroImageUrl)
      : null;

  if (!Array.isArray(payload.blocks)) {
    throw new Error('Le format des blocs de contenu est invalide.');
  }
  if (payload.blocks.length > 50) {
    throw new Error('Un guide ne peut pas contenir plus de 50 blocs.');
  }

  const sanitizedBlocks: ParrainGuideBlock[] = payload.blocks.map((rawBlock, idx) => {
    const bType: ParrainGuideBlockType =
      rawBlock?.type === 'TEXT' ||
      rawBlock?.type === 'TABLE' ||
      rawBlock?.type === 'IMAGE' ||
      rawBlock?.type === 'CALLOUT'
        ? rawBlock.type
        : 'TEXT';

    const id =
      typeof rawBlock?.id === 'string' && rawBlock.id.trim()
        ? rawBlock.id.trim().slice(0, 64)
        : `block-${idx + 1}-${Date.now()}`;

    const title = typeof rawBlock?.title === 'string' ? rawBlock.title.trim().slice(0, 200) : '';

    if (bType === 'TABLE') {
      const rawHeaders = Array.isArray(rawBlock?.headers) ? rawBlock.headers : [];
      const colCount = Math.max(1, Math.min(10, rawHeaders.length || 2));
      const headers = Array.from({ length: colCount }, (_, colIdx) =>
        typeof rawHeaders[colIdx] === 'string' ? rawHeaders[colIdx].trim().slice(0, 120) : `Colonne ${colIdx + 1}`
      );
      const rawRows = Array.isArray(rawBlock?.rows) ? rawBlock.rows : [];
      const rows = rawRows.slice(0, 50).map(r =>
        Array.from({ length: colCount }, (_, colIdx) =>
          Array.isArray(r) && typeof r[colIdx] === 'string' ? r[colIdx].trim().slice(0, 500) : ''
        )
      );
      return {
        id,
        type: 'TABLE',
        title,
        headers,
        rows,
      };
    }

    if (bType === 'IMAGE') {
      const imageUrl = validateSafeImageUrl(typeof rawBlock?.imageUrl === 'string' ? rawBlock.imageUrl : '');
      const caption = typeof rawBlock?.caption === 'string' ? rawBlock.caption.trim().slice(0, 300) : '';
      return {
        id,
        type: 'IMAGE',
        title,
        imageUrl,
        caption,
      };
    }

    if (bType === 'CALLOUT') {
      const tone: ParrainGuideCalloutTone =
        rawBlock?.tone === 'info' ||
        rawBlock?.tone === 'condition' ||
        rawBlock?.tone === 'warning' ||
        rawBlock?.tone === 'success'
          ? rawBlock.tone
          : 'info';
      const body = typeof rawBlock?.body === 'string' ? rawBlock.body.trim().slice(0, 5000) : '';
      return {
        id,
        type: 'CALLOUT',
        title,
        tone,
        body,
      };
    }

    const body = typeof rawBlock?.body === 'string' ? rawBlock.body.trim().slice(0, 10000) : '';
    return {
      id,
      type: 'TEXT',
      title,
      body,
    };
  });

  const now = new Date().toISOString();
  const doc: ParrainGuide = {
    id: targetId,
    vaType: resolvedVaType,
    category: cleanCategory,
    tags: cleanTags,
    order: cleanOrder,
    title: cleanTitle,
    subtitle: cleanSubtitle,
    heroImageUrl: cleanHeroImageUrl,
    blocks: sanitizedBlocks,
    createdAt: options?.existingCreatedAt || now,
    updatedAt: now,
    updatedByUserId: actor.id,
    updatedByName: actor.displayName,
    isPrimary,
  };

  const byteLength = new TextEncoder().encode(JSON.stringify(doc)).length;
  if (byteLength > 800_000) {
    throw new Error(
      'Le contenu (images incluses) dépasse la limite de 800 Ko autorisée par Firestore. Compressez vos photos ou utilisez des URL https://.'
    );
  }

  return { doc, byteLength };
}
