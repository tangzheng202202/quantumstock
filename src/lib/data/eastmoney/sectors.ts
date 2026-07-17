/**
 * EastMoney sector / industry data: heat map, rotation, constituents.
 */
import { cache } from "@/lib/cache";
import type { MarketHeatmapItem, SectorRotation } from "@/types";
import { EM_PUSH_URL, REQ_HEADERS } from "./shared";

/** Fetch industry sector heat map. Cached 30s. */
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

/** Derive sector rotation (trend quartiles) from the heat map. Cached 60s. */
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
 * E.g., sectorCode = "BK0477" for 白酒板块. Cached 60s.
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
