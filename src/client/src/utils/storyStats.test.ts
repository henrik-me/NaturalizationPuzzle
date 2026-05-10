import { describe, it, expect } from 'vitest';
import type { StoryQuizHistoryEntry } from '../hooks/useProgress';
import { computeStoryStats } from './storyStats';

function entry(overrides: Partial<StoryQuizHistoryEntry>): StoryQuizHistoryEntry {
  return {
    id: 'id-1',
    date: '2026-01-01T00:00:00.000Z',
    storySlug: 'slug-a',
    storyTitle: 'Story A',
    correct: 1,
    total: 1,
    ...overrides,
  };
}

describe('computeStoryStats', () => {
  it('returns zeroes for empty input', () => {
    const stats = computeStoryStats([]);
    expect(stats.totalAttempts).toBe(0);
    expect(stats.avgPercent).toBe(0);
    expect(stats.perStory).toEqual([]);
  });

  it('handles a single attempt', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', storyTitle: 'A', correct: 3, total: 4, date: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(stats.totalAttempts).toBe(1);
    expect(stats.avgPercent).toBeCloseTo(75, 5);
    expect(stats.perStory).toHaveLength(1);
    expect(stats.perStory[0]).toEqual({
      slug: 'a',
      title: 'A',
      bestCorrect: 3,
      bestTotal: 4,
      attemptCount: 1,
      lastAttemptAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('aggregates multiple attempts on the same story (best ratio, count, lastAttemptAt)', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', storyTitle: 'Old A', correct: 2, total: 4, date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'a2', storySlug: 'a', storyTitle: 'A',     correct: 3, total: 4, date: '2026-03-01T00:00:00.000Z' }),
      entry({ id: 'a3', storySlug: 'a', storyTitle: 'A mid', correct: 1, total: 4, date: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(stats.perStory).toHaveLength(1);
    const row = stats.perStory[0];
    expect(row.slug).toBe('a');
    expect(row.title).toBe('A');
    expect(row.bestCorrect).toBe(3);
    expect(row.bestTotal).toBe(4);
    expect(row.attemptCount).toBe(3);
    expect(row.lastAttemptAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('prefers higher total when ratio is tied for bestCorrect/bestTotal', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', correct: 1, total: 1, date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'a2', storySlug: 'a', correct: 4, total: 4, date: '2026-01-02T00:00:00.000Z' }),
    ]);
    expect(stats.perStory[0].bestCorrect).toBe(4);
    expect(stats.perStory[0].bestTotal).toBe(4);
  });

  it('sorts perStory by lastAttemptAt desc across multiple stories', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', storyTitle: 'A', correct: 1, total: 2, date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b1', storySlug: 'b', storyTitle: 'B', correct: 1, total: 2, date: '2026-03-01T00:00:00.000Z' }),
      entry({ id: 'c1', storySlug: 'c', storyTitle: 'C', correct: 1, total: 2, date: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(stats.perStory.map(r => r.slug)).toEqual(['b', 'c', 'a']);
  });

  it('avgPercent is mean of percentages, not sum/sum (sentinel: 1/2 + 4/4 = 75, not ~83.3)', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', correct: 1, total: 2, date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b1', storySlug: 'b', correct: 4, total: 4, date: '2026-01-02T00:00:00.000Z' }),
    ]);
    expect(stats.avgPercent).toBeCloseTo(75, 5);
    expect(stats.totalAttempts).toBe(2);
  });

  it('breaks ties on identical lastAttemptAt by storySlug ascending', () => {
    const sameDate = '2026-01-01T00:00:00.000Z';
    const stats = computeStoryStats([
      entry({ id: 'b1', storySlug: 'banana', storyTitle: 'Banana', correct: 1, total: 1, date: sameDate }),
      entry({ id: 'a1', storySlug: 'apple',  storyTitle: 'Apple',  correct: 1, total: 1, date: sameDate }),
      entry({ id: 'c1', storySlug: 'cherry', storyTitle: 'Cherry', correct: 1, total: 1, date: sameDate }),
    ]);
    expect(stats.perStory.map(r => r.slug)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('uses the title from the most-recent entry for each story', () => {
    const stats = computeStoryStats([
      entry({ id: 'a1', storySlug: 'a', storyTitle: 'Old Title', correct: 1, total: 1, date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'a2', storySlug: 'a', storyTitle: 'New Title', correct: 1, total: 1, date: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(stats.perStory[0].title).toBe('New Title');
  });

  it('does not mutate the input array', () => {
    const input: readonly StoryQuizHistoryEntry[] = Object.freeze([
      entry({ id: 'a1', storySlug: 'a', date: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b1', storySlug: 'b', date: '2026-02-01T00:00:00.000Z' }),
    ]);
    expect(() => computeStoryStats(input)).not.toThrow();
  });
});
