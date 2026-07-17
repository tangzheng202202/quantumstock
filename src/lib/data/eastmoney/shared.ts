/**
 * EastMoney shared internals: endpoints, headers, symbol resolution.
 * Not exported outside the eastmoney module.
 */

export const EM_PUSH_URL = "https://push2.eastmoney.com/api/qt/clist/get";
export const EM_DATA_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
export const EM_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
export const EM_STOCK_URL = "https://push2.eastmoney.com/api/qt/stock/get";

export const REQ_HEADERS = {
  "Referer": "https://quote.eastmoney.com/center/boardlist.html",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

export interface EmSecid {
  secid: string;
  market: "HK" | "US" | "A";
}

/**
 * EastMoney field values arrive as numbers, numeric strings, "-" (empty),
 * or null depending on the endpoint — model them loosely and coerce at the edge.
 */
export type EmFieldValue = string | number | null | undefined;

/** Raw row from the sector heat-map clist endpoint (fields f12,f14,f3,f62,f128). */
export interface EmSectorRow {
  f12: string;
  f14: string;
  f3: EmFieldValue;
  f62: EmFieldValue;
  f128?: string;
}

/** Raw row from the sector-constituents clist endpoint (fields f12,f14,f2,f3,f4,f9,f20). */
export interface EmConstituentRow {
  f12: string;
  f14: string;
  f2: EmFieldValue;
  f3: EmFieldValue;
  f4: EmFieldValue;
  f9?: EmFieldValue;
  f20?: number | null;
}

/** Raw row from the full-A-share screener clist endpoint. */
export interface EmScreenerRow {
  f12: string;
  f14: string;
  f2: EmFieldValue;
  f3: EmFieldValue;
  f4: EmFieldValue;
  f5: EmFieldValue;
  f6: EmFieldValue;
  f8?: EmFieldValue;
  f9?: EmFieldValue;
  f20?: number | null;
  f37?: number | null;
}

/**
 * Resolve a raw symbol to an EastMoney secid.
 * A-share 6-digit → `{1|0}.{code}`; HK 5-digit → `116.{code}`; US alpha → `105.{ticker}`.
 */
export function resolveEmSecid(symbol: string): EmSecid | null {
  if (/^\d{6}$/.test(symbol)) {
    const isSh = symbol.startsWith("6") || symbol.startsWith("688");
    return { secid: `${isSh ? "1" : "0"}.${symbol}`, market: "A" };
  }
  if (/^\d{5}$/.test(symbol)) {
    return { secid: `116.${symbol.padStart(5, "0")}`, market: "HK" };
  }
  if (/^[A-Z]{1,6}$/.test(symbol)) {
    return { secid: `105.${symbol}`, market: "US" };
  }
  return null;
}
