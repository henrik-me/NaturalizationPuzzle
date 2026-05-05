import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryRenderer } from './StoryRenderer';
import type { StorySource } from '../types/api';

const SOURCES: readonly StorySource[] = [
  { id: 1, title: 'Wiki', url: 'https://en.wikipedia.org/wiki/Test', type: 'wikipedia', supportSnippet: 'snip' },
  { id: 2, title: 'Gov', url: 'https://www.archives.gov/test',     type: 'gov',       supportSnippet: 'snip' },
];

describe('StoryRenderer', () => {
  it('renders headings, paragraphs, and inline bold/italic', () => {
    render(<StoryRenderer markdown={'## Hi\n\nThis is **bold** and *italic*.'} sources={SOURCES} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Hi' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('does not render HTML-comment markers as visible text (server strips them; defense-in-depth: any leftover renders inert via React escaping)', () => {
    // The server-side StoryParser strips <!-- narrative --> and
    // <!-- model-memory --> markers from BodyMarkdown before it reaches the
    // client. The renderer therefore receives marker-free input. This test
    // simulates a future server bug that lets a marker through and verifies
    // the renderer renders it as inert escaped text — never as a live HTML
    // comment node.
    const malformedFromServer = 'A paragraph.\n\n<!-- this should not be here -->\n\nAnother paragraph.';
    const { container } = render(
      <StoryRenderer markdown={malformedFromServer} sources={SOURCES} />
    );
    expect(screen.getByText('A paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Another paragraph.')).toBeInTheDocument();
    // Crucially: the leftover '<!--' is in the visible text content, not in
    // an HTML comment node. React text-content escaping makes this safe.
    expect(container.textContent).toContain('<!-- this should not be here -->');
    // Verify there is NO actual HTML comment node in the DOM.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT);
    let commentNodeCount = 0;
    while (walker.nextNode()) commentNodeCount++;
    expect(commentNodeCount).toBe(0);
  });

  it('renders [N] citation markers as superscript anchors to source list', () => {
    const { container } = render(
      <StoryRenderer markdown={'A claim with a citation [1].'} sources={SOURCES} />
    );
    const sup = container.querySelector('sup');
    expect(sup).not.toBeNull();
    const link = sup!.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('#story-source-1');
    expect(link!.textContent).toBe('[1]');
  });

  it('renders unresolved citation markers as plain text (no broken anchor)', () => {
    const { container } = render(
      <StoryRenderer markdown={'An unknown citation [99] appears.'} sources={SOURCES} />
    );
    expect(container.querySelector('sup')).toBeNull();
    expect(container.textContent).toContain('[99]');
  });

  it('renders ordered and unordered lists', () => {
    render(<StoryRenderer markdown={'- one\n- two\n\n1. first\n2. second'} sources={SOURCES} />);
    const ulItems = screen.getAllByRole('listitem');
    expect(ulItems.map(li => li.textContent)).toEqual(['one', 'two', 'first', 'second']);
  });

  it('renders safe http(s) links with target=_blank and rel=noopener', () => {
    const { container } = render(
      <StoryRenderer
        markdown={'See [Wikipedia](https://en.wikipedia.org/wiki/Test) for details.'}
        sources={SOURCES}
      />
    );
    const a = container.querySelector('a[href="https://en.wikipedia.org/wiki/Test"]');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('target')).toBe('_blank');
    expect(a!.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a!.getAttribute('aria-label')).toContain('opens in new tab');
  });

  // ---- XSS guards (plan-review fix #5) -----------------------------------

  it('does NOT render raw <script> tags as executable HTML', () => {
    const malicious = 'Before <script>alert(1)</script> after.';
    const { container } = render(<StoryRenderer markdown={malicious} sources={SOURCES} />);
    // The renderer doesn't use dangerouslySetInnerHTML — text is escaped.
    // The literal "<script>" appears in document text content, but no real
    // <script> element is created in the DOM.
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('does NOT render raw event-handler attributes (onerror/onload)', () => {
    const malicious = 'A pic <img src=x onerror="alert(1)"> here.';
    const { container } = render(<StoryRenderer markdown={malicious} sources={SOURCES} />);
    expect(container.querySelector('img')).toBeNull();
    // Raw HTML attribute strings come through as escaped text, not as live attrs.
    const html = container.innerHTML;
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it('refuses javascript: URLs in markdown links (link text is preserved as plain text)', () => {
    const { container } = render(
      <StoryRenderer markdown={'A [bad link](javascript:alert(1)) here.'} sources={SOURCES} />
    );
    // No anchor tag is generated for the unsafe URL.
    expect(container.querySelector('a')).toBeNull();
    // The link text is preserved as plain text so the prose still reads.
    expect(container.textContent).toContain('bad link');
    expect(container.textContent).not.toContain('javascript:');
  });

  it('refuses data: URLs in markdown links', () => {
    const { container } = render(
      <StoryRenderer markdown={'A [bad](data:text/html,<script>alert(1)</script>) link.'} sources={SOURCES} />
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('bad');
  });

  it('refuses vbscript: URLs in markdown links', () => {
    const { container } = render(
      <StoryRenderer markdown={'A [bad](vbscript:msgbox(1)) link.'} sources={SOURCES} />
    );
    expect(container.querySelector('a')).toBeNull();
  });
});
