import { describe, it, expect, vi, beforeEach } from "vitest";
import { CacheService } from "../index";

describe("CacheService", () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it("returns fetched data on cache miss", async () => {
    const fetcher = vi.fn().mockResolvedValue("fresh");
    const result = await cache.get("a", 10, fetcher);
    expect(result).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves cached data within TTL without re-fetching", async () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    await cache.get("b", 10, fetcher);
    const second = await cache.get("b", 10, fetcher);
    expect(second).toBe("data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires (stale-while-revalidate returns stale first)", async () => {
    vi.useFakeTimers();
    try {
      let value = 0;
      const fetcher = vi.fn().mockImplementation(async () => ++value);

      const first = await cache.get("c", 10, fetcher);
      expect(first).toBe(1);

      // Advance beyond TTL — next call returns stale value immediately
      vi.setSystemTime(Date.now() + 11_000);
      const stale = await cache.get("c", 10, fetcher);
      expect(stale).toBe(1); // stale returned
      // Background revalidation completes
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates entries by key (namespacing prevents collisions)", async () => {
    const sina = vi.fn().mockResolvedValue("sina-data");
    const yahoo = vi.fn().mockResolvedValue("yahoo-data");
    const r1 = await cache.get("sina:indices", 30, sina);
    const r2 = await cache.get("yahoo:indices", 90, yahoo);
    expect(r1).toBe("sina-data");
    expect(r2).toBe("yahoo-data");
  });

  it("invalidate removes entries matching a prefix", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    await cache.get("em_sectors", 30, fetcher);
    await cache.get("em_rotation", 30, fetcher);
    await cache.get("sina:indices", 30, fetcher);

    cache.invalidate("em_");
    const stats = cache.stats();
    expect(stats.keys).toContain("sina:indices");
    expect(stats.keys).not.toContain("em_sectors");
    expect(stats.keys).not.toContain("em_rotation");
  });

  it("clear empties the store", async () => {
    await cache.get("x", 10, async () => 1);
    cache.clear();
    expect(cache.stats().size).toBe(0);
  });

  it("does not cache fetcher rejections", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce("recovered");

    await expect(cache.get("d", 10, fetcher)).rejects.toThrow("upstream down");
    const retry = await cache.get("d", 10, fetcher);
    expect(retry).toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
