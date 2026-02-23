import { useState, useCallback } from 'react';

interface StudyProgress {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
}

export interface QuizHistoryEntry {
  readonly date: string;
  readonly mode: 'standard' | '6520';
  readonly correct: number;
  readonly total: number;
  readonly passed: boolean;
}

const STORAGE_KEY = 'naturalizationProgress';

function loadProgress(): StudyProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StudyProgress;
    }
  } catch {
    // ignore corrupt data
  }
  return { studiedQuestionIds: [], quizHistory: [] };
}

function saveProgress(progress: StudyProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function useProgress(): {
  readonly studiedQuestionIds: readonly number[];
  readonly quizHistory: readonly QuizHistoryEntry[];
  readonly markStudied: (questionId: number) => void;
  readonly addQuizResult: (entry: QuizHistoryEntry) => void;
  readonly studiedCount: number;
} {
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

  return {
    studiedQuestionIds: progress.studiedQuestionIds,
    quizHistory: progress.quizHistory,
    markStudied,
    addQuizResult,
    studiedCount: progress.studiedQuestionIds.length,
  };
}
