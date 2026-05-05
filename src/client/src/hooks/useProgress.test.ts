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
    expect(result.current.storiesRead).toEqual([]);
  });

  it('migrates an old shape (missing storiesRead) without resetting other progress', () => {
    // Plan-review fix #8: a stored object that predates Story Mode must be
    // preserved (studiedQuestionIds + quizHistory intact) and given an empty
    // storiesRead, NOT reset wholesale. Persisting the migrated shape is a
    // side-effect of the next write, not an immediate write — verify both.
    const oldShape = {
      studiedQuestionIds: [10, 20, 30],
      quizHistory: [{ date: '2026-01-01', mode: 'standard', correct: 18, total: 20, passed: true }],
      // no storiesRead field
    };
    localStorage.setItem('naturalizationProgress', JSON.stringify(oldShape));

    const { result } = renderHook(() => useProgress());

    expect(result.current.studiedQuestionIds).toEqual([10, 20, 30]);
    expect(result.current.quizHistory).toHaveLength(1);
    expect(result.current.storiesRead).toEqual([]);

    // Stored object on disk is still the old shape — migration is in-memory only
    // until the next write. This avoids gratuitously rewriting localStorage on
    // every hook mount.
    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored).not.toHaveProperty('storiesRead');

    // Now perform a write and verify the persisted shape is migrated.
    act(() => {
      result.current.markStoryRead('three-branches');
    });

    const after = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(after.storiesRead).toEqual(['three-branches']);
    expect(after.studiedQuestionIds).toEqual([10, 20, 30]);
    expect(after.quizHistory).toHaveLength(1);
  });

  it('markStoryRead persists and de-duplicates', () => {
    const { result } = renderHook(() => useProgress());

    act(() => {
      result.current.markStoryRead('three-branches');
    });
    act(() => {
      result.current.markStoryRead('three-branches');
    });
    act(() => {
      result.current.markStoryRead('civil-war-and-reconstruction');
    });

    expect(result.current.storiesRead).toEqual(['three-branches', 'civil-war-and-reconstruction']);
    expect(result.current.isStoryRead('three-branches')).toBe(true);
    expect(result.current.isStoryRead('national-symbols-and-holidays')).toBe(false);

    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.storiesRead).toEqual(['three-branches', 'civil-war-and-reconstruction']);
  });

  it('clears quiz history while preserving studied questions', () => {
    const existingProgress = {
      studiedQuestionIds: [1, 2, 3],
      quizHistory: [
        { date: '2026-01-01', mode: 'standard', correct: 12, total: 20, passed: true },
        { date: '2026-01-02', mode: '6520', correct: 5, total: 10, passed: false },
      ],
    };
    localStorage.setItem('naturalizationProgress', JSON.stringify(existingProgress));

    const { result } = renderHook(() => useProgress());

    expect(result.current.quizHistory).toHaveLength(2);

    act(() => {
      result.current.clearQuizHistory();
    });

    expect(result.current.quizHistory).toEqual([]);
    expect(result.current.studiedQuestionIds).toEqual([1, 2, 3]);

    const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
    expect(stored.quizHistory).toEqual([]);
    expect(stored.studiedQuestionIds).toEqual([1, 2, 3]);
  });
});
