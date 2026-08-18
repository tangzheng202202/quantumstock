import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, getClientKey, AI_RATE_LIMITS } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit and counts remaining", () => {
    const r1 = checkRateLimit(`t:${Math.random()}`, { limit: 3, windowSeconds: 60 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
  });

  it("blocks after the limit is hit and reports retryAfter", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, { limit: 3, windowSeconds: 60 }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { limit: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(61); // ceil rounding tolerance
  });

  it("keys are isolated", () => {
    const a = `t:${Math.random()}`;
    const b = `t:${Math.random()}`;
    checkRateLimit(a, { limit: 1, windowSeconds: 60 });
    expect(checkRateLimit(a, { limit: 1, windowSeconds: 60 }).allowed).toBe(false);
    expect(checkRateLimit(b, { limit: 1, windowSeconds: 60 }).allowed).toBe(true);
  });

  it("window recovers over time (expired hits pruned)", () => {
    const key = `t:${Math.random()}`;
    // Use a tiny window so it expires immediately
    expect(checkRateLimit(key, { limit: 1, windowSeconds: 0.01 }).allowed).toBe(true);
    // wait 20ms > 10ms window
    const start = Date.now();
    while (Date.now() - start < 25) { /* busy wait */ }
    expect(checkRateLimit(key, { limit: 1, windowSeconds: 0.01 }).allowed).toBe(true);
  });

  it("AI limits are sane defaults", () => {
    expect(AI_RATE_LIMITS.perMinute.limit).toBeGreaterThan(0);
    expect(AI_RATE_LIMITS.perHour.limit).toBeGreaterThanOrEqual(AI_RATE_LIMITS.perMinute.limit);
  });
});

describe("getClientKey", () => {
  it("prefers userId", () => {
    const req = new Request("http://x/");
    expect(getClientKey(req, "user_123")).toBe("user:user_123");
  });

  it("falls back to forwarded IP", () => {
    const req = new Request("http://x/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientKey(req, null)).toBe("ip:1.2.3.4");
  });

  it("anonymous when no headers", () => {
    expect(getClientKey(new Request("http://x/"), null)).toBe("ip:anonymous");
  });
});
