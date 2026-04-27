import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { QuestionDto } from '../types/api';
import { getAllQuestions } from '../services/questionService';
import { useAppContext } from '../context/AppContext';
import { QuizCard } from '../components/QuizCard';
import { TagFilterPanel } from '../components/TagFilterPanel';
import { useProgress } from '../hooks/useProgress';

type ScopeFilter = 'all' | '6520';
type StudiedFilter = 'all' | 'unstudied' | 'studied';
const ALL_CATEGORIES = '__all__';
const ALL_SUBCATEGORIES = '__all__';

// Preferred display order for the three known civics-test categories.
// Any category present in loaded data but not in this list falls back
// to alphabetical order at the end, so unexpected backend changes don't
// silently drop options.
const CATEGORY_ORDER: readonly string[] = [
  'American Government',
  'American History',
  'Integrated Civics',
];

function matchesSearch(question: QuestionDto, terms: readonly string[]): boolean {
  const haystack = `${question.text} ${question.answers.join(' ')} ${question.category} ${question.subCategory}`.toLowerCase();
  return terms.every(term => haystack.includes(term));
}

function orderedUnique(values: readonly string[], preferred: readonly string[]): readonly string[] {
  const seen = new Set(values);
  const ordered: string[] = [];
  for (const p of preferred) {
    if (seen.has(p)) {
      ordered.push(p);
      seen.delete(p);
    }
  }
  for (const remaining of [...seen].sort()) {
    ordered.push(remaining);
  }
  return ordered;
}

export function StudyPage(): React.ReactNode {
  const { state } = useAppContext();
  const { studiedQuestionIds, markStudied, studiedCount } = useProgress();
  const [allQuestions, setAllQuestions] = useState<readonly QuestionDto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(state.selectedStateId !== null);
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [subCategory, setSubCategory] = useState<string>(ALL_SUBCATEGORIES);
  const [studiedFilter, setStudiedFilter] = useState<StudiedFilter>('all');
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(() => new Set());
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!state.selectedStateId) return;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      const data = await getAllQuestions(state.selectedStateId ?? undefined);
      setAllQuestions(data);
      setCurrentIndex(0);
      setIsLoading(false);
    };
    void load();
  }, [state.selectedStateId]);

  // Scope (All / 65/20) is filtered client-side off the single fetched dataset.
  // All subsequent dimension options derive from the scoped set so e.g. the
  // Category dropdown only lists categories that exist in the active scope.
  const scopedQuestions = useMemo((): readonly QuestionDto[] => {
    return scope === '6520' ? allQuestions.filter(q => q.is6520Designated) : allQuestions;
  }, [allQuestions, scope]);

  const categoryOptions = useMemo((): readonly string[] => {
    return orderedUnique(scopedQuestions.map(q => q.category), CATEGORY_ORDER);
  }, [scopedQuestions]);

  // Effective category falls back to ALL when the stored selection is no
  // longer present in the loaded dataset (e.g. after a scope/state change
  // dropped that category). Without this fallback the controlled <select>
  // would render blank (selectedIndex === -1) and the user would see an
  // active-but-invisible filter producing an empty list.
  const effectiveCategory = category !== ALL_CATEGORIES && !categoryOptions.includes(category)
    ? ALL_CATEGORIES
    : category;

  const subCategoryOptions = useMemo((): readonly string[] => {
    if (effectiveCategory === ALL_CATEGORIES) return [];
    const subs = scopedQuestions.filter(q => q.category === effectiveCategory).map(q => q.subCategory);
    return orderedUnique(subs, []);
  }, [scopedQuestions, effectiveCategory]);

  const effectiveSubCategory = subCategory !== ALL_SUBCATEGORIES && !subCategoryOptions.includes(subCategory)
    ? ALL_SUBCATEGORIES
    : subCategory;

  const studiedSet = useMemo((): ReadonlySet<number> => new Set(studiedQuestionIds), [studiedQuestionIds]);

  // Pipeline up to (and including) Studied. Tag options derive from this so
  // the chips a user sees only reflect what they can realistically narrow to
  // given Scope + Category + SubCategory + Studied. Search and the tag filter
  // itself do NOT influence option visibility, matching standard faceted-search UX.
  const preTagQuestions = useMemo((): readonly QuestionDto[] => {
    let list: readonly QuestionDto[] = scopedQuestions;
    if (effectiveCategory !== ALL_CATEGORIES) {
      list = list.filter(q => q.category === effectiveCategory);
    }
    if (effectiveSubCategory !== ALL_SUBCATEGORIES) {
      list = list.filter(q => q.subCategory === effectiveSubCategory);
    }
    if (studiedFilter === 'studied') {
      list = list.filter(q => studiedSet.has(q.id));
    } else if (studiedFilter === 'unstudied') {
      list = list.filter(q => !studiedSet.has(q.id));
    }
    return list;
  }, [scopedQuestions, effectiveCategory, effectiveSubCategory, studiedFilter, studiedSet]);

  // Tag options are the union of every tag present in `preTagQuestions`. A tag
  // a user picked earlier may have just been narrowed away by another filter;
  // that orphan is masked from the render via `effectiveSelectedTags` AND
  // pruned from `selectedTags` by the effect below so it does not silently
  // come back when other filters are widened.
  const availableTagSet = useMemo((): ReadonlySet<string> => {
    const set = new Set<string>();
    for (const q of preTagQuestions) {
      for (const tag of q.tags) set.add(tag);
    }
    return set;
  }, [preTagQuestions]);

  const availableTags = useMemo((): readonly string[] => [...availableTagSet], [availableTagSet]);

  // Persistently prune any selected tags whose chip is no longer offered (because
  // a narrower category/scope/studied filter eliminated every question carrying
  // them). We use the React-idiomatic "adjust state during render" pattern keyed
  // off `availableTagSet` identity so the orphan tag does NOT silently come back
  // when the user widens the other filters again — it is a deliberate "removed"
  // state once narrowed away. Tracking the last-seen set via state (not a ref)
  // is what React's docs recommend for this pattern; the guarded equality check
  // makes the adjustment a one-shot per change with no infinite loop.
  const [lastAvailableTagSet, setLastAvailableTagSet] = useState(availableTagSet);
  if (lastAvailableTagSet !== availableTagSet) {
    setLastAvailableTagSet(availableTagSet);
    if (selectedTags.size > 0) {
      let everyPresent = true;
      for (const t of selectedTags) {
        if (!availableTagSet.has(t)) { everyPresent = false; break; }
      }
      if (!everyPresent) {
        const next = new Set<string>();
        for (const t of selectedTags) {
          if (availableTagSet.has(t)) next.add(t);
        }
        setSelectedTags(next);
      }
    }
  }

  // Orphan tags are also masked at render time so the very render that triggers
  // the prune doesn't briefly include them in the filter result.
  const effectiveSelectedTags = useMemo((): ReadonlySet<string> => {
    let everyPresent = true;
    for (const t of selectedTags) {
      if (!availableTagSet.has(t)) { everyPresent = false; break; }
    }
    if (everyPresent) return selectedTags;
    const next = new Set<string>();
    for (const t of selectedTags) {
      if (availableTagSet.has(t)) next.add(t);
    }
    return next;
  }, [selectedTags, availableTagSet]);

  const filteredQuestions = useMemo((): readonly QuestionDto[] => {
    let list: readonly QuestionDto[] = preTagQuestions;
    if (effectiveSelectedTags.size > 0) {
      // Group active tags by namespace. Within a namespace = OR; across
      // namespaces = AND. A namespace with no chips selected is a no-op.
      const byNamespace = new Map<string, string[]>();
      for (const tag of effectiveSelectedTags) {
        const idx = tag.indexOf(':');
        const ns = idx > 0 ? tag.slice(0, idx) : tag;
        const bucket = byNamespace.get(ns) ?? [];
        bucket.push(tag);
        byNamespace.set(ns, bucket);
      }
      list = list.filter(q => {
        const qTags = new Set(q.tags);
        for (const tagsInNs of byNamespace.values()) {
          if (!tagsInNs.some(t => qTags.has(t))) return false;
        }
        return true;
      });
    }
    const trimmed = searchText.trim().toLowerCase();
    if (trimmed) {
      const terms = trimmed.split(/\s+/);
      list = list.filter(q => matchesSearch(q, terms));
    }
    return list;
  }, [preTagQuestions, effectiveSelectedTags, searchText]);

  // Clamp the current index to the filtered set without an effect if the
  // available questions shrink for any reason (e.g. a tighter filter is
  // applied while the user was at index 5 of a now-2-item list).
  const safeIndex = filteredQuestions.length === 0
    ? 0
    : Math.min(currentIndex, filteredQuestions.length - 1);

  const handleScopeChange = useCallback((next: ScopeFilter): void => {
    setScope(next);
    setCurrentIndex(0);
  }, []);

  const handleCategoryChange = useCallback((value: string): void => {
    setCategory(value);
    setSubCategory(ALL_SUBCATEGORIES);
    setCurrentIndex(0);
  }, []);

  const handleSubCategoryChange = useCallback((value: string): void => {
    setSubCategory(value);
    setCurrentIndex(0);
  }, []);

  const handleStudiedFilterChange = useCallback((next: StudiedFilter): void => {
    setStudiedFilter(next);
    setCurrentIndex(0);
  }, []);

  const handleToggleTag = useCallback((tag: string): void => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    setCurrentIndex(0);
  }, []);

  const handleClearNamespace = useCallback((namespace: string): void => {
    setSelectedTags(prev => {
      const next = new Set<string>();
      for (const t of prev) {
        if (!t.startsWith(`${namespace}:`)) next.add(t);
      }
      return next;
    });
    setCurrentIndex(0);
  }, []);

  const handleSearchChange = useCallback((value: string): void => {
    setSearchText(value);
    setCurrentIndex(0);
  }, []);

  const clearAllFilters = useCallback((): void => {
    setCategory(ALL_CATEGORIES);
    setSubCategory(ALL_SUBCATEGORIES);
    setStudiedFilter('all');
    setSelectedTags(new Set());
    setSearchText('');
    setCurrentIndex(0);
  }, []);

  const hasActiveFilter =
    effectiveCategory !== ALL_CATEGORIES ||
    effectiveSubCategory !== ALL_SUBCATEGORIES ||
    studiedFilter !== 'all' ||
    effectiveSelectedTags.size > 0 ||
    searchText.trim().length > 0;

  const handleNext = useCallback((): void => {
    const current = filteredQuestions[safeIndex];
    if (current) {
      markStudied(current.id);
    }
    setCurrentIndex(prev => {
      const len = filteredQuestions.length;
      if (len === 0) return 0;
      return (prev + 1) % len;
    });
  }, [filteredQuestions, safeIndex, markStudied]);

  if (!state.selectedStateId) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Welcome!</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Please select your state in{' '}
          <Link to="/settings" className="text-blue-600 dark:text-blue-400 underline">Settings</Link>
          {' '}to get started.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading questions">
        <p className="text-gray-500 dark:text-gray-400">Loading questions...</p>
      </div>
    );
  }

  const currentQuestion = filteredQuestions[safeIndex];
  const studiedInCurrentSet = filteredQuestions.filter(q => studiedSet.has(q.id)).length;
  const isCurrentStudied = currentQuestion ? studiedSet.has(currentQuestion.id) : false;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Study Mode</h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleScopeChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              scope === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
            aria-pressed={scope === 'all'}
          >
            All 128
          </button>
          <button
            onClick={() => handleScopeChange('6520')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              scope === '6520'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
            aria-pressed={scope === '6520'}
          >
            65/20 (20 Questions)
          </button>
        </div>
      </div>

      {/* Filter controls */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
        <div>
          <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Category
          </label>
          <select
            id="category-filter"
            value={effectiveCategory}
            onChange={e => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={ALL_CATEGORIES}>All categories</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="subcategory-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Subcategory
          </label>
          <select
            id="subcategory-filter"
            value={effectiveSubCategory}
            onChange={e => handleSubCategoryChange(e.target.value)}
            disabled={effectiveCategory === ALL_CATEGORIES}
            aria-disabled={effectiveCategory === ALL_CATEGORIES}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value={ALL_SUBCATEGORIES}>All subcategories</option>
            {subCategoryOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <span id="studied-filter-label" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Studied status
          </span>
          <div role="group" aria-labelledby="studied-filter-label" className="inline-flex rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600">
            {(['all', 'unstudied', 'studied'] as const).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => handleStudiedFilterChange(opt)}
                aria-pressed={studiedFilter === opt}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  studiedFilter === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {opt === 'all' ? 'All' : opt === 'unstudied' ? 'Unstudied' : 'Studied'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tag filters (people, wars, documents, time period) */}
      <TagFilterPanel
        availableTags={availableTags}
        selectedTags={effectiveSelectedTags}
        onToggleTag={handleToggleTag}
        onClearNamespace={handleClearNamespace}
      />

      {/* Search box */}
      <div className="mb-4">
        <label htmlFor="question-search" className="sr-only">Search questions</label>
        <input
          id="question-search"
          type="search"
          placeholder="Search questions or answers..."
          value={searchText}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Search questions by keyword"
        />
      </div>

      {/* Progress indicator. Denominator is the current filtered set so the
          bar reflects "how much of what you're looking at have you studied";
          the trailing total stays grounded in the global pool. */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-3 mb-6">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
          <span>
            {studiedInCurrentSet} of {filteredQuestions.length} studied
            {searchText.trim() && ` (matching "${searchText.trim()}")`}
          </span>
          <span>{studiedCount} total studied</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${filteredQuestions.length > 0 ? (studiedInCurrentSet / filteredQuestions.length) * 100 : 0}%` }}
          />
        </div>
        {isCurrentStudied && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">✓ You've studied this question before</p>
        )}
      </div>

      {currentQuestion ? (
        <div className="flex justify-center">
          <QuizCard
            key={currentQuestion.id}
            question={currentQuestion}
            onNext={handleNext}
            questionNumber={safeIndex + 1}
            totalQuestions={filteredQuestions.length}
          />
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
          <p className="text-gray-500 dark:text-gray-400">
            {hasActiveFilter
              ? 'No questions match the current filters.'
              : 'No questions available.'}
          </p>
          {hasActiveFilter && (
            <button
              onClick={clearAllFilters}
              className="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </main>
  );
}
