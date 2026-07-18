/**
 * Tencent Finance (qt.gtimg.cn) — fallback real-time quote source.
 *
 * Motivation: Sina's quote endpoint (hq.sinajs.cn) returns 403 from some
 * network environments, while Tencent remains reachable. This module is the
 * secondary source in the chain: Sina → Tencent → mock.
 *
 * Coverage: A-share (sh/sz), HK (hk), US (us) quotes + CN indices (s_ prefix).
 * Responses are GBK-encoded `v_<code>="f1~f2~..."` lines.
 *
 * Unified field layout across markets (0-indexed after splitting on "~"):
 *   [1] name  [2] code  [3] price  [4] prevClose  [5] open  [6] volume
 *   [31] change  [32] changePercent  [33] high  [34] low  [37] amount
 * A-share specifics: volume is in 手 (×100 = shares), amount is in 万元 (×10^4).
 */

import { cache } from "@/lib/cache";
import type { Market, MarketIndex, TickerData } from "@/types";

const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";

const REQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: "https://gu.qq.com/",
};

/** Resolve an internal symbol to a Tencent code: 600519→sh600519, 00700→hk00700, AAPL→usAAPL. */
export function resolveTencentCode(symbol: string): string | null {
  // A-share: 6-digit; SSE for 6xxxxx (incl. 688 STAR), SZSE otherwise
  if (/^\d{6}$/.test(symbol)) {
    return (symbol.startsWith("6") ? "sh" : "sz") + symbol;
  }
  // HK: 5-digit
  if (/^\d{5}$/.test(symbol)) return "hk" + symbol;
  // US: alphabetic ticker
  if (/^[A-Za-z]{1,6}$/.test(symbol)) return "us" + symbol.toUpperCase();
  return null;
}

function marketOf(qqCode: string): Market {
  if (qqCode.startsWith("sh")) return "SSE";
  if (qqCode.startsWith("sz")) return "SZSE";
  if (qqCode.startsWith("hk")) return "HKEX";
  return "NASDAQ";
}

async function fetchTencentRaw(codes: string[]): Promise<string> {
  const res = await fetch(TENCENT_QUOTE_URL + codes.join(","), {
    headers: REQ_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Tencent ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("gbk").decode(buf);
}

function parseTencentQuote(qqCode: string, fields: string[]): TickerData | null {
  const name = fields[1]?.trim();
  const price = parseFloat(fields[3]);
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const prevClose = parseFloat(fields[4]) || 0;
  const open = parseFloat(fields[5]) || 0;
  const rawVolume = parseFloat(fields[6]) || 0;
  const change = Number.isFinite(parseFloat(fields[31]))
    ? parseFloat(fields[31])
    : +(price - prevClose).toFixed(2);
  const changePercent = Number.isFinite(parseFloat(fields[32]))
    ? parseFloat(fields[32])
    : prevClose
      ? +(((price - prevClose) / prevClose) * 100).toFixed(2)
      : 0;
  const high = parseFloat(fields[33]) || price;
  const low = parseFloat(fields[34]) || price;

  const market = marketOf(qqCode);
  const isAShare = market === "SSE" || market === "SZSE";
  const volume = Math.round(isAShare ? rawVolume * 100 : rawVolume);
  const rawAmount = parseFloat(fields[37]) || 0;
  const amount = isAShare ? rawAmount * 1e4 : rawAmount;

  const symbol = qqCode.replace(/^(sh|sz|hk|us)/, "");
  return {
    stock: {
      symbol,
      name,
      market,
      currency: market === "HKEX" ? "HKD" : market === "NASDAQ" || market === "NYSE" ? "USD" : "CNY",
    },
    quote: {
      timestamp: Date.now(),
      open,
      high,
      low,
      close: price,
      volume,
      amount,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
    },
    updatedAt: Date.now(),
  };
}

/** Batch real-time quotes for A/HK/US symbols. Returns [] on total failure. */
export async function fetchTencentQuotes(symbols: string[]): Promise<TickerData[]> {
  const qqCodes = symbols.map(resolveTencentCode).filter(Boolean) as string[];
  if (qqCodes.length === 0) return [];

  const cacheKey = `tencent:q:${[...qqCodes].sort().join(",")}`;
  return cache.get(cacheKey, 3, async () => {
    const raw = await fetchTencentRaw(qqCodes);
    const results: TickerData[] = [];
    for (const line of raw.split("\n")) {
      const m = line.match(/v_(\w+)="([^"]*)"/);
      if (!m || !m[2]) continue;
      const parsed = parseTencentQuote(m[1], m[2].split("~"));
      if (parsed) results.push(parsed);
    }
    return results;
  });
}

/** CN benchmark indices via Tencent's simple (s_ prefixed) format. */
export async function fetchTencentIndices(): Promise<MarketIndex[]> {
  return cache.get("tencent:indices", 30, async () => {
    // s_ simple format: [1]name [2]code [3]price [4]change [5]changePercent
    const raw = await fetchTencentRaw(["s_sh000001", "s_sz399001", "s_sz399006"]);
    const map: Record<string, { id: string; market: Market }> = {
      s_sh000001: { id: "SSE", market: "SSE" },
      s_sz399001: { id: "SZSE", market: "SZSE" },
      s_sz399006: { id: "GEM", market: "SZSE" },
    };
    const results: MarketIndex[] = [];
    for (const line of raw.split("\n")) {
      const m = line.match(/v_(\w+)="([^"]*)"/);
      if (!m || !m[2]) continue;
      const cfg = map[m[1]];
      if (!cfg) continue;
      const f = m[2].split("~");
      const value = parseFloat(f[3]);
      if (!Number.isFinite(value) || value <= 0) continue;
      results.push({
        id: cfg.id,
        name: f[1],
        market: cfg.market,
        value: +value.toFixed(2),
        change: +(parseFloat(f[4]) || 0).toFixed(2),
        changePercent: +(parseFloat(f[5]) || 0).toFixed(2),
      });
    }
    return results;
  });
}
