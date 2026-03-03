import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('runs only once even on re-render', async () => {
    const { rerender } = renderHook(() => useWarmUpCache(null));

    await vi.waitFor(() => {
      expect(getAllQuestions).toHaveBeenCalledTimes(1);
    });

    rerender();
    rerender();

    expect(getAllQuestions).toHaveBeenCalledTimes(1);
  });
});
