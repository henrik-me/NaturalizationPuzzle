import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StoriesPage } from './StoriesPage';
import type { StoryListItemDto } from '../types/api';

vi.mock('../services/storyService', () => ({
  listStories: vi.fn(),
}));

import { listStories } from '../services/storyService';

const PILOT: readonly StoryListItemDto[] = [
  { slug: 'three-branches', title: 'The Three Branches of Government',
    category: 'American Government', subCategory: 'System of Government',
    estReadMinutes: 5, readingLevelFleschKincaid: 75, questionCount: 16,
    modelMemoryUsed: false, stateAwarePreamble: true },
  { slug: 'civil-war-and-reconstruction', title: 'The Civil War and Reconstruction',
    category: 'American History', subCategory: 'The 1800s',
    estReadMinutes: 4, readingLevelFleschKincaid: 80, questionCount: 8,
    modelMemoryUsed: false, stateAwarePreamble: false },
  { slug: 'national-symbols-and-holidays', title: 'National Symbols and Holidays',
    category: 'Integrated Civics', subCategory: 'Symbols and Holidays',
    estReadMinutes: 3, readingLevelFleschKincaid: 85, questionCount: 8,
    modelMemoryUsed: false, stateAwarePreamble: false },
];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(listStories).mockReset();
});

describe('StoriesPage', () => {
  it('shows a loading state, then groups cards by category', async () => {
    vi.mocked(listStories).mockResolvedValueOnce(PILOT);

    render(<MemoryRouter><StoriesPage /></MemoryRouter>);

    expect(screen.getByText(/Loading stories/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'American Government' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'American History' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Integrated Civics' })).toBeInTheDocument();
    });

    expect(screen.getByTestId('story-card-three-branches')).toBeInTheDocument();
    expect(screen.getByTestId('story-card-civil-war-and-reconstruction')).toBeInTheDocument();
    expect(screen.getByTestId('story-card-national-symbols-and-holidays')).toBeInTheDocument();
  });

  it('renders an X-of-N progress count that reflects useProgress', async () => {
    localStorage.setItem('naturalizationProgress', JSON.stringify({
      studiedQuestionIds: [],
      quizHistory: [],
      storiesRead: ['three-branches'],
    }));
    vi.mocked(listStories).mockResolvedValueOnce(PILOT);

    render(<MemoryRouter><StoriesPage /></MemoryRouter>);

    await waitFor(() => {
      const progress = screen.getByTestId('stories-progress');
      expect(progress).toHaveTextContent('1 of 3 stories read');
      // Final-diff Copilot review fix: the line previously rendered a
      // dangling '— ' followed only by an sr-only span; verify that's gone.
      expect(progress.textContent?.endsWith('—')).toBe(false);
      expect(progress.textContent?.endsWith('— ')).toBe(false);
    });
  });

  it('shows a Read badge on stories that have been read', async () => {
    localStorage.setItem('naturalizationProgress', JSON.stringify({
      studiedQuestionIds: [],
      quizHistory: [],
      storiesRead: ['three-branches'],
    }));
    vi.mocked(listStories).mockResolvedValueOnce(PILOT);

    render(<MemoryRouter><StoriesPage /></MemoryRouter>);

    await waitFor(() => {
      const readCard = screen.getByTestId('story-card-three-branches');
      expect(readCard.querySelector('[aria-label="Already read"]')).not.toBeNull();
    });

    const unreadCard = screen.getByTestId('story-card-civil-war-and-reconstruction');
    expect(unreadCard.querySelector('[aria-label="Already read"]')).toBeNull();
  });

  it('renders read-time and reading-level chips on each card', async () => {
    vi.mocked(listStories).mockResolvedValueOnce(PILOT);
    render(<MemoryRouter><StoriesPage /></MemoryRouter>);

    await waitFor(() => {
      const card = screen.getByTestId('story-card-three-branches');
      expect(card).toHaveTextContent(/~5 min/);
      expect(card).toHaveTextContent(/16 questions/);
      // FK 75 should render as 'fairly easy' per the labeller.
      expect(card).toHaveTextContent(/fairly easy English/i);
    });
  });

  it('uses slugified, whitespace-free HTML ids for category aria-labelledby', async () => {
    // Final-diff Copilot review fix: HTML ids must not contain whitespace, and
    // aria-labelledby splits on whitespace to support multiple ids — so a raw
    // category like "American Government" would silently break the label
    // association. Verify the id is slugified.
    vi.mocked(listStories).mockResolvedValueOnce(PILOT);
    const { container } = render(<MemoryRouter><StoriesPage /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'American Government' })).toBeInTheDocument();
    });

    const section = container.querySelector('section[aria-labelledby="category-american-government"]');
    expect(section).not.toBeNull();
    const heading = container.querySelector('#category-american-government');
    expect(heading?.textContent).toBe('American Government');

    // Also verify no element id contains whitespace.
    const allIds = Array.from(container.querySelectorAll('[id]')).map(el => el.getAttribute('id'));
    for (const id of allIds) {
      expect(id).not.toMatch(/\s/);
    }
  });
});
