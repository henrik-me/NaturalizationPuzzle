import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { QuestionDto } from '../types/api';

vi.mock('../services/questionService', () => ({
  getAllQuestions: vi.fn(),
  get6520Questions: vi.fn(),
  getQuestionById: vi.fn(),
  getQuestionsByCategory: vi.fn(),
}));

vi.mock('../services/stateService', () => ({
  getAllStates: vi.fn().mockResolvedValue([]),
  getStateById: vi.fn().mockResolvedValue(null),
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

import { getAllQuestions, get6520Questions } from '../services/questionService';
import { StudyPage } from './StudyPage';

const ALL_QUESTIONS: readonly QuestionDto[] = [
  { id: 1, text: 'What is the form of government of the United States?', category: 'American Government', subCategory: 'Principles of American Government', is6520Designated: true, answers: ['Republic'] },
  { id: 2, text: 'Name the three branches of government.', category: 'American Government', subCategory: 'System of Government', is6520Designated: false, answers: ['Legislative, Executive, Judicial'] },
  { id: 3, text: 'Who wrote the Declaration of Independence?', category: 'American History', subCategory: 'Colonial Period and Independence', is6520Designated: false, answers: ['Thomas Jefferson'] },
  { id: 4, text: 'Name the U.S. war between the North and the South.', category: 'American History', subCategory: 'The 1800s', is6520Designated: false, answers: ['Civil War'] },
  { id: 5, text: 'What is the capital of the United States?', category: 'Integrated Civics', subCategory: 'Symbols and Holidays', is6520Designated: true, answers: ['Washington, D.C.'] },
];

const SIX_FIVE_TWENTY: readonly QuestionDto[] = ALL_QUESTIONS.filter(q => q.is6520Designated);

function renderStudyPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <StudyPage />
    </MemoryRouter>,
  );
}

describe('StudyPage filters', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getAllQuestions).mockResolvedValue(ALL_QUESTIONS);
    vi.mocked(get6520Questions).mockResolvedValue(SIX_FIVE_TWENTY);
  });

  it('shows all loaded questions by default and Question 1 of N', async () => {
    renderStudyPage();
    await screen.findByText(/What is the form of government/);
    expect(screen.getByText(/Question 1 of 5/)).toBeInTheDocument();
  });

  it('filters by category and resets currentIndex', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');

    await screen.findByText(/Who wrote the Declaration of Independence/);
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
  });

  it('reveals subcategory dropdown only when a category is chosen', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    const subSelect = screen.getByLabelText(/Subcategory/) as HTMLSelectElement;
    expect(subSelect).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    await waitFor(() => expect(subSelect).not.toBeDisabled());

    await user.selectOptions(subSelect, 'The 1800s');
    await screen.findByText(/Name the U.S. war between the North and the South/);
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
  });

  it('resets subcategory when category changes', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    const subSelect = screen.getByLabelText(/Subcategory/) as HTMLSelectElement;
    await user.selectOptions(subSelect, 'The 1800s');
    expect(subSelect.value).toBe('The 1800s');

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American Government');
    expect(subSelect.value).toBe('__all__');
  });

  it('filters by Studied / Unstudied using progress', async () => {
    localStorage.setItem('naturalizationProgress', JSON.stringify({ studiedQuestionIds: [1, 3], quizHistory: [] }));
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: 'Unstudied' }));
    expect(screen.getByText(/Question 1 of 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Studied' }));
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
  });

  it('composes 65/20 scope with category filter', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /65\/20/ }));
    await waitFor(() => expect(get6520Questions).toHaveBeenCalled());
    // 6520 set has 2 entries: AmGov Q1 + IntCivics Q5.
    await screen.findByText(/Question 1 of 2/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American Government');
    await screen.findByText(/Question 1 of 1/);
    expect(screen.getByText(/What is the form of government/)).toBeInTheDocument();
  });

  it('composes category with search', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    await user.type(screen.getByLabelText(/Search questions by keyword/), 'civil');

    await screen.findByText(/Name the U.S. war between the North and the South/);
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
  });

  it('shows filter-aware empty state with a Clear filters button on empty intersection', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.type(screen.getByLabelText(/Search questions by keyword/), 'zzznomatch');

    await screen.findByText(/No questions match the current filters/);
    const clear = screen.getByRole('button', { name: /Clear filters/ });
    await user.click(clear);

    await screen.findByText(/What is the form of government/);
    expect(screen.getByText(/Question 1 of 5/)).toBeInTheDocument();
  });

  it('progress denominator reflects the current filtered set', async () => {
    localStorage.setItem('naturalizationProgress', JSON.stringify({ studiedQuestionIds: [3], quizHistory: [] }));
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    // Globally: 1 studied (Q3) of 5 total.
    expect(screen.getByText(/1 of 5 studied/)).toBeInTheDocument();
    expect(screen.getByText(/1 total studied/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    // In American History (Q3, Q4): 1 studied of 2.
    expect(screen.getByText(/1 of 2 studied/)).toBeInTheDocument();
    expect(screen.getByText(/1 total studied/)).toBeInTheDocument();
  });

  it('drops a stale getAllQuestions response when scope changed mid-flight', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    // Initial fast load completes.
    await screen.findByText(/Question 1 of 5/);

    // Set up: the NEXT getAllQuestions call (after we toggle back to All) will
    // resolve slowly. The 6520 calls remain fast.
    let resolveStaleAll: ((q: readonly QuestionDto[]) => void) | undefined;
    vi.mocked(getAllQuestions).mockImplementationOnce(
      () => new Promise<readonly QuestionDto[]>(res => { resolveStaleAll = res; }),
    );

    // Click 65/20 -> fast.
    await user.click(screen.getByRole('button', { name: /65\/20/ }));
    await screen.findByText(/Question 1 of 2/);

    // Click back to All -> slow (mocked above). The pending All fetch will
    // race with the next 6520 click below.
    await user.click(screen.getByRole('button', { name: 'All 128' }));

    // Click 65/20 again -> fast resolution; cancels the pending All.
    await user.click(screen.getByRole('button', { name: /65\/20/ }));
    await screen.findByText(/Question 1 of 2/);

    // Now late-resolve the orphaned All request. The cancel guard must drop it.
    await act(async () => {
      resolveStaleAll?.(ALL_QUESTIONS);
    });
    expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Question 1 of 5/)).toBeNull();
  });

  it('search text alone filters within all loaded questions', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.type(screen.getByLabelText(/Search questions by keyword/), 'capital');
    await screen.findByText(/What is the capital of the United States/);
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
  });

  it('resets orphaned subcategory when scope change drops it from the dataset', async () => {
    // Start with an All-mode dataset where Q4 is in 'The 1800s' subcategory.
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    await user.selectOptions(screen.getByLabelText(/^Subcategory$/), 'The 1800s');
    await screen.findByText(/Question 1 of 1/);

    // Now toggle to 65/20 — the new dataset has American History but no
    // 'The 1800s' subcategory (only 65/20 ids 1 and 5 remain). The
    // reconciliation effect must reset SubCategory to 'All subcategories'
    // and Category to 'All categories' (since 65/20 has no American History
    // questions in the fixture).
    await user.click(screen.getByRole('button', { name: /65\/20/ }));

    // Wait for re-render; the active filter chrome must reflect the reset.
    await screen.findByText(/Question 1 of 2/);
    const categorySelect = screen.getByLabelText(/^Category$/) as HTMLSelectElement;
    expect(categorySelect.value).toBe('__all__');
    const subSelect = screen.getByLabelText(/^Subcategory$/) as HTMLSelectElement;
    expect(subSelect.value).toBe('__all__');
  });
});
