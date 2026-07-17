import { fetchSinaKLine } from "@/lib/data/sina";
import { fetchEMKLine } from "@/lib/data/eastmoney";
import { withApiHandler } from "@/lib/api/handler";
import { apiSuccess } from "@/lib/api/response";
import { NotFoundError, UpstreamError } from "@/lib/api/errors";
import { intervalSchema, rangeSchema, symbolSchema, validate } from "@/lib/api/validation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const rangeToBars: Record<string, number> = {
  "1mo": 25, "3mo": 70, "6mo": 130, "1y": 250, "2y": 500, "5y": 1200,
};

const limitSchema = z.coerce.number().int().positive().max(1200).optional();

type Period = "daily" | "weekly" | "monthly";
function toPeriod(interval: "1d" | "1wk" | "1mo"): Period {
  return interval === "1wk" ? "weekly" : interval === "1mo" ? "monthly" : "daily";
}

/**
 * GET /api/market/ohlcv?symbol=600519&interval=1d&range=6mo&limit=120
 *
 * Unified K-line endpoint:
 *   - A-share (6-digit): 新浪 (fastest, no rate limits), 东方财富 fallback
 *   - HK / US: 东方财富 (callable from China, reliable)
 */
export const GET = withApiHandler("market/ohlcv", async (req) => {
  const sp = req.nextUrl.searchParams;
  const symbol = validate(symbolSchema, sp.get("symbol"));
  const interval = validate(intervalSchema, sp.get("interval") ?? "1d");
  const range = validate(rangeSchema, sp.get("range") ?? "6mo");
  const limitParam = validate(limitSchema, sp.get("limit") ?? undefined);

  // Assume ~22 trading days per month when deriving bar count from range.
  const barCount = limitParam ?? (rangeToBars[range] ?? 130);
  const period = toPeriod(interval);
  const isAShare = /^\d{6}$/.test(symbol);

  if (isAShare) {
    // Sina K-line — fastest and most reliable for A-shares
    try {
      const bars = await fetchSinaKLine(symbol, Math.min(barCount, 250));
      return apiSuccess(bars.slice(-barCount), {
        source: "sina",
        total: bars.length,
        returned: Math.min(bars.length, barCount),
      });
    } catch (err) {
      console.warn(`[ohlcv] Sina failed for ${symbol}, trying EastMoney:`, err);
      try {
        const bars = await fetchEMKLine(symbol, period, Math.min(barCount, 500));
        return apiSuccess(bars.slice(-barCount), {
          source: "eastmoney",
          total: bars.length,
          returned: Math.min(bars.length, barCount),
        });
      } catch (e2) {
        console.error(`[ohlcv] EastMoney also failed for ${symbol}:`, e2);
        throw new UpstreamError(`无法获取 ${symbol} 的K线数据`);
      }
    }
  }

  // HK / US — use EastMoney (callable from China)
  let bars;
  try {
    bars = await fetchEMKLine(symbol, period, Math.min(barCount, 500));
  } catch (err) {
    console.error(`[ohlcv] EastMoney failed for ${symbol}:`, err);
    throw new UpstreamError(`无法获取 ${symbol} 的K线数据。可能原因：代码错误、停牌、或网络异常。`);
  }

  if (bars.length === 0) {
    throw new NotFoundError(`无K线数据：${symbol}。请确认代码正确。`);
  }

  return apiSuccess(bars.slice(-barCount), {
    source: "eastmoney",
    total: bars.length,
    returned: Math.min(bars.length, barCount),
  });
});
