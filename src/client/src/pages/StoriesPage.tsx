import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StoryListItemDto } from '../types/api';
import { listStories } from '../services/storyService';
import { useProgress } from '../hooks/useProgress';
import { CATEGORY_ORDER, orderedUnique } from '../utils/categoryOrder';

function readingLevelLabel(fre: number): string {
  // Flesch Reading Ease bands (higher = easier).
  if (fre >= 90) return 'very easy';
  if (fre >= 80) return 'easy';
  if (fre >= 70) return 'fairly easy';
  if (fre >= 60) return 'standard';
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
  // Apply the shared CATEGORY_ORDER (matching StudyPage) so categories appear
  // in a deterministic, conventional order across the app rather than in
  // whatever order the API returned them in.
  const orderedCategories = orderedUnique(map.keys(), CATEGORY_ORDER);
  const ordered = new Map<string, readonly StoryListItemDto[]>();
  for (const cat of orderedCategories) {
    ordered.set(cat, map.get(cat) as readonly StoryListItemDto[]);
  }
  return ordered;
}

type StoriesLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly stories: readonly StoryListItemDto[] }
  | { readonly status: 'error'; readonly message: string };

export function StoriesPage(): React.ReactNode {
  const { isStoryRead } = useProgress();
  const [load, setLoad] = useState<StoriesLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listStories();
      if (cancelled) return;
      if (result.success) {
        setLoad({ status: 'loaded', stories: result.data });
      } else {
        setLoad({ status: 'error', message: result.error });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (load.status === 'loading') {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-gray-500 dark:text-gray-400" aria-live="polite">Loading stories…</p>
      </main>
    );
  }

  if (load.status === 'error') {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-900 dark:text-red-100"
          data-testid="stories-error"
        >
          <p><strong>Could not load stories.</strong> Please check your connection and try again.</p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">Error: {load.message}</p>
        </div>
      </main>
    );
  }

  const stories = load.stories;

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
        </p>
      </header>

      {Array.from(grouped.entries()).map(([category, list]) => {
        // HTML ids must not contain whitespace, and aria-labelledby splits on
        // whitespace to support multiple ids — so the raw category name
        // ("American Government") would silently break the label association.
        // Slugify before use.
        const categoryId = `category-${category.toLowerCase().replace(/\s+/g, '-')}`;
        return (
          <section key={category} className="mb-8" aria-labelledby={categoryId}>
            <h2
              id={categoryId}
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
                        aria-label={`Reading level: ${readingLevelLabel(s.fleschReadingEase)}`}
                      >
                        {readingLevelLabel(s.fleschReadingEase)} English
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
        );
      })}
    </main>
  );
}
