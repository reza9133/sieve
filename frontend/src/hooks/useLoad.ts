import { useCallback, useEffect, useRef, useState } from 'react';
import { parseError, type ParsedError } from '@/chain/errors';

export interface LoadState<T> {
  data: T | null;
  error: ParsedError | null;
  /** True only for the first load, so refreshes never flash a skeleton. */
  loading: boolean;
  refreshing: boolean;
  updatedAt: number | null;
  reload: () => void;
}

interface Options {
  /** Poll interval in ms. Polling pauses while the tab is hidden and backs off after failures. */
  pollMs?: number;
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 60_000;

/**
 * Fetch + optional polite polling. Deps decide when the whole query restarts (new tender, new
 * account). Exponential backoff after errors; a hidden tab makes no requests.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[], options: Options = {}): LoadState<T> {
  const { pollMs, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ParsedError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    let first = true;
    setData(null);
    setError(null);
    setLoading(true);

    const run = async () => {
      if (cancelled) return;
      if (document.hidden) {
        schedule();
        return;
      }
      if (!first) setRefreshing(true);
      try {
        const result = await fnRef.current();
        if (cancelled) return;
        failures = 0;
        setData(result);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (cancelled) return;
        failures += 1;
        setError(parseError(e));
      } finally {
        if (!cancelled) {
          first = false;
          setLoading(false);
          setRefreshing(false);
          schedule();
        }
      }
    };

    const schedule = () => {
      if (!pollMs || cancelled) return;
      const delay = Math.min(pollMs * 2 ** Math.min(failures, 4), MAX_BACKOFF_MS);
      timer = window.setTimeout(run, delay);
    };

    const onVisible = () => {
      if (!document.hidden && pollMs) {
        window.clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, pollMs, tick]);

  return { data, error, loading, refreshing, updatedAt, reload };
}
