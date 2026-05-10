import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { StoryPage } from './StoryPage';
import type { StoryDetailDto } from '../types/api';

vi.mock('../services/storyService', () => ({
  getStory: vi.fn(),
}));

vi.mock('../services/stateService', () => ({
  getStateById: vi.fn().mockResolvedValue(null),
  getAllStates: vi.fn().mockResolvedValue([]),
}));

import { getStory } from '../services/storyService';
import { AppProvider } from '../context/AppContext';

const STORY: StoryDetailDto = {
  slug: 'three-branches',
  title: 'The Three Branches of Government',
  category: 'American Government',
  subCategory: 'System of Government',
  bodyMarkdown: '## Why Three Branches?\n\nThe Constitution divides power [1].',
  sources: [
    { id: 1, title: 'Wiki', url: 'https://en.wikipedia.org/wiki/X', type: 'wikipedia', supportSnippet: 'snip' },
  ],
  estReadMinutes: 5,
  fleschReadingEase: 75,
  modelMemoryUsed: false,
  stateAwarePreamble: true,
  questions: [
    { id: 15, text: 'Why three branches?', category: 'AG', subCategory: 'X',
      is6520Designated: true, tags: [], answers: ['so no branch is too powerful'] },
    { id: 16, text: 'Name the branches', category: 'AG', subCategory: 'X',
      is6520Designated: false, tags: [], answers: ['Executive', 'Legislative', 'Judicial'] },
  ],
};

// Larger fixture used to exercise the "no early stop" rule: even a streak
// of correct answers must not trigger completion before the final question.
const LONG_STORY: StoryDetailDto = {
  ...STORY,
  slug: 'long-story',
  title: 'A Longer Story',
  questions: [
    { id: 100, text: 'Q1?', category: 'AG', subCategory: 'X', is6520Designated: false, tags: [], answers: ['alpha'] },
    { id: 101, text: 'Q2?', category: 'AG', subCategory: 'X', is6520Designated: false, tags: [], answers: ['beta'] },
    { id: 102, text: 'Q3?', category: 'AG', subCategory: 'X', is6520Designated: false, tags: [], answers: ['gamma'] },
    { id: 103, text: 'Q4?', category: 'AG', subCategory: 'X', is6520Designated: false, tags: [], answers: ['delta'] },
    { id: 104, text: 'Q5?', category: 'AG', subCategory: 'X', is6520Designated: false, tags: [], answers: ['epsilon'] },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getStory).mockReset();
});

function renderAt(path: string): ReturnType<typeof render> {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/stories/:slug" element={<StoryPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

function renderAtStrict(path: string): ReturnType<typeof render> {
  return render(
    <StrictMode>
      <AppProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/stories/:slug" element={<StoryPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>
    </StrictMode>
  );
}

function readProgress(): {
  storiesRead?: string[];
  storyQuizHistory?: { id: string; date: string; storySlug: string; storyTitle: string; correct: number; total: number }[];
} {
  const raw = localStorage.getItem('naturalizationProgress');
  return raw ? JSON.parse(raw) : {};
}

describe('StoryPage', () => {
  it('renders the story body, sources, and est read metadata', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: STORY.title })).toBeInTheDocument();
    });
    expect(screen.getByText('Why Three Branches?')).toBeInTheDocument();
    expect(screen.getByText(/~5 min read/)).toBeInTheDocument();
    expect(screen.getByText(/2 comprehension questions/)).toBeInTheDocument();

    // Sources section with the snippet rendered.
    expect(screen.getByRole('heading', { level: 2, name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByText(/snip/)).toBeInTheDocument();
  });

  it('renders the model-memory disclosure ONLY when the flag is true', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: { ...STORY, modelMemoryUsed: true } });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByTestId('model-memory-disclosure')).toBeInTheDocument();
    });
  });

  it('does NOT render the disclosure when modelMemoryUsed is false', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: STORY.title })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('model-memory-disclosure')).toBeNull();
  });

  it('does NOT render the state preamble when no state is selected', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: STORY.title })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('state-preamble')).toBeNull();
  });

  it('shows two CTAs (Continue with Study / Continue with Quiz) and no Start button before the user picks', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByTestId('continue-with-study')).toBeInTheDocument();
    });
    expect(screen.getByTestId('continue-with-quiz')).toBeInTheDocument();

    // Neither CTA is pre-selected (no aria-pressed=true, no auto-progress).
    const studyBtn = screen.getByTestId('continue-with-study');
    const quizBtn = screen.getByTestId('continue-with-quiz');
    expect(studyBtn).not.toHaveAttribute('aria-pressed', 'true');
    expect(quizBtn).not.toHaveAttribute('aria-pressed', 'true');

    // No legacy Start button.
    expect(screen.queryByTestId('start-comprehension-quiz')).toBeNull();
    expect(screen.queryByRole('button', { name: /^start the comprehension quiz/i })).toBeNull();

    // No QuizCard rendered yet (neither study reveal nor typed input).
    expect(screen.queryByTestId('quiz-answer-input')).toBeNull();
    expect(screen.queryByRole('button', { name: /show.*answer/i })).toBeNull();
  });

  it('Continue with Study runs the existing reveal-on-click flow and marks the story read on completion', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByTestId('continue-with-study')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('continue-with-study'));

    // Question 1 of 2 visible.
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show.*answer/i }));
    await user.click(screen.getByRole('button', { name: /next.*question/i }));

    // Question 2 of 2.
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show.*answer/i }));
    await user.click(screen.getByRole('button', { name: /next.*question/i }));

    // Done state, story marked read.
    expect(screen.getByTestId('story-quiz-done')).toBeInTheDocument();
    const stored = readProgress();
    expect(stored.storiesRead).toContain('three-branches');
    // Study mode never writes to storyQuizHistory.
    expect(stored.storyQuizHistory ?? []).toHaveLength(0);
  });

  it('rapid double-click on study-mode Next does not skip a question', async () => {
    // Audit-whole-file regression: handleStudyNext must be idempotent for the
    // same reason handleSubmit and handleNextOrResults are. Two rapid clicks
    // on study-mode "Next Question" used to advance index by 2, skipping a
    // question and triggering done(study) without the user completing every
    // question.
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-study'));
    await user.click(screen.getByTestId('continue-with-study'));

    // Q1: reveal then double-click Next.
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show.*answer/i }));
    const nextBtn = screen.getByRole('button', { name: /next.*question/i });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);

    // Must land on Q2 (not the done banner).
    await waitFor(() => {
      expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('story-quiz-done')).toBeNull();
  });

  it('Continue with Quiz renders QuizCard in typed mode (quiz-answer-input present)', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => {
      expect(screen.getByTestId('continue-with-quiz')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('continue-with-quiz'));

    expect(screen.getByTestId('quiz-answer-input')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show.*answer/i })).toBeNull();
  });

  it('correct typed answer renders green per-question feedback with accepted answers; Next advances', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    await user.click(screen.getByTestId('submit-answer-btn'));

    const feedback = await screen.findByTestId('story-quiz-feedback');
    expect(feedback).toHaveTextContent(/correct/i);
    expect(feedback.className).toMatch(/green/);
    expect(feedback).toHaveTextContent(/so no branch is too powerful/i);

    await user.click(screen.getByTestId('story-quiz-next-question'));
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    expect(screen.queryByTestId('story-quiz-feedback')).toBeNull();
  });

  it('wrong typed answer renders red feedback with accepted answers; Next still advances', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'something completely unrelated');
    await user.click(screen.getByTestId('submit-answer-btn'));

    const feedback = await screen.findByTestId('story-quiz-feedback');
    expect(feedback).toHaveTextContent(/not quite/i);
    expect(feedback.className).toMatch(/red/);
    expect(feedback).toHaveTextContent(/so no branch is too powerful/i);
    await user.click(screen.getByTestId('story-quiz-next-question'));
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
  });

  it('rapid double-click on Submit (typed mode) records only one answer for the current question', async () => {
    // Regression for Copilot review on PR #86: handleSubmit must be idempotent
    // per question. A double-click on Submit before the UI rerenders out of
    // 'answering' phase used to inflate answers.length / skew scoring.
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    // Q1: rapid double-click on Submit (fireEvent.click does NOT await
    // re-render between clicks, so both event handlers see the same
    // 'answering' state — the same race the bug allowed).
    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    const submitBtn = screen.getByTestId('submit-answer-btn');
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    // Feedback panel renders for Q1 with the first submitted answer.
    const feedback = await screen.findByTestId('story-quiz-feedback');
    expect(feedback).toHaveTextContent(/correct/i);

    // Advance to Q2 — if the bug were present, the second submit would have
    // pushed answers.length to 2 while still on Q1, causing Next to skip
    // past Q2 directly to the results panel. Asserting we land on Q2 proves
    // the second submit was a no-op.
    await user.click(screen.getByTestId('story-quiz-next-question'));
    expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    expect(screen.queryByTestId('story-quiz-results')).toBeNull();

    // Walk Q2 to results and assert the final tally matches a 2-question
    // story (NOT 3 entries from the would-be duplicate).
    await user.type(screen.getByTestId('quiz-answer-input'), 'wrong');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-see-results'));
    const results = await screen.findByTestId('story-quiz-results');
    expect(results).toHaveTextContent(/1 out of 2 correct/i);
  });

  it('rapid double-click on Next question (typed mode) does not skip a question', async () => {
    // Audit-whole-file regression: handleNextOrResults must be idempotent
    // for the same reason handleSubmit is. Two rapid clicks on Next used to
    // bump index by 2 (skipping Q2) and trigger the done-effect with an
    // incomplete answers array.
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    // Q1: answer once normally, then enter feedback.
    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await screen.findByTestId('story-quiz-feedback');

    // Rapid double-click on "Next question" — both events queue setIndex
    // updates against the same closure. With the guard, only the first
    // increments; without it, index would jump 0 → 2 and trigger done.
    const nextBtn = screen.getByTestId('story-quiz-next-question');
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);

    // We must land on Q2 (not the results panel).
    await waitFor(() => {
      expect(screen.getByText(/Question 2 of 2/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('story-quiz-results')).toBeNull();
  });

  it('reaching the end of typed quiz shows results panel with X out of N, per-question review, and Try again', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    // Q1: correct
    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-next-question'));

    // Q2 (last): wrong → button reads "See results"
    await user.type(screen.getByTestId('quiz-answer-input'), 'wrong-answer');
    await user.click(screen.getByTestId('submit-answer-btn'));
    expect(screen.getByTestId('story-quiz-see-results')).toBeInTheDocument();
    await user.click(screen.getByTestId('story-quiz-see-results'));

    const results = await screen.findByTestId('story-quiz-results');
    expect(results).toHaveTextContent(/1 out of 2 correct/i);
    expect(screen.getByTestId('story-quiz-try-again')).toBeInTheDocument();
    expect(screen.getAllByTestId('story-review-correct')).toHaveLength(1);
    expect(screen.getAllByTestId('story-review-incorrect')).toHaveLength(1);

    // Story is marked read AND a single quiz history entry persisted.
    const stored = readProgress();
    expect(stored.storiesRead).toContain('three-branches');
    expect(stored.storyQuizHistory).toHaveLength(1);
    expect(stored.storyQuizHistory![0]).toMatchObject({
      storySlug: 'three-branches',
      storyTitle: STORY.title,
      correct: 1,
      total: 2,
    });
    expect(typeof stored.storyQuizHistory![0].id).toBe('string');
    expect(stored.storyQuizHistory![0].id.length).toBeGreaterThan(0);
    expect(typeof stored.storyQuizHistory![0].date).toBe('string');
  });

  it('typed-mode results contain NO PASS/FAIL banner or threshold language', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    // Mixed results: correct + wrong.
    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-next-question'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'no idea');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-see-results'));

    const results = await screen.findByTestId('story-quiz-results');
    const text = results.textContent ?? '';
    expect(text).not.toMatch(/\bPASS(?:ED)?\b/i);
    expect(text).not.toMatch(/\bFAIL(?:ED)?\b/i);
    expect(text).not.toMatch(/to pass/i);
    expect(text).not.toMatch(/needed to pass/i);
    expect(text).not.toMatch(/threshold/i);
  });

  it('does not stop early in typed mode, even on a streak of correct answers (only the final question completes the quiz)', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: LONG_STORY });
    const user = userEvent.setup();

    renderAt('/stories/long-story');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    const answers = ['alpha', 'beta', 'gamma', 'delta']; // first 4 correct, 5th still pending
    for (let i = 0; i < answers.length; i++) {
      await user.type(screen.getByTestId('quiz-answer-input'), answers[i]);
      await user.click(screen.getByTestId('submit-answer-btn'));
      // Per-question feedback shows; results panel must NOT appear yet.
      await screen.findByTestId('story-quiz-feedback');
      expect(screen.queryByTestId('story-quiz-results')).toBeNull();
      // Button label is still "Next question" (not "See results") for non-final.
      expect(screen.getByTestId('story-quiz-next-question')).toBeInTheDocument();
      await user.click(screen.getByTestId('story-quiz-next-question'));
    }

    // Now on Q5, the final question.
    expect(screen.getByText(/Question 5 of 5/)).toBeInTheDocument();
    expect(screen.queryByTestId('story-quiz-results')).toBeNull();

    // Persistence side effects must NOT fire until after the final question's submission.
    expect(readProgress().storyQuizHistory ?? []).toHaveLength(0);
    expect(readProgress().storiesRead ?? []).not.toContain('long-story');

    await user.type(screen.getByTestId('quiz-answer-input'), 'epsilon');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-see-results'));

    const results = await screen.findByTestId('story-quiz-results');
    expect(results).toHaveTextContent(/5 out of 5 correct/i);
    const stored = readProgress();
    expect(stored.storyQuizHistory).toHaveLength(1);
    expect(stored.storyQuizHistory![0]).toMatchObject({ storySlug: 'long-story', correct: 5, total: 5 });
  });

  it('Try again returns to the two-CTA choice screen with state cleared', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'wrong');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-next-question'));
    await user.type(screen.getByTestId('quiz-answer-input'), 'wrong');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-see-results'));

    await user.click(screen.getByTestId('story-quiz-try-again'));

    // Back to choice screen.
    expect(screen.getByTestId('continue-with-study')).toBeInTheDocument();
    expect(screen.getByTestId('continue-with-quiz')).toBeInTheDocument();
    expect(screen.queryByTestId('story-quiz-results')).toBeNull();
    expect(screen.queryByTestId('story-quiz-feedback')).toBeNull();
    expect(screen.queryByTestId('quiz-answer-input')).toBeNull();

    // Picking quiz again starts over from Question 1 with a clean review list.
    await user.click(screen.getByTestId('continue-with-quiz'));
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByTestId('story-review-correct')).toBeNull();
    expect(screen.queryByTestId('story-review-incorrect')).toBeNull();
  });

  it('typed-mode completion under <StrictMode> writes exactly one storyQuizHistory entry and one storiesRead entry', async () => {
    // StrictMode mounts/unmounts/re-mounts in development, so useFetch's
    // effect can fire more than once. mockResolvedValue (not Once) keeps
    // returning the same payload for any extra calls.
    vi.mocked(getStory).mockResolvedValue({ success: true, data: STORY });
    const user = userEvent.setup();

    renderAtStrict('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'so no branch is too powerful');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-next-question'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'Executive Legislative Judicial');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-see-results'));

    await screen.findByTestId('story-quiz-results');

    const stored = readProgress();
    expect(stored.storiesRead).toEqual(['three-branches']);
    expect(stored.storyQuizHistory).toHaveLength(1);
    expect(stored.storyQuizHistory![0]).toMatchObject({
      storySlug: 'three-branches',
      storyTitle: STORY.title,
      correct: 2,
      total: 2,
    });
    expect(stored.storyQuizHistory![0].id).toBeTruthy();
  });

  it('mid-quiz abandonment in TYPED mode (unmount before See results) writes nothing and does NOT mark the story read', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: LONG_STORY });
    const user = userEvent.setup();

    const { unmount } = renderAt('/stories/long-story');
    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'alpha');
    await user.click(screen.getByTestId('submit-answer-btn'));
    await user.click(screen.getByTestId('story-quiz-next-question'));

    await user.type(screen.getByTestId('quiz-answer-input'), 'beta');
    await user.click(screen.getByTestId('submit-answer-btn'));
    // We are now on feedback for Q2 of 5; user walks away.

    unmount();

    const stored = readProgress();
    expect(stored.storyQuizHistory ?? []).toHaveLength(0);
    expect(stored.storiesRead ?? []).not.toContain('long-story');
  });

  it('mid-quiz abandonment in TYPED mode via route navigation writes nothing and does NOT mark the story read', async () => {
    vi.mocked(getStory)
      .mockResolvedValueOnce({ success: true, data: LONG_STORY })
      .mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    function NavTo({ to }: { readonly to: string }): React.ReactNode {
      const navigate = useNavigate();
      return (
        <button type="button" data-testid="nav-elsewhere" onClick={() => navigate(to)}>
          go
        </button>
      );
    }

    render(
      <AppProvider>
        <MemoryRouter initialEntries={['/stories/long-story']}>
          <Routes>
            <Route path="/stories/:slug" element={<StoryPage />} />
          </Routes>
          <NavTo to="/stories/three-branches" />
        </MemoryRouter>
      </AppProvider>
    );

    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    await user.click(screen.getByTestId('continue-with-quiz'));
    await user.type(screen.getByTestId('quiz-answer-input'), 'alpha');
    await user.click(screen.getByTestId('submit-answer-btn'));

    await user.click(screen.getByTestId('nav-elsewhere'));

    await waitFor(() => screen.getByTestId('continue-with-quiz'));
    const stored = readProgress();
    expect(stored.storyQuizHistory ?? []).toHaveLength(0);
    expect(stored.storiesRead ?? []).not.toContain('long-story');
  });

  it('mid-quiz abandonment in STUDY mode (started but not completed) does NOT mark the story read', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: true, data: STORY });
    const user = userEvent.setup();

    const { unmount } = renderAt('/stories/three-branches');
    await waitFor(() => screen.getByTestId('continue-with-study'));
    await user.click(screen.getByTestId('continue-with-study'));

    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show.*answer/i }));
    // User walks away after Q1's reveal but before clicking through Q2.

    unmount();

    const stored = readProgress();
    expect(stored.storiesRead ?? []).not.toContain('three-branches');
    expect(stored.storyQuizHistory ?? []).toHaveLength(0);
  });

  it('shows a not-found message when the slug is unknown', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: false, error: '404: Not Found' });
    renderAt('/stories/unknown-slug');

    await waitFor(() => {
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    });
  });

  it('does NOT keep stale story content visible after a failed re-fetch (navigation A -> unknown)', async () => {
    // Final-diff Copilot review fix (round 9): the previous test for this
    // contract just rendered an unknown slug at mount and asserted the
    // not-found UI — that didn't actually exercise the
    // 'previous-fetch-success-then-failure' path, because nothing had been
    // successfully loaded first.
    //
    // This test simulates real navigation: render '/stories/story-a', let
    // it resolve to a real STORY, then click a button that navigates to
    // '/stories/unknown' which resolves to null. With the StoryPage error
    // guard, the not-found state must replace the previous title cleanly.
    const A: StoryDetailDto = { ...STORY, slug: 'story-a', title: 'Story A Title' };
    vi.mocked(getStory)
      .mockResolvedValueOnce({ success: true, data: A })      // load /stories/story-a
      .mockResolvedValueOnce({ success: false, error: '404: Not Found' });  // navigate to /stories/unknown

    function NavTo({ to }: { readonly to: string }): React.ReactNode {
      const navigate = useNavigate();
      return (
        <button type="button" data-testid="navigate-button" onClick={() => navigate(to)}>
          go
        </button>
      );
    }

    const user = userEvent.setup();
    render(
      <AppProvider>
        <MemoryRouter initialEntries={['/stories/story-a']}>
          <Routes>
            <Route path="/stories/:slug" element={<StoryPage />} />
          </Routes>
          <NavTo to="/stories/unknown" />
        </MemoryRouter>
      </AppProvider>
    );

    // Story A loads successfully.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Story A Title' })).toBeInTheDocument();
    });

    // Navigate to an unknown slug.
    await user.click(screen.getByTestId('navigate-button'));

    // The not-found UI replaces the previous title cleanly.
    await waitFor(() => {
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { level: 1, name: 'Story A Title' })).toBeNull();
  });

  it('shows not-found cleanly when the very first fetch fails', async () => {
    vi.mocked(getStory).mockResolvedValueOnce({ success: false, error: '404: Not Found' });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    });
  });

  it('renders source URLs as plain text when the protocol is unsafe (defense in depth)', async () => {
    // Final-diff review fix #1: server validates source URLs at parse time, but the
    // client adds a defensive isSafeSourceUrl() guard so a future regression in
    // the parser cannot turn the source list into an XSS vector.
    vi.mocked(getStory).mockResolvedValueOnce({
      success: true,
      data: {
        ...STORY,
        sources: [
          { id: 1, title: 'Bad Source', url: 'javascript:alert(1)', type: 'wikipedia', supportSnippet: 'snip' },
          { id: 2, title: 'Good Source', url: 'https://en.wikipedia.org/wiki/Test', type: 'wikipedia', supportSnippet: 'snip' },
        ],
      },
    });
    const { container } = renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Sources' })).toBeInTheDocument();
    });

    // Bad source: rendered as plain text via the data-testid sentinel; no anchor for it.
    expect(screen.getByTestId('source-url-blocked-1')).toBeInTheDocument();
    expect(container.querySelector('a[href="javascript:alert(1)"]')).toBeNull();

    // Good source still renders as a real anchor.
    expect(container.querySelector('a[href="https://en.wikipedia.org/wiki/Test"]')).not.toBeNull();
  });
});
