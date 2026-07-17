/**
 * EastMoney A-share financial metrics.
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
import { cache } from "@/lib/cache";
import { EM_STOCK_URL, REQ_HEADERS } from "./shared";

export interface StockFinancials {
  symbol: string;
  pe: number | null;           // 动态PE — f162 / 100
  peTtm: number | null;        // PE TTM — f167 / 100
  peStatic: number | null;     // 静态PE — f163 / 100
  roe: number | null;          // ROE% — f173 (actual percentage)
  totalMv: number | null;      // 总市值(元) — f116
  circulationMv: number | null;// 流通市值(元) — f117
  turnoverRate: number | null; // 换手率% — f168 / 100
}

/**
 * Fetch financial metrics for an A-share stock. Returns null for non-A-share
 * symbols or on upstream error. Cached 300s.
 */
export async function fetchAStockFinancials(symbol: string): Promise<StockFinancials | null> {
  if (!/^\d{6}$/.test(symbol)) return null;

  return cache.get(`em_fin_v3:${symbol}`, 300, async () => {
    const isSh = symbol.startsWith("6") || symbol.startsWith("688");
    const secid = `${isSh ? "1" : "0"}.${symbol}`;

    const url = `${EM_STOCK_URL}?secid=${secid}&fields=f57,f58,f43,f162,f163,f167,f184,f116,f117,f173,f168,f170,f169`;
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`EM fin ${res.status}`);
    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    const num = (v: any): number | null => (v == null || v === "-" || v === "" ? null : Number(v));

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
