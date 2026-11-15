import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  Eye,
  Edit3,
  Code2,
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

type EditorTab = 'visual' | 'preview' | 'source';

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\/[^\s<>"']+$/i.test(url.trim());
}

/**
 * Construit un arbre DOM sûr (sans jamais utiliser innerHTML) à partir du texte structuré.
 */
function appendInlineNodes(parent: HTMLElement, text: string) {
  const regex = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    if (raw.startsWith('[')) {
      const linkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        const a = document.createElement('a');
        a.href = linkMatch[2].trim();
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkMatch[1];
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(raw));
      }
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = raw.slice(2, -2);
      parent.appendChild(strong);
    } else if (raw.startsWith('__') && raw.endsWith('__')) {
      const u = document.createElement('u');
      u.textContent = raw.slice(2, -2);
      parent.appendChild(u);
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      const em = document.createElement('em');
      em.textContent = raw.slice(1, -1);
      parent.appendChild(em);
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      const code = document.createElement('code');
      code.textContent = raw.slice(1, -1);
      parent.appendChild(code);
    }
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function populateEditorDom(container: HTMLElement, structuredText: string) {
  container.replaceChildren();
  const lines = (structuredText || '').split('\n');

  let currentUl: HTMLUListElement | null = null;
  let currentOl: HTMLOListElement | null = null;
  let currentQuote: HTMLQuoteElement | null = null;

  const flushContainers = () => {
    currentUl = null;
    currentOl = null;
    currentQuote = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushContainers();
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      flushContainers();
      const h3 = document.createElement('h3');
      appendInlineNodes(h3, trimmed.replace(/^###\s+/, ''));
      container.appendChild(h3);
    } else if (/^##?\s+/.test(trimmed)) {
      flushContainers();
      const h2 = document.createElement('h2');
      appendInlineNodes(h2, trimmed.replace(/^##?\s+/, ''));
      container.appendChild(h2);
    } else if (/^>\s?/.test(trimmed)) {
      currentUl = null;
      currentOl = null;
      if (!currentQuote) {
        currentQuote = document.createElement('blockquote');
        container.appendChild(currentQuote);
      }
      const p = document.createElement('p');
      appendInlineNodes(p, trimmed.replace(/^>\s?/, ''));
      currentQuote.appendChild(p);
    } else if (/^(?:•|-|\*)\s+/.test(trimmed)) {
      currentOl = null;
      currentQuote = null;
      if (!currentUl) {
        currentUl = document.createElement('ul');
        container.appendChild(currentUl);
      }
      const li = document.createElement('li');
      appendInlineNodes(li, trimmed.replace(/^(?:•|-|\*)\s+/, ''));
      currentUl.appendChild(li);
    } else if (/^\d+\.\s+/.test(trimmed)) {
      currentUl = null;
      currentQuote = null;
      if (!currentOl) {
        currentOl = document.createElement('ol');
        container.appendChild(currentOl);
      }
      const li = document.createElement('li');
      appendInlineNodes(li, trimmed.replace(/^\d+\.\s+/, ''));
      currentOl.appendChild(li);
    } else {
      flushContainers();
      const p = document.createElement('p');
      appendInlineNodes(p, trimmed);
      container.appendChild(p);
    }
  }

  if (container.childNodes.length === 0) {
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    container.appendChild(p);
  }
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').replace(/\u00a0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  let inner = '';
  el.childNodes.forEach(child => {
    inner += serializeInlineNode(child);
  });

  if (tag === 'strong' || tag === 'b') {
    const clean = inner.trim();
    if (!clean) return inner;
    return `**${clean}**`;
  }
  if (tag === 'em' || tag === 'i') {
    const clean = inner.trim();
    if (!clean) return inner;
    return `*${clean}*`;
  }
  if (tag === 'u') {
    const clean = inner.trim();
    if (!clean) return inner;
    return `__${clean}__`;
  }
  if (tag === 'code') {
    const clean = inner.trim();
    if (!clean) return inner;
    return `\`${clean}\``;
  }
  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    const clean = inner.trim() || href;
    if (isSafeHttpUrl(href)) {
      return `[${clean}](${href.trim()})`;
    }
    return clean;
  }

  // Handle styled spans produced by some browsers during execCommand
  if (tag === 'span') {
    const fontWeight = el.style?.fontWeight;
    const fontStyle = el.style?.fontStyle;
    const textDeco = el.style?.textDecoration || el.style?.textDecorationLine;
    let wrapped = inner;
    if (fontWeight === 'bold' || Number(fontWeight) >= 600) {
      wrapped = wrapped.trim() ? `**${wrapped.trim()}**` : wrapped;
    }
    if (fontStyle === 'italic') {
      wrapped = wrapped.trim() ? `*${wrapped.trim()}*` : wrapped;
    }
    if (textDeco && textDeco.includes('underline')) {
      wrapped = wrapped.trim() ? `__${wrapped.trim()}__` : wrapped;
    }
    return wrapped;
  }

  return inner;
}

function serializeDomToStructuredText(container: HTMLElement): string {
  const blocks: string[] = [];

  const processBlockNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt) blocks.push(txt);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2') {
      const text = Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
      if (text) blocks.push(`## ${text}`);
      return;
    }

    if (tag === 'h3' || tag === 'h4') {
      const text = Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
      if (text) blocks.push(`### ${text}`);
      return;
    }

    if (tag === 'ul') {
      const items: string[] = [];
      el.querySelectorAll(':scope > li').forEach(li => {
        const txt = Array.from(li.childNodes).map(serializeInlineNode).join('').trim();
        if (txt) items.push(`- ${txt}`);
      });
      if (items.length > 0) blocks.push(items.join('\n'));
      return;
    }

    if (tag === 'ol') {
      const items: string[] = [];
      el.querySelectorAll(':scope > li').forEach((li, idx) => {
        const txt = Array.from(li.childNodes).map(serializeInlineNode).join('').trim();
        if (txt) items.push(`${idx + 1}. ${txt}`);
      });
      if (items.length > 0) blocks.push(items.join('\n'));
      return;
    }

    if (tag === 'blockquote') {
      const quoteLines: string[] = [];
      const childEls = Array.from(el.childNodes);
      const hasParagraphChildren = childEls.some(
        c => c.nodeType === Node.ELEMENT_NODE && ['p', 'div'].includes((c as HTMLElement).tagName.toLowerCase())
      );

      if (hasParagraphChildren) {
        childEls.forEach(child => {
          const line = Array.from(child.childNodes).map(serializeInlineNode).join('').trim();
          if (line) {
            line.split('\n').forEach(sub => {
              if (sub.trim()) quoteLines.push(`> ${sub.trim()}`);
            });
          }
        });
      } else {
        const raw = childEls.map(serializeInlineNode).join('').trim();
        raw.split('\n').forEach(sub => {
          if (sub.trim()) quoteLines.push(`> ${sub.trim()}`);
        });
      }

      if (quoteLines.length > 0) blocks.push(quoteLines.join('\n'));
      return;
    }

    if (tag === 'p' || tag === 'div') {
      // Check if div wraps nested block elements
      const hasBlockChild = Array.from(el.children).some(child =>
        ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote'].includes(child.tagName.toLowerCase())
      );
      if (hasBlockChild) {
        el.childNodes.forEach(processBlockNode);
        return;
      }

      const raw = Array.from(el.childNodes).map(serializeInlineNode).join('').trim();
      if (raw) {
        blocks.push(raw);
      }
      return;
    }

    const fallback = serializeInlineNode(el).trim();
    if (fallback) blocks.push(fallback);
  };

  container.childNodes.forEach(processBlockNode);
  return blocks.join('\n\n');
}

function findClosestBlockTag(node: Node | null, root: HTMLElement): string | null {
  let curr: Node | null = node;
  while (curr && curr !== root) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const tag = (curr as HTMLElement).tagName.toLowerCase();
      if (['h1', 'h2', 'h3', 'h4', 'blockquote', 'p', 'div', 'li'].includes(tag)) {
        return tag;
      }
    }
    curr = curr.parentNode;
  }
  return null;
}

export const SimpleRichTextEditor: React.FC<SimpleRichTextEditorProps> = ({
  value,
  onChange,
  disabled = false,
  rows = 6,
  placeholder = 'Rédigez votre article ici...',
  label,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastEmittedRef = useRef<string | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [tab, setTab] = useState<EditorTab>('visual');
  const [isEmptyVisual, setIsEmptyVisual] = useState(() => !value.trim());
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Sync external value into contentEditable only when tab is visual and value differs from last DOM emit
  useEffect(() => {
    setIsEmptyVisual(!value.trim());
    if (tab !== 'visual' || !editorRef.current) return;
    if (lastEmittedRef.current === value) return;

    populateEditorDom(editorRef.current, value);
    lastEmittedRef.current = value;
  }, [value, tab]);

  const emitChangeFromDom = () => {
    if (!editorRef.current) return;
    const serialized = serializeDomToStructuredText(editorRef.current);
    lastEmittedRef.current = serialized;
    setIsEmptyVisual(!serialized.trim());
    onChange(serialized);
  };

  const applySourceTransform = (
    transform: (
      selected: string,
      fullValue: string,
      start: number,
      end: number
    ) => { nextValue: string; nextStart: number; nextEnd: number }
  ) => {
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

  const handleExecVisual = (command: string, commandVal?: string) => {
    if (disabled) return;
    if (tab !== 'visual') {
      setTab('visual');
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    if (command === 'toggleH2' || command === 'toggleH3' || command === 'toggleQuote') {
      const sel = window.getSelection();
      const currentBlock = sel ? findClosestBlockTag(sel.anchorNode, editor) : null;
      const targetTag = command === 'toggleH2' ? 'h2' : command === 'toggleH3' ? 'h3' : 'blockquote';
      const nextBlock = currentBlock === targetTag ? 'p' : targetTag;
      document.execCommand('formatBlock', false, `<${nextBlock}>`);
    } else {
      document.execCommand(command, false, commandVal);
    }

    emitChangeFromDom();
  };

  const handleToolbarAction = (action: 'bold' | 'italic' | 'underline' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote') => {
    if (disabled) return;

    if (tab === 'source') {
      if (action === 'bold') {
        applySourceTransform((sel, full, s, e) => {
          const inner = sel || 'texte en gras';
          return {
            nextValue: full.slice(0, s) + `**${inner}**` + full.slice(e),
            nextStart: s + 2,
            nextEnd: s + 2 + inner.length,
          };
        });
      } else if (action === 'italic') {
        applySourceTransform((sel, full, s, e) => {
          const inner = sel || 'texte en italique';
          return {
            nextValue: full.slice(0, s) + `*${inner}*` + full.slice(e),
            nextStart: s + 1,
            nextEnd: s + 1 + inner.length,
          };
        });
      } else if (action === 'underline') {
        applySourceTransform((sel, full, s, e) => {
          const inner = sel || 'texte souligné';
          return {
            nextValue: full.slice(0, s) + `__${inner}__` + full.slice(e),
            nextStart: s + 2,
            nextEnd: s + 2 + inner.length,
          };
        });
      } else {
        const prefixMap = { h2: '## ', h3: '### ', ul: '- ', ol: '1. ', quote: '> ' };
        const prefix = prefixMap[action];
        applySourceTransform((_sel, full, s) => {
          const lineStart = full.lastIndexOf('\n', Math.max(0, s - 1)) + 1;
          const nextValue = full.slice(0, lineStart) + prefix + full.slice(lineStart);
          return { nextValue, nextStart: lineStart + prefix.length, nextEnd: lineStart + prefix.length };
        });
      }
      return;
    }

    if (tab === 'preview') setTab('visual');

    switch (action) {
      case 'bold':
        handleExecVisual('bold');
        break;
      case 'italic':
        handleExecVisual('italic');
        break;
      case 'underline':
        handleExecVisual('underline');
        break;
      case 'h2':
        handleExecVisual('toggleH2');
        break;
      case 'h3':
        handleExecVisual('toggleH3');
        break;
      case 'ul':
        handleExecVisual('insertUnorderedList');
        break;
      case 'ol':
        handleExecVisual('insertOrderedList');
        break;
      case 'quote':
        handleExecVisual('toggleQuote');
        break;
    }
  };

  const handleOpenLinkBar = () => {
    if (disabled) return;
    if (tab === 'visual') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        setLinkLabel(sel.toString().trim());
      } else {
        savedRangeRef.current = null;
        setLinkLabel('');
      }
    } else if (tab === 'source' && textareaRef.current) {
      const el = textareaRef.current;
      setLinkLabel(value.slice(el.selectionStart, el.selectionEnd).trim());
    }
    setLinkUrl('https://');
    setLinkError(null);
    setShowLinkInput(prev => !prev);
  };

  const handleInsertLink = () => {
    const cleanUrl = linkUrl.trim();
    if (!isSafeHttpUrl(cleanUrl)) {
      setLinkError('Entrez une URL valide commençant par https:// ou http://');
      return;
    }
    const cleanLabel = linkLabel.trim() || cleanUrl;

    if (tab === 'source') {
      const mdLink = `[${cleanLabel}](${cleanUrl})`;
      applySourceTransform((_sel, full, s, e) => ({
        nextValue: full.slice(0, s) + mdLink + full.slice(e),
        nextStart: s,
        nextEnd: s + mdLink.length,
      }));
    } else {
      const editor = editorRef.current;
      if (editor) {
        editor.focus();
        const sel = window.getSelection();
        if (savedRangeRef.current && sel) {
          sel.removeAllRanges();
          sel.addRange(savedRangeRef.current);
        }
        const a = document.createElement('a');
        a.href = cleanUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = cleanLabel;

        if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(a);
          const space = document.createTextNode(' ');
          a.after(space);
          range.setStartAfter(space);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          const p = document.createElement('p');
          p.appendChild(a);
          editor.appendChild(p);
        }
        savedRangeRef.current = null;
        emitChangeFromDom();
      }
    }

    setShowLinkInput(false);
    setLinkLabel('');
    setLinkUrl('');
    setLinkError(null);
  };

  const handlePastePlain = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    const plain = e.clipboardData.getData('text/plain');
    if (!plain) return;
    document.execCommand('insertText', false, plain);
    emitChangeFromDom();
  };

  const handleSwitchTab = (nextTab: EditorTab) => {
    if (nextTab === tab) return;
    if (nextTab === 'visual') {
      // Force reload from current value when returning to visual mode
      lastEmittedRef.current = null;
    }
    setTab(nextTab);
  };

  const toolbarButtons = [
    { label: 'Gras (Ctrl+B)', icon: Bold, onClick: () => handleToolbarAction('bold') },
    { label: 'Italique (Ctrl+I)', icon: Italic, onClick: () => handleToolbarAction('italic') },
    { label: 'Souligné (Ctrl+U)', icon: Underline, onClick: () => handleToolbarAction('underline') },
    { label: 'Grand titre (H2)', icon: Heading2, onClick: () => handleToolbarAction('h2') },
    { label: 'Sous-titre (H3)', icon: Heading3, onClick: () => handleToolbarAction('h3') },
    { label: 'Liste à puces', icon: List, onClick: () => handleToolbarAction('ul') },
    { label: 'Liste numérotée', icon: ListOrdered, onClick: () => handleToolbarAction('ol') },
    { label: 'Citation éditoriale', icon: Quote, onClick: () => handleToolbarAction('quote') },
    {
      label: 'Insérer un lien https://',
      icon: Link2,
      onClick: handleOpenLinkBar,
      active: showLinkInput,
    },
  ];

  const minHeightPx = Math.max(130, rows * 26);

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#9d93b8]">
          {label}
        </label>
      )}

      <div className="border border-slate-200 dark:border-[#241a38] rounded-xl overflow-hidden bg-white dark:bg-[#0b0714] transition-colors">
        {/* Toolbar */}
        <div className="px-2.5 py-2 bg-slate-50/90 dark:bg-[#140e22] border-b border-slate-200 dark:border-[#241a38] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-0.5">
            {toolbarButtons.map(btn => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.label}
                  type="button"
                  disabled={disabled || tab === 'preview'}
                  onMouseDown={e => {
                    // Prevent editor blur so selection stays intact while clicking toolbar buttons
                    if (tab === 'visual') e.preventDefault();
                  }}
                  onClick={btn.onClick}
                  title={btn.label}
                  aria-label={btn.label}
                  className={`min-h-[32px] min-w-[32px] px-2 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    btn.active
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-600 dark:text-[#c4badb] hover:bg-slate-200/70 dark:hover:bg-[#231839] hover:text-slate-900 dark:hover:text-[#f4f1fa]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70 dark:bg-[#08050f] border border-slate-200 dark:border-[#241a38]">
            <button
              type="button"
              onClick={() => handleSwitchTab('visual')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                tab === 'visual'
                  ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa]'
                  : 'text-slate-500 dark:text-[#9d93b8]'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              <span>Visuel</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('preview')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                tab === 'preview'
                  ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa]'
                  : 'text-slate-500 dark:text-[#9d93b8]'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Aperçu</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('source')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer transition-colors ${
                tab === 'source'
                  ? 'bg-white dark:bg-[#231839] text-slate-900 dark:text-[#f4f1fa]'
                  : 'text-slate-500 dark:text-[#9d93b8]'
              }`}
            >
              <Code2 className="w-3 h-3" />
              <span>Source</span>
            </button>
          </div>
        </div>

        {/* Inline Link Bar */}
        {showLinkInput && !disabled && (
          <div className="p-3 bg-violet-50/60 dark:bg-[#171026] border-b border-slate-200 dark:border-[#241a38] space-y-2 text-xs">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                placeholder="Texte du lien (ex: Charte PAWAKO)"
                className="flex-1 min-h-[34px] px-2.5 py-1 border border-slate-200 dark:border-[#2e224a] rounded-lg bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
              />
              <input
                type="url"
                value={linkUrl}
                onChange={e => {
                  setLinkUrl(e.target.value);
                  setLinkError(null);
                }}
                placeholder="https://..."
                className="flex-1 min-h-[34px] px-2.5 py-1 font-mono border border-slate-200 dark:border-[#2e224a] rounded-lg bg-white dark:bg-[#08050f] text-slate-900 dark:text-[#f4f1fa]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleInsertLink}
                  className="min-h-[34px] px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
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
                  className="min-h-[34px] px-2.5 py-1 bg-white dark:bg-[#231839] border border-slate-200 dark:border-[#2e224a] text-slate-600 dark:text-[#d8d0eb] rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {linkError && <p className="text-[11px] text-rose-600 dark:text-rose-400">{linkError}</p>}
          </div>
        )}

        {/* Canvas */}
        {tab === 'visual' && (
          <div className="relative bg-white dark:bg-[#0b0714]">
            {isEmptyVisual && (
              <div className="pointer-events-none absolute top-4 left-4 right-4 text-sm text-slate-400 dark:text-[#6f658a]">
                {placeholder}
              </div>
            )}
            <div
              ref={editorRef}
              contentEditable={!disabled}
              suppressContentEditableWarning
              onInput={emitChangeFromDom}
              onBlur={emitChangeFromDom}
              onPaste={handlePastePlain}
              style={{ minHeight: `${minHeightPx}px` }}
              className="p-4 sm:p-5 text-[15px] leading-[1.72] text-slate-800 dark:text-[#e6e0f5] focus:outline-none space-y-2.5
                [&_h2]:font-serif [&_h2]:text-lg sm:[&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-[#f4f1fa] [&_h2]:pt-2
                [&_h3]:font-serif [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-[#f4f1fa] [&_h3]:pt-1
                [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:marker:text-violet-500
                [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:marker:text-violet-500 [&_ol]:marker:font-mono
                [&_blockquote]:border-y [&_blockquote]:border-slate-200 dark:[&_blockquote]:border-[#241a38] [&_blockquote]:py-3 [&_blockquote]:my-3 [&_blockquote]:px-4 [&_blockquote]:font-serif [&_blockquote]:italic [&_blockquote]:text-slate-600 dark:[&_blockquote]:text-[#b7aed0]
                [&_a]:text-violet-600 dark:[&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2
                [&_strong]:font-semibold [&_strong]:text-slate-950 dark:[&_strong]:text-white
                [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-[#171026] [&_code]:font-mono [&_code]:text-xs"
            />
          </div>
        )}

        {tab === 'preview' && (
          <div className="p-5 sm:p-6 bg-white dark:bg-[#0b0714]" style={{ minHeight: `${minHeightPx}px` }}>
            {value.trim() ? (
              <RichTextContent text={value} className="text-slate-700 dark:text-[#d8d0eb]" />
            ) : (
              <p className="text-xs text-slate-400 dark:text-[#7c7296] italic">
                Aucun contenu à prévisualiser pour le moment.
              </p>
            )}
          </div>
        )}

        {tab === 'source' && (
          <textarea
            ref={textareaRef}
            rows={rows}
            disabled={disabled}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-4 bg-transparent font-mono text-xs text-slate-800 dark:text-[#e2dcf2] leading-relaxed focus:outline-none disabled:opacity-70 resize-y"
          />
        )}
      </div>
    </div>
  );
};
