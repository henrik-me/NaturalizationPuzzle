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

  it('hides the tag chips behind a collapsed "More filters" disclosure by default', async () => {
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    const toggle = screen.getByRole('button', { name: /More filters/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('tag-group-documents')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tag-filter-count-badge')).not.toBeInTheDocument();
  });

  it('renders tag chip groups by namespace once the disclosure is expanded', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));

    expect(screen.getByTestId('tag-group-documents')).toBeInTheDocument();
    expect(screen.getByTestId('tag-group-people')).toBeInTheDocument();
    expect(screen.getByTestId('tag-group-wars')).toBeInTheDocument();
    expect(screen.getByTestId('tag-group-timePeriod')).toBeInTheDocument();

    const docs = screen.getByTestId('tag-group-documents');
    expect(within(docs).getByRole('button', { name: 'Constitution' })).toBeInTheDocument();
    expect(within(docs).getByRole('button', { name: 'Declaration of Independence' })).toBeInTheDocument();
  });

  it('shows a count badge on the collapsed disclosure when tags are active', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Civil War' }));
    await user.click(screen.getByRole('button', { name: '1800s' }));

    // Collapse again — count badge should reflect the 2 active tags.
    await user.click(screen.getByRole('button', { name: /More filters/ }));
    expect(screen.queryByTestId('tag-group-wars')).not.toBeInTheDocument();
    expect(screen.getByTestId('tag-filter-count-badge')).toHaveTextContent('2');
  });

  it('filters by a single tag chip and resets currentIndex', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Constitution' }));
    await screen.findByText(/Question 1 of 1/);
    expect(screen.getByText(/What is the form of government/)).toBeInTheDocument();
  });

  it('OR-combines chips within a namespace', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Constitution' }));
    await user.click(screen.getByRole('button', { name: 'Declaration of Independence' }));
    // Q1 (Constitution) + Q3 (DoI) = 2 questions.
    await screen.findByText(/Question 1 of 2/);
  });

  it('AND-combines chips across namespaces', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    // Civil War (Q4) AND 1800s (Q4) -> exactly Q4.
    await user.click(screen.getByRole('button', { name: 'Civil War' }));
    await user.click(screen.getByRole('button', { name: '1800s' }));
    await screen.findByText(/Question 1 of 1/);
    expect(screen.getByText(/Name the U.S. war between the North and the South/)).toBeInTheDocument();
  });

  it('reconciles selected tags that vanish when another filter narrows the option set', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Constitution' }));
    await screen.findByText(/Question 1 of 1/);

    // Narrow to a category that has no Constitution-tagged question -> the
    // Constitution chip is not rendered any more, and the filter is no-op.
    await user.selectOptions(screen.getByLabelText(/^Category$/), 'Integrated Civics');
    await screen.findByText(/Question 1 of 1/);
    expect(screen.queryByRole('button', { name: 'Constitution' })).not.toBeInTheDocument();
    expect(screen.getByText(/capital of the United States/)).toBeInTheDocument();
  });

  it('does not silently re-apply a narrowed-away tag when filters widen again', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    // Pick a tag.
    await user.click(screen.getByRole('button', { name: 'Constitution' }));
    await screen.findByText(/Question 1 of 1/);

    // Narrow to a category that doesn't have any Constitution question — chip vanishes.
    await user.selectOptions(screen.getByLabelText(/^Category$/), 'Integrated Civics');
    await screen.findByText(/Question 1 of 1/);
    expect(screen.queryByRole('button', { name: 'Constitution' })).not.toBeInTheDocument();

    // Widen back to All. The Constitution chip is offered again, but it must
    // come back unselected — the narrowed-away selection was dropped, not stashed.
    await user.selectOptions(screen.getByLabelText(/^Category$/), '__all__');
    await screen.findByText(/Question 1 of 5/);
    expect(screen.getByRole('button', { name: 'Constitution' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('per-namespace Clear button removes only that namespace', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Civil War' }));
    await user.click(screen.getByRole('button', { name: '1800s' }));
    await screen.findByText(/Question 1 of 1/);

    const wars = screen.getByTestId('tag-group-wars');
    await user.click(within(wars).getByRole('button', { name: 'Clear' }));

    // Only timePeriod:1800s remains -> Q4 is the only 1800s question.
    await screen.findByText(/Question 1 of 1/);
    expect(within(wars).getByRole('button', { name: 'Civil War' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Clear filters resets selected tags', async () => {
    const user = userEvent.setup();
    renderStudyPage();
    await screen.findByText(/What is the form of government/);

    await user.click(screen.getByRole('button', { name: /More filters/ }));
    await user.click(screen.getByRole('button', { name: 'Constitution' }));
    await screen.findByText(/Question 1 of 1/);

    await user.type(screen.getByLabelText(/Search questions by keyword/), 'zzznomatch');
    await screen.findByText(/No questions match the current filters/);
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));

    await screen.findByText(/Question 1 of 5/);
    expect(screen.getByRole('button', { name: 'Constitution' })).toHaveAttribute('aria-pressed', 'false');
  });
});
