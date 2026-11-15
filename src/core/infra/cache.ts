import type { Cache } from "../ports";

/** In-process cache. Fine for a POC; swap for Redis/Upstash by implementing `Cache`. */
export class MemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expires: number }>();

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

/** Read-through helper: return cached value or compute + store it. */
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await cache.set(key, value, ttlSeconds);
  return value;
}

export const TTL = {
  hour: 3600,
  day: 86_400,
  week: 604_800,
  /** Watchmode free plan: cached data must be refreshed within 30 days. */
  watchmodeMax: 29 * 86_400,
} as const;
