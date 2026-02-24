import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from './useProgress';
import type { QuizHistoryEntry } from './useProgress';

describe('useProgress', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty progress when no stored data', () => {
    const { result } = renderHook(() => useProgress());

    expect(result.current.studiedQuestionIds).toEqual([]);
    expect(result.current.quizHistory).toEqual([]);
    expect(result.current.studiedCount).toBe(0);
  });

  it('marks a question as studied and persists to localStorage', () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current.markStudied(42);
    });

    expect(result.current.studiedQuestionIds).toContain(42);
    expect(result.current.studiedCount).toBe(1);

    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.studiedQuestionIds).toContain(42);
  });

  it('does not duplicate already-studied question IDs', () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current.markStudied(10);
    });
    act(() => {
      result.current.markStudied(10);
    });

    expect(result.current.studiedQuestionIds.filter(id => id === 10)).toHaveLength(1);
  });

  it('adds quiz results and persists to localStorage', () => {
    const { result } = renderHook(() => useProgress());
    const entry: QuizHistoryEntry = {
      date: '2026-02-24',
      mode: 'standard',
      correct: 15,
      total: 20,
      passed: true,
    };

    act(() => {
      result.current.addQuizResult(entry);
    });

    expect(result.current.quizHistory).toHaveLength(1);
    expect(result.current.quizHistory[0]).toEqual(entry);

    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.quizHistory).toHaveLength(1);
  });

  it('loads existing progress from localStorage', () => {
    const existingProgress = {
      studiedQuestionIds: [1, 2, 3],
      quizHistory: [{ date: '2026-01-01', mode: 'standard', correct: 12, total: 20, passed: true }],
    };
    localStorage.setItem('naturalizationProgress', JSON.stringify(existingProgress));

    const { result } = renderHook(() => useProgress());

    expect(result.current.studiedQuestionIds).toEqual([1, 2, 3]);
    expect(result.current.studiedCount).toBe(3);
    expect(result.current.quizHistory).toHaveLength(1);
  });

  it('handles corrupt localStorage data gracefully', () => {
    localStorage.setItem('naturalizationProgress', 'not-valid-json');

    const { result } = renderHook(() => useProgress());

    expect(result.current.studiedQuestionIds).toEqual([]);
    expect(result.current.quizHistory).toEqual([]);
  });
});
