import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiGet, apiPost } from './apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
