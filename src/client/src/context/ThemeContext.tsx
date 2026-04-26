import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'themePreference';
const VALID: readonly ThemePreference[] = ['light', 'dark', 'system'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (VALID as readonly string[]).includes(value);
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode); fall through to default
  }
  return 'system';
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;

  // Sync the browser chrome / PWA status bar color
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  // slate-900 for dark, blue-800 (matches manifest theme_color) for light
  meta.content = resolved === 'dark' ? '#0f172a' : '#1e40af';
}

interface ThemeContextValue {
  readonly theme: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
  readonly setTheme: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  // Apply resolved theme to <html> on every change
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Subscribe to OS color-scheme changes; the listener stays mounted globally
  // (this provider lives at the app root) so it works even when the user
  // navigates away from Settings.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    // Safari < 14 / iOS Safari < 14 only support the legacy addListener API.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => { mql.removeEventListener('change', handler); };
    }
    mql.addListener(handler);
    return () => { mql.removeListener(handler); };
  }, []);

  const setTheme = useCallback((preference: ThemePreference): void => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // ignore write failures (private mode, quota); state still updates in-memory
    }
    setThemeState(preference);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
