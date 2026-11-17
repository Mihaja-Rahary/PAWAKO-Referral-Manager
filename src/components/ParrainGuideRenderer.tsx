import React, { useMemo, useState } from 'react';
import { ParrainGuide, ParrainGuideBlock, ParrainGuideCalloutTone } from '../types';
import { formatDate, getVaTypeLabel } from '../utils/statusUtils';
import { estimateReadingMinutes, resolveGuideCoverUrl } from '../utils/blogCovers';
import { getSpecialtyTheme, getTopicColorTheme } from '../utils/categoryTheme';
import {
  Info,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ImageOff,
  Clock,
  BookOpen,
  ListChecks,
} from 'lucide-react';

interface Props {
  guide: ParrainGuide;
  compactHeader?: boolean;
}

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
            className="font-medium text-violet-700 dark:text-violet-300 underline decoration-violet-400/60 underline-offset-4 hover:text-violet-500 transition-colors"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(raw);
      }
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push(
        <strong key={`${match.index}-b`} className="font-semibold text-slate-950 dark:text-white">
          {raw.slice(2, -2)}
        </strong>
      );
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      tokens.push(
        <span key={`${match.index}-u`} className="underline underline-offset-4 decoration-violet-500/70">
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
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#171026] border border-slate-200/70 dark:border-[#2e224a] font-mono text-[12px] text-slate-800 dark:text-[#e9e5f5]"
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

export function RichTextContent({
  text,
  className = '',
  enableDropCap = false,
}: {
  text?: string;
  className?: string;
  enableDropCap?: boolean;
}) {
  if (!text || !text.trim()) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let unorderedBuffer: string[] = [];
  let orderedBuffer: string[] = [];
  let quoteBuffer: string[] = [];
  let hasUsedDropCap = false;

  const flushUnordered = (keyPrefix: string) => {
    if (unorderedBuffer.length === 0) return;
    elements.push(
      <ul key={keyPrefix} className="space-y-2 pl-5 list-disc marker:text-violet-500">
        {unorderedBuffer.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`} className="leading-[1.72] pl-1">
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
      <ol key={keyPrefix} className="space-y-2 pl-6 list-decimal marker:font-mono marker:font-semibold marker:text-violet-500 tabular-nums">
        {orderedBuffer.map((item, idx) => (
          <li key={`${keyPrefix}-${idx}`} className="leading-[1.72] pl-1.5">
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
        className="border-y border-slate-200 dark:border-[#241a38] py-4 my-4 px-4 sm:px-6 text-center font-serif italic text-base sm:text-lg text-slate-700 dark:text-[#d8d0eb] space-y-1.5"
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
        <h5
          key={`h3-${idx}`}
          className="font-serif text-base sm:text-lg font-semibold text-slate-900 dark:text-[#f4f1fa] pt-2 tracking-tight"
        >
          {renderInlineText(trimmed.replace(/^###\s+/, ''))}
        </h5>
      );
    } else if (/^##?\s+/.test(trimmed)) {
      flushAll(`h2-pre-${idx}`);
      elements.push(
        <h4
          key={`h2-${idx}`}
          className="font-serif text-lg sm:text-xl font-bold text-slate-900 dark:text-[#f4f1fa] pt-3 tracking-tight"
        >
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
      const applyDropCap = enableDropCap && !hasUsedDropCap && trimmed.length > 40;
      if (applyDropCap) hasUsedDropCap = true;
      elements.push(
        <p
          key={`p-${idx}`}
          className={`leading-[1.78] ${
            applyDropCap
              ? 'first-letter:font-serif first-letter:text-4xl sm:first-letter:text-[2.75rem] first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:leading-[0.88] first-letter:text-violet-700 dark:first-letter:text-violet-300'
              : ''
          }`}
        >
          {renderInlineText(trimmed)}
        </p>
      );
    }
  });

  flushAll('end');

  return <div className={`space-y-4 text-[15.5px] sm:text-[16.5px] ${className}`}>{elements}</div>;
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
      <div className="w-full py-12 px-4 rounded-2xl border border-dashed border-slate-200 dark:border-[#241a38] bg-slate-50 dark:bg-[#08050f] flex flex-col items-center justify-center gap-2 text-xs text-slate-400 dark:text-[#7c7296]">
        <ImageOff className="w-5 h-5" />
        <span>Illustration indisponible</span>
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
          'bg-violet-50/70 dark:bg-[#160f24] border-violet-200 dark:border-violet-500/30 text-violet-950 dark:text-violet-100',
        icon: ShieldCheck,
        iconColor: 'text-violet-600 dark:text-violet-400',
        kicker: 'Règle & Condition',
      };
    case 'warning':
      return {
        container:
          'bg-amber-50/80 dark:bg-[#1a130e] border-amber-200 dark:border-amber-500/30 text-amber-950 dark:text-amber-100',
        icon: AlertTriangle,
        iconColor: 'text-amber-600 dark:text-amber-400',
        kicker: 'Point de vigilance',
      };
    case 'success':
      return {
        container:
          'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-500/30 text-emerald-950 dark:text-emerald-100',
        icon: CheckCircle2,
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        kicker: 'Bonne pratique',
      };
    case 'info':
    default:
      return {
        container:
          'bg-slate-50 dark:bg-[#140e22] border-slate-200 dark:border-[#2a1f42] text-slate-900 dark:text-[#f4f1fa]',
        icon: Info,
        iconColor: 'text-slate-600 dark:text-violet-300',
        kicker: 'À noter',
      };
  }
}

function renderArticleBlock(block: ParrainGuideBlock, index: number, firstTextBlockId?: string) {
  const sectionDomId = `guide-sec-${block.id}`;

  if (block.type === 'CALLOUT') {
    const styles = getCalloutStyles(block.tone);
    const Icon = styles.icon;
    return (
      <aside
        id={sectionDomId}
        key={block.id}
        className={`rounded-2xl border p-5 sm:p-6 space-y-2.5 transition-colors scroll-mt-6 ${styles.container}`}
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-80">
          <Icon className={`w-4 h-4 shrink-0 ${styles.iconColor}`} />
          <span>{styles.kicker}</span>
        </div>
        {block.title && (
          <h3 className="font-serif text-lg sm:text-xl font-bold leading-snug">{block.title}</h3>
        )}
        <RichTextContent text={block.body} className="opacity-95" />
      </aside>
    );
  }

  if (block.type === 'TABLE') {
    const headers = block.headers || [];
    const rows = block.rows || [];
    return (
      <section
        id={sectionDomId}
        key={block.id}
        className="space-y-3 scroll-mt-6"
      >
        {block.title && (
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
            {block.title}
          </h3>
        )}
        <div className="bg-white dark:bg-[#100b1a] border border-slate-200 dark:border-[#241a38] rounded-2xl overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-[#171026] text-slate-600 dark:text-[#9d93b8] uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-[#241a38]">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="py-3.5 px-4 sm:px-5 font-semibold whitespace-nowrap">
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
                          className={`py-3.5 px-4 sm:px-5 align-top leading-relaxed ${
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
      </section>
    );
  }

  if (block.type === 'IMAGE') {
    return (
      <figure
        id={sectionDomId}
        key={block.id}
        className="space-y-3 py-2 scroll-mt-6"
      >
        {block.title && (
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight">
            {block.title}
          </h3>
        )}
        <div className="rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38]">
          <SafeImage
            src={block.imageUrl || ''}
            alt={block.caption || block.title || 'Illustration PAWAKO'}
            className="w-full max-h-[500px] object-contain mx-auto"
          />
        </div>
        {block.caption && (
          <figcaption className="text-xs font-serif italic text-slate-500 dark:text-[#9d93b8] text-center">
            {block.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  // TEXT — Long-form editorial prose without heavy boxy frames
  const showChapterRule = index > 0 && Boolean(block.title);
  const useDropCap = block.id === firstTextBlockId;

  return (
    <section
      id={sectionDomId}
      key={block.id}
      className={`space-y-4 scroll-mt-6 ${
        showChapterRule ? 'pt-7 border-t border-slate-200/80 dark:border-[#241a38]' : ''
      }`}
    >
      {block.title && (
        <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#f4f1fa] tracking-tight leading-snug [text-wrap:balance]">
          {block.title}
        </h3>
      )}
      <RichTextContent
        text={block.body}
        enableDropCap={useDropCap}
        className="text-slate-700 dark:text-[#d8d0eb]"
      />
    </section>
  );
}

export const ParrainGuideRenderer: React.FC<Props> = ({ guide, compactHeader = false }) => {
  const coverUrl = resolveGuideCoverUrl(guide);
  const readingMinutes = useMemo(() => estimateReadingMinutes(guide), [guide]);

  const tocSections = useMemo(
    () =>
      (guide.blocks || [])
        .filter(b => Boolean(b.title && b.title.trim()))
        .map((b, idx) => ({
          id: b.id,
          domId: `guide-sec-${b.id}`,
          number: String(idx + 1).padStart(2, '0'),
          title: b.title!.trim(),
        })),
    [guide.blocks]
  );

  const firstTextBlockId = useMemo(
    () => (guide.blocks || []).find(b => b.type === 'TEXT' && Boolean(b.body?.trim()))?.id,
    [guide.blocks]
  );

  const hasSidebarToc = tocSections.length >= 2;
  const specialtyTheme = getSpecialtyTheme(guide.vaType);
  const categoryLabel = guide.category?.trim() || '';
  const categoryTheme = getTopicColorTheme(categoryLabel || guide.vaType);

  const scrollToSection = (domId: string) => {
    const el = document.getElementById(domId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <article className="bg-white dark:bg-[#12121a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-xs transition-colors">
      <div className={`h-1 w-full bg-gradient-to-r ${specialtyTheme.gradient}`} />

      {/* Editorial Article Header — Balanced Split Hero */}
      <header
        className={`${
          compactHeader
            ? 'px-6 pt-6 pb-6 sm:px-8 sm:pt-7 sm:pb-7'
            : 'px-6 pt-7 pb-7 sm:px-10 sm:pt-9 sm:pb-8 lg:px-12'
        } border-b border-slate-200/80 dark:border-white/10`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left: Clean Kicker + Headline + Lead */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {/* Single Unboxed Typographic Metadata Line */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {categoryLabel && (
                <>
                  <span className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] ${categoryTheme.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${categoryTheme.dot}`} />
                    <span>{categoryLabel}</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
                </>
              )}
              <span className={`font-semibold ${specialtyTheme.text}`}>
                Parcours {getVaTypeLabel(guide.vaType)}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                {readingMinutes} min de lecture
              </span>
              {guide.updatedAt && (
                <>
                  <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
                  <span className="font-mono tabular-nums">
                    Mis à jour le {formatDate(guide.updatedAt)}
                  </span>
                </>
              )}
            </div>

            {/* Display Headline */}
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-[2.2rem] font-bold text-slate-950 dark:text-white tracking-tight leading-[1.16] [text-wrap:balance]">
              {guide.title}
            </h1>

            {/* Lead Deck / Chapeau */}
            {guide.subtitle && (
              <p className="text-[15.5px] sm:text-[17px] text-slate-600 dark:text-slate-300 leading-[1.6] max-w-2xl">
                {guide.subtitle}
              </p>
            )}
          </div>

          {/* Right: Crisp Framed Cover Image Alongside Hero */}
          <div className="lg:col-span-5">
            <div className="aspect-[16/10] w-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#09090d] border border-slate-200/80 dark:border-white/10 shadow-xs">
              <SafeImage
                src={coverUrl}
                alt={guide.title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Long-Form Editorial Body + Optional Sticky Sommaire */}
      <div className="px-6 py-7 sm:px-10 sm:py-9 lg:px-12 lg:py-10">
        {guide.blocks.length === 0 ? (
          <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Aucun chapitre rédigé dans cet article pour le moment.
          </div>
        ) : hasSidebarToc ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Reading Column (~67%) */}
            <div className="lg:col-span-8 space-y-8 min-w-0">
              {guide.blocks.map((block, index) =>
                renderArticleBlock(block, index, firstTextBlockId)
              )}
            </div>

            {/* Sticky Table of Contents (~33%) */}
            <aside className="hidden lg:block lg:col-span-4 sticky top-20 space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#171722] p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <ListChecks className={`w-4 h-4 ${specialtyTheme.text}`} />
                  <span>Sommaire de l&apos;article</span>
                </div>

                <nav aria-label="Sommaire de l'article" className="space-y-1.5">
                  {tocSections.map(sec => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => scrollToSection(sec.domId)}
                      className="w-full text-left py-1.5 px-2.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-white/5 hover:text-slate-950 dark:hover:text-white transition-colors flex items-baseline gap-2.5 cursor-pointer"
                    >
                      <span className={`font-mono tabular-nums text-[11px] font-bold shrink-0 ${specialtyTheme.text}`}>
                        {sec.number}
                      </span>
                      <span className="leading-snug font-medium line-clamp-2">{sec.title}</span>
                    </button>
                  ))}
                </nav>

                <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <BookOpen className={`w-3.5 h-3.5 ${specialtyTheme.text}`} />
                    <span>PAWAKO Éditorial</span>
                  </span>
                  <span className="font-mono tabular-nums">{readingMinutes} min</span>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="max-w-[840px] space-y-8">
            {guide.blocks.map((block, index) =>
              renderArticleBlock(block, index, firstTextBlockId)
            )}
          </div>
        )}

        {/* Quiet Editorial Footer Tags */}
        {Array.isArray(guide.tags) && guide.tags.length > 0 && (
          <footer className="mt-10 pt-5 border-t border-slate-100 dark:border-white/10 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Thèmes :
            </span>
            {guide.tags.map(tag => {
              const tagTheme = getTopicColorTheme(tag);
              return (
                <span key={tag} className={`font-semibold ${tagTheme.text}`}>
                  #{tag}
                </span>
              );
            })}
          </footer>
        )}
      </div>
    </article>
  );
};
