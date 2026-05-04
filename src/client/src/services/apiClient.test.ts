import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost } from './apiClient';
import { connectionStatus, SLOW_REQUEST_THRESHOLD_MS } from './connectionStatus';

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    connectionStatus.__reset();
  });

  describe('apiGet', () => {
    it('returns success with data on 200 response', async () => {
      const mockData = { id: 1, name: 'test' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const result = await apiGet<typeof mockData>('/test');

      expect(result).toEqual({ success: true, data: mockData });
    });

    it('returns error on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const result = await apiGet('/test');

      expect(result).toEqual({ success: false, error: '404: Not Found' });
    });

    it('returns error on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await apiGet('/test');

      expect(result).toEqual({ success: false, error: 'Network error' });
    });
  });

  describe('apiPost', () => {
    it('returns success with data on 200 response', async () => {
      const mockData = { sessionId: 'abc-123' };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response);

      const result = await apiPost<typeof mockData>('/test', { foo: 'bar' });

      expect(result).toEqual({ success: true, data: mockData });
      expect(fetch).toHaveBeenCalledWith('/api/v1/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      });
    });

    it('returns error on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const result = await apiPost('/test', {});

      expect(result).toEqual({ success: false, error: '500: Internal Server Error' });
    });
  });

  describe('slow-request instrumentation', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not mark slow when the request resolves before the threshold', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);

      await apiGet('/fast');

      expect(connectionStatus.getSnapshot()).toBe(0);
    });

    it('marks slow once the threshold elapses, and clears on completion', async () => {
      vi.useFakeTimers();
      let resolveFetch!: (value: Response) => void;
      const fetchPromise = new Promise<Response>(resolve => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const apiPromise = apiGet('/slow');

      // Cross the slow threshold while the fetch is still in flight.
      await vi.advanceTimersByTimeAsync(SLOW_REQUEST_THRESHOLD_MS + 1);
      expect(connectionStatus.getSnapshot()).toBe(1);

      // Resolve the fetch and finish the apiGet call.
      resolveFetch({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response);
      await apiPromise;

      expect(connectionStatus.getSnapshot()).toBe(0);
    });

    it('clears the slow mark even when the fetch rejects after the threshold', async () => {
      vi.useFakeTimers();
      let rejectFetch!: (reason: Error) => void;
      const fetchPromise = new Promise<Response>((_, reject) => {
        rejectFetch = reject;
      });
      vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

      const apiPromise = apiGet('/slow-failing');

      await vi.advanceTimersByTimeAsync(SLOW_REQUEST_THRESHOLD_MS + 1);
      expect(connectionStatus.getSnapshot()).toBe(1);

      rejectFetch(new Error('boom'));
      await apiPromise;

      expect(connectionStatus.getSnapshot()).toBe(0);
    });
  });
});
