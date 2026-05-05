import { useMemo } from 'react';
import type { StorySource } from '../types/api';

/**
 * Narrow Markdown renderer for story bodies.
 *
 * SECURITY POSTURE
 * ----------------
 * Story body content ships in our own seed (content/stories/*.md) and is
 * server-validated by StoryParser before it ever reaches the client. The
 * renderer is still defensive enough that a future contributor mistake
 * (e.g., accidentally including raw HTML or a javascript: URL in a story
 * body) cannot introduce XSS:
 *
 * 1. We do NOT use dangerouslySetInnerHTML anywhere; output is constructed
 *    as React JSX, which auto-escapes all text content.
 * 2. We render an explicit allowlist of constructs only (paragraphs,
 *    h2/h3, lists, links, bold/italic, citation markers). Any other
 *    Markdown extension or raw HTML is rendered as plain text.
 * 3. Link URLs are protocol-allowlisted to http(s)/mailto. javascript:,
 *    data:, vbscript:, file:, etc. are dropped (the link text remains).
 * 4. External links open in a new tab with rel="noopener noreferrer" and
 *    a screen-reader hint.
 *
 * Renderer XSS posture is covered by StoryRenderer.test.tsx.
 */
export interface StoryRendererProps {
  readonly markdown: string;
  readonly sources: readonly StorySource[];
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://_naturalizationpuzzle.invalid');
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

interface ParagraphBlock { readonly kind: 'paragraph'; readonly text: string; }
interface HeadingBlock { readonly kind: 'heading'; readonly level: 2 | 3; readonly text: string; }
interface ListBlock { readonly kind: 'list'; readonly ordered: boolean; readonly items: readonly string[]; }
type Block = ParagraphBlock | HeadingBlock | ListBlock;

function parseBlocks(markdown: string): readonly Block[] {
  // Strip HTML comments (the <!-- model-memory --> and <!-- narrative -->
  // markers are metadata for the parser/renderer, not visible content).
  const cleaned = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const lines = cleaned.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];

  function flushParagraph(): void {
    if (buffer.length > 0) {
      const text = buffer.join('\n').trim();
      if (text.length > 0) {
        blocks.push({ kind: 'paragraph', text });
      }
      buffer = [];
    }
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      i++;
      continue;
    }

    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length === 2 ? 2 : 3;
      blocks.push({ kind: 'heading', level: level as 2 | 3, text: headingMatch[2] });
      i++;
      continue;
    }

    const isUnordered = /^[-*]\s+/.test(trimmed);
    const isOrdered = /^\d+\.\s+/.test(trimmed);
    if (isUnordered || isOrdered) {
      flushParagraph();
      const items: string[] = [];
      const matcher = isOrdered ? /^\d+\.\s+/ : /^[-*]\s+/;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l === '') { i++; break; }
        const isSameKind = isOrdered ? /^\d+\.\s+/.test(l) : /^[-*]\s+/.test(l);
        if (!isSameKind) break;
        items.push(l.replace(matcher, ''));
        i++;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    buffer.push(line);
    i++;
  }
  flushParagraph();
  return blocks;
}

/**
 * Inline-markdown rendering. Returns a list of React nodes (string or
 * JSX element) so React handles all text-content escaping for us.
 *
 * Recognized constructs (in priority order, evaluated longest-match-wins):
 *   1. Markdown links: `[text](url)` (with protocol allowlist).
 *   2. Citation markers: `[N]` -> superscript anchor to #story-source-N.
 *   3. Bold: `**text**`.
 *   4. Italic: `*text*` or `_text_`.
 *
 * Everything else is plain text and renders as-is via React's escaping.
 */
function renderInline(text: string, sourceIds: ReadonlySet<number>, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;
  let plain = '';

  function flush(): void {
    if (plain.length > 0) {
      nodes.push(plain);
      plain = '';
    }
  }

  while (i < text.length) {
    const ch = text[i];

    // Markdown link: [text](url)
    if (ch === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = text.substring(i + 1, closeBracket);
          const url = text.substring(closeBracket + 2, closeParen);
          flush();
          if (isSafeUrl(url)) {
            nodes.push(
              <a
                key={`${keyPrefix}-link-${key++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${linkText} (opens in new tab)`}
                className="text-blue-700 dark:text-blue-300 underline"
              >
                {linkText}
              </a>
            );
          } else {
            // Reject the URL but keep the link text visible.
            nodes.push(linkText);
          }
          i = closeParen + 1;
          continue;
        }
      }

      // Citation marker: [N]
      const citationMatch = /^\[(\d+)\]/.exec(text.substring(i));
      if (citationMatch) {
        const id = Number(citationMatch[1]);
        flush();
        if (sourceIds.has(id)) {
          nodes.push(
            <sup key={`${keyPrefix}-cite-${key++}`}>
              <a
                href={`#story-source-${id}`}
                className="text-blue-700 dark:text-blue-300 px-0.5"
                aria-label={`Source ${id}`}
              >
                [{id}]
              </a>
            </sup>
          );
        } else {
          // Unresolved citation marker (server validates, but be safe): plain text.
          nodes.push(citationMatch[0]);
        }
        i += citationMatch[0].length;
        continue;
      }
    }

    // Bold: **text**
    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      if (close !== -1) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-b-${key++}`}>
            {renderInline(text.substring(i + 2, close), sourceIds, `${keyPrefix}-b${key}`)}
          </strong>
        );
        i = close + 2;
        continue;
      }
    }

    // Italic: *text* or _text_
    if ((ch === '*' || ch === '_') && text[i - 1] !== ch) {
      const close = text.indexOf(ch, i + 1);
      if (close !== -1 && close > i + 1) {
        flush();
        nodes.push(
          <em key={`${keyPrefix}-i-${key++}`}>
            {renderInline(text.substring(i + 1, close), sourceIds, `${keyPrefix}-i${key}`)}
          </em>
        );
        i = close + 1;
        continue;
      }
    }

    plain += ch;
    i++;
  }
  flush();
  return nodes;
}

export function StoryRenderer({ markdown, sources }: StoryRendererProps): React.ReactNode {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  const sourceIds = useMemo(
    () => new Set<number>(sources.map(s => s.id)),
    [sources]
  );

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none" data-testid="story-body">
      {blocks.map((block, idx) => {
        const key = `block-${idx}`;
        if (block.kind === 'heading') {
          if (block.level === 2) {
            return (
              <h2 key={key} className="text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100">
                {renderInline(block.text, sourceIds, key)}
              </h2>
            );
          }
          return (
            <h3 key={key} className="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">
              {renderInline(block.text, sourceIds, key)}
            </h3>
          );
        }
        if (block.kind === 'list') {
          if (block.ordered) {
            return (
              <ol key={key} className="list-decimal list-inside my-3 space-y-1">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, sourceIds, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          }
          return (
            <ul key={key} className="list-disc list-inside my-3 space-y-1">
              {block.items.map((item, j) => (
                <li key={`${key}-${j}`}>{renderInline(item, sourceIds, `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key} className="my-3 leading-relaxed text-gray-800 dark:text-gray-200">
            {renderInline(block.text, sourceIds, key)}
          </p>
        );
      })}
    </div>
  );
}
