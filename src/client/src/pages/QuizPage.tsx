import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { QuestionDto, QuizAnswer } from '../types/api';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { useAppContext } from '../context/AppContext';
import { QuizCard } from '../components/QuizCard';
import { checkAnswer } from '../utils/answerChecker';
import { useProgress } from '../hooks/useProgress';

interface QuizState {
  readonly questions: readonly QuestionDto[];
  readonly currentIndex: number;
  readonly answers: readonly QuizAnswer[];
  readonly isComplete: boolean;
  readonly isStarted: boolean;
}

export function QuizPage(): React.ReactNode {
  const { state } = useAppContext();
  const { addQuizResult } = useProgress();
  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    currentIndex: 0,
    answers: [],
    isComplete: false,
    isStarted: false,
  });
  const [is6520, setIs6520] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const passThreshold = is6520 ? 6 : 12;
  const failThreshold = is6520 ? 5 : 9;
  const correctCount = quizState.answers.filter(a => a.isCorrect).length;
  const incorrectCount = quizState.answers.filter(a => !a.isCorrect).length;

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
      answers: [],
      isComplete: false,
      isStarted: true,
    });
    setIsLoading(false);
  }, [state.selectedStateId, is6520]);

  const handleSubmitAnswer = useCallback((userAnswer: string): void => {
    const question = quizState.questions[quizState.currentIndex];
    if (!question) return;

    const isCorrect = checkAnswer(userAnswer, question.answers);
    const newAnswer: QuizAnswer = {
      questionId: question.id,
      questionText: question.text,
      userAnswer,
      acceptedAnswers: question.answers,
      isCorrect,
    };

    const updatedAnswers = [...quizState.answers, newAnswer];
    const newCorrect = updatedAnswers.filter(a => a.isCorrect).length;
    const newIncorrect = updatedAnswers.filter(a => !a.isCorrect).length;

    // Early stop: passed or failed
    const quizOver = newCorrect >= passThreshold
      || newIncorrect >= failThreshold
      || quizState.currentIndex + 1 >= quizState.questions.length;

    if (quizOver) {
      addQuizResult({
        date: new Date().toISOString(),
        mode: is6520 ? '6520' as const : 'standard' as const,
        correct: newCorrect,
        total: updatedAnswers.length,
        passed: newCorrect >= passThreshold,
      });
    }

    setQuizState({
      ...quizState,
      answers: updatedAnswers,
      currentIndex: quizOver ? quizState.currentIndex : quizState.currentIndex + 1,
      isComplete: quizOver,
    });
  }, [quizState, passThreshold, failThreshold, is6520, addQuizResult]);

  if (!state.selectedStateId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Quiz Mode</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Please select your state in{' '}
          <Link to="/settings" className="text-blue-600 dark:text-blue-400 underline">Settings</Link>
          {' '}first.
        </p>
      </div>
    );
  }

  if (!quizState.isStarted) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Quiz Mode</h2>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-6 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Quiz Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => setIs6520(false)}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  !is6520
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
                aria-pressed={!is6520}
              >
                <div className="font-bold">Standard</div>
                <div className="text-xs opacity-90">20 questions · 12 to pass</div>
              </button>
              <button
                onClick={() => setIs6520(true)}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  is6520
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
                aria-pressed={is6520}
              >
                <div className="font-bold">65/20</div>
                <div className="text-xs opacity-90">10 questions · 6 to pass</div>
              </button>
            </div>
          </div>
          <button
            onClick={() => void startQuiz()}
            disabled={isLoading}
            className="w-full bg-green-700 dark:bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-800 dark:hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Starting quiz…' : 'Start Quiz'}
          </button>
        </div>
      </main>
    );
  }

  if (quizState.isComplete) {
    const passed = correctCount >= passThreshold;
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-6" aria-live="polite">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Quiz Complete!</h2>
            <div className={`inline-block px-6 py-3 rounded-lg text-lg font-bold ${
              passed
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
            }`}>
              {passed ? '✓ PASSED' : '✗ FAILED'}
            </div>
            <p className="text-lg mt-3 text-gray-800 dark:text-gray-100">
              <span className="font-bold">{correctCount}</span> correct out of{' '}
              <span className="font-bold">{quizState.answers.length}</span> answered
              {' '}({passThreshold} needed to pass)
            </p>
          </div>

          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Review Your Answers</h3>
          <div className="space-y-4">
            {quizState.answers.map((answer, index) => (
              <div
                key={answer.questionId}
                className={`p-4 rounded-lg border-l-4 ${
                  answer.isCorrect
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
                    : 'border-red-500 bg-red-50 dark:bg-red-950/40'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`text-lg ${answer.isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} aria-hidden="true">
                    {answer.isCorrect ? '✓' : '✗'}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {index + 1}. {answer.questionText}
                    </p>
                    <p className={`text-sm mt-1 ${answer.isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      <span className="font-medium">Your answer:</span> {answer.userAnswer}
                    </p>
                    <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      <span className="font-medium">Accepted:</span>{' '}
                      {answer.acceptedAnswers.join(' · ')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setQuizState(prev => ({ ...prev, isStarted: false, isComplete: false, answers: [] }))}
            className="w-full mt-6 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
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
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
        Quiz Mode {is6520 ? '(65/20)' : '(Standard)'}
      </h2>

      {/* Score progress bar */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 mb-6" aria-label="Quiz progress">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-green-700 dark:text-green-400 font-medium">✓ {correctCount} correct</span>
          <span className="text-gray-500 dark:text-gray-400">{passThreshold} to pass</span>
          <span className="text-red-700 dark:text-red-400 font-medium">✗ {incorrectCount} wrong</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 flex overflow-hidden">
          <div
            className="bg-green-500 h-2.5 transition-all"
            style={{ width: `${(correctCount / quizState.questions.length) * 100}%` }}
          />
          <div
            className="bg-red-500 h-2.5 transition-all"
            style={{ width: `${(incorrectCount / quizState.questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex justify-center">
        <QuizCard
          question={currentQuestion}
          onNext={() => {}}
          questionNumber={quizState.currentIndex + 1}
          totalQuestions={quizState.questions.length}
          mode="quiz"
          onSubmitAnswer={handleSubmitAnswer}
        />
      </div>
    </main>
  );
}
