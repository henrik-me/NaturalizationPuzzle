import type { QuestionDto } from '../types/api';
import { apiGet } from './apiClient';

export async function getAllQuestions(stateId?: number): Promise<readonly QuestionDto[]> {
  const query = stateId ? `?stateId=${stateId}` : '';
  const result = await apiGet<QuestionDto[]>(`/questions${query}`);
  return result.success ? result.data : [];
}

export async function getQuestionById(id: number, stateId?: number): Promise<QuestionDto | null> {
  const query = stateId ? `?stateId=${stateId}` : '';
  const result = await apiGet<QuestionDto>(`/questions/${id}${query}`);
  return result.success ? result.data : null;
}

export async function getQuestionsByCategory(category: string, stateId?: number): Promise<readonly QuestionDto[]> {
  const query = stateId ? `?stateId=${stateId}` : '';
  const result = await apiGet<QuestionDto[]>(`/questions/category/${encodeURIComponent(category)}${query}`);
  return result.success ? result.data : [];
}

export async function get6520Questions(stateId?: number): Promise<readonly QuestionDto[]> {
  const query = stateId ? `?stateId=${stateId}` : '';
  const result = await apiGet<QuestionDto[]>(`/questions/6520${query}`);
  return result.success ? result.data : [];
}
