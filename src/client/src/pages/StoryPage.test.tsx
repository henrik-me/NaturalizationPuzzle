import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
  readingLevelFleschKincaid: 75,
  modelMemoryUsed: false,
  stateAwarePreamble: true,
  questions: [
    { id: 15, text: 'Why three branches?', category: 'AG', subCategory: 'X',
      is6520Designated: true, tags: [], answers: ['so no branch is too powerful'] },
    { id: 16, text: 'Name the branches', category: 'AG', subCategory: 'X',
      is6520Designated: false, tags: [], answers: ['Executive', 'Legislative', 'Judicial'] },
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

describe('StoryPage', () => {
  it('renders the story body, sources, and est read metadata', async () => {
    vi.mocked(getStory).mockResolvedValueOnce(STORY);
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
    vi.mocked(getStory).mockResolvedValueOnce({ ...STORY, modelMemoryUsed: true });
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByTestId('model-memory-disclosure')).toBeInTheDocument();
    });
  });

  it('does NOT render the disclosure when modelMemoryUsed is false', async () => {
    vi.mocked(getStory).mockResolvedValueOnce(STORY);
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: STORY.title })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('model-memory-disclosure')).toBeNull();
  });

  it('does NOT render the state preamble when no state is selected', async () => {
    vi.mocked(getStory).mockResolvedValueOnce(STORY);
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: STORY.title })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('state-preamble')).toBeNull();
  });

  it('starts the comprehension quiz, hands off to QuizCard, and marks read on completion', async () => {
    vi.mocked(getStory).mockResolvedValueOnce(STORY);
    const user = userEvent.setup();

    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByTestId('start-comprehension-quiz')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('start-comprehension-quiz'));

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
    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.storiesRead).toContain('three-branches');
  });

  it('shows a not-found message when the slug is unknown', async () => {
    vi.mocked(getStory).mockResolvedValueOnce(null);
    renderAt('/stories/unknown-slug');

    await waitFor(() => {
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    });
  });

  it('does NOT keep stale story content visible after a failed re-fetch', async () => {
    // Final-diff Copilot review fix: useFetch caches the previous successful
    // `data`. Without the error guard in StoryPage, navigating from a known
    // story to an unknown slug would leave the previous title visible.
    // Verify the fresh component sees the not-found state cleanly.
    vi.mocked(getStory).mockResolvedValueOnce(null);
    renderAt('/stories/three-branches');

    await waitFor(() => {
      expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
    });
    // The previous title must NOT appear from a cached useFetch data slot.
    expect(screen.queryByRole('heading', { level: 1, name: STORY.title })).toBeNull();
  });

  it('renders source URLs as plain text when the protocol is unsafe (defense in depth)', async () => {
    // Final-diff review fix #1: server validates source URLs at parse time, but the
    // client adds a defensive isSafeSourceUrl() guard so a future regression in
    // the parser cannot turn the source list into an XSS vector.
    vi.mocked(getStory).mockResolvedValueOnce({
      ...STORY,
      sources: [
        { id: 1, title: 'Bad Source', url: 'javascript:alert(1)', type: 'wikipedia', supportSnippet: 'snip' },
        { id: 2, title: 'Good Source', url: 'https://en.wikipedia.org/wiki/Test', type: 'wikipedia', supportSnippet: 'snip' },
      ],
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
