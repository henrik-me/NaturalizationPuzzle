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

import { getAllQuestions, get6520Questions } from '../services/questionService';
import { getAllStates, getStateById } from '../services/stateService';

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
