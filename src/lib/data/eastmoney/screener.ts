/**
 * EastMoney full A-share market screener.
 */
import { cache } from "@/lib/cache";
import { EM_PUSH_URL, REQ_HEADERS } from "./shared";

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

export interface ScreenerFilters {
  peMax?: number;
  roeMin?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}

/**
 * Fetch all A-shares with financial data for the screener.
 * Paginates the EastMoney push2 list API (max 100/page) in parallel.
 * Smart sort: filtering by PE sorts PE asc; by ROE sorts ROE desc.
 * Cached 30s per filter combination.
 */
export async function fetchAllAShares(filters?: ScreenerFilters): Promise<ASharesScreenerItem[]> {
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
  const perPage = 100;
  const pages = Math.ceil(targetLimit / perPage);

  const cacheKey = `em_all_a:${sortField}:${sortOrder}:${targetLimit}:pe${filters?.peMax ?? "x"}:roe${filters?.roeMin ?? "x"}`;
  return cache.get(cacheKey, 30, async () => {
    let allItems: ASharesScreenerItem[] = [];

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
