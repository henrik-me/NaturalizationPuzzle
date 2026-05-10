import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../hooks/useProgress';
import type { QuizHistoryEntry, StoryQuizHistoryEntry } from '../hooks/useProgress';
import { computeStoryStats } from '../utils/storyStats';

const UNDO_WINDOW_MS = 7000;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function computeStats(history: readonly QuizHistoryEntry[]): {
  readonly total: number;
  readonly passed: number;
  readonly passRate: number;
  readonly bestScore: string | null;
  readonly currentStreak: number;
} {
  if (history.length === 0) {
    return { total: 0, passed: 0, passRate: 0, bestScore: null, currentStreak: 0 };
  }

  const passed = history.filter(e => e.passed).length;
  const passRate = Math.round((passed / history.length) * 100);

  let bestPct = 0;
  let bestEntry: QuizHistoryEntry | null = null;
  for (const entry of history) {
    const pct = entry.total > 0 ? entry.correct / entry.total : 0;
    if (pct > bestPct) {
      bestPct = pct;
      bestEntry = entry;
    }
  }
  const bestScore = bestEntry ? `${bestEntry.correct}/${bestEntry.total}` : null;

  let currentStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].passed) currentStreak++;
    else break;
  }

  return { total: history.length, passed, passRate, bestScore, currentStreak };
}

export function HistoryPage(): React.ReactNode {
  const {
    quizHistory,
    storyQuizHistory,
    clearQuizHistory,
    removeStoryQuizResult,
    restoreStoryQuizResult,
    clearStoryQuizHistory,
  } = useProgress();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showStoryConfirm, setShowStoryConfirm] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<StoryQuizHistoryEntry | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearUndoTimer = useCallback((): void => {
    if (undoTimerRef.current !== null) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, []);

  const stats = computeStats(quizHistory);
  const sortedHistory = [...quizHistory].reverse();

  const storyStats = useMemo(() => computeStoryStats(storyQuizHistory), [storyQuizHistory]);
  const sortedStoryHistory = useMemo(() => {
    return [...storyQuizHistory].sort((a, b) => {
      if (a.date > b.date) return -1;
      if (a.date < b.date) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
  }, [storyQuizHistory]);

  const handleClear = (): void => {
    clearQuizHistory();
    setShowConfirm(false);
  };

  const handleDeleteStoryEntry = (entry: StoryQuizHistoryEntry): void => {
    clearUndoTimer();
    removeStoryQuizResult(entry.id);
    setPendingUndo(entry);
    undoTimerRef.current = setTimeout(() => {
      setPendingUndo(null);
      undoTimerRef.current = null;
    }, UNDO_WINDOW_MS);
  };

  const handleUndo = (): void => {
    if (pendingUndo === null) return;
    clearUndoTimer();
    restoreStoryQuizResult(pendingUndo);
    setPendingUndo(null);
  };

  const handleClearStoryHistory = (): void => {
    clearUndoTimer();
    setPendingUndo(null);
    clearStoryQuizHistory();
    setShowStoryConfirm(false);
  };

  const hasQuizHistory = quizHistory.length > 0;
  const hasStoryHistory = storyQuizHistory.length > 0;

  if (!hasQuizHistory && !hasStoryHistory && pendingUndo === null) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Quiz History</h2>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">You haven't taken any quizzes yet.</p>
          <Link
            to="/quiz"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500"
          >
            Start a Quiz
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Quiz History</h2>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-6 space-y-6">
        {hasQuizHistory && (
          <>
            <section aria-labelledby="stats-heading">
              <h3 id="stats-heading" className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">Summary</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">{stats.total}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300">Quizzes Taken</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-800 dark:text-green-200">{stats.passRate}%</p>
                  <p className="text-xs text-green-600 dark:text-green-300">Pass Rate</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-purple-800 dark:text-purple-200">{stats.bestScore ?? '–'}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-300">Best Score</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-800 dark:text-amber-200">{stats.currentStreak}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-300">Pass Streak</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="history-heading">
              <h3 id="history-heading" className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">All Attempts</h3>
              <ol className="space-y-3" aria-label="Quiz attempt history">
                {sortedHistory.map((entry, index) => (
                  <li
                    key={`${entry.date}-${index}`}
                    className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {formatDate(entry.date)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          entry.mode === '6520'
                            ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200'
                            : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                        }`}>
                          {entry.mode === '6520' ? '65/20' : 'Standard'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
                        {entry.correct}/{entry.total}
                      </span>
                      <span className={`text-sm font-semibold ${
                        entry.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                      }`} aria-label={entry.passed ? 'Passed' : 'Failed'}>
                        {entry.passed ? '✓ Pass' : '✗ Fail'}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              {showConfirm ? (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-4" role="alert">
                  <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                    Are you sure? This will permanently delete all quiz history.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleClear}
                      className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 focus:ring-2 focus:ring-red-500"
                    >
                      Yes, clear history
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded text-sm hover:bg-gray-200 dark:hover:bg-slate-600 focus:ring-2 focus:ring-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="text-red-600 dark:text-red-400 text-sm hover:underline focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
                >
                  Clear quiz history
                </button>
              )}
            </section>
          </>
        )}

        {(hasStoryHistory || pendingUndo) && (
          <section aria-labelledby="story-comprehension-heading" className="space-y-6">
            <h3 id="story-comprehension-heading" className="text-lg font-semibold text-gray-700 dark:text-gray-200">
              Story Comprehension
            </h3>

            {pendingUndo && (
              <div
                role="status"
                aria-live="polite"
                data-testid="undo-banner"
                className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3"
              >
                <span className="text-sm text-amber-800 dark:text-amber-200">Entry deleted.</span>
                <button
                  onClick={handleUndo}
                  className="text-sm font-semibold text-amber-800 dark:text-amber-200 hover:underline focus:ring-2 focus:ring-amber-500 rounded px-2 py-1"
                >
                  Undo
                </button>
              </div>
            )}

            <section aria-labelledby="story-comprehension-stats-heading">
              <h4
                id="story-comprehension-stats-heading"
                className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3"
              >
                Summary
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">{storyStats.totalAttempts}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300">Total Attempts</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/40 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                    {Math.round(storyStats.avgPercent)}%
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-300">Average Score</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="story-comprehension-per-story-heading">
              <h4
                id="story-comprehension-per-story-heading"
                className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3"
              >
                By Story
              </h4>
              <ul className="space-y-3" aria-label="Story comprehension per-story summary">
                {storyStats.perStory.map(row => (
                  <li
                    key={row.slug}
                    className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <Link
                        to={`/stories/${row.slug}`}
                        className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline focus:ring-2 focus:ring-blue-500 rounded"
                      >
                        {row.title}
                      </Link>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {row.attemptCount} {row.attemptCount === 1 ? 'attempt' : 'attempts'}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
                      {row.bestCorrect}/{row.bestTotal}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="story-comprehension-list-heading">
              <h4
                id="story-comprehension-list-heading"
                className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-3"
              >
                All Story Attempts
              </h4>
              <ol className="space-y-3" aria-label="Story comprehension attempt history">
                {sortedStoryHistory.map(entry => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 rounded-lg p-4"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {formatDate(entry.date)}
                      </span>
                      <Link
                        to={`/stories/${entry.storySlug}`}
                        className="text-xs text-blue-700 dark:text-blue-300 hover:underline focus:ring-2 focus:ring-blue-500 rounded"
                      >
                        {entry.storyTitle}
                      </Link>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
                        {entry.correct}/{entry.total}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteStoryEntry(entry)}
                        aria-label={`Delete attempt for ${entry.storyTitle} on ${formatDate(entry.date)}`}
                        className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 focus:ring-2 focus:ring-red-500 rounded px-2 py-1 text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-4">
                {showStoryConfirm ? (
                  <div
                    className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-4"
                    role="alert"
                  >
                    <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                      Are you sure? This will permanently delete all story comprehension history.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClearStoryHistory}
                        className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 focus:ring-2 focus:ring-red-500"
                      >
                        Yes, clear story history
                      </button>
                      <button
                        onClick={() => setShowStoryConfirm(false)}
                        className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded text-sm hover:bg-gray-200 dark:hover:bg-slate-600 focus:ring-2 focus:ring-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowStoryConfirm(true)}
                    className="text-red-600 dark:text-red-400 text-sm hover:underline focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
                  >
                    Clear story comprehension history
                  </button>
                )}
              </div>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
