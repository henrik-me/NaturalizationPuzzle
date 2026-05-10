import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWarmUpCache } from './useWarmUpCache';

vi.mock('../services/questionService', () => ({
  getAllQuestions: vi.fn().mockResolvedValue([]),
  get6520Questions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/stateService', () => ({
  getAllStates: vi.fn().mockResolvedValue([]),
  getStateById: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/storyService', () => ({
  listStories: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { slug: 'alpha-story', title: 'A', category: 'X', subCategory: 'Y',
        estReadMinutes: 1, fleschReadingEase: 80, questionCount: 1,
        modelMemoryUsed: false, stateAwarePreamble: false },
      { slug: 'beta-story', title: 'B', category: 'X', subCategory: 'Y',
        estReadMinutes: 1, fleschReadingEase: 80, questionCount: 1,
        modelMemoryUsed: false, stateAwarePreamble: false },
    ],
  }),
  getStory: vi.fn().mockResolvedValue({ success: false, error: 'not-loaded' }),
}));

import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';
import { listStories, getStory } from '../services/storyService';

describe('useWarmUpCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches questions and states on mount without stateId', async () => {
    renderHook(() => useWarmUpCache(null));

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledWith(undefined);
      expect(get6520Questions).toHaveBeenCalledWith(undefined);
      expect(getAllStates).toHaveBeenCalled();
      expect(getStateById).not.toHaveBeenCalled();
    });
  });

  it('fetches state-specific data when stateId is provided', async () => {
    renderHook(() => useWarmUpCache(5));

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledWith(5);
      expect(get6520Questions).toHaveBeenCalledWith(5);
      expect(getAllStates).toHaveBeenCalled();
      expect(getStateById).toHaveBeenCalledWith(5);
    });
  });

  it('warms the stories index AND every story detail returned by the index (offline contract)', async () => {
    renderHook(() => useWarmUpCache(7));

    await vi.waitFor(() => {
      expect(listStories).toHaveBeenCalled();
      // The mock returns alpha-story + beta-story; warm-up should fan out
      // to every slug, not a hardcoded subset.
      expect(getStory).toHaveBeenCalledWith('alpha-story', 7);
      expect(getStory).toHaveBeenCalledWith('beta-story', 7);
    });
  });

  it('warms each story detail with undefined stateId when no state is selected', async () => {
    renderHook(() => useWarmUpCache(null));

    await vi.waitFor(() => {
      expect(getStory).toHaveBeenCalledWith('alpha-story', undefined);
      expect(getStory).toHaveBeenCalledWith('beta-story', undefined);
    });
  });

  it('runs only once even on re-render with same stateId', async () => {
    const { rerender } = renderHook(({ id }: { id: number | null }) => useWarmUpCache(id), {
      initialProps: { id: null as number | null },
    });

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledTimes(1);
    });

    rerender({ id: null });
    rerender({ id: null });

    expect(getAllQuestions).toHaveBeenCalledTimes(1);
  });

  it('re-warms when stateId changes (e.g. user picks a state for the first time)', async () => {
    const { rerender } = renderHook(({ id }: { id: number | null }) => useWarmUpCache(id), {
      initialProps: { id: null as number | null },
    });

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledTimes(1);
      expect(getAllQuestions).toHaveBeenLastCalledWith(undefined);
    });

    rerender({ id: 7 });

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledTimes(2);
      expect(getAllQuestions).toHaveBeenLastCalledWith(7);
      expect(getStateById).toHaveBeenCalledWith(7);
    });
  });

  describe('service worker readiness', () => {
    let originalServiceWorker: PropertyDescriptor | undefined;

    afterEach(() => {
      if (originalServiceWorker) {
        Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
      } else {
        // jsdom doesn't define serviceWorker by default; remove if we added it.
        delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
      }
      originalServiceWorker = undefined;
    });

    it('waits for navigator.serviceWorker.ready before warming caches', async () => {
      originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

      let resolveReady: (value: unknown) => void = () => undefined;
      const readyPromise = new Promise(resolve => {
        resolveReady = resolve;
      });

      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: readyPromise },
      });

      renderHook(() => useWarmUpCache(null));

      // Give the effect a tick to start awaiting SW readiness.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(getAllQuestions).not.toHaveBeenCalled();

      resolveReady({});

      await vi.waitFor(() => {
        expect(getAllQuestions).toHaveBeenCalledTimes(1);
      });
    });
  });
});
