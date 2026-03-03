import { useEffect, useRef } from 'react';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';

/**
 * Eagerly fetches all key API endpoints on mount so the service worker
 * caches responses for offline use. Runs once regardless of which page
 * the user visits first.
 */
export function useWarmUpCache(stateId: number | null): void {
  const warmedUp = useRef(false);

  useEffect(() => {
    if (warmedUp.current) return;
    warmedUp.current = true;

    void (async () => {
      await Promise.allSettled([
        getAllQuestions(stateId ?? undefined),
        get6520Questions(stateId ?? undefined),
        getAllStates(),
        ...(stateId ? [getStateById(stateId)] : []),
      ]);
    })();
  }, [stateId]);
}
