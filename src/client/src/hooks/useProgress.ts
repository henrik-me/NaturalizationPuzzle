import { useState, useCallback } from 'react';

interface StudyProgress {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
  readonly storiesRead: readonly string[];
  readonly storyQuizHistory: readonly StoryQuizHistoryEntry[];
}

export interface QuizHistoryEntry {
  readonly date: string;
  readonly mode: 'standard' | '6520';
  readonly correct: number;
  readonly total: number;
  readonly passed: boolean;
}

export interface StoryQuizHistoryEntry {
  readonly id: string;
  readonly date: string;
  readonly storySlug: string;
  readonly storyTitle: string;
  readonly correct: number;
  readonly total: number;
}

function generateStoryQuizId(storySlug: string): string {
  const cryptoRef: { randomUUID?: () => string } | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `${storySlug}-${Date.now()}-${Math.random()}`;
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
    storyQuizHistory: Array.isArray(obj.storyQuizHistory)
      ? (obj.storyQuizHistory as readonly StoryQuizHistoryEntry[])
      : [],
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
  return { studiedQuestionIds: [], quizHistory: [], storiesRead: [], storyQuizHistory: [] };
}

function saveProgress(progress: StudyProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function useProgress(): {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
  readonly storiesRead: readonly string[];
  readonly storyQuizHistory: readonly StoryQuizHistoryEntry[];
  readonly markStudied: (questionId: number) => void;
  readonly addQuizResult: (entry: QuizHistoryEntry) => void;
  readonly clearQuizHistory: () => void;
  readonly markStoryRead: (slug: string) => void;
  readonly isStoryRead: (slug: string) => boolean;
  readonly addStoryQuizResult: (entry: Omit<StoryQuizHistoryEntry, 'id' | 'date'>) => void;
  readonly removeStoryQuizResult: (id: string) => void;
  readonly restoreStoryQuizResult: (entry: StoryQuizHistoryEntry) => void;
  readonly clearStoryQuizHistory: () => void;
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

  const addStoryQuizResult = useCallback(
    (entry: Omit<StoryQuizHistoryEntry, 'id' | 'date'>): void => {
      const newEntry: StoryQuizHistoryEntry = {
        ...entry,
        id: generateStoryQuizId(entry.storySlug),
        date: new Date().toISOString(),
      };
      setProgress(prev => {
        const updated = {
          ...prev,
          storyQuizHistory: [...prev.storyQuizHistory, newEntry],
        };
        saveProgress(updated);
        return updated;
      });
    },
    []
  );

  const removeStoryQuizResult = useCallback((id: string): void => {
    setProgress(prev => {
      if (!prev.storyQuizHistory.some(e => e.id === id)) return prev;
      const updated = {
        ...prev,
        storyQuizHistory: prev.storyQuizHistory.filter(e => e.id !== id),
      };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const restoreStoryQuizResult = useCallback((entry: StoryQuizHistoryEntry): void => {
    setProgress(prev => {
      const updated = {
        ...prev,
        storyQuizHistory: [...prev.storyQuizHistory, entry],
      };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const clearStoryQuizHistory = useCallback((): void => {
    setProgress(prev => {
      const updated = { ...prev, storyQuizHistory: [] };
      saveProgress(updated);
      return updated;
    });
  }, []);

  return {
    studiedQuestionIds: progress.studiedQuestionIds,
    quizHistory: progress.quizHistory,
    storiesRead: progress.storiesRead,
    storyQuizHistory: progress.storyQuizHistory,
    markStudied,
    addQuizResult,
    clearQuizHistory,
    markStoryRead,
    isStoryRead,
    addStoryQuizResult,
    removeStoryQuizResult,
    restoreStoryQuizResult,
    clearStoryQuizHistory,
    studiedCount: progress.studiedQuestionIds.length,
  };
}
