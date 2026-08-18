import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * OhlcvStore tests exercise pure helpers and the no-DB fallback path.
 * The DB path requires a live Prisma client and is covered by integration
 * runs against a real DATABASE_URL (documented in DECONSTRUCTION-AND-REFACTOR.md).
 */

// fetchLiveBars depends on sina/eastmoney network calls — stub the modules
vi.mock("@/lib/data/sina", () => ({
  fetchSinaKLine: vi.fn().mockResolvedValue([
    { timestamp: 1700000000000, open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
    { timestamp: 1700086400000, open: 10.5, high: 12, low: 10, close: 11.5, volume: 1200 },
  ]),
}));
vi.mock("@/lib/data/eastmoney", () => ({
  fetchEMKLine: vi.fn().mockResolvedValue([
    { timestamp: 1700000000000, open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
  ]),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: null,
  hasDatabase: false,
}));

import { getBars, upsertBars, ingestSymbols, fetchLiveBars } from "@/lib/data/ohlcv-store";

describe("ohlcv-store (no-DB fallback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetchLiveBars maps Sina bars to date+timestamp contract", async () => {
    const bars = await fetchLiveBars("600519", "1d", 10);
    expect(bars).toHaveLength(2);
    expect(bars[0].timestamp).toBe(1700000000000);
    expect(bars[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fetchLiveBars handles 5-digit HK via EastMoney path", async () => {
    const bars = await fetchLiveBars("00700", "1d", 10);
    expect(bars).toHaveLength(1);
    expect(bars[0].timestamp).toBe(1700000000000);
  });

  it("getBars falls back to live source without DB", async () => {
    const r = await getBars("600519", "1d", 10);
    expect(r.source).toBe("live");
    expect(r.bars.length).toBeGreaterThan(0);
  });

  it("upsertBars is a silent no-op without DB", async () => {
    const n = await upsertBars("600519", "1d", [{ date: "2026-01-01", timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }]);
    expect(n).toBe(0);
  });

  it("ingestSymbols reports per-symbol status", async () => {
    const r = await ingestSymbols(["600519", "00700"]);
    expect(r).toHaveLength(2);
    for (const item of r) {
      expect(item.ok).toBe(true);
      expect(item.bars).toBe(0); // no DB → nothing written
    }
  });
});
