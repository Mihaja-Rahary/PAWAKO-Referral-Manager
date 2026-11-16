import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ParrainGuide,
  ParrainGuideBlock,
  ParrainGuideBlockType,
  ParrainGuideCalloutTone,
  UserRole,
  VAType,
} from '../types';
import { api } from '../api';
import { ParrainGuideRenderer } from '../components/ParrainGuideRenderer';
import { SimpleRichTextEditor } from '../components/SimpleRichTextEditor';
import { formatDate } from '../utils/statusUtils';
import {
  BUILTIN_BLOG_COVERS,
  estimateReadingMinutes,
  extractGuideExcerpt,
  resolveGuideCoverUrl,
} from '../utils/blogCovers';
import { getSpecialtyTheme, getTopicColorTheme } from '../utils/categoryTheme';
import {
  BookOpen,
  Save,
  Eye,
  Edit3,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Upload,
  Image as ImageIcon,
  Table as TableIcon,
  MessageSquareWarning,
  AlignLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Search,
  RotateCcw,
  X,
  FilePlus2,
  Clock,
  Sparkles,
  Tag,
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
}

const FIRESTORE_SAFE_LIMIT_BYTES = 800_000;

const CATEGORY_PRESETS = [
  'Onboarding',
  'Discord',
  'Outils',
  'Rémunération',
  'Bonnes pratiques',
  'Règles & Suivi',
];

const TAG_SUGGESTIONS = [
  'Onboarding',
  'Discord',
  'Outils',
  'Rémunération',
  'Simulation',
  'Coaching',
  'Règles',
  'Checklist',
];

function cleanTagLabel(raw: string): string {
  return raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

type StarterTemplate = 'onboarding' | 'remuneration' | 'blank';

function createBlockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildStarterBlocks(template: StarterTemplate, vaType: VAType): ParrainGuideBlock[] {
  const trackLabel = vaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram';
  if (template === 'onboarding') {
    return [
      {
        id: createBlockId('txt'),
        type: 'TEXT',
        title: `Bienvenue dans le parcours ${trackLabel}`,
        body: `## Vos premières étapes de parrainage\n\n1. Vérifiez que votre lien Discord officiel est actif dans l'onglet **Mes Filleuls & Lien**.\n2. Présentez clairement les attentes du poste **${trackLabel}** avant d'envoyer votre lien.\n3. Suivez chaque filleul dès son arrivée jusqu'à sa mise en production.`,
      },
      {
        id: createBlockId('call'),
        type: 'CALLOUT',
        tone: 'condition',
        title: 'Point clé à retenir',
        body: `Seuls les filleuls actifs en **${trackLabel}** sont affichés dans votre espace et éligibles à la rémunération.`,
      },
    ];
  }
  if (template === 'remuneration') {
    return [
      {
        id: createBlockId('tbl'),
        type: 'TABLE',
        title: `Barème & Paliers ${trackLabel}`,
        headers: ['Palier', 'Condition de validation', 'Rémunération'],
        rows: [
          ['Palier 1', 'Filleul validé et actif 14 jours', 'À compléter'],
          ['Palier 2', 'Objectif de performance atteint', 'À compléter'],
        ],
      },
      {
        id: createBlockId('call'),
        type: 'CALLOUT',
        tone: 'info',
        title: 'Modalités de versement',
        body: 'Précisez ici les dates de calcul et les conditions de versement des primes.',
      },
    ];
  }
  return [
    {
      id: createBlockId('txt'),
      type: 'TEXT',
      title: 'Introduction',
      body: 'Rédigez votre article avec la barre visuelle ci-dessus : titres, listes, citations et liens.',
    },
  ];
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner un fichier image valide (PNG, JPEG, WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format d'image non reconnu par le navigateur."));
      img.onload = () => {
        try {
          const maxDim = 1000;
          let targetW = img.naturalWidth || img.width || 800;
          let targetH = img.naturalHeight || img.height || 600;

          if (targetW > maxDim) {
            const ratio = maxDim / targetW;
            targetW = maxDim;
            targetH = Math.max(1, Math.round(targetH * ratio));
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Contexte graphique indisponible pour la compression.'));
            return;
          }

          ctx.drawImage(img, 0, 0, targetW, targetH);

          let dataUrl = canvas.toDataURL('image/webp', 0.78);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          }

          if (dataUrl.length > 500_000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          }

          if (dataUrl.length > 650_000) {
            reject(
              new Error(
                'Image encore trop volumineuse après compression (> 650 Ko). Utilisez une image plus légère ou une URL https://.'
              )
            );
            return;
          }

          resolve(dataUrl);
        } catch (err: any) {
          reject(new Error(err?.message || "Erreur lors de l'optimisation de l'image."));
        }
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export const ParrainGuidesAdminView: React.FC<Props> = ({ currentUserRole }) => {
  const isAdmin = currentUserRole === 'ADMINISTRATEUR';

  const [guideList, setGuideList] = useState<ParrainGuide[]>([]);
  const [activeVaType, setActiveVaType] = useState<VAType>('CHATTEUR');
  const [selectedGuideId, setSelectedGuideId] = useState<string>('CHATTEUR');
  const [draft, setDraft] = useState<ParrainGuide | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [guideSearch, setGuideSearch] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');
  const [tagInput, setTagInput] = useState('');
  const [showCoverStudio, setShowCoverStudio] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newVaType, setNewVaType] = useState<VAType>('CHATTEUR');
  const [newCategory, setNewCategory] = useState('Onboarding');
  const [newTags, setNewTags] = useState<string[]>(['Onboarding']);
  const [newTagInput, setNewTagInput] = useState('');
  const [newSubtitle, setNewSubtitle] = useState('');
  const [newTemplate, setNewTemplate] = useState<StarterTemplate>('onboarding');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Delete / Reset Confirmation Modal state
  const [confirmDeleteGuide, setConfirmDeleteGuide] = useState<{
    guide: ParrainGuide;
    mode: 'delete' | 'reset';
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoringDefault, setIsRestoringDefault] = useState(false);

  // Unsaved guard modal when switching guides
  const [pendingSwitchGuide, setPendingSwitchGuide] = useState<ParrainGuide | null>(null);

  const selectedGuideIdRef = useRef(selectedGuideId);
  selectedGuideIdRef.current = selectedGuideId;
  const activeVaTypeRef = useRef(activeVaType);
  activeVaTypeRef.current = activeVaType;

  const loadGuides = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      setLoadErrorStatus(null);
      const res = await api.getAdminParrainGuides();
      const list: ParrainGuide[] = Array.isArray(res.guideList)
        ? res.guideList
        : [res.guides.CHATTEUR, res.guides.INSTAGRAM].filter((g): g is ParrainGuide => Boolean(g));

      setGuideList(list);

      const target =
        list.find(g => g.id === selectedGuideIdRef.current) ||
        list.find(g => g.vaType === activeVaTypeRef.current) ||
        list[0] ||
        null;

      if (target) {
        setSelectedGuideId(target.id);
        setActiveVaType(target.vaType);
        setDraft(structuredClone(target));
        setIsDirty(false);
      } else {
        setSelectedGuideId('');
        setDraft(null);
        setIsDirty(false);
      }
    } catch (err: any) {
      setLoadErrorStatus(typeof err?.status === 'number' ? err.status : null);
      setLoadError(err?.message || 'Impossible de charger les guides parrains.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGuides();
  }, [loadGuides]);

  const guidesByTrack = useMemo(() => {
    return {
      CHATTEUR: guideList.filter(g => g.vaType === 'CHATTEUR'),
      INSTAGRAM: guideList.filter(g => g.vaType === 'INSTAGRAM'),
    };
  }, [guideList]);

  const trackTopicFilters = useMemo(() => {
    const trackList = guidesByTrack[activeVaType] || [];
    const counts = new Map<string, { label: string; count: number }>();

    for (const g of trackList) {
      const seenInGuide = new Set<string>();
      const labels = [
        ...(g.category ? [g.category] : []),
        ...(Array.isArray(g.tags) ? g.tags : []),
      ];
      for (const rawLabel of labels) {
        const cleaned = cleanTagLabel(rawLabel);
        if (!cleaned) continue;
        const key = cleaned.toLowerCase();
        if (seenInGuide.has(key)) continue;
        seenInGuide.add(key);
        const current = counts.get(key);
        if (current) {
          current.count += 1;
        } else {
          counts.set(key, { label: cleaned, count: 1 });
        }
      }
    }

    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')
    );
  }, [guidesByTrack, activeVaType]);

  const allKnownTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const preset of [...TAG_SUGGESTIONS, ...CATEGORY_PRESETS]) {
      map.set(preset.toLowerCase(), preset);
    }
    for (const g of guideList) {
      if (g.category) {
        const cleaned = cleanTagLabel(g.category);
        if (cleaned && !map.has(cleaned.toLowerCase())) {
          map.set(cleaned.toLowerCase(), cleaned);
        }
      }
      if (Array.isArray(g.tags)) {
        for (const t of g.tags) {
          const cleaned = cleanTagLabel(t);
          if (cleaned && !map.has(cleaned.toLowerCase())) {
            map.set(cleaned.toLowerCase(), cleaned);
          }
        }
      }
    }
    return Array.from(map.values());
  }, [guideList]);

  const filteredTrackGuides = useMemo(() => {
    const trackList = guidesByTrack[activeVaType] || [];
    const q = guideSearch.trim().toLowerCase();
    const catKey = activeCategoryFilter === 'ALL' ? null : activeCategoryFilter.toLowerCase();

    return trackList.filter(g => {
      if (catKey) {
        const guideTopics = [
          ...(g.category ? [cleanTagLabel(g.category).toLowerCase()] : []),
          ...(Array.isArray(g.tags) ? g.tags.map(t => cleanTagLabel(t).toLowerCase()) : []),
        ];
        if (!guideTopics.includes(catKey)) return false;
      }

      if (!q) return true;
      const inTags = Array.isArray(g.tags) && g.tags.some(t => t.toLowerCase().includes(q));
      return (
        g.title.toLowerCase().includes(q) ||
        (g.category || '').toLowerCase().includes(q) ||
        (g.subtitle || '').toLowerCase().includes(q) ||
        inTags
      );
    });
  }, [guidesByTrack, activeVaType, guideSearch, activeCategoryFilter]);

  const applyGuideSelection = (target: ParrainGuide) => {
    setSelectedGuideId(target.id);
    setActiveVaType(target.vaType);
    setDraft(structuredClone(target));
    setIsDirty(false);
    setTagInput('');
    setFeedback(null);
  };

  const handleSelectGuide = (target: ParrainGuide) => {
    if (draft && target.id === draft.id) return;
    if (isDirty) {
      setPendingSwitchGuide(target);
      return;
    }
    applyGuideSelection(target);
  };

  const handleSelectTrack = (vaType: VAType) => {
    if (vaType === activeVaType) return;
    setGuideSearch('');
    setActiveCategoryFilter('ALL');
    const trackGuides = guidesByTrack[vaType] || [];
    const primary = trackGuides.find(g => g.id === vaType) || trackGuides[0];
    if (!primary) {
      setActiveVaType(vaType);
      setSelectedGuideId('');
      setDraft(null);
      setIsDirty(false);
      setFeedback(null);
      return;
    }
    if (isDirty) {
      setPendingSwitchGuide(primary);
      return;
    }
    applyGuideSelection(primary);
  };

  const estimatedBytes = useMemo(() => {
    if (!draft) return 0;
    try {
      return new TextEncoder().encode(JSON.stringify(draft)).length;
    } catch {
      return 0;
    }
  }, [draft]);

  const sizeKb = Math.round(estimatedBytes / 1024);
  const maxKb = Math.round(FIRESTORE_SAFE_LIMIT_BYTES / 1024);
  const isOverSizeLimit = estimatedBytes > FIRESTORE_SAFE_LIMIT_BYTES;

  const updateDraft = (updater: (prev: ParrainGuide) => ParrainGuide) => {
    setDraft(prev => (prev ? updater(prev) : prev));
    setIsDirty(true);
    setFeedback(null);
  };

  const handleAddBlock = (type: ParrainGuideBlockType) => {
    if (!isAdmin) return;
    let newBlock: ParrainGuideBlock;
    if (type === 'TABLE') {
      newBlock = {
        id: createBlockId('tbl'),
        type: 'TABLE',
        title: 'Nouveau tableau',
        headers: ['Critère', 'Détail', 'Validation'],
        rows: [['Exemple ligne 1', 'À compléter', 'Condition requise']],
      };
    } else if (type === 'IMAGE') {
      newBlock = {
        id: createBlockId('img'),
        type: 'IMAGE',
        title: 'Illustration / Schéma',
        imageUrl: '',
        caption: '',
      };
    } else if (type === 'CALLOUT') {
      newBlock = {
        id: createBlockId('call'),
        type: 'CALLOUT',
        tone: 'condition',
        title: 'Condition / Point d’attention',
        body: 'Expliquez ici la **règle importante** ou la bonne pratique à respecter.',
      };
    } else {
      newBlock = {
        id: createBlockId('txt'),
        type: 'TEXT',
        title: 'Nouveau chapitre',
        body: 'Rédigez votre contenu ici.\n\n- Utilisez la barre visuelle ci-dessus pour formater votre texte\n- Ajoutez des liens utiles pour accompagner les nouveaux parrains',
      };
    }

    updateDraft(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    if (!isAdmin) return;
    updateDraft(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.blocks.length) return prev;
      const nextBlocks = [...prev.blocks];
      const [item] = nextBlocks.splice(index, 1);
      nextBlocks.splice(target, 0, item);
      return { ...prev, blocks: nextBlocks };
    });
  };

  const handleDeleteBlock = (blockId: string) => {
    if (!isAdmin) return;
    updateDraft(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== blockId),
    }));
  };

  const handleUpdateBlock = (blockId: string, patch: Partial<ParrainGuideBlock>) => {
    if (!isAdmin) return;
    updateDraft(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      setIsUploadingHero(true);
      setFeedback(null);
      const dataUrl = await compressImageFileToDataUrl(file);
      updateDraft(prev => ({ ...prev, heroImageUrl: dataUrl }));
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || "Échec de l'import de la couverture." });
    } finally {
      setIsUploadingHero(false);
    }
  };

  const handleBlockImageUpload = async (blockId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !isAdmin) return;
    try {
      setUploadingBlockId(blockId);
      setFeedback(null);
      const dataUrl = await compressImageFileToDataUrl(file);
      handleUpdateBlock(blockId, { imageUrl: dataUrl });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || "Échec de l'import de l'image." });
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleTableAddColumn = (block: ParrainGuideBlock) => {
    const headers = [...(block.headers || [])];
    if (headers.length >= 10) return;
    headers.push(`Colonne ${headers.length + 1}`);
    const rows = (block.rows || []).map(r => [...r, '']);
    handleUpdateBlock(block.id, { headers, rows });
  };

  const handleTableRemoveColumn = (block: ParrainGuideBlock, colIdx: number) => {
    const headers = [...(block.headers || [])];
    if (headers.length <= 1) return;
    headers.splice(colIdx, 1);
    const rows = (block.rows || []).map(r => r.filter((_, idx) => idx !== colIdx));
    handleUpdateBlock(block.id, { headers, rows });
  };

  const handleTableAddRow = (block: ParrainGuideBlock) => {
    const colCount = Math.max(1, (block.headers || []).length);
    const rows = [...(block.rows || []), Array.from({ length: colCount }, () => '')];
    handleUpdateBlock(block.id, { rows });
  };

  const handleTableRemoveRow = (block: ParrainGuideBlock, rowIdx: number) => {
    const rows = (block.rows || []).filter((_, idx) => idx !== rowIdx);
    handleUpdateBlock(block.id, { rows });
  };

  const handleSave = async () => {
    if (!draft || !isAdmin || isSaving) return;
    if (!draft.title.trim()) {
      setFeedback({ type: 'err', text: "Le titre de l'article est obligatoire." });
      return;
    }
    if (isOverSizeLimit) {
      setFeedback({
        type: 'err',
        text: `La taille totale (${sizeKb} Ko) dépasse le plafond de ${maxKb} Ko. Allégez vos images ou utilisez des liens https://.`,
      });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const res = await api.saveAdminParrainGuide(draft.id, {
        vaType: draft.vaType,
        title: draft.title.trim(),
        subtitle: draft.subtitle || '',
        category: draft.category || (draft.isPrimary ? 'Guide principal' : 'Onboarding'),
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        order: typeof draft.order === 'number' ? draft.order : draft.isPrimary ? 0 : 10,
        heroImageUrl: draft.heroImageUrl || null,
        blocks: draft.blocks,
      });

      setGuideList(prev => {
        const exists = prev.some(g => g.id === res.guide.id);
        return exists ? prev.map(g => (g.id === res.guide.id ? res.guide : g)) : [...prev, res.guide];
      });
      setActiveVaType(res.guide.vaType);
      setSelectedGuideId(res.guide.id);
      setDraft(structuredClone(res.guide));
      setIsDirty(false);
      setFeedback({
        type: 'ok',
        text: `Article « ${res.guide.title} » enregistré et publié dans le journal des parrains ${
          res.guide.vaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'
        }.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || "Erreur lors de l'enregistrement de l'article.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDraftTag = (raw: string) => {
    if (!isAdmin || !draft) return;
    const cleaned = cleanTagLabel(raw);
    if (!cleaned) return;
    const current = Array.isArray(draft.tags) ? draft.tags : [];
    if (current.some(t => t.toLowerCase() === cleaned.toLowerCase())) {
      setTagInput('');
      return;
    }
    if (current.length >= 8) {
      setFeedback({ type: 'err', text: 'Un article peut contenir au maximum 8 tags.' });
      return;
    }
    updateDraft(prev => ({
      ...prev,
      tags: [...(Array.isArray(prev.tags) ? prev.tags : []), cleaned],
    }));
    setTagInput('');
  };

  const handleToggleDraftTag = (raw: string) => {
    if (!isAdmin || !draft) return;
    const cleaned = cleanTagLabel(raw);
    if (!cleaned) return;
    const current = Array.isArray(draft.tags) ? draft.tags : [];
    const exists = current.some(t => t.toLowerCase() === cleaned.toLowerCase());
    if (exists) {
      updateDraft(prev => ({
        ...prev,
        tags: (prev.tags || []).filter(t => t.toLowerCase() !== cleaned.toLowerCase()),
      }));
    } else {
      handleAddDraftTag(cleaned);
    }
  };

  const handleAddNewModalTag = (raw: string) => {
    const cleaned = cleanTagLabel(raw);
    if (!cleaned) return;
    setNewTags(prev => {
      if (prev.some(t => t.toLowerCase() === cleaned.toLowerCase()) || prev.length >= 8) {
        return prev;
      }
      return [...prev, cleaned];
    });
    setNewTagInput('');
  };

  const handleToggleNewModalTag = (raw: string) => {
    const cleaned = cleanTagLabel(raw);
    if (!cleaned) return;
    setNewTags(prev => {
      const exists = prev.some(t => t.toLowerCase() === cleaned.toLowerCase());
      if (exists) {
        return prev.filter(t => t.toLowerCase() !== cleaned.toLowerCase());
      }
      if (prev.length >= 8) return prev;
      return [...prev, cleaned];
    });
  };

  const openCreateModal = () => {
    setNewTitle('');
    setNewVaType(activeVaType);
    setNewCategory('Onboarding');
    setNewTags(['Onboarding']);
    setNewTagInput('');
    setNewSubtitle('');
    setNewTemplate('onboarding');
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreateGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || isCreating) return;
    if (!newTitle.trim()) {
      setCreateError('Veuillez saisir un titre pour le nouvel article.');
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);
      const nextOrder = (guidesByTrack[newVaType]?.length || 1) * 10;
      const res = await api.createAdminParrainGuide({
        vaType: newVaType,
        title: newTitle.trim(),
        subtitle: newSubtitle.trim(),
        category: newCategory.trim() || 'Onboarding',
        tags: newTags,
        order: nextOrder,
        heroImageUrl: null,
        blocks: buildStarterBlocks(newTemplate, newVaType),
      });

      setGuideList(prev => [...prev, res.guide]);
      setShowCreateModal(false);
      setActiveVaType(res.guide.vaType);
      setActiveCategoryFilter('ALL');
      setSelectedGuideId(res.guide.id);
      setDraft(structuredClone(res.guide));
      setIsDirty(false);
      setMode('edit');
      setFeedback({
        type: 'ok',
        text: `Nouvel article « ${res.guide.title} » créé. Vous pouvez maintenant le rédiger et le publier.`,
      });
    } catch (err: any) {
      setCreateError(err?.message || "Impossible de créer l'article.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDeleteGuide = async () => {
    if (!confirmDeleteGuide || !isAdmin || isDeleting) return;
    try {
      setIsDeleting(true);
      const { guide: target, mode: deleteMode } = confirmDeleteGuide;
      const isPermanentDelete = deleteMode === 'delete';
      const res = await api.deleteAdminParrainGuide(target.id, { permanent: isPermanentDelete });

      const nextList: ParrainGuide[] = Array.isArray(res.guideList)
        ? res.guideList
        : guideList.filter(g => g.id !== target.id);

      setGuideList(nextList);
      setConfirmDeleteGuide(null);

      const fallbackGuide =
        (res.resetToDefault
          ? nextList.find(g => g.id === target.id)
          : nextList.find(g => g.vaType === target.vaType && g.id === target.vaType) ||
            nextList.find(g => g.vaType === target.vaType)) || null;

      if (fallbackGuide) {
        setActiveVaType(fallbackGuide.vaType);
        setSelectedGuideId(fallbackGuide.id);
        setDraft(structuredClone(fallbackGuide));
      } else {
        setActiveVaType(target.vaType);
        setSelectedGuideId('');
        setDraft(null);
      }
      setIsDirty(false);
      setFeedback({
        type: 'ok',
        text: res.resetToDefault
          ? `L'article principal « ${target.title} » a été réinitialisé sur le modèle par défaut.`
          : `L'article « ${target.title} » a été supprimé du journal des parrains.`,
      });
    } catch (err: any) {
      setConfirmDeleteGuide(null);
      setFeedback({
        type: 'err',
        text: err?.message || 'Erreur lors de la suppression.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestoreDefaultGuide = async (vaType: VAType) => {
    if (!isAdmin || isRestoringDefault) return;
    try {
      setIsRestoringDefault(true);
      setFeedback(null);
      const res = await api.restoreDefaultAdminParrainGuide(vaType);
      const nextList = Array.isArray(res.guideList)
        ? res.guideList
        : [...guideList.filter(g => g.id !== res.guide.id), res.guide];
      setGuideList(nextList);
      setActiveVaType(vaType);
      setActiveCategoryFilter('ALL');
      setSelectedGuideId(res.guide.id);
      setDraft(structuredClone(res.guide));
      setIsDirty(false);
      setFeedback({
        type: 'ok',
        text: `Le guide officiel « ${res.guide.title} » a été restauré dans le journal.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || 'Impossible de restaurer le guide officiel.',
      });
    } finally {
      setIsRestoringDefault(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-12 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
        Chargement du studio éditorial PAWAKO...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white dark:bg-[#100b1a] border border-rose-200 dark:border-rose-500/30 rounded-2xl p-8 max-w-xl mx-auto text-center space-y-3 text-xs">
        <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
        <p className="text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
          {loadError}
        </p>
        {loadErrorStatus === 404 && (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#171026] border border-slate-200 dark:border-[#2e224a] text-left text-[11px] text-slate-600 dark:text-[#b7aed0] space-y-1">
            <div className="font-semibold text-slate-800 dark:text-[#f4f1fa]">
              Action requise côté Cloudflare Worker :
            </div>
            <p>
              Le frontend appelle une nouvelle route qui n&apos;est pas encore active sur votre Worker déployé. Exécutez{' '}
              <code className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-[#241a38] font-mono">
                npm run deploy:worker
              </code>{' '}
              puis cliquez sur Réessayer.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={loadGuides}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg cursor-pointer"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const isPrimaryDraft = Boolean(draft && (draft.isPrimary || draft.id === 'CHATTEUR' || draft.id === 'INSTAGRAM'));
  const hasPrimaryInActiveTrack = guidesByTrack[activeVaType].some(g => g.id === activeVaType);
  const resolvedCover = draft ? resolveGuideCoverUrl(draft) : '';
  const draftMinutes = draft ? estimateReadingMinutes(draft) : 1;

  return (
    <div className="space-y-6">
      {/* Studio Top Bar + Editorial Library */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Studio Éditorial Parrains</span>
            </div>
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-slate-950 dark:text-[#f8f6fc] tracking-tight">
              Articles &amp; Guides d&apos;Onboarding
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9d93b8]">
              Rédigez des articles immersifs avec couverture, mise en forme visuelle, tableaux de rémunération et photos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Editor / Blog Preview switch */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
              <button
                type="button"
                onClick={() => setMode('edit')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  mode === 'edit'
                    ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa] shadow-xs'
                    : 'text-slate-600 dark:text-[#9d93b8]'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Studio</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  mode === 'preview'
                    ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa] shadow-xs'
                    : 'text-slate-600 dark:text-[#9d93b8]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Aperçu Blog</span>
              </button>
            </div>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-[#f4f1fa] bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>Nouvel article</span>
                </button>

                {draft && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isOverSizeLimit}
                    className="min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#FA4616] to-rose-500 hover:from-[#e43d11] hover:to-rose-400 disabled:opacity-50 rounded-xl shadow-sm shadow-[#FA4616]/20 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{isSaving ? 'Publication...' : isDirty ? 'Publier les modifs *' : 'Enregistrer & Publier'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Specialty Tabs + Weight */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-[#1e1530]">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'CHATTEUR' as VAType, label: 'Journal VA Chatteur' },
                { id: 'INSTAGRAM' as VAType, label: 'Journal VA Instagram' },
              ]
            ).map(tab => {
              const active = activeVaType === tab.id;
              const count = guidesByTrack[tab.id].length;
              const specTheme = getSpecialtyTheme(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectTrack(tab.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer ${
                    active
                      ? `${specTheme.button} border-transparent`
                      : 'bg-slate-50 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border-slate-200 dark:border-[#241a38] hover:bg-slate-100 dark:hover:bg-[#231839]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      active ? 'text-white/90' : 'text-slate-400 dark:text-[#7c7296]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {draft && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-[#9d93b8]">
              {draft.updatedAt && (
                <span>
                  Modifié le <span className="font-mono tabular-nums">{formatDate(draft.updatedAt)}</span>
                </span>
              )}
              <span
                className={`font-mono tabular-nums px-2 py-0.5 rounded-md border ${
                  isOverSizeLimit
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-50 dark:bg-[#171026] border-slate-200 dark:border-[#241a38]'
                }`}
              >
                Poids : {sizeKb} / {maxKb} Ko
              </span>
            </div>
          )}
        </div>

        {/* Visual Blog Cards Selector with Category & Tag Organization Filter */}
        <div className="pt-4 border-t border-slate-100 dark:border-[#1e1530] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9d93b8]">
                Articles publiés dans ce journal ({guidesByTrack[activeVaType].length})
              </div>
              {isAdmin && !hasPrimaryInActiveTrack && (
                <button
                  type="button"
                  disabled={isRestoringDefault}
                  onClick={() => handleRestoreDefaultGuide(activeVaType)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 border border-violet-200 dark:border-violet-500/30 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${isRestoringDefault ? 'animate-spin' : ''}`} />
                  <span>Restaurer le guide officiel</span>
                </button>
              )}
            </div>
            {guidesByTrack[activeVaType].length > 1 && (
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={guideSearch}
                  onChange={e => setGuideSearch(e.target.value)}
                  placeholder="Rechercher titre, catégorie ou tag..."
                  className="w-full min-h-[34px] pl-8 pr-3 py-1 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                />
              </div>
            )}
          </div>

          {trackTopicFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par catégorie ou tag">
              <button
                type="button"
                onClick={() => setActiveCategoryFilter('ALL')}
                className={`min-h-[30px] px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  activeCategoryFilter === 'ALL'
                    ? 'bg-slate-950 dark:bg-violet-600 text-white border-slate-950 dark:border-violet-600'
                    : 'bg-slate-50 dark:bg-[#171026] text-slate-600 dark:text-[#b7aed0] border-slate-200 dark:border-[#241a38] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                }`}
              >
                <span>Tous</span>
                <span className="font-mono tabular-nums opacity-75">
                  {guidesByTrack[activeVaType].length}
                </span>
              </button>

              {trackTopicFilters.map(topic => {
                const isActive = activeCategoryFilter.toLowerCase() === topic.label.toLowerCase();
                const topicTheme = getTopicColorTheme(topic.label);
                return (
                  <button
                    key={topic.label}
                    type="button"
                    onClick={() =>
                      setActiveCategoryFilter(prev =>
                        prev.toLowerCase() === topic.label.toLowerCase() ? 'ALL' : topic.label
                      )
                    }
                    className={`min-h-[30px] px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? topicTheme.chipActive
                        : `${topicTheme.badge} hover:brightness-95 dark:hover:brightness-110`
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-current opacity-80' : topicTheme.dot}`} />
                    <span>{topic.label}</span>
                    <span className="font-mono tabular-nums opacity-75">{topic.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {guidesByTrack[activeVaType].length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-[#241a38] text-xs text-slate-500 dark:text-[#9d93b8] text-center space-y-3">
              <p>
                Aucun article publié dans le journal{' '}
                <strong>{activeVaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'}</strong>.
              </p>
              {isAdmin && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Créer un article</span>
                  </button>
                  <button
                    type="button"
                    disabled={isRestoringDefault}
                    onClick={() => handleRestoreDefaultGuide(activeVaType)}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] text-slate-800 dark:text-[#f4f1fa] font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isRestoringDefault ? 'animate-spin' : ''}`} />
                    <span>Restaurer le guide officiel par défaut</span>
                  </button>
                </div>
              )}
            </div>
          ) : filteredTrackGuides.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-[#241a38] text-xs text-slate-500 dark:text-[#9d93b8] text-center space-y-2">
              <p>
                Aucun article ne correspond à votre filtre
                {activeCategoryFilter !== 'ALL' ? ` (« ${activeCategoryFilter} »)` : ''}
                {guideSearch.trim() ? ` pour « ${guideSearch.trim()} »` : ''}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryFilter('ALL');
                  setGuideSearch('');
                }}
                className="px-3 py-1 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] text-slate-800 dark:text-[#f4f1fa] font-semibold rounded-lg cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredTrackGuides.map(g => {
                const isSelected = Boolean(draft && g.id === draft.id);
                const thumbUrl = resolveGuideCoverUrl(g);
                const mins = estimateReadingMinutes(g);
                const cardTags = Array.isArray(g.tags) ? g.tags.slice(0, 3) : [];
                const cardCat = g.category || (g.isPrimary ? 'Guide principal' : 'Onboarding');
                const cardTheme = getTopicColorTheme(cardCat);
                return (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectGuide(g)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectGuide(g);
                      }
                    }}
                    className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col focus:outline-none focus:ring-2 focus:ring-[#FA4616]/50 ${
                      isSelected
                        ? 'bg-orange-50/40 dark:bg-[#1b1520] border-[#FA4616] ring-1 ring-[#FA4616]/40'
                        : `bg-slate-50/70 dark:bg-[#140d21] border-slate-200 dark:border-[#241a38] ${cardTheme.borderAccent}`
                    }`}
                  >
                    <div className="aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-[#08050f] border-b border-slate-200/70 dark:border-[#241a38]">
                      <img
                        src={thumbUrl}
                        alt={g.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <div className="p-3.5 space-y-1.5 flex-1 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider truncate ${cardTheme.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cardTheme.dot}`} />
                            <span className="truncate">{cardCat}</span>
                          </span>
                          <span className="font-mono tabular-nums shrink-0">{mins} min</span>
                        </div>
                        <div className="font-serif text-sm font-bold text-slate-900 dark:text-[#f4f1fa] line-clamp-2 leading-snug">
                          {g.title}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-[#9d93b8] line-clamp-2 leading-relaxed">
                          {extractGuideExcerpt(g, 95)}
                        </p>
                        {cardTags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {cardTags.map(t => {
                              const tagTheme = getTopicColorTheme(t);
                              return (
                                <span
                                  key={t}
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${tagTheme.badge}`}
                                >
                                  #{t}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 mt-1 border-t border-slate-200/60 dark:border-[#241a38] flex items-center justify-between gap-2 text-[11px] text-slate-400 dark:text-[#7c7296]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono tabular-nums shrink-0">
                            {g.blocks.length} bloc{g.blocks.length > 1 ? 's' : ''}
                          </span>
                          {isSelected && (
                            <span className="font-bold text-[#FA4616] dark:text-orange-400 truncate">
                              · En édition
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setConfirmDeleteGuide({ guide: g, mode: 'delete' });
                            }}
                            title={`Supprimer « ${g.title} »`}
                            aria-label={`Supprimer « ${g.title} »`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/60 border border-rose-200/80 dark:border-rose-500/30 cursor-pointer shrink-0 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Supprimer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 bg-amber-50 dark:bg-[#1b1410] border border-amber-200 dark:border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            Mode lecture seule : seuls les comptes <strong>Administrateur</strong> peuvent créer, modifier et supprimer les articles.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {!draft ? (
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-10 text-center space-y-3 text-xs text-slate-500 dark:text-[#9d93b8]">
          <BookOpen className="w-7 h-7 text-violet-500 mx-auto" />
          <div className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa]">
            Aucun article sélectionné dans le journal {activeVaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'}
          </div>
          <p className="max-w-md mx-auto leading-relaxed">
            Créez un nouvel article ou restaurez le guide officiel pour publier du contenu auprès des parrains de cette spécialité.
          </p>
        </div>
      ) : mode === 'preview' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-[#9d93b8]">
              Aperçu lecteur tel que vu par un parrain {draft.vaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'}
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmDeleteGuide({ guide: draft, mode: 'delete' })}
                className="min-h-[32px] px-3 py-1 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/25 hover:bg-rose-100 dark:hover:bg-rose-950/45 border border-rose-200 dark:border-rose-500/30 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer cet article</span>
              </button>
            )}
          </div>
          <ParrainGuideRenderer guide={draft} />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Substack / Ghost-inspired Editorial Article Masthead Composer */}
          <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl overflow-hidden">
            {/* Editorial Metadata Strip */}
            <div className="px-5 sm:px-8 py-4 border-b border-slate-100 dark:border-[#1e1530] flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#140e22] text-xs">
              <div className="flex flex-wrap items-center gap-2.5 text-slate-600 dark:text-[#b7aed0]">
                <span className="font-semibold text-violet-700 dark:text-violet-300">
                  {draft.vaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  ~{draftMinutes} min de lecture
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoverStudio(prev => !prev)}
                  className="min-h-[34px] px-3 py-1 bg-white dark:bg-[#1f1633] hover:bg-slate-100 dark:hover:bg-[#2a1e45] border border-slate-200 dark:border-[#2e224a] rounded-lg font-semibold text-slate-700 dark:text-[#e9e5f5] flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span>{showCoverStudio ? 'Masquer options couverture' : 'Changer la couverture'}</span>
                </button>

                {isAdmin && isPrimaryDraft && !draft.isDefault && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGuide({ guide: draft, mode: 'reset' })}
                    className="min-h-[34px] px-3 py-1 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/25 hover:bg-amber-100 dark:hover:bg-amber-950/45 border border-amber-200 dark:border-amber-500/30 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Réinitialiser</span>
                  </button>
                )}

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGuide({ guide: draft, mode: 'delete' })}
                    className="min-h-[34px] px-3 py-1 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/25 hover:bg-rose-100 dark:hover:bg-rose-950/45 border border-rose-200 dark:border-rose-500/30 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer l&apos;article</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cover Gallery & URL Studio (Collapsible or triggered from header) */}
            {showCoverStudio && (
              <div className="px-5 sm:px-8 py-5 border-b border-slate-100 dark:border-[#1e1530] bg-slate-50/40 dark:bg-[#0d0817] space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-800 dark:text-[#f4f1fa] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    <span>Galerie de couvertures PAWAKO</span>
                  </div>
                  {isAdmin && draft.heroImageUrl && (
                    <button
                      type="button"
                      onClick={() => updateDraft(prev => ({ ...prev, heroImageUrl: null }))}
                      className="text-[11px] font-semibold text-violet-600 dark:text-violet-300 hover:underline cursor-pointer"
                    >
                      Revenir à la couverture automatique
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {BUILTIN_BLOG_COVERS.map(preset => {
                    const isActive = draft.heroImageUrl === preset.url;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => updateDraft(prev => ({ ...prev, heroImageUrl: preset.url }))}
                        className={`text-left rounded-xl border overflow-hidden transition-all cursor-pointer disabled:opacity-60 ${
                          isActive
                            ? 'border-violet-600 ring-2 ring-violet-500/30'
                            : 'border-slate-200 dark:border-[#241a38] hover:border-violet-400'
                        }`}
                      >
                        <div className="aspect-[16/9] w-full overflow-hidden bg-slate-200 dark:bg-[#08050f]">
                          <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-2 bg-white dark:bg-[#140e22]">
                          <div className="text-[11px] font-bold text-slate-900 dark:text-[#f4f1fa] truncate">
                            {preset.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.heroImageUrl || ''}
                    onChange={e => updateDraft(prev => ({ ...prev, heroImageUrl: e.target.value }))}
                    placeholder="Ou collez une URL https:// personnalisée..."
                    className="flex-1 min-h-[38px] px-3 py-1.5 font-mono border border-slate-200 dark:border-[#241a38] rounded-lg bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  />
                  {isAdmin && (
                    <label className="min-h-[38px] px-3.5 py-1.5 bg-white dark:bg-[#171026] hover:bg-slate-100 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5 text-violet-500" />
                      <span>{isUploadingHero ? 'Compression...' : 'Importer depuis PC'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleHeroUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Direct Editorial Headline & Lead Composer */}
            <div className="p-5 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#7c7296] mb-1">
                    Rubrique / Catégorie
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    list="pawako-guide-categories"
                    value={draft.category || ''}
                    onChange={e => updateDraft(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="Ex: Onboarding, Discord, Outils"
                    className="w-full min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  />
                  <datalist id="pawako-guide-categories">
                    {CATEGORY_PRESETS.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#7c7296] mb-1">
                    Parcours cible
                  </label>
                  <select
                    disabled={!isAdmin || isPrimaryDraft}
                    value={draft.vaType}
                    onChange={e => updateDraft(prev => ({ ...prev, vaType: e.target.value as VAType }))}
                    className="w-full min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  >
                    <option value="CHATTEUR">VA Chatteur</option>
                    <option value="INSTAGRAM">VA Instagram</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#7c7296] mb-1">
                    Ordre d&apos;affichage
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    disabled={!isAdmin || isPrimaryDraft}
                    value={typeof draft.order === 'number' ? draft.order : 0}
                    onChange={e =>
                      updateDraft(prev => ({
                        ...prev,
                        order: Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10) || 0)),
                      }))
                    }
                    className="w-full min-h-[36px] px-3 py-1.5 font-mono tabular-nums border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  />
                </div>
              </div>

              {/* Tags / Thématiques d'organisation */}
              <div className="pt-1 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#7c7296]">
                    <Tag className="w-3.5 h-3.5 text-violet-500" />
                    <span>Tags d&apos;organisation</span>
                  </label>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-[#7c7296]">
                    {(draft.tags || []).length} / 8
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(draft.tags || []).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => handleToggleDraftTag(tag)}
                      title={isAdmin ? `Retirer le tag ${tag}` : tag}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-[#1a112b] border border-violet-200 dark:border-violet-500/35 text-violet-800 dark:text-violet-200 font-semibold text-[11px] inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-default disabled:opacity-80 hover:bg-violet-100 dark:hover:bg-[#23173a] transition-colors"
                    >
                      <span>#{tag}</span>
                      {isAdmin && <X className="w-3 h-3 opacity-70" />}
                    </button>
                  ))}

                  {isAdmin && (draft.tags || []).length < 8 && (
                    <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddDraftTag(tagInput);
                          }
                        }}
                        placeholder="Ajouter un tag (ex: Discord, Outils)..."
                        className="flex-1 min-h-[32px] px-2.5 py-1 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddDraftTag(tagInput)}
                        disabled={!cleanTagLabel(tagInput)}
                        className="min-h-[32px] px-3 py-1 bg-slate-950 dark:bg-violet-600 hover:bg-slate-800 dark:hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-lg text-[11px] cursor-pointer whitespace-nowrap"
                      >
                        + Ajouter
                      </button>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400 dark:text-[#7c7296] mr-1">Suggestions :</span>
                    {allKnownTags
                      .filter(t => !(draft.tags || []).some(cur => cur.toLowerCase() === t.toLowerCase()))
                      .slice(0, 8)
                      .map(suggestion => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleAddDraftTag(suggestion)}
                          className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#241a38] bg-white dark:bg-[#140d21] text-slate-600 dark:text-[#b7aed0] hover:border-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors cursor-pointer"
                        >
                          + {suggestion}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.title}
                  onChange={e => updateDraft(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Titre de votre article..."
                  aria-label="Titre principal de l'article"
                  className="w-full font-serif text-2xl sm:text-3xl font-bold text-slate-950 dark:text-[#f8f6fc] bg-transparent border-b border-transparent focus:border-violet-500/50 pb-1 focus:outline-none placeholder:text-slate-300 dark:placeholder:text-[#4e3f6e] disabled:opacity-75"
                />

                <textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={draft.subtitle}
                  onChange={e => updateDraft(prev => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="Ajoutez un chapeau / sous-titre d'accroche qui donne envie de lire l'article..."
                  aria-label="Sous-titre ou introduction"
                  className="w-full text-sm sm:text-base text-slate-600 dark:text-[#b7aed0] bg-transparent border-b border-slate-100 dark:border-[#1e1530] focus:border-violet-500/50 pb-2 focus:outline-none resize-none placeholder:text-slate-300 dark:placeholder:text-[#4e3f6e] disabled:opacity-75"
                />
              </div>

              {/* Live Cover Hero Frame */}
              <div className="relative aspect-[16/9] max-h-[320px] w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38]">
                <img
                  src={resolvedCover}
                  alt={draft.title || 'Couverture'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                {!draft.heroImageUrl && (
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-[11px] text-white/90">
                    Couverture éditoriale automatique
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chapters / Blocks Composer */}
          <div className="space-y-4">
            {draft.blocks.map((block, index) => (
              <div
                key={block.id}
                className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#1e1530]">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-[#7c7296]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-violet-700 dark:text-violet-300 font-semibold">
                      {block.type === 'TEXT' && 'Chapitre éditorial'}
                      {block.type === 'CALLOUT' && 'Encadré mis en avant'}
                      {block.type === 'TABLE' && 'Tableau comparatif'}
                      {block.type === 'IMAGE' && 'Illustration / Photo'}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, -1)}
                        disabled={index === 0}
                        title="Monter"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#171026] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, 1)}
                        disabled={index === draft.blocks.length - 1}
                        title="Descendre"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#171026] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(block.id)}
                        title="Supprimer ce chapitre"
                        className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Section Title styled cleanly */}
                <div>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={block.title || ''}
                    onChange={e => handleUpdateBlock(block.id, { title: e.target.value })}
                    placeholder="Titre du chapitre (apparaît dans le sommaire de l'article)..."
                    className="w-full font-serif text-lg sm:text-xl font-bold text-slate-900 dark:text-[#f4f1fa] bg-transparent border-b border-slate-100 dark:border-[#1e1530] focus:border-violet-500/50 pb-1.5 focus:outline-none placeholder:text-slate-300 dark:placeholder:text-[#4e3f6e] disabled:opacity-70"
                  />
                </div>

                {/* Type-specific Editors */}
                {block.type === 'CALLOUT' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                        Ambiance visuelle
                      </label>
                      <select
                        disabled={!isAdmin}
                        value={block.tone || 'condition'}
                        onChange={e =>
                          handleUpdateBlock(block.id, {
                            tone: e.target.value as ParrainGuideCalloutTone,
                          })
                        }
                        className="min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                      >
                        <option value="condition">Règle & Condition (Violet)</option>
                        <option value="info">À noter (Neutre)</option>
                        <option value="warning">Point de vigilance (Ambre)</option>
                        <option value="success">Bonne pratique (Émeraude)</option>
                      </select>
                    </div>
                    <SimpleRichTextEditor
                      rows={4}
                      disabled={!isAdmin}
                      value={block.body || ''}
                      onChange={nextBody => handleUpdateBlock(block.id, { body: nextBody })}
                      placeholder="Rédigez le message clé de cet encadré..."
                    />
                  </div>
                )}

                {block.type === 'TEXT' && (
                  <SimpleRichTextEditor
                    rows={6}
                    disabled={!isAdmin}
                    value={block.body || ''}
                    onChange={nextBody => handleUpdateBlock(block.id, { body: nextBody })}
                    placeholder="Écrivez naturellement votre article : sélectionnez du texte pour le mettre en gras, titre, citation ou lien..."
                  />
                )}

                {block.type === 'IMAGE' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={block.imageUrl || ''}
                        onChange={e => handleUpdateBlock(block.id, { imageUrl: e.target.value })}
                        placeholder="https://... ou importer une photo"
                        className="flex-1 min-h-[36px] px-3 py-1.5 font-mono border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                      />
                      {isAdmin && (
                        <label className="min-h-[36px] px-3.5 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                          <Upload className="w-3.5 h-3.5 text-violet-500" />
                          <span>
                            {uploadingBlockId === block.id ? 'Compression...' : 'Importer photo'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleBlockImageUpload(block.id, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={block.caption || ''}
                      onChange={e => handleUpdateBlock(block.id, { caption: e.target.value })}
                      placeholder="Légende éditoriale (ex: Capture du suivi hebdomadaire sur Discord)"
                      className="w-full min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                    />

                    {block.imageUrl && (
                      <img
                        src={block.imageUrl}
                        alt={block.caption || block.title || 'Aperçu'}
                        referrerPolicy="no-referrer"
                        className="max-h-56 rounded-xl border border-slate-200 dark:border-[#241a38] object-contain bg-slate-50 dark:bg-[#08050f]"
                      />
                    )}
                  </div>
                )}

                {block.type === 'TABLE' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto border border-slate-200 dark:border-[#241a38] rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-[#171026] border-b border-slate-200 dark:border-[#241a38]">
                          <tr>
                            {(block.headers || []).map((header, colIdx) => (
                              <th key={colIdx} className="p-2 min-w-[140px]">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    disabled={!isAdmin}
                                    value={header}
                                    onChange={e => {
                                      const nextHeaders = [...(block.headers || [])];
                                      nextHeaders[colIdx] = e.target.value;
                                      handleUpdateBlock(block.id, { headers: nextHeaders });
                                    }}
                                    className="w-full px-2 py-1 font-semibold border border-slate-200 dark:border-[#2e224a] rounded bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                                  />
                                  {isAdmin && (block.headers || []).length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleTableRemoveColumn(block, colIdx)}
                                      title="Supprimer cette colonne"
                                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </th>
                            ))}
                            {isAdmin && <th className="p-2 w-10" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530]">
                          {(block.rows || []).map((row, rowIdx) => (
                            <tr key={rowIdx}>
                              {(block.headers || []).map((_, colIdx) => (
                                <td key={colIdx} className="p-2">
                                  <input
                                    type="text"
                                    disabled={!isAdmin}
                                    value={row[colIdx] || ''}
                                    onChange={e => {
                                      const nextRows = (block.rows || []).map((r, rI) =>
                                        rI === rowIdx
                                          ? Array.from(
                                              { length: (block.headers || []).length },
                                              (_, cI) => (cI === colIdx ? e.target.value : r[cI] || '')
                                            )
                                          : r
                                      );
                                      handleUpdateBlock(block.id, { rows: nextRows });
                                    }}
                                    className="w-full px-2 py-1 border border-slate-200 dark:border-[#241a38] rounded bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                                  />
                                </td>
                              ))}
                              {isAdmin && (
                                <td className="p-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleTableRemoveRow(block, rowIdx)}
                                    title="Supprimer la ligne"
                                    className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTableAddRow(block)}
                          className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Ajouter une ligne</span>
                        </button>
                        {(block.headers || []).length < 10 && (
                          <button
                            type="button"
                            onClick={() => handleTableAddColumn(block)}
                            className="px-2.5 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Ajouter une colonne</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Section Toolbar */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#100b1a] border border-dashed border-slate-300 dark:border-[#2e224a] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600 dark:text-[#9d93b8]">
                Enrichir l&apos;article avec un nouveau bloc :
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddBlock('TEXT')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <AlignLeft className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Chapitre texte</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('CALLOUT')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquareWarning className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Encadré clé</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('TABLE')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <TableIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Tableau</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('IMAGE')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Photo</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Créer un nouvel article / guide */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGuide}
            className="w-full max-w-lg bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 text-xs shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1e1530]">
              <h3 className="font-serif text-base font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
                <FilePlus2 className="w-4 h-4 text-violet-500" />
                <span>Créer un nouvel article parrain</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-[#f4f1fa] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Titre de l&apos;article *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Ex: Checklist des 7 premiers jours pour un nouveau parrain"
                  className="w-full min-h-[38px] px-3 py-2 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                    Parcours concerné *
                  </label>
                  <select
                    value={newVaType}
                    onChange={e => setNewVaType(e.target.value as VAType)}
                    className="w-full min-h-[38px] px-3 py-2 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                  >
                    <option value="CHATTEUR">VA Chatteur</option>
                    <option value="INSTAGRAM">VA Instagram</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                    Rubrique / Catégorie
                  </label>
                  <input
                    type="text"
                    list="pawako-guide-categories"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="Onboarding, Discord, Outils..."
                    className="w-full min-h-[38px] px-3 py-2 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                  />
                </div>
              </div>

              {/* Tags dans la modale de création */}
              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8]">
                  Tags (ex: Onboarding, Discord, Outils)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {newTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleNewModalTag(tag)}
                      className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-violet-50 dark:bg-[#1a112b] border border-violet-200 dark:border-violet-500/35 text-violet-800 dark:text-violet-200 font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>#{tag}</span>
                      <X className="w-3 h-3 opacity-70" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddNewModalTag(newTagInput);
                      }
                    }}
                    placeholder="Ajouter un tag personnalisé..."
                    className="flex-1 min-h-[34px] px-3 py-1.5 text-xs border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddNewModalTag(newTagInput)}
                    disabled={!cleanTagLabel(newTagInput)}
                    className="min-h-[34px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    + Ajouter
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {['Onboarding', 'Discord', 'Outils', 'Rémunération', 'Checklist']
                    .filter(s => !newTags.some(t => t.toLowerCase() === s.toLowerCase()))
                    .map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleAddNewModalTag(s)}
                        className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-[#241a38] bg-slate-50 dark:bg-[#140d21] text-slate-600 dark:text-[#b7aed0] hover:border-violet-400 cursor-pointer"
                      >
                        + {s}
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Chapeau / Accroche (Optionnel)
                </label>
                <textarea
                  rows={2}
                  value={newSubtitle}
                  onChange={e => setNewSubtitle(e.target.value)}
                  placeholder="Résumé affiché sur la carte blog et sous le titre..."
                  className="w-full p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Modèle de départ
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'onboarding' as StarterTemplate, label: 'Onboarding' },
                      { id: 'remuneration' as StarterTemplate, label: 'Rémunération' },
                      { id: 'blank' as StarterTemplate, label: 'Page vierge' },
                    ]
                  ).map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setNewTemplate(tpl.id)}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer transition-colors ${
                        newTemplate === tpl.id
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-slate-50 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border-slate-200 dark:border-[#241a38]'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1e1530]">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="min-h-[38px] px-3.5 py-1.5 bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] font-semibold rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="min-h-[38px] px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                {isCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isCreating ? 'Création...' : "Créer l'article"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirmer la suppression ou réinitialisation */}
      {confirmDeleteGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 text-xs shadow-xl">
            <div className="space-y-1.5">
              <h3 className="font-serif text-base font-bold text-slate-900 dark:text-[#f4f1fa]">
                {confirmDeleteGuide.mode === 'reset'
                  ? 'Réinitialiser le guide principal ?'
                  : 'Supprimer cet article ?'}
              </h3>
              <p className="text-slate-600 dark:text-[#b7aed0] leading-relaxed">
                {confirmDeleteGuide.mode === 'reset'
                  ? `Cette action supprime vos personnalisations sur « ${confirmDeleteGuide.guide.title} » et restaure le modèle officiel par défaut.`
                  : confirmDeleteGuide.guide.isPrimary
                    ? `L'article officiel « ${confirmDeleteGuide.guide.title} » sera retiré du journal des parrains et du studio. Vous pourrez le restaurer à tout moment via « Restaurer le guide officiel ».`
                    : `L'article « ${confirmDeleteGuide.guide.title} » sera retiré immédiatement du journal des parrains. Cette action est irréversible.`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1e1530]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDeleteGuide(null)}
                className="min-h-[38px] px-3.5 py-1.5 bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] font-semibold rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteGuide}
                className={`min-h-[38px] px-4 py-1.5 disabled:opacity-50 text-white font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer ${
                  confirmDeleteGuide.mode === 'reset'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : confirmDeleteGuide.mode === 'reset' ? (
                  <RotateCcw className="w-3.5 h-3.5" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {isDeleting
                    ? 'Suppression...'
                    : confirmDeleteGuide.mode === 'reset'
                      ? 'Réinitialiser'
                      : 'Supprimer'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Modifications non enregistrées */}
      {pendingSwitchGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl p-5 sm:p-6 space-y-4 text-xs shadow-xl">
            <div className="space-y-1.5">
              <h3 className="font-serif text-base font-bold text-slate-900 dark:text-[#f4f1fa]">
                Modifications non publiées
              </h3>
              <p className="text-slate-600 dark:text-[#b7aed0] leading-relaxed">
                Vous avez modifié l&apos;article actuel sans enregistrer. Voulez-vous abandonner ces modifications et ouvrir «{' '}
                <strong>{pendingSwitchGuide.title}</strong> » ?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#1e1530]">
              <button
                type="button"
                onClick={() => setPendingSwitchGuide(null)}
                className="min-h-[38px] px-3.5 py-1.5 bg-slate-100 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] font-semibold rounded-lg cursor-pointer"
              >
                Rester sur le studio
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingSwitchGuide;
                  setPendingSwitchGuide(null);
                  applyGuideSelection(target);
                }}
                className="min-h-[38px] px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg cursor-pointer"
              >
                Abandonner et ouvrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
