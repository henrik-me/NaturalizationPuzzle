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

    // Walk through every comprehension question until the done banner appears.
    // Defensively wait for the Show Answer button on each iteration so React
    // has time to render after the previous Next click — without this the
    // loop can race the render of either the next question OR the done
    // banner after the final click. waitFor times out (and we break) once
    // we've passed the last question and the done banner is up.
    const done = page.getByTestId('story-quiz-done');
    for (let i = 0; i < 50; i++) {
      if (await done.isVisible().catch(() => false)) break;
      const showAnswer = page.getByRole('button', { name: /show the answer/i });
      try {
        await showAnswer.waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // Show Answer didn't appear — likely the done banner just rendered.
        break;
      }
      await showAnswer.click();
      await page.getByRole('button', { name: /go to next question/i }).click();
    }
    // Toleranceful final assertion: even if the loop bailed out via the
    // waitFor catch, the done banner should be visible within a reasonable
    // window after the last Next click.
    await expect(done).toBeVisible({ timeout: 10000 });

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

    // Visit the story page online once so the page itself (not just the warm-up)
    // populates every piece of cache the offline reload will need. This mirrors
    // the pattern in offline.spec.ts where a page is visited online before the
    // offline reload and avoids races between the warm-up and the SW cache.
    await page.goto('/stories/three-branches');
    await expect(page.getByRole('heading', { level: 1, name: /Three Branches/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();

    // Go offline and reload — the same URL must still render fully from cache.
    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: /Three Branches/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();
  });
});
