import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StoryListItemDto } from '../types/api';
import { listStories } from '../services/storyService';
import { useProgress } from '../hooks/useProgress';

function readingLevelLabel(fk: number): string {
  if (fk >= 90) return 'very easy';
  if (fk >= 80) return 'easy';
  if (fk >= 70) return 'fairly easy';
  if (fk >= 60) return 'standard';
  return 'harder';
}

function groupByCategory(stories: readonly StoryListItemDto[]): Map<string, readonly StoryListItemDto[]> {
  const map = new Map<string, StoryListItemDto[]>();
  for (const s of stories) {
    const arr = map.get(s.category);
    if (arr) {
      arr.push(s);
    } else {
      map.set(s.category, [s]);
    }
  }
  // Make the inner arrays readonly to the outside.
  return new Map(Array.from(map.entries(), ([k, v]) => [k, v as readonly StoryListItemDto[]]));
}

export function StoriesPage(): React.ReactNode {
  const { storiesRead, isStoryRead } = useProgress();
  const [stories, setStories] = useState<readonly StoryListItemDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // listStories swallows network/HTTP errors and returns []; an empty
      // result is rendered as the "no stories yet" empty state below.
      const result = await listStories();
      if (!cancelled) setStories(result);
    })();
    return () => { cancelled = true; };
  }, []);

  if (stories === null) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-gray-500 dark:text-gray-400" aria-live="polite">Loading stories…</p>
      </main>
    );
  }

  if (stories.length === 0) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-gray-700 dark:text-gray-200">No stories are available right now.</p>
      </main>
    );
  }

  const total = stories.length;
  const readCount = stories.filter(s => isStoryRead(s.slug)).length;
  const grouped = groupByCategory(stories);

  return (
    <main className="max-w-4xl mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stories</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Short, cited narratives that connect the civics test questions into the bigger picture.
        </p>
        <p
          className="mt-3 text-sm text-gray-700 dark:text-gray-300"
          aria-live="polite"
          data-testid="stories-progress"
        >
          {readCount} of {total} stories read
          {storiesRead.length > 0 && ' — '}
          <span className="sr-only">{readCount} out of {total}</span>
        </p>
      </header>

      {Array.from(grouped.entries()).map(([category, list]) => (
        <section key={category} className="mb-8" aria-labelledby={`category-${category}`}>
          <h2
            id={`category-${category}`}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3"
          >
            {category}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map(s => (
              <li key={s.slug}>
                <Link
                  to={`/stories/${s.slug}`}
                  className="block bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 border border-gray-200 dark:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  data-testid={`story-card-${s.slug}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {s.title}
                    </h3>
                    {isStoryRead(s.slug) && (
                      <span
                        className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs px-2 py-0.5 rounded-full"
                        aria-label="Already read"
                      >
                        ✓ Read
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.subCategory}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      ~{s.estReadMinutes} min
                    </span>
                    <span
                      className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded"
                      aria-label={`Reading level: ${readingLevelLabel(s.readingLevelFleschKincaid)}`}
                    >
                      {readingLevelLabel(s.readingLevelFleschKincaid)} English
                    </span>
                    <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {s.questionCount} questions
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
