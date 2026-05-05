import type { StoryDetailDto, StoryListItemDto } from '../types/api';
import { apiGet } from './apiClient';

export async function listStories(): Promise<readonly StoryListItemDto[]> {
  const result = await apiGet<StoryListItemDto[]>('/stories');
  return result.success ? result.data : [];
}

export async function getStory(slug: string, stateId?: number): Promise<StoryDetailDto | null> {
  const query = stateId ? `?stateId=${stateId}` : '';
  const result = await apiGet<StoryDetailDto>(`/stories/${encodeURIComponent(slug)}${query}`);
  return result.success ? result.data : null;
}
