import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { QuestionDto, StoryDetailDto } from '../types/api';
import { getStory } from '../services/storyService';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../hooks/useProgress';
import { useFetch } from '../hooks/useFetch';
import { StoryRenderer } from '../components/StoryRenderer';
import { QuizCard } from '../components/QuizCard';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/**
 * Defense in depth: the server (`StoryParser.ValidateSourceUrl`) rejects
 * unsafe source URLs at parse time, but the client renders the URL into a
 * raw `href` attribute. Validating again here ensures that a misconfigured
 * server, a future change that loosens the parser, or a sources.json that
 * sneaks past validation cannot turn the source list into an XSS vector.
 */
function isSafeSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * The comprehension quiz lives in its own child component so the parent
 * can reset its state by changing `key={slug}`. React Router reuses the
 * same `StoryPage` instance across route changes; without the key reset,
 * `quizStarted`/`quizIndex` would carry over from one story to the next.
 */
interface ComprehensionQuizProps {
  readonly questions: readonly QuestionDto[];
  readonly onComplete: () => void;
}

function ComprehensionQuiz({ questions, onComplete }: ComprehensionQuizProps): React.ReactNode {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);

  const onNext = useCallback((): void => {
    setIndex(prev => prev + 1);
  }, []);

  const done = started && index >= questions.length;

  // Final-diff Copilot review fix: don't call onComplete from inside the
  // setIndex updater callback — under React StrictMode (and concurrent
  // rendering) the updater can run twice, double-invoking onComplete.
  // The effect runs once per state transition into the done state.
  useEffect(() => {
    if (done) {
      onComplete();
    }
  }, [done, onComplete]);

  const current = started && index < questions.length ? questions[index] : null;

  return (
    <>
      {!started && (
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="start-comprehension-quiz"
        >
          Start the comprehension quiz ({questions.length} question{questions.length === 1 ? '' : 's'})
        </button>
      )}
      {current && (
        <div className="flex justify-center">
          <QuizCard
            question={current}
            onNext={onNext}
            questionNumber={index + 1}
            totalQuestions={questions.length}
            mode="study"
          />
        </div>
      )}
      {done && (
        <div
          className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm"
          role="status"
          aria-live="polite"
          data-testid="story-quiz-done"
        >
          <p className="text-green-900 dark:text-green-100">
            <strong>Done!</strong> You worked through all {questions.length} comprehension question{questions.length === 1 ? '' : 's'} for this story.
          </p>
          <Link to="/stories" className="text-blue-700 dark:text-blue-300 underline mt-2 inline-block">
            ← Back to all stories
          </Link>
        </div>
      )}
    </>
  );
}

export function StoryPage(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const { state } = useAppContext();
  const { markStoryRead, isStoryRead } = useProgress();

  const stateId = state.selectedStateId ?? undefined;

  const fetchFn = useCallback(async () => {
    const detail = slug ? await getStory(slug, stateId) : null;
    return detail
      ? ({ success: true, data: detail } as const)
      : ({ success: false, error: 'not-found' } as const);
  }, [slug, stateId]);

  const { data: storyData, isLoading, error } = useFetch<StoryDetailDto>(fetchFn, [slug, stateId]);

  // Final-diff Copilot review fix: useFetch keeps the previous successful
  // `data` when a subsequent fetch fails. That would leave stale story
  // content visible after navigating from a known slug to an unknown one.
  // Treat any error as not-found (the only error path here is the
  // 'not-found' sentinel returned by fetchFn above).
  const story = error ? null : storyData;

  const showStatePreamble = useMemo(
    () => Boolean(story?.stateAwarePreamble && state.selectedState),
    [story, state.selectedState]
  );

  const handleQuizComplete = useCallback(() => {
    if (story?.slug && !isStoryRead(story.slug)) {
      markStoryRead(story.slug);
    }
  }, [story, isStoryRead, markStoryRead]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <p className="text-gray-500 dark:text-gray-400" aria-live="polite">Loading story…</p>
      </main>
    );
  }

  if (!story) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <p className="text-gray-700 dark:text-gray-200">This story could not be found.</p>
        <Link to="/stories" className="text-blue-700 dark:text-blue-300 underline mt-3 inline-block">
          ← Back to all stories
        </Link>
      </main>
    );
  }

  const stateInfo = state.selectedState;

  return (
    <main className="max-w-3xl mx-auto p-4">
      <Link to="/stories" className="text-sm text-blue-700 dark:text-blue-300 underline">
        ← Back to all stories
      </Link>

      <header className="mt-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {story.category} › {story.subCategory}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{story.title}</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          ~{story.estReadMinutes} min read · {story.questions.length} comprehension question{story.questions.length === 1 ? '' : 's'}
        </p>
      </header>

      {showStatePreamble && stateInfo && (
        <aside
          className="mt-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm"
          data-testid="state-preamble"
        >
          <p className="text-gray-800 dark:text-gray-200">
            <strong>You live in {stateInfo.name}.</strong> Your two U.S. senators are{' '}
            <strong>{stateInfo.senatorOne}</strong> and <strong>{stateInfo.senatorTwo}</strong>.
            {stateInfo.representatives.length > 0 && (
              <>
                {' '}You are represented in the House by{' '}
                <strong>
                  {stateInfo.representatives.length === 1
                    ? stateInfo.representatives[0]
                    : `${stateInfo.representatives.length} representatives`}
                </strong>
                .
              </>
            )}
          </p>
        </aside>
      )}

      <section className="mt-6">
        <StoryRenderer markdown={story.bodyMarkdown} sources={story.sources} />
      </section>

      {story.modelMemoryUsed && (
        <aside
          className="mt-6 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm"
          data-testid="model-memory-disclosure"
          role="note"
        >
          <p className="text-amber-900 dark:text-amber-100">
            <strong>Note:</strong> Parts of this story were drafted from the language model&apos;s general
            knowledge rather than from a cited external source. We recommend verifying any details
            against the listed references before test day.
          </p>
        </aside>
      )}

      <section className="mt-8" aria-labelledby="story-sources-heading">
        <h2 id="story-sources-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Sources
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          {story.sources.map(s => (
            <li
              key={s.id}
              id={`story-source-${s.id}`}
              className="text-gray-700 dark:text-gray-300"
            >
              {isSafeSourceUrl(s.url) ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 dark:text-blue-300 underline"
                  aria-label={`${s.title} (opens in new tab)`}
                >
                  {s.title}
                </a>
              ) : (
                <span data-testid={`source-url-blocked-${s.id}`}>{s.title}</span>
              )}
              <span className="text-gray-500 dark:text-gray-400"> — {s.type}</span>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 italic">
                &ldquo;{s.supportSnippet}&rdquo;
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="story-quiz-heading">
        <h2 id="story-quiz-heading" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Check your understanding
        </h2>
        <ComprehensionQuiz
          key={story.slug}
          questions={story.questions}
          onComplete={handleQuizComplete}
        />
      </section>
    </main>
  );
}
