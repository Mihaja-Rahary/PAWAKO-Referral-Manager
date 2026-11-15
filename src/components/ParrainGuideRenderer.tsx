import React, { useState } from 'react';
import { ParrainGuide, ParrainGuideBlock, ParrainGuideCalloutTone } from '../types';
import { formatDate, getVaTypeLabel } from '../utils/statusUtils';
import {
  Info,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ImageOff,
  BookOpen,
} from 'lucide-react';

interface Props {
  guide: ParrainGuide;
  compactHeader?: boolean;
}

/**
 * Formateur sûr en React pur (aucun HTML injecté / aucun dangerouslySetInnerHTML) :
 * - Titres ## et sous-titres ###
 * - Paragraphes séparés par des sauts de ligne
 * - Listes à puces ("• ", "- ", "* ") et listes numérotées ("1. ")
 * - Citations ("> ")
 * - Gras (**texte**), italique (*texte*), souligné (__texte__), code (`texte`), liens [label](https://...)
 */
function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"']+$/i.test(url.trim());
}

function renderInlineText(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const raw = match[0];
    if (raw.startsWith('[')) {
      const linkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        tokens.push(
          <a
            key={`${match.index}-a`}
            href={linkMatch[2].trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-500"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(raw);
      }
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={`${match.index}-b`} className="font-semibold text-slate-900 dark:text-[#f4f1fa]">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      tokens.push(
        <span key={`${match.index}-u`} className="underline underline-offset-2 decoration-violet-500/70">
          {raw.slice(2, -2)}
        </span>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push(
        <em key={`${match.index}-i`} className="italic">
          {raw.slice(1, -1)}
        </em>
      );
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push(
        <code
          key={`${match.index}-c`}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#171026] border border-slate-200/70 dark:border-[#2e224a] font-mono text-[11px] text-slate-800 dark:text-[#e9e5f5]"
        >
          {raw.slice(1, -1)}
        </code>
      );
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

export function RichTextContent({ text, className = '' }: { text?: string; className?: string }) {
  if (!text || !text.trim()) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let unorderedBuffer: string[] = [];
  let orderedBuffer: string[] = [];
  let quoteBuffer: string[] = [];

  const flushUnordered = (keyPrefix: string) => {
    if (unorderedBuffer.length === 0) return;
    elements.push(
      <ul key={keyPrefix} className="space-y-1.5 pl-4 list-disc marker:text-violet-500">
        {unorderedBuffer.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`} className="leading-relaxed">
            {renderInlineText(item)}
          </li>
        ))}
      </ul>
    );
    unorderedBuffer = [];
  };

  const flushOrdered = (keyPrefix: string) => {
    if (orderedBuffer.length === 0) return;
    elements.push(
      <ol key={keyPrefix} className="space-y-1.5 pl-5 list-decimal marker:font-mono marker:text-violet-500 tabular-nums">
        {orderedBuffer.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`} className="leading-relaxed pl-1">
            {renderInlineText(item)}
          </li>
        ))}
      </ol>
    );
    orderedBuffer = [];
  };

  const flushQuote = (keyPrefix: string) => {
    if (quoteBuffer.length === 0) return;
    elements.push(
      <blockquote
        key={keyPrefix}
        className="border-l-2 border-violet-300 dark:border-violet-500/50 pl-3 py-0.5 text-slate-600 dark:text-[#b7aed0] italic space-y-1"
      >
        {quoteBuffer.map((qLine, idx) => (
          <p key={`${keyPrefix}-${idx}`} className="leading-relaxed">
            {renderInlineText(qLine)}
          </p>
        ))}
      </blockquote>
    );
    quoteBuffer = [];
  };

  const flushAll = (keyPrefix: string) => {
    flushUnordered(`${keyPrefix}-ul`);
    flushOrdered(`${keyPrefix}-ol`);
    flushQuote(`${keyPrefix}-q`);
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushAll(`empty-${idx}`);
      return;
    }

    if (/^###\s+/.test(trimmed)) {
      flushAll(`h3-pre-${idx}`);
      elements.push(
        <h5 key={`h3-${idx}`} className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-[#f4f1fa] pt-1">
          {renderInlineText(trimmed.replace(/^###\s+/, ''))}
        </h5>
      );
    } else if (/^##?\s+/.test(trimmed)) {
      flushAll(`h2-pre-${idx}`);
      elements.push(
        <h4 key={`h2-${idx}`} className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-[#f4f1fa] pt-1.5 tracking-tight">
          {renderInlineText(trimmed.replace(/^##?\s+/, ''))}
        </h4>
      );
    } else if (/^>\s?/.test(trimmed)) {
      flushUnordered(`q-pre-ul-${idx}`);
      flushOrdered(`q-pre-ol-${idx}`);
      quoteBuffer.push(trimmed.replace(/^>\s?/, ''));
    } else if (/^(?:•|-|\*)\s+/.test(trimmed)) {
      flushOrdered(`ul-pre-ol-${idx}`);
      flushQuote(`ul-pre-q-${idx}`);
      unorderedBuffer.push(trimmed.replace(/^(?:•|-|\*)\s+/, ''));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      flushUnordered(`ol-pre-ul-${idx}`);
      flushQuote(`ol-pre-q-${idx}`);
      orderedBuffer.push(trimmed.replace(/^\d+\.\s+/, ''));
    } else {
      flushAll(`p-pre-${idx}`);
      elements.push(
        <p key={`p-${idx}`} className="leading-relaxed">
          {renderInlineText(trimmed)}
        </p>
      );
    }
  });

  flushAll('end');

  return <div className={`space-y-2.5 text-xs sm:text-sm ${className}`}>{elements}</div>;
}

function SafeImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="w-full py-10 px-4 rounded-xl border border-dashed border-slate-200 dark:border-[#241a38] bg-slate-50 dark:bg-[#08050f] flex flex-col items-center justify-center gap-2 text-xs text-slate-400 dark:text-[#7c7296]">
        <ImageOff className="w-5 h-5" />
        <span>Image indisponible ou lien inaccessible</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}

function getCalloutStyles(tone: ParrainGuideCalloutTone = 'info') {
  switch (tone) {
    case 'condition':
      return {
        container:
          'bg-violet-50/70 dark:bg-[#171026] border-violet-200 dark:border-violet-500/35 text-violet-950 dark:text-violet-100',
        icon: ShieldCheck,
        iconColor: 'text-violet-600 dark:text-violet-400',
      };
    case 'warning':
      return {
        container:
          'bg-amber-50/80 dark:bg-[#1b1410] border-amber-200 dark:border-amber-500/35 text-amber-950 dark:text-amber-100',
        icon: AlertTriangle,
        iconColor: 'text-amber-600 dark:text-amber-400',
      };
    case 'success':
      return {
        container:
          'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/35 text-emerald-950 dark:text-emerald-100',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
      };
    case 'info':
    default:
      return {
        container:
          'bg-slate-50 dark:bg-[#171026] border-slate-200 dark:border-[#2e224a] text-slate-900 dark:text-[#f4f1fa]',
        icon: Info,
        iconColor: 'text-slate-600 dark:text-violet-300',
      };
  }
}

function renderBlock(block: ParrainGuideBlock) {
  if (block.type === 'CALLOUT') {
    const styles = getCalloutStyles(block.tone);
    const Icon = styles.icon;
    return (
      <div
        key={block.id}
        className={`rounded-xl border p-4 sm:p-5 space-y-2 transition-colors ${styles.container}`}
      >
        <div className="flex items-start gap-2.5">
          <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${styles.iconColor}`} />
          <div className="space-y-1.5 min-w-0 flex-1">
            {block.title && <h3 className="text-sm font-bold leading-snug">{block.title}</h3>}
            <RichTextContent text={block.body} className="opacity-95" />
          </div>
        </div>
      </div>
    );
  }

  if (block.type === 'TABLE') {
    const headers = block.headers || [];
    const rows = block.rows || [];
    return (
      <div
        key={block.id}
        className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden transition-colors"
      >
        {block.title && (
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-[#241a38]">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa]">{block.title}</h3>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#171026] text-slate-600 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="py-3 px-4 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1e1530] text-slate-700 dark:text-[#d8d0eb] tabular-nums">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} className="py-6 px-4 text-center text-slate-400">
                    Aucune ligne dans ce tableau.
                  </td>
                </tr>
              ) : (
                rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/60 dark:hover:bg-[#171026]/70 transition-colors">
                    {headers.map((_, cIdx) => (
                      <td
                        key={cIdx}
                        className={`py-3 px-4 align-top leading-relaxed ${
                          cIdx === 0 ? 'font-semibold text-slate-900 dark:text-[#f4f1fa]' : ''
                        }`}
                      >
                        {row[cIdx] || '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (block.type === 'IMAGE') {
    return (
      <figure
        key={block.id}
        className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden p-4 sm:p-5 space-y-3 transition-colors"
      >
        {block.title && (
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#f4f1fa]">{block.title}</h3>
        )}
        <div className="rounded-lg overflow-hidden bg-slate-50 dark:bg-[#08050f] border border-slate-100 dark:border-[#241a38]">
          <SafeImage
            src={block.imageUrl || ''}
            alt={block.caption || block.title || 'Illustration PAWAKO'}
            className="w-full max-h-[460px] object-contain mx-auto"
          />
        </div>
        {block.caption && (
          <figcaption className="text-[11px] text-slate-500 dark:text-[#9d93b8] text-center">
            {block.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  // TEXT
  return (
    <section
      key={block.id}
      className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl p-4 sm:p-6 space-y-2.5 transition-colors"
    >
      {block.title && (
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
          {block.title}
        </h3>
      )}
      <RichTextContent
        text={block.body}
        className="text-slate-600 dark:text-[#d8d0eb]"
      />
    </section>
  );
}

export const ParrainGuideRenderer: React.FC<Props> = ({ guide, compactHeader = false }) => {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Guide Intro Card */}
      <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden transition-colors">
        {guide.heroImageUrl && (
          <div className="w-full max-h-60 overflow-hidden bg-slate-50 dark:bg-[#08050f] border-b border-slate-200 dark:border-[#241a38]">
            <SafeImage
              src={guide.heroImageUrl}
              alt={guide.title}
              className="w-full h-48 sm:h-60 object-cover"
            />
          </div>
        )}
        <div className={compactHeader ? 'p-4 sm:p-5 space-y-2' : 'p-5 sm:p-6 space-y-2.5'}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-[#9d93b8]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-violet-700 dark:text-violet-300">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Parcours {getVaTypeLabel(guide.vaType)}</span>
              {guide.category && (
                <span className="text-slate-400 dark:text-[#7c7296] font-normal">
                  · {guide.category}
                </span>
              )}
            </span>
            {guide.updatedAt && (
              <span className="font-mono tabular-nums">
                Mis à jour : {formatDate(guide.updatedAt)}
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-[#f4f1fa] tracking-tight leading-snug">
            {guide.title}
          </h2>
          {guide.subtitle && (
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#b7aed0] leading-relaxed">
              {guide.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Content Blocks */}
      {guide.blocks.length === 0 ? (
        <div className="bg-white dark:bg-[#100b1a] border border-dashed border-slate-200 dark:border-[#241a38] rounded-xl p-8 text-center text-xs text-slate-500 dark:text-[#9d93b8]">
          Aucun bloc de contenu renseigné pour ce parcours pour le moment.
        </div>
      ) : (
        <div className="space-y-4">{guide.blocks.map(block => renderBlock(block))}</div>
      )}
    </div>
  );
};
