import { useState, useEffect, useCallback } from 'react';
import type { ApiResult } from '../types/api';

interface UseFetchResult<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly refetch: () => Promise<void>;
}

export function useFetch<T>(fetchFn: () => Promise<ApiResult<T>>, deps: readonly unknown[] = []): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const result = await fetchFn();
    if (result.success) {
      setData(result.data);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, isLoading, refetch };
}
