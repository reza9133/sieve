/**
 * Polite RPC access. Studionet allows ~60 requests/minute/IP, so reads are:
 *  - cached for a short TTL,
 *  - de-duplicated while in flight,
 *  - limited to a few concurrent requests,
 *  - retried with exponential backoff on transport errors (never on contract errors).
 */
interface Entry<T> {
  at: number;
  value?: T;
  promise?: Promise<T>;
}

const cache = new Map<string, Entry<unknown>>();
let active = 0;
const waiting: Array<() => void> = [];
const MAX_CONCURRENT = 3;

async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isTransportError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  if (/\[(EXPECTED|EXTERNAL|GENERIC)\]/.test(text)) return false;
  return /fetch|network|timeout|ENOTFOUND|Failed to|429|Too Many|502|503|504|rate/i.test(text);
}

export async function gated<T>(key: string, ttlMs: number, run: () => Promise<T>, retries = 3): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit) {
    if (hit.promise) return hit.promise;
    if (now - hit.at < ttlMs && hit.value !== undefined) return hit.value;
  }
  const promise = slot(async () => {
    let attempt = 0;
    for (;;) {
      try {
        return await run();
      } catch (error) {
        if (attempt >= retries || !isTransportError(error)) throw error;
        attempt += 1;
        await sleep(800 * 2 ** (attempt - 1) + Math.random() * 300);
      }
    }
  });
  cache.set(key, { at: now, promise });
  try {
    const value = await promise;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export function clearReadCache(): void {
  cache.clear();
}
