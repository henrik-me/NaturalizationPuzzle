import type { Page } from '@playwright/test';

export class QuizPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/quiz');
  }

  async startQuiz(): Promise<void> {
    await this.page.click('button:has-text("Start Quiz")');
    await this.page.waitForSelector('[data-testid="quiz-card"], [role="article"]');
  }

  async getQuestionText(): Promise<string> {
    return (await this.page.locator('[role="article"] p.text-lg').textContent()) ?? '';
  }

  async typeAnswer(answer: string): Promise<void> {
    await this.page.fill('input[type="text"]', answer);
  }

  async submitAnswer(): Promise<void> {
    await this.page.click('button:has-text("Submit")');
  }

  async isComplete(): Promise<boolean> {
    return this.page.locator('text=Quiz Complete').isVisible();
  }

  async getResultText(): Promise<string> {
    return (await this.page.locator('main').textContent()) ?? '';
  }
}
