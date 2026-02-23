import { useState, useEffect, useCallback } from 'react';
import type { QuestionDto } from '../types/api';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { useAppContext } from '../context/AppContext';
import { QuizCard } from '../components/QuizCard';

export function StudyPage(): React.ReactNode {
  const { state } = useAppContext();
  const [questions, setQuestions] = useState<readonly QuestionDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | '6520'>('all');

  useEffect(() => {
    const load = async (): Promise<void> => {
      setIsLoading(true);
      const stateId = state.selectedStateId ?? undefined;
      const data = filter === '6520'
        ? await get6520Questions(stateId)
        : await getAllQuestions(stateId);
      setQuestions(data);
      setCurrentIndex(0);
      setIsLoading(false);
    };
    void load();
  }, [state.selectedStateId, filter]);

  const handleNext = useCallback((): void => {
    setCurrentIndex(prev => (prev + 1) % questions.length);
  }, [questions.length]);

  if (!state.selectedStateId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Welcome!</h2>
        <p className="text-gray-600">
          Please select your state in{' '}
          <a href="/settings" className="text-blue-600 underline">Settings</a>
          {' '}to get started.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading questions">
        <p className="text-gray-500">Loading questions...</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Study Mode</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-pressed={filter === 'all'}
          >
            All 128
          </button>
          <button
            onClick={() => setFilter('6520')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === '6520'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            aria-pressed={filter === '6520'}
          >
            65/20 (20 Questions)
          </button>
        </div>
      </div>

      <div className="flex justify-center">
        <QuizCard
          question={currentQuestion}
          onNext={handleNext}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
        />
      </div>
    </main>
  );
}
