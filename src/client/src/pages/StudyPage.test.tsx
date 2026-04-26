import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { QuestionDto } from '../types/api';
import { StudyPage } from './StudyPage';

vi.mock('../services/questionService', () => ({
  getAllQuestions: vi.fn(),
  get6520Questions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    state: {
      selectedStateId: 1,
      selectedState: null,
      questions: [],
      is6520Mode: false,
      isOnline: true,
      isLoading: false,
    },
    dispatch: vi.fn(),
  }),
}));

import { getAllQuestions } from '../services/questionService';

function makeQuestion(id: number, designated: boolean, text = `Question ${id}`): QuestionDto {
  return {
    id,
    text,
    category: 'American Government',
    subCategory: 'Principles',
    is6520Designated: designated,
    answers: [`Answer ${id}`],
  };
}

function renderStudyPage(): void {
  render(
    <MemoryRouter>
      <StudyPage />
    </MemoryRouter>,
  );
}

describe('StudyPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getAllQuestions).mockReset();
  });

  it('shows the full set by default and switches to 65/20 synchronously without a stale render', async () => {
    // 5 questions: 2 designated as 65/20.
    const allQuestions: QuestionDto[] = [
      makeQuestion(1, true),
      makeQuestion(2, false),
      makeQuestion(3, true),
      makeQuestion(4, false),
      makeQuestion(5, false),
    ];
    vi.mocked(getAllQuestions).mockResolvedValue(allQuestions);

    renderStudyPage();

    expect(await screen.findByText('Question 1 of 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /65\/20/i }));

    // The new total must appear immediately on the same render that updates
    // the filter — never a transient "1 of 5" with the 65/20 button selected.
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(getAllQuestions).toHaveBeenCalledTimes(1);
  });

  it('clamps currentIndex when the filtered set shrinks past the current position', async () => {
    const allQuestions: QuestionDto[] = [
      makeQuestion(1, false),
      makeQuestion(2, false),
      makeQuestion(3, true, 'Unique-needle text appears here'),
      makeQuestion(4, false),
      makeQuestion(5, false),
    ];
    vi.mocked(getAllQuestions).mockResolvedValue(allQuestions);

    renderStudyPage();

    await screen.findByText('Question 1 of 5');

    // Advance to question 4 by revealing + clicking next three times.
    for (let i = 0; i < 3; i++) {
      await userEvent.click(await screen.findByRole('button', { name: /show the answer/i }));
      await userEvent.click(await screen.findByRole('button', { name: /go to next question/i }));
    }
    expect(screen.getByText('Question 4 of 5')).toBeInTheDocument();

    // Search for text that only matches question 3 — the filtered set shrinks
    // to a single item. The displayed counter must clamp to 1, not show
    // "Question 4 of 1".
    await userEvent.type(screen.getByLabelText(/search questions/i), 'unique-needle');
    expect(await screen.findByText('Question 1 of 1')).toBeInTheDocument();
    expect(screen.getByText(/Unique-needle text appears here/)).toBeInTheDocument();
  });

  it('filters by search text and shows the empty state when no matches', async () => {
    const allQuestions: QuestionDto[] = [
      makeQuestion(1, false, 'What is the supreme law of the land?'),
      makeQuestion(2, false, 'Name one branch of the government.'),
    ];
    vi.mocked(getAllQuestions).mockResolvedValue(allQuestions);

    renderStudyPage();

    await screen.findByText('Question 1 of 2');

    const search = screen.getByLabelText(/search questions/i);
    await userEvent.type(search, 'supreme');

    expect(screen.getByText('Question 1 of 1')).toBeInTheDocument();
    expect(screen.getByText(/supreme law/i)).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'nonexistent');

    await waitFor(() => {
      expect(screen.getByText(/No questions match/i)).toBeInTheDocument();
    });
  });
});
