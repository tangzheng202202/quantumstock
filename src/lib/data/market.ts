/**
 * Market Data Service
 * Fetches real-time data via Next.js API routes. The server resolves a
 * fallback chain per endpoint (e.g. Sina → Tencent → mock for quotes), and
 * reports the actual provider in `meta.source`.
 */

import type { MarketIndex, MarketHeatmapItem, Quote, SectorRotation, StockInfo, TickerData } from "@/types";
import { POPULAR_A_STOCKS } from "./sina";

// ---- Data source identity ----

/** Provider identifiers reported by the market API routes (`meta.source`). */
export type MarketDataSource = "sina" | "tencent" | "eastmoney" | "yahoo" | "mock" | "api";

/** Human-readable badge labels for each provider. */
const DATA_SOURCE_LABELS: Record<MarketDataSource, string> = {
  sina: "新浪实时",
  tencent: "腾讯实时",
  eastmoney: "东方财富",
  yahoo: "Yahoo 财经",
  mock: "离线数据",
  api: "实时数据",
};

/** Map an API `meta.source` value to its display label. */
export function dataSourceLabel(source: string): string {
  return DATA_SOURCE_LABELS[source as MarketDataSource] ?? DATA_SOURCE_LABELS.api;
}

// ---- Mock fallback data ----

export const MOCK_INDICES: MarketIndex[] = [
  { id: "SSE", name: "上证指数", market: "SSE", value: 3356.82, change: 23.45, changePercent: 0.70 },
  { id: "SZSE", name: "深证成指", market: "SZSE", value: 10842.31, change: -15.22, changePercent: -0.14 },
  { id: "GEM", name: "创业板指", market: "SZSE", value: 2183.45, change: 12.34, changePercent: 0.57 },
];

export const MOCK_HEATMAP: MarketHeatmapItem[] = [
  { sector: "半导体", changePercent: 3.2, volume: 125.6, leadingStock: "中芯国际" },
  { sector: "新能源汽车", changePercent: 2.8, volume: 98.3, leadingStock: "比亚迪" },
  { sector: "AI", changePercent: 2.5, volume: 156.2, leadingStock: "寒武纪" },
  { sector: "光伏", changePercent: -1.8, volume: 45.7, leadingStock: "隆基绿能" },
  { sector: "医药", changePercent: -0.5, volume: 67.8, leadingStock: "药明康德" },
  { sector: "消费电子", changePercent: 1.2, volume: 89.4, leadingStock: "立讯精密" },
  { sector: "银行", changePercent: -0.3, volume: 112.5, leadingStock: "招商银行" },
  { sector: "白酒", changePercent: -2.1, volume: 34.6, leadingStock: "贵州茅台" },
  { sector: "军工", changePercent: 4.1, volume: 78.9, leadingStock: "中航沈飞" },
  { sector: "电力", changePercent: 0.8, volume: 56.3, leadingStock: "长江电力" },
  { sector: "券商", changePercent: 1.5, volume: 145.2, leadingStock: "中信证券" },
  { sector: "房地产", changePercent: -3.2, volume: 23.1, leadingStock: "万科A" },
];

export const MOCK_SECTOR_ROTATION: SectorRotation[] = [
  { sector: "半导体", momentum: 85, trend: "leading" },
  { sector: "AI", momentum: 78, trend: "leading" },
  { sector: "军工", momentum: 65, trend: "leading" },
  { sector: "新能源汽车", momentum: 55, trend: "improving" },
  { sector: "消费电子", momentum: 40, trend: "improving" },
  { sector: "券商", momentum: 25, trend: "improving" },
  { sector: "电力", momentum: 10, trend: "weakening" },
  { sector: "银行", momentum: -5, trend: "weakening" },
  { sector: "医药", momentum: -20, trend: "weakening" },
  { sector: "光伏", momentum: -45, trend: "lagging" },
  { sector: "白酒", momentum: -60, trend: "lagging" },
  { sector: "房地产", momentum: -85, trend: "lagging" },
];

export { POPULAR_A_STOCKS as KNOWN_STOCKS };

let _mc = 0;
export function generateMockQuote(stock: StockInfo): Quote {
  _mc++;
  const bp = stock.market === "SSE" || stock.market === "SZSE" ? 30 + (stock.symbol.charCodeAt(0) % 30) * 5 : 100;
  const s = Math.sin(_mc * 0.7) * 0.04;
  return {
    timestamp: Date.now(), open: +((bp + s * 10).toFixed(2)), high: +((bp + Math.abs(s) * 15).toFixed(2)),
    low: +((bp - Math.abs(s) * 15).toFixed(2)), close: +bp.toFixed(2),
    volume: 5000000 + Math.abs(Math.floor(s * 50000000)),
    amount: 100000000 + Math.abs(Math.floor(s * 5e8)),
    change: +(s * 10).toFixed(2), changePercent: +(s * 100).toFixed(2),
  };
}

export function getMockTickers(): TickerData[] {
  _mc = 0;
  return POPULAR_A_STOCKS.map(s => ({ stock: s, quote: generateMockQuote(s), updatedAt: Date.now() }));
}

// ---- Real API (via Next.js route handlers) ----

async function apiGet<T>(url: string, fallback: T): Promise<{ data: T; source: MarketDataSource }> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.success && json.data) return { data: json.data, source: json.meta?.source ?? "api" };
    throw new Error("no data");
  } catch { return { data: fallback, source: "mock" }; }
}

export async function fetchIndices() {
  return apiGet<MarketIndex[]>("/api/market/indices", MOCK_INDICES);
}

export async function fetchQuotes(symbols?: string[]) {
  const q = symbols?.length ? `?symbols=${symbols.join(",")}` : "";
  return apiGet<TickerData[]>(`/api/market/quotes${q}`, getMockTickers());
}

export async function searchStocks(query: string): Promise<StockInfo[]> {
  try {
    const res = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`);
    if (res.ok) { const j = await res.json(); if (j.success && j.data) return j.data; }
  } catch {}
  return [];
}
