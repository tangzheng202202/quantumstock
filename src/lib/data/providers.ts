/**
 * Provider registrations — adapt existing data-source clients to
 * MarketDataProvider and register them in the failover registry.
 *
 * Priority ordering (highest first) per capability:
 *   quotes  : sina (3s updates, direct) → python-engine (Sina+AKShare) → eastmoney
 *   indices : python-engine (AKShare 全量) → sina
 *   search  : local JSON db (instant) — non-failing, priority high
 */

import { providerRegistry, type MarketDataProvider } from "./provider";
import { fetchSinaQuotes, fetchSinaIndices, loadStockDatabase, searchStockDb, POPULAR_A_STOCKS } from "./sina";
import type { StockInfo } from "@/types";

// ---- Local JSON stock database (search capability) ----

const localSearchProvider: MarketDataProvider = {
  id: "local-db",
  label: "本地股票清单 (a-stocks.json)",
  capabilities: ["search"],
  priority: 50,
  async search(query: string): Promise<StockInfo[]> {
    if (!query) return [];
    const db = await loadStockDatabase();
    return searchStockDb(query, db.length > 0 ? db : POPULAR_A_STOCKS);
  },
};

// ---- Sina ----

const sinaProvider: MarketDataProvider = {
  id: "sina",
  label: "新浪财经",
  capabilities: ["quotes", "indices", "search"],
  priority: 40,
  getQuotes: (symbols) => fetchSinaQuotes(symbols),
  getIndices: () => fetchSinaIndices(),
  async search(query) {
    // Sina has no search API; use smartSearch's remote suggestion path indirectly
    // by returning empty here so the registry falls through to local-db.
    return [];
  },
};

// ---- Python engine (optional) ----

const ENGINE_URL = process.env.PYTHON_ENGINE_URL ?? "http://localhost:8000";

const pythonEngineProvider: MarketDataProvider = {
  id: "python-engine",
  label: "Python 量化引擎",
  capabilities: ["quotes", "indices"],
  priority: 45,
  async getQuotes(symbols) {
    const res = await fetch(
      `${ENGINE_URL}/market/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`engine HTTP ${res.status}`);
    const j = await res.json();
    if (!j.success || !Array.isArray(j.data)) throw new Error("engine no data");
    return j.data as any[];
  },
  async getIndices() {
    const res = await fetch(`${ENGINE_URL}/market/indices`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`engine HTTP ${res.status}`);
    const j = await res.json();
    if (!j.success || !Array.isArray(j.data)) throw new Error("engine no data");
    return j.data as any[];
  },
};

// ---- Registration (idempotent) ----

providerRegistry.register(localSearchProvider);
providerRegistry.register(pythonEngineProvider);
providerRegistry.register(sinaProvider);

// ---- High-level facade used by API routes ----

export async function getQuotesWithFailover(symbols: string[]) {
  return providerRegistry.call("quotes", p => p.getQuotes!(symbols), { requireNonEmpty: true });
}

export async function getIndicesWithFailover() {
  return providerRegistry.call("indices", p => p.getIndices!());
}

export async function searchWithFailover(query: string) {
  return providerRegistry.call("search", p => p.search!(query), { requireNonEmpty: true });
}

export { providerRegistry };
