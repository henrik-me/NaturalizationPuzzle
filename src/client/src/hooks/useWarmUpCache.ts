import { useEffect, useRef } from 'react';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';

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
