/**
 * EastMoney (东方财富) market data client.
 * Covers: sector/industry heat map, HK & US K-line, A-share financial metrics.
 *
 * All endpoints are reachable from mainland China without VPN.
 * No API key required for public quote endpoints.
 *
 * Field mapping (verified 2026-06-27 from push2 API response):
 *   f43 = 最新价 ×100           f162 = 动态PE ×100
 *   f167 = PE TTM ×100          f163 = 静态PE ×100
 *   f184 = 市净率 PB (actual)    f173 = ROE% (actual, not ×100)
 *   f116 = 总市值(元)            f117 = 流通市值(元)
 *   f168 = 换手率% ×100          f170 = 涨跌幅% ×100
 */

import type { MarketHeatmapItem, SectorRotation } from "@/types";
import { cache } from "@/lib/cache";

const EM_PUSH_URL = "https://push2.eastmoney.com/api/qt/clist/get";
const EM_DATA_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const EM_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const REQ_HEADERS = {
  "Referer": "https://quote.eastmoney.com/center/boardlist.html",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

// ---------------- Cache (shared CacheService) ----------------


// ---------------- Sector / Industry data ----------------

export async function fetchIndustrySectors(): Promise<MarketHeatmapItem[]> {
  return cache.get("em_sectors", 30, async () => {
    const url = `${EM_PUSH_URL}?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f12,f14,f3,f62,f184,f128,f136`;
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`EM sectors ${res.status}`);
    const json = await res.json();
    if (!json?.data?.diff) return [];

    return json.data.diff.map((row: any) => ({
      sector: row.f14 as string,
      sectorCode: row.f12 as string,
      changePercent: Number(row.f3) || 0,
      volume: Math.abs(Number(row.f62) || 0) / 1e8,
      leadingStock: (row.f128 as string) ?? undefined,
    })) as MarketHeatmapItem[];
  });
}

export async function fetchSectorRotation(): Promise<SectorRotation[]> {
  return cache.get("em_rotation", 60, async () => {
    const sectors = await fetchIndustrySectors();
    const sorted = [...sectors].sort((a, b) => b.changePercent - a.changePercent);
    const n = sorted.length;
    return sorted.map((s, i) => {
      const momentum = Math.round(s.changePercent * 10);
      let trend: SectorRotation["trend"];
      if (i < n / 4) trend = "leading";
      else if (i < n / 2) trend = "improving";
      else if (i < (3 * n) / 4) trend = "weakening";
      else trend = "lagging";
      return { sector: s.sector, momentum: Math.max(-100, Math.min(100, momentum)), trend };
    });
  });
}

// ---------------- K-Line (A / HK / US) ----------------

function resolveEmSecid(symbol: string): { secid: string; market: "HK" | "US" | "A" } | null {
  if (/^\d{6}$/.test(symbol)) {
    const isSh = symbol.startsWith("6") || symbol.startsWith("688");
    return { secid: `${isSh ? "1" : "0"}.${symbol}`, market: "A" };
  }
  if (/^\d{5}$/.test(symbol)) {
    return { secid: `116.${symbol.padStart(5, "0")}`, market: "HK" };
  }
  if (/^[A-Z]{1,6}$/.test(symbol)) {
    return { secid: `105.${symbol}`, market: "US" };
  }
  return null;
}

export interface EMKLineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchEMKLine(
  symbol: string,
  period: "daily" | "weekly" | "monthly" = "daily",
  count = 120
): Promise<EMKLineBar[]> {
  const resolved = resolveEmSecid(symbol);
  if (!resolved) throw new Error(`Cannot resolve EM secid for ${symbol}`);

  const klt = period === "daily" ? "101" : period === "weekly" ? "102" : "103";
  const url = `${EM_KLINE_URL}?secid=${resolved.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&beg=0&end=20500101&lmt=${count}`;

  const cacheKey = `em_kline:${symbol}:${period}:${count}`;
  return cache.get(cacheKey, 60, async () => {
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`EM kline ${res.status}`);
    const json = await res.json();
    const klines: string[] = json?.data?.klines ?? [];
    if (klines.length === 0) throw new Error(`No klines for ${symbol}`);

    return klines.map(line => {
      const [date, open, close, high, low, volume] = line.split(",");
      return {
        timestamp: new Date(`${date}T00:00:00+08:00`).getTime(),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      };
    });
  });
}

// ---------------- A-share Financial Metrics ----------------

export interface StockFinancials {
  symbol: string;
  // Fields verified against push2 API response (2026-06-27)
  pe: number | null;           // 动态PE — f162 / 100  ✓ verified
  peTtm: number | null;        // PE TTM — f167 / 100  (may appear low for high-growth stocks)
  peStatic: number | null;     // 静态PE — f163 / 100  ✓ verified
  roe: number | null;          // ROE% — f173 (actual percentage) ✓ verified
  totalMv: number | null;      // 总市值(元) — f116  ✓ verified
  circulationMv: number | null;// 流通市值(元) — f117  ✓ verified
  turnoverRate: number | null; // 换手率% — f168 / 100  ✓ verified
}

/**
 * Fetch financial metrics for A-share stocks from EastMoney push2 API.
 *
 * Verified field mappings (cross-checked with 贵州茅台/比亚迪/宁德时代, 2026-06-27):
 * - f162 = 动态PE ×100 → /100 = actual PE
 * - f163 = 静态PE ×100 → /100 = actual PE  
 * - f167 = PE TTM ×100 → /100 = actual PE TTM
 * - f173 = ROE actual percentage (NOT ×100)
 * - f116 = 总市值 元
 * - f117 = 流通市值 元
 * - f168 = 换手率% ×100 → /100 = actual %
 *
 * NOTE: PB (f184) is NOT used — values are inconsistent across stocks
 * (6.34 for 茅台, -11.82 for BYD, 52.45 for CATL), suggesting it
 * maps to different metrics per stock.
 */
export async function fetchAStockFinancials(symbol: string): Promise<StockFinancials | null> {
  if (!/^\d{6}$/.test(symbol)) return null;

  return cache.get(`em_fin_v3:${symbol}`, 300, async () => {
    const isSh = symbol.startsWith("6") || symbol.startsWith("688");
    const secid = `${isSh ? "1" : "0"}.${symbol}`;

    // Request all known financial fields
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f162,f163,f167,f184,f116,f117,f173,f168,f170,f169`;
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`EM fin ${res.status}`);
    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    const num = (v: any) => (v == null || v === "-" || v === "" ? null : Number(v));

    return {
      symbol,
      pe: num(d.f162) != null ? num(d.f162)! / 100 : null,        // PE dynamic ×100
      peTtm: num(d.f167) != null ? num(d.f167)! / 100 : null,      // PE TTM ×100
      peStatic: num(d.f163) != null ? num(d.f163)! / 100 : null,   // PE static ×100
      roe: num(d.f173),         // ROE actual percentage
      totalMv: num(d.f116),     // Total market cap (元)
      circulationMv: num(d.f117), // Float market cap (元)
      turnoverRate: num(d.f168) != null ? num(d.f168)! / 100 : null, // Turnover rate ×100
    };
  }).catch(() => null);
}

// ---------------- Sector Constituent Stocks ----------------

export interface SectorStockInfo {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  pe: number | null;
  marketCap: number | null;
}

/**
 * Fetch constituent stocks within a sector by its EastMoney code.
 * E.g., sectorCode = "BK0477" for 白酒板块.
 */
export async function fetchSectorConstituents(sectorCode: string): Promise<SectorStockInfo[]> {
  return cache.get(`em_sector_stocks:${sectorCode}`, 60, async () => {
    // f12=代码 f14=名称 f2=现价 f3=涨跌幅 f4=涨跌额 f9=PE动态 f20=总市值
    const url = `${EM_PUSH_URL}?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fs=b:${sectorCode}&fields=f12,f14,f2,f3,f4,f9,f20`;
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`EM sector stocks ${res.status}`);
    const json = await res.json();
    if (!json?.data?.diff) return [];

    return json.data.diff.map((row: any) => ({
      symbol: row.f12 as string,
      name: row.f14 as string,
      price: Number(row.f2) || 0,
      changePercent: Number(row.f3) || 0,
      change: Number(row.f4) || 0,
      pe: row.f9 ? Number(row.f9) : null,   // f9 is actual PE in list API
      marketCap: row.f20 ?? null,
    }));
  });
}

// ---------------- Full A-share Market Screener ----------------

export interface ASharesScreenerItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  change: number;
  volume: number;
  amount: number;
  pe: number | null;
  roe: number | null;
  marketCap: number | null;
  turnoverRate: number | null;
}

/**
 * Fetch all A-shares with financial data for the screener.
 * Uses EastMoney push2 list API to get the full market.
 *
 * @param filters - optional filter criteria
 *   - peMax: max PE dynamic
 *   - roeMin: min ROE %
 *   - sortBy: field to sort by ("changePercent", "pe", "roe", "volume")
 *   - sortOrder: "asc" | "desc"
 *   - limit: max results (default 200)
 */
export async function fetchAllAShares(filters?: {
  peMax?: number;
  roeMin?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}): Promise<ASharesScreenerItem[]> {
  // Smart sort: when filtering by PE, sort by PE ascending; when by ROE, sort by ROE descending
  let effectiveSort = filters?.sortBy ?? "changePercent";
  let effectiveOrder = filters?.sortOrder ?? "desc";
  if (filters?.peMax != null && !filters?.sortBy) { effectiveSort = "pe"; effectiveOrder = "asc"; }
  if (filters?.roeMin != null && !filters?.sortBy) { effectiveSort = "roe"; effectiveOrder = "desc"; }

  const sortField = effectiveSort === "pe" ? "f9" :
                    effectiveSort === "roe" ? "f37" :
                    effectiveSort === "volume" ? "f5" :
                    "f3";
  const sortOrder = effectiveOrder === "asc" ? "0" : "1";
  const targetLimit = Math.min(filters?.limit ?? 200, 500);
  // EastMoney API max pz=100 per page — paginate to reach target
  const perPage = 100;
  const pages = Math.ceil(targetLimit / perPage);

  const cacheKey = `em_all_a:${sortField}:${sortOrder}:${targetLimit}:pe${filters?.peMax ?? "x"}:roe${filters?.roeMin ?? "x"}`;
  return cache.get(cacheKey, 30, async () => {
    let allItems: ASharesScreenerItem[] = [];

    // Fetch pages in parallel with timeout to avoid Turbopack timeout
    const pagePromises = Array.from({ length: pages }, (_, i) => {
      const p = i + 1;
      const url = `${EM_PUSH_URL}?pn=${p}&pz=${perPage}&po=${sortOrder === "0" ? "0" : "1"}&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80&fid=${sortField}&fields=f12,f14,f2,f3,f4,f5,f6,f9,f37,f20,f8`;
      return fetch(url, { headers: REQ_HEADERS, signal: AbortSignal.timeout(5000) })
        .then(res => res.ok ? res.json() : null)
        .catch(() => null);
    });

    const results = await Promise.allSettled(pagePromises);
    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value?.data?.diff) continue;
      const items = r.value.data.diff.map((row: any) => ({
        symbol: row.f12 as string,
        name: row.f14 as string,
        price: Number(row.f2) || 0,
        changePercent: Number(row.f3) || 0,
        change: Number(row.f4) || 0,
        volume: Number(row.f5) || 0,
        amount: Number(row.f6) || 0,
        pe: row.f9 ? Number(row.f9) : null,
        roe: row.f37 ?? null,
        marketCap: row.f20 ?? null,
        turnoverRate: row.f8 ? Number(row.f8) / 100 : null,
      })) as ASharesScreenerItem[];
      allItems.push(...items);
    }

    // Client-side filtering for PE/ROE
    if (filters?.peMax != null) {
      allItems = allItems.filter(i => i.pe != null && i.pe > 0 && i.pe <= filters.peMax!);
    }
    if (filters?.roeMin != null) {
      allItems = allItems.filter(i => i.roe != null && i.roe >= filters.roeMin!);
    }

    return allItems;
  });
}
