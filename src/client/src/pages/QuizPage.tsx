import { useState, useCallback } from 'react';
import type { QuestionDto } from '../types/api';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { useAppContext } from '../context/AppContext';
import { QuizCard } from '../components/QuizCard';

interface QuizState {
  readonly questions: readonly QuestionDto[];
  readonly currentIndex: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly isComplete: boolean;
  readonly isStarted: boolean;
}

export function QuizPage(): React.ReactNode {
  const { state } = useAppContext();
  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    isComplete: false,
    isStarted: false,
  });
  const [is6520, setIs6520] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const startQuiz = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    const stateId = state.selectedStateId ?? undefined;
    const allQuestions = is6520
      ? await get6520Questions(stateId)
      : await getAllQuestions(stateId);

    const count = is6520 ? 10 : 20;
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5).slice(0, count);

    setQuizState({
      questions: shuffled,
      currentIndex: 0,
      correctCount: 0,
      incorrectCount: 0,
      isComplete: false,
      isStarted: true,
    });
    setIsLoading(false);
  }, [state.selectedStateId, is6520]);

  const handleNext = useCallback((): void => {
    setQuizState(prev => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.questions.length) {
        return { ...prev, isComplete: true };
      }
      return { ...prev, currentIndex: nextIndex };
    });
  }, []);

  if (!state.selectedStateId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Quiz Mode</h2>
        <p className="text-gray-600">
          Please select your state in{' '}
          <a href="/settings" className="text-blue-600 underline">Settings</a>
          {' '}first.
        </p>
      </div>
    );
  }

  if (!quizState.isStarted) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Quiz Mode</h2>
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Quiz Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => setIs6520(false)}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  !is6520
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={!is6520}
              >
                <div className="font-bold">Standard</div>
                <div className="text-xs opacity-80">20 questions · 12 to pass</div>
              </button>
              <button
                onClick={() => setIs6520(true)}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  is6520
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-pressed={is6520}
              >
                <div className="font-bold">65/20</div>
                <div className="text-xs opacity-80">10 questions · 6 to pass</div>
              </button>
            </div>
          </div>
          <button
            onClick={() => void startQuiz()}
            disabled={isLoading}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Start Quiz'}
          </button>
        </div>
      </main>
    );
  }

  if (quizState.isComplete) {
    const passThreshold = is6520 ? 6 : 12;
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-md p-6 text-center" aria-live="polite">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Quiz Complete!</h2>
          <p className="text-lg mb-2">
            You reviewed all {quizState.questions.length} questions.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            On the real test, you would need {passThreshold} correct to pass.
          </p>
          <button
            onClick={() => setQuizState(prev => ({ ...prev, isStarted: false, isComplete: false }))}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  const currentQuestion = quizState.questions[quizState.currentIndex];
  if (!currentQuestion) return null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Quiz Mode {is6520 ? '(65/20)' : '(Standard)'}
      </h2>
      <div className="flex justify-center">
        <QuizCard
          question={currentQuestion}
          onNext={handleNext}
          questionNumber={quizState.currentIndex + 1}
          totalQuestions={quizState.questions.length}
        />
      </div>
    </main>
  );
}
