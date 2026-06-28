import { NextRequest, NextResponse } from "next/server";
import { fetchSinaQuotes, POPULAR_A_STOCKS, _resolveSinaCodeForExternal } from "@/lib/data/sina";
import { fetchYahooQuote } from "@/lib/data/yahoo";

// Re-export the resolver for clarity
const resolveSinaCode = _resolveSinaCodeForExternal;

export const dynamic = "force-dynamic";

/**
 * GET /api/market/ticker?symbol=600519
 * Unified single-stock real-time quote.
 *
 * Strategy:
 *   - 6-digit A-share (600xxx/000xxx/300xxx/688xxx) → Sina (works in China)
 *   - 5-digit HK code (00700/09988) → Sina (hk-prefixed)
 *   - Alphabetic US ticker (AAPL/TSLA) → Sina (gb-prefixed) → Yahoo fallback
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol required" }, { status: 400 });
  }

  // Try Sina first — covers A/HK/US via different prefixes, all callable from China
  const sinaCode = resolveSinaCode(symbol);
  if (sinaCode) {
    try {
      const tickers = await fetchSinaQuotes([symbol]);
      if (tickers.length > 0 && tickers[0].quote.close > 0) {
        const ticker = tickers[0];
        return NextResponse.json({
          success: true,
          data: {
            stock: {
              symbol: ticker.stock.symbol,
              name: ticker.stock.name,
              nameCn: ticker.stock.nameCn,
              market: ticker.stock.market,
              sector: ticker.stock.sector,
              currency: ticker.stock.currency,
              marketCap: undefined,
            },
            quote: {
              timestamp: Date.now(),
              open: ticker.quote.open,
              high: ticker.quote.high,
              low: ticker.quote.low,
              close: ticker.quote.close,
              volume: ticker.quote.volume,
              amount: ticker.quote.amount,
              change: ticker.quote.change,
              changePercent: ticker.quote.changePercent,
            },
            updatedAt: Date.now(),
          },
          meta: { source: "sina" },
        });
      }
    } catch (e) {
      console.warn(`[ticker] Sina failed for ${symbol}: ${e}`);
    }
  }

  // Yahoo fallback (will fail if blocked in mainland China, but works on overseas servers)
  try {
    const q = await fetchYahooQuote(symbol);
    const info = POPULAR_A_STOCKS.find((s) => s.symbol === symbol) ?? { symbol, name: symbol, market: "UNKNOWN" as const, currency: "USD" };

    return NextResponse.json({
      success: true,
      data: {
        stock: {
          symbol: info.symbol,
          name: info.name,
          nameCn: (info as any).nameCn,
          market: info.market,
          sector: (info as any).sector,
          currency: info.currency,
          marketCap: q.marketCap,
        },
        quote: {
          timestamp: Date.now(),
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.price,
          volume: q.volume,
          change: q.change,
          changePercent: q.changePercent,
        },
        updatedAt: Date.now(),
      },
      meta: { source: "yahoo" },
    });
  } catch (e) {
    console.warn(`[ticker] ${symbol} all sources failed: ${e}`);
    return NextResponse.json(
      { success: false, error: `无法获取 ${symbol} 的实时行情。可能原因：股票代码错误或网络异常。` },
      { status: 502 }
    );
  }
}
