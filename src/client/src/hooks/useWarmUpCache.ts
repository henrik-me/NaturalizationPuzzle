import { useEffect, useRef } from 'react';
import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';

const NOT_WARMED: unique symbol = Symbol('not-warmed');
type WarmedKey = number | null | typeof NOT_WARMED;

/**
 * Eagerly fetches all key API endpoints so the service worker caches
 * responses for offline use. Re-arms when stateId transitions (e.g.,
 * null -> 5 after the user picks a state) so state-specific data is
 * also warmed; guards against React StrictMode double-fire and against
 * re-warming for the same stateId across rerenders.
 */
export function useWarmUpCache(stateId: number | null): void {
  const warmedFor = useRef<WarmedKey>(NOT_WARMED);

  useEffect(() => {
    if (warmedFor.current === stateId) return;
    warmedFor.current = stateId;

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
