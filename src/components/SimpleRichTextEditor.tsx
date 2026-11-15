import React, { useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  Eye,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { RichTextContent } from './ParrainGuideRenderer';

interface SimpleRichTextEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  label?: string;
}

export const SimpleRichTextEditor: React.FC<SimpleRichTextEditorProps> = ({
  value,
  onChange,
  disabled = false,
  rows = 5,
  placeholder = 'Rédigez votre contenu ici...',
  label,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  const applySelectionTransform = (
    transform: (
      selected: string,
      fullValue: string,
      start: number,
      end: number
    ) => { nextValue: string; nextStart: number; nextEnd: number }
  ) => {
    if (disabled) return;
    if (tab !== 'edit') setTab('edit');

    const el = textareaRef.current;
    const start = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const selected = value.slice(start, end);

    const { nextValue, nextStart, nextEnd } = transform(selected, value, start, end);
    onChange(nextValue);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextStart, nextEnd);
      }
    });
  };

  const wrapInline = (prefix: string, suffix: string, fallbackPlaceholder: string) => {
    applySelectionTransform((selected, full, start, end) => {
      const inner = selected || fallbackPlaceholder;
      // Toggle off if already wrapped identically
      if (
        selected.startsWith(prefix) &&
        selected.endsWith(suffix) &&
        selected.length >= prefix.length + suffix.length
      ) {
        const unwrapped = selected.slice(prefix.length, selected.length - suffix.length);
        const nextValue = full.slice(0, start) + unwrapped + full.slice(end);
        return { nextValue, nextStart: start, nextEnd: start + unwrapped.length };
      }

      const wrapped = `${prefix}${inner}${suffix}`;
      const nextValue = full.slice(0, start) + wrapped + full.slice(end);
      return {
        nextValue,
        nextStart: start + prefix.length,
        nextEnd: start + prefix.length + inner.length,
      };
    });
  };

  const toggleLinePrefix = (mode: 'heading' | 'bullet' | 'ordered' | 'quote') => {
    applySelectionTransform((_selected, full, start, end) => {
      const lineStart = full.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const lineEndRaw = full.indexOf('\n', end);
      const lineEnd = lineEndRaw === -1 ? full.length : lineEndRaw;
      const block = full.slice(lineStart, lineEnd);
      const lines = block.split('\n');

      let transformedLines: string[];

      if (mode === 'heading') {
        const allHaveHeading = lines.every(l => /^##\s+/.test(l.trimStart()));
        transformedLines = lines.map(l =>
          allHaveHeading
            ? l.replace(/^(\s*)##\s+/, '$1')
            : l.trim()
              ? `## ${l.replace(/^#{1,3}\s+/, '')}`
              : '## Titre de section'
        );
      } else if (mode === 'bullet') {
        const allBullets = lines.every(l => /^(?:-|•|\*)\s+/.test(l.trimStart()));
        transformedLines = lines.map(l =>
          allBullets
            ? l.replace(/^(\s*)(?:-|•|\*)\s+/, '$1')
            : l.trim()
              ? `- ${l.replace(/^(?:\d+\.\s+|(?:-|•|\*)\s+|>\s?)/, '')}`
              : '- Élément'
        );
      } else if (mode === 'ordered') {
        const allOrdered = lines.every(l => /^\d+\.\s+/.test(l.trimStart()));
        transformedLines = lines.map((l, idx) =>
          allOrdered
            ? l.replace(/^(\s*)\d+\.\s+/, '$1')
            : l.trim()
              ? `${idx + 1}. ${l.replace(/^(?:\d+\.\s+|(?:-|•|\*)\s+|>\s?)/, '')}`
              : `${idx + 1}. Étape`
        );
      } else {
        const allQuote = lines.every(l => /^>\s?/.test(l.trimStart()));
        transformedLines = lines.map(l =>
          allQuote
            ? l.replace(/^(\s*)>\s?/, '$1')
            : l.trim()
              ? `> ${l.replace(/^>\s?/, '')}`
              : '> Citation ou remarque'
        );
      }

      const nextBlock = transformedLines.join('\n');
      const nextValue = full.slice(0, lineStart) + nextBlock + full.slice(lineEnd);
      return {
        nextValue,
        nextStart: lineStart,
        nextEnd: lineStart + nextBlock.length,
      };
    });
  };

  const handleOpenLinkBar = () => {
    if (disabled) return;
    const el = textareaRef.current;
    const selected = el ? value.slice(el.selectionStart, el.selectionEnd).trim() : '';
    setLinkLabel(selected || '');
    setLinkUrl('https://');
    setLinkError(null);
    setShowLinkInput(prev => !prev);
  };

  const handleInsertLink = () => {
    const cleanUrl = linkUrl.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(cleanUrl)) {
      setLinkError('Entrez une URL valide commençant par https:// ou http://');
      return;
    }
    const cleanLabel = linkLabel.trim() || cleanUrl;
    const markdownLink = `[${cleanLabel}](${cleanUrl})`;

    applySelectionTransform((_selected, full, start, end) => {
      const nextValue = full.slice(0, start) + markdownLink + full.slice(end);
      return {
        nextValue,
        nextStart: start,
        nextEnd: start + markdownLink.length,
      };
    });

    setShowLinkInput(false);
    setLinkLabel('');
    setLinkUrl('');
    setLinkError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        wrapInline('**', '**', 'texte en gras');
      } else if (key === 'i') {
        e.preventDefault();
        wrapInline('*', '*', 'texte en italique');
      } else if (key === 'u') {
        e.preventDefault();
        wrapInline('__', '__', 'texte souligné');
      }
    }
  };

  const toolbarButtons = [
    {
      label: 'Gras (Ctrl+B)',
      icon: Bold,
      onClick: () => wrapInline('**', '**', 'texte en gras'),
    },
    {
      label: 'Italique (Ctrl+I)',
      icon: Italic,
      onClick: () => wrapInline('*', '*', 'texte en italique'),
    },
    {
      label: 'Souligné (Ctrl+U)',
      icon: Underline,
      onClick: () => wrapInline('__', '__', 'texte souligné'),
    },
    {
      label: 'Titre de section',
      icon: Heading2,
      onClick: () => toggleLinePrefix('heading'),
    },
    {
      label: 'Liste à puces',
      icon: List,
      onClick: () => toggleLinePrefix('bullet'),
    },
    {
      label: 'Liste numérotée',
      icon: ListOrdered,
      onClick: () => toggleLinePrefix('ordered'),
    },
    {
      label: 'Citation / Note',
      icon: Quote,
      onClick: () => toggleLinePrefix('quote'),
    },
    {
      label: 'Insérer un lien https://',
      icon: Link2,
      onClick: handleOpenLinkBar,
      active: showLinkInput,
    },
  ];

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8]">
          {label}
        </label>
      )}

      <div className="border border-slate-200 dark:border-[#241a38] rounded-lg overflow-hidden bg-slate-50 dark:bg-[#08050f] transition-colors">
        {/* Formatting Toolbar */}
        <div className="px-2 py-1.5 bg-white dark:bg-[#140e22] border-b border-slate-200 dark:border-[#241a38] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {toolbarButtons.map(btn => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.label}
                  type="button"
                  disabled={disabled}
                  onClick={btn.onClick}
                  title={btn.label}
                  aria-label={btn.label}
                  className={`min-h-[30px] min-w-[30px] px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    btn.active
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600 dark:text-[#c4badb] hover:bg-slate-100 dark:hover:bg-[#231839] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          <div className="inline-flex p-0.5 rounded-md bg-slate-100 dark:bg-[#0b0714] border border-slate-200 dark:border-[#241a38]">
            <button
              type="button"
              onClick={() => setTab('edit')}
              className={`px-2 py-1 text-[11px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors ${
                tab === 'edit'
                  ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa]'
                  : 'text-slate-500 dark:text-[#9d93b8]'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Écrire</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={`px-2 py-1 text-[11px] font-semibold rounded flex items-center gap-1 cursor-pointer transition-colors ${
                tab === 'preview'
                  ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa]'
                  : 'text-slate-500 dark:text-[#9d93b8]'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Aperçu</span>
            </button>
          </div>
        </div>

        {/* Inline Link Insertion Bar (No window.prompt) */}
        {showLinkInput && !disabled && (
          <div className="p-2.5 bg-violet-50/60 dark:bg-[#171026] border-b border-slate-200 dark:border-[#241a38] space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                placeholder="Texte du lien (ex: Charte PAWAKO)"
                className="flex-1 min-h-[34px] px-2.5 py-1 border border-slate-200 dark:border-[#2e224a] rounded-md bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
              />
              <input
                type="url"
                value={linkUrl}
                onChange={e => {
                  setLinkUrl(e.target.value);
                  setLinkError(null);
                }}
                placeholder="https://..."
                className="flex-1 min-h-[34px] px-2.5 py-1 font-mono border border-slate-200 dark:border-[#2e224a] rounded-md bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleInsertLink}
                  className="min-h-[34px] px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-md flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Insérer</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkInput(false);
                    setLinkError(null);
                  }}
                  aria-label="Annuler l'insertion du lien"
                  className="min-h-[34px] px-2 py-1 bg-white dark:bg-[#231839] border border-slate-200 dark:border-[#2e224a] text-slate-600 dark:text-[#d8d0eb] rounded-md cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {linkError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{linkError}</p>}
          </div>
        )}

        {/* Editor or Rendered Rich Preview */}
        {tab === 'edit' ? (
          <textarea
            ref={textareaRef}
            rows={rows}
            disabled={disabled}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full p-3 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-[#f4f1fa] leading-relaxed focus:outline-none disabled:opacity-70 resize-y"
          />
        ) : (
          <div className="p-3.5 min-h-[116px] bg-white dark:bg-[#0c0816]">
            {value.trim() ? (
              <RichTextContent text={value} className="text-slate-700 dark:text-[#d8d0eb]" />
            ) : (
              <p className="text-xs text-slate-400 dark:text-[#7c7296] italic">
                Aucun contenu à prévisualiser pour le moment.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
