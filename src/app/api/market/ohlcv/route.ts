import { NextRequest, NextResponse } from "next/server";
import { fetchSinaKLine } from "@/lib/data/sina";
import { fetchEMKLine } from "@/lib/data/eastmoney";

export const dynamic = "force-dynamic";

/**
 * GET /api/market/ohlcv?symbol=600519&interval=1d&range=6mo&limit=120
 *
 * Unified K-line endpoint:
 *   - A-share (6-digit): 新浪 (fastest, no rate limits)
 *   - HK / US: 东方财富 (callable from China, reliable)
 *
 * Intervals: 1d | 1wk | 1mo  (range: 1mo | 3mo | 6mo | 1y | 2y | 5y)
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "120");
  const range = req.nextUrl.searchParams.get("range") ?? "6mo";

  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
  }

  // Map range to bar count (assume ~22 trading days per month)
  const rangeToBars: Record<string, number> = {
    "1mo": 25, "3mo": 70, "6mo": 130, "1y": 250, "2y": 500, "5y": 1200,
  };
  const barCount = limit > 0 ? limit : (rangeToBars[range] ?? 130);

  // Determine market type
  const isAShare = /^\d{6}$/.test(symbol);

  if (isAShare) {
    // Sina K-line — fastest and most reliable for A-shares
    try {
      const bars = await fetchSinaKLine(symbol, Math.min(barCount, 250));
      return NextResponse.json({
        success: true,
        data: bars.slice(-barCount),
        meta: {
          timestamp: Date.now(),
          source: "sina",
          total: bars.length,
          returned: Math.min(bars.length, barCount),
        },
      });
    } catch (err) {
      console.warn(`[ohlcv] Sina failed for ${symbol}, trying EastMoney:`, err);
      // Fall through to EM as backup
      try {
        const period = interval === "1wk" ? "weekly" : interval === "1mo" ? "monthly" : "daily";
        const bars = await fetchEMKLine(symbol, period, Math.min(barCount, 500));
        return NextResponse.json({
          success: true,
          data: bars.slice(-barCount),
          meta: { timestamp: Date.now(), source: "eastmoney", total: bars.length, returned: Math.min(bars.length, barCount) },
        });
      } catch (e2) {
        console.error(`[ohlcv] EastMoney also failed for ${symbol}:`, e2);
        return NextResponse.json(
          { success: false, error: `无法获取 ${symbol} 的K线数据` },
          { status: 502 }
        );
      }
    }
  }

  // HK / US — use EastMoney (callable from China)
  try {
    const period = interval === "1wk" ? "weekly" : interval === "1mo" ? "monthly" : "daily";
    const bars = await fetchEMKLine(symbol, period, Math.min(barCount, 500));

    if (bars.length === 0) {
      return NextResponse.json(
        { success: false, error: `无K线数据：${symbol}。请确认代码正确。` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bars.slice(-barCount),
      meta: {
        timestamp: Date.now(),
        source: "eastmoney",
        total: bars.length,
        returned: Math.min(bars.length, barCount),
      },
    });
  } catch (err) {
    console.error(`[ohlcv] EastMoney failed for ${symbol}:`, err);
    return NextResponse.json(
      { success: false, error: `无法获取 ${symbol} 的K线数据。可能原因：代码错误、停牌、或网络异常。` },
      { status: 502 }
    );
  }
}
