/**
 * EastMoney K-line (OHLCV) data for A / HK / US markets.
 */
import { cache } from "@/lib/cache";
import { EM_KLINE_URL, REQ_HEADERS, resolveEmSecid } from "./shared";

export interface EMKLineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch K-line bars. Supports A-shares, HK, and US via EastMoney secid resolution.
 * Cached 60s per (symbol, period, count).
 */
export async function fetchEMKLine(
  symbol: string,
  period: "daily" | "weekly" | "monthly" = "daily",
  count = 120
): Promise<EMKLineBar[]> {
  const resolved = resolveEmSecid(symbol);
  if (!resolved) throw new Error(`Cannot resolve EM secid for ${symbol}`);

  const klt = period === "daily" ? "101" : period === "weekly" ? "102" : "103";
  const url = `${EM_KLINE_URL}?secid=${resolved.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&beg=0&end=20500101&lmt=${count}`;

  return cache.get(`em_kline:${symbol}:${period}:${count}`, 60, async () => {
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
