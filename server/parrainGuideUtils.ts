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

export function buildDefaultParrainGuide(vaType: VAType): ParrainGuide {
  const now = new Date().toISOString();
  if (vaType === 'CHATTEUR') {
    return {
      id: 'CHATTEUR',
      vaType: 'CHATTEUR',
      title: 'Guide Officiel Parrain — Pôle VA Chatteur',
      subtitle:
        'Votre rôle d’accompagnement, les conditions de suivi et le barème de rémunération pour vos filleuls VA Chatteurs.',
      heroImageUrl: null,
      blocks: [
        {
          id: 'chatteur-role',
          type: 'TEXT',
          title: 'Votre rôle en tant que Parrain VA Chatteur',
          body:
            "En choisissant la spécialité VA Chatteur, vous mettez votre expertise du terrain au service des nouveaux talents recrutés via votre lien.\n\n• **Expertise ciblée** : vous parrainez uniquement des candidats orientés vers l'activité VA Chatting.\n• **Obligation de suivi** : vous devez accompagner vos filleuls depuis leur arrivée sur le serveur Recrutement jusqu'à leur passage en Formation, Simulation et Production.\n• **Réponse aux blocages** : votre disponibilité augmente directement le taux de validation et de rétention de vos filleuls.",
        },
        {
          id: 'chatteur-condition',
          type: 'CALLOUT',
          tone: 'condition',
          title: 'Condition stricte de rémunération & suivi',
          body:
            "La rémunération du parrainage dépend directement des **résultats réels** et du passage effectif de vos filleuls en **Production active VA Chatteur**. Un candidat qui bascule vers VA Instagram n'est ni affiché dans votre espace ni pris en compte dans votre rémunération.",
        },
        {
          id: 'chatteur-remuneration',
          type: 'TABLE',
          title: 'Parcours & Paliers de suivi VA Chatteur',
          headers: ['Étape du filleul', 'Votre action attendue', 'Impact parrainage'],
          rows: [
            ['1. Recrutement / Accepté', 'Accueillir le candidat et vérifier sa disponibilité', 'Dossier activé'],
            ['2. Formation & Simulation', 'Partager les bonnes pratiques, relancer avant les tests', 'Prépare la validation'],
            ['3. Validé → Production', 'Suivre les premiers jours en production active', 'Éligible à la rémunération selon résultats'],
          ],
        },
        {
          id: 'chatteur-practices',
          type: 'TEXT',
          title: 'Bonnes pratiques recommandées',
          body:
            '• Présentez clairement les horaires, l’engagement attendu et la rigueur demandée avant même que le candidat ne clique sur votre lien.\n• Prenez des nouvelles à chaque étape clé (entrée en formation, passage en simulation, mise en production).\n• Signalez rapidement à un Responsable si un filleul rencontre une difficulté technique ou de planning.',
        },
      ],
      updatedAt: now,
      updatedByUserId: 'SYSTEM',
      updatedByName: 'PAWAKO Administration',
      isDefault: true,
    };
  }

  return {
    id: 'INSTAGRAM',
    vaType: 'INSTAGRAM',
    title: 'Guide Officiel Parrain — Pôle VA Instagram',
    subtitle:
      'Votre rôle d’accompagnement, les conditions d’éligibilité et les standards de suivi pour vos filleuls VA Instagram.',
    heroImageUrl: null,
    blocks: [
      {
        id: 'insta-role',
        type: 'TEXT',
        title: 'Votre rôle en tant que Parrain VA Instagram',
        body:
          "En choisissant la spécialité VA Instagram, vous accompagnez des profils dédiés à la gestion et à la croissance sur Instagram.\n\n• **Expertise ciblée** : vous transmettez les méthodes spécifiques Instagram (régularité, respect des consignes comptes, réactivité).\n• **Obligation de suivi** : vous êtes responsable de guider vos filleuls pour qu'ils obtiennent des résultats concrets dès leur intégration.\n• **Qualité avant volume** : privilégiez des candidats sérieux, fiables et prêts à appliquer les process PAWAKO.",
      },
      {
        id: 'insta-condition',
        type: 'CALLOUT',
        tone: 'condition',
        title: 'Condition stricte de rémunération & suivi',
        body:
          "La rémunération du parrainage repose sur les **résultats obtenus par vos filleuls en Production VA Instagram**. Si un candidat recruté via votre lien change d'orientation vers VA Chatteur, il devient automatiquement hors spécialité : il n'est plus affiché dans votre espace ni rémunéré.",
      },
      {
        id: 'insta-remuneration',
        type: 'TABLE',
        title: 'Parcours & Engagements VA Instagram',
        headers: ['Étape du filleul', 'Votre action attendue', 'Impact parrainage'],
        rows: [
          ['1. Recrutement', 'Brief initial sur les attentes du pôle Instagram', 'Dossier enregistré'],
          ['2. Accepté', 'Vérifier l’équipement et l’application des consignes', 'Accès rapide à la production'],
          ['3. Production VA Instagram', 'Suivi de la régularité et des performances', 'Éligible à la rémunération selon résultats'],
        ],
      },
      {
        id: 'insta-practices',
        type: 'TEXT',
        title: 'Bonnes pratiques recommandées',
        body:
          '• Expliquez dès le premier contact les critères de sélection du pôle Instagram.\n• Accompagnez la prise en main des outils durant la première semaine en production.\n• Maintenez un suivi régulier pour garantir la performance durable de vos filleuls.',
      },
    ],
    updatedAt: now,
    updatedByUserId: 'SYSTEM',
    updatedByName: 'PAWAKO Administration',
    isDefault: true,
  };
}

export function sanitizeAndBuildParrainGuide(
  vaType: VAType,
  payload: {
    title: string;
    subtitle?: string;
    heroImageUrl?: string | null;
    blocks: ParrainGuideBlock[];
  },
  actor: { id: string; displayName: string }
): { doc: ParrainGuide; byteLength: number } {
  if (vaType !== 'CHATTEUR' && vaType !== 'INSTAGRAM') {
    throw new Error('Spécialité invalide (CHATTEUR ou INSTAGRAM attendu).');
  }

  const cleanTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
  if (!cleanTitle) {
    throw new Error('Le titre du guide est obligatoire.');
  }
  if (cleanTitle.length > 200) {
    throw new Error('Le titre du guide ne doit pas dépasser 200 caractères.');
  }

  const cleanSubtitle = typeof payload.subtitle === 'string' ? payload.subtitle.trim().slice(0, 500) : '';
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
    id: vaType,
    vaType,
    title: cleanTitle,
    subtitle: cleanSubtitle,
    heroImageUrl: cleanHeroImageUrl,
    blocks: sanitizedBlocks,
    updatedAt: now,
    updatedByUserId: actor.id,
    updatedByName: actor.displayName,
  };

  const byteLength = new TextEncoder().encode(JSON.stringify(doc)).length;
  if (byteLength > 800_000) {
    throw new Error(
      'Le contenu (images incluses) dépasse la limite de 800 Ko autorisée par Firestore. Compressez vos photos ou utilisez des URL https://.'
    );
  }

  return { doc, byteLength };
}
