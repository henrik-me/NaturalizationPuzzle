import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// jsdom does not implement matchMedia. Provide a default mock so consumers
// (e.g. ThemeProvider) don't throw. Individual tests can override window.matchMedia.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Reset theme-related DOM mutations between tests to avoid leakage.
afterEach(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
  }
  try { localStorage.clear(); } catch { /* ignore */ }
});
