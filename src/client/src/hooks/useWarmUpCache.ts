import { useEffect, useRef } from 'react';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';
import { listStories, getStory } from '../services/storyService';

/**
 * Eagerly fetches all key API endpoints so the service worker caches
 * responses for offline use. Re-runs whenever the user picks a different
 * state (e.g. first-time users who land with `stateId = null` and then
 * choose a state) so the state-specific data also ends up in cache.
 *
 * Waits for the service worker to be ready before issuing requests so
 * that the responses actually pass through the SW and end up in its
 * runtime caches. Without this wait, the first navigation can race the
 * SW registration and leave the cache empty — making the very next
 * offline reload fail.
 */
export function useWarmUpCache(stateId: number | null): void {
  const lastWarmedStateId = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (lastWarmedStateId.current === stateId) return;
    lastWarmedStateId.current = stateId;

    void (async () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        try {
          // Bounded wait — never block the UI if the SW takes too long.
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<void>(resolve => {
              timeoutHandle = setTimeout(resolve, 5000);
            }),
          ]);
        } catch {
          // Ignore — fall through and warm the cache anyway.
        } finally {
          if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
          }
        }
      }
      // Warm the questions, states, and the stories index. Promise.allSettled
      // is the right primitive here — best-effort fire-all, never reject — so
      // a single 4xx/5xx/network failure on one warm-up doesn't block the
      // story-detail fan-out below.
      //
      // Known limitation (round-4 review fix #2): fetch has no built-in
      // timeout, so a single request that hangs indefinitely would still
      // pause this warm-up at the await below. This is acceptable for now
      // because warm-up runs in the background after the page is already
      // interactive; user-facing reads use their own typed result paths.
      // Adding an AbortController-based per-request timeout is tracked as a
      // follow-up; it would let us bound this loop end-to-end.
      //
      // The index promise is captured in a named variable (round-4 review
      // fix #3) instead of being read out of the Promise.allSettled result
      // by array index — relying on `settled[settled.length - 1]` was
      // brittle to future reorderings of the warm-up batch.
      const indexPromise = listStories();
      await Promise.allSettled([
        getAllQuestions(stateId ?? undefined),
        get6520Questions(stateId ?? undefined),
        getAllStates(),
        stateId ? getStateById(stateId) : Promise.resolve(undefined),
        indexPromise,
      ]);
      const indexResult = await indexPromise.catch(
        () => ({ success: false as const, error: 'fetch-failed' as const })
      );

      // Use the just-warmed stories index to fan out to every story
      // detail. Two cost controls:
      //   1. Bounded concurrency (CONCURRENCY=4 at a time) so a large
      //      catalog can't burst-fire dozens of parallel requests on
      //      a single page load.
      //   2. Only pass `stateId` for stories whose `stateAwarePreamble`
      //      is true. The other stories don't vary by state, so caching
      //      a per-state copy of each is wasted SW cache space.
      if (indexResult && 'success' in indexResult && indexResult.success) {
        const items = indexResult.data;
        const concurrency = 4;
        for (let i = 0; i < items.length; i += concurrency) {
          const chunk = items.slice(i, i + concurrency);
          await Promise.allSettled(
            chunk.map(item =>
              getStory(item.slug, item.stateAwarePreamble ? stateId ?? undefined : undefined)
            )
          );
        }
      }
    })();
  }, [stateId]);
}
