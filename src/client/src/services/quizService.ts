import type { QuizResultDto, QuizStartRequest } from '../types/api';
import { apiGet, apiPost } from './apiClient';

export async function startQuiz(request: QuizStartRequest): Promise<QuizResultDto | null> {
  const result = await apiPost<QuizResultDto>('/quiz/start', request);
  return result.success ? result.data : null;
}

export async function getQuizResult(sessionId: string): Promise<QuizResultDto | null> {
  const result = await apiGet<QuizResultDto>(`/quiz/${sessionId}`);
  return result.success ? result.data : null;
}
