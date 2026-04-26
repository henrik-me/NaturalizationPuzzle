import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Dark Mode', () => {
  test('defaults to System preference and resolves to dark when OS prefers dark', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.goto();

    await settings.expectThemeSelected('system');
    await settings.expectDarkApplied();
  });

  test('System preference resolves to light when OS prefers light', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();

    await settings.expectThemeSelected('system');
    await settings.expectLightApplied();
  });

  test('selecting Dark applies dark class and updates theme-color', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();

    await settings.selectTheme('dark');

    await settings.expectThemeSelected('dark');
    await settings.expectDarkApplied();
  });

  test('selecting Light removes dark class even when OS prefers dark', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.goto();

    await settings.selectTheme('light');

    await settings.expectThemeSelected('light');
    await settings.expectLightApplied();
  });

  test('preference persists across reload', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();

    await settings.selectTheme('dark');
    expect(await settings.getStoredThemePreference()).toBe('dark');

    await page.reload();

    await settings.expectThemeSelected('dark');
    await settings.expectDarkApplied();
  });

  test('no FOUC: theme is applied before React mounts (main.tsx blocked)', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();
    await settings.setStoredThemePreference('dark');

    // Block the app entry so React cannot mount; only the inline FOUC script
    // in index.html will have run when we make our assertions. We use
    // waitUntil:'commit' (the earliest signal Playwright offers) and then
    // explicitly waitForFunction on documentElement.style.colorScheme to
    // synchronize on the inline script having executed.
    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto('/settings', { waitUntil: 'commit' });
    // Wait until the inline FOUC script has executed (it sets colorScheme).
    await page.waitForFunction(() => document.documentElement.style.colorScheme !== '');

    const state = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains('dark'),
      colorScheme: document.documentElement.style.colorScheme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      rootChildCount: document.getElementById('root')?.childElementCount ?? -1,
    }));

    expect(state.rootChildCount).toBe(0);
    expect(state.hasDark).toBe(true);
    expect(state.colorScheme).toBe('dark');
    expect(state.themeColor).toBe('#0f172a');
  });

  test('no FOUC (mirror): persisted light is honored on dark OS before mount', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.goto();
    await settings.setStoredThemePreference('light');

    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto('/settings', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.style.colorScheme !== '');

    const state = await page.evaluate(() => ({
      hasDark: document.documentElement.classList.contains('dark'),
      colorScheme: document.documentElement.style.colorScheme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      rootChildCount: document.getElementById('root')?.childElementCount ?? -1,
    }));

    expect(state.rootChildCount).toBe(0);
    expect(state.hasDark).toBe(false);
    expect(state.colorScheme).toBe('light');
    expect(state.themeColor).toBe('#1e40af');
  });

  test('keyboard navigation (radiogroup): arrow keys move selection', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();

    const light = settings.themeOption('light');
    const dark = settings.themeOption('dark');
    const system = settings.themeOption('system');

    await light.click();
    await expect(light).toBeFocused();

    await light.press('ArrowRight');
    await expect(dark).toBeFocused();
    await expect(dark).toHaveAttribute('aria-checked', 'true');

    await dark.press('End');
    await expect(system).toBeFocused();
    await expect(system).toHaveAttribute('aria-checked', 'true');

    await system.press('Home');
    await expect(light).toBeFocused();
    await expect(light).toHaveAttribute('aria-checked', 'true');
  });

  test('System mode reacts to live OS preference changes', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();
    await settings.expectThemeSelected('system');
    await settings.expectLightApplied();

    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.expectDarkApplied();

    await page.emulateMedia({ colorScheme: 'light' });
    await settings.expectLightApplied();
  });

  test('explicit Light ignores OS preference changes', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.goto();
    await settings.selectTheme('light');
    await settings.expectLightApplied();

    // ThemeProvider's resolvedTheme stays equal to `theme` (light) while in
    // explicit mode, so the rendered UI does not react to OS changes — the
    // assertions below are therefore deterministic without a fixed timeout.
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.expectThemeSelected('light');
    await settings.expectLightApplied();
  });

  test('explicit Dark ignores OS preference changes', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.goto();
    await settings.selectTheme('dark');
    await settings.expectDarkApplied();

    // Same as above: in explicit Dark, resolvedTheme is fixed regardless of OS.
    await page.emulateMedia({ colorScheme: 'light' });
    await settings.expectThemeSelected('dark');
    await settings.expectDarkApplied();
  });

  test('switching back to System resumes following OS preference', async ({ page }) => {
    const settings = new SettingsPage(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await settings.goto();

    await settings.selectTheme('light');
    await settings.expectLightApplied();

    await settings.selectTheme('system');
    await settings.expectThemeSelected('system');
    await settings.expectDarkApplied();
    expect(await settings.getStoredThemePreference()).toBe('system');

    await page.emulateMedia({ colorScheme: 'light' });
    await settings.expectLightApplied();
  });
});
