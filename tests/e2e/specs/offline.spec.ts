import { test, expect } from '@playwright/test';
import { StudyPage } from '../pages/StudyPage';
import { SettingsPage } from '../pages/SettingsPage';
import { QuizPage } from '../pages/QuizPage';

/**
 * Offline capability tests.
 *
 * These tests verify the app works after going offline by using Playwright's
 * context.setOffline(true). With the dev server, this tests that components
 * handle offline state gracefully. With a production build (container or
 * `npm run preview`), the service worker serves cached responses.
 *
 * For full service worker validation, run against the container:
 *   container-start.bat
 *   npx playwright test offline --config=playwright.offline.config.ts
 */
test.describe('Offline Capabilities', () => {
  test.beforeEach(async ({ page }) => {
    // Load app online first — warm-up hook caches all API data
    const settings = new SettingsPage(page);
    await settings.goto();

    // Wait for the post-state-selection warm-up to actually finish, on
    // a deterministic signal rather than a fixed timeout. ``useWarmUpCache``
    // re-runs whenever ``stateId`` changes, so once we pick a state it
    // fires getAllQuestions, get6520Questions, getAllStates, and
    // getStateById in parallel. The offline tests below depend on the
    // all-questions, 65/20 questions, and state-by-id responses being
    // in browser cache; wait for those requests to resolve before going
    // offline so the test never races the warm-up. A fixed waitForTimeout
    // was previously used here, but it was either too short on slow CI
    // or wasted time when the warm-up finished quickly.
    const warmUpResponses = Promise.all([
      page.waitForResponse(
        r => /\/api\/v1\/questions\?stateId=\d+/.test(r.url()) && r.ok(),
      ),
      page.waitForResponse(
        r => /\/api\/v1\/questions\/6520\?stateId=\d+/.test(r.url()) && r.ok(),
      ),
      page.waitForResponse(
        r => /\/api\/v1\/states\/\d+/.test(r.url()) && r.ok(),
      ),
    ]);
    await settings.selectState('New York');
    await warmUpResponses;

    // Visit study page so the StudyPage component itself has rendered
    // at least once with the cached data before tests reload offline.
    const study = new StudyPage(page);
    await study.goto();
    await study.getQuestionText();
  });

  test('study page shows questions while offline', async ({ page, context }) => {
    await context.setOffline(true);
    await page.reload();

    const study = new StudyPage(page);
    const questionText = await study.getQuestionText();
    expect(questionText.length).toBeGreaterThan(0);
    expect(await study.getQuestionNumber()).toContain('Question 1 of');
  });

  test('can reveal answers while offline', async ({ page, context }) => {
    await context.setOffline(true);
    await page.reload();

    const study = new StudyPage(page);
    await study.clickShowAnswer();
    const answers = await study.getAnswers();
    expect(answers.length).toBeGreaterThan(0);
  });

  test('can navigate between pages while offline', async ({ page, context }) => {
    await context.setOffline(true);

    // Navigate to history (fully client-side, no API needed)
    await page.click('a[href="/history"]');
    await expect(page.locator('main')).toBeVisible();

    // Navigate to settings
    await page.click('a[href="/settings"]');
    await expect(page.locator('main')).toBeVisible();

    // Navigate back to study
    await page.click('a[href="/"]');
    await expect(page.locator('main')).toBeVisible();
  });

  test('quiz page loads questions while offline', async ({ page, context }) => {
    await context.setOffline(true);

    const quiz = new QuizPage(page);
    await quiz.goto();

    // The quiz start button should be visible (questions cached by warm-up)
    await expect(page.locator('button:has-text("Start Quiz")')).toBeVisible();
  });

  test('offline banner appears when network is lost', async ({ page, context }) => {
    await context.setOffline(true);

    // Trigger the browser's offline event
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    await expect(page.locator('text=You are offline')).toBeVisible();
  });
});
