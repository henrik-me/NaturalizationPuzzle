import type { Page } from '@playwright/test';

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
}
