/**
 * Sina Finance direct client — called from Next.js server-side.
 * Supports ALL A-share stocks dynamically (5000+ stocks).
 * No Python engine dependency. Works directly from China.
 */
import { cache } from "@/lib/cache";
import type { Market, MarketIndex, StockInfo, TickerData } from "@/types";

const SINA_QUOTE_URL = "http://hq.sinajs.cn/list=";
const REQ_HEADERS = {
  Referer: "https://finance.sina.com.cn",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// Non-A-share symbols that need explicit mapping
const OVERSEAS_MAP: Record<string, string> = {
  "00700": "hk00700", "09988": "hk09988", "03690": "hk03690", "09618": "hk09618", "01810": "hk01810",
  "AAPL": "gb_aapl", "TSLA": "gb_tsla", "NVDA": "gb_nvda",
  "MSFT": "gb_msft", "GOOGL": "gb_googl", "AMZN": "gb_amzn",
  "META": "gb_meta", "AMD": "gb_amd", "INTC": "gb_intc", "BABA": "gb_baba",
  "TSM": "gb_tsm", "NIO": "gb_nio",
  "JD": "gb_jd", "BIDU": "gb_bidu", "PDD": "gb_pdd", "NFLX": "gb_nflx",
  "DIS": "gb_dis", "COIN": "gb_coin", "UBER": "gb_uber", "ABNB": "gb_abnb",
};

/**
 * Resolve any symbol to Sina code.
 * A-shares (6 digits): auto-detect SSE (sh) vs SZSE (sz).
 * HK stocks (5 digits starting with 0): auto-prefix hk
 * US tickers (alphabetic): lowercase with gb_ prefix
 * Others: use hardcoded map.
 */
function resolveSinaCode(symbol: string): string | null {
  if (OVERSEAS_MAP[symbol]) return OVERSEAS_MAP[symbol];

  // A-share: 6-digit numeric code
  if (/^\d{6}$/.test(symbol)) {
    const prefix = symbol.startsWith("6") || symbol.startsWith("688") ? "sh" : "sz";
    return prefix + symbol;
  }

  // HK stock: 5-digit code (00700, 09988, etc.) — pad with leading zero
  if (/^\d{5}$/.test(symbol)) {
    return "hk" + symbol.padStart(5, "0");
  }

  // US stock: alphabetic ticker (AAPL, TSLA, etc.)
  if (/^[A-Z]{1,6}$/.test(symbol)) {
    return "gb_" + symbol.toLowerCase();
  }

  return null;
}

// Export so other modules (ticker route) can reuse the resolution
export { resolveSinaCode as _resolveSinaCodeForExternal };

/**
 * Determine market from symbol pattern
 */
function detectMarket(symbol: string): Market {
  if (/^\d{6}$/.test(symbol)) {
    if (symbol.startsWith("6")) return "SSE";
    return "SZSE";
  }
  if (symbol.length === 5 && /^\d/.test(symbol)) return "HKEX";
  // US stocks are alphabetic
  if (/^[A-Z]+$/i.test(symbol)) return "NASDAQ";
  return "UNKNOWN";
}

// ---- Stock database loaded from JSON ----

let _stockDb: StockInfo[] | null = null;

export async function loadStockDatabase(): Promise<StockInfo[]> {
  if (_stockDb) return _stockDb;
  try {
    // Try to load the pre-generated stock list
    const { default: stocks } = await import("@/data/a-stocks.json");
    // Cast — JSON doesn't have TS types; runtime will provide Market string values
    _stockDb = stocks as StockInfo[];
    return _stockDb!;
  } catch {
    // Fallback: return empty, search will use API
    return [];
  }
}

/** Quick local search from loaded database */
export function searchStockDb(query: string, db: StockInfo[]): StockInfo[] {
  const q = query.toLowerCase();
  return db
    .filter(s => s.symbol.includes(q) || s.name.toLowerCase().includes(q) || (s.nameCn ?? "").toLowerCase().includes(q))
    .slice(0, 25);
}

// ---- Sina fetching ----
// Uses the unified CacheService (TTL + stale-while-revalidate).

async function fetchSinaRaw(codes: string[]): Promise<string> {
  const url = SINA_QUOTE_URL + codes.join(",");
  const res = await fetch(url, { headers: REQ_HEADERS });
  if (!res.ok) throw new Error(`Sina ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("gbk").decode(buf);
}

function parseSinaLine(snCode: string, fields: string[]) {
  const prefix = snCode.substring(0, 2);
  try {
    if (prefix === "sh" || prefix === "sz") {
      const name = fields[0];
      const open = parseFloat(fields[1]) || 0;
      const prevClose = parseFloat(fields[2]) || 0;
      const price = parseFloat(fields[3]) || 0;
      const high = parseFloat(fields[4]) || 0;
      const low = parseFloat(fields[5]) || 0;
      const volume = Math.round(parseFloat(fields[8]) || 0);
      const amount = parseFloat(fields[9]) || 0;
      const change = +(price - prevClose).toFixed(2);
      const chgPct = prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
      return { name, open, high, low, close: price, volume, amount, change, changePercent: chgPct };
    }
    if (prefix === "hk") {
      const name = fields[1];
      const open = parseFloat(fields[2]) || 0;
      const prevClose = parseFloat(fields[3]) || 0;
      const high = parseFloat(fields[4]) || 0;
      const low = parseFloat(fields[5]) || 0;
      const price = parseFloat(fields[6]) || 0;
      const volume = Math.round(parseFloat(fields[12]) || 0);
      const change = +(price - prevClose).toFixed(2);
      const chgPct = prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0;
      return { name, open, high, low, close: price, volume, amount: price * volume, change, changePercent: chgPct };
    }
    if (prefix === "gb") {
      // Sina gb_ (US stock) field order:
      // [0]名称 [1]当前价 [2]涨跌幅% [3]日期时间(字符串,勿parseFloat) [4]涨跌额
      // [5]开盘 [6]最高 [7]最低 [8]52周高 [9]52周低 [10]成交量 [11]10日均量 ...
      const name = fields[0];
      const price = parseFloat(fields[1]) || 0;
      const chgPct = parseFloat(fields[2]) || 0;
      const change = parseFloat(fields[4]) || 0;
      const open = parseFloat(fields[5]) || 0;
      const high = parseFloat(fields[6]) || 0;
      const low = parseFloat(fields[7]) || 0;
      const volume = Math.round(parseFloat(fields[10]) || 0);
      return { name, open, high, low, close: price, volume, amount: price * volume, change, changePercent: chgPct };
    }
    return null;
  } catch { return null; }
}

export async function fetchSinaQuotes(symbols: string[]): Promise<TickerData[]> {
  const sinaCodes = symbols.map(s => resolveSinaCode(s)).filter(Boolean) as string[];
  if (sinaCodes.length === 0) return [];

  const cacheKey = `sina:q:${sinaCodes.sort().join(",")}`;
  return cache.get(cacheKey, 3, async () => {
    const raw = await fetchSinaRaw(sinaCodes);
    const results: TickerData[] = [];

    for (const line of raw.split("\n")) {
      const m = line.match(/var hq_str_(\w+)="(.+)"/);
      if (!m) continue;
      const snCode = m[1], data = m[2];
      if (!data) continue;

      // Extract internal symbol from Sina code (sh600519 → 600519)
      const intSym = snCode.replace(/^(sh|sz|hk|gb_)/, "");
      const market = detectMarket(intSym);
      const parsed = parseSinaLine(snCode, data.split(","));
      if (!parsed) continue;

      results.push({
        stock: {
          symbol: intSym, name: parsed.name, market,
          currency: market === "HKEX" ? "HKD" : market === "NASDAQ" || market === "NYSE" ? "USD" : "CNY",
        },
        quote: {
          timestamp: Date.now(), open: parsed.open, high: parsed.high, low: parsed.low,
          close: parsed.close, volume: parsed.volume, amount: parsed.amount ?? 0,
          change: parsed.change, changePercent: parsed.changePercent,
        },
        updatedAt: Date.now(),
      });
    }
    return results;
  });
}

export async function fetchSinaIndices(): Promise<MarketIndex[]> {
  return cache.get("sina:indices", 30, async () => {
    const raw = await fetchSinaRaw(["sh000001", "sz399001", "sz399006"]);
    const results: MarketIndex[] = [];
    const map: Record<string, { id: string; name: string; market: Market }> = {
      sh000001: { id: "SSE", name: "上证指数", market: "SSE" },
      sz399001: { id: "SZSE", name: "深证成指", market: "SZSE" },
      sz399006: { id: "GEM", name: "创业板指", market: "SZSE" },
    };

    for (const line of raw.split("\n")) {
      const m = line.match(/var hq_str_(\w+)="(.+)"/);
      if (!m) continue;
      const cfg = map[m[1]];
      if (!cfg) continue;
      const f = m[2].split(",");
      const price = parseFloat(f[3]) || 0, prevClose = parseFloat(f[2]) || 0;
      results.push({
        id: cfg.id, name: cfg.name, market: cfg.market,
        value: +price.toFixed(2), change: +(price - prevClose).toFixed(2),
        changePercent: prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : 0,
      });
    }
    return results;
  });
}

// ============================================
//  Stock database search (works offline)
// ============================================

export const POPULAR_A_STOCKS: StockInfo[] = [
  // SSE 上海主板
  { symbol: "600519", name: "贵州茅台", market: "SSE", sector: "白酒", currency: "CNY" },
  { symbol: "600036", name: "招商银行", market: "SSE", sector: "银行", currency: "CNY" },
  { symbol: "601398", name: "工商银行", market: "SSE", sector: "银行", currency: "CNY" },
  { symbol: "601318", name: "中国平安", market: "SSE", sector: "保险", currency: "CNY" },
  { symbol: "600900", name: "长江电力", market: "SSE", sector: "电力", currency: "CNY" },
  { symbol: "600276", name: "恒瑞医药", market: "SSE", sector: "医药", currency: "CNY" },
  { symbol: "600030", name: "中信证券", market: "SSE", sector: "券商", currency: "CNY" },
  { symbol: "600585", name: "海螺水泥", market: "SSE", sector: "建材", currency: "CNY" },
  { symbol: "600887", name: "伊利股份", market: "SSE", sector: "食品饮料", currency: "CNY" },
  { symbol: "601166", name: "兴业银行", market: "SSE", sector: "银行", currency: "CNY" },
  { symbol: "600309", name: "万华化学", market: "SSE", sector: "化工", currency: "CNY" },
  { symbol: "601012", name: "隆基绿能", market: "SSE", sector: "光伏", currency: "CNY" },
  { symbol: "600809", name: "山西汾酒", market: "SSE", sector: "白酒", currency: "CNY" },
  { symbol: "601888", name: "中国中免", market: "SSE", sector: "免税", currency: "CNY" },
  { symbol: "600690", name: "海尔智家", market: "SSE", sector: "家电", currency: "CNY" },
  { symbol: "601899", name: "紫金矿业", market: "SSE", sector: "有色金属", currency: "CNY" },
  { symbol: "600406", name: "国电南瑞", market: "SSE", sector: "电力设备", currency: "CNY" },
  { symbol: "603259", name: "药明康德", market: "SSE", sector: "医药", currency: "CNY" },
  { symbol: "600104", name: "上汽集团", market: "SSE", sector: "汽车", currency: "CNY" },
  { symbol: "601857", name: "中国石油", market: "SSE", sector: "石油", currency: "CNY" },
  { symbol: "600028", name: "中国石化", market: "SSE", sector: "石油", currency: "CNY" },
  { symbol: "601088", name: "中国神华", market: "SSE", sector: "煤炭", currency: "CNY" },
  { symbol: "600016", name: "民生银行", market: "SSE", sector: "银行", currency: "CNY" },
  { symbol: "601668", name: "中国建筑", market: "SSE", sector: "建筑", currency: "CNY" },
  { symbol: "600050", name: "中国联通", market: "SSE", sector: "通信", currency: "CNY" },
  { symbol: "688981", name: "中芯国际", market: "SSE", sector: "半导体", currency: "CNY" },
  { symbol: "688111", name: "金山办公", market: "SSE", sector: "软件", currency: "CNY" },
  { symbol: "688012", name: "中微公司", market: "SSE", sector: "半导体设备", currency: "CNY" },
  { symbol: "688256", name: "寒武纪", market: "SSE", sector: "AI芯片", currency: "CNY" },
  // SZSE 深圳主板
  { symbol: "000858", name: "五粮液", market: "SZSE", sector: "白酒", currency: "CNY" },
  { symbol: "000001", name: "平安银行", market: "SZSE", sector: "银行", currency: "CNY" },
  { symbol: "000002", name: "万科A", market: "SZSE", sector: "房地产", currency: "CNY" },
  { symbol: "000333", name: "美的集团", market: "SZSE", sector: "家电", currency: "CNY" },
  { symbol: "000651", name: "格力电器", market: "SZSE", sector: "家电", currency: "CNY" },
  { symbol: "000568", name: "泸州老窖", market: "SZSE", sector: "白酒", currency: "CNY" },
  { symbol: "000725", name: "京东方A", market: "SZSE", sector: "面板", currency: "CNY" },
  { symbol: "000063", name: "中兴通讯", market: "SZSE", sector: "通信设备", currency: "CNY" },
  { symbol: "002594", name: "比亚迪", market: "SZSE", sector: "新能源汽车", currency: "CNY" },
  { symbol: "002415", name: "海康威视", market: "SZSE", sector: "安防", currency: "CNY" },
  { symbol: "002714", name: "牧原股份", market: "SZSE", sector: "养殖", currency: "CNY" },
  { symbol: "002475", name: "立讯精密", market: "SZSE", sector: "消费电子", currency: "CNY" },
  { symbol: "002230", name: "科大讯飞", market: "SZSE", sector: "AI", currency: "CNY" },
  { symbol: "002142", name: "宁波银行", market: "SZSE", sector: "银行", currency: "CNY" },
  { symbol: "300750", name: "宁德时代", market: "SZSE", sector: "新能源汽车", currency: "CNY" },
  { symbol: "300059", name: "东方财富", market: "SZSE", sector: "券商", currency: "CNY" },
  { symbol: "300124", name: "汇川技术", market: "SZSE", sector: "工业自动化", currency: "CNY" },
  { symbol: "300760", name: "迈瑞医疗", market: "SZSE", sector: "医疗器械", currency: "CNY" },
  { symbol: "300274", name: "阳光电源", market: "SZSE", sector: "光伏逆变器", currency: "CNY" },
  { symbol: "300015", name: "爱尔眼科", market: "SZSE", sector: "医疗服务", currency: "CNY" },
];

const POPULAR_SYMBOLS = new Set(POPULAR_A_STOCKS.map(s => s.symbol));

/**
 * Smart search: combines offline database with Sina's name resolution.
 * Accepts any 6-digit A-share code directly.
 */
export async function smartSearch(query: string): Promise<StockInfo[]> {
  const q = query.trim();

  // Direct 6-digit code? Return it immediately, try fetching name from Sina
  if (/^\d{6}$/.test(q)) {
    const market: Market = q.startsWith("6") || q.startsWith("688") ? "SSE" : "SZSE";
    // Try to get the real name from Sina
    try {
      const quotes = await fetchSinaQuotes([q]);
      if (quotes.length > 0) {
        return [{ symbol: q, name: quotes[0].stock.name, market, currency: "CNY" }];
      }
    } catch {}
    return [{ symbol: q, name: q, market, currency: "CNY" }];
  }

  // Search local database
  const ql = q.toLowerCase();
  let results = POPULAR_A_STOCKS.filter(s =>
    s.symbol.includes(q) || s.name.toLowerCase().includes(ql)
  );

  // Try database file
  try {
    const db = await loadStockDatabase();
    if (db.length > 0) {
      const dbResults = searchStockDb(q, db);
      // Merge, dedupe by symbol
      const seen = new Set(results.map(r => r.symbol));
      for (const r of dbResults) {
        if (!seen.has(r.symbol)) { results.push(r); seen.add(r.symbol); }
      }
    }
  } catch {}

  return results.slice(0, 25);
}

// ============ K-Line (OHLCV) Data via Sina ============

const SINA_KLINE_URL = "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData";

export interface KLineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Fetch daily K-line data from Sina Finance.
 * Supports A-shares only (6-digit codes).
 * @param symbol — 6-digit A-share code
 * @param days — number of bars to fetch (default 120)
 */
export async function fetchSinaKLine(symbol: string, days = 120): Promise<KLineBar[]> {
  const sinaCode = resolveSinaCode(symbol);
  if (!sinaCode) throw new Error(`Not an A-share symbol: ${symbol}`);

  const cacheKey = `sina:kline:${symbol}:${days}`;
  return cache.get(cacheKey, 300, async () => {
    const url = `${SINA_KLINE_URL}?symbol=${sinaCode}&scale=240&ma=no&datalen=${days}`;
    const res = await fetch(url, { headers: REQ_HEADERS });
    if (!res.ok) throw new Error(`Sina K-line returned ${res.status}`);

    // Sina returns text but it's actually JSON
    const text = await res.text();
    const raw = JSON.parse(text) as Array<{
      day: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>;

    if (!Array.isArray(raw) || raw.length === 0) throw new Error("No K-line data");

    return raw.map((bar) => ({
      timestamp: new Date(bar.day).getTime(),
      open: parseFloat(bar.open),
      high: parseFloat(bar.high),
      low: parseFloat(bar.low),
      close: parseFloat(bar.close),
      volume: parseInt(bar.volume, 10),
    }));
  });
}
