import type { VacantSeatDto, RepresentativeDto } from '../types/api';
import { apiGet, apiPut } from './apiClient';

export async function getVacantSeats(stateId?: number): Promise<readonly VacantSeatDto[]> {
  const query = stateId != null ? `?stateId=${stateId}` : '';
  const result = await apiGet<VacantSeatDto[]>(`/representatives/vacant${query}`);
  return result.success ? result.data : [];
}

export async function updateRepresentative(
  id: number,
  name: string,
): Promise<RepresentativeDto | null> {
  const result = await apiPut<RepresentativeDto>(`/representatives/${id}`, { name });
  return result.success ? result.data : null;
}
