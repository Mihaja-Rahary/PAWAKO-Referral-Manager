import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { formatDate } from '../utils/statusUtils';
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
} from 'lucide-react';

interface Props {
  currentUserRole: UserRole;
}

const FIRESTORE_SAFE_LIMIT_BYTES = 800_000;

function createBlockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function compressImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Veuillez sélectionner un fichier image valide (PNG, JPEG, WebP).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));
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

          // Tente WebP (plus léger) puis JPEG en secours
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

  const [guides, setGuides] = useState<Record<VAType, ParrainGuide> | null>(null);
  const [activeVaType, setActiveVaType] = useState<VAType>('CHATTEUR');
  const [draft, setDraft] = useState<ParrainGuide | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadGuides = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.getAdminParrainGuides();
      setGuides(res.guides);
      setDraft(structuredClone(res.guides[activeVaType]));
    } catch (err: any) {
      setLoadError(err?.message || 'Impossible de charger les guides parrains.');
    } finally {
      setIsLoading(false);
    }
  }, [activeVaType]);

  useEffect(() => {
    loadGuides();
  }, []);

  const handleSelectTrack = (vaType: VAType) => {
    setActiveVaType(vaType);
    setFeedback(null);
    if (guides?.[vaType]) {
      setDraft(structuredClone(guides[vaType]));
    }
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
        rows: [
          ['Exemple ligne 1', 'À compléter', 'Condition requise'],
        ],
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
        body: 'Expliquez ici la règle importante ou la bonne pratique à respecter.',
      };
    } else {
      newBlock = {
        id: createBlockId('txt'),
        type: 'TEXT',
        title: 'Nouvelle section',
        body: 'Rédigez votre contenu ici.\n\n- Utilisez **gras** pour mettre en valeur\n- Utilisez *italique* pour les précisions',
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
      setFeedback({ type: 'err', text: err?.message || "Échec de l'import de la bannière." });
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
      setFeedback({ type: 'err', text: 'Le titre du guide est obligatoire.' });
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
      const res = await api.saveAdminParrainGuide(activeVaType, {
        title: draft.title.trim(),
        subtitle: draft.subtitle || '',
        heroImageUrl: draft.heroImageUrl || null,
        blocks: draft.blocks,
      });

      setGuides(prev =>
        prev
          ? {
              ...prev,
              [activeVaType]: res.guide,
            }
          : prev
      );
      setDraft(structuredClone(res.guide));
      setFeedback({
        type: 'ok',
        text: `Guide ${activeVaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'} enregistré et publié immédiatement dans l'accueil des parrains.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'err',
        text: err?.message || "Erreur lors de l'enregistrement du guide.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-12 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-violet-500" />
        Chargement de l&apos;éditeur des guides parrains...
      </div>
    );
  }

  if (loadError || !draft) {
    return (
      <div className="bg-white dark:bg-[#100b1a] border border-rose-200 dark:border-rose-500/30 rounded-xl p-8 text-center space-y-3 text-xs">
        <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
        <p className="text-rose-800 dark:text-rose-200">{loadError || 'Guides introuvables.'}</p>
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

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#f4f1fa] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Guides &amp; Accueil Parrains</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9d93b8]">
              Personnalisez la page d&apos;accueil affichée aux parrains selon leur spécialité (rôle, rémunération, conditions de suivi, bonnes pratiques, tableaux et photos).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented Editor / Preview switch */}
            <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38]">
              <button
                type="button"
                onClick={() => setMode('edit')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  mode === 'edit'
                    ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa] shadow-xs'
                    : 'text-slate-600 dark:text-[#9d93b8]'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Éditeur</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  mode === 'preview'
                    ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa] shadow-xs'
                    : 'text-slate-600 dark:text-[#9d93b8]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Aperçu Parrain</span>
              </button>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isOverSizeLimit}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{isSaving ? 'Enregistrement...' : 'Enregistrer & Publier'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Specialty Tabs + Doc Size */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-[#1e1530]">
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'CHATTEUR' as VAType, label: 'Parcours VA Chatteur' },
                { id: 'INSTAGRAM' as VAType, label: 'Parcours VA Instagram' },
              ]
            ).map(tab => {
              const active = activeVaType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectTrack(tab.id)}
                  className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-slate-50 dark:bg-[#171026] text-slate-700 dark:text-[#d8d0eb] border-slate-200 dark:border-[#241a38] hover:bg-slate-100 dark:hover:bg-[#231839]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-[#9d93b8]">
            {draft.updatedAt && (
              <span>
                Dernière modif : <span className="font-mono">{formatDate(draft.updatedAt)}</span>
              </span>
            )}
            <span
              className={`font-mono tabular-nums px-2 py-0.5 rounded border ${
                isOverSizeLimit
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                  : 'bg-slate-50 dark:bg-[#171026] border-slate-200 dark:border-[#241a38]'
              }`}
            >
              Poids : {sizeKb} / {maxKb} Ko
            </span>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="p-3.5 bg-amber-50 dark:bg-[#1b1410] border border-amber-200 dark:border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            Mode lecture seule : seuls les comptes <strong>Administrateur</strong> peuvent modifier et publier les guides parrains.
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

      {mode === 'preview' ? (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-[#9d93b8]">
            Aperçu tel que vu par un parrain {activeVaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'}
          </div>
          <ParrainGuideRenderer guide={draft} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header & Hero Image Editor */}
          <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-5 space-y-4 text-xs">
            <div className="font-bold text-sm text-slate-900 dark:text-[#f4f1fa]">
              En-tête du guide ({activeVaType === 'CHATTEUR' ? 'VA Chatteur' : 'VA Instagram'})
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Titre principal *
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.title}
                  onChange={e => updateDraft(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full min-h-[38px] px-3 py-2 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Sous-titre / Introduction courte
                </label>
                <textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={draft.subtitle}
                  onChange={e => updateDraft(prev => ({ ...prev, subtitle: e.target.value }))}
                  className="w-full p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                  Image de bannière (Optionnel — URL https:// ou import depuis votre PC)
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.heroImageUrl || ''}
                    onChange={e => updateDraft(prev => ({ ...prev, heroImageUrl: e.target.value }))}
                    placeholder="https://... ou importer une photo"
                    className="flex-1 min-h-[38px] px-3 py-1.5 font-mono border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  />
                  {isAdmin && (
                    <label className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
                      <Upload className="w-3.5 h-3.5 text-violet-500" />
                      <span>{isUploadingHero ? 'Compression...' : 'Importer photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleHeroUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                  {isAdmin && draft.heroImageUrl && (
                    <button
                      type="button"
                      onClick={() => updateDraft(prev => ({ ...prev, heroImageUrl: null }))}
                      className="min-h-[38px] px-3 py-1.5 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 rounded-lg font-semibold cursor-pointer"
                    >
                      Retirer
                    </button>
                  )}
                </div>
                {draft.heroImageUrl && (
                  <img
                    src={draft.heroImageUrl}
                    alt="Aperçu bannière"
                    referrerPolicy="no-referrer"
                    className="mt-2.5 max-h-36 rounded-lg border border-slate-200 dark:border-[#241a38] object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Blocks List */}
          <div className="space-y-3">
            {draft.blocks.map((block, index) => (
              <div
                key={block.id}
                className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-5 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-[#1e1530]">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-[#f4f1fa]">
                    <span className="font-mono text-[11px] text-slate-400 dark:text-[#7c7296]">
                      #{index + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#171026] border border-slate-200 dark:border-[#241a38] text-[10px] uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      {block.type === 'TEXT' && 'Texte'}
                      {block.type === 'CALLOUT' && 'Encadré'}
                      {block.type === 'TABLE' && 'Tableau'}
                      {block.type === 'IMAGE' && 'Photo'}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, -1)}
                        disabled={index === 0}
                        title="Monter"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#171026] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveBlock(index, 1)}
                        disabled={index === draft.blocks.length - 1}
                        title="Descendre"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#171026] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlock(block.id)}
                        title="Supprimer ce bloc"
                        className="p-1.5 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Common Title */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                    Titre du bloc
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={block.title || ''}
                    onChange={e => handleUpdateBlock(block.id, { title: e.target.value })}
                    className="w-full min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] disabled:opacity-70"
                  />
                </div>

                {/* Type-specific Editors */}
                {block.type === 'CALLOUT' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                        Style d&apos;encadré
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
                        <option value="condition">Condition / Règle (Violet)</option>
                        <option value="info">Information (Neutre)</option>
                        <option value="warning">Avertissement (Ambre)</option>
                        <option value="success">Validation / Astuce (Émeraude)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                        Contenu (supporte **gras**, *italique*, et listes commençant par &quot;- &quot;)
                      </label>
                      <textarea
                        rows={4}
                        disabled={!isAdmin}
                        value={block.body || ''}
                        onChange={e => handleUpdateBlock(block.id, { body: e.target.value })}
                        className="w-full p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {block.type === 'TEXT' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                      Texte (supporte **gras**, *italique*, et listes commençant par &quot;- &quot;)
                    </label>
                    <textarea
                      rows={5}
                      disabled={!isAdmin}
                      value={block.body || ''}
                      onChange={e => handleUpdateBlock(block.id, { body: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa] leading-relaxed"
                    />
                  </div>
                )}

                {block.type === 'IMAGE' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                        URL https:// ou Photo importée depuis votre PC
                      </label>
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
                          <label className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
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
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8] mb-1">
                        Légende (Optionnel)
                      </label>
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={block.caption || ''}
                        onChange={e => handleUpdateBlock(block.id, { caption: e.target.value })}
                        placeholder="Ex: Exemple de suivi hebdomadaire dans Discord"
                        className="w-full min-h-[36px] px-3 py-1.5 border border-slate-200 dark:border-[#241a38] rounded-lg bg-slate-50 dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
                      />
                    </div>

                    {block.imageUrl && (
                      <img
                        src={block.imageUrl}
                        alt={block.caption || block.title || 'Aperçu'}
                        referrerPolicy="no-referrer"
                        className="max-h-44 rounded-lg border border-slate-200 dark:border-[#241a38] object-contain bg-slate-50 dark:bg-[#08050f]"
                      />
                    )}
                  </div>
                )}

                {block.type === 'TABLE' && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto border border-slate-200 dark:border-[#241a38] rounded-lg">
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

          {/* Add Block Toolbar */}
          {isAdmin && (
            <div className="bg-white dark:bg-[#100b1a] border border-dashed border-slate-300 dark:border-[#2e224a] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600 dark:text-[#9d93b8]">
                Ajouter un bloc au guide :
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddBlock('TEXT')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <AlignLeft className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Texte</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('CALLOUT')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageSquareWarning className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Encadré Condition / Info</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('TABLE')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <TableIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Tableau</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddBlock('IMAGE')}
                  className="min-h-[36px] px-3 py-1.5 bg-slate-100 dark:bg-[#171026] hover:bg-slate-200 dark:hover:bg-[#231839] border border-slate-200 dark:border-[#241a38] rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                  <span>+ Photo</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
