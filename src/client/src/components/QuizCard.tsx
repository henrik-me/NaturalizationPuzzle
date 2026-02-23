import { useState, useCallback } from 'react';
import type { QuestionDto } from '../types/api';

interface QuizCardProps {
  readonly question: QuestionDto;
  readonly onNext: () => void;
  readonly questionNumber: number;
  readonly totalQuestions: number;
  readonly mode?: 'study' | 'quiz';
  readonly onSubmitAnswer?: (answer: string) => void;
}

export function QuizCard({ question, onNext, questionNumber, totalQuestions, mode = 'study', onSubmitAnswer }: QuizCardProps): React.ReactNode {
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');

  const handleShowAnswer = useCallback((): void => {
    setShowAnswer(true);
  }, []);

  const handleNext = useCallback((): void => {
    setShowAnswer(false);
    setUserAnswer('');
    onNext();
  }, [onNext]);

  const handleSubmitAnswer = useCallback((): void => {
    if (userAnswer.trim().length === 0) return;
    onSubmitAnswer?.(userAnswer.trim());
    setUserAnswer('');
  }, [userAnswer, onSubmitAnswer]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (mode === 'study') {
        if (showAnswer) {
          handleNext();
        } else {
          handleShowAnswer();
        }
      }
    }
  }, [mode, showAnswer, handleNext, handleShowAnswer]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmitAnswer();
    }
  }, [handleSubmitAnswer]);

  return (
    <div
      className="bg-white rounded-xl shadow-md p-6 max-w-2xl w-full"
      role="article"
      aria-label={`Question ${questionNumber} of ${totalQuestions}`}
    >
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">
          Question {questionNumber} of {totalQuestions}
        </span>
        {question.is6520Designated && (
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">
            65/20
          </span>
        )}
      </div>

      <p className="text-lg font-medium text-gray-900 mb-1">
        <span className="text-gray-400 mr-2">#{question.id}</span>
        {question.text}
      </p>

      <p className="text-xs text-gray-400 mb-4">
        {question.category} › {question.subCategory}
      </p>

      {mode === 'quiz' ? (
        <div className="space-y-3">
          <label htmlFor="quiz-answer-input" className="block text-sm font-medium text-gray-700">
            Your answer
          </label>
          <input
            id="quiz-answer-input"
            type="text"
            value={userAnswer}
            onChange={e => setUserAnswer(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type your answer..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-gray-900"
            autoComplete="off"
            data-testid="quiz-answer-input"
          />
          <button
            onClick={handleSubmitAnswer}
            disabled={userAnswer.trim().length === 0}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Submit your answer"
            data-testid="submit-answer-btn"
          >
            Submit Answer
          </button>
        </div>
      ) : showAnswer ? (
        <div aria-live="polite">
          <ul className="list-disc list-inside space-y-1 mb-6" role="list" aria-label="Accepted answers">
            {question.answers.map((answer, index) => (
              <li key={index} className="text-green-700">
                {answer}
              </li>
            ))}
          </ul>
          <button
            onClick={handleNext}
            onKeyDown={handleKeyDown}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            aria-label="Go to next question"
          >
            Next Question
          </button>
        </div>
      ) : (
        <button
          onClick={handleShowAnswer}
          onKeyDown={handleKeyDown}
          className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
          aria-label="Show the answer"
        >
          Show Answer
        </button>
      )}
    </div>
  );
}
