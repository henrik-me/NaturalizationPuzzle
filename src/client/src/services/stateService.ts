import type { UsStateDto } from '../types/api';
import { apiGet } from './apiClient';

export async function getAllStates(): Promise<readonly UsStateDto[]> {
  const result = await apiGet<UsStateDto[]>('/states');
  return result.success ? result.data : [];
}

export async function getStateById(id: number): Promise<UsStateDto | null> {
  const result = await apiGet<UsStateDto>(`/states/${id}`);
  return result.success ? result.data : null;
}
