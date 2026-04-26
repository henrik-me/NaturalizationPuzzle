import { test, expect } from '@playwright/test';
import { StudyPage } from '../pages/StudyPage';
import { SettingsPage } from '../pages/SettingsPage';

test.describe('Study Flow', () => {
  test.beforeEach(async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.selectState('New York');
  });

  test('displays first question after state selection', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    const questionText = await study.getQuestionText();
    expect(questionText.length).toBeGreaterThan(0);
    expect(await study.getQuestionNumber()).toContain('Question 1 of');
  });

  test('reveals answers and advances to next question', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    await study.clickShowAnswer();
    const answers = await study.getAnswers();
    expect(answers.length).toBeGreaterThan(0);

    await study.clickNextQuestion();
    expect(await study.getQuestionNumber()).toContain('Question 2 of');
  });

  test('can filter to 65/20 questions', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    await study.selectFilter('6520');

    await expect(page.locator('[role="article"] span.text-sm').first()).toContainText('of 20');
  });

  test('filters by category', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    await study.selectCategory('Integrated Civics');

    // Integrated Civics has 10 questions (Q119-128) in the seeded pool.
    await expect(page.locator('[role="article"] span.text-sm').first()).toContainText('of 10');
  });

  test('filters by studied status', async ({ page }) => {
    const study = new StudyPage(page);
    await study.goto();

    // No questions studied yet -> Unstudied set equals full pool, Studied set is empty.
    await study.selectStudiedFilter('Studied');
    await expect(page.getByText(/No questions match the current filters/)).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    expect(await study.getQuestionNumber()).toContain('Question 1 of');
  });
});
