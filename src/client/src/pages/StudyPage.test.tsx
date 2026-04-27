import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

import { getAllQuestions } from '../services/questionService';
import { StudyPage } from './StudyPage';

const ALL_QUESTIONS: readonly QuestionDto[] = [
  { id: 1, text: 'What is the form of government of the United States?', category: 'American Government', subCategory: 'Principles of American Government', is6520Designated: true, tags: ['documents:Constitution'], answers: ['Republic'] },
  { id: 2, text: 'Name the three branches of government.', category: 'American Government', subCategory: 'System of Government', is6520Designated: false, tags: [], answers: ['Legislative, Executive, Judicial'] },
  { id: 3, text: 'Who wrote the Declaration of Independence?', category: 'American History', subCategory: 'Colonial Period and Independence', is6520Designated: false, tags: ['documents:Declaration of Independence', 'people:Thomas Jefferson', 'timePeriod:1700s'], answers: ['Thomas Jefferson'] },
  { id: 4, text: 'Name the U.S. war between the North and the South.', category: 'American History', subCategory: 'The 1800s', is6520Designated: false, tags: ['wars:Civil War', 'timePeriod:1800s'], answers: ['Civil War'] },
  { id: 5, text: 'What is the capital of the United States?', category: 'Integrated Civics', subCategory: 'Symbols and Holidays', is6520Designated: true, tags: [], answers: ['Washington, D.C.'] },
];

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

  it('subcategory dropdown only enables when a category is chosen and resets when category changes', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    const subSelect = screen.getByLabelText(/^Subcategory$/) as HTMLSelectElement;
    expect(subSelect).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    expect(subSelect).not.toBeDisabled();

    await user.selectOptions(subSelect, 'The 1800s');
    await screen.findByText(/Question 1 of 1/);
    expect(screen.getByText(/Name the U.S. war between the North and the South/)).toBeInTheDocument();

    // Switching category must reset subcategory back to "All subcategories".
    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American Government');
    expect(subSelect.value).toBe('__all__');
  });

  it('filters Studied vs Unstudied based on persisted progress', async () => {
    localStorage.setItem('naturalizationProgress', JSON.stringify({ studiedQuestionIds: [3, 5], quizHistory: [] }));
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    const group = screen.getByRole('group', { name: /Studied status/ });

    await user.click(within(group).getByRole('button', { name: /^Studied$/ }));
    await screen.findByText(/Question 1 of 2/);

    await user.click(within(group).getByRole('button', { name: /^Unstudied$/ }));
    await screen.findByText(/Question 1 of 3/);
  });

  it('composes 65/20 + category', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /65\/20/ }));
    // 65/20 designated: ids 1 (American Government) + 5 (Integrated Civics) -> 2 items.
    await screen.findByText(/Question 1 of 2/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'Integrated Civics');
    await screen.findByText(/Question 1 of 1/);
    expect(screen.getByText(/capital of the United States/)).toBeInTheDocument();
  });

  it('composes Category + search', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    await user.type(screen.getByLabelText(/Search questions by keyword/), 'civil');
    await screen.findByText(/Question 1 of 1/);
    // Search hits the answer "Civil War" (case-insensitive); the rendered card
    // shows the question text, not the answer.
    expect(screen.getByText(/Name the U.S. war between the North and the South/)).toBeInTheDocument();
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

    expect(screen.getByText(/1 of 5 studied/)).toBeInTheDocument();
    expect(screen.getByText(/1 total studied/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    expect(screen.getByText(/1 of 2 studied/)).toBeInTheDocument();
    expect(screen.getByText(/1 total studied/)).toBeInTheDocument();
  });

  it('search text alone filters within all loaded questions', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.type(screen.getByLabelText(/Search questions by keyword/), 'capital');
    await screen.findByText(/What is the capital of the United States/);
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
  });

  it('falls back to All when scope change drops a previously selected category', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.selectOptions(screen.getByLabelText(/^Category$/), 'American History');
    await user.selectOptions(screen.getByLabelText(/^Subcategory$/), 'The 1800s');
    await screen.findByText(/Question 1 of 1/);

    // 65/20 dataset has no American History questions in this fixture.
    await user.click(screen.getByRole('button', { name: /65\/20/ }));
    await screen.findByText(/Question 1 of 2/);

    const categorySelect = screen.getByLabelText(/^Category$/) as HTMLSelectElement;
    expect(categorySelect.value).toBe('__all__');
    const subSelect = screen.getByLabelText(/^Subcategory$/) as HTMLSelectElement;
    expect(subSelect.value).toBe('__all__');
  });
});
