/**
 * Yahoo Finance direct API client
 * Calls Yahoo's v8 chart API from the Next.js server with browser headers to avoid rate limiting.
 * Uses the unified CacheService for TTL-based caching.
 */
import { cache } from "@/lib/cache";

const YAHOO_CHART_API = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_API = "https://query1.finance.yahoo.com/v7/finance/quote";

// Browser-like headers to avoid Yahoo's bot detection
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
};

// ============ Symbol Mapping ============

const SYMBOL_MAP: Record<string, string> = {
  "600519": "600519.SS", "601398": "601398.SS", "688981": "688981.SS",
  "600036": "600036.SS", "601318": "601318.SS", "600900": "600900.SS",
  "300750": "300750.SZ", "000858": "000858.SZ", "300059": "300059.SZ",
  "002594": "002594.SZ", "000001": "000001.SZ",
  "00700": "0700.HK", "09988": "9988.HK", "03690": "3690.HK",
  "AAPL": "AAPL", "TSLA": "TSLA", "NVDA": "NVDA", "MSFT": "MSFT",
  "GOOGL": "GOOGL", "AMZN": "AMZN", "META": "META", "TSM": "TSM",
  "AMD": "AMD", "INTC": "INTC", "BABA": "BABA",
};

export const KNOWN_STOCKS = [
  { symbol: "600519", name: "贵州茅台", market: "SSE" as const, sector: "白酒", currency: "CNY" },
  { symbol: "300750", name: "宁德时代", market: "SZSE" as const, sector: "新能源汽车", currency: "CNY" },
  { symbol: "000858", name: "五粮液", market: "SZSE" as const, sector: "白酒", currency: "CNY" },
  { symbol: "601398", name: "工商银行", market: "SSE" as const, sector: "银行", currency: "CNY" },
  { symbol: "688981", name: "中芯国际", market: "SSE" as const, sector: "半导体", currency: "CNY" },
  { symbol: "300059", name: "东方财富", market: "SZSE" as const, sector: "券商", currency: "CNY" },
  { symbol: "002594", name: "比亚迪", market: "SZSE" as const, sector: "新能源汽车", currency: "CNY" },
  { symbol: "600036", name: "招商银行", market: "SSE" as const, sector: "银行", currency: "CNY" },
  { symbol: "AAPL", name: "Apple Inc.", market: "NASDAQ" as const, sector: "消费电子", currency: "USD" },
  { symbol: "TSLA", name: "Tesla Inc.", market: "NASDAQ" as const, sector: "新能源汽车", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA Corp.", market: "NASDAQ" as const, sector: "AI芯片", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft Corp.", market: "NASDAQ" as const, sector: "云计算", currency: "USD" },
  { symbol: "GOOGL", name: "Alphabet Inc.", market: "NASDAQ" as const, sector: "互联网", currency: "USD" },
  { symbol: "AMZN", name: "Amazon.com", market: "NASDAQ" as const, sector: "电商/云", currency: "USD" },
  { symbol: "META", name: "Meta Platforms", market: "NASDAQ" as const, sector: "社交媒体", currency: "USD" },
  { symbol: "TSM", name: "台积电", market: "NYSE" as const, sector: "半导体制造", currency: "USD" },
  { symbol: "AMD", name: "AMD", market: "NASDAQ" as const, sector: "半导体", currency: "USD" },
  { symbol: "00700", name: "腾讯控股", market: "HKEX" as const, sector: "互联网", currency: "HKD" },
  { symbol: "09988", name: "阿里巴巴", market: "HKEX" as const, sector: "互联网", currency: "HKD" },
];

const INDICES_LIST = [
  { id: "SSE", name: "上证指数", ticker: "000001.SS", market: "SSE" as const },
  { id: "SZSE", name: "深证成指", ticker: "399001.SZ", market: "SZSE" as const },
  { id: "HSI", name: "恒生指数", ticker: "^HSI", market: "HKEX" as const },
  { id: "SPX", name: "标普500", ticker: "^GSPC", market: "NYSE" as const },
  { id: "NDX", name: "纳斯达克", ticker: "^IXIC", market: "NASDAQ" as const },
  { id: "DJI", name: "道琼斯", ticker: "^DJI", market: "NYSE" as const },
  { id: "BTC", name: "比特币", ticker: "BTC-USD", market: "CRYPTO" as const },
];

// ============ API Calls ============

async function fetchYahooChart(symbol: string, range = "2d", interval = "1d") {
  const params = new URLSearchParams({ symbol, range, interval, includePrePost: "false" });
  const url = `${YAHOO_CHART_API}/${encodeURIComponent(symbol)}?${params}`;

  const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  return result;
}

export interface YahooQuote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  marketCap?: number;
  currency?: string;
}

export async function fetchYahooQuote(symbol: string): Promise<YahooQuote> {
  const yahooSymbol = SYMBOL_MAP[symbol] ?? symbol;
  const cacheKey = `yahoo:q:${yahooSymbol}`;

  return cache.get(cacheKey, 45, async (): Promise<YahooQuote> => {
    try {
      // Use the v7 quote API which is lighter and less rate-limited
      const url = `${YAHOO_QUOTE_API}?symbols=${encodeURIComponent(yahooSymbol)}`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) throw new Error(`Quote API returned ${res.status}`);
      const json = await res.json();
      const q = json?.quoteResponse?.result?.[0];

      if (!q) {
        // Fallback to chart API
        const chart = await fetchYahooChart(yahooSymbol, "2d");
        const meta = chart.meta;
        const quotes = chart.indicators?.quote?.[0];

        const price = meta.regularMarketPrice ?? quotes?.close?.filter(Boolean).pop() ?? meta.previousClose ?? 0;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - prevClose;
        const changePercent = prevClose ? (change / prevClose) * 100 : 0;

        return {
          symbol, name: meta.symbol ?? symbol, price, prevClose,
          open: quotes?.open?.filter(Boolean).pop() ?? price,
          high: meta.regularMarketDayHigh ?? quotes?.high?.filter(Boolean).pop() ?? price,
          low: meta.regularMarketDayLow ?? quotes?.low?.filter(Boolean).pop() ?? price,
          volume: meta.regularMarketVolume ?? 0,
          change, changePercent,
          marketCap: meta.marketCap, currency: meta.currency,
        };
      }

      const price = q.regularMarketPrice ?? q.regularMarketPreviousClose ?? 0;
      const prevClose = q.regularMarketPreviousClose ?? price;
      const change = price - prevClose;
      const changePercent = prevClose ? (change / prevClose) * 100 : 0;

      return {
        symbol, name: q.shortName ?? q.symbol ?? symbol, price, prevClose,
        open: q.regularMarketOpen ?? price,
        high: q.regularMarketDayHigh ?? price,
        low: q.regularMarketDayLow ?? price,
        volume: q.regularMarketVolume ?? 0,
        change, changePercent,
        marketCap: q.marketCap, currency: q.currency,
      };
    } catch (e) {
      throw new Error(`Failed to fetch ${symbol}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  });
}

export interface YahooIndex {
  id: string;
  name: string;
  market: string;
  value: number;
  change: number;
  changePercent: number;
}

export async function fetchYahooIndices(): Promise<YahooIndex[]> {
  return cache.get("yahoo:indices", 90, async () => {
    const results: YahooIndex[] = [];
    for (const idx of INDICES_LIST) {
      try {
        const quote = await fetchYahooQuote(idx.ticker);
        results.push({
          id: idx.id, name: idx.name, market: idx.market,
          value: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
        });
        // Small delay between requests to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.warn(`Index ${idx.name} failed: ${e}`);
        results.push({ id: idx.id, name: idx.name, market: idx.market, value: 0, change: 0, changePercent: 0 });
      }
    }
    return results;
  });
}

// ============ OHLCV (K-line) Data ============

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch historical OHLCV (K-line) data from Yahoo Finance.
 * @param symbol — raw symbol like "600519" (auto-mapped), "AAPL", "00700"
 * @param range — Yahoo range string: "1mo","3mo","6mo","1y","2y","5y","max"
 * @param interval — Yahoo interval: "1d","1wk","1mo"
 */
export async function fetchYahooOHLCV(
  symbol: string,
  range = "6mo",
  interval = "1d"
): Promise<OHLCVBar[]> {
  const yahooSymbol = SYMBOL_MAP[symbol] ?? symbol;
  const cacheKey = `yahoo:ohlcv:${yahooSymbol}:${range}:${interval}`;

  return cache.get(cacheKey, 300, async () => {
    try {
      const result = await fetchYahooChart(yahooSymbol, range, interval);
      const timestamps: number[] = result.timestamp ?? [];
      const quotes = result.indicators?.quote?.[0];
      if (!quotes || timestamps.length === 0) throw new Error("No OHLCV data");

      const bars: OHLCVBar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = quotes.open?.[i];
        const h = quotes.high?.[i];
        const l = quotes.low?.[i];
        const c = quotes.close?.[i];
        const v = quotes.volume?.[i];
        if (o == null || c == null) continue;

        bars.push({
          timestamp: timestamps[i] * 1000, // Yahoo returns seconds, we store ms
          open: Math.round(o * 100) / 100,
          high: Math.round((h ?? Math.max(o, c)) * 100) / 100,
          low: Math.round((l ?? Math.min(o, c)) * 100) / 100,
          close: Math.round(c * 100) / 100,
          volume: v ?? 0,
        });
      }

      return bars;
    } catch (e) {
      throw new Error(`Yahoo OHLCV failed for ${symbol}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  });
}
