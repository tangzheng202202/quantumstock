/**
 * Unified Cache Service — replaces fragmented per-module cache implementations.
 * Supports TTL, stale-while-revalidate, and batch invalidation.
 */

interface CacheEntry<T> {
  data: T;
  ts: number;
  swr?: Promise<T> | null; // stale-while-revalidate promise
}

class CacheService {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Get cached data or fetch fresh.
   * @param key Cache key
   * @param ttlSeconds Time-to-live in seconds
   * @param fetcher Function to fetch fresh data
   */
  async get<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    const now = Date.now();

    if (hit && (now - hit.ts) < ttlSeconds * 1000) {
      return hit.data as T;
    }

    // Stale-while-revalidate: return stale data immediately, fetch in background
    if (hit && !hit.swr) {
      hit.swr = fetcher().then(data => {
        this.store.set(key, { data, ts: Date.now(), swr: null });
        return data;
      }).catch(() => {
        this.store.set(key, { ...hit, swr: null });
        return hit.data as T;
      });
      return hit.data as T;
    }

    const data = await fetcher();
    this.store.set(key, { data, ts: now, swr: null });
    return data;
  }

  /** Invalidate cache entries matching a pattern (prefix match). */
  invalidate(pattern: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(pattern)) {
        this.store.delete(key);
      }
    }
  }

  /** Clear all cached data. */
  clear(): void {
    this.store.clear();
  }

  /** Get cache stats. */
  stats(): { size: number; keys: string[] } {
    return { size: this.store.size, keys: [...this.store.keys()] };
  }
}

export const cache = new CacheService();
