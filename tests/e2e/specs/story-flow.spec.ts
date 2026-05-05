import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Story Mode v1 e2e flow.
 *
 * Covers the pieces the unit tests can't: real browser routing into the
 * /stories index, navigation into a detail page, the state-aware preamble
 * rendering with a real selected state, the comprehension-quiz hand-off
 * to QuizCard, persisted storiesRead in localStorage across reload, and
 * the offline-readability contract (warm-up caches each pilot detail
 * during the first online load, then reload offline still renders).
 */

test.describe('Story Mode', () => {
  test('Stories index lists all three pilot stories grouped by category', async ({ page }) => {
    await page.goto('/stories');

    await expect(page.getByRole('heading', { level: 1, name: 'Stories' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'American Government' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'American History' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Integrated Civics' })).toBeVisible();

    await expect(page.getByTestId('story-card-three-branches')).toBeVisible();
    await expect(page.getByTestId('story-card-civil-war-and-reconstruction')).toBeVisible();
    await expect(page.getByTestId('story-card-national-symbols-and-holidays')).toBeVisible();
  });

  test('three-branches story renders the state-aware preamble after selecting a state', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.selectState('California');

    await page.goto('/stories/three-branches');

    await expect(page.getByRole('heading', { level: 1, name: /Three Branches/i })).toBeVisible();
    const preamble = page.getByTestId('state-preamble');
    await expect(preamble).toBeVisible();
    await expect(preamble).toContainText('California');
    // California's seeded senators show up in the preamble too.
    await expect(preamble).toContainText(/senator/i);
  });

  test('completing the comprehension quiz marks the story as read and persists across reload', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.selectState('Texas');

    await page.goto('/stories/national-symbols-and-holidays');
    await expect(page.getByRole('heading', { level: 1, name: /National Symbols/i })).toBeVisible();

    await page.getByTestId('start-comprehension-quiz').click();

    // Walk through every comprehension question. The story has 8 in this pilot,
    // but advance via "Next Question" without depending on an exact count by
    // looping until the done banner appears.
    for (let i = 0; i < 50; i++) {
      const done = page.getByTestId('story-quiz-done');
      if (await done.isVisible().catch(() => false)) break;
      const showAnswer = page.getByRole('button', { name: /show the answer/i });
      if (await showAnswer.isVisible().catch(() => false)) {
        await showAnswer.click();
      }
      const next = page.getByRole('button', { name: /go to next question/i });
      await next.click();
    }
    await expect(page.getByTestId('story-quiz-done')).toBeVisible();

    // localStorage progress shape includes the new storiesRead entry.
    const stored = await page.evaluate(() => localStorage.getItem('naturalizationProgress'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.storiesRead).toContain('national-symbols-and-holidays');

    // After a hard reload, the Read badge persists on the index card.
    await page.goto('/stories');
    const card = page.getByTestId('story-card-national-symbols-and-holidays');
    await expect(card.getByLabel('Already read')).toBeVisible();
  });

  test('a story remains readable after going offline (warm-up contract)', async ({ page, context }) => {
    // Pick a state so the warm-up exercises the state-aware variants too.
    const settings = new SettingsPage(page);
    await settings.goto();

    // Wait for the warm-up to actually fetch the story detail before going offline.
    const storyDetailWarmed = page.waitForResponse(
      r => /\/api\/v1\/stories\/three-branches(\?|$)/.test(r.url()) && r.ok(),
      { timeout: 15000 },
    );
    await settings.selectState('Washington');
    await storyDetailWarmed;

    // Go offline.
    await context.setOffline(true);

    // Open the detail page from cold (first time on this URL while offline).
    await page.goto('/stories/three-branches');

    await expect(page.getByRole('heading', { level: 1, name: /Three Branches/i })).toBeVisible();
    // Sources section rendered too — full body, not just header.
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();
  });
});
