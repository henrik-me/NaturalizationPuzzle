import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { HistoryPage } from './HistoryPage';
import type { QuizHistoryEntry, StoryQuizHistoryEntry } from '../hooks/useProgress';

function seedHistory(entries: QuizHistoryEntry[]): void {
  localStorage.setItem(
    'naturalizationProgress',
    JSON.stringify({ studiedQuestionIds: [1, 2, 3], quizHistory: entries }),
  );
}

function seedAll(opts: {
  quiz?: QuizHistoryEntry[];
  stories?: StoryQuizHistoryEntry[];
}): void {
  localStorage.setItem(
    'naturalizationProgress',
    JSON.stringify({
      studiedQuestionIds: [1, 2, 3],
      quizHistory: opts.quiz ?? [],
      storiesRead: [],
      storyQuizHistory: opts.stories ?? [],
    }),
  );
}

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  );
}

describe('HistoryPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows empty state when no quizzes have been taken', () => {
    renderPage();

    expect(screen.getByText("You haven't taken any quizzes yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a Quiz' })).toHaveAttribute('href', '/quiz');
  });

  it('renders quiz history entries', () => {
    seedHistory([
      { date: '2026-02-20T14:00:00.000Z', mode: 'standard', correct: 15, total: 20, passed: true },
      { date: '2026-02-21T10:00:00.000Z', mode: '6520', correct: 4, total: 8, passed: false },
    ]);

    renderPage();

    const list = screen.getByRole('list', { name: 'Quiz attempt history' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('4/8');
    expect(items[1]).toHaveTextContent('15/20');
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('65/20')).toBeInTheDocument();
    expect(screen.getByText('✓ Pass')).toBeInTheDocument();
    expect(screen.getByText('✗ Fail')).toBeInTheDocument();
  });

  it('displays newest entries first', () => {
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 10, total: 20, passed: false },
      { date: '2026-02-01T00:00:00.000Z', mode: 'standard', correct: 15, total: 20, passed: true },
    ]);

    renderPage();

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('15/20');
    expect(items[1]).toHaveTextContent('10/20');
  });

  it('computes and displays summary statistics', () => {
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
      { date: '2026-01-02T00:00:00.000Z', mode: 'standard', correct: 8, total: 20, passed: false },
      { date: '2026-01-03T00:00:00.000Z', mode: '6520', correct: 7, total: 10, passed: true },
    ]);

    renderPage();

    const statsSection = screen.getByRole('heading', { name: 'Summary' }).closest('section')!;
    const stats = within(statsSection);
    expect(stats.getByText('3')).toBeInTheDocument(); // total quizzes
    expect(stats.getByText('67%')).toBeInTheDocument(); // pass rate (2/3)
    expect(stats.getByText('14/20')).toBeInTheDocument(); // best score (70%)
    expect(stats.getByText('1')).toBeInTheDocument(); // current streak
  });

  it('shows confirmation dialog before clearing history', async () => {
    const user = userEvent.setup();
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
    ]);

    renderPage();

    await user.click(screen.getByText('Clear quiz history'));

    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    expect(screen.getByText('Yes, clear history')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('cancels clearing when Cancel is clicked', async () => {
    const user = userEvent.setup();
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
    ]);

    renderPage();

    await user.click(screen.getByText('Clear quiz history'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/Are you sure/)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Quiz attempt history' })).toBeInTheDocument();
  });

  it('clears history and shows empty state when confirmed', async () => {
    const user = userEvent.setup();
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
    ]);

    renderPage();

    await user.click(screen.getByText('Clear quiz history'));
    await user.click(screen.getByText('Yes, clear history'));

    expect(screen.getByText("You haven't taken any quizzes yet.")).toBeInTheDocument();

    // Verify studiedQuestionIds are preserved
    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.studiedQuestionIds).toEqual([1, 2, 3]);
    expect(stored.quizHistory).toEqual([]);
  });

  it('has accessible pass/fail labels', () => {
    seedHistory([
      { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
      { date: '2026-01-02T00:00:00.000Z', mode: 'standard', correct: 8, total: 20, passed: false },
    ]);

    renderPage();

    expect(screen.getByLabelText('Passed')).toBeInTheDocument();
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
  });
});

describe('HistoryPage Story Comprehension block', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function story(overrides: Partial<StoryQuizHistoryEntry>): StoryQuizHistoryEntry {
    return {
      id: 'sid-1',
      date: '2026-01-01T00:00:00.000Z',
      storySlug: 'three-branches',
      storyTitle: 'Three Branches',
      correct: 3,
      total: 4,
      ...overrides,
    };
  }

  it('does not render the Story Comprehension section when storyQuizHistory is empty', () => {
    seedAll({
      quiz: [
        { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
      ],
      stories: [],
    });
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Story Comprehension' })).not.toBeInTheDocument();
  });

  it('renders the Story Comprehension section AFTER the All Attempts section in DOM order', () => {
    seedAll({
      quiz: [
        { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
      ],
      stories: [story({ id: 's1' })],
    });
    renderPage();

    const allAttempts = screen.getByRole('heading', { name: 'All Attempts' });
    const storyHeading = screen.getByRole('heading', { name: 'Story Comprehension' });
    expect(allAttempts.compareDocumentPosition(storyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders Total Attempts and rounded integer Average Score', () => {
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'a', correct: 1, total: 2, date: '2026-01-01T00:00:00.000Z' }),
        story({ id: 's2', storySlug: 'b', correct: 4, total: 4, date: '2026-01-02T00:00:00.000Z' }),
      ],
    });
    renderPage();

    const summary = screen
      .getByRole('heading', { name: 'Story Comprehension', level: 3 })
      .closest('section')!;
    const stats = within(summary);
    expect(stats.getByText('Total Attempts').previousElementSibling).toHaveTextContent('2');
    // 1/2 + 4/4 → mean of percentages = 75 (NOT 5/6 ≈ 83)
    expect(stats.getByText('Average Score').previousElementSibling).toHaveTextContent('75%');
  });

  it('renders per-story rows sorted by lastAttemptAt desc, with story title as a link to /stories/<slug>', () => {
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'alpha', storyTitle: 'Alpha', date: '2026-01-01T00:00:00.000Z' }),
        story({ id: 's2', storySlug: 'beta',  storyTitle: 'Beta',  date: '2026-03-01T00:00:00.000Z' }),
        story({ id: 's3', storySlug: 'gamma', storyTitle: 'Gamma', date: '2026-02-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    const list = screen.getByRole('list', { name: 'Story comprehension per-story summary' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('link', { name: 'Beta' })).toHaveAttribute('href', '/stories/beta');
    expect(within(items[1]).getByRole('link', { name: 'Gamma' })).toHaveAttribute('href', '/stories/gamma');
    expect(within(items[2]).getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/stories/alpha');
  });

  it('breaks per-story ties on identical lastAttemptAt by storySlug ascending', () => {
    const sameDate = '2026-01-01T00:00:00.000Z';
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'banana', storyTitle: 'Banana', date: sameDate }),
        story({ id: 's2', storySlug: 'apple',  storyTitle: 'Apple',  date: sameDate }),
        story({ id: 's3', storySlug: 'cherry', storyTitle: 'Cherry', date: sameDate }),
      ],
    });
    renderPage();

    const list = screen.getByRole('list', { name: 'Story comprehension per-story summary' });
    const titles = within(list).getAllByRole('listitem').map(li => within(li).getByRole('link').textContent);
    expect(titles).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('renders chronological list sorted by date desc at render time, ignoring persisted array order', () => {
    seedAll({
      stories: [
        // Persisted out-of-order on purpose
        story({ id: 's-mid', storySlug: 'mid', storyTitle: 'Mid', date: '2026-02-01T00:00:00.000Z' }),
        story({ id: 's-old', storySlug: 'old', storyTitle: 'Old', date: '2026-01-01T00:00:00.000Z' }),
        story({ id: 's-new', storySlug: 'new', storyTitle: 'New', date: '2026-03-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    const list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('link').textContent).toBe('New');
    expect(within(items[1]).getByRole('link').textContent).toBe('Mid');
    expect(within(items[2]).getByRole('link').textContent).toBe('Old');
    // Each chronological row links to /stories/<slug>
    expect(within(items[0]).getByRole('link')).toHaveAttribute('href', '/stories/new');
    expect(within(items[1]).getByRole('link')).toHaveAttribute('href', '/stories/mid');
    expect(within(items[2]).getByRole('link')).toHaveAttribute('href', '/stories/old');
  });

  it('renders the × delete button as the trailing element in each chronological row', () => {
    seedAll({
      stories: [story({ id: 's1', storyTitle: 'T', storySlug: 'sl' })],
    });
    renderPage();

    const list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    const item = within(list).getAllByRole('listitem')[0];
    const deleteBtn = within(item).getByRole('button', { name: /^Delete attempt for T/ });
    // The × button should be the last interactive button in the row.
    const buttons = within(item).getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBe(deleteBtn);
  });

  it('clicking × removes the entry and shows the undo banner', async () => {
    const user = userEvent.setup();
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'a', storyTitle: 'A', date: '2026-02-01T00:00:00.000Z' }),
        story({ id: 's2', storySlug: 'b', storyTitle: 'B', date: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    await user.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));

    const list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('undo-banner')).toHaveTextContent('Entry deleted.');
    expect(screen.getByTestId('undo-banner')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('undo-banner')).toHaveAttribute('aria-live', 'polite');
  });

  it('clicking Undo within the window restores a non-latest entry at its date-sorted position', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [
        story({ id: 'newest', storySlug: 'new', storyTitle: 'New', date: '2026-03-01T00:00:00.000Z' }),
        story({ id: 'middle', storySlug: 'mid', storyTitle: 'Mid', date: '2026-02-01T00:00:00.000Z' }),
        story({ id: 'oldest', storySlug: 'old', storyTitle: 'Old', date: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    // Delete the MIDDLE (non-latest) entry.
    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for Mid/ }));

    let list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    let items = within(list).getAllByRole('listitem');
    expect(items.map(li => within(li).getByRole('link').textContent)).toEqual(['New', 'Old']);

    // Undo within the 7s window.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    items = within(list).getAllByRole('listitem');
    expect(items.map(li => within(li).getByRole('link').textContent)).toEqual(['New', 'Mid', 'Old']);
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('after the 7s undo window expires, the entry stays gone and the banner disappears', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'a', storyTitle: 'A', date: '2026-02-01T00:00:00.000Z' }),
        story({ id: 's2', storySlug: 'b', storyTitle: 'B', date: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));
    expect(screen.getByTestId('undo-banner')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7100);
    });

    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('link').textContent).toBe('B');

    vi.useRealTimers();
  });

  it('clears the undo timer on unmount (no late state updates) and the deletion remains final', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [story({ id: 's1', storySlug: 'a', storyTitle: 'A' })],
    });
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));
    const callsBefore = clearSpy.mock.calls.length;

    unmount();
    expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBefore);

    // Advance past the 7s window — there should be no errors and no late state writes.
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    // Re-mount: the deletion is final (entry stays gone).
    renderPage();
    expect(screen.getByText("You haven't taken any quizzes yet.")).toBeInTheDocument();

    clearSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cancels the undo when the user navigates to a different route', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [story({ id: 's1', storySlug: 'a', storyTitle: 'A' })],
    });

    function NavButton(): React.ReactElement {
      const navigate = useNavigate();
      return (
        <button onClick={() => navigate('/elsewhere')}>go-elsewhere</button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <HistoryPage />
                <NavButton />
              </>
            }
          />
          <Route path="/elsewhere" element={<div>Other page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));
    expect(screen.getByTestId('undo-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-elsewhere' }));
    expect(screen.getByText('Other page')).toBeInTheDocument();

    // Even after the window elapses, returning to the page shows deletion is final.
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    // Re-render the page fresh; deletion is persisted, no auto-restore.
    renderPage();
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Story comprehension attempt history' })).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('rapid deletions: only the most-recently deleted entry is undoable; the earlier deletion stays gone', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [
        story({ id: 's-a', storySlug: 'a', storyTitle: 'A', date: '2026-03-01T00:00:00.000Z' }),
        story({ id: 's-b', storySlug: 'b', storyTitle: 'B', date: '2026-02-01T00:00:00.000Z' }),
        story({ id: 's-c', storySlug: 'c', storyTitle: 'C', date: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for B/ }));

    // Banner now offers undo for B (most recent deletion).
    expect(screen.getByTestId('undo-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    const list = screen.getByRole('list', { name: 'Story comprehension attempt history' });
    const titles = within(list).getAllByRole('listitem').map(li => within(li).getByRole('link').textContent);
    // A stays deleted; B restored; C still present.
    expect(titles).toEqual(['B', 'C']);

    // Advance past where A's original timer would have fired — should be a no-op (already cleared).
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('clearing story history during a pending undo cancels the undo and removes everything', () => {
    vi.useFakeTimers();
    seedAll({
      stories: [
        story({ id: 's1', storySlug: 'a', storyTitle: 'A' }),
        story({ id: 's2', storySlug: 'b', storyTitle: 'B' }),
      ],
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /^Delete attempt for A/ }));
    expect(screen.getByTestId('undo-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear story comprehension history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear story history' }));

    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Story comprehension attempt history' })).not.toBeInTheDocument();

    // Advance past the original window — banner must NOT reappear.
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByTestId('undo-banner')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('Clear story comprehension history clears only storyQuizHistory; quizHistory is untouched', async () => {
    const user = userEvent.setup();
    seedAll({
      quiz: [
        { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 14, total: 20, passed: true },
      ],
      stories: [story({ id: 's1' })],
    });
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Clear story comprehension history' }));
    await user.click(screen.getByRole('button', { name: 'Yes, clear story history' }));

    expect(screen.queryByRole('heading', { name: 'Story Comprehension' })).not.toBeInTheDocument();
    // Original quiz history is still rendered.
    const list = screen.getByRole('list', { name: 'Quiz attempt history' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.storyQuizHistory).toEqual([]);
    expect(stored.quizHistory).toHaveLength(1);
  });

  it('summary stats (Quizzes Taken / Pass Rate / Best Score / Pass Streak) are computed only from quizHistory', () => {
    seedAll({
      quiz: [
        { date: '2026-01-01T00:00:00.000Z', mode: 'standard', correct: 18, total: 20, passed: true },
        { date: '2026-01-02T00:00:00.000Z', mode: 'standard', correct: 5, total: 20, passed: false },
      ],
      stories: [
        // Story attempts must NOT influence the per-quiz summary panel.
        story({ id: 's1', correct: 4, total: 4 }),
        story({ id: 's2', correct: 4, total: 4 }),
      ],
    });
    renderPage();

    const summary = screen.getByRole('heading', { name: 'Summary', level: 3 }).closest('section')!;
    const stats = within(summary);
    expect(stats.getByText('Quizzes Taken').previousElementSibling).toHaveTextContent('2');
    expect(stats.getByText('Pass Rate').previousElementSibling).toHaveTextContent('50%');
    expect(stats.getByText('Best Score').previousElementSibling).toHaveTextContent('18/20');
  });

  it('page-level empty state shows only when both quizHistory and storyQuizHistory are empty', () => {
    // Story-only state should NOT show the empty placeholder.
    seedAll({ stories: [story({ id: 's1' })] });
    const { unmount } = renderPage();
    expect(screen.queryByText("You haven't taken any quizzes yet.")).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Story Comprehension' })).toBeInTheDocument();
    unmount();

    // Both empty → empty state shows.
    localStorage.clear();
    renderPage();
    expect(screen.getByText("You haven't taken any quizzes yet.")).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
