import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveEmSecid } from "../data/eastmoney/shared";
import { fetchSinaQuotes } from "../data/sina";
import { cache } from "../cache";

afterEach(() => {
  vi.unstubAllGlobals();
  cache.clear();
});

describe("resolveEmSecid", () => {
  it("resolves Shanghai A-share (6xx / 688) to market 1", () => {
    expect(resolveEmSecid("600519")).toEqual({ secid: "1.600519", market: "A" });
    expect(resolveEmSecid("688981")).toEqual({ secid: "1.688981", market: "A" });
  });

  it("resolves Shenzhen A-share to market 0", () => {
    expect(resolveEmSecid("000858")).toEqual({ secid: "0.000858", market: "A" });
    expect(resolveEmSecid("300750")).toEqual({ secid: "0.300750", market: "A" });
  });

  it("resolves HK 5-digit to market 116", () => {
    expect(resolveEmSecid("00700")).toEqual({ secid: "116.00700", market: "HK" });
  });

  it("resolves US ticker to market 105", () => {
    expect(resolveEmSecid("AAPL")).toEqual({ secid: "105.AAPL", market: "US" });
  });

  it("returns null for unresolvable symbols", () => {
    expect(resolveEmSecid("!!!")).toBeNull();
    expect(resolveEmSecid("")).toBeNull();
  });
});

describe("fetchSinaQuotes", () => {
  function mockSinaResponse(text: string) {
    const buf = new TextEncoder().encode(text).buffer;
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => buf,
    });
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("parses A-share quote lines into TickerData", async () => {
    // fields: name,open,prevClose,price,high,low,?,?,volume,amount
    // (ASCII name used: code decodes response as GBK, mock provides UTF-8 bytes)
    mockSinaResponse(
      'var hq_str_sh600519="Moutai,1700.00,1690.00,1710.50,1715.00,1695.00,0,0,1234567,2109876543";\n'
    );
    const quotes = await fetchSinaQuotes(["600519"]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].stock.symbol).toBe("600519");
    expect(quotes[0].stock.name).toBe("Moutai");
    expect(quotes[0].quote.close).toBe(1710.50);
    expect(quotes[0].quote.change).toBeCloseTo(20.5, 1);
    expect(quotes[0].quote.changePercent).toBeCloseTo(1.21, 1);
  });

  it("caches quotes within TTL (single upstream call)", async () => {
    const mock = mockSinaResponse(
      'var hq_str_sz000858="Wuliangye,150.00,149.00,151.00,152.00,148.50,0,0,999,123456";\n'
    );
    await fetchSinaQuotes(["000858"]);
    await fetchSinaQuotes(["000858"]);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no resolvable symbols", async () => {
    const quotes = await fetchSinaQuotes(["!!!invalid!!!"]);
    expect(quotes).toEqual([]);
  });
});
