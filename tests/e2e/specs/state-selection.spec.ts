import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('State Selection', () => {
  test('user can select a state and see state info', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await settings.selectState('California');

    const info = await settings.getStateInfo();
    expect(info).toContain('Sacramento');
    expect(info).toContain('Gavin Newsom');
  });

  test('state selection persists across navigation', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();

    await settings.selectState('Texas');

    await page.goto('/');
    await page.goto('/settings');

    expect(await settings.isStateSelected()).toBe(true);
  });
});
