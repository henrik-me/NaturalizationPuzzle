import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { QuestionDto } from '../types/api';
import { getAllQuestions } from '../services/questionService';
import { useAppContext } from '../context/AppContext';
import { QuizCard } from '../components/QuizCard';
import { useProgress } from '../hooks/useProgress';

function matchesSearch(question: QuestionDto, terms: readonly string[]): boolean {
  const haystack = `${question.text} ${question.answers.join(' ')} ${question.category} ${question.subCategory}`.toLowerCase();
  return terms.every(term => haystack.includes(term));
}

export function StudyPage(): React.ReactNode {
  const { state } = useAppContext();
  const { studiedQuestionIds, markStudied, studiedCount } = useProgress();
  const [allQuestions, setAllQuestions] = useState<readonly QuestionDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | '6520'>('all');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const load = async (): Promise<void> => {
      setIsLoading(true);
      const stateId = state.selectedStateId ?? undefined;
      const data = await getAllQuestions(stateId);
      setAllQuestions(data);
      setIsLoading(false);
    };
    void load();
  }, [state.selectedStateId]);

  const filteredQuestions = useMemo((): readonly QuestionDto[] => {
    const base = filter === '6520'
      ? allQuestions.filter(q => q.is6520Designated)
      : allQuestions;
    const trimmed = searchText.trim().toLowerCase();
    if (!trimmed) return base;
    const terms = trimmed.split(/\s+/);
    return base.filter(q => matchesSearch(q, terms));
  }, [allQuestions, filter, searchText]);

  // Clamp the current index to the filtered set without an effect if the
  // available questions shrink for any reason.
  const safeIndex = filteredQuestions.length === 0
    ? 0
    : Math.min(currentIndex, filteredQuestions.length - 1);

  const handleFilterChange = useCallback((next: 'all' | '6520'): void => {
    setFilter(next);
    setCurrentIndex(0);
  }, []);

  const handleSearchChange = useCallback((value: string): void => {
    setSearchText(value);
    setCurrentIndex(0);
  }, []);

  const handleNext = useCallback((): void => {
    const current = filteredQuestions[safeIndex];
    if (current) {
      markStudied(current.id);
    }
    setCurrentIndex(prev => {
      const len = filteredQuestions.length;
      if (len === 0) return 0;
      return (prev + 1) % len;
    });
  }, [filteredQuestions, safeIndex, markStudied]);

  if (!state.selectedStateId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Welcome!</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Please select your state in{' '}
          <Link to="/settings" className="text-blue-600 dark:text-blue-400 underline">Settings</Link>
          {' '}to get started.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading questions">
        <p className="text-gray-500 dark:text-gray-400">Loading questions...</p>
      </div>
    );
  }

  const currentQuestion = filteredQuestions[safeIndex];
  const studiedInCurrentSet = filteredQuestions.filter(q => studiedQuestionIds.includes(q.id)).length;
  const isCurrentStudied = currentQuestion ? studiedQuestionIds.includes(currentQuestion.id) : false;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Study Mode</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
            aria-pressed={filter === 'all'}
          >
            All 128
          </button>
          <button
            onClick={() => handleFilterChange('6520')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === '6520'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
            aria-pressed={filter === '6520'}
          >
            65/20 (20 Questions)
          </button>
        </div>
      </div>

      {/* Search box */}
      <div className="mb-4">
        <label htmlFor="question-search" className="sr-only">Search questions</label>
        <input
          id="question-search"
          type="search"
          placeholder="Search questions or answers..."
          value={searchText}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search questions by keyword"
        />
      </div>

      {/* Progress indicator */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-3 mb-6">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
          <span>
            {studiedInCurrentSet} of {filteredQuestions.length} studied
            {searchText.trim() && ` (matching "${searchText.trim()}")`}
          </span>
          <span>{studiedCount} total studied</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${filteredQuestions.length > 0 ? (studiedInCurrentSet / filteredQuestions.length) * 100 : 0}%` }}
          />
        </div>
        {isCurrentStudied && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">✓ You've studied this question before</p>
        )}
      </div>

      {currentQuestion ? (
        <div className="flex justify-center">
          <QuizCard
            question={currentQuestion}
            onNext={handleNext}
            questionNumber={safeIndex + 1}
            totalQuestions={filteredQuestions.length}
          />
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
          <p className="text-gray-500 dark:text-gray-400">
            No questions match "<span className="font-medium">{searchText.trim()}</span>"
          </p>
          <button
            onClick={() => handleSearchChange('')}
            className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm underline"
          >
            Clear search
          </button>
        </div>
      )}
    </main>
  );
}
