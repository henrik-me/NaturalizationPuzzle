import { useState, useCallback } from 'react';

interface StudyProgress {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
  readonly storiesRead: readonly string[];
}

export interface QuizHistoryEntry {
  readonly date: string;
  readonly mode: 'standard' | '6520';
  readonly correct: number;
  readonly total: number;
  readonly passed: boolean;
}

const STORAGE_KEY = 'naturalizationProgress';

/**
 * The persisted progress shape grew the optional `storiesRead` field when
 * Story Mode shipped. Existing users have a stored object without that
 * field; treat such an object as valid (with `storiesRead = []`) rather
 * than treating it as corrupt and resetting all of their progress.
 *
 * Returns the parsed object, normalized to the current shape, or `null`
 * if the input is genuinely corrupt (not an object, missing required
 * arrays, etc.) so the caller can fall back to a fresh empty state.
 */
function migrateProgress(value: unknown): StudyProgress | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.studiedQuestionIds) || !Array.isArray(obj.quizHistory)) {
    return null;
  }
  return {
    studiedQuestionIds: obj.studiedQuestionIds as readonly number[],
    quizHistory: obj.quizHistory as readonly QuizHistoryEntry[],
    storiesRead: Array.isArray(obj.storiesRead) ? (obj.storiesRead as readonly string[]) : [],
  };
}

function loadProgress(): StudyProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      const migrated = migrateProgress(parsed);
      if (migrated) {
        return migrated;
      }
    }
  } catch {
    // ignore corrupt data
  }
  return { studiedQuestionIds: [], quizHistory: [], storiesRead: [] };
}

function saveProgress(progress: StudyProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function useProgress(): {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
  readonly storiesRead: readonly string[];
  readonly markStudied: (questionId: number) => void;
  readonly addQuizResult: (entry: QuizHistoryEntry) => void;
  readonly clearQuizHistory: () => void;
  readonly markStoryRead: (slug: string) => void;
  readonly isStoryRead: (slug: string) => boolean;
  readonly studiedCount: number;
}{
  const [progress, setProgress] = useState<StudyProgress>(loadProgress);

  const markStudied = useCallback((questionId: number): void => {
    setProgress(prev => {
      if (prev.studiedQuestionIds.includes(questionId)) return prev;
      const updated = {
        ...prev,
        studiedQuestionIds: [...prev.studiedQuestionIds, questionId],
      };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const addQuizResult = useCallback((entry: QuizHistoryEntry): void => {
    setProgress(prev => {
      const updated = {
        ...prev,
        quizHistory: [...prev.quizHistory, entry],
      };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const clearQuizHistory = useCallback((): void => {
    setProgress(prev => {
      const updated = { ...prev, quizHistory: [] };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const markStoryRead = useCallback((slug: string): void => {
    setProgress(prev => {
      if (prev.storiesRead.includes(slug)) return prev;
      const updated = { ...prev, storiesRead: [...prev.storiesRead, slug] };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const isStoryRead = useCallback(
    (slug: string): boolean => progress.storiesRead.includes(slug),
    [progress.storiesRead]
  );

  return {
    studiedQuestionIds: progress.studiedQuestionIds,
    quizHistory: progress.quizHistory,
    storiesRead: progress.storiesRead,
    markStudied,
    addQuizResult,
    clearQuizHistory,
    markStoryRead,
    isStoryRead,
    studiedCount: progress.studiedQuestionIds.length,
  };
}
