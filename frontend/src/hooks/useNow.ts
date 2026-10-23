import { useEffect, useState } from 'react';
import { nowSeconds } from '@/lib/time';

/** Current unix time in seconds as a bigint. Ticks every second; pauses while the tab is hidden. */
export function useNow(intervalMs = 1000): bigint {
  const [now, setNow] = useState<bigint>(() => nowSeconds());
  useEffect(() => {
    let id: number | undefined;
    const start = () => {
      stop();
      setNow(nowSeconds());
      id = window.setInterval(() => setNow(nowSeconds()), intervalMs);
    };
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
