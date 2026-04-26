import { useEffect, useRef } from 'react';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';

/**
 * Eagerly fetches all key API endpoints on mount so the service worker
 * caches responses for offline use. Runs once regardless of which page
 * the user visits first.
 *
 * Waits for the service worker to be ready before issuing requests so
 * that the responses actually pass through the SW and end up in its
 * runtime caches. Without this wait, the first navigation can race the
 * SW registration and leave the cache empty — making the very next
 * offline reload fail.
 */
export function useWarmUpCache(stateId: number | null): void {
  const warmedUp = useRef(false);

  useEffect(() => {
    if (warmedUp.current) return;
    warmedUp.current = true;

    void (async () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          // Bounded wait — never block the UI if the SW takes too long.
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(resolve => setTimeout(resolve, 5000)),
          ]);
        } catch {
          // Ignore — fall through and warm the cache anyway.
        }
      }
      await Promise.allSettled([
        getAllQuestions(stateId ?? undefined),
        get6520Questions(stateId ?? undefined),
        getAllStates(),
        ...(stateId ? [getStateById(stateId)] : []),
      ]);
    })();
  }, [stateId]);
}
