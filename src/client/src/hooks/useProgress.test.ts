import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgress } from './useProgress';
import type { QuizHistoryEntry, StoryQuizHistoryEntry } from './useProgress';

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

  describe('storyQuizHistory', () => {
    it('addStoryQuizResult accepts only the content fields and stamps id + date', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'The Three Branches of Government',
          correct: 4,
          total: 5,
        });
      });

      expect(result.current.storyQuizHistory).toHaveLength(1);
      const entry = result.current.storyQuizHistory[0];
      expect(entry.storySlug).toBe('three-branches');
      expect(entry.storyTitle).toBe('The Three Branches of Government');
      expect(entry.correct).toBe(4);
      expect(entry.total).toBe(5);
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.date).toBe('string');
      expect(entry.date.length).toBeGreaterThan(0);

      const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
      expect(stored.storyQuizHistory).toHaveLength(1);
      expect(stored.storyQuizHistory[0].id).toBe(entry.id);
      expect(stored.storyQuizHistory[0].date).toBe(entry.date);
    });

    it('addStoryQuizResult produces unique ids across consecutive calls', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'The Three Branches of Government',
          correct: 4,
          total: 5,
        });
      });
      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'The Three Branches of Government',
          correct: 5,
          total: 5,
        });
      });

      expect(result.current.storyQuizHistory).toHaveLength(2);
      const [a, b] = result.current.storyQuizHistory;
      expect(a.id).not.toBe(b.id);
    });

    it('removeStoryQuizResult removes the entry with the given id', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'Three Branches',
          correct: 4,
          total: 5,
        });
      });
      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'civil-war',
          storyTitle: 'Civil War',
          correct: 3,
          total: 5,
        });
      });

      const targetId = result.current.storyQuizHistory[0].id;

      act(() => {
        result.current.removeStoryQuizResult(targetId);
      });

      expect(result.current.storyQuizHistory).toHaveLength(1);
      expect(result.current.storyQuizHistory[0].storySlug).toBe('civil-war');

      const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
      expect(stored.storyQuizHistory).toHaveLength(1);
      expect(stored.storyQuizHistory[0].storySlug).toBe('civil-war');
    });

    it('removeStoryQuizResult is a no-op when the id is unknown', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'Three Branches',
          correct: 4,
          total: 5,
        });
      });

      const before = result.current.storyQuizHistory;

      expect(() => {
        act(() => {
          result.current.removeStoryQuizResult('does-not-exist');
        });
      }).not.toThrow();

      expect(result.current.storyQuizHistory).toBe(before);
      expect(result.current.storyQuizHistory).toHaveLength(1);
    });

    it('restoreStoryQuizResult re-inserts the entry and a subsequent remove round-trips', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'Three Branches',
          correct: 4,
          total: 5,
        });
      });

      const original = result.current.storyQuizHistory[0];

      act(() => {
        result.current.removeStoryQuizResult(original.id);
      });
      expect(result.current.storyQuizHistory).toHaveLength(0);

      act(() => {
        result.current.restoreStoryQuizResult(original);
      });

      expect(result.current.storyQuizHistory).toHaveLength(1);
      const restored = result.current.storyQuizHistory[0];
      expect(restored).toEqual(original);
      expect(restored.id).toBe(original.id);
      expect(restored.date).toBe(original.date);

      act(() => {
        result.current.removeStoryQuizResult(original.id);
      });
      expect(result.current.storyQuizHistory).toHaveLength(0);
    });

    it('restoreStoryQuizResult after clearStoryQuizHistory re-adds the entry to the empty list', () => {
      const { result } = renderHook(() => useProgress());

      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'Three Branches',
          correct: 4,
          total: 5,
        });
      });
      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'civil-war',
          storyTitle: 'Civil War',
          correct: 3,
          total: 5,
        });
      });

      const snapshot = result.current.storyQuizHistory[0];

      act(() => {
        result.current.clearStoryQuizHistory();
      });
      expect(result.current.storyQuizHistory).toEqual([]);

      act(() => {
        result.current.restoreStoryQuizResult(snapshot);
      });

      expect(result.current.storyQuizHistory).toHaveLength(1);
      expect(result.current.storyQuizHistory[0]).toEqual(snapshot);
    });

    it('clearStoryQuizHistory clears storyQuizHistory only and preserves other progress', () => {
      const existingProgress = {
        studiedQuestionIds: [1, 2, 3],
        quizHistory: [
          { date: '2026-01-01', mode: 'standard', correct: 12, total: 20, passed: true },
        ],
        storiesRead: ['three-branches'],
        storyQuizHistory: [
          {
            id: 'abc',
            date: '2026-02-01T00:00:00.000Z',
            storySlug: 'three-branches',
            storyTitle: 'Three Branches',
            correct: 4,
            total: 5,
          },
        ],
      };
      localStorage.setItem('naturalizationProgress', JSON.stringify(existingProgress));

      const { result } = renderHook(() => useProgress());
      expect(result.current.storyQuizHistory).toHaveLength(1);

      act(() => {
        result.current.clearStoryQuizHistory();
      });

      expect(result.current.storyQuizHistory).toEqual([]);
      expect(result.current.quizHistory).toHaveLength(1);
      expect(result.current.studiedQuestionIds).toEqual([1, 2, 3]);
      expect(result.current.storiesRead).toEqual(['three-branches']);

      const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
      expect(stored.storyQuizHistory).toEqual([]);
      expect(stored.quizHistory).toHaveLength(1);
      expect(stored.studiedQuestionIds).toEqual([1, 2, 3]);
      expect(stored.storiesRead).toEqual(['three-branches']);
    });

    it('migrates a legacy persisted shape (no storyQuizHistory) to an empty list without losing other fields', () => {
      const legacyShape = {
        studiedQuestionIds: [10, 20, 30],
        quizHistory: [
          { date: '2026-01-01', mode: 'standard', correct: 18, total: 20, passed: true },
        ],
        storiesRead: ['three-branches'],
        // no storyQuizHistory field
      };
      localStorage.setItem('naturalizationProgress', JSON.stringify(legacyShape));

      const { result } = renderHook(() => useProgress());

      expect(result.current.studiedQuestionIds).toEqual([10, 20, 30]);
      expect(result.current.quizHistory).toHaveLength(1);
      expect(result.current.storiesRead).toEqual(['three-branches']);
      expect(result.current.storyQuizHistory).toEqual([]);

      // Persisted shape on disk is still legacy until the next write.
      const stored = JSON.parse(localStorage.getItem('naturalizationProgress')!);
      expect(stored).not.toHaveProperty('storyQuizHistory');

      // After the next write the persisted shape includes the new field.
      act(() => {
        result.current.addStoryQuizResult({
          storySlug: 'three-branches',
          storyTitle: 'Three Branches',
          correct: 4,
          total: 5,
        });
      });

      const after = JSON.parse(localStorage.getItem('naturalizationProgress')!);
      expect(after.storyQuizHistory).toHaveLength(1);
      expect(after.studiedQuestionIds).toEqual([10, 20, 30]);
      expect(after.quizHistory).toHaveLength(1);
      expect(after.storiesRead).toEqual(['three-branches']);
    });

    it('falls back to a non-crypto id generator when crypto.randomUUID is unavailable', () => {
      const original = (globalThis as { crypto?: unknown }).crypto;
      try {
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          configurable: true,
          writable: true,
        });

        const { result } = renderHook(() => useProgress());

        act(() => {
          result.current.addStoryQuizResult({
            storySlug: 'three-branches',
            storyTitle: 'Three Branches',
            correct: 4,
            total: 5,
          });
        });

        const entry: StoryQuizHistoryEntry = result.current.storyQuizHistory[0];
        expect(typeof entry.id).toBe('string');
        expect(entry.id.length).toBeGreaterThan(0);
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          value: original,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
