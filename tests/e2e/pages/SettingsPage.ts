import { expect, type Locator, type Page } from '@playwright/test';

export type ThemePreference = 'light' | 'dark' | 'system';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings');
  }

  async selectState(stateName: string): Promise<void> {
    await this.page.selectOption('#state-select', { label: stateName });
  }

  async getStateInfo(): Promise<string> {
    const infoBox = this.page.locator('.bg-blue-50');
    return infoBox.textContent() ?? '';
  }

  async isStateSelected(): Promise<boolean> {
    const select = this.page.locator('#state-select');
    const value = await select.inputValue();
    return value !== '';
  }

  // --- Theme helpers -------------------------------------------------------

  themeOption(preference: ThemePreference): Locator {
    return this.page.getByTestId(`theme-option-${preference}`);
  }

  async selectTheme(preference: ThemePreference): Promise<void> {
    await this.themeOption(preference).click();
  }

  async expectThemeSelected(preference: ThemePreference): Promise<void> {
    await expect(this.themeOption(preference)).toHaveAttribute('aria-checked', 'true');
  }

  async expectDarkApplied(): Promise<void> {
    await expect(this.page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(this.page.locator('meta[name="theme-color"]'))
      .toHaveAttribute('content', '#0f172a');
  }

  async expectLightApplied(): Promise<void> {
    await expect(this.page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(this.page.locator('meta[name="theme-color"]'))
      .toHaveAttribute('content', '#1e40af');
  }

  async getStoredThemePreference(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('themePreference'));
  }

  async setStoredThemePreference(preference: ThemePreference): Promise<void> {
    await this.page.evaluate(
      pref => localStorage.setItem('themePreference', pref),
      preference,
    );
  }
}
