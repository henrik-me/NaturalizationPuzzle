import { test, expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * Story Mode e2e flow.
 *
 * Covers the pieces the unit tests can't: real browser routing into the
 * /stories index, navigation into a detail page, the state-aware preamble
 * rendering with a real selected state, the comprehension-quiz hand-off
 * to QuizCard, persisted storiesRead in localStorage across reload, and
 * the offline-readability contract (warm-up caches each story detail
 * during the first online load, then reload offline still renders).
 */

test.describe('Story Mode', () => {
  test('Stories index lists the baseline story cards grouped by category', async ({ page }) => {
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

    await page.getByTestId('continue-with-study').click();

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

  test('typed-mode comprehension quiz scores the run, marks the story read, and surfaces in History', async ({ page }) => {
    // Issue #85 Phase 4: end-to-end coverage of the opt-in typed-input
    // comprehension quiz on /stories/three-branches. Walks the full
    // user journey: state selection → story page → pick "Continue with
    // Quiz" (NOT a single Start button) → submit one known-correct
    // answer → assert green per-question feedback → walk to the end
    // → assert results panel ("X out of N correct") → assert NO
    // PASS/FAIL banner copy → assert read state persisted → /history
    // → assert the new Story Comprehension block + per-story row +
    // chronological row with the matching score.

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.selectState('California');

    await page.goto('/stories/three-branches');
    await expect(page.getByRole('heading', { level: 1, name: /Three Branches/i })).toBeVisible();

    // Decision A: two-CTA chooser, no default Start button.
    const continueWithStudy = page.getByTestId('continue-with-study');
    const continueWithQuiz = page.getByTestId('continue-with-quiz');
    await expect(continueWithStudy).toBeVisible();
    await expect(continueWithQuiz).toBeVisible();
    await expect(page.getByTestId('quiz-answer-input')).toHaveCount(0);

    await continueWithQuiz.click();

    // Question 1 of three-branches is seeded as Q15
    // ("There are three branches of government. Why?") with
    // "Checks and balances" among its accepted answers — see
    // src/api/Data/SeedData.cs. Submit that as a known-correct
    // answer so we can assert the green per-question feedback.
    const answerInput = page.getByTestId('quiz-answer-input');
    await expect(answerInput).toBeVisible();
    await answerInput.fill('Checks and balances');
    await page.getByTestId('submit-answer-btn').click();

    const feedback = page.getByTestId('story-quiz-feedback');
    await expect(feedback).toBeVisible();
    // Decision B: per-question feedback. Green panel + "Correct" copy.
    await expect(feedback).toContainText(/Correct/);

    // The first answer was correct; capture the running tally so we can
    // verify the chronological History row matches.
    let correctSoFar = 1;
    let totalAnswered = 1;

    // Walk the remaining questions. For each: type any answer (we type
    // an obviously-wrong sentinel so the tally is deterministic), submit,
    // assert the next feedback panel renders, then advance with Next or
    // See results. The story has 16 comprehension questions per the
    // catalog (questionIds: [15, 16, 17, 18, 19, 21, 22, 23, 24, 25,
    // 29, 36, 41, 50, 52, 53]) but the loop is bounded defensively.
    const wrongAnswer = 'zzzzzz-not-a-real-answer';
    for (let i = 0; i < 50; i++) {
      const seeResults = page.getByTestId('story-quiz-see-results');
      const nextQuestion = page.getByTestId('story-quiz-next-question');
      if (await seeResults.isVisible().catch(() => false)) {
        await seeResults.click();
        break;
      }
      await nextQuestion.click();

      // Next question's input should mount.
      const input = page.getByTestId('quiz-answer-input');
      try {
        await input.waitFor({ state: 'visible', timeout: 5000 });
      } catch {
        // No more inputs — likely the results panel is up. Loop again
        // to let the "See results" branch above terminate cleanly.
        continue;
      }
      await input.fill(wrongAnswer);
      await page.getByTestId('submit-answer-btn').click();
      await expect(page.getByTestId('story-quiz-feedback')).toBeVisible();
      totalAnswered += 1;
      // wrongAnswer never matches, so correctSoFar stays at 1.
    }

    // Decision C: results panel renders with "X out of N correct" and
    // NO PASS/FAIL banner copy.
    const results = page.getByTestId('story-quiz-results');
    await expect(results).toBeVisible();
    await expect(results).toContainText(`${correctSoFar} out of ${totalAnswered} correct`);
    await expect(results.getByText(/^PASS$/)).toHaveCount(0);
    await expect(results.getByText(/^FAIL$/)).toHaveCount(0);
    await expect(results.getByText(/Passed/)).toHaveCount(0);
    await expect(results.getByText(/Failed/)).toHaveCount(0);

    // Story is marked read (no early stop; full run completed).
    const stored = await page.evaluate(() => localStorage.getItem('naturalizationProgress'));
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as {
      readonly storiesRead?: readonly string[];
      readonly storyQuizHistory?: readonly { readonly storySlug: string; readonly correct: number; readonly total: number }[];
    };
    expect(parsed.storiesRead).toContain('three-branches');
    // Decision D: separate storyQuizHistory list captured the run.
    expect(parsed.storyQuizHistory).toBeTruthy();
    const lastEntry = parsed.storyQuizHistory!.find(e => e.storySlug === 'three-branches');
    expect(lastEntry).toBeTruthy();
    expect(lastEntry!.correct).toBe(correctSoFar);
    expect(lastEntry!.total).toBe(totalAnswered);

    // Decision P: Story Comprehension block rendered on /history.
    await page.goto('/history');
    await expect(page.getByRole('heading', { level: 3, name: 'Story Comprehension' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'By Story' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'All Story Attempts' })).toBeVisible();

    // Decision J: per-story title links to /stories/<slug>. Find the
    // per-story row for three-branches and assert its best-score cell
    // matches the just-completed run.
    const perStoryList = page.getByRole('list', { name: /Story comprehension per-story summary/i });
    const perStoryRow = perStoryList.locator('li', { hasText: /Three Branches/i });
    await expect(perStoryRow).toBeVisible();
    await expect(perStoryRow).toContainText(`${correctSoFar}/${totalAnswered}`);
    await expect(perStoryRow.getByRole('link', { name: /Three Branches/i }))
      .toHaveAttribute('href', '/stories/three-branches');

    // Chronological list contains a row for this run with the same score.
    const chronoList = page.getByRole('list', { name: /Story comprehension attempt history/i });
    const chronoRow = chronoList.locator('li', { hasText: /Three Branches/i }).first();
    await expect(chronoRow).toBeVisible();
    await expect(chronoRow).toContainText(`${correctSoFar}/${totalAnswered}`);
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
