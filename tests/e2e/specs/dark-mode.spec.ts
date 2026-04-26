import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('defaults to System preference and resolves to dark when OS prefers dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');

    const systemOption = page.getByTestId('theme-option-system');
    await expect(systemOption).toHaveAttribute('aria-checked', 'true');

    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
  });

  test('System preference resolves to light when OS prefers light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');

    await expect(page.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e40af');
  });

  test('selecting Dark applies dark class and updates theme-color', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');

    await page.getByTestId('theme-option-dark').click();

    await expect(page.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
  });

  test('selecting Light removes dark class even when OS prefers dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');

    await page.getByTestId('theme-option-light').click();

    await expect(page.getByTestId('theme-option-light')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e40af');
  });

  test('preference persists across reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');

    await page.getByTestId('theme-option-dark').click();
    const stored = await page.evaluate(() => localStorage.getItem('themePreference'));
    expect(stored).toBe('dark');

    await page.reload();

    await expect(page.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test('no FOUC: theme is applied before React mounts (main.tsx blocked)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await page.evaluate(() => localStorage.setItem('themePreference', 'dark'));

    // Block the app entry so React cannot mount; only the inline FOUC script in
    // index.html will have run when we make our assertions.
    await page.route('**/src/main.tsx', route => route.abort());

    await page.goto('/settings', { waitUntil: 'commit' });

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
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await page.evaluate(() => localStorage.setItem('themePreference', 'light'));

    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto('/settings', { waitUntil: 'commit' });

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
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');

    const light = page.getByTestId('theme-option-light');
    const dark = page.getByTestId('theme-option-dark');
    const system = page.getByTestId('theme-option-system');

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
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await expect(page.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e40af');
  });

  test('explicit Light ignores OS preference changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    await page.getByTestId('theme-option-light').click();

    await page.emulateMedia({ colorScheme: 'dark' });

    // Give any erroneous matchMedia listener a chance to fire.
    await page.waitForTimeout(100);
    await expect(page.getByTestId('theme-option-light')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e40af');
  });

  test('explicit Dark ignores OS preference changes', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await page.getByTestId('theme-option-dark').click();

    await page.emulateMedia({ colorScheme: 'light' });

    await page.waitForTimeout(100);
    await expect(page.getByTestId('theme-option-dark')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
  });

  test('switching back to System resumes following OS preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');

    await page.getByTestId('theme-option-light').click();
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.getByTestId('theme-option-system').click();
    await expect(page.getByTestId('theme-option-system')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    expect(await page.evaluate(() => localStorage.getItem('themePreference'))).toBe('system');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
});
