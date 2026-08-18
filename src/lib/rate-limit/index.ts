/**
 * Rate limiting for expensive endpoints (AI analysis, etc.).
 *
 * Dependency-free sliding-window implementation, keyed per user (Clerk userId)
 * or client IP. Designed so a Redis-backed backend can replace the in-memory
 * store later (multi-instance deployments) without changing call sites.
 *
 * Limits per AI route:
 *   - 10 requests / minute (burst control)
 *   - 60 requests / hour  (daily quota proxy; swap for plan-based quota later)
 */

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Unix seconds when the window resets. */
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Prune expired entries periodically to bound memory. */
const MAX_BUCKETS = 50_000;

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const nowSec = Math.floor(now / 1000);

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size > MAX_BUCKETS) buckets.clear();
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Drop hits outside the window
  bucket.hits = bucket.hits.filter(t => now - t < windowMs);

  if (bucket.hits.length >= opts.limit) {
    const oldest = bucket.hits[0];
    const resetAt = Math.ceil((oldest + windowMs) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, resetAt - nowSec),
    };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: opts.limit - bucket.hits.length,
    resetAt: Math.ceil((now + windowMs) / 1000),
    retryAfterSeconds: 0,
  };
}

/** Extract a client key: prefer Clerk userId (set by middleware/request headers), fall back to IP. */
export function getClientKey(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";
  return `ip:${ip}`;
}

/** Default AI rate limits (per user). */
export const AI_RATE_LIMITS = {
  perMinute: { limit: 10, windowSeconds: 60 },
  perHour: { limit: 60, windowSeconds: 3600 },
} as const;
