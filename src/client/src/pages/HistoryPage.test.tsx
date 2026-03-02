import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HistoryPage } from './HistoryPage';
import type { QuizHistoryEntry } from '../hooks/useProgress';

function seedHistory(entries: QuizHistoryEntry[]): void {
  localStorage.setItem(
    'naturalizationProgress',
    JSON.stringify({ studiedQuestionIds: [1, 2, 3], quizHistory: entries }),
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
