import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SettingsPage } from '../pages/SettingsPage';
import { StudyPage } from '../pages/StudyPage';
import { QuizPage } from '../pages/QuizPage';

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.describe('Settings Page', () => {
    test('settings page has no a11y violations', async ({ page }) => {
      const settings = new SettingsPage(page);
      await settings.goto();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('settings page with state selected has no a11y violations', async ({ page }) => {
      const settings = new SettingsPage(page);
      await settings.goto();
      await settings.selectState('California');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe('Study Page', () => {
    test.beforeEach(async ({ page }) => {
      const settings = new SettingsPage(page);
      await settings.goto();
      await settings.selectState('New York');
    });

    test('study page has no a11y violations', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('study page with revealed answer has no a11y violations', async ({ page }) => {
      const study = new StudyPage(page);
      await study.goto();
      await study.clickShowAnswer();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe('Quiz Page', () => {
    test.beforeEach(async ({ page }) => {
      const settings = new SettingsPage(page);
      await settings.goto();
      await settings.selectState('New York');
    });

    test('quiz start page has no a11y violations', async ({ page }) => {
      const quiz = new QuizPage(page);
      await quiz.goto();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('quiz in-progress has no a11y violations', async ({ page }) => {
      const quiz = new QuizPage(page);
      await quiz.goto();
      await quiz.startQuiz();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test('quiz with typed answer has no a11y violations', async ({ page }) => {
      const quiz = new QuizPage(page);
      await quiz.goto();
      await quiz.startQuiz();
      await quiz.typeAnswer('test answer');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });
});
