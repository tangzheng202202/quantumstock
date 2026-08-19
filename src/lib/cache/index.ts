/**
 * Unified Cache Service — pluggable backend (Phase 2 数据地基).
 *
 * Backends:
 *   - memory (default): in-process Map with TTL + stale-while-revalidate.
 *   - redis: shared across instances when REDIS_URL is set and `ioredis`
 *     is installed. Falls back to memory transparently on any failure.
 *
 * Public API: get(key, ttlSeconds, fetcher), invalidate(pattern),
 * clear(), stats() — stable across backends; call sites never change.
 */

export interface CacheBackend {
  readonly id: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

// ---- Memory backend ----

interface CacheEntry<T> {
  data: T;
  ts: number;
  swr?: Promise<T> | null; // stale-while-revalidate promise
}

class MemoryBackend implements CacheBackend {
  readonly id = "memory";
  private store = new Map<string, CacheEntry<any>>();

  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    return hit ? (hit.data as T) : null;
  }

  async set<T>(key: string, value: T, _ttlSeconds: number): Promise<void> {
    this.store.set(key, { data: value, ts: Date.now(), swr: null });
  }

  entry<T>(key: string): CacheEntry<T> | undefined {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }
  put<T>(key: string, entry: CacheEntry<T>): void {
    this.store.set(key, entry);
  }
  delete(key: string): void {
    this.store.delete(key);
  }
  keys(): string[] {
    return [...this.store.keys()];
  }
  clear(): void {
    this.store.clear();
  }
  get size(): number {
    return this.store.size;
  }
}

// ---- Redis backend (optional dependency) ----

class RedisBackend implements CacheBackend {
  readonly id = "redis";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private client: any) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(`qs:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.client.set(`qs:${key}`, JSON.stringify(value), "EX", Math.max(1, Math.ceil(ttlSeconds)));
  }
}

// ---- Backend resolution (lazy, resilient, shared across instances) ----

let _backend: CacheBackend | null = null;
const _sharedMemory = new MemoryBackend();
let _redisError: string | null = null;

async function resolveBackend(): Promise<{ backend: CacheBackend; memory: MemoryBackend }> {
  if (_backend) return { backend: _backend, memory: _sharedMemory };
  if (_redisError || !process.env.REDIS_URL) {
    _backend = _sharedMemory;
    return { backend: _backend!, memory: _sharedMemory };
  }
  try {
    // Optional dependency — resolved dynamically so installs without ioredis still work.
    const moduleName = "ioredis";
    const mod: any = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
    if (!mod) throw new Error("ioredis not installed");
    const Redis = mod.default ?? mod;
    const client = new Redis(process.env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      // Don't crash the app if Redis is down — cache degrades to memory/fetch-through
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    client.on("error", () => { /* degrade via cache-aside catch */ });
    _backend = new RedisBackend(client);
  } catch {
    _redisError = "ioredis unavailable";
    _backend = _sharedMemory;
  }
  return { backend: _backend!, memory: _sharedMemory };
}

// ---- CacheService ----

class CacheService {
  /** Per-instance memory mirror (SWR reads stay process-local and fast). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store = new Map<string, CacheEntry<any>>();

  constructor() {
    /* instances share the resolved backend; each keeps its own SWR mirror */
  }

  private get _memory(): MemoryBackend {
    // Adapter over the instance store exposing MemoryBackend helpers
    const store = this.store;
    return {
      entry: <T>(k: string) => store.get(k) as CacheEntry<T> | undefined,
      put: <T>(k: string, e: CacheEntry<T>) => { store.set(k, e); },
      delete: (k: string) => { store.delete(k); },
      keys: () => [...store.keys()],
      clear: () => store.clear(),
      get size() { return store.size; },
    } as MemoryBackend;
  }

  /**
   * Get cached data or fetch fresh.
   * @param key Cache key
   * @param ttlSeconds Time-to-live in seconds
   * @param fetcher Function to fetch fresh data
   */
  async get<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const { backend } = await resolveBackend();

    // SWR only supported on the memory backend (process-local promise)
    if (backend instanceof MemoryBackend) {
      const hit = this._memory.entry<T>(key);
      const now = Date.now();
      if (hit && (now - hit.ts) < ttlSeconds * 1000) return hit.data;

      if (hit && !hit.swr) {
        hit.swr = fetcher()
          .then(async data => {
            await this.set(key, data, ttlSeconds);
            return data;
          })
          .catch(() => {
            this._memory.put(key, { data: hit.data, ts: hit.ts, swr: null });
            return hit.data as T;
          });
        return hit.data as T;
      }

      const data = await fetcher();
      await this.set(key, data, ttlSeconds);
      return data;
    }

    // Shared backend: simple cache-aside
    const cached = await backend.get<T>(key).catch(() => null);
    if (cached != null) {
      // mirror in memory for fast SWR reads on this instance
      this._memory.put(key, { data: cached, ts: Date.now(), swr: null });
      return cached;
    }
    const fresh = await fetcher();
    await backend.set(key, fresh, ttlSeconds).catch(() => {});
    this._memory.put(key, { data: fresh, ts: Date.now(), swr: null });
    return fresh;
  }

  private async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const { backend } = await resolveBackend();
    if (backend instanceof MemoryBackend) {
      this._memory.put(key, { data: value, ts: Date.now(), swr: null });
    } else {
      await backend.set(key, value, ttlSeconds).catch(() => {});
      this._memory.put(key, { data: value, ts: Date.now(), swr: null });
    }
  }

  /** Invalidate cache entries matching a pattern (prefix match; memory backend). */
  async invalidate(pattern: string): Promise<void> {
    for (const key of this._memory.keys()) {
      if (key.startsWith(pattern)) this._memory.delete(key);
    }
  }

  /** Clear all cached data (memory backend only). */
  clear(): void {
    this.store.clear();
  }

  /** Cache stats (memory mirror — fast local view). */
  stats(): { size: number; keys: string[] } {
    return { size: this.store.size, keys: [...this.store.keys()] };
  }

  /** Which backend is active ("memory" | "redis"). */
  backendId(): string {
    return _backend?.id ?? "memory";
  }
}

export { CacheService };
export const cache = new CacheService();
