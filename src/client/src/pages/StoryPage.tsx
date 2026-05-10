import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { QuestionDto, QuizAnswer, StoryDetailDto, ApiResult } from '../types/api';
import { getStory } from '../services/storyService';
import { useAppContext } from '../context/AppContext';
import { useProgress } from '../hooks/useProgress';
import { useFetch } from '../hooks/useFetch';
import { StoryRenderer } from '../components/StoryRenderer';
import { QuizCard } from '../components/QuizCard';
import { checkAnswer } from '../utils/answerChecker';

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
 * `mode`/`index`/`answers` would carry over from one story to the next.
 *
 * The quiz exposes two opt-in modes (decision A in #85): a reveal-on-click
 * "Study" path (existing behavior, unchanged) and a typed-input "Quiz" path
 * with per-question feedback and a final results panel. The user must
 * explicitly pick one — there is no default and no Start button.
 */
interface ComprehensionQuizProps {
  readonly questions: readonly QuestionDto[];
  readonly onComplete: () => void;
  readonly onScored: (correct: number, total: number) => void;
}

type QuizMode = 'choice' | 'study' | 'quiz';
type QuizPhase = 'answering' | 'feedback';

function ComprehensionQuiz({ questions, onComplete, onScored }: ComprehensionQuizProps): React.ReactNode {
  const [mode, setMode] = useState<QuizMode>('choice');
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>('answering');
  const [answers, setAnswers] = useState<readonly QuizAnswer[]>([]);

  // StrictMode + concurrent-rendering safety: the completion effect can
  // fire twice on initial mount and could refire if upstream callbacks
  // are recreated. Persistence side effects must run exactly once per
  // transition into the done state, so a ref guards the body and is
  // reset whenever the user clicks "Try again".
  const completedRef = useRef(false);

  const studyDone = mode === 'study' && index >= questions.length;
  const quizDone = mode === 'quiz' && index >= questions.length;
  const done = studyDone || quizDone;

  const handleStudyNext = useCallback((): void => {
    setIndex(prev => prev + 1);
  }, []);

  const handleSubmit = useCallback((userAnswer: string): void => {
    setAnswers(prev => {
      const q = questions[index];
      if (!q) return prev;
      const isCorrect = checkAnswer(userAnswer, q.answers);
      return [
        ...prev,
        {
          questionId: q.id,
          questionText: q.text,
          userAnswer,
          acceptedAnswers: q.answers,
          isCorrect,
        },
      ];
    });
    setPhase('feedback');
  }, [questions, index]);

  const handleNextOrResults = useCallback((): void => {
    setIndex(prev => prev + 1);
    setPhase('answering');
  }, []);

  const handleTryAgain = useCallback((): void => {
    setMode('choice');
    setIndex(0);
    setPhase('answering');
    setAnswers([]);
    completedRef.current = false;
  }, []);

  useEffect(() => {
    if (!done) return;
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
    if (quizDone) {
      const correct = answers.filter(a => a.isCorrect).length;
      onScored(correct, answers.length);
    }
  }, [done, quizDone, answers, onComplete, onScored]);

  if (mode === 'choice') {
    return (
      <div className="flex flex-col sm:flex-row gap-3" role="group" aria-label="Choose how to work through the comprehension questions">
        <button
          type="button"
          onClick={() => setMode('study')}
          className="flex-1 bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-slate-600 font-medium px-4 py-3 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="continue-with-study"
        >
          Continue with Study
          <span className="block text-xs font-normal text-gray-600 dark:text-gray-400 mt-1">
            Reveal each answer on click ({questions.length} question{questions.length === 1 ? '' : 's'})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode('quiz')}
          className="flex-1 bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100 border border-blue-300 dark:border-blue-700 font-medium px-4 py-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="continue-with-quiz"
        >
          Continue with Quiz
          <span className="block text-xs font-normal text-blue-800 dark:text-blue-300 mt-1">
            Type each answer; see your score at the end
          </span>
        </button>
      </div>
    );
  }

  if (mode === 'study') {
    const current = index < questions.length ? questions[index] : null;
    return (
      <>
        {current && (
          <div className="flex justify-center">
            <QuizCard
              question={current}
              onNext={handleStudyNext}
              questionNumber={index + 1}
              totalQuestions={questions.length}
              mode="study"
            />
          </div>
        )}
        {studyDone && (
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

  // mode === 'quiz'
  const current = index < questions.length ? questions[index] : null;
  const lastAnswer = answers.length > 0 ? answers[answers.length - 1] : null;
  const isLastQuestion = index === questions.length - 1;
  const correctCount = answers.filter(a => a.isCorrect).length;

  if (quizDone) {
    return (
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-md p-6"
        role="status"
        aria-live="polite"
        data-testid="story-quiz-results"
      >
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Quiz complete
          </h3>
          <p className="text-lg text-gray-800 dark:text-gray-100">
            <span className="font-bold" data-testid="story-quiz-score">{correctCount}</span> out of{' '}
            <span className="font-bold">{answers.length}</span> correct
          </p>
        </div>

        <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Review your answers</h4>
        <ol className="space-y-3">
          {answers.map((a, i) => (
            <li
              key={a.questionId}
              className={`p-4 rounded-lg border-l-4 ${
                a.isCorrect
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
                  : 'border-red-500 bg-red-50 dark:bg-red-950/40'
              }`}
              data-testid={a.isCorrect ? 'story-review-correct' : 'story-review-incorrect'}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`text-lg font-bold ${a.isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}
                  aria-hidden="true"
                >
                  {a.isCorrect ? '✓' : '✗'}
                </span>
                <span className="sr-only">{a.isCorrect ? 'Correct' : 'Incorrect'}</span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {i + 1}. {a.questionText}
                  </p>
                  <p className={`text-sm mt-1 ${a.isCorrect ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    <span className="font-medium">Your answer:</span> {a.userAnswer}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                    <span className="font-medium">Accepted:</span> {a.acceptedAnswers.join(' · ')}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={handleTryAgain}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="story-quiz-try-again"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      {phase === 'answering' && current && (
        <div className="flex justify-center">
          <QuizCard
            question={current}
            onNext={handleStudyNext}
            questionNumber={index + 1}
            totalQuestions={questions.length}
            mode="quiz"
            onSubmitAnswer={handleSubmit}
          />
        </div>
      )}
      {phase === 'feedback' && lastAnswer && (
        <div
          className={`rounded-lg border-l-4 p-4 ${
            lastAnswer.isCorrect
              ? 'border-green-500 bg-green-50 dark:bg-green-950/40'
              : 'border-red-500 bg-red-50 dark:bg-red-950/40'
          }`}
          role="status"
          aria-live="polite"
          data-testid="story-quiz-feedback"
        >
          <div className="flex items-start gap-2">
            <span
              className={`text-xl font-bold ${lastAnswer.isCorrect ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}
              aria-hidden="true"
            >
              {lastAnswer.isCorrect ? '✓' : '✗'}
            </span>
            <div className="flex-1">
              <p className={`font-semibold ${lastAnswer.isCorrect ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
                {lastAnswer.isCorrect ? 'Correct' : 'Not quite'}
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">
                <span className="font-medium">Your answer:</span> {lastAnswer.userAnswer}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                <span className="font-medium">Accepted:</span> {lastAnswer.acceptedAnswers.join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleNextOrResults}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={isLastQuestion ? 'story-quiz-see-results' : 'story-quiz-next-question'}
          >
            {isLastQuestion ? 'See results' : 'Next question'}
          </button>
        </div>
      )}
    </>
  );
}

export function StoryPage(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const { state } = useAppContext();
  const { markStoryRead, isStoryRead, addStoryQuizResult } = useProgress();

  const stateId = state.selectedStateId ?? undefined;

  const fetchFn = useCallback(async (): Promise<ApiResult<StoryDetailDto>> => {
    if (!slug) {
      return { success: false, error: 'no-slug' } as const;
    }
    return getStory(slug, stateId);
  }, [slug, stateId]);

  const { data: storyData, isLoading, error } = useFetch<StoryDetailDto>(fetchFn, [slug, stateId]);

  // Distinguish "story not found" (404) from a transient error (500, timeout,
  // offline). useFetch keeps the previous successful `data` across a failed
  // re-fetch, so we read both and decide:
  //   - error contains '404' or 'Not Found' => not-found UI
  //   - any other error                     => transient-error UI
  //   - otherwise                           => render the story
  const isNotFound = error !== null && /404|Not Found|no-slug|not-found/i.test(error);
  const isTransientError = error !== null && !isNotFound;
  const story = error ? null : storyData;

  const showStatePreamble = useMemo(
    () => Boolean(story?.stateAwarePreamble && state.selectedState),
    [story, state.selectedState]
  );

  const handleQuizComplete = useCallback((): void => {
    if (story?.slug && !isStoryRead(story.slug)) {
      markStoryRead(story.slug);
    }
  }, [story, isStoryRead, markStoryRead]);

  const handleQuizScored = useCallback((correct: number, total: number): void => {
    if (!story?.slug) return;
    addStoryQuizResult({
      storySlug: story.slug,
      storyTitle: story.title,
      correct,
      total,
    });
  }, [story, addStoryQuizResult]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <p className="text-gray-500 dark:text-gray-400" aria-live="polite">Loading story…</p>
      </main>
    );
  }

  if (isTransientError) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-red-900 dark:text-red-100"
          data-testid="story-error"
        >
          <p><strong>Could not load this story.</strong> Please check your connection and try again.</p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">Error: {error}</p>
        </div>
        <Link to="/stories" className="text-blue-700 dark:text-blue-300 underline mt-3 inline-block">
          ← Back to all stories
        </Link>
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
                {' '}
                {stateInfo.representatives.length === 1
                  ? <>Your state&apos;s sole U.S. representative is <strong>{stateInfo.representatives[0]}</strong>.</>
                  : <>Your state has <strong>{stateInfo.representatives.length}</strong> members in the U.S. House of Representatives — your specific representative depends on your congressional district.</>
                }
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
          onScored={handleQuizScored}
        />
      </section>
    </main>
  );
}
