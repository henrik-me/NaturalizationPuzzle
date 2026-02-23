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

    expect(await study.getQuestionNumber()).toContain('of 20');
  });
});
