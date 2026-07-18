/**
 * Tests for the Tencent quote source (fallback chain link).
 * Field layout verified against live qt.gtimg.cn responses (2026-07).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTencentIndices, fetchTencentQuotes, resolveTencentCode } from "../tencent";

// Real response snippets captured from qt.gtimg.cn (GBK decoded, ASCII names
// substituted to keep fixtures readable)
const A_SHARE_LINE =
  'v_sh600519="1~Moutai~600519~1253.00~1258.99~1269.01~58417~32550~25868' +
  '~1252.99~36~1252.97~1~1252.96~1~1252.90~1~1252.70~1~1253.00~20~1253.32~1~1253.75~1~1254.00~2~1254.40~1' +
  '~~20260717161459~-5.99~-0.48~1269.33~1238.98~1253.00/58417/7322732709~58417~732273~0.47~18.94~' +
  '~1269.33~1238.98~2.41~15663.52~15663.52~6.73~1384.89~1133.09~1.14~";';

const HK_LINE =
  'v_hk00700="100~Tencent~00700~461.600~484.000~488.800~36237657.0~0~0' +
  '~461.600~0~0~0~0~0~0~0~0~0~461.600~0~0~0~0~0~0~0~0~0~36237657.0' +
  '~2026/07/17 16:08:19~-22.400~-4.63~488.800~458.000~461.600~36237657.0~16928705332.905~0~16.86~";';

const INDEX_LINES =
  'v_s_sh000001="1~SSE Index~000001~3764.15~-118.26~-3.05~650450984~124644545~~627880.58~ZS~";\n' +
  'v_s_sz399001="51~SZSE Component~399001~13706.88~-781.77~-5.40~763770395~140851331~~425719.56~ZS~";\n' +
  'v_s_sz399006="51~ChiNext~399006~3428.63~-263.83~-7.15~230221243~68260370~~176827.73~ZS~";';

function mockGbkFetch(body: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new TextEncoder().encode(body).buffer as ArrayBuffer, { status: 200 })
  );
}

afterEach(() => vi.restoreAllMocks());

describe("resolveTencentCode", () => {
  it("maps A-share codes to sh/sz prefixes", () => {
    expect(resolveTencentCode("600519")).toBe("sh600519");
    expect(resolveTencentCode("688981")).toBe("sh688981");
    expect(resolveTencentCode("300750")).toBe("sz300750");
    expect(resolveTencentCode("000001")).toBe("sz000001");
  });

  it("maps HK and US symbols", () => {
    expect(resolveTencentCode("00700")).toBe("hk00700");
    expect(resolveTencentCode("AAPL")).toBe("usAAPL");
  });

  it("returns null for unresolvable symbols", () => {
    expect(resolveTencentCode("1234")).toBeNull();
    expect(resolveTencentCode("")).toBeNull();
  });
});

describe("fetchTencentQuotes", () => {
  it("parses A-share quotes with unit conversion (手→股, 万元→元)", async () => {
    mockGbkFetch(A_SHARE_LINE);
    const [t] = await fetchTencentQuotes(["600519"]);
    expect(t.stock.symbol).toBe("600519");
    expect(t.stock.name).toBe("Moutai");
    expect(t.stock.market).toBe("SSE");
    expect(t.stock.currency).toBe("CNY");
    expect(t.quote.close).toBe(1253.0);
    expect(t.quote.open).toBe(1269.01);
    expect(t.quote.high).toBe(1269.33);
    expect(t.quote.low).toBe(1238.98);
    expect(t.quote.change).toBe(-5.99);
    expect(t.quote.changePercent).toBe(-0.48);
    expect(t.quote.volume).toBe(58417 * 100);
    expect(t.quote.amount).toBe(732273 * 1e4);
  });

  it("parses HK quotes without A-share unit conversion", async () => {
    mockGbkFetch(HK_LINE);
    const [t] = await fetchTencentQuotes(["00700"]);
    expect(t.stock.market).toBe("HKEX");
    expect(t.stock.currency).toBe("HKD");
    expect(t.quote.close).toBe(461.6);
    expect(t.quote.change).toBe(-22.4);
    expect(t.quote.changePercent).toBe(-4.63);
    expect(t.quote.volume).toBe(36237657);
    expect(t.quote.amount).toBeCloseTo(16928705332.905, 0);
  });

  it("propagates upstream failure (cache does not swallow rejections)", async () => {
    // Fresh symbol => no cache hit from earlier tests
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    await expect(fetchTencentQuotes(["601398"])).rejects.toThrow("network down");
  });
});

describe("fetchTencentIndices", () => {
  it("parses the s_ simple index format", async () => {
    mockGbkFetch(INDEX_LINES);
    const indices = await fetchTencentIndices();
    expect(indices).toHaveLength(3);
    const sse = indices.find((i) => i.id === "SSE");
    expect(sse?.value).toBe(3764.15);
    expect(sse?.change).toBe(-118.26);
    expect(sse?.changePercent).toBe(-3.05);
    const gem = indices.find((i) => i.id === "GEM");
    expect(gem?.market).toBe("SZSE");
    expect(gem?.value).toBe(3428.63);
  });
});
