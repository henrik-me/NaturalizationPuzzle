import type { ApiResult, StoryDetailDto, StoryListItemDto } from '../types/api';
import { apiGet } from './apiClient';

/**
 * Fetches the Story Mode index and returns the typed `ApiResult` so callers
 * can distinguish a successful empty response (catalog has no stories) from
 * a transient HTTP/network failure. The pages need that distinction to show
 * the right empty-vs-error UI state.
 */
export async function listStories(): Promise<ApiResult<readonly StoryListItemDto[]>> {
  return apiGet<StoryListItemDto[]>('/stories');
}

/**
 * Fetches a single story by slug. Returns `ApiResult` so callers can tell
 * a 404 (slug not found) from a transient error (500, timeout, offline).
 */
export async function getStory(slug: string, stateId?: number): Promise<ApiResult<StoryDetailDto>> {
  const query = stateId ? `?stateId=${stateId}` : '';
  return apiGet<StoryDetailDto>(`/stories/${encodeURIComponent(slug)}${query}`);
}
