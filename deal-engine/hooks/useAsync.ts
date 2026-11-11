'use client';
import { useCallback, useEffect, useState } from 'react';

/** Small loader: data, error, loading, reload. Keeps components free of fetch boilerplate. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    run().then((data) => setState({ data, error: null, loading: false }))
      .catch((e: unknown) => setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
  }, [run]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}
