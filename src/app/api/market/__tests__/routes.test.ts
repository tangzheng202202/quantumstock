import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the data layer before importing the route handlers.
vi.mock("@/lib/data/sina", () => ({
  smartSearch: vi.fn(),
  fetchSinaKLine: vi.fn(),
}));
vi.mock("@/lib/data/eastmoney", () => ({
  fetchEMKLine: vi.fn(),
}));

import { GET as searchGET } from "@/app/api/market/search/route";
import { GET as ohlcvGET } from "@/app/api/market/ohlcv/route";
import { smartSearch, fetchSinaKLine } from "@/lib/data/sina";

function req(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/market/search", () => {
  it("returns 400 when q is missing", async () => {
    const res = await searchGET(req("/api/market/search"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns search results with trace id header", async () => {
    vi.mocked(smartSearch).mockResolvedValue([{ symbol: "600519", name: "贵州茅台", market: "SSE", currency: "CNY" }]);
    const res = await searchGET(req("/api/market/search?q=600519"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-trace-id")).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.meta.count).toBe(1);
  });

  it("maps data-layer failure to 500", async () => {
    vi.mocked(smartSearch).mockRejectedValue(new Error("sina down"));
    const res = await searchGET(req("/api/market/search?q=x"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});

describe("GET /api/market/ohlcv", () => {
  it("returns 400 for invalid symbol", async () => {
    const res = await ohlcvGET(req("/api/market/ohlcv?symbol=!!!"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("serves A-share kline from Sina", async () => {
    vi.mocked(fetchSinaKLine).mockResolvedValue([
      { timestamp: 1, open: 1, high: 2, low: 1, close: 2, volume: 100 },
    ]);
    const res = await ohlcvGET(req("/api/market/ohlcv?symbol=600519&limit=10"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.meta.source).toBe("live");
    expect(json.data).toHaveLength(1);
  });

  it("returns empty data (not error) when all live sources fail for A-share", async () => {
    const { fetchEMKLine } = await import("@/lib/data/eastmoney");
    vi.mocked(fetchSinaKLine).mockRejectedValue(new Error("sina fail"));
    vi.mocked(fetchEMKLine).mockRejectedValue(new Error("em fail"));
    const res = await ohlcvGET(req("/api/market/ohlcv?symbol=600519"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Phase 2 store contract: upstream failure yields empty bars with
    // source "live", letting the client render a graceful empty state.
    expect(json.data).toHaveLength(0);
  });
});
