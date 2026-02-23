import type { Page } from '@playwright/test';

export class StudyPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async getQuestionText(): Promise<string> {
    return (await this.page.locator('[role="article"] p.text-lg').textContent()) ?? '';
  }

  async getQuestionNumber(): Promise<string> {
    return (await this.page.locator('[role="article"] span.text-sm').textContent()) ?? '';
  }

  async clickShowAnswer(): Promise<void> {
    await this.page.click('button:has-text("Show Answer")');
  }

  async clickNextQuestion(): Promise<void> {
    await this.page.click('button:has-text("Next Question")');
  }

  async getAnswers(): Promise<string[]> {
    return this.page.locator('[role="list"] li').allTextContents();
  }

  async selectFilter(filter: 'all' | '6520'): Promise<void> {
    const label = filter === '6520' ? '65/20' : 'All 128';
    await this.page.click(`button:has-text("${label}")`);
  }
}
