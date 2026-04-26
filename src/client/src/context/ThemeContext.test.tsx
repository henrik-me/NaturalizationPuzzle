import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme, type ThemePreference } from './ThemeContext';

interface MockMql {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
  trigger(matches: boolean): void;
}

function installMatchMediaMock(initialMatches: boolean): MockMql {
  const mql: MockMql = {
    matches: initialMatches,
    listeners: new Set(),
    trigger(matches) {
      this.matches = matches;
      const event = { matches } as MediaQueryListEvent;
      this.listeners.forEach(l => l(event));
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      get matches() { return mql.matches; },
      media: query,
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => mql.listeners.add(l),
      removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => mql.listeners.delete(l),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  });
  return mql;
}

function Probe(): React.ReactNode {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>set-dark</button>
      <button onClick={() => setTheme('light')}>set-light</button>
      <button onClick={() => setTheme('system')}>set-system</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  });

  it('defaults to "system" when no preference is stored', () => {
    installMatchMediaMock(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('resolves to dark when system preference is dark', () => {
    installMatchMediaMock(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('reads stored preference and ignores invalid values', () => {
    installMatchMediaMock(false);
    localStorage.setItem('themePreference', 'not-a-theme');
    const { unmount } = render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('system');
    unmount();

    localStorage.setItem('themePreference', 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('persists preference and toggles the dark class', async () => {
    installMatchMediaMock(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => {
      screen.getByText('set-dark').click();
    });
    expect(localStorage.getItem('themePreference')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await act(async () => {
      screen.getByText('set-light').click();
    });
    expect(localStorage.getItem('themePreference')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('updates resolved theme when system preference changes (in system mode)', async () => {
    const mql = installMatchMediaMock(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('resolved').textContent).toBe('light');

    await act(async () => { mql.trigger(true); });
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await act(async () => { mql.trigger(false); });
    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });

  it('ignores system preference changes when an explicit theme is selected', async () => {
    const mql = installMatchMediaMock(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => { screen.getByText('set-light').click(); });
    expect(screen.getByTestId('resolved').textContent).toBe('light');

    await act(async () => { mql.trigger(true); });
    // Still light because preference is 'light', not 'system'
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('updates the theme-color meta tag', async () => {
    installMatchMediaMock(false);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#1e40af');

    await act(async () => { screen.getByText('set-dark').click(); });
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#0f172a');
  });

  it('throws when useTheme is used outside ThemeProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useTheme must be used within ThemeProvider/);
    consoleSpy.mockRestore();
  });

  it('survives localStorage failures gracefully', async () => {
    installMatchMediaMock(false);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => { screen.getByText('set-dark').click(); });
    // In-memory state still updates even though persistence failed
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    setItemSpy.mockRestore();
  });

  it('accepts all valid theme preference values', () => {
    installMatchMediaMock(false);
    const values: readonly ThemePreference[] = ['light', 'dark', 'system'];
    for (const v of values) {
      localStorage.setItem('themePreference', v);
      const { unmount } = render(<ThemeProvider><Probe /></ThemeProvider>);
      expect(screen.getByTestId('theme').textContent).toBe(v);
      unmount();
      document.documentElement.className = '';
    }
  });
});
