import type { StoryQuizHistoryEntry } from '../hooks/useProgress';

export interface PerStoryStat {
  readonly slug: string;
  readonly title: string;
  readonly bestCorrect: number;
  readonly bestTotal: number;
  readonly attemptCount: number;
  readonly lastAttemptAt: string;
}

export interface StoryStats {
  readonly totalAttempts: number;
  readonly avgPercent: number;
  readonly perStory: readonly PerStoryStat[];
}

function ratio(entry: StoryQuizHistoryEntry): number {
  return entry.total > 0 ? entry.correct / entry.total : 0;
}

export function computeStoryStats(entries: readonly StoryQuizHistoryEntry[]): StoryStats {
  const totalAttempts = entries.length;

  if (totalAttempts === 0) {
    return { totalAttempts: 0, avgPercent: 0, perStory: [] };
  }

  const sumPercent = entries.reduce((acc, e) => acc + ratio(e) * 100, 0);
  const avgPercent = sumPercent / totalAttempts;

  const groups = new Map<string, StoryQuizHistoryEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.storySlug);
    if (list) {
      list.push(entry);
    } else {
      groups.set(entry.storySlug, [entry]);
    }
  }

  const perStory: PerStoryStat[] = [];
  for (const [slug, group] of groups) {
    let mostRecent = group[0];
    let best = group[0];
    for (const entry of group) {
      if (entry.date > mostRecent.date) {
        mostRecent = entry;
      }
      const bestRatio = ratio(best);
      const entryRatio = ratio(entry);
      if (entryRatio > bestRatio) {
        best = entry;
      } else if (entryRatio === bestRatio) {
        if (entry.total > best.total) {
          best = entry;
        } else if (entry.total === best.total && entry.date > best.date) {
          best = entry;
        }
      }
    }
    perStory.push({
      slug,
      title: mostRecent.storyTitle,
      bestCorrect: best.correct,
      bestTotal: best.total,
      attemptCount: group.length,
      lastAttemptAt: mostRecent.date,
    });
  }

  perStory.sort((a, b) => {
    if (a.lastAttemptAt > b.lastAttemptAt) return -1;
    if (a.lastAttemptAt < b.lastAttemptAt) return 1;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });

  return { totalAttempts, avgPercent, perStory };
}
