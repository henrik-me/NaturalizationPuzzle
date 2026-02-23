import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuizCard } from './QuizCard';
import type { QuestionDto } from '../types/api';

const mockQuestion: QuestionDto = {
  id: 1,
  text: 'What is the form of government of the United States?',
  category: 'American Government',
  subCategory: 'Principles of American Government',
  is6520Designated: true,
  answers: ['Republic', 'Constitution-based federal republic', 'Representative democracy'],
};

describe('QuizCard', () => {
  it('renders question text and number', () => {
    render(
      <QuizCard question={mockQuestion} onNext={() => {}} questionNumber={1} totalQuestions={128} />
    );

    expect(screen.getByText(/What is the form of government/)).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 128')).toBeInTheDocument();
  });

  it('shows 65/20 badge for designated questions', () => {
    render(
      <QuizCard question={mockQuestion} onNext={() => {}} questionNumber={1} totalQuestions={20} />
    );

    expect(screen.getByText('65/20')).toBeInTheDocument();
  });

  it('does not show answers initially', () => {
    render(
      <QuizCard question={mockQuestion} onNext={() => {}} questionNumber={1} totalQuestions={128} />
    );

    expect(screen.queryByText('Republic')).not.toBeInTheDocument();
    expect(screen.getByText('Show Answer')).toBeInTheDocument();
  });

  it('reveals answers when Show Answer is clicked', async () => {
    const user = userEvent.setup();
    render(
      <QuizCard question={mockQuestion} onNext={() => {}} questionNumber={1} totalQuestions={128} />
    );

    await user.click(screen.getByText('Show Answer'));

    expect(screen.getByText('Republic')).toBeInTheDocument();
    expect(screen.getByText('Constitution-based federal republic')).toBeInTheDocument();
    expect(screen.getByText('Representative democracy')).toBeInTheDocument();
    expect(screen.getByText('Next Question')).toBeInTheDocument();
  });

  it('calls onNext when Next Question is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <QuizCard question={mockQuestion} onNext={onNext} questionNumber={1} totalQuestions={128} />
    );

    await user.click(screen.getByText('Show Answer'));
    await user.click(screen.getByText('Next Question'));

    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows category and subcategory', () => {
    render(
      <QuizCard question={mockQuestion} onNext={() => {}} questionNumber={1} totalQuestions={128} />
    );

    expect(screen.getByText('American Government › Principles of American Government')).toBeInTheDocument();
  });
});
