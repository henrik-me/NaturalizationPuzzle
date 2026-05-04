import type { ApiResult } from '../types/api';
import { connectionStatus, SLOW_REQUEST_THRESHOLD_MS } from './connectionStatus';

const API_BASE = '/api/v1';

/**
 * Wraps `fetch` with a slow-request timer: if the request hasn't
 * resolved within `SLOW_REQUEST_THRESHOLD_MS`, the connection-status
 * store is incremented so the UI can render a "waking up the server"
 * banner. Always paired with a decrement on completion so the count
 * stays balanced even if the request fails.
 */
async function instrumentedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  let markedSlow = false;
  const slowTimer = setTimeout(() => {
    markedSlow = true;
    connectionStatus.markSlow();
  }, SLOW_REQUEST_THRESHOLD_MS);
  try {
    return await fetch(input, init);
  } finally {
    clearTimeout(slowTimer);
    if (markedSlow) {
      connectionStatus.markDone();
    }
  }
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await instrumentedFetch(`${API_BASE}${path}`);
    if (!response.ok) {
      return { success: false, error: `${response.status}: ${response.statusText}` };
    }
    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await instrumentedFetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { success: false, error: `${response.status}: ${response.statusText}` };
    }
    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export async function apiPut<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await instrumentedFetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { success: false, error: `${response.status}: ${response.statusText}` };
    }
    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
